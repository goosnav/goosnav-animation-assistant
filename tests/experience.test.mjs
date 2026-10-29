import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { newProject, validateProject, withSpeechRate, upgradeTiming, compileClip } from '../app/src/core.mjs';
import { makeTransfer, validateTransfer } from '../app/src/drawing-transfer.mjs';
test('new scenes use robot speech and 24fps; old transfer videos remain usable',()=>{
 const p=newProject();assert.equal(p.audioMode,'robot');assert.equal(p.fps,24);assert.doesNotThrow(()=>validateProject(p));
 const transfer=makeTransfer(p,{slots:[{id:'d1',key:'{}',active:true}]});assert.equal(transfer.fps,24);assert.equal(transfer.version,2);
 assert.doesNotThrow(()=>validateTransfer({...transfer,version:1,fps:6}));
});
test('speed edits discard stale corrections atomically and preserve drawing identities',()=>{
 const p=newProject();p.overrides=[{actor:0,mouth:'open',start:.5,end:1}];
 const candidate=withSpeechRate(p,1.5);
 assert.equal(candidate.rate,1.5);assert.deepEqual(candidate.overrides,[]);
 assert.equal(p.rate,1);assert.equal(p.overrides.length,1);
 assert.throws(()=>withSpeechRate(p,4));assert.equal(p.rate,1);
});
test('legacy timing upgrades to 24fps without renaming existing drawings',()=>{
 const p=newProject();p.fps=6;
 const takes=Object.fromEntries(p.lines.map(l=>[l.id,{duration:1,phones:[{phone:'aa',start:0,end:1}]}]));
 const old=compileClip(p,takes);p.slots=old.slots;
 const next=upgradeTiming(p),clip=compileClip(next,takes,next.slots);
 assert.equal(next.fps,24);assert.equal(p.fps,6);
 assert.deepEqual(clip.slots.map(s=>s.id),old.slots.map(s=>s.id));
 assert.ok(clip.totalFrames>old.totalFrames*3);
});
test('one artwork upload and no finished-video escape route or instructional wall',async()=>{
 const html=await fs.readFile('app/index.html','utf8'),js=await fs.readFile('app/src/app.mjs','utf8');
 assert.equal((html.match(/id="import-artwork"/g)||[]).length,1);
 assert.doesNotMatch(html,/id="import-(?:video|images|drawing-video)"|data-(?:view|tab)="assemble"|Already animated in Procreate|Bodies hold still|One scene\. A few drawings|Give it your voice/);
 assert.doesNotMatch(js,/state\.video\s*\?|if\(state\.video\)|video\.src=returnedUrl/);
 assert.doesNotMatch(html,/\p{Extended_Pictographic}|\uFE0F/u);
 assert.match(html,/<details[^>]*id="draw-help"/);
 assert.match(html,/<details[^>]*id="voiceover-options"/);
});
