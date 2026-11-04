import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject,compileClip} from '../app/src/core.mjs';
import {resetProjectSection,applyProjectPose} from '../app/src/pose-editing.mjs';

const project=()=>({...newProject(),animation:{mode:'silent',duration:2,drawings:3,keys:[]}});
test('a section reset changes only selected offsets and keeps the held pose, other actor and timeline',()=>{
 const input=project();Object.assign(input.scene.actors[0],{pose:'sitting',armL:65,elbowL:90,armR:72,headTilt:20,contactLeft:1});
 input.animation.keys=[{id:'other',target:'actor:0',time:1,transition:'hold',values:{armL:45,headPitch:-20}}];
 const before=structuredClone(input),result=resetProjectSection(input,{target:'actor:0',section:'left-arm'});
 assert.equal(result.project.scene.actors[0].armL,0);assert.equal(result.project.scene.actors[0].contactLeft,0);
 assert.equal(result.project.scene.actors[0].headTilt,20);assert.equal(result.project.scene.actors[0].armR,72);assert.equal(result.project.scene.actors[0].pose,'sitting');
 assert.deepEqual(result.project.scene.actors[1],before.scene.actors[1]);assert.deepEqual(result.project.animation,before.animation);assert.deepEqual(input,before);
 assert.ok(result.warnings.some(message=>/key/i.test(message)),'scene reset explains that authored keys can still override it');
});
test('timeline head reset removes only head contributions and preserves the final exposure time',()=>{
 const input=project();input.scene.actors[0].headPitch=-40;input.lines[0].headYaw=45;input.lines[1].headYaw=-30;
 input.animation.keys=[{id:'mixed',target:'actor:0',time:1,transition:'ease',values:{headPitch:-35,armR:70}},{id:'last-head',target:'actor:0',time:4,transition:'hold',values:{headYaw:60}},{id:'other-person',target:'actor:1',time:1.5,transition:'hold',values:{headTilt:20}}];
 const result=resetProjectSection(input,{target:'actor:0',section:'head',scope:'timeline'}).project;
 assert.equal(result.scene.actors[0].headPitch,0);assert.equal(result.lines[0].headYaw,0);assert.equal(result.lines[1].headYaw,-30);
 assert.deepEqual(result.animation.keys.find(key=>key.id==='mixed').values,{armR:70});assert.ok(!result.animation.keys.some(key=>key.id==='last-head'));
 assert.deepEqual(result.animation.keys.find(key=>key.id==='other-person'),input.animation.keys[2]);
 assert.equal(compileClip(result,{}).totalFrames,compileClip(input,{}).totalFrames);
});
test('key reset merges just one section into the selected pose and snaps to the project frame rate',()=>{
 const input=project();input.animation.keys=[{id:'pose',target:'actor:0',time:1,transition:'ease',values:{armL:80,armR:55,headTilt:10}}];
 const result=resetProjectSection(input,{target:'actor:0',section:'left-arm',scope:'key',time:1.001}).project;
 assert.equal(result.animation.keys.length,1);const key=result.animation.keys[0];assert.equal(key.id,'pose');assert.equal(key.time,1);assert.equal(key.values.armL,0);assert.equal(key.values.armR,55);assert.equal(key.values.headTilt,10);assert.equal(key.transition,'ease');
 assert.deepEqual(result.scene,input.scene);
});
test('one-shot gaze edits can be saved as a key while unrelated controls and later motion survive',()=>{
 const input=project();input.animation.keys=[{id:'later',target:'actor:0',time:2,transition:'ease',values:{headYaw:-15,armR:65}}];
 const result=applyProjectPose(input,{scope:'key',time:0,changes:[{actor:0,values:{yaw:75,headYaw:15,headPitch:8,headTilt:0,headSpin:0,noseContact:0}}]}).project;
 assert.equal(result.animation.keys[0].time,0);assert.equal(result.animation.keys[0].values.headYaw,15);assert.deepEqual(result.animation.keys[1],input.animation.keys[0]);assert.deepEqual(result.scene,input.scene);
});
test('bad reset targets, sections, scopes and gaze values fail without mutating the project',()=>{
 const input=project(),before=structuredClone(input);
 for(const options of [{target:'actor:9',section:'head'},{target:'prop:missing',section:'position'},{target:'actor:0',section:'everything'},{target:'actor:0',section:'head',scope:'all'},{target:'actor:0',section:'head',scope:'key',time:NaN}])assert.throws(()=>resetProjectSection(input,options));
 assert.throws(()=>applyProjectPose(input,{changes:[{actor:0,values:{headYaw:300}}]}));assert.deepEqual(input,before);
});
