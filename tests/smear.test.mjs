import test from 'node:test';
import assert from 'node:assert/strict';
import { newProject, compileClip, slotAt, validateProject } from '../app/src/core.mjs';
import { referenceLabels } from '../app/src/reference.mjs';
import { packProject, unpackProject } from '../app/src/archive.mjs';
import { makeTransfer, transferSlots } from '../app/src/drawing-transfer.mjs';
function fixture({smear=true,pose='point',pause=.35}={}){
 const p=newProject();p.scene.count=1;p.lines=[{id:'one',actor:0,text:'Move',rate:1,pause,pose,headYaw:0,blink:false,smear}];
 const takes={one:{duration:.5,sampleRate:16000,samples:new Float32Array(8000),phones:[{phone:'aa',start:0,end:.5}]}};
 return {p,takes};
}
test('smears are opt-in and identical poses never add drawings',()=>{
 const {p,takes}=fixture({smear:false});const old=compileClip(p,takes);assert.ok(old.slots.every(s=>!s.state.smears));
 delete p.lines[0].smear;assert.deepEqual(compileClip(p,takes,old.slots).slots.map(s=>s.id),old.slots.map(s=>s.id));
 p.lines[0].smear=true;p.lines[0].pose='keep';assert.ok(compileClip(p,takes).slots.every(s=>!s.state.smears));
});
test('one-frame transitions reuse the reverse drawing without shifting speech or mouth timing',()=>{
 const {p,takes}=fixture();const c=compileClip(p,takes),drawings=c.slots.filter(s=>s.active&&s.state.smears);
 assert.equal(drawings.length,1);assert.match(referenceLabels(drawings[0].state)[0],/SMEAR/);
 const flashes=c.exposures.filter(e=>e.slotId===drawings[0].id);assert.equal(flashes.length,2);
 assert.ok(flashes.every(e=>e.endFrame-e.startFrame===1));
 p.lines[0].smear=false;const baseline=compileClip(p,takes);
 assert.equal(c.duration,baseline.duration);assert.deepEqual(c.lines,baseline.lines.map(l=>({...l,smear:true})));
 for(let f=0;f<c.totalFrames;f++)assert.deepEqual(slotAt(c,(f+.5)/c.fps).state.mouths,slotAt(baseline,(f+.5)/baseline.fps).state.mouths);
 assert.equal(c.slots.filter(s=>s.active).length,baseline.slots.length+1);
});
test('head-turn changes smear and consecutive speakers preserve both actors and dialogue',()=>{
 const {p,takes}=fixture({pose:'keep',pause:0});p.scene.count=2;p.lines[0].headYaw=35;
 p.lines.push({...p.lines[0],id:'two',actor:1,pose:'shrug',headYaw:0});takes.two=takes.one;
 const c=compileClip(p,takes),boundary=Math.ceil(c.lines[1].start*c.fps-.5);
 const state=slotAt(c,(boundary+.5)/c.fps).state;
 assert.deepEqual(state.smears.map(s=>s.actor),[0,1]);assert.equal(state.mouths[1],'open');
 assert.equal(c.lines[1].start,c.lines[0].end);
});
test('smear metadata survives backups and untrusted drawing endpoints are rejected',async()=>{
 const {p,takes}=fixture();p.slots=compileClip(p,takes).slots;
 const saved=await unpackProject(await packProject({project:p,takes}));assert.deepEqual(JSON.parse(JSON.stringify(saved.project.slots)),p.slots);
 const smear=p.slots.find(s=>s.state.smears);assert.ok(smear);
 for(const patch of [{actor:3},{pose:'invalid'},{headYaw:Infinity}]){
  const bad=structuredClone(p);const s=bad.slots.find(s=>s.state.smears);Object.assign(s.state.smears[0],patch);s.key=JSON.stringify(s.state);
  assert.throws(()=>validateProject(bad),/drawing|smear/i);
 }
});
test('a one-frame pause keeps both outgoing and incoming pose transitions',()=>{
 const {p,takes}=fixture({pause:.04});p.lines.push({...p.lines[0],id:'two',pose:'shrug',pause:.35});takes.two=takes.one;
 const c=compileClip(p,takes),out=Math.ceil(c.lines[0].end*c.fps-.5),incoming=Math.ceil(c.lines[1].start*c.fps-.5);
 assert.equal(incoming,out+1);
 const pair=f=>{const s=slotAt(c,(f+.5)/c.fps).state;return [s.scene.actors[0].pose,s.smears[0].pose].sort();};
 assert.deepEqual(pair(out),['point','stand']);assert.deepEqual(pair(incoming),['shrug','stand']);
});
test('old drawing transfers cannot silently substitute a normal mouth drawing for a new smear',()=>{
 const {p,takes}=fixture({smear:false}),old=compileClip(p,takes);p.slots=old.slots;
 const transfer={...makeTransfer(p,old),version:1,fps:6};p.lines[0].smear=true;
 assert.throws(()=>transferSlots(transfer,p,compileClip(p,takes,p.slots)),/changed|new reference/);
 p.lines[0].smear='yes';assert.throws(()=>validateProject(p),/smear/i);
});
