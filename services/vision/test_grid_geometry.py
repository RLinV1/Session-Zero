"""Geometry checks using synthetic fixtures and one real projection regression; no model execution."""
import math
import json
from pathlib import Path
import unittest

from grid_geometry import (GeometrySettings, canonical_offset, estimate_grid,
                           filter_segments, project)


def postprocess(raw, width, height, tolerance, cfg):
    filtered = filter_segments(raw["segments_original_xyxy"], raw["outputs"]["lines_score"], tolerance, cfg)
    x = project(filtered["vertical"], "x", width, height, cfg)
    y = project(filtered["horizontal"], "y", height, width, cfg)
    return {"fit": estimate_grid(x["peaks"], y["peaks"], width, height, cfg), "projections": {"x": x, "y": y}}


class GeometryChecks(unittest.TestCase):
    def setUp(self):
        self.cfg = GeometrySettings(min_length_px=0)

    def test_reversed_endpoints_and_wrap(self):
        delta = math.tan(math.radians(0.5)) * 100
        lines = [[0, 0, 100, delta], [100, delta, 0, 0],
                 [0, delta, 100, 0], [100, 0, 0, delta],
                 [10, 0, 10, 100], [10, 100, 10, 0],
                 [0, 0, 100, 100], [0, 0, 100, math.tan(math.radians(2)) * 100]]
        result = filter_segments(lines, [1] * len(lines), 1, self.cfg)
        self.assertEqual(result["counts"]["horizontal"], 4)
        self.assertEqual(result["counts"]["vertical"], 2)
        self.assertEqual(result["counts"]["orientation_rejected"], 2)
        self.assertEqual(filter_segments(lines, [1] * len(lines), 3, self.cfg)["counts"]["horizontal"], 5)

    def test_empty_degenerate_nonfinite_and_explicit_support_filter(self):
        raw = dict(segments_original_xyxy=[], outputs=dict(lines_score=[]))
        result = postprocess(raw, 400, 300, 1, self.cfg)
        self.assertIsNone(result["fit"]["grid"])
        self.assertEqual(result["projections"]["x"]["peaks"], [])
        self.cfg.min_support_count = 3
        filtered = filter_segments([[0, 0, 0, 0], [0, 0, float("nan"), 1],
                                    [0, 2, 100, 2], [3, 0, 3, 100]], [10, 10, 2, 4], 1, self.cfg)
        self.assertEqual(filtered["counts"]["finite"], 3)
        self.assertEqual(filtered["counts"]["nondegenerate"], 2)
        self.assertEqual(filtered["counts"]["after_support_filter"], 1)
        self.assertEqual(filtered["counts"]["vertical"], 1)

    def test_duplicate_fragments_union_and_bounded_clustering(self):
        lines = [[10.25, 0, 10.25, 100], [10.25, 100, 10.25, 0],
                 [10.25, 50, 10.25, 150], [10.25, 200, 10.25, 230],
                 [20, 0, 20, 50], [21.5, 0, 21.5, 50], [23, 0, 23, 50]]
        filtered = filter_segments(lines, [1] * len(lines), 1, self.cfg)
        projection = project(filtered["vertical"], "x", 300, 300, self.cfg)
        first = projection["clusters"][0]
        self.assertAlmostEqual(first["weight_px"], 180)
        self.assertEqual(first["fragment_count"], 4)
        self.assertAlmostEqual(first["position_px"], 10.25)
        self.assertEqual(len(projection["clusters"]), 3)  # no single-link chaining
        self.assertAlmostEqual(projection["peaks"][0]["position_px"], 10.25)

    def test_fractional_grid_with_missing_lines_fragments_and_clutter(self):
        size, ox, oy = 37.5, 7.25, 11.125
        lines = []
        for offset, axis in ((ox, "x"), (oy, "y")):
            for k in range(11):
                if k in (3, 7):
                    continue
                p = offset + size * k
                for a, b in ((0, 180), (130, 300), (320, 410), (0, 180)):
                    lines.append([p, a, p, b] if axis == "x" else [a, p, b, p])
        lines.extend([[19.3, 30, 19.3, 100], [0, 223.6, 45, 223.6], [0, 0, 200, 150]])
        raw = dict(segments_original_xyxy=lines, outputs=dict(lines_score=[1] * len(lines)))
        result = postprocess(raw, 420, 420, 1, self.cfg)
        fit = result["fit"]
        self.assertIsNotNone(fit["grid"], fit)
        grid = fit["grid"]
        self.assertAlmostEqual(grid["cellSize"], size, places=2)
        self.assertAlmostEqual(grid["offsetX"], ox, places=2)
        self.assertAlmostEqual(grid["offsetY"], oy, places=2)
        for key in ("offsetX", "offsetY"):
            self.assertGreaterEqual(grid[key], 0)
            self.assertLess(grid[key], grid["cellSize"])
        half = fit["harmonic_comparisons"][0]["candidate"]
        self.assertLess(half["heuristic_score"], fit["best_candidate"]["heuristic_score"])
        self.assertTrue(fit["alternatives"])

    def test_rectangular_spacing_is_rejected(self):
        xp = [dict(position_px=5 + i * 40.0, weight_px=400) for i in range(11)]
        yp = [dict(position_px=9 + i * 47.0, weight_px=400) for i in range(9)]
        self.assertIsNone(estimate_grid(xp, yp, 450, 450, self.cfg)["grid"])

    def test_crop_support_domain_keeps_original_coordinates(self):
        size, ox, oy = 37.5, 7.25, 11.125
        xp = [dict(position_px=ox + i * size, weight_px=280) for i in range(9, 17)]
        yp = [dict(position_px=oy + i * size, weight_px=280) for i in range(6, 14)]
        fit = estimate_grid(xp, yp, 2000, 1800, self.cfg, [320, 210, 640, 530])
        self.assertIsNotNone(fit["grid"], fit)
        self.assertAlmostEqual(fit["grid"]["cellSize"], size, places=3)
        self.assertAlmostEqual(fit["grid"]["offsetX"], ox, places=3)
        self.assertAlmostEqual(fit["grid"]["offsetY"], oy, places=3)

    def test_canonical_negative_and_full_cycle_offsets(self):
        self.assertAlmostEqual(canonical_offset(-2.5, 37.5), 35)
        self.assertEqual(canonical_offset(75, 37.5), 0)

    def test_lower_score_alias_cannot_replace_stronger_rejected_hypothesis(self):
        fixture=json.loads((Path(__file__).parent/'test_fixtures/ranking_clutter.json').read_text())
        self.cfg.fit_tolerance_px=fixture['fit_tolerance_px']
        fit=estimate_grid(fixture['x'],fixture['y'],fixture['width'],fixture['height'],self.cfg)
        self.assertIsNone(fit['grid'])
        best=fit['best_candidate']
        self.assertFalse(best['accepted'])
        self.assertTrue(any(c['accepted'] for c in fit['alternatives']))
        self.assertTrue(all(best['heuristic_score'] >= c['heuristic_score'] for c in fit['alternatives']))


if __name__ == "__main__":
    unittest.main(verbosity=2)
