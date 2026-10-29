import test from 'node:test';
import assert from 'node:assert/strict';
import { newProject, compileClip, slotAt } from '../app/src/core.mjs';
import { makeTransfer, validateTransfer, transferSlots, assignTransferFrames } from '../app/src/drawing-transfer.mjs';
import { packProject, unpackProject } from '../app/src/archive.mjs';
function fixture(){
 const project=newProject();project.lines=project.lines.slice(0,1);
 const takes={[project.lines[0].id]:{duration:1,sampleRate:16000,samples:new Float32Array(16000),phones:[{phone:'aa',start:0,end:.4},{phone:'m',start:.4,end:.6},{phone:'aa',start:.6,end:1}]}};
 const clip=compileClip(project,takes);project.slots=clip.slots;
 return {project,takes,clip,transfer:makeTransfer(project,clip)};
}
test('compact transfer has unique frames; retiming reuses saved order and exposure repetitions',()=>{
 const {project,takes,clip,transfer}=fixture();assert.equal(transfer.fps,24);assert.equal(transfer.slots.length,2);assert.ok(clip.totalFrames>2);
 const frames=transfer.slots.map((_,i)=>new Blob([`drawn ${i}`]));const art=assignTransferFrames(transfer,project,clip,frames,{old:new Blob(['old'])});
 project.lines[0].pause=3;const retimed=compileClip(project,takes,project.slots);
 assert.ok(retimed.duration>clip.duration);assert.deepEqual(transferSlots(transfer,project,retimed).map(s=>s.id),transfer.slots.map(s=>s.id));
 assert.equal(art[slotAt(retimed,.1).id],frames[0]);assert.equal(art[slotAt(retimed,.4).id],frames[1]);assert.equal(art[slotAt(retimed,.85).id],frames[0]);assert.equal(art[slotAt(retimed,1).id],frames[1]);
 assert.ok(art.old);
});
test('transfer rejects changed camera, incomplete or excessive frames and malformed identities',()=>{
 const {project,takes,clip,transfer}=fixture();
 for(const count of [0,1,3])assert.throws(()=>assignTransferFrames(transfer,project,clip,Array.from({length:count},()=>new Blob(['x']))),/frames/);
 project.scene.camera.azimuth=20;const changed=compileClip(project,takes,project.slots);assert.throws(()=>transferSlots(transfer,project,changed),/changed|new reference/i);
 assert.throws(()=>validateTransfer({...transfer,slots:[transfer.slots[0],transfer.slots[0]]}),/Invalid/);
 assert.throws(()=>validateTransfer({...transfer,width:999999}),/Invalid/);
});
test('portable backups preserve the transfer manifest and reject invalid manifests',async()=>{
 const {project,takes,transfer}=fixture();const decoded=await unpackProject(await packProject({project,takes,transfer}));assert.deepEqual(JSON.parse(JSON.stringify(decoded.transfer)),transfer);
 await assert.rejects(()=>unpackProjectFromBad(project,transfer),/Invalid/);
});
test('legacy six-fps drawings survive newly visible short phonemes at 24fps',()=>{
 const {project,takes}=fixture();project.fps=6;project.slots=[];
 takes[project.lines[0].id].phones=[{phone:'aa',start:0,end:.15},{phone:'f',start:.15,end:.2},{phone:'aa',start:.2,end:1}];
 const old=compileClip(project,takes);project.slots=old.slots;
 const transfer={...makeTransfer(project,old),version:1,fps:6};
 project.fps=24;const upgraded=compileClip(project,takes,project.slots);
 assert.ok(upgraded.slots.length>old.slots.length);
 const frames=transfer.slots.map(()=>new Blob(['drawing']));
 const art=assignTransferFrames(transfer,project,upgraded,frames);
 assert.deepEqual(Object.keys(art),transfer.slots.map(s=>s.id));
 assert.equal(upgraded.slots.filter(s=>s.active&&!art[s.id]).length,1);
 project.scene.camera.azimuth=20;
 assert.throws(()=>transferSlots(transfer,project,compileClip(project,takes,upgraded.slots)),/changed/);
});
async function unpackProjectFromBad(project,transfer){return unpackProject(await packProject({project,transfer:{...transfer,fps:NaN}}));}
