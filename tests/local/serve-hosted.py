"""Serve a built site locally with the committed Netlify headers and SPA routing."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import tomllib
root=Path(__file__).resolve().parents[2]
config=tomllib.loads((root/'netlify.toml').read_text())
class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(root/'dist'),**kwargs)
    def log_message(self,*args):pass
    def end_headers(self):
        for name,value in config['headers'][0]['values'].items():self.send_header(name,value)
        super().end_headers()
    def do_GET(self):
        if self.path=='/reports':
            self.send_response(301);self.send_header('Location','/reports/');self.end_headers();return
        path=self.path.split('?',1)[0]
        if not (root/'dist'/path.lstrip('/')).is_file() and not (root/'dist'/path.lstrip('/')/'index.html').is_file():
            self.path='/reports/index.html' if path.startswith('/reports/') else '/index.html'
        return super().do_GET()
ThreadingHTTPServer(('127.0.0.1',5182),Handler).serve_forever()
