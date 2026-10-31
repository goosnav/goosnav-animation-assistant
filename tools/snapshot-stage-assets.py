"""Snapshot current, portable library assets without altering the submodule."""
import hashlib,json,pathlib,subprocess
root=pathlib.Path(__file__).resolve().parents[1]
lib=root/'submodules/goosnav-3D-assets'
manifest=root/'app/assets/manifest.json'
entries=json.loads(manifest.read_text())
paths={f'world-{name}.glb':f'environments/theatre-{name}/scene.glb' for name in ['black-pyramids','red-mesas','space','backrooms','starter-overgrown-courtyard']}
paths.update({'world-colonnade.glb':'environments/reading-room/scene.glb','world-threshold.glb':'environments/threshold/scene.glb','prop-book.glb':'props/ps1/book2_goosnav_dilemma.glb'})
commit=subprocess.check_output(['git','-C',str(lib),'rev-parse','HEAD'],text=True).strip()
for dest,source in paths.items():
 data=(lib/source).read_bytes()
 assert data[:4]==b'glTF' and len(data)<25*1024*1024
 (root/'app/assets'/dest).write_bytes(data)
 entries=[e for e in entries if e['file']!=dest]
 entries.append({'file':dest,'sha256':hashlib.sha256(data).hexdigest(),'source':f'submodules/goosnav-3D-assets/{source}','sourceCommit':commit})
subprocess.run(['blender','-b','--python',str(root/'tools/export-stage-skybox.py')],cwd=root,check=True)
source='environments/black-pyramids/skybox.exr'
dest='sky-black-pyramids.jpg'
data=(root/'app/assets'/dest).read_bytes()
assert len(data)<25*1024*1024
entries=[e for e in entries if e['file']!=dest]
entries.append({'file':dest,'sha256':hashlib.sha256(data).hexdigest(),'source':f'submodules/goosnav-3D-assets/{source}','sourceCommit':commit,'sourceSha256':hashlib.sha256((lib/source).read_bytes()).hexdigest(),'transform':'8K linear EXR to sRGB JPEG quality95, Blender Standard view, exposure0/gamma1; tools/export-stage-skybox.py'})
manifest.write_text(json.dumps(entries,indent=2)+'\n')
