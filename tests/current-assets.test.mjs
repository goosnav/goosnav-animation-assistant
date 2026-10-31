import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import crypto from 'node:crypto';
async function optionalSource(path){try{return await fs.readFile(path);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
test('current worlds and actual textured book are portable pinned snapshots below static-host limits',async()=>{
 const manifest=JSON.parse(await fs.readFile('app/assets/manifest.json','utf8'));
 const sky=manifest.find(e=>e.file==='sky-black-pyramids.jpg'),skyBytes=await fs.readFile(`app/assets/${sky.file}`);
 assert.ok(skyBytes.length<25*1024*1024);assert.equal(crypto.createHash('sha256').update(skyBytes).digest('hex'),sky.sha256);
 const skySource=await optionalSource(sky.source);if(skySource)assert.equal(crypto.createHash('sha256').update(skySource).digest('hex'),sky.sourceSha256);assert.match(sky.sourceSha256,/^[a-f0-9]{64}$/);assert.ok(sky.transform.includes('8K linear EXR'));

 for(const file of ['world-black-pyramids.glb','world-red-mesas.glb','world-space.glb','world-backrooms.glb','world-starter-overgrown-courtyard.glb','world-colonnade.glb','world-threshold.glb','prop-book.glb']){
  const entry=manifest.find(e=>e.file===file);assert.ok(entry);assert.ok(!entry.source.includes('/archive/'));
  const bytes=await fs.readFile(`app/assets/${file}`);assert.ok(bytes.length<25*1024*1024);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),entry.sha256);
  assert.match(entry.sourceCommit,/^[a-f0-9]{40}$/);assert.match(entry.source,/^submodules\/goosnav-3D-assets\/(environments|props)\//);
  const source=await optionalSource(entry.source);if(source)assert.deepEqual(bytes,source,'runtime snapshot matches its current library source when the optional submodule is present');
  assert.equal(bytes.toString('ascii',0,4),'glTF');const gltf=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
  assert.ok(gltf.meshes.length);assert.ok(gltf.buffers.every(b=>!b.uri));assert.ok((gltf.images||[]).every(i=>!i.uri));
  if(file==='prop-book.glb'||['world-black-pyramids.glb','world-red-mesas.glb'].includes(file))assert.ok(gltf.images.length,'actual library artwork must be embedded');
 }
});
