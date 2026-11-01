import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject,validateProject,compileClip} from '../app/src/core.mjs';
import * as motion from '../app/src/motion.mjs';
const actions=['open','turn','hold','read','place','close','slam','throw','punch','explode','flatten','nose_off','head_spin','head_jerk','walk_away','nose_touch','high_five','handshake','dance','ascend','t_pose','ragdoll','noclip','big_head','jitter','helicopter','goose_chase'];
const gestures=['none','explain','nod','head_tilt','shrug','page_glance','cry','arm_flail','fist_shake','double_point','despair','windmill','rubber_hose','snap_pose','point','offer'];
function project(){const p=newProject();p.scene.count=2;p.lines=[];p.animation={mode:'silent',duration:.5,drawings:3,keys:[]};return p;}
test('every source action and gesture creates validated, finite editable drawings',()=>{
 for(const id of new Set([...actions,...gestures,...Object.keys(motion.MOTION_PRESETS)])){assert.ok(motion.MOTION_PRESETS[id],id);const p=motion.addGesture(project(),'actor:0',id);validateProject(p);assert.ok(p.animation.keys.length>=2,id);const c=compileClip(p,{});const drawings=c.slots.filter(s=>s.active);assert.ok(drawings.length<=100,`${id} exceeds reference limit`);assert.ok(drawings.length>=(id==='none'?1:3),`${id} must generate distinct motion drawings`);assert.ok(motion.MOTION_PRESETS[id].group,id);}
});
test('controlled walk travels requested distance, cycles opposite arms and legs, settles and preserves caller',()=>{
 assert.equal(typeof motion.addWalk,'function');const p=project(),original=JSON.stringify(p);const q=motion.addWalk(p,'actor:0',0,{steps:4,stride:.3,cadence:2,direction:90});validateProject(q);assert.equal(JSON.stringify(p),original);const keys=q.animation.keys,last=keys.at(-1).values;assert.ok(Math.abs(last.x-p.scene.actors[0].x-1.2)<1e-5);assert.equal(last.thighL,0);assert.equal(last.kneeL,0);assert.ok(keys.some(k=>k.values.thighL*k.values.thighR<0));assert.ok(keys.some(k=>k.values.armL*k.values.thighL<0));const inPlace=motion.addWalk(p,'actor:0',0,{steps:4,stride:.3,cadence:2,direction:0,inPlace:true});assert.equal(inPlace.animation.keys.at(-1).values.z,p.scene.actors[0].z);assert.throws(()=>motion.addWalk(p,'actor:0',119,{steps:4}));assert.equal(JSON.stringify(p),original);
});
test('book and partner actions key their real objects; invalid prerequisites are atomic',()=>{
 const p=project(),before=JSON.stringify(p);const book=motion.addGesture(p,'actor:0','open');assert.ok(book.scene.props.some(p=>p.kind==='book'));assert.ok(book.animation.keys.some(k=>k.target.startsWith('prop:')&&k.values.open===1));const pair=motion.addGesture(p,'actor:0','handshake');assert.ok(pair.animation.keys.some(k=>k.target==='actor:1'&&k.values.contact>0));p.scene.count=1;assert.throws(()=>motion.addGesture(p,'actor:0','punch'),/partner|character/i);p.scene.count=2;assert.equal(JSON.stringify(p),before);
});
test('action duration and strength are bounded and defaults are optional for old projects',()=>{
 const p=project();validateProject(p);const q=motion.addGesture(p,'actor:0','shrug',1,{duration:3,strength:1.5});assert.equal(q.animation.keys.at(-1).time,4);for(const bad of [0,-1,NaN,Infinity])assert.throws(()=>motion.addGesture(p,'actor:0','nod',0,{duration:bad}));const invalid=structuredClone(p);invalid.scene.actors[0].headScale=NaN;assert.throws(()=>validateProject(invalid));
});

test('short Walk away retimes safely, in-place walking reuses phases and fast gestures expose wipes',()=>{
 for(const duration of [.2,.8,12]){const p=motion.addGesture(project(),'actor:0','walk_away',0,{duration});assert.equal(p.animation.keys.at(-1).time,duration);validateProject(p);}
 const p=motion.addWalk(project(),'actor:0',0,{inPlace:true});assert.ok(compileClip(p,{}).slots.filter(s=>s.active).length<=14);
 const fast=motion.addGesture(project(),'actor:0','point',0,{duration:.3});assert.ok(compileClip(fast,{}).slots.some(s=>s.state.motionWipes));
});

test('new actions release only the contact solvers that would override their authored limbs',()=>{
 const open=motion.addGesture(project(),'actor:0','open');
 const explain=motion.addGesture(open,'actor:0','explain',1.6);const keys=explain.animation.keys.filter(k=>k.target==='actor:0'&&k.time>=1.6);assert.ok(keys.every(k=>k.values.contact===0&&k.values.noseGrip===0));assert.ok(keys.some(k=>k.values.contactLeft===1));
 const read=motion.addGesture(project(),'actor:0','read'),point=motion.addGesture(read,'actor:0','point',1.6);assert.ok(point.animation.keys.filter(k=>k.target==='actor:0'&&k.time>=1.6).every(k=>k.values.contact===0));
 const walk=motion.addWalk(project(),'actor:0'),dance=motion.addGesture(walk,'actor:0','dance',.5);assert.ok(dance.animation.keys.filter(k=>k.target==='actor:0'&&k.time>=.5).every(k=>k.values.footIK===0));
 const nod=motion.addGesture(open,'actor:0','nod',1.6);assert.ok(nod.animation.keys.filter(k=>k.target==='actor:0'&&k.time>=1.6).every(k=>k.values.contact===1));
});

test('book actions preserve attached prop history and reject release atomically',()=>{
 const p=project();p.scene.props=[{id:'held',kind:'book',color:'#ffffff',attachment:'actor:0:right',x:.1,y:.1,z:.05,rx:0,ry:0,rz:0,width:.3,height:.4,depth:.05}];p.animation.keys=[{id:'prior',target:'prop:held',time:.5,transition:'ease',values:{y:.2}}];const before=JSON.stringify(p);
 for(const action of ['open','turn','hold','read','close','slam']){const q=motion.addGesture(p,'actor:0',action,2);assert.deepEqual(q.scene.props,p.scene.props);assert.deepEqual(q.animation.keys.find(k=>k.id==='prior'),p.animation.keys[0]);for(const t of [0,.5,1]){const a={scene:structuredClone(p.scene)},b={scene:structuredClone(q.scene)};motion.applyMotion(a,p,t);motion.applyMotion(b,q,t);assert.deepEqual(b.scene.props,a.scene.props);}}
 for(const action of ['place','throw'])assert.throws(()=>motion.addGesture(p,'actor:0',action,2),/World/);assert.equal(JSON.stringify(p),before);
});

// A full flail must expose every alternating extreme and its in-betweens.
test('arm flail covers both arm extremes, intermediate poses and the return to rest at every drawing quality',()=>{
 for(const quality of [3,5,9]){
  const p=project();p.animation.drawings=quality;const next=motion.addGesture(p,'actor:0','arm_flail');
  const clip=compileClip(next,{}),poses=clip.slots.filter(s=>s.active).map(s=>s.state.scene.actors[0]);
  for(const [left,right] of [[0,0],[150,-50],[-55,145],[120,30],[-40,130]])assert.ok(poses.some(a=>a.armL===left&&a.armR===right),`quality ${quality} omits flail extreme ${left}/${right}`);
  assert.ok(poses.some(a=>a.armL>0&&a.armL<150&&a.armR<0&&a.armR>-50),'the first swing needs an automatically generated in-between');
  const last=clip.slots.find(s=>s.id===clip.exposures.at(-1).slotId).state.scene.actors[0];assert.equal(last.armL,0);assert.equal(last.armR,0);
  let end=0;for(const exposure of clip.exposures){assert.equal(exposure.startFrame,end);assert.ok(exposure.endFrame>end);end=exposure.endFrame;}assert.equal(end,clip.totalFrames);
 }
});
