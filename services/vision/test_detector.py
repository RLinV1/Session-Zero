"""Boundary and geometry regressions; these tests make no calibrated accuracy claim."""
import io
import unittest
from unittest.mock import patch

import numpy as np
from PIL import Image

from detector import detect, detect_bytes, fit_segments
from fixtures import POSITIVES, render
from grid_config import MAX_BYTES, VERSION


def image_bytes(size=(160, 120), mode="RGB", format="PNG", orientation=None):
    image = Image.new(mode, size, 100)
    out = io.BytesIO()
    exif = Image.Exif()
    if orientation is not None:
        exif[274] = orientation
    image.save(out, format=format, exif=exif)
    return out.getvalue()


class DetectorContractTest(unittest.TestCase):
    def test_positive_images_preserve_grid_geometry(self):
        """Exercise decoding, native LSD, and fitting on representative PNG/JPEG/WebP grids."""
        fixtures = {fixture.name: fixture for fixture in POSITIVES}
        for name in ("ink-plain", "ink-offset-zero", "ink-small", "light-on-dark", "jpeg-high", "webp-compressed"):
            with self.subTest(fixture=name):
                fixture = fixtures[name]
                result = detect_bytes(render(fixture), 768, 648)
                self.assertEqual(result["kind"], "candidate")
                self.assertLessEqual(abs(result["cellSize"] - fixture.cell), 2)
                for key, expected in (("offsetX", fixture.offset_x), ("offsetY", fixture.offset_y)):
                    phase_error = abs(result[key] - expected) % fixture.cell
                    self.assertLessEqual(min(phase_error, fixture.cell - phase_error), 2, key)

    def test_supported_images_and_empty_evidence(self):
        for format in ("PNG", "JPEG", "WEBP"):
            self.assertEqual(detect_bytes(image_bytes(format=format), 160, 120), {"kind": "no_grid"})
        self.assertEqual(fit_segments([], 160, 120), {"kind": "no_grid"})

    def test_exif_orientation_and_pillow_L_input_match_reviewed_preprocessing(self):
        data = image_bytes(format="JPEG", orientation=6)
        with patch("detector.detect", return_value={"kind": "no_grid"}) as run:
            detect_bytes(data, 120, 160)
            gray = run.call_args.args[0]
            self.assertEqual(gray.shape, (160, 120))
            self.assertEqual(gray.dtype, np.uint8)
        with self.assertRaises(ValueError):
            detect_bytes(data, 160, 120)

    def test_actual_oversized_dimensions_rejected_before_detector(self):
        with patch("detector.detect") as run:
            with self.assertRaisesRegex(ValueError, "dimensions"):
                detect_bytes(image_bytes(size=(4001, 4000), mode="L"), 1, 1)
            run.assert_not_called()

    def test_invalid_inputs_are_errors_not_no_grid(self):
        for data, w, h in [(b"garbage", 160, 120), (image_bytes(), 10, 20), (b"x"*(MAX_BYTES+1), 1, 1)]:
            with self.assertRaises(ValueError):
                detect_bytes(data, w, h)
        with self.assertRaises(ValueError):
            detect(np.zeros((4,4,3), dtype=np.uint8))

    def test_best_candidate_survives_diagnostic_rejection_without_rounding(self):
        expected = {"cellSize": 37.512345678, "offsetX": 7.123456789, "offsetY": 11.987654321}
        with patch("detector.estimate_grid", return_value={"best_candidate": {**expected, "accepted": False}}):
            self.assertEqual(fit_segments([], 400, 300), {"kind": "candidate", **expected})
        self.assertNotIn("confidence", expected)

    def test_version_matches_shared_contract(self):
        from pathlib import Path
        shared = Path(__file__).parents[2] / "packages/shared/src/gridDetection.ts"
        self.assertIn(VERSION, shared.read_text())


if __name__ == "__main__":
    unittest.main()
