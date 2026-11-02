"""Local, fresh-process parity/performance replay. Never modifies the supplied study.

python benchmark_grid.py --study-run /path/to/expanded-native/runs/run-ID --output /tmp/results
Use --implementation /tmp/baseline to compare a captured unoptimized application port.
psutil is an optional measurement dependency, not required by the service.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
from pathlib import Path
import random
import resource
import statistics
import subprocess
import sys
import time


def load(path):
    return json.loads(Path(path).read_text())


def entries(run):
    manifest = load(run / "run.json")
    worker = load(run / "gray-native" / "worker.json")
    return manifest["reference_entries"] + worker["entries"]


def same(actual, expected):
    if expected is None:
        return actual["kind"] == "no_grid"
    return actual["kind"] == "candidate" and all(abs(actual[k] - expected[k]) <= 1e-6 for k in ("cellSize", "offsetX", "offsetY"))


def child(args):
    sys.path.insert(0, str(args.implementation))
    from detector import detect_bytes, fit_segments
    timings = {}
    started = time.perf_counter()
    if args.replay:
        with gzip.open(args.replay, "rt") as handle:
            raw = json.load(handle)
        result = fit_segments(raw["segments_original_xyxy"], *raw["transform"]["original_size_px"])
    else:
        data = Path(args.image).read_bytes()
        timings["read_seconds"] = time.perf_counter() - started
        result = detect_bytes(data, args.width, args.height, timings)
    # ru_maxrss is bytes on Darwin and KiB on Linux.
    high_water = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    print(json.dumps({"result": result, "timings": timings,
                      "process_high_water_bytes": high_water if sys.platform == "darwin" else high_water * 1024}))


def run_child(command):
    import psutil
    started = time.perf_counter()
    proc = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    peak = 0
    while proc.poll() is None:
        try:
            peak = max(peak, psutil.Process(proc.pid).memory_info().rss)
        except psutil.NoSuchProcess:
            pass
        time.sleep(0.01)
    output, errors = proc.communicate()
    if proc.returncode:
        raise RuntimeError(errors.decode())
    return {**json.loads(output), "process_launch_to_exit_seconds": time.perf_counter()-started, "sampled_process_peak_bytes": peak}


def main(args):
    args.output.mkdir(parents=True, exist_ok=False)
    cases = entries(args.study_run)
    assert len(cases) == 27, len(cases)
    methods = {"python": sys.version, "implementation": str(args.implementation), "passes": args.passes,
               "seed": 20261025, "fresh_process_per_map": True, "rendering_timed": False,
               "queue_waiting": "sequential batch enqueue model; HTTP/store queue measured separately",
               "browser_availability": "measured separately in browser/integration workflows",
               "container_memory": "requires Docker; process RSS is not container memory",
               "source_hashes": {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in args.implementation.glob("*.py")}}
    (args.output / "method.json").write_text(json.dumps(methods, indent=2))
    rows = []
    rng = random.Random(20261025)
    for pass_index in range(args.passes):
        order = list(cases)
        rng.shuffle(order)
        batch_started = time.perf_counter()
        for entry in order:
            image = entry["image"]
            path = Path(image["path"])
            assert hashlib.sha256(path.read_bytes()).hexdigest() == image["sha256"], path
            expected = load(entry["result"])["suggestion"]
            command = [sys.executable, "-B", str(Path(__file__).resolve()), "--child", "--implementation", str(args.implementation),
                       "--image", str(path), "--width", str(image["dimensions_px"][0]), "--height", str(image["dimensions_px"][1])]
            if args.replay_only:
                command.extend(["--replay", str(entry["cache"])])
            waiting = time.perf_counter()-batch_started
            measured = run_child(command)
            row = {"pass": pass_index + 1, "image": path.name, "sha256": image["sha256"],
                   "expected": expected, "parity": same(measured["result"], expected),
                   "batch_queue_wait_seconds": waiting, **measured}
            rows.append(row)
            with (args.output / "requests.jsonl").open("a") as out:
                out.write(json.dumps(row) + "\n")
            print(json.dumps({"pass": pass_index+1, "image": path.name, "parity": row["parity"], "seconds": row["process_launch_to_exit_seconds"]}), flush=True)
    def stats(values):
        ordered = sorted(values)
        return {"median": statistics.median(values), "p95": ordered[int((len(ordered)-1)*.95)], "max": max(values), "mean": statistics.mean(values)}
    keys = sorted({key for row in rows for key in row["timings"] if key.endswith("seconds")})
    summary = {"requests": len(rows), "all_parity": all(row["parity"] for row in rows),
               "components_seconds": {key: stats([r["timings"][key] for r in rows]) for key in keys},
               "process_launch_to_exit_seconds": stats([r["process_launch_to_exit_seconds"] for r in rows]),
               "process_peak_bytes": max(r["process_high_water_bytes"] for r in rows),
               "throughput_maps_per_second": len(rows) / sum(r["process_launch_to_exit_seconds"] for r in rows),
               "queue_wait_seconds": stats([r["batch_queue_wait_seconds"] for r in rows])}
    (args.output / "summary.json").write_text(json.dumps(summary, indent=2))
    if not summary["all_parity"]:
        raise SystemExit("Geometry differences require investigation; see requests.jsonl")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--study-run", type=Path)
    parser.add_argument("--implementation", type=Path, default=Path(__file__).resolve().parent)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--passes", type=int, default=3)
    parser.add_argument("--replay-only", action="store_true")
    parser.add_argument("--child", action="store_true")
    parser.add_argument("--image")
    parser.add_argument("--width", type=int)
    parser.add_argument("--height", type=int)
    parser.add_argument("--replay")
    arguments = parser.parse_args()
    child(arguments) if arguments.child else main(arguments)
