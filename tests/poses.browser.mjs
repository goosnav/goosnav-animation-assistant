import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {build} from 'esbuild';
const harness=(await build({stdin:{contents:"export {Stage} from './app/src/stage.mjs';export {newProject} from './app/src/core.mjs';export {Vector3} from 'three';",resolveDir:process.cwd()},bundle:true,format:'esm',write:false})).outputFiles[0].text;
async function browserScene(run){const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});try{const page=await browser.newPage();await page.route('http://localhost:19879/**',async r=>{const p=new URL(r.request().url()).pathname;return r.fulfill(p==='/harness.mjs'?{body:harness,contentType:'text/javascript'}:p.startsWith('/assets/')?{body:await fs.readFile('app'+p)}:{body:'<canvas></canvas>',contentType:'text/html'});});await page.goto('http://localhost:19879');return await run(page);}finally{await browser.close();}}

test('hands on hips places palms at the waist with elbows out, across rigs and actor transforms',async()=>{
 const results=await browserScene(page=>page.evaluate(async()=>{
  const {Stage,newProject,Vector3}=await import('/harness.mjs'),stage=new Stage(document.querySelector('canvas')),p=newProject();p.scene.count=1;const actor=p.scene.actors[0],results=[];
  try{for(const model of ['blue','v12','v12-fat','billy','billy-v2','gooby'])for(const yaw of [0,70]){
   Object.assign(actor,{model,pose:'hands-on-hips',x:1.2,z:-.7,yaw,scale:yaw?1.3:1});await stage.prepare(p.scene);stage.draw({scene:p.scene},270,480);const rig=stage.actors[0],local=name=>rig.root.worldToLocal(rig.bones[name].getWorldPosition(new Vector3()));for(const [side,sign]of [['L',1],['R',-1]]){const hip=local('hips'),shoulder=local('upper_arm'+side),wrist=local('hand'+side),elbow=local('forearm'+side);wrist.x*=sign;elbow.x*=sign;results.push({model:model+side,yaw,hip:hip.toArray(),shoulder:shoulder.toArray(),wrist:wrist.toArray(),elbow:elbow.toArray()});}
  }return results;}finally{stage.dispose();}
 }));
 for(const r of results){const size=r.shoulder[1]-r.hip[1];assert.ok(Math.abs(r.wrist[2]-r.hip[2])<size*.25,`${r.model}: hands must touch hip depth, not reach in front`);assert.ok(r.wrist[1]>r.hip[1]&&r.wrist[1]<r.hip[1]+size*.45,`${r.model}: hands must rest at waist height`);assert.ok(r.elbow[0]>r.wrist[0]+size*.1,`${r.model}: elbow must flare outward`);}
});

test('sitting fits a chair, plants feet and rests both hands on the lap for tall, wide and short characters',async()=>{
 const results=await browserScene(page=>page.evaluate(async()=>{
  const {Stage,newProject,Vector3}=await import('/harness.mjs'),stage=new Stage(document.querySelector('canvas')),p=newProject();p.scene.count=1;const a=p.scene.actors[0],results=[];
  try{for(const model of ['blue','v12-fat','billy-v2'])for(const chair of ['folding','wood','stool']){
   Object.assign(a,{model,chair,pose:'stand',x:1.2,y:.15,z:-.8,yaw:65,scale:1.2});await stage.prepare(p.scene);stage.draw({scene:p.scene},270,480);const rig=stage.actors[0],point=n=>rig.bones[n].getWorldPosition(new Vector3()),restFoot=point('footL');
   a.pose='sitting';stage.draw({scene:p.scene},270,480);const local=n=>rig.root.worldToLocal(point(n)).toArray(),seat=stage.seating?.items[0]?.root;results.push({model,chair,footDelta:point('footL').y-restFoot.y,thigh:local('thighL'),knee:local('shinL'),wrist:local('handL'),otherWrist:local('handR'),hip:point('hips').y,seat:seat?{visible:seat.visible,y:seat.position.y,top:seat.position.y+.45*seat.scale.y}:null});
   a.pose='stand';stage.draw({scene:p.scene},270,480);results.at(-1).resetFoot=point('footL').distanceTo(restFoot);results.at(-1).chairHidden=seat?!seat.visible:false;
  }return results;}finally{stage.dispose();}
 }));
 for(const r of results){assert.ok(r.seat?.visible,`${r.model}/${r.chair}: sitting must include a chair`);assert.ok(Math.abs(r.footDelta)<.002,'sitting keeps the soles at their standing ground height');assert.ok(Math.abs(r.thigh[1]-r.knee[1])<.03,'seated thighs are horizontal');assert.ok(r.knee[2]>r.thigh[2]+.10,'knees are in front');for(const wrist of [r.wrist,r.otherWrist]){assert.ok(wrist[1]>r.thigh[1]&&wrist[1]<r.thigh[1]+.12,'hands rest above the thighs');assert.ok(wrist[2]>=r.thigh[2]&&wrist[2]<r.knee[2],'hands lie along lap');}assert.ok(r.hip>r.seat.top&&r.hip-r.seat.top<.12,'pelvis is supported by the seat');assert.ok(Math.abs(r.seat.y-.15)<.001);assert.ok(r.resetFoot<.002&&r.chairHidden,'standing restores the rig and removes the automatic chair');}
});

 test('seated pose keeps its chair and root offset through dialogue smears and motion wipes',async()=>{
 const result=await browserScene(page=>page.evaluate(async()=>{
  const {Stage,newProject}=await import('/harness.mjs'),stage=new Stage(document.querySelector('canvas')),p=newProject();p.scene.count=1;const a=p.scene.actors[0];Object.assign(a,{pose:'sitting',x:0,yaw:0});await stage.prepare(p.scene);
  try{
   stage.draw({scene:p.scene},270,480);const seatedY=stage.actors[0].root.position.y;
   stage.draw({scene:p.scene,smears:[{actor:0,pose:'stand',headYaw:0}]},270,480);const smear={y:stage.actors[0].root.position.y,chair:stage.seating.items[0].root.visible};
   stage.draw({scene:p.scene,motionWipes:[{target:'actor:0',from:{armR:0},to:{armR:90}}]},270,480);const wipe={y:stage.actors[0].root.position.y,chair:stage.seating.items[0].root.visible};
   return {seatedY,smear,wipe};
  }finally{stage.dispose();}
 }));
 assert.ok(result.smear.chair,'smear must include the seated endpoint chair');assert.ok(Math.abs(result.smear.y-result.seatedY/2)<.001,'smear interpolates the seated root offset');assert.ok(result.wipe.chair);assert.ok(Math.abs(result.wipe.y-result.seatedY)<.001,'arm wipe must not lift the seated body off its chair');
});

test('chairs follow final partner-contact displacement for characters of different heights',async()=>{
 const result=await browserScene(page=>page.evaluate(async()=>{
  const {Stage,newProject,Vector3}=await import('/harness.mjs'),stage=new Stage(document.querySelector('canvas')),p=newProject();p.scene.actors.forEach((a,i)=>Object.assign(a,{model:i?'billy-v2':'blue',pose:'sitting'}));await stage.prepare(p.scene);
  const gaps=()=>stage.actors.map((rig,i)=>{const seat=stage.seating.items[i].root,hip=rig.bones.hips.getWorldPosition(new Vector3());return [hip.x-seat.position.x,hip.y-seat.position.y-.45*seat.scale.y,hip.z-seat.position.z];});
  try{stage.draw({scene:p.scene},270,480);const before=gaps();p.scene.actors.forEach(a=>a.noseContact=1);stage.draw({scene:p.scene},270,480);return {before,after:gaps()};}finally{stage.dispose();}
 }));
 for(let i=0;i<2;i++)for(let axis=0;axis<3;axis++)assert.ok(Math.abs(result.before[i][axis]-result.after[i][axis])<.001,`actor ${i}: chair follows rendered pelvis on axis ${axis}`);
});
