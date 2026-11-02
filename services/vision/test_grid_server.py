import http.client
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch
from http.server import ThreadingHTTPServer

from server import ADMISSION, CONTRACT_VERSION, Handler, analyze


class SupervisorTest(unittest.TestCase):
    def test_supervisor_imports_no_image_runtime(self):
        output = subprocess.check_output([sys.executable, "-B", "-c", "import server,sys; print(any(n in sys.modules for n in ('cv2','numpy','PIL')))"], cwd=Path(__file__).parent)
        self.assertEqual(output.strip(), b"False")

    def test_fresh_child_for_each_map(self):
        command = [sys.executable, "-c", "import os,json;print(json.dumps({'kind':'no_grid','pid':os.getpid()}))"]
        first = analyze(b"", 1, 1, command=command)
        second = analyze(b"", 1, 1, command=command)
        self.assertEqual(first[0], 200)
        self.assertNotEqual(first[1]["pid"], second[1]["pid"])

    def test_deadline_terminates_and_reaps_child(self):
        with tempfile.TemporaryDirectory() as folder:
            pidfile = Path(folder) / "pid"
            code = "import os,time;from pathlib import Path;Path("+repr(str(pidfile))+").write_text(str(os.getpid()));time.sleep(30)"
            self.assertEqual(analyze(b"x", 1, 1, timeout=.2, command=[sys.executable, "-c", code]), (504, {"error": "deadline"}))
            pid = int(pidfile.read_text())
            with self.assertRaises(ProcessLookupError):
                os.kill(pid, 0)

    def test_invalid_child_output_and_input_are_distinct(self):
        self.assertEqual(analyze(b"x", 1, 1)[0], 422)
        self.assertEqual(analyze(b"", 1, 1, command=[sys.executable, "-c", "print('invalid-json')"])[0], 500)

    def test_busy_admission_defers_without_starting_another_analysis(self):
        entered = threading.Event()
        release = threading.Event()
        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
        def request():
            client = http.client.HTTPConnection("127.0.0.1", server.server_port, timeout=5)
            client.request("POST", "/detect", b"x", {"x-grid-version": CONTRACT_VERSION, "x-image-width": "1", "x-image-height": "1"})
            response = client.getresponse(); result = response.status, json.loads(response.read()); client.close(); return result
        def delayed(*_args):
            entered.set(); release.wait(3); return 200, {"kind": "no_grid"}
        try:
            with patch("server.analyze", side_effect=delayed) as run:
                first = threading.Thread(target=request); first.start()
                self.assertTrue(entered.wait(2))
                self.assertEqual(request(), (503, {"error": "busy"}))
                self.assertEqual(run.call_count, 1)
                release.set(); first.join(3)
                self.assertFalse(first.is_alive())
            self.assertFalse(ADMISSION.locked())
        finally:
            release.set(); server.shutdown(); server.server_close(); thread.join()


if __name__ == "__main__":
    unittest.main()
