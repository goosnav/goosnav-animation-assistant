import importlib.util
import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path

spec = importlib.util.spec_from_file_location('local_server', Path(__file__).resolve().parents[1] / 'app/src/local_server.py')
local = importlib.util.module_from_spec(spec)
spec.loader.exec_module(local)

class LocalServerTests(unittest.TestCase):
    def test_private_local_persistence_and_traversal(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)/'static';root.mkdir();(root/'index.html').write_text('Animation Assistant')
            server=local.create_server(root,Path(folder)/'data',0)
            threading.Thread(target=server.serve_forever,daemon=True).start()
            base=f'http://127.0.0.1:{server.server_port}'
            try:
                config=json.load(urllib.request.urlopen(base+'/api/config'))
                req=urllib.request.Request(base+'/api/project',data=b'project',method='PUT')
                with self.assertRaises(urllib.error.HTTPError) as error:urllib.request.urlopen(req)
                self.assertEqual(error.exception.code,403)
                req.add_header('X-Launch-Token',config['token']);urllib.request.urlopen(req).close()
                self.assertEqual(urllib.request.urlopen(base+'/api/project').read(),b'project')
                for id in ['clip-one','clip-two']:
                    req=urllib.request.Request(base+'/api/project',data=id.encode(),method='PUT',headers={'X-Launch-Token':config['token'],'X-Project-Id':id,'X-Project-Title':id})
                    urllib.request.urlopen(req).close()
                self.assertEqual(urllib.request.urlopen(base+'/api/project').read(),b'clip-two')
                self.assertEqual(urllib.request.urlopen(base+'/api/project?id=clip-one').read(),b'clip-one')
                self.assertEqual(len(json.load(urllib.request.urlopen(base+'/api/projects'))),2)
                req=urllib.request.Request(base+'/api/config',headers={'Origin':'https://other.example'})
                with self.assertRaises(urllib.error.HTTPError):urllib.request.urlopen(req)
                with self.assertRaises(urllib.error.HTTPError):urllib.request.urlopen(base+'/%2e%2e/data/current.zip')
            finally:server.shutdown();server.server_close()

if __name__=='__main__':unittest.main()
