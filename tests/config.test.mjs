import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {newProject,validateProject,compileClip,slotAt} from '../app/src/core.mjs';
import {parseConfig,exportConfig} from '../app/src/config.mjs';
import {ACTOR_CHANNELS} from '../app/src/motion.mjs';
const recipe=(fields={})=>JSON.stringify({format:'goosnav-animation-config',version:1,...fields});

test('partial recipes become fresh projects without inherited demo dialogue',()=>{
 const p=parseConfig(recipe({title:'One actor',scene:{actors:[{model:'billy-v2',x:0}]},timing:{mode:'silent',duration:2}}));
 assert.equal(p.title,'One actor');assert.equal(p.scene.count,1);assert.equal(p.scene.actors.length,2);assert.equal(p.scene.actors[0].model,'billy-v2');
 assert.deepEqual(p.lines,[]);assert.equal(p.audioMode,'silent');assert.equal(compileClip(p).duration,2);assert.equal(validateProject(p),p);
 assert.notEqual(parseConfig(recipe()).id,parseConfig(recipe()).id);
});
test('speech recipe expands timed gestures and preserves dialogue expression and seated setup',()=>{
 const p=parseConfig(recipe({scene:{actors:[{pose:'sitting',chair:'wood',emotion:'happy'},{}]},dialogue:[{actor:0,text:'Hello!',emotion:'surprised',blink:true}],actions:[{actor:0,action:'arm_flail',time:1,duration:2,strength:1}]}));
 assert.equal(p.lines.length,1);assert.equal(p.lines[0].emotion,'surprised');assert.equal(p.lines[0].rate,1);assert.equal(p.scene.actors[0].chair,'wood');
 assert.equal(p.animation.keys[0].time,1);assert.equal(p.animation.keys.at(-1).time,3);assert.equal(p.animation.keys[1].values.armL,150);
 const take={duration:.5,phones:[{phone:'aa',start:0,end:.5}]};assert.ok(compileClip(p,{[p.lines[0].id]:take}).duration>=3);
});
test('walk options generate travel and extend silent duration',()=>{
 const p=parseConfig(recipe({scene:{actors:[{x:0,yaw:0}]},timing:{mode:'silent',duration:1},actions:[{actor:0,action:'walk',time:0,options:{steps:2,stride:.25,cadence:2,direction:90}}]}));
 assert.equal(p.animation.duration,1.3);assert.equal(p.animation.keys.at(-1).values.x,.5);
 assert.equal(slotAt(compileClip(p),1.3).state.scene.actors[0].x,.5);
});
test('export round trip preserves setup and exact keys without media or duplicate actions',()=>{
 const p=parseConfig(recipe({title:'All settings',fps:24,rate:1.25,scene:{format:'landscape',backdrop:'space',camera:{zoom:1.2},actors:[{emotion:'sad',pose:'sitting',chair:'stool'},{}],props:[{id:'book-1',kind:'book',color:'#ffeeaa'}]},dialogue:[{actor:0,text:'A line',rate:.8,pause:1.2,pose:'point',headYaw:12,blink:true,smear:true,emotion:'angry'}],timing:{mode:'speech',duration:4,drawings:9},keys:[{id:'key-1',target:'actor:0',time:1,transition:'hold',values:{armR:70}},{id:'key-2',target:'prop:book-1',time:2,transition:'ease',values:{open:1}}],guides:{ground:true,backdrop:false},overrides:[{actor:0,start:1,end:2,mouth:'round'}],audio:{mode:'silent',offset:.4,trimStart:.2,trimEnd:.3}}));
 const before=structuredClone(p),json=exportConfig(p),data=JSON.parse(json),q=parseConfig(json);
 assert.deepEqual(p,before);assert.equal(data.actions,undefined);assert.equal(data.slots,undefined);assert.equal(data.id,undefined);assert.notEqual(q.id,p.id);
 for(const name of ['scene','animation','guides','overrides','fps','rate','title','audioMode','audioOffset','audioTrimStart','audioTrimEnd'])assert.deepEqual(q[name],p[name],name);
 assert.deepEqual(q.lines.map(({id,...l})=>l),p.lines.map(({id,...l})=>l));assert.notEqual(q.lines[0].id,p.lines[0].id);
});
test('recording mode is portable without a missing audio asset',()=>{
 const p=newProject();p.audioMode='recording';const q=parseConfig(exportConfig(p));assert.equal(q.audioMode,'robot');
 p.animation={mode:'silent',duration:2,drawings:3,keys:[]};assert.equal(parseConfig(exportConfig(p)).audioMode,'silent');
});
test('rejects unknown fields and wrong shapes at every public boundary',()=>{
 for(const fields of [
  {unknown:true},{scene:{typo:1}},{scene:{camera:{z:1}}},{scene:{actors:[{oops:0}]}},{scene:{actors:[null]}},{scene:{actors:[]}},
  {scene:{props:[{kind:'cube',typo:1}]}},{dialogue:[{actor:0,text:'Hi',surprise:1}]},{dialogue:[{actor:0,text:'Hi',blink:1}]},
  {timing:{speed:2}},{timing:{mode:'silent',duration:0}},{audio:{mode:'music'}},{audio:{gain:1}},{guides:{floor:true}},
  {overrides:[{actor:0,start:0,end:1,mouth:'rest',typo:1}]},{keys:[{id:'a',target:'actor:0',time:0,transition:'hold',values:{oops:1}}]},
  {scene:{actors:[{emotion:'furious'}]}},{scene:{actors:[{chair:'sofa'}]}},{dialogue:[{actor:0,text:'Hi',emotion:'furious'}]},
  {title:1},{fps:25},{rate:'1'},{dialogue:'Hi'},{scene:null},{actions:null},{audio:null},
 ])assert.throws(()=>parseConfig(recipe(fields)),undefined,JSON.stringify(fields));
});
test('rejects hidden targets and malformed or ambiguous actions before accepting a project',()=>{
 for(const fields of [
  {scene:{count:1},dialogue:[{actor:1,text:'Hidden'}]},
  {scene:{count:1},overrides:[{actor:1,start:0,end:1,mouth:'rest'}]},
  {scene:{count:1,props:[{kind:'cube',attachment:'actor:1:left'}]}},
  {scene:{count:1},actions:[{actor:1,action:'nod'}]},
  {actions:[{actor:0,action:'constructor'}]},{actions:[{actor:0,action:'nod',time:119,duration:2}]},
  {actions:[{actor:0,action:'nod',strength:0}]},{actions:[{actor:0,action:'nod',options:{steps:2}}]},
  {actions:[{actor:0,action:'walk',duration:2}]},{actions:[{actor:0,action:'walk',options:{steps:2.5}}]},
  {actions:[{actor:0,action:'handshake',options:{partner:0}}]},
  {scene:{count:1},actions:[{actor:0,action:'handshake'}]},
  {actions:[],keys:[]},
 ])assert.throws(()=>parseConfig(recipe(fields)),undefined,JSON.stringify(fields));
});
test('rejects malicious, oversized, deeply nested and unsupported documents',()=>{
 for(const text of ['{','null','[]',recipe({version:2}),recipe({format:'other'}),' {"format":"goosnav-animation-config","version":1,"__proto__":{}}',recipe({scene:{actors:[{constructor:{}}]}}),recipe({title:'x'.repeat(2_100_000)}),'['.repeat(30)+'0'+']'.repeat(30)])assert.throws(()=>parseConfig(text));
 assert.throws(()=>parseConfig({}));assert.throws(()=>parseConfig(recipe({dialogue:Array.from({length:31},()=>({actor:0,text:'Hi'}))})));
});
test('shipped scene examples parse and their silent animation compiles',async()=>{
 for(const file of ['speech-scene.json','silent-scene.json']){
  const p=parseConfig(await readFile(new URL(`../examples/${file}`,import.meta.url),'utf8'));assert.equal(validateProject(p),p);
  if(p.animation.mode==='silent')assert.ok(compileClip(p).totalFrames>0);
 }
});
test('explicit null dialogue numbers are rejected instead of silently defaulted',()=>{
 assert.throws(()=>parseConfig(recipe({dialogue:[{actor:0,text:'Hi',headYaw:null}]})),/headYaw|head turn/);
});
test('solo exports retain dormant second-actor keys, attachments and mouth edits',()=>{
 const p=newProject();p.scene.count=1;p.lines=[p.lines[0]];
 p.animation={mode:'silent',duration:2,drawings:3,keys:[{id:'hidden-key',target:'actor:1',time:1,transition:'ease',values:{headYaw:20}}]};
 p.scene.props=[{id:'held-book',kind:'book',color:'#aabbcc',attachment:'actor:1:right',x:0,y:0,z:0,rx:0,ry:0,rz:0,width:.3,height:.4,depth:.05}];
 p.overrides=[{actor:1,start:0,end:1,mouth:'round'}];
 const q=parseConfig(exportConfig(p));
 assert.deepEqual(q.animation.keys,p.animation.keys);assert.deepEqual(q.scene,p.scene);assert.deepEqual(q.overrides,p.overrides);
 assert.equal(q.scene.count,1);assert.ok(compileClip(q).totalFrames>0);
 assert.throws(()=>parseConfig(recipe({scene:{count:1},keys:[],dialogue:[{actor:1,text:'Still hidden'}]})));
});
test('export supports the full valid key budget even with precise full-rig values',()=>{
 const p=newProject(),values=Object.fromEntries(Object.entries(ACTOR_CHANNELS).map(([key,d])=>[key,d.min+(d.max-d.min)*.3141592653589793]));
 p.animation={mode:'silent',duration:120,drawings:3,keys:Array.from({length:1000},(_,i)=>({id:`key-${i}`,target:'actor:0',time:i/10,transition:'hold',values}))};
 const q=parseConfig(exportConfig(p));assert.equal(q.animation.keys.length,1000);assert.deepEqual(q.animation.keys[999],p.animation.keys[999]);
 assert.throws(()=>parseConfig(' '.repeat(5_000_001)+recipe()),/exceeds/);
});

test('config frame rates match the app instead of silently changing on restore',()=>{
 for(const fps of [6,8,12])assert.throws(()=>parseConfig(recipe({fps})),/24/);
});
