"""Static dev server with cache-disabling headers and threading."""
import http.server
import sys
from pathlib import Path

PORT = 8765
DIR = str(Path(__file__).resolve().parent / "public")

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, format, *args):
        # Quieter logs
        try:
            sys.stderr.write("[serve] %s - %s\n" % (self.address_string(), format % args))
        except Exception:
            pass

if __name__ == "__main__":
    handler = lambda *a, **kw: NoCacheHandler(*a, directory=DIR, **kw)
    server = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), handler)
    print(f"Serving {DIR} on http://127.0.0.1:{PORT}", flush=True)
    server.serve_forever()
