"""Full-resolution classical LSD estimates in EXIF-oriented original image pixels."""
from __future__ import annotations

import io
import math
import time
import warnings

import cv2
import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError

from grid_config import MAX_BYTES, MAX_EDGE, MAX_PIXELS, VERSION
from grid_geometry import GeometrySettings, estimate_grid, filter_segments, project

LSD_SETTINGS = (cv2.LSD_REFINE_STD, 0.8, 0.6, 2.0, 22.5, 0.0, 0.7, 1024)
GEOMETRY = GeometrySettings(min_length_px=20.0, min_support_count=0.0, fit_tolerance_px=4.0)


def fit_segments(lines: list, width: int, height: int) -> dict:
    # Constant scores solely adapt the reviewed filter interface. Score filtering is
    # disabled; LSD precision/widths are not confidence probabilities.
    filtered = filter_segments(lines, [1.0] * len(lines), 1.0, GEOMETRY)
    x = project(filtered["vertical"], "x", width, height, GEOMETRY)
    y = project(filtered["horizontal"], "y", height, width, GEOMETRY)
    best = estimate_grid(x["peaks"], y["peaks"], width, height, GEOMETRY)["best_candidate"]
    if best is None:
        return {"kind": "no_grid"}
    candidate = {key: best[key] for key in ("cellSize", "offsetX", "offsetY")}
    cell = candidate["cellSize"]
    if (not all(math.isfinite(v) for v in candidate.values()) or not 0 < cell <= 2000
            or not 0 <= candidate["offsetX"] < cell or not 0 <= candidate["offsetY"] < cell):
        return {"kind": "no_grid"}
    # accepted/rejection_reasons are diagnostics only. Preserve reviewed ranking.
    return {"kind": "candidate", **candidate}


def detect(gray: np.ndarray, timings: dict | None = None) -> dict:
    if gray.ndim != 2 or gray.dtype != np.uint8:
        raise ValueError("Expected 8-bit grayscale")
    height, width = gray.shape
    if min(width, height) <= 0 or max(width, height) > MAX_EDGE or width * height > MAX_PIXELS:
        raise ValueError("Image exceeds analysis dimensions")
    cv2.setNumThreads(1)
    started = time.perf_counter()
    output = cv2.createLineSegmentDetector(*LSD_SETTINGS).detect(gray)[0]
    detected = time.perf_counter()
    # No external resizing and no undoing LSD's internal scale. Keep fractional
    # continuous border endpoints; the fitter clips observed interval coverage.
    lines = [] if output is None else output.reshape(-1, 4).astype(float).tolist()
    mapped = time.perf_counter()
    result = fit_segments(lines, width, height)
    if timings is not None:
        timings.update(detector_seconds=detected-started, mapping_seconds=mapped-detected,
                       fit_seconds=time.perf_counter()-mapped, segments=len(lines))
    return result


def detect_bytes(data: bytes, width: int, height: int, timings: dict | None = None) -> dict:
    if not data or len(data) > MAX_BYTES:
        raise ValueError("Image exceeds analysis byte limit")
    started = time.perf_counter()
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data)) as opened:
                if opened.format not in {"PNG", "JPEG", "WEBP"}:
                    raise ValueError("Unsupported image")
                ow, oh = opened.size
                if max(ow, oh) > MAX_EDGE or ow * oh > MAX_PIXELS:
                    raise ValueError("Image exceeds analysis dimensions")
                frame = ImageOps.exif_transpose(opened)
                decoded = time.perf_counter()
                if frame.size != (width, height):
                    raise ValueError("Invalid declared dimensions")
                gray_frame = frame.convert("L")
                converted = time.perf_counter()
                gray = np.array(gray_frame, dtype=np.uint8)
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise ValueError("Invalid image") from exc
    prepared = time.perf_counter()
    result = detect(gray, timings)
    if timings is not None:
        timings.update(decode_seconds=decoded-started, grayscale_seconds=converted-decoded,
                       array_seconds=prepared-converted, processing_seconds=time.perf_counter()-started,
                       width=width, height=height, version=VERSION)
    return result
