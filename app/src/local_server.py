"""Loopback-only static hosting and portable project persistence. No rendering API."""
from __future__ import annotations

import argparse
import functools
import http.server
import json
import os
import secrets
import re
import time
import sys
import threading
import webbrowser
from pathlib import Path
from urllib.parse import unquote, urlsplit, parse_qs

MAX_PROJECT = 256 * 1024 * 1024

def data_root() -> Path:
    if os.environ.get('GOOSNAV_DATA_DIR'):
        return Path(os.environ['GOOSNAV_DATA_DIR'])
    if sys.platform == 'win32':
        base=Path(os.environ.get('LOCALAPPDATA',Path.home()/'AppData/Local'))
    elif sys.platform == 'darwin':
        base=Path.home()/'Library/Application Support'
    else:
        base=Path(os.environ.get('XDG_DATA_HOME',Path.home()/'.local/share'))
    return base/'GoosnavAnimationAssistant'/'data'

def create_server(root: Path, data: Path, port: int):
    root=root.resolve();data=data.resolve();data.mkdir(parents=True,exist_ok=True)
    token=secrets.token_urlsafe(32)
    lock=threading.Lock()
    class Handler(http.server.SimpleHTTPRequestHandler):
        extensions_map={**http.server.SimpleHTTPRequestHandler.extensions_map,'.mjs':'text/javascript','.wasm':'application/wasm','.glb':'model/gltf-binary'}
        def log_message(self,*_args):pass
        def trusted(self):
            host=self.headers.get('Host','')
            origin=self.headers.get('Origin')
            return host in (f'127.0.0.1:{self.server.server_port}',f'localhost:{self.server.server_port}') and (not origin or origin==f'http://{host}')
        def reply(self,status,body=b'',mime='application/json'):
            self.send_response(status);self.send_header('Content-Type',mime);self.send_header('Content-Length',str(len(body)));self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');self.end_headers();self.wfile.write(body)
        def do_GET(self):
            if not self.trusted():self.reply(403);return
            route=urlsplit(self.path).path
            if route=='/health/ready':self.reply(200,b'{"ready":true}');return
            if route=='/api/config':self.reply(200,json.dumps({'token':token}).encode());return
            if route=='/api/projects':
                index=data/'index.json'
                with lock:self.reply(200,index.read_bytes() if index.exists() else b'[]')
                return
            if route=='/api/project':
                with lock:
                    id=parse_qs(urlsplit(self.path).query).get('id',[''])[0]
                    if id and not re.fullmatch(r'[a-zA-Z0-9-]{1,80}',id):self.reply(400);return
                    pointer=data/'current-id.txt'
                    if not id and pointer.exists():id=pointer.read_text()
                    path=data/(f'{id}.zip' if id else 'current.zip')
                    self.reply(200,path.read_bytes(),'application/zip') if path.exists() else self.reply(404)
                return
            target=(root/unquote(route).lstrip('/')).resolve()
            if not target.is_relative_to(root):self.reply(403);return
            if target.is_dir() and not (target/'index.html').is_file():self.reply(404);return
            super().do_GET()
        def do_PUT(self):
            if not self.trusted() or not secrets.compare_digest(self.headers.get('X-Launch-Token',''),token):self.reply(403);return
            if self.path!='/api/project':self.reply(404);return
            try:size=int(self.headers.get('Content-Length','0'))
            except ValueError:self.reply(400);return
            if not 0<size<=MAX_PROJECT:self.reply(413);return
            self.connection.settimeout(30)
            try:
                body=self.rfile.read(size)
                if len(body)!=size:self.reply(400);return
                with lock:
                    id=self.headers.get('X-Project-Id','')
                    if id and not re.fullmatch(r'[a-zA-Z0-9-]{1,80}',id):self.reply(400);return
                    name=f'{id}.zip' if id else 'current.zip'
                    temp=data/(name+'.partial');temp.write_bytes(body);os.replace(temp,data/name)
                    if id:
                        (data/'current-id.txt').write_text(id)
                        index=data/'index.json';items=json.loads(index.read_text()) if index.exists() else []
                        items=[i for i in items if i['id']!=id];items.insert(0,{'id':id,'title':unquote(self.headers.get('X-Project-Title','Untitled'))[:200],'updated':time.time()*1000})
                        temp=data/'index.partial';temp.write_text(json.dumps(items));os.replace(temp,index)
                self.reply(200,b'{"saved":true}')
            except (OSError,TimeoutError):self.reply(500,b'{"error":"Project could not be saved"}')
        def do_POST(self):
            if self.path!='/api/quit' or not self.trusted() or not secrets.compare_digest(self.headers.get('X-Launch-Token',''),token):self.reply(403);return
            self.reply(200,b'{"stopping":true}');threading.Thread(target=self.server.shutdown,daemon=True).start()
    handler=functools.partial(Handler,directory=str(root))
    try:return http.server.ThreadingHTTPServer(('127.0.0.1',port),handler)
    except OSError:
        if not port:raise
        return http.server.ThreadingHTTPServer(('127.0.0.1',0),handler)

def main():
    parser=argparse.ArgumentParser()
    default_root=Path(os.environ['GOOSNAV_APP_ROOT'])/'static' if os.environ.get('GOOSNAV_APP_ROOT') else Path(__file__).resolve().parents[2]/'dist'
    parser.add_argument('--root',type=Path,default=default_root)
    parser.add_argument('--data',type=Path,default=data_root())
    parser.add_argument('--port',type=int,default=int(os.environ.get('GOOSNAV_PORT_PREFERENCE','8793')))
    parser.add_argument('--no-browser',action='store_true')
    args=parser.parse_args()
    if not (args.root/'index.html').is_file():raise SystemExit('APP-START: Built assets are missing. Run npm run build when developing.')
    server=create_server(args.root,args.data,args.port);url=f'http://127.0.0.1:{server.server_port}'
    state_path=os.environ.get('GOOSNAV_RUNTIME_STATE')
    if state_path:
        path=Path(state_path);path.parent.mkdir(parents=True,exist_ok=True);temp=path.with_suffix('.partial');temp.write_text(json.dumps({'schema_version':1,'pid':os.getpid(),'url':url}));os.replace(temp,path)
    print(url,flush=True)
    if not args.no_browser and not state_path:
        if not webbrowser.open(url):print(f'LAUNCH-BROWSER: Open {url} in your browser.',flush=True)
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close()

if __name__=='__main__':main()
