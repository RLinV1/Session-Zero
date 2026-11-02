"""Lightweight private supervisor: one admitted request and a disposable child per map."""
import json
import os
from pathlib import Path
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from grid_config import MAX_BYTES, MAX_PIXELS, PROCESSING_TIMEOUT, VERSION

CONTRACT_VERSION = f"{VERSION}:max{MAX_PIXELS}"

ADMISSION = threading.Lock()
CHILD = Path(__file__).with_name("grid_child.py")


def analyze(data, width, height, timeout=PROCESSING_TIMEOUT, command=None):
    process = subprocess.Popen(command or [sys.executable, "-B", str(CHILD), str(width), str(height)],
                               stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    try:
        output, _ = process.communicate(data, timeout=timeout)
    except subprocess.TimeoutExpired:
        process.terminate()
        try:
            process.communicate(timeout=1)
        except subprocess.TimeoutExpired:
            process.kill()
            process.communicate()
        return 504, {"error": "deadline"}
    finally:
        if process.poll() is None:
            process.kill()
            process.wait()
    if process.returncode or not 0 < len(output) <= 4096:
        return 500, {"error": "execution_failed"}
    try:
        result = json.loads(output)
    except (ValueError, UnicodeDecodeError):
        return 500, {"error": "execution_failed"}
    if result.get("error") == "invalid_image":
        return 422, {"error": "invalid_image"}
    if result.get("kind") not in {"candidate", "no_grid"}:
        return 500, {"error": "execution_failed"}
    return 200, result


class Handler(BaseHTTPRequestHandler):
    def reply(self, status, result):
        payload = json.dumps(result, allow_nan=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("X-Grid-Version", CONTRACT_VERSION)
        self.send_header("Connection", "close")
        if status == 503:
            self.send_header("Retry-After", "2")
        self.end_headers()
        self.close_connection = True
        try:
            self.wfile.write(payload)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_POST(self):
        if self.path != "/detect":
            self.reply(404, {"error": "not_found"})
            return
        if self.headers.get("x-grid-version") != CONTRACT_VERSION:
            self.reply(409, {"error": "configuration_mismatch"})
            return
        if not ADMISSION.acquire(blocking=False):
            self.reply(503, {"error": "busy"})
            return
        try:
            self.connection.settimeout(5)
            size = int(self.headers.get("content-length", "0"))
            width = int(self.headers.get("x-image-width", "0"))
            height = int(self.headers.get("x-image-height", "0"))
            if not 0 < size <= MAX_BYTES or min(width, height) <= 0:
                raise ValueError("Invalid input")
            data = self.rfile.read(size)
            if len(data) != size:
                raise ValueError("Truncated body")
            status, result = analyze(data, width, height)
            self.reply(status, result)
        except (ValueError, OSError):
            self.reply(422, {"error": "invalid_image"})
        except Exception:
            self.reply(500, {"error": "execution_failed"})
        finally:
            ADMISSION.release()

    def log_message(self, *_args):
        pass


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", int(os.environ.get("PORT", "8000"))), Handler).serve_forever()
