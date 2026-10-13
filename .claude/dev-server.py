"""Local dev server with live reload and no caching.

Serves the site folder, injects a tiny reload script into HTML pages,
and pushes a reload over Server-Sent Events whenever a file changes.
Run: python3 .claude/dev-server.py [port]
"""
import os
import sys
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 4321
SKIP = {'.git', '.claude', 'node_modules'}
SNIPPET = b"<script>new EventSource('/__reload').onmessage=()=>location.reload()</script>"


def latest_mtime():
    newest = 0.0
    for base, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in SKIP]
        for f in files:
            try:
                newest = max(newest, os.stat(os.path.join(base, f)).st_mtime)
            except OSError:
                pass
    return newest


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, *args):
        pass

    def do_GET(self):
        if self.path == '/__reload':
            return self.stream_reloads()
        url = self.path.split('?')[0]
        path = self.translate_path(url)
        if os.path.isdir(path):
            if not url.endswith('/'):  # same as vercel.json: /folder -> /folder/
                self.send_response(301)
                self.send_header('Location', url + '/')
                self.end_headers()
                return
            path = os.path.join(path, 'index.html')
        if path.endswith('.html') and os.path.isfile(path):
            with open(path, 'rb') as fh:
                body = fh.read().replace(b'</body>', SNIPPET + b'</body>', 1)
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        return super().do_GET()

    def stream_reloads(self):
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream')
        self.end_headers()
        seen = latest_mtime()
        try:
            while True:
                time.sleep(0.4)
                now = latest_mtime()
                if now > seen:
                    seen = now
                    self.wfile.write(b'data: reload\n\n')
                    self.wfile.flush()
                else:
                    self.wfile.write(b': ping\n\n')
                    self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass


if __name__ == '__main__':
    ThreadingHTTPServer.daemon_threads = True
    print(f'Live reload server on http://localhost:{PORT}', flush=True)
    ThreadingHTTPServer(('', PORT), Handler).serve_forever()
