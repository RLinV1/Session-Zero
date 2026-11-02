"""One map per process. Input bytes on stdin; a bounded JSON outcome on stdout."""
import json
import os
import sys


def main():
    os.environ.setdefault("OPENCV_IO_MAX_IMAGE_PIXELS", "40000000")
    from detector import detect_bytes
    from grid_config import MAX_BYTES
    try:
        result = detect_bytes(sys.stdin.buffer.read(MAX_BYTES + 1), int(sys.argv[1]), int(sys.argv[2]))
    except (ValueError, OverflowError):
        result = {"error": "invalid_image"}
    except Exception:
        result = {"error": "execution_failed"}
    sys.stdout.write(json.dumps(result, allow_nan=False))


if __name__ == "__main__":
    main()
