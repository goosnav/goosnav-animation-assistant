import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {build} from 'esbuild';

// In-memory bundle: this test must never race the application's shared dist build.
async function withStage(run){
 const harness=(await build({stdin:{contents:`export {Stage} from './app/src/stage.mjs';export {newProject} from './app/src/core.mjs';export * from './app/src/gaze-alignment.mjs';export {Vector3} from 'three';`,resolveDir:process.cwd()},bundle:true,format:'esm',write:false})).outputFiles[0].text;
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('http://localhost:19879/**',async route=>{
   const path=new URL(route.request().url()).pathname;
   if(path==='/harness.mjs')return route.fulfill({contentType:'text/javascript',body:harness});
   if(path.startsWith('/assets/'))return route.fulfill({contentType:'model/gltf-binary',body:await fs.readFile(`app${path}`)});
   return route.fulfill({contentType:'text/html',body:'<canvas></canvas>'});
  });
  await page.goto('http://localhost:19879/');
  const result=await page.evaluate(run);assert.deepEqual(errors,[]);return result;
 }finally{await browser.close();}
}

// Catches use of a common head height, neck-to-nose direction, uncalibrated
// imported bone axes, ignored emotion offsets, and leaking sampled poses.
test('real legacy and v12 rigs align naturally at unequal heights and rotated staging',async()=>{
 const cases=await withStage(async()=>{
  const {Stage,newProject,alignGaze,gazeDiagnostics,Vector3}=await import('/harness.mjs'),p=newProject(),stage=new Stage(document.querySelector('canvas')),state={scene:p.scene,mouths:['open','wide']},results=[];
  const snapshot=()=>stage.actors.map(a=>{const values=[];a.root.traverse(o=>values.push([o.uuid,o.position.toArray(),o.quaternion.toArray(),o.scale.toArray(),o.visible,o.morphTargetInfluences?.slice()]));return values;});
  try{
   for(const [left,right]of [['blue','rust'],['v12','v12-fat'],['billy-v2','blue'],['rust','v12']]){
    Object.assign(p.scene.actors[0],{model:left,x:-1.1,y:.06,z:.15,scale:.96,yaw:-125,bodyTurn:11,bodyLean:4,rootPitch:3,rootRoll:-3,emotion:'happy',headYaw:12,headPitch:8,headTilt:22,headSpin:360,armR:38,noseContact:1});
    Object.assign(p.scene.actors[1],{model:right,x:1.1,y:-.03,z:-.15,scale:1.06,yaw:145,bodyTurn:-9,bodyLean:-3,rootPitch:-2,rootRoll:2,emotion:'sad',headYaw:-20,headPitch:-10,headTilt:-15,headSpin:180,armL:23,noseContact:1});
    await stage.prepare(p.scene);stage.draw(state,180,320);
    const before=JSON.stringify(p),posed=JSON.stringify(snapshot()),solution=alignGaze(stage),restored=posed===JSON.stringify(snapshot()),unchanged=before===JSON.stringify(p);
    for(const {actor,values}of solution.changes)Object.assign(p.scene.actors[actor],values);
    stage.draw(state,180,320);const diagnostics=gazeDiagnostics(stage);
    const independent=stage.actors.map((a,i)=>{const own=a.faceFrame(),other=stage.actors[1-i].faceFrame(),direction=other.origin.clone().sub(own.origin).normalize();return own.forward.angleTo(direction)*180/Math.PI;});
    const rendered=stage.canvas.toDataURL().length>1000;
    results.push({left,right,solution,diagnostics,independent,rendered,restored,unchanged,actors:p.scene.actors.map(a=>({...a}))});
   }
   return results;
  }finally{stage.dispose();}
 });
 for(const result of cases){
  assert.ok(result.rendered&&result.restored&&result.unchanged,`${result.left}/${result.right}: solver preserves the input and posed skeleton`);
  assert.equal(result.solution.changes.length,2);
  for(const residual of result.independent)assert.ok(residual<.4,`${result.left}/${result.right}: residual ${residual}; ${JSON.stringify(result.solution)}`);
  for(const a of result.actors){assert.ok(Math.abs(a.yaw)<=180,`body turn must fit the editable channel: ${a.yaw}`);assert.ok(Math.abs(a.headYaw)<=60.00001);assert.ok(Math.abs(a.headPitch)<=25.00001);assert.equal(a.headSpin,0);assert.equal(a.noseContact,0);}
  assert.equal(result.actors[0].armR,38);assert.equal(result.actors[1].armL,23);
  for(const {values}of result.solution.changes)assert.ok(Object.keys(values).every(k=>['yaw','headYaw','headPitch','headTilt','headSpin','noseContact'].includes(k)));
 }
});

// Catches continuous constraints, hidden body turns, camera/point targeting,
// coincident-point NaNs, and accepting malformed selection/target arguments.
test('selected gaze snaps once, reports unreachable targets and validates inputs',async()=>{
 const r=await withStage(async()=>{
  const {Stage,newProject,alignGaze,gazeDiagnostics}=await import('/harness.mjs'),p=newProject(),stage=new Stage(document.querySelector('canvas')),state={scene:p.scene,mouths:['rest','rest']};
  try{
   await stage.prepare(p.scene);stage.draw(state,180,320);
   const neutral=stage.actors.map(a=>{a.apply({...p.scene.actors[0],x:0,y:0,z:0,yaw:0,headYaw:0,headPitch:0,headTilt:0});return a.faceFrame().forward.toArray();});stage.draw(state,180,320);
   const selected=alignGaze(stage,{actors:[1],target:'camera'}),other=JSON.stringify(p.scene.actors[0]);for(const c of selected.changes)Object.assign(p.scene.actors[c.actor],c.values);stage.draw(state,180,320);
   const camera=stage.actors[1].faceFrame(),cameraError=camera.forward.angleTo(stage.camera.position.clone().sub(camera.origin).normalize())*180/Math.PI;
   const unchangedOther=other===JSON.stringify(p.scene.actors[0]);
   p.scene.actors.forEach(a=>a.noseContact=1);stage.draw(state,180,320);
   const partner=alignGaze(stage,{actors:[0]});for(const c of partner.changes)Object.assign(p.scene.actors[c.actor],c.values);stage.draw(state,180,320);const partnerError=gazeDiagnostics(stage).actors[0].partnerAngularResidual;
   const snapped=stage.actors[0].faceFrame().forward.clone(),otherX=p.scene.actors[1].x,otherZ=p.scene.actors[1].z;
   p.scene.actors[1].x+=.7;p.scene.actors[1].z+=.6;stage.draw(state,180,320);const oneShot=snapped.angleTo(stage.actors[0].faceFrame().forward)<1e-7&&gazeDiagnostics(stage).actors[0].partnerAngularResidual>1;
   p.scene.actors[1].x=otherX;p.scene.actors[1].z=otherZ;stage.draw(state,180,320);
   p.scene.actors[0].x=-1;p.scene.actors[0].yaw=-90;p.scene.actors[0].headYaw=0;stage.draw(state,180,320);
   const clamped=alignGaze(stage,{actors:[0],turnBody:false}),yaw=p.scene.actors[0].yaw;
   for(const c of clamped.changes)Object.assign(p.scene.actors[c.actor],c.values);stage.draw(state,180,320);const clampedError=gazeDiagnostics(stage).actors[0].partnerAngularResidual;
   const origin=stage.actors[0].faceFrame().origin.toArray(),coincident=alignGaze(stage,{actors:[0],target:{point:origin}});
   const point=alignGaze(stage,{actors:[0],target:{point:[-2,1.6,4]}});for(const c of point.changes)Object.assign(p.scene.actors[c.actor],c.values);stage.draw(state,180,320);const f=stage.actors[0].faceFrame(),pointError=f.forward.angleTo(f.origin.clone().set(-2,1.6,4).sub(f.origin).normalize())*180/Math.PI,fixed=JSON.stringify(p.scene.actors[0]);p.scene.actors[1].x=3;stage.draw(state,180,320);const still=fixed===JSON.stringify(p.scene.actors[0]);
   const rejected=[];for(const options of [{actors:[2]},{actors:[0,0]},{actors:'all'},{target:'bad'},{target:{point:[0,NaN,0]}},{turnBody:1},null]){try{alignGaze(stage,options);rejected.push(false);}catch{rejected.push(true);}}
   p.scene.count=1;stage.draw(state,180,320);const solo=alignGaze(stage);
   return {neutral,selected,cameraError,partnerError,pointError,oneShot,unchangedOther,clamped,clampedError,yaw,coincident,still,rejected,solo};
  }finally{stage.dispose();}
 });
 for(const direction of r.neutral){assert.ok(Math.abs(direction[0])<1e-5);assert.ok(Math.abs(direction[1])<1e-5);assert.ok(direction[2]>.99999,'authored neutral faces +Z');}
 assert.deepEqual(r.selected.changes.map(c=>c.actor),[1]);assert.ok(r.cameraError<.4&&r.pointError<.4&&r.partnerError<.4,JSON.stringify(r));assert.ok(r.unchangedOther&&r.still&&r.oneShot);
 assert.ok(r.clamped.changes.every(c=>c.values.yaw===undefined||c.values.yaw===r.yaw));assert.ok(r.clampedError>30&&r.clamped.warnings.length>0);
 assert.ok(Math.abs(r.clamped.changes[0].values.headPitch)<5,`a horizontal unreachable target must not force an unrelated pitch extreme: ${JSON.stringify(r.clamped)}`);
 assert.ok(r.coincident.warnings.length>0);assert.ok(r.coincident.changes.every(c=>Object.values(c.values).every(Number.isFinite)));assert.ok(r.rejected.every(Boolean));assert.equal(r.solo.changes.length,0);assert.ok(r.solo.warnings.length>0);
});

test('a target behind the character uses the smallest natural body turn',async()=>{
 const r=await withStage(async()=>{
  const {Stage,newProject,alignGaze}=await import('/harness.mjs'),p=newProject(),stage=new Stage(document.querySelector('canvas')),state={scene:p.scene,mouths:['rest','rest']};
  try{
   Object.assign(p.scene.actors[0],{x:0,y:0,z:0,yaw:0});await stage.prepare(p.scene);stage.draw(state,180,320);
   const y=stage.actors[0].faceFrame().origin.y,behind=alignGaze(stage,{actors:[0],target:{point:[0,y,-5]}});
   Object.assign(p.scene.actors[0],behind.changes[0].values);stage.draw(state,180,320);const pose=stage.actors[0].faceFrame(),error=pose.forward.angleTo(pose.origin.clone().set(0,y,-5).sub(pose.origin).normalize())*180/Math.PI;
   p.scene.actors[0].headTilt=25;p.scene.actors[0].headSpin=40;stage.draw(state,180,320);
   const original=JSON.stringify(p),coincident=alignGaze(stage,{actors:[0],target:{point:stage.actors[0].faceFrame().origin.toArray()}});
   return {behind,error,coincident,unchanged:original===JSON.stringify(p)};
  }finally{stage.dispose();}
 });
 assert.ok(r.error<.1);
 assert.ok(Math.abs(r.behind.changes[0].values.yaw)>115&&Math.abs(r.behind.changes[0].values.yaw)<125,JSON.stringify(r.behind));
 assert.ok(Math.abs(r.behind.changes[0].values.headYaw)>59);
 assert.equal(r.coincident.changes.length,0);assert.match(r.coincident.warnings.join(' '),/coincid/i);assert.ok(r.unchanged);
});

test('sampling a seated rig restores the displayed chair contact and transformed pose',async()=>{
 const r=await withStage(async()=>{
  const {Stage,newProject,alignGaze}=await import('/harness.mjs'),p=newProject(),stage=new Stage(document.querySelector('canvas')),state={scene:p.scene,mouths:['rest','rest']};
  try{
   Object.assign(p.scene.actors[0],{pose:'sitting',rootPitch:8,rootRoll:6,yaw:0});await stage.prepare(p.scene);stage.draw(state,180,320);
   const seat=stage.actors[0].seat,before=JSON.stringify(seat),f=stage.actors[0].faceFrame();alignGaze(stage,{actors:[0],target:{point:[0,f.origin.y,-5]}});
   return {same:seat===stage.actors[0].seat,before,after:JSON.stringify(stage.actors[0].seat)};
  }finally{stage.dispose();}
 });
 assert.ok(r.same,'the displayed seat contact must retain its identity');assert.equal(r.after,r.before);
});
