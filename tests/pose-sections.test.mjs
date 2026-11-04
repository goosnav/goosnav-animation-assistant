import test from 'node:test';
import assert from 'node:assert/strict';
import {ACTOR_CHANNELS,PROP_CHANNELS} from '../app/src/motion.mjs';
import {ACTOR_SECTIONS,PROP_SECTIONS,resetSectionValues} from '../app/src/pose-sections.mjs';

test('a left-arm reset only replaces that arm and its contact solver',()=>{
 const project={scene:{actors:[{model:'v12',pose:'point',emotion:'happy',armL:72,armSideL:-18,elbowL:60,handL:12,fingerCurlL:.8,fingerPointL:1,contactLeft:1,contactLX:2,contactLY:3,contactLZ:-1,armR:45,contact:1,contactX:4,headYaw:32,x:1.5}],props:[{id:'book',open:.8,x:2}]},animation:{mode:'silent',duration:4,drawings:5,keys:[{id:'later',time:3,target:'actor:0',transition:'hold',values:{armR:88}}]}};
 const before=structuredClone(project);
 Object.assign(project.scene.actors[0],resetSectionValues('actor','left-arm'));
 assert.deepEqual(project.scene.actors[0],{...before.scene.actors[0],armL:0,armSideL:0,elbowL:0,handL:0,fingerCurlL:0,fingerPointL:0,contactLeft:0,contactLX:0,contactLY:0,contactLZ:0});
 assert.deepEqual(project.animation,before.animation);
 assert.deepEqual(project.scene.props,before.scene.props);
});

test('right-arm and leg resets disconnect the solvers that could override neutral joints',()=>{
 assert.deepEqual(resetSectionValues('actor','right-arm'),{armR:0,armSideR:0,elbowR:0,handR:0,fingerCurlR:0,fingerPointR:0,contact:0,contactX:0,contactY:0,contactZ:0,contactHand:0,noseGrip:0,armStretchR:1});
 assert.deepEqual(resetSectionValues('actor','legs'),{thighL:0,kneeL:0,footL:0,thighR:0,kneeR:0,footR:0,footIK:0,footForwardL:0,footForwardR:0,footLiftL:0,footLiftR:0,groundY:0});
});

test('neutral pose resets preserve unit scales and clear contact-dependent head and body offsets',()=>{
 assert.deepEqual(resetSectionValues('actor','position'),{x:0,y:0,z:0,yaw:0,scale:1,noseContact:0});
 assert.deepEqual(resetSectionValues('actor','head'),{headYaw:0,headPitch:0,headTilt:0,headSpin:0,noseContact:0});
 assert.deepEqual(resetSectionValues('actor','body'),{bodyLean:0,bodyTurn:0,rootPitch:0,rootRoll:0,noseContact:0});
 assert.deepEqual(resetSectionValues('actor','cartoon'),{headScale:1,handScale:1,armStretchR:1,flatten:0,burst:0,noseDetach:0,noseGrip:0,nose:0});
});

test('prop resets touch only the requested group, including descriptor-neutral dimensions',()=>{
 const prop={kind:'book',id:'read',attachment:'actor:0:left',color:'#123456',x:2,y:1,z:-2,rx:30,ry:40,rz:50,width:.9,height:1.2,depth:.1,open:.75,page:.4};
 const before=structuredClone(prop);Object.assign(prop,resetSectionValues('prop','dimensions'));
 assert.deepEqual(prop,{...before,width:.3,height:.4,depth:.05});
 assert.deepEqual(resetSectionValues('prop','position'),{x:0,y:0,z:0});
 assert.deepEqual(resetSectionValues('prop','rotation'),{rx:0,ry:0,rz:0});
 assert.deepEqual(resetSectionValues('prop','book'),{open:0,page:0});
});

test('shared sections cannot be mutated and reset patches are fresh numeric descriptor defaults',()=>{
 for(const [sections,kind,channels] of [[ACTOR_SECTIONS,'actor',ACTOR_CHANNELS],[PROP_SECTIONS,'prop',PROP_CHANNELS]]){
  assert.ok(Object.isFrozen(sections));
  for(const [id,section] of Object.entries(sections)){
   assert.ok(section.label);assert.ok(Object.isFrozen(section));assert.ok(Object.isFrozen(section.keys));
   assert.equal(new Set(section.keys).size,section.keys.length);
   const first=resetSectionValues(kind,id),second=resetSectionValues(kind,id);
   assert.notEqual(first,second);assert.deepEqual(Object.keys(first),section.keys);
   for(const [key,value] of Object.entries(first)){assert.equal(typeof value,'number');assert.equal(value,channels[key].default);}
   first[section.keys[0]]=999;assert.notEqual(resetSectionValues(kind,id)[section.keys[0]],999);
  }
 }
 assert.throws(()=>ACTOR_SECTIONS.head.keys.push('armR'),TypeError);
});

test('unknown kinds and section names are rejected instead of broadening a reset',()=>{
 for(const [kind,section] of [['camera','position'],['actor','rotation'],['prop','head'],['actor','all'],['actor','__proto__'],['toString','position'],['prop',null],[null,'head']])assert.throws(()=>resetSectionValues(kind,section),/Invalid.*(?:kind|section)/i);
});
