import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {build} from 'esbuild';
const harness=(await build({stdin:{contents:`export {Stage} from './app/src/stage.mjs';export {newProject} from './app/src/core.mjs';export {Vector3,Box3} from 'three';`,resolveDir:process.cwd()},bundle:true,format:'esm',write:false})).outputFiles[0].text;
test('current worlds, articulated hand props and single-frame motion wipes render and restore',async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('http://localhost:19877/**',async route=>{
   const path=new URL(route.request().url()).pathname;
   if(path==='/harness.mjs')return route.fulfill({contentType:'text/javascript',body:harness});
   if(path.startsWith('/assets/'))return route.fulfill({contentType:'model/gltf-binary',body:await fs.readFile(`app${path}`)});
   return route.fulfill({contentType:'text/html',body:'<canvas></canvas>'});
  });await page.goto('http://localhost:19877/');
  const result=await page.evaluate(async()=>{
   const {Stage,newProject,Vector3,Box3}=await import('/harness.mjs'),p=newProject(),stage=new Stage(document.querySelector('canvas')),state={scene:p.scene,mouths:['rest','rest']};
   const images={},snap=()=>stage.canvas.toDataURL().split(',')[1];
   try{
    p.scene.camera.projection='perspective';await stage.prepare(p.scene);stage.draw(state,540,960,{guides:{ground:true}});images.grid=snap();
    const worlds={};for(const name of ['black-pyramids','red-mesas','space','backrooms','starter-overgrown-courtyard','colonnade','threshold']){
     p.scene.backdrop=name;await stage.prepare(p.scene);stage.draw(state,540,960);let meshes=0,textures=0;
     stage.scenery.root.traverse(o=>{if(o.isMesh){meshes++;for(const m of Array.isArray(o.material)?o.material:[o.material])if(m.map||m.emissiveMap)textures++;}});
     worlds[name]={meshes,textures};images[name]=snap();
    }
    p.scene.backdrop='red-mesas';p.scene.props=[{id:'held',kind:'book',x:0,y:.08,z:.05,rx:0,ry:0,rz:0,width:.28,height:.38,depth:.04,color:'#ffffff',attachment:'actor:0:right'}];
    Object.assign(p.scene.actors[0],{armR:60,elbowR:50});await stage.prepare(p.scene);stage.draw(state,540,960);images.book=snap();
    const item=stage.props.items.get('held'),attached=item.root.parent===stage.actors[0].bones.handR,before=item.root.getWorldPosition(new Vector3());
    p.scene.actors[0].elbowR=100;stage.draw(state,540,960);const moved=before.distanceTo(item.root.getWorldPosition(new Vector3()));
    p.scene.props[0].attachment='world';p.scene.props[0].rx=p.scene.props[0].ry=p.scene.props[0].rz=0;stage.draw(state,540,960);
    const dimensions=new Box3().setFromObject(item.root).getSize(new Vector3()).toArray();
    const base=snap(),normalScale=stage.actors[0].bones.upper_armR.scale.toArray(),a=p.scene.actors[0],prop=p.scene.props[0];
    state.motionWipes=[{target:'actor:0',from:{...a,armR:0,elbowR:0},to:{...a,armR:120,elbowR:100}},{target:'prop:held',from:{...prop,x:-.7},to:{...prop,x:.7}}];
    stage.draw(state,540,960);const smear=snap(),stretched=stage.actors[0].bones.upper_armR.scale.toArray(),propStretch=item.root.scale.x;images.wipe=smear;
    delete state.motionWipes;stage.draw(state,540,960);const reset=snap(),restored=stage.actors[0].bones.upper_armR.scale.toArray();
    const savedActor={...a};Object.assign(a,{x:.1,y:.2,z:.3,yaw:0,scale:1.05});
    state.motionWipes=[{target:'actor:0',from:{...a,x:-.3,y:0,z:.1,yaw:-80,scale:.8},to:{...a,x:.5,y:.4,z:.5,yaw:80,scale:1.3}}];
    stage.draw(state,540,960);const midpointRoot={position:stage.actors[0].root.position.toArray(),yaw:stage.actors[0].root.rotation.y,scale:stage.actors[0].root.scale.toArray()};
    Object.assign(a,{x:0,y:0,z:0,yaw:180,scale:1});prop.ry=180;
    state.motionWipes=[{target:'actor:0',from:{...a,yaw:179},to:{...a,yaw:-179}},{target:'prop:held',from:{...prop,ry:179},to:{...prop,ry:-179}}];
    stage.draw(state,540,960);const wrapRoot={yaw:stage.actors[0].root.rotation.y,scaleX:stage.actors[0].root.scale.x},wrapProp={yaw:item.root.rotation.y,scaleX:item.root.scale.x};
    delete state.motionWipes;Object.assign(a,savedActor);prop.ry=0;
    p.scene.props[0].attachment='actor:0:right';stage.draw(state,540,960);p.scene.actors[0].model='v12-fat';await stage.prepare(p.scene);stage.draw(state,540,960);const reattached=item.root.parent===stage.actors[0].bones.handR;
    p.scene.props=[];await stage.prepare(p.scene);const removed=stage.props.items.size===0;
    p.scene.props=['cube','sphere','prism'].map((kind,i)=>({id:kind,kind,x:(i-1)*.55,y:.2,z:.4,rx:0,ry:0,rz:0,width:.3,height:.4,depth:.2,color:'#c84c32',attachment:'world'}));
    await stage.prepare(p.scene);stage.draw(state,540,960);images.primitives=snap();
    const primitiveSizes=p.scene.props.map(p=>new Box3().setFromObject(stage.props.items.get(p.id).root).getSize(new Vector3()).toArray());
    p.scene.props[0].ry=90;stage.draw(state,540,960);const turnedCube=new Box3().setFromObject(stage.props.items.get('cube').root).getSize(new Vector3()).toArray();
    p.scene.props=[];await stage.prepare(p.scene);
    p.scene.camera.azimuth=-35;p.scene.camera.zoom=1.25;stage.draw(state,540,960);images.ots=snap();
    return {midpointRoot,wrapRoot,wrapProp,primitiveSizes,turnedCube,worlds,images,attached,moved,dimensions,normalScale,stretched,propStretch,restored,reset:reset===base,changed:smear!==base,reattached,removed};
   }finally{stage.dispose();}
  });
  for(const [name,world]of Object.entries(result.worlds))assert.ok(world.meshes>0,`${name} contains imported environment meshes`);
  for(const name of ['black-pyramids','red-mesas'])assert.ok(result.worlds[name].textures>0,`${name} retains actual panorama texture`);
  result.midpointRoot.position.forEach((v,i)=>assert.ok(Math.abs(v-[.1,.2,.3][i])<1e-9,'root translation uses the wipe midpoint'));
  assert.equal(result.midpointRoot.yaw,0,'rapid root turn uses compiled midpoint, not endpoint rotation');
  const expectedScale=[1.05*(1+.8/.45)*1.8,1.05*(1+.4/1.7),2.1];result.midpointRoot.scale.forEach((v,i)=>assert.ok(Math.abs(v-expectedScale[i])<1e-9,'stretch starts from compiled midpoint scale'));
  assert.equal(result.wrapRoot.yaw,Math.PI);assert.ok(Math.abs(result.wrapRoot.scaleX-(1+2/180))<1e-9,'explicit two-degree wrapped turn must not stretch like a 358-degree spin');
  assert.equal(result.wrapProp.yaw,Math.PI);assert.equal(result.wrapProp.scaleX,.28,'wrapped prop turn does not trigger large-turn stretching');
  for(const size of result.primitiveSizes)size.forEach((v,i)=>assert.ok(Math.abs(v-[.3,.4,.2][i])<1e-5));
  result.turnedCube.forEach((v,i)=>assert.ok(Math.abs(v-[.2,.4,.3][i])<1e-5));
  assert.ok(result.attached&&result.reattached&&result.removed);assert.ok(result.moved>.05,'elbow articulation moves the hand-attached book');
  result.dimensions.forEach((v,i)=>assert.ok(Math.abs(v-[.28,.38,.04][i])<1e-5,'book dimensions use the same upright XYZ convention as primitives'));
  assert.ok(result.changed&&result.reset,'a wipe must be visibly different and reset on the very next drawing');assert.notDeepEqual(result.stretched,result.normalScale);assert.deepEqual(result.restored,result.normalScale);assert.ok(result.propStretch>1);
  await fs.mkdir('.work',{recursive:true});for(const [name,png]of Object.entries(result.images))await fs.writeFile(`.work/verified-${name}.png`,Buffer.from(png,'base64'));
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
