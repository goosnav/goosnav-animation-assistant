import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject,compileClip,slotAt} from '../app/src/core.mjs';
import * as config from '../app/src/config.mjs';
import {makeTransfer,transferSlots} from '../app/src/drawing-transfer.mjs';
import {restoreHandoff} from '../app/src/handoff.mjs';
import {ACTOR_CHANNELS} from '../app/src/motion.mjs';

function fixture(){
 const project=newProject();project.lines=project.lines.slice(0,1);
 const takes={[project.lines[0].id]:{duration:1,phones:[{phone:'aa',start:0,end:.4},{phone:'m',start:.4,end:.6},{phone:'aa',start:.6,end:1}]}};
 const clip=compileClip(project,takes);project.slots=clip.slots;
 return {project,takes,clip,transfer:makeTransfer(project,clip)};
}

test('JSON carries the ordered reference identities and original exposures to another device',async()=>{
 const {project,takes,clip,transfer}=fixture();transfer.slots.reverse();
 const text=config.exportConfig(project,{clip,takes,transfer}),data=JSON.parse(text);
 assert.ok(data.handoff,'exported JSON must carry the drawing handoff');
 const {restoreHandoff}=await import('../app/src/handoff.mjs');
 const loaded=config.parseConfigDocument(text),freshTakes={[loaded.project.lines[0].id]:structuredClone(takes[project.lines[0].id])};
 assert.notEqual(loaded.project.id,project.id);assert.notEqual(loaded.project.lines[0].id,project.lines[0].id);
 const restored=restoreHandoff(loaded.project,freshTakes,loaded.handoff);
 assert.deepEqual(restored.clip.exposures,clip.exposures);
 assert.deepEqual(restored.clip.slots.map(s=>s.id),transfer.slots.map(s=>s.id));
 assert.deepEqual(transferSlots(restored.transfer,restored.project,restored.clip).map(s=>s.id),transfer.slots.map(s=>s.id));
 assert.equal(slotAt(restored.clip,.1).id,transfer.slots[1].id);
 assert.equal(slotAt(restored.clip,.4).id,transfer.slots[0].id);
 assert.deepEqual(JSON.parse(config.exportConfig(restored.project,{...restored})),data);
});

function load(project,takes,clip,transfer){
 const parsed=config.parseConfigDocument(config.exportConfig(project,{clip,takes,transfer}));
 const freshTakes=Object.fromEntries(parsed.project.lines.flatMap((l,i)=>takes[project.lines[i].id]?[[l.id,structuredClone(takes[project.lines[i].id])]]:[]));
 return {...parsed,takes:freshTakes};
}
test('GUI-created props survive property-order changes on a fresh device',()=>{
 for(const kind of ['book','cube']){
  const project=newProject();project.lines=[];project.audioMode='silent';project.animation={mode:'silent',duration:2,drawings:3,keys:[]};
  project.scene.count=1;
  project.scene.props=[{id:'gui-prop',kind,x:0,y:1,z:.4,rx:0,ry:0,rz:0,width:.28,height:.38,depth:.04,color:'#ffcd00',attachment:'world'}];
  const clip=compileClip(project),loaded=load(project,{},clip),restored=restoreHandoff(loaded.project,loaded.takes,loaded.handoff);
  assert.notEqual(JSON.stringify(project.scene.props),JSON.stringify(loaded.project.scene.props));
  assert.deepEqual(restored.clip.exposures,clip.exposures);assert.equal(restored.drawingSlots[0].id,clip.slots[0].id);
  assert.deepEqual(JSON.parse(config.exportConfig(restored.project,restored)),JSON.parse(config.exportConfig(project,{clip})));
 }
});
test('saved speech timing pins small synthesis jitter without mutating generated takes',()=>{
 const {project,takes,clip}=fixture(),loaded=load(project,takes,clip),take=loaded.takes[loaded.project.lines[0].id];
 take.duration+=.01;for(const p of take.phones){if(p.start)p.start+=.01;p.end+=.01;}
 const before=structuredClone(take),restored=restoreHandoff(loaded.project,loaded.takes,loaded.handoff);
 assert.deepEqual(restored.clip.exposures,clip.exposures);assert.deepEqual(take,before);
 assert.equal(restored.takes[loaded.project.lines[0].id].duration,1);
 assert.deepEqual(compileClip(restored.project,restored.takes,restored.project.slots).exposures,clip.exposures);
});
test('large speech timing or phoneme changes reject incompatible reconstruction',()=>{
 const {project,takes,clip}=fixture();
 for(const change of [t=>t.duration+=.5,t=>t.phones[0].phone='f',t=>t.phones[0].start=.1]){
  const loaded=load(project,takes,clip);change(loaded.takes[loaded.project.lines[0].id]);
  assert.throws(()=>restoreHandoff(loaded.project,loaded.takes,loaded.handoff),/speech.*incompatible/);
 }
});
test('retiming reuses original IDs and imported frame order including inactive drawings',()=>{
 const {project,takes,clip,transfer}=fixture();transfer.slots.reverse();
 const loaded=load(project,takes,clip,transfer);loaded.project.lines[0].pause=3;
 let restored=restoreHandoff(loaded.project,loaded.takes,loaded.handoff);
 assert.ok(restored.clip.duration>clip.duration);assert.deepEqual(restored.drawingSlots.map(s=>s.id),transfer.slots.map(s=>s.id));
 assert.equal(slotAt(restored.clip,.4).id,slotAt(clip,.4).id);
 loaded.project.overrides=[{actor:0,start:0,end:5,mouth:'rest'}];restored=restoreHandoff(loaded.project,loaded.takes,loaded.handoff);
 assert.equal(restored.clip.slots.filter(s=>s.active).length,1);assert.equal(restored.drawingSlots.length,2);
 assert.deepEqual(transferSlots(restored.transfer,restored.project,restored.clip).map(s=>s.id),transfer.slots.map(s=>s.id));
 const exported=config.parseConfigDocument(config.exportConfig(restored.project,restored));
 assert.equal(exported.handoff.slots.length,2);
});
test('reactivating an inactive handoff drawing reuses its original artwork identity',()=>{
 const project=newProject();project.lines=[];project.audioMode='silent';
 project.animation={mode:'silent',duration:2,drawings:3,keys:[
  {id:'start',target:'actor:0',time:0,transition:'hold',values:{headYaw:0}},
  {id:'turn',target:'actor:0',time:.5,transition:'hold',values:{headYaw:30}},
 ]};
 const original=compileClip(project),turned=slotAt(original,1),art={[turned.id]:new Blob(['returned turned drawing'])};
 const document=JSON.parse(config.exportConfig(project,{clip:original})),removed=document.keys.pop();
 const loaded=config.parseConfigDocument(JSON.stringify(document)),restored=restoreHandoff(loaded.project,{},loaded.handoff);
 assert.equal(restored.project.slots.find(s=>s.id===turned.id).active,false);
 restored.project.animation.keys.push(removed);
 const reactivated=compileClip(restored.project,restored.takes,restored.project.slots);
 assert.equal(reactivated.slots.length,2,'reactivating a known pose must not allocate another drawing');
 assert.equal(slotAt(reactivated,1).id,turned.id);
 assert.equal(art[slotAt(reactivated,1).id],art[turned.id]);
 assert.deepEqual(transferSlots(restored.transfer,restored.project,reactivated).map(s=>s.id),restored.drawingSlots.map(s=>s.id));
});
test('intentional speech rate changes use fresh timing when drawing states are unchanged',()=>{
 const {project,takes,clip}=fixture(),loaded=load(project,takes,clip);loaded.project.rate=1.5;
 const take=loaded.takes[loaded.project.lines[0].id];take.duration=.5;take.phones=take.phones.map(p=>({...p,start:p.start/2,end:p.end/2}));
 const restored=restoreHandoff(loaded.project,loaded.takes,loaded.handoff);
 assert.equal(restored.takes[loaded.project.lines[0].id].duration,.5);assert.ok(restored.clip.duration<clip.duration);
 assert.deepEqual(restored.drawingSlots.map(s=>s.id),clip.slots.map(s=>s.id));
});
test('switching a speech handoff to silent mode needs no speech takes and keeps its artwork mapping',()=>{
 const {project,takes,clip,transfer}=fixture(),data=JSON.parse(config.exportConfig(project,{clip,takes,transfer}));
 data.timing={...data.timing,mode:'silent',duration:2};
 const loaded=config.parseConfigDocument(JSON.stringify(data)),restored=restoreHandoff(loaded.project,{},loaded.handoff);
 assert.equal(restored.project.lines.length,1);assert.deepEqual(restored.takes,{});
 assert.equal(restored.clip.totalFrames,48);assert.deepEqual(restored.clip.lines,[]);
 assert.deepEqual(restored.drawingSlots.map(s=>s.id),transfer.slots.map(s=>s.id));
 assert.equal(restored.clip.slots.filter(s=>s.active).length,1);
 assert.equal(slotAt(restored.clip,1).id,slotAt(clip,.1).id);
 assert.deepEqual(compileClip(restored.project,restored.takes,restored.project.slots).exposures,restored.clip.exposures);
 assert.deepEqual(transferSlots(restored.transfer,restored.project,restored.clip).map(s=>s.id),transfer.slots.map(s=>s.id));
 loaded.project.scene.camera.azimuth=10;
 assert.throws(()=>restoreHandoff(loaded.project,{},loaded.handoff),{code:'HANDOFF_DRAWINGS_CHANGED'});
});
test('changed scene and new mouth states cannot silently receive old artwork',()=>{
 const {project,takes,clip}=fixture();
 for(const change of [p=>p.scene.camera.azimuth=10,p=>p.scene.actors[0].model='olive',p=>p.overrides=[{actor:0,start:.5,end:.8,mouth:'round'}]]){
  const loaded=load(project,takes,clip);change(loaded.project);
  assert.throws(()=>restoreHandoff(loaded.project,loaded.takes,loaded.handoff),{code:'HANDOFF_DRAWINGS_CHANGED'});
 }
});
test('plain recipes compile automatic drawing mappings without a reference export',()=>{
 const loaded=config.parseConfigDocument(JSON.stringify({format:'goosnav-animation-config',version:1,timing:{mode:'silent',duration:1}}));
 assert.equal(loaded.handoff,null);
 const restored=restoreHandoff(loaded.project,{},loaded.handoff);
 assert.equal(restored.clip.totalFrames,24);assert.equal(restored.drawingSlots.length,1);assert.equal(restored.transfer.slots.length,1);
 assert.equal(loaded.project.slots.length,0);assert.equal(restored.project.slots.length,1);
});
test('numbered image handoffs support more than the video limit of 100 drawings',()=>{
 const project=newProject();project.lines=[];project.animation={mode:'silent',duration:6,drawings:3,keys:Array.from({length:110},(_,i)=>({id:`key-${i}`,target:'actor:0',time:i/24,transition:'hold',values:{headYaw:i-55}}))};
 const clip=compileClip(project);assert.equal(clip.slots.length,110);
 assert.throws(()=>makeTransfer(project,clip),/100/);
 const loaded=load(project,{},clip),restored=restoreHandoff(loaded.project,{},loaded.handoff);
 assert.equal(restored.transfer,null);assert.equal(restored.drawingSlots.length,110);assert.deepEqual(restored.clip.exposures,clip.exposures);
 assert.equal(restoreHandoff(loaded.project).transfer,null);
 loaded.project.animation.keys.shift();
 const retimed=restoreHandoff(loaded.project,{},loaded.handoff);
 assert.equal(retimed.drawingSlots.length,110);assert.equal(retimed.clip.slots.filter(s=>s.active).length,109);
 const again=config.parseConfigDocument(config.exportConfig(retimed.project,retimed));
 assert.deepEqual(again.handoff.slots.map(s=>s.id),loaded.handoff.slots.map(s=>s.id));
});
test('invalid metadata is rejected before returning a candidate project',()=>{
 const {project,takes,clip}=fixture(),text=config.exportConfig(project,{clip,takes});
 const cases=[
  h=>h.version=2,h=>h.extra=true,h=>h.slots.push(h.slots[0]),h=>h.slots[0].extra=1,
  h=>h.exposures[0].startFrame=1,h=>h.exposures[0].slotId='dunknown',h=>h.exposures.pop(),
  h=>h.totalFrames=2881,h=>h.speech=[],h=>h.speech[0].phones[0].end=-1,
  h=>h.speech[0].phones[0].extra=1,h=>h.source='{}',h=>h.slots[0].key='{}',
  h=>h.slots[0].key='{"__proto__":{}}',h=>h.source='x'.repeat(5_000_001),
 ];
 for(const change of cases){const data=JSON.parse(text);change(data.handoff);assert.throws(()=>config.parseConfigDocument(JSON.stringify(data)));}
 assert.throws(()=>config.parseConfigDocument(text.replace('"handoff": {','"handoff": null, "discarded": {')));
});
test('export rejects a stale clip rather than binding current settings to old exposures',()=>{
 const project=newProject();project.lines=[];project.animation={mode:'silent',duration:1,drawings:3,keys:[]};
 const clip=compileClip(project);project.animation.duration=3;
 assert.throws(()=>config.exportConfig(project,{clip}),/compile|current|stale/);
});
test('a syntactically valid exposure swap cannot override the saved scene timing',()=>{
 const {project,takes,clip}=fixture(),loaded=load(project,takes,clip);
 loaded.handoff.exposures[0].slotId=loaded.handoff.slots[1].id;
 assert.throws(()=>restoreHandoff(loaded.project,loaded.takes,loaded.handoff),/timeline|timing|exposure/);
});
test('encoded source still rejects wrong boolean types and unknown source fields',()=>{
 const {project,takes,clip}=fixture(),text=config.exportConfig(project,{clip,takes});
 for(const change of [s=>s.dialogue[0].blink=1,s=>s.extra=1]){
  const data=JSON.parse(text),source=JSON.parse(data.handoff.source);change(source);
  data.handoff.source=JSON.stringify(source);
  assert.throws(()=>config.parseConfigDocument(JSON.stringify(data)));
 }
});
test('speech handoff requires phoneme timing so every later compile stays identical',()=>{
 const {project,clip}=fixture();
 assert.throws(()=>config.exportConfig(project,{clip}),/speech.*timing|takes/);
 assert.doesNotThrow(()=>config.exportConfig(project));
});
test('precise full-rig keys and their handoff fit the complete document budget',()=>{
 const project=newProject();project.lines=[];project.audioMode='silent';
 const values=Object.fromEntries(Object.entries(ACTOR_CHANNELS).map(([key,d])=>[key,d.min+(d.max-d.min)*.3141592653589793]));
 project.animation={mode:'silent',duration:.5,drawings:3,keys:Array.from({length:1000},(_,i)=>({id:`key-${i}`,target:'actor:0',time:i/2000,transition:'hold',values}))};
 const clip=compileClip(project),text=config.exportConfig(project,{clip}),loaded=config.parseConfigDocument(text);
 assert.ok(new TextEncoder().encode(text).length<5_000_000);assert.equal(loaded.project.animation.keys.length,1000);
 const restored=restoreHandoff(loaded.project,{},loaded.handoff);assert.deepEqual(restored.clip.exposures,clip.exposures);
});
