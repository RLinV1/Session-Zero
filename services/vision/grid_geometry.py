"""Reviewed fractional grid geometry, ported from the local classical LSD study.

No experiment runner, model loading, image rendering or filesystem dependencies.
Diagnostic acceptance gates do not control production candidate availability.
"""
from __future__ import annotations

import math
import statistics
from dataclasses import dataclass
from typing import Any

@dataclass
class GeometrySettings:
    min_length_px: float = 20.0
    min_support_count: float = 0.0
    cluster_px: float = 2.0
    projection_bin_px: float = 1.0
    projection_sigma_px: float = 1.0
    peak_distance_px: float = 4.0
    peak_relative_height: float = 0.03
    min_cell_size_px: float = 8.0
    max_cell_size_px: float | None = None
    fit_tolerance_px: float = 2.0
    square_tolerance_fraction: float = 0.04
    min_lines_per_axis: int = 4
    min_alignment: float = 0.55
    min_occupancy: float = 0.35
    min_heuristic_score: float = 0.45


def normalize_segments(lines: Any) -> list[list[float]]:
    """Accept Nx4 or Nx2x2; retain fractions and endpoint ordering."""
    result = []
    for line in lines:
        if len(line) == 2 and all(hasattr(p, "__len__") and len(p) == 2 for p in line):
            line = [*line[0], *line[1]]
        if len(line) != 4:
            raise ValueError("Expected each segment as [x1,y1,x2,y2] or [[x1,y1],[x2,y2]]")
        result.append([float(x) for x in line])
    return result


def filter_segments(lines: list, scores: list, tolerance: float, cfg: GeometrySettings) -> dict:
    if len(scores) != len(lines):
        raise ValueError("lines_score and lines_pred lengths differ")
    counts = dict(raw=len(lines), finite=0, nondegenerate=0, after_min_length=0,
                  after_support_filter=0, horizontal=0, vertical=0, orientation_rejected=0)
    horizontal, vertical = [], []
    for index, (line, score) in enumerate(zip(normalize_segments(lines), scores)):
        if not all(math.isfinite(x) for x in line) or not math.isfinite(float(score)):
            continue
        counts["finite"] += 1
        x1, y1, x2, y2 = line
        length = math.hypot(x2 - x1, y2 - y1)
        if length <= 1e-9:
            continue
        counts["nondegenerate"] += 1
        if length < cfg.min_length_px:
            continue
        counts["after_min_length"] += 1
        if float(score) < cfg.min_support_count:
            continue
        counts["after_support_filter"] += 1
        angle = math.degrees(math.atan2(y2 - y1, x2 - x1)) % 180.0
        record = dict(index=index, segment=line, length_px=length, angle_degrees=angle,
                      support_count=float(score))
        if min(angle, 180.0 - angle) <= tolerance:
            horizontal.append(record)
        elif abs(angle - 90.0) <= tolerance:
            vertical.append(record)
        else:
            counts["orientation_rejected"] += 1
    counts.update(horizontal=len(horizontal), vertical=len(vertical))
    return dict(horizontal=horizontal, vertical=vertical, counts=counts)


def union_length(intervals: list[tuple[float, float]]) -> float:
    if not intervals:
        return 0.0
    ordered = sorted(intervals)
    lo, hi = ordered[0]
    total = 0.0
    for start, end in ordered[1:]:
        if start <= hi:
            hi = max(hi, end)
        else:
            total += hi - lo
            lo, hi = start, end
    return total + hi - lo


def cluster_positions(records: list[dict], axis: str, extent: int, cfg: GeometrySettings) -> list[dict]:
    """Bound cluster diameter; union overlapping fragments instead of summing duplicates."""
    votes = []
    for record in records:
        x1, y1, x2, y2 = record["segment"]
        position = (x1 + x2) / 2 if axis == "x" else (y1 + y2) / 2
        interval = sorted((y1, y2) if axis == "x" else (x1, x2))
        interval = (max(0.0, interval[0]), min(float(extent - 1), interval[1]))
        if interval[1] > interval[0]:
            votes.append((position, interval, record))
    groups = []
    for vote in sorted(votes, key=lambda v: v[0]):
        if not groups or vote[0] - groups[-1][0][0] > cfg.cluster_px:
            groups.append([])
        groups[-1].append(vote)
    result = []
    for group in groups:
        total_length = sum(v[2]["length_px"] for v in group)
        position = sum(v[0] * v[2]["length_px"] for v in group) / total_length
        weight = union_length([v[1] for v in group])
        result.append(dict(position_px=position, weight_px=weight,
                           raw_length_sum_px=total_length, fragment_count=len(group),
                           segment_indices=[v[2]["index"] for v in group],
                           span_px=[min(v[0] for v in group), max(v[0] for v in group)]))
    return result


def project(records: list[dict], axis: str, axis_extent: int, other_extent: int,
            cfg: GeometrySettings) -> dict:
    clusters = cluster_positions(records, axis, other_extent, cfg)
    n = int(math.ceil((axis_extent - 1) / cfg.projection_bin_px)) + 1
    if n > 200_000:
        raise ValueError("Projection has >200000 bins; increase --projection-bin-px")
    positions = [i * cfg.projection_bin_px for i in range(n)]
    signal = [0.0] * n
    sigma = cfg.projection_sigma_px
    for cluster in clusters:
        p, weight = cluster["position_px"], cluster["weight_px"]
        first = max(0, math.floor((p - 4 * sigma) / cfg.projection_bin_px))
        last = min(n - 1, math.ceil((p + 4 * sigma) / cfg.projection_bin_px))
        for i in range(first, last + 1):
            signal[i] += weight * math.exp(-0.5 * ((positions[i] - p) / sigma) ** 2)
    threshold = max(signal, default=0.0) * cfg.peak_relative_height
    maxima = [i for i, value in enumerate(signal)
              if value > 0 and value >= threshold
              and (i == 0 or value > signal[i - 1])
              and (i == n - 1 or value >= signal[i + 1])]
    selected = []
    for i in sorted(maxima, key=lambda j: signal[j], reverse=True):
        if all(abs(positions[i] - positions[j]) >= cfg.peak_distance_px for j in selected):
            selected.append(i)
    peaks = []
    for i in sorted(selected):
        nearby = [c for c in clusters if abs(c["position_px"] - positions[i]) <= max(2 * sigma, cfg.projection_bin_px)]
        weight = sum(c["weight_px"] for c in nearby)
        if weight:
            # Fractional centroid, not a rounded histogram bin.
            p = sum(c["position_px"] * c["weight_px"] for c in nearby) / weight
            peaks.append(dict(position_px=p, weight_px=min(float(other_extent), weight),
                              signal_height=signal[i], bin_index=i))
    return dict(axis=axis, units="original image pixels", clusters=clusters,
                bin_positions_px=positions, signal_length_weighted=signal, peaks=peaks,
                weighting="segment length, with interval-union correction for overlapping fragments")


def canonical_offset(offset: float, spacing: float) -> float:
    value = offset % spacing
    return 0.0 if min(value, spacing - value) < 1e-10 else value


def _weights(peaks: list[dict]) -> list[float]:
    if not peaks:
        return []
    cap = 3 * statistics.median(p["weight_px"] for p in peaks)
    return [min(p["weight_px"], cap) for p in peaks]


def _spacing_seeds(axes: list[list[dict]], lower: float, upper: float) -> list[float]:
    step = max(0.25, upper / 1500)
    evidence = []
    for peaks in axes:
        strongest = sorted(sorted(peaks, key=lambda p: p["weight_px"], reverse=True)[:48],
                           key=lambda p: p["position_px"])
        votes = {}
        for i, p in enumerate(strongest):
            for q in strongest[i + 1:]:
                gap = q["position_px"] - p["position_px"]
                for multiple in range(1, min(12, int(gap / lower)) + 1):
                    size = gap / multiple
                    if lower <= size <= upper:
                        key = round(size / step)
                        weight = min(p["weight_px"], q["weight_px"]) / math.sqrt(multiple)
                        old = votes.get(key, (0.0, 0.0))
                        votes[key] = (old[0] + weight, old[1] + weight * size)
        evidence.append(votes)
    keys = set(evidence[0]) | set(evidence[1])
    norms = [max((v[0] for v in axis.values()), default=1.0) for axis in evidence]
    ranked = sorted(keys, key=lambda k: math.sqrt(
        evidence[0].get(k, (0, 0))[0] / norms[0] *
        evidence[1].get(k, (0, 0))[0] / norms[1]), reverse=True)[:80]
    for votes in evidence:
        ranked.extend(sorted(votes, key=lambda k: votes[k][0], reverse=True)[:16])
    seeds = []
    for key in dict.fromkeys(ranked):
        weight = sum(axis.get(key, (0, 0))[0] for axis in evidence)
        seeds.append(sum(axis.get(key, (0, 0))[1] for axis in evidence) / weight)
    return seeds


def _axis_at_phase(peaks: list[dict], weights: list[float], size: float, phase: float,
                   extent: int, other_extent: int, cfg: GeometrySettings,
                   bounds: tuple[float, float] | None = None, diagnostics: bool = True) -> dict:
    phase = canonical_offset(phase, size)
    tolerance = min(cfg.fit_tolerance_px, 0.12 * size)
    lo, hi = bounds or (0, extent - 1)
    first = math.ceil((lo - phase) / size)
    last = math.floor((hi - phase) / size)
    predicted_count = max(0, last - first + 1)
    alignment_sum, matched, line_support, line_length = 0.0, [], {}, {}
    for p, weight in zip(peaks, weights):
        k = round((p["position_px"] - phase) / size)
        residual = p["position_px"] - (phase + k * size)
        support = math.exp(-0.5 * (residual / tolerance) ** 2)
        alignment_sum += weight * support
        if abs(residual) <= 2 * tolerance and first <= k <= last:
            if diagnostics:
                matched.append((p["position_px"], weight, k, residual))
            line_support[k] = max(line_support.get(k, 0.0), support)
            line_length[k] = max(line_length.get(k, 0.0), support * min(1.0, p["weight_px"] / max(1, other_extent * 0.25)))
    alignment = alignment_sum / max(1e-12, sum(weights))
    occupancy = sum(line_support.values()) / max(1, predicted_count)
    length_support = sum(line_length.values()) / max(1, predicted_count)
    balanced = 2 * alignment * occupancy / max(1e-12, alignment + occupancy)
    score = 0.8 * balanced + 0.2 * length_support
    if not diagnostics:
        return dict(offset_px=phase, heuristic_score=score)
    slope = None
    if len(line_support) >= 3:
        sw = sum(m[1] for m in matched)
        mk = sum(m[1] * m[2] for m in matched) / sw
        mp = sum(m[1] * m[0] for m in matched) / sw
        variance = sum(m[1] * (m[2] - mk) ** 2 for m in matched)
        if variance > 0:
            slope = sum(m[1] * (m[2] - mk) * (m[0] - mp) for m in matched) / variance
    return dict(offset_px=phase, heuristic_score=score, observed_peak_alignment=alignment,
                predicted_line_occupancy=occupancy, predicted_line_length_support=length_support,
                observed_peaks=len(peaks), matched_peaks=len(matched),
                matched_distinct_lines=len(line_support), predicted_lines=predicted_count,
                independently_fitted_spacing_px=slope,
                matched_span_px=max((m[0] for m in matched), default=0) - min((m[0] for m in matched), default=0),
                residual_rms_px=math.sqrt(sum(m[1] * m[3] ** 2 for m in matched) /
                                         max(1e-12, sum(m[1] for m in matched))),
                matched_peak_positions_px=[m[0] for m in matched],
                supported_line_indices=sorted(line_support))


def _axis_fit(peaks: list[dict], size: float, extent: int, other_extent: int,
              cfg: GeometrySettings, bounds: tuple[float, float] | None = None) -> dict:
    weights = _weights(peaks)
    strongest = sorted(range(len(peaks)), key=lambda i: weights[i], reverse=True)[:48]
    phases = [peaks[i]["position_px"] % size for i in strongest]
    phases.extend(size * i / 32 for i in range(32))
    best = max((_axis_at_phase(peaks, weights, size, phase, extent, other_extent, cfg, bounds, diagnostics=False)
                for phase in phases), key=lambda r: r["heuristic_score"])
    # Scoring every seed phase needs no regression/residual diagnostics. Calculate
    # those once for the identical winning phase; preserve score arithmetic/order.
    best = _axis_at_phase(peaks, weights, size, best["offset_px"], extent, other_extent, cfg, bounds)
    # Refine the fractional phase with a wrapped, support-weighted residual mean.
    for _ in range(3):
        pairs = []
        for p, weight in zip(peaks, weights):
            residual = (p["position_px"] - best["offset_px"] + size / 2) % size - size / 2
            if abs(residual) <= min(2 * cfg.fit_tolerance_px, 0.24 * size):
                pairs.append((residual, weight))
        if not pairs:
            break
        phase = best["offset_px"] + sum(r * w for r, w in pairs) / sum(w for _, w in pairs)
        trial = _axis_at_phase(peaks, weights, size, phase, extent, other_extent, cfg, bounds)
        if trial["heuristic_score"] < best["heuristic_score"] - 1e-10:
            break
        best = trial
    return best


def _evaluate(size: float, xp: list[dict], yp: list[dict], width: int, height: int,
              cfg: GeometrySettings, domain: list[int] | None = None) -> dict:
    x0, y0, x1, y1 = domain or [0, 0, width, height]
    x = _axis_fit(xp, size, width, y1 - y0, cfg, (x0, x1 - 1))
    y = _axis_fit(yp, size, height, x1 - x0, cfg, (y0, y1 - 1))
    sx, sy = x["independently_fitted_spacing_px"], y["independently_fitted_spacing_px"]
    mismatch = abs(sx - sy) / size if sx is not None and sy is not None else None
    consistency = math.exp(-0.5 * (mismatch / cfg.square_tolerance_fraction) ** 2) if mismatch is not None else 0.0
    score = math.sqrt(max(0.0, x["heuristic_score"] * y["heuristic_score"])) * consistency
    reasons = []
    for name, axis in (("x", x), ("y", y)):
        if axis["matched_distinct_lines"] < cfg.min_lines_per_axis:
            reasons.append(f"{name}: fewer than {cfg.min_lines_per_axis} distinct matched lines")
        if axis["observed_peak_alignment"] < cfg.min_alignment:
            reasons.append(f"{name}: weak observed-peak alignment")
        if axis["predicted_line_occupancy"] < cfg.min_occupancy:
            reasons.append(f"{name}: too many unsupported predicted lines")
        if axis["matched_span_px"] < 2.5 * size:
            reasons.append(f"{name}: evidence spans fewer than 2.5 cells")
    if mismatch is None or mismatch > cfg.square_tolerance_fraction:
        reasons.append("x/y independently fitted spacings disagree or cannot be fitted")
    if score < cfg.min_heuristic_score:
        reasons.append("heuristic score below acceptance threshold")
    return dict(cellSize=size, offsetX=canonical_offset(x["offset_px"], size),
                offsetY=canonical_offset(y["offset_px"], size), heuristic_score=score,
                square_spacing_mismatch_fraction=mismatch, accepted=not reasons,
                rejection_reasons=reasons, axes=dict(x=x, y=y))


def estimate_grid(xp: list[dict], yp: list[dict], width: int, height: int,
                  cfg: GeometrySettings, domain: list[int] | None = None) -> dict:
    lower = cfg.min_cell_size_px
    x0, y0, x1, y1 = domain or [0, 0, width, height]
    upper = cfg.max_cell_size_px or min(x1 - x0, y1 - y0) / 3
    result = dict(grid=None, best_candidate=None, alternatives=[], harmonic_comparisons=[],
                  ambiguous=False, score_label="heuristic score; not an accuracy or confidence probability",
                  spacing_bounds_px=[lower, upper], evidence_bounds_original_px=[x0, y0, x1, y1],
                  evaluated_candidates=0)
    if min(len(xp), len(yp)) < cfg.min_lines_per_axis or upper <= lower:
        result["reason"] = "Insufficient projection peaks on both axes or empty spacing bounds"
        return result
    seeds = _spacing_seeds([xp, yp], lower, upper)
    evaluated = []
    for size in seeds:
        best = _evaluate(size, xp, yp, width, height, cfg, domain)
        for _ in range(3):
            slopes = [a["independently_fitted_spacing_px"] for a in best["axes"].values()]
            if any(s is None or abs(s - best["cellSize"]) > 0.05 * best["cellSize"] for s in slopes):
                break
            new_size = sum(slopes) / 2
            if not lower <= new_size <= upper or abs(new_size - best["cellSize"]) < 1e-5:
                break
            trial = _evaluate(new_size, xp, yp, width, height, cfg, domain)
            if trial["heuristic_score"] < best["heuristic_score"]:
                break
            best = trial
        evaluated.append(best)
    # Evaluate explicit half/double alternatives around the strongest hypotheses.
    for candidate in sorted(evaluated, key=lambda r: r["heuristic_score"], reverse=True)[:4]:
        for ratio in (0.5, 2.0):
            size = candidate["cellSize"] * ratio
            if lower <= size <= upper:
                evaluated.append(_evaluate(size, xp, yp, width, height, cfg, domain))
    result["evaluated_candidates"] = len(evaluated)
    unique = []
    for candidate in sorted(evaluated, key=lambda r: r["heuristic_score"], reverse=True):
        if not any(abs(candidate["cellSize"] - c["cellSize"]) < max(0.25, c["cellSize"] * 0.015)
                   for c in unique):
            unique.append(candidate)
    # Rank evidence first, then apply acceptance gates. A weak fine-grid alias must
    # not leapfrog a stronger, borderline coarse hypothesis merely by passing gates.
    best = unique[0] if unique else None
    result["best_candidate"] = best
    result["alternatives"] = [c for c in unique if c is not best][:10]
    if best is None:
        result["reason"] = "No bounded spacing candidates"
        return result
    for relation, factor in (("half", 0.5), ("double", 2.0)):
        size = best["cellSize"] * factor
        comparison = _evaluate(size, xp, yp, width, height, cfg, domain) if lower <= size <= upper else dict(
            cellSize=size, accepted=False, rejection_reasons=["outside spacing bounds"])
        result["harmonic_comparisons"].append(dict(relation=relation, candidate=comparison))
    if best["accepted"]:
        result["grid"] = {key: best[key] for key in ("cellSize", "offsetX", "offsetY")}
        competitors = [c for c in unique if c is not best and c["accepted"]]
        result["ambiguous"] = any(best["heuristic_score"] - c["heuristic_score"] < 0.06 for c in competitors)
        result["reason"] = "Accepted by heuristic evidence thresholds" + ("; plausible alternatives remain" if result["ambiguous"] else "")
    else:
        result["reason"] = "Strongest evidence hypothesis fails acceptance thresholds; lower-ranked alternatives are retained"
    return result
