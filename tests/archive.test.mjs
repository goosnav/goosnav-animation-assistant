import test from 'node:test';
import assert from 'node:assert/strict';
import { packProject, unpackProject } from '../app/src/archive.mjs';
import { newProject } from '../app/src/core.mjs';
test('portable project preserves exact artwork and PCM without filenames as IDs',async()=>{
 const source={project:newProject(),takes:{a:{samples:new Float32Array([.5,-.25]),sampleRate:16000,phones:[],duration:1}},art:{d1:new Blob(['drawing'],{type:'image/png'})},refs:{},recording:new Blob(['voice'],{type:'audio/webm'})};
 const decoded=await unpackProject(await packProject(source));
 assert.equal(decoded.project.id,source.project.id);
 assert.deepEqual([...decoded.takes.a.samples],[.5,-.25]);
 assert.equal(await decoded.art.d1.text(),'drawing');assert.equal(decoded.recording.type,'audio/webm');
});
test('corrupt project import fails instead of replacing the open clip',async()=>{await assert.rejects(()=>unpackProject(new Blob(['not a zip'])));});
