import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject,validateProject,compileClip,slotAt,withFraming} from '../app/src/core.mjs';
import {packProject,unpackProject} from '../app/src/archive.mjs';
import {ACTOR_CHANNELS,PROP_CHANNELS,MOTION_PRESETS,animationSettings,targetValues,applyMotion,addGesture} from '../app/src/motion.mjs';

const silent=()=>({...newProject(),animation:{mode:'silent',duration:3,drawings:3,keys:[]}});
const key=(id,time,values,transition='ease',target='actor:0')=>({id,time,values,transition,target});
const prop=()=>({id:'book-1',kind:'book',x:0,y:1,z:0,rx:0,ry:0,rz:0,width:.3,height:.4,depth:.05,color:'#884422',attachment:'world'});
test('silent timeline uses explicit duration without speech takes or dialogue',()=>{
 const p=silent();p.lines=[];const c=compileClip(p,{});assert.equal(c.duration,3);assert.equal(c.totalFrames,72);assert.deepEqual(c.lines,[]);assert.equal(c.slots.filter(s=>s.active).length,1);
});
test('speech timing never truncates and animation can extend the timeline',()=>{
 const p=newProject();p.lines=[{...p.lines[0],id:'a',pause:0}];p.animation={mode:'speech',duration:0,drawings:3,keys:[]};
 const takes={a:{duration:2,phones:[{phone:'aa',start:0,end:2}]}};
 const c=compileClip(p,takes);assert.ok(c.duration>=2.8);assert.equal(slotAt(c,1).state.mouths[0],'open');
 p.animation.duration=5;assert.equal(compileClip(p,takes).duration,5);
 p.animation.keys=[key('late',6,{headYaw:30})];assert.ok(compileClip(p,takes).duration>=6);
 for(const duration of [NaN,Infinity,-1,121])assert.throws(()=>compileClip(p,{a:{...takes.a,duration}}),/speech|duration/i);
});
test('eased animation uses a bounded drawing set and preserves speech mouths',()=>{
 const p=silent();p.animation.keys=[key('a',0,{headYaw:0}),key('b',2,{headYaw:60})];
 const c=compileClip(p,{}),angles=new Set(c.slots.filter(s=>s.active).map(s=>s.state.scene.actors[0].headYaw));
 assert.deepEqual([...angles],[0,30,60]);assert.equal(c.slots.filter(s=>s.active).length,3);assert.equal(slotAt(c,1).state.scene.actors[0].headYaw,30);
 p.overrides=[{actor:0,start:.8,end:1.2,mouth:'round'}];assert.equal(slotAt(compileClip(p,{}),1).state.mouths[0],'round');
});
test('hold waits for the destination; auto wipes only large rapid changes for one frame',()=>{
 const p=silent();p.animation.keys=[key('a',0,{headYaw:0}),key('b',1,{headYaw:60},'hold')];
 let c=compileClip(p,{});assert.equal(slotAt(c,.95).state.scene.actors[0].headYaw,0);assert.equal(slotAt(c,1.05).state.scene.actors[0].headYaw,60);
 p.animation.keys=[key('a',0,{headYaw:0}),key('b',.2,{headYaw:60},'auto')];c=compileClip(p,{});
 const wipes=c.exposures.filter(e=>c.slots.find(s=>s.id===e.slotId).state.motionWipes);assert.equal(wipes.reduce((sum,e)=>sum+e.endFrame-e.startFrame,0),1);
 assert.equal(c.slots.find(s=>s.id===wipes[0].slotId).state.scene.actors[0].headYaw,30);
 for(const [angle,time,transition] of [[0,.2,'wipe'],[5,.2,'auto'],[60,2,'auto'],[60,.2,'ease']]){
  p.animation.keys=[key('a',0,{headYaw:0}),key('b',time,{headYaw:angle},transition)];assert.ok(compileClip(p,{}).slots.every(s=>!s.state.motionWipes));
 }
});
test('props and new joints animate without mutating the project and reuse IDs',()=>{
 const p=silent();p.scene.props=[prop()];p.animation.keys=[key('a',0,{y:0,elbowL:0}),key('b',2,{y:.5,elbowL:60}),key('p',2,{ry:90},'ease','prop:book-1')];
 const before=structuredClone(p),first=compileClip(p,{}),second=compileClip(p,{},first.slots);
 assert.deepEqual(p,before);assert.deepEqual(second.exposures,first.exposures);assert.equal(slotAt(first,2.5).state.scene.props[0].ry,90);
 assert.equal(slotAt(first,2.5).state.scene.actors[0].elbowL,60);
 p.scene.props[0].color='#000000';const revised=compileClip(p,{},first.slots);assert.ok(revised.slots.filter(s=>s.active).every(s=>!first.slots.some(old=>old.id===s.id)));
});
test('animation, props and saved wipe endpoints survive backups and reject invalid inputs',async()=>{
 const p=silent();p.scene.props=[prop()];p.animation.keys=[key('a',0,{headYaw:0}),key('b',.2,{headYaw:60},'auto')];p.slots=compileClip(p,{}).slots;
 const restored=(await unpackProject(await packProject({project:p}))).project;assert.equal(restored.animation.keys[1].values.headYaw,60);assert.doesNotThrow(()=>validateProject(restored));
 for(const edit of [q=>q.animation.duration=0,q=>q.animation.duration=Infinity,q=>q.animation.drawings=4,q=>q.animation.keys[0].target='actor:8',q=>q.animation.keys[0].values.evil=1,q=>q.animation.keys[0].time=-1,q=>q.animation.keys.push({...q.animation.keys[0]}),q=>q.scene.props[0].attachment='actor:9:left',q=>q.scene.props[0].width=0,q=>q.scene.props[0].id='<script>',q=>q.scene.actors[0].elbowL=Infinity]){
  const q=structuredClone(p);edit(q);assert.throws(()=>validateProject(q));
 }
 const q=structuredClone(p),s=q.slots.find(s=>s.state.motionWipes);s.state.motionWipes[0].to.headYaw=Infinity;s.key=JSON.stringify(s.state);assert.throws(()=>validateProject(q),/wipe/i);
 // History keeps its own props after a prop is removed from the live scene.
 p.scene.props=[];assert.doesNotThrow(()=>validateProject(p));
});
test('new staging faces inward in perspective while old projects retain saved actors',()=>{
 const p=newProject();assert.equal(p.scene.camera.projection,'perspective');assert.deepEqual(p.scene.actors.map(a=>[a.x,a.yaw]),[[-.45,60],[.45,-60]]);
 const old=structuredClone(p);old.scene.camera.projection='orthographic';old.scene.actors[0].yaw=40;assert.equal(validateProject(old).scene.actors[0].yaw,40);
 assert.deepEqual(withFraming(old,'duet').scene.actors.map(a=>[a.x,a.yaw]),[[-.45,60],[.45,-60]]);
 assert.equal(withFraming(old,'ots-left').scene.camera.projection,'perspective');
});
test('presets author finite anticipated actions, settle to rest, and leave originals untouched',()=>{
 const p=silent(),before=structuredClone(p);assert.equal(targetValues(p.scene,'actor:0').headPitch,0);
 assert.equal(ACTOR_CHANNELS.elbowR.default,0);assert.equal(PROP_CHANNELS.depth.min,.005);assert.equal(animationSettings(newProject()).mode,'speech');
 for(const name of ['nod','look-book','explain','shrug','point','wave']){
  const next=addGesture(p,'actor:0',name,.5);assert.doesNotThrow(()=>validateProject(next));assert.ok(next.animation.keys.length>=4);assert.equal(p.animation.keys.length,0);
  const c=compileClip(next,{});assert.ok(c.slots.filter(s=>s.active).length>2);
  const final=slotAt(c,2.8).state.scene.actors[0];assert.equal(final.headPitch??0,0);assert.equal(final.armR,0);
 }
 assert.deepEqual(p,before);assert.throws(()=>addGesture(p,'actor:0','wave',119),/minutes/);
});
test('drawing budgets and reverse wipes reuse exact geometry independent of key order',()=>{
 for(const drawings of [3,5,9]){
  const p=silent();p.animation.drawings=drawings;p.animation.keys=[key('b',2,{headYaw:60}),key('a',0,{headYaw:0})];
  assert.equal(compileClip(p,{}).slots.filter(s=>s.active).length,drawings);
 }
 const p=silent();p.animation.keys=[key('a',0,{headYaw:0}),key('b',.2,{headYaw:60},'wipe'),key('c',.4,{headYaw:0},'wipe')];
 const c=compileClip(p,{});assert.equal(c.slots.filter(s=>s.active&&s.state.motionWipes).length,1);
 const state={scene:structuredClone(p.scene),mouths:['round','rest'],blinks:[true,false]},before=structuredClone(p);applyMotion(state,p,.1,24);assert.deepEqual(state.mouths,['round','rest']);assert.deepEqual(state.blinks,[true,false]);assert.deepEqual(p,before);
});
test('a last hold key is visible even when it extends the requested duration',()=>{
 const p=silent();p.animation.duration=1;p.animation.keys=[key('last',2,{headYaw:60},'hold')];const c=compileClip(p,{});
 assert.equal(slotAt(c,c.duration).state.scene.actors[0].headYaw,60);
});
test('a last hold key after the final frame midpoint gets a destination frame',()=>{
 const p=silent();p.animation.duration=1;p.animation.keys=[key('last',2.04,{headYaw:60},'hold')];const c=compileClip(p,{});
 assert.equal(slotAt(c,c.duration).state.scene.actors[0].headYaw,60);
 assert.equal(c.totalFrames,50);
 p.animation.keys[0].time=120;const capped=compileClip(p,{});assert.equal(capped.duration,120);assert.equal(slotAt(capped,120).state.scene.actors[0].headYaw,60);
});
test('a subframe fast change still exposes exactly one wipe drawing',()=>{
 const p=silent();p.animation.keys=[key('first',0,{headYaw:0}),key('fast',.01,{headYaw:60},'auto')];
 const c=compileClip(p,{});assert.equal(c.exposures.filter(e=>c.slots.find(s=>s.id===e.slotId).state.motionWipes).reduce((n,e)=>n+e.endFrame-e.startFrame,0),1);
});
test('a key just before the two-minute limit remains visible on the capped last frame',()=>{
 const p=silent();p.animation.keys=[key('last',119.99,{headYaw:60},'hold')];const c=compileClip(p,{});
 assert.equal(c.duration,120);assert.equal(slotAt(c,120).state.scene.actors[0].headYaw,60);
});
test('gesture rest reuses the imported drawing without materializing optional zero channels',()=>{
 const p=silent(),before=compileClip(p,{}),rest=before.slots.find(s=>s.active);
 const next=addGesture(p,'actor:0','nod',.5),animated=compileClip(next,{},before.slots);
 assert.equal(slotAt(animated,0).id,rest.id);assert.equal(slotAt(animated,2.5).id,rest.id);
 assert.equal(Object.hasOwn(slotAt(animated,2.5).state.scene.actors[0],'headPitch'),false);
 // Explicit old fields and explicit optional zeros are part of their saved identity.
 p.scene.actors[0].headPitch=0;const explicit=compileClip(p,{}),withAction=compileClip(addGesture(p,'actor:0','nod',.5),{},explicit.slots);
 assert.equal(slotAt(withAction,2.5).id,slotAt(explicit,0).id);
 assert.equal(Object.hasOwn(slotAt(withAction,2.5).state.scene.actors[0],'headYaw'),true);
});
test('an excessive drawing library is rejected without modifying the saved registry',()=>{
 const p=silent(),previous=compileClip(p,{}).slots,saved=structuredClone(previous);
 p.animation.duration=120;p.animation.drawings=9;
 p.animation.keys=Array.from({length:360},(_,i)=>key(`move-${i}`,i/3,{x:-2+i/100,headYaw:i%2?60:0}));
 assert.doesNotThrow(()=>validateProject(p));assert.throws(()=>compileClip(p,{},previous),/2000.*fewer keys|fewer keys.*2000/i);
 assert.deepEqual(previous,saved);assert.deepEqual(p.slots,[]);
});
test('actor and prop circular turns cross the short arc without automatic wipes',()=>{
 const p=silent();p.scene.actors[0].yaw=179;p.scene.props=[{...prop(),rx:179,ry:179,rz:179}];
 p.animation.keys=[key('actor',.2,{yaw:-179},'auto'),key('prop',.2,{rx:-179,ry:-179,rz:-179},'auto','prop:book-1')];
 const c=compileClip(p,{});assert.ok(c.slots.every(s=>!s.state.motionWipes));
 for(const slot of c.slots.filter(s=>s.active)){
  for(const angle of [slot.state.scene.actors[0].yaw,...['rx','ry','rz'].map(k=>slot.state.scene.props[0][k])])assert.ok(Math.abs(angle)>=179&&Math.abs(angle)<=180);
 }
 assert.equal(slotAt(c,0).state.scene.actors[0].yaw,179);assert.equal(slotAt(c,1).state.scene.actors[0].yaw,-179);
 assert.doesNotThrow(()=>validateProject({...p,slots:c.slots}));
 p.animation.keys[0].transition='wipe';const explicit=compileClip(p,{}),wipe=explicit.slots.find(s=>s.state.motionWipes);
 assert.equal(Math.abs(wipe.state.scene.actors[0].yaw),180);
 assert.deepEqual(new Set([wipe.state.motionWipes[0].from.yaw,wipe.state.motionWipes[0].to.yaw]),new Set([179,-179]));
});
test('bounded head and joint channels retain linear interpolation',()=>{
 const p=silent();p.scene.actors[0].headYaw=75;p.scene.actors[0].armR=90;p.animation.keys=[key('bounded',2,{headYaw:-75,armR:-90},'ease')];
 const state={scene:structuredClone(p.scene)};applyMotion(state,p,1);assert.equal(state.scene.actors[0].headYaw,0);assert.equal(state.scene.actors[0].armR,0);
});
