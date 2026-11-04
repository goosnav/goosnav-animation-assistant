import test from 'node:test';
import assert from 'node:assert/strict';
import {parseConfigDocument} from '../app/src/config.mjs';
import {restoreHandoff} from '../app/src/handoff.mjs';

const config=duration=>({format:'goosnav-animation-config',version:1,timing:{mode:'silent',duration}});
const recipe=()=>({format:'goosnav-animation-sequence',version:1,id:'film',title:'Three cuts',shots:[
 {id:'a',title:'A close',config:config(.5)}, {id:'wide',title:'Together',config:config(.75)}, {id:'b',title:'B close',config:config(1)},
]});
function prepared(duration=.5){const {project}=parseConfigDocument(JSON.stringify(config(duration)));return {...restoreHandoff(project),art:{}};}
const sequenceConfig=await import('../app/src/sequence-config.mjs');
const engine=await import('../app/src/sequence.mjs');

test('sequence parser validates all shots before returning an editable document',()=>{
 assert.equal(typeof sequenceConfig.parseSequenceDocument,'function','sequence parser is available');
 const parsed=sequenceConfig.parseSequenceDocument(JSON.stringify(recipe()));
 assert.equal(parsed.id,'film');assert.equal(parsed.title,'Three cuts');assert.equal(parsed.handoff,null);
 assert.deepEqual(parsed.shots.map(s=>[s.id,s.title,s.project.animation.duration]),[['a','A close',.5],['wide','Together',.75],['b','B close',1]]);
 assert.deepEqual(parsed.shots[0].config,config(.5));
 const noId=recipe();delete noId.id;assert.match(sequenceConfig.parseSequenceDocument(JSON.stringify(noId)).id,/^[a-z0-9-]+$/);
});

test('malformed sequence and nested scene fields fail without silently repairing identity or format',()=>{
 assert.equal(typeof sequenceConfig.parseSequenceDocument,'function');
 const mutations=[d=>d.version=2,d=>d.extra=true,d=>d.shots=[],d=>d.shots[1].id='a',d=>d.shots[0].extra=1,d=>d.shots[0].id='bad/id',d=>d.shots[0].config.extra=true,d=>d.shots[0].config.fps=12,
  d=>d.shots[1].config.scene={format:'landscape'},d=>d.shots=Array.from({length:21},(_,i)=>({...d.shots[0],id:`s-${i}`})),
  d=>d.shots=Array.from({length:6},(_,i)=>({...d.shots[0],id:`s-${i}`,config:config(120)})),d=>d.handoff=null,
  d=>d.title='x'.repeat(201),d=>d.id=null,d=>d.title=null];
 for(const mutate of mutations){const value=recipe();mutate(value);assert.throws(()=>sequenceConfig.parseSequenceDocument(JSON.stringify(value)));}
 assert.throws(()=>sequenceConfig.parseSequenceDocument('{bad'),/JSON/);
 assert.throws(()=>sequenceConfig.parseSequenceDocument(' '.repeat(5_000_001)),/5 MB/);
 assert.throws(()=>sequenceConfig.parseSequenceDocument(JSON.stringify(recipe()).replace('"title":"Three cuts"','"__proto__":{},"title":"Three cuts"')),/reserved/);
});

test('assembly keeps identical local drawing identities distinct and concatenates exclusive frame ranges',()=>{
 assert.equal(typeof engine.assembleSequence,'function','sequence engine is available');
 const scene=prepared(),seq=engine.assembleSequence({id:'film',title:'Cuts',shots:[{id:'a',title:'A',scene},{id:'b',title:'B',scene}]});
 assert.equal(seq.kind,'sequence');assert.equal(seq.totalFrames,24);assert.equal(seq.duration,1);
 assert.deepEqual(seq.shots.map(s=>[s.startFrame,s.endFrame]),[[0,12],[12,24]]);
 assert.deepEqual(seq.exposures.map(e=>[e.shotId,e.startFrame,e.endFrame]),[['a',0,12],['b',12,24]]);
 assert.equal(seq.drawingSlots.length,2);assert.notEqual(seq.drawingSlots[0].id,seq.drawingSlots[1].id);
 assert.equal(seq.drawingSlots[0].slotId,seq.drawingSlots[1].slotId);
});

test('JSON roundtrip and shot reorder preserve the original global returned drawing assignments',async()=>{
 assert.equal(typeof engine.prepareSequence,'function');
 const original=await engine.prepareSequence(JSON.stringify(recipe())),data=JSON.parse(engine.sequenceJSON(original));
 const ids=original.drawingSlots.map(s=>s.id);data.shots.reverse();
 const reordered=await engine.prepareSequence(JSON.stringify(data));
 assert.deepEqual(reordered.drawingSlots.map(s=>s.id),ids);
 assert.deepEqual(reordered.shots.map(s=>s.id),['b','wide','a']);
 assert.deepEqual(reordered.shots.map(s=>[s.startFrame,s.endFrame]),[[0,24],[24,42],[42,54]]);
 assert.equal(reordered.exposures[0].slotId,ids[2]);
 assert.deepEqual(JSON.parse(engine.sequenceJSON(reordered)).handoff,data.handoff);
});

test('unknown removed and changed drawing identities cannot consume the old carrier',async()=>{
 assert.equal(typeof engine.prepareSequence,'function');
 const original=await engine.prepareSequence(JSON.stringify(recipe()));
 assert.throws(()=>engine.assembleSequence({...original,shots:original.shots.slice(1)}),{code:'HANDOFF_DRAWINGS_CHANGED'});
 const changed=await engine.prepareSequence(JSON.stringify({...recipe(),shots:[...recipe().shots,{id:'new',title:'New',config:config(.5)}]}));
 assert.throws(()=>engine.assembleSequence({...changed,handoff:original.handoff}),{code:'HANDOFF_DRAWINGS_CHANGED'});
 const data=JSON.parse(engine.sequenceJSON(original));data.shots[0].config.scene.camera.azimuth=10;
 await assert.rejects(engine.prepareSequence(JSON.stringify(data)),{code:'HANDOFF_DRAWINGS_CHANGED'});
 const fresh=await engine.prepareSequence(JSON.stringify(data),{newReferences:true});assert.notDeepEqual(fresh.handoff,original.handoff);
 const allowed=await engine.prepareSequence(JSON.stringify(data),{allowNewDrawings:true});assert.equal(allowed.needsReferences,true);
});

test('explicit fresh-reference preparation accepts added or removed shots while strict artwork preparation rejects them',async()=>{
 const original=await engine.prepareSequence(JSON.stringify(recipe())),text=engine.sequenceJSON(original);
 for(const edit of [d=>d.shots.pop(),d=>d.shots.push({...structuredClone(d.shots[0]),id:'new-shot',title:'New shot'})]){
  const data=JSON.parse(text);edit(data);const edited=JSON.stringify(data);
  await assert.rejects(engine.prepareSequence(edited),{code:'HANDOFF_DRAWINGS_CHANGED'});
  assert.throws(()=>sequenceConfig.parseSequenceDocument(edited),{code:'HANDOFF_DRAWINGS_CHANGED'});
  const parsed=sequenceConfig.parseSequenceDocument(edited,{allowStaleHandoff:true});assert.equal(parsed.needsReferences,true);
  const fresh=await engine.prepareSequence(edited,{newReferences:true}),allowed=await engine.prepareSequence(edited,{allowNewDrawings:true});
  assert.equal(fresh.shots.length,data.shots.length);assert.equal(fresh.drawingSlots.length,data.shots.length);assert.equal(allowed.needsReferences,true);assert.equal(allowed.drawingSlots.length,data.shots.length);
  assert.doesNotThrow(()=>sequenceConfig.parseSequenceDocument(engine.sequenceJSON(allowed)));
 }
 for(const change of [h=>h.extra=true,h=>h.version=2,h=>h.slots[0].key='{}',h=>h.slots.push(h.slots[0])]){
  const data=JSON.parse(text);change(data.handoff);
  for(const options of [{newReferences:true},{allowNewDrawings:true}])await assert.rejects(engine.prepareSequence(JSON.stringify(data),options));
 }
});

test('global handoff rejects duplicate, missing, unknown and relabelled entries',async()=>{
 assert.equal(typeof engine.prepareSequence,'function');
 const original=await engine.prepareSequence(JSON.stringify(recipe())),text=engine.sequenceJSON(original);
 for(const mutate of [h=>h.version=2,h=>h.extra=1,h=>h.slots.push(h.slots[0]),h=>h.slots.pop(),h=>h.slots[0].shotId='unknown',h=>h.slots[0].slotId='dunknown',h=>h.slots[0].key='{}',h=>h.slots[0].id='other:dunknown']){
  const data=JSON.parse(text);mutate(data.handoff);assert.throws(()=>sequenceConfig.parseSequenceDocument(JSON.stringify(data)));
 }
});

test('backup handoff validation checks encoded states without rebinding an intentionally stale shot list',async()=>{
 assert.equal(typeof sequenceConfig.validateSequenceHandoffShape,'function');
 const original=await engine.prepareSequence(JSON.stringify(recipe())),handoff=structuredClone(original.handoff);
 assert.equal(sequenceConfig.validateSequenceHandoffShape(handoff),handoff);
 for(const mutate of [h=>h.slots[0].shotId='bad/id',h=>h.slots[0].key='{}',h=>h.slots[0].key='{"__proto__":{}}',h=>h.width=900,h=>h.slots[0].slotId='wrong',h=>h.slots[0].extra=true]){
  const value=structuredClone(handoff);mutate(value);assert.throws(()=>sequenceConfig.validateSequenceHandoffShape(value));
 }
});

test('assembly rejects stale clips, excessive frames, and missing exposure identities',()=>{
 assert.equal(typeof engine.assembleSequence,'function');
 const scene=prepared(),shots=[{id:'a',title:'A',scene}];
 assert.throws(()=>engine.assembleSequence({id:'film',title:'Film',shots:[...shots,...shots]}),/duplicate/i);
 assert.throws(()=>engine.assembleSequence({id:'film',title:'Film',shots:[]}),/shot/i);
 scene.clip.exposures[0].slotId='missing';
 assert.throws(()=>engine.assembleSequence({id:'film',title:'Film',shots}),/exposure|drawing/i);
 const large=prepared(120);assert.throws(()=>engine.assembleSequence({id:'film',title:'Film',shots:Array.from({length:6},(_,i)=>({id:`s-${i}`,title:'Long',scene:large}))}),/600/);
 const stale=prepared();stale.project.animation.duration=2;
 assert.throws(()=>engine.assembleSequence({id:'film',title:'Film',shots:[{id:'stale',title:'Stale',scene:stale}]}),/stale/);
});

test('cancelled sequence preparation does not return a partially prepared film',async()=>{
 assert.equal(typeof engine.prepareSequence,'function');
 const controller=new AbortController();controller.abort();
 await assert.rejects(engine.prepareSequence(JSON.stringify(recipe()),{signal:controller.signal}),{name:'AbortError'});
});

test('large films require PNG references and enforce the total drawing budget',async()=>{
 const scene=prepared(7);scene.project.animation.keys=Array.from({length:150},(_,i)=>({id:`key-${i}`,target:'actor:0',time:i/24,transition:'hold',values:{headYaw:i-75}}));
 const detailed={...restoreHandoff(scene.project),art:{}},shot=i=>({id:`s-${i}`,title:`Shot ${i}`,scene:detailed});
 const film=engine.assembleSequence({id:'film',title:'Many drawings',shots:[shot(0)]});assert.equal(film.drawingSlots.length,150);
 await assert.rejects(engine.renderSequenceReferences(film,{format:'mp4',emit:()=>{throw Error('must reject before output');}}),/PNG/);
 assert.throws(()=>engine.assembleSequence({id:'film',title:'Too many drawings',shots:Array.from({length:14},(_,i)=>shot(i))}),/2000/);
});
