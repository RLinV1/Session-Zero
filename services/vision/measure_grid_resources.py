"""Sample local grid/wall process RSS; container memory requires separate Docker metrics.

Optional measurement dependency: psutil. Stop by creating --stop-file.
"""
import argparse
import json
from pathlib import Path
import time

import psutil


def main(args):
    rows = []
    while not args.stop_file.exists():
        grid, walls = [], []
        for process in psutil.process_iter(["pid", "cmdline"]):
            try:
                command = process.info["cmdline"] or []
                if "services/vision/server.py" in command:
                    grid.extend([process, *process.children(recursive=True)])
                if "services/vision/wall_worker.py" in command:
                    walls.append(process)
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
        def rss(processes):
            total = 0
            for process in processes:
                try:
                    total += process.memory_info().rss
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    pass
            return total
        row = {"time": time.time(), "grid_processes": len(grid), "wall_processes": len(walls),
               "grid_rss_bytes": rss(grid), "wall_rss_bytes": rss(walls)}
        row["combined_rss_bytes"] = row["grid_rss_bytes"] + row["wall_rss_bytes"]
        rows.append(row)
        time.sleep(.02)
    args.output.write_text(json.dumps({"scope": "local process RSS, not container memory", "samples": rows,
        "peaks": {key: max((r[key] for r in rows), default=0) for key in ("grid_rss_bytes", "wall_rss_bytes", "combined_rss_bytes", "grid_processes")}}, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--stop-file", required=True, type=Path)
    main(parser.parse_args())
