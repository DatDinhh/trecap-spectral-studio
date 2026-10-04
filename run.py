"""Serve the self-contained recorded demo on this computer's loopback interface."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit
import webbrowser


class DemoHandler(SimpleHTTPRequestHandler):
    def send_head(self):
        parts = Path(unquote(urlsplit(self.path).path)).parts
        if any(part.startswith('.') for part in parts if part not in ('/', '\\')):
            self.send_error(404)
            return None
        return super().send_head()

    def list_directory(self, path):
        self.send_error(404)
        return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8770)
    parser.add_argument('--no-browser', action='store_true')
    args = parser.parse_args()
    root = Path(__file__).resolve().parent
    handler = partial(DemoHandler, directory=str(root))
    try:
        server = ThreadingHTTPServer(('127.0.0.1', args.port), handler)
    except OSError as error:
        parser.exit(1, f'Cannot open local port {args.port}: {error}\nTry --port 8771.\n')
    url = f'http://127.0.0.1:{server.server_port}/'
    print(f'T-RECAP recorded FPGA demo: {url}', flush=True)
    print('Press Ctrl+C to stop. No board connection or Python packages required.', flush=True)
    if not args.no_browser:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
