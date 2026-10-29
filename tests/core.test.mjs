import test from 'node:test';
import assert from 'node:assert/strict';
import { newProject, validateProject, compileClip, toggleSelection, phoneMouth, slotAt } from '../app/src/core.mjs';

const take = { duration: 1, phones: [{phone:'m',start:0,end:.2},{phone:'aa',start:.2,end:.6},{phone:'uw',start:.6,end:.8},{phone:'pau',start:.8,end:1}] };
test('generated exposure sequence closes silence and reuses the same drawing', () => {
 const p = newProject(); p.lines = [{id:'a',actor:0,text:'Moo',rate:1,pause:.2,pose:'keep'}];
 const c=compileClip(p,{a:take});
 assert.equal(c.totalFrames,48); // .3 lead + 1 audio + .2 pause + .5 tail = 2 sec
 assert.equal(c.slots.filter(s=>s.active).length,3);
 assert.equal(slotAt(c,0).state.mouths[0],'rest');
 assert.equal(slotAt(c,.7).state.mouths[0],'open');
 assert.equal(slotAt(c,1.05).state.mouths[0],'round');
 assert.equal(slotAt(c,1.8).state.mouths[0],'rest');
 assert.ok(c.slots.every(s=>s.state.mouths[1]==='rest'));
});
test('retiming preserves immutable drawing IDs and visual revisions never alias', () => {
 const p=newProject();p.lines=[{id:'a',actor:0,text:'Moo',rate:1,pause:.2,pose:'keep'}];
 const a=compileClip(p,{a:take});p.lines[0].pause=2;
 const b=compileClip(p,{a:take},a.slots);
 assert.deepEqual(b.slots.map(s=>s.id),a.slots.map(s=>s.id));
 p.scene.camera.azimuth=40;
 const c=compileClip(p,{a:take},b.slots);
 assert.equal(c.slots.filter(s=>s.active).some(s=>a.slots.some(o=>o.id===s.id)),false);
 assert.ok(c.slots.some(s=>!s.active));
});
test('two static speakers never expand to a cartesian mouth library',()=>{
 const p=newProject(); p.lines=[{id:'a',actor:0,text:'A',rate:1,pause:.2,pose:'keep'},{id:'b',actor:1,text:'B',rate:1,pause:.2,pose:'keep'}];
 const phones=['pau','ih','aa','iy','uw','f'].map((phone,i)=>({phone,start:i/2,end:(i+1)/2}));
 const c=compileClip(p,{a:{duration:3,phones},b:{duration:3,phones}});
 assert.equal(c.slots.filter(s=>s.active).length,11);
});
test('numbered tapping removes and renumbers without depending on file names',()=>{
 let a=[]; for(const id of ['z','a','q']) a=toggleSelection(a,id);
 assert.deepEqual(a,['z','a','q']);assert.deepEqual(toggleSelection(a,'a'),['z','q']);
});
test('project validation rejects invalid import data and unbounded dimensions',()=>{
 assert.throws(()=>validateProject({...newProject(),version:99}),/version/i);
 const p=newProject();p.scene.actors[0].x=Infinity;assert.throws(()=>validateProject(p));
 const q=newProject();q.lines[0].actor=3;assert.throws(()=>validateProject(q));
});
test('phonemes distinguish closures, rounding and lip teeth',()=>{
 assert.equal(phoneMouth('p'),'rest');assert.equal(phoneMouth('uw'),'round');assert.equal(phoneMouth('v'),'teeth');
});
test('undoing to an old registry never reuses a different camera drawing ID',()=>{
 const p=newProject();p.lines=[{id:'a',actor:0,text:'Moo',rate:1,pause:.2,pose:'keep'}];
 const a=compileClip(p,{a:take});p.scene.camera.azimuth=30;const b=compileClip(p,{a:take},a.slots);
 p.scene.camera.azimuth=60;const c=compileClip(p,{a:take},a.slots);
 assert.ok(c.slots.filter(s=>s.active).every(s=>!b.slots.some(o=>o.active&&o.id===s.id)));
});
test('untrusted drawing registries cannot inject markup or mismatched state keys',()=>{
 const p=newProject();p.slots=[{id:'d1" onmouseover="alert(1)',key:'x',state:{}}];assert.throws(()=>validateProject(p),/drawing/i);
});
test('solo drawing history remains valid after adding a second speaking character',()=>{
 const p=newProject();p.scene.count=1;p.lines=[{id:'a',actor:0,text:'Moo',rate:1,pause:.2,pose:'keep'}];
 p.slots=compileClip(p,{a:take}).slots;p.scene.count=2;p.lines[0].actor=1;
 assert.doesNotThrow(()=>validateProject(p));assert.ok(compileClip(p,{a:take},p.slots).duration>0);
});
