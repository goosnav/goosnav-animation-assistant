import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OutlineEffect } from 'three/addons/effects/OutlineEffect.js';
import { Scenery } from './scenery.mjs';

const rad=THREE.MathUtils.degToRad;
const mouthWeights={rest:[0,0,0],small:[.22,0,0],open:[1,0,0],wide:[.2,0,.8],round:[.12,.88,0],teeth:[.16,0,.52]};
// v12 people talk with a hinged puppet jaw, lip shapes and a tongue. Their actors carry one baked head
// morph per mouth state (goosnav-3D-assets scripts/export_v12_app_actors.py), so a state is one morph.
const bakedMouths={small:'mouth_small',open:'mouth_open',wide:'mouth_wide',round:'mouth_round',teeth:'mouth_fv'};
// The puppet head tips back a little as the jaw drops (the v12 talking method's "Muppet bite").
const headLift={small:.03,open:.09,wide:.04,round:.04,teeth:0,rest:0};
// Round bodies hold their arms a little wider so the sleeves clear the belly (radians per side).
const armClear={'v12-fat':.24,'v12-fat-glasses':.24,'billy-v2':.14};
const models=new Map();
async function load(name){if(!models.has(name))models.set(name,new GLTFLoader().loadAsync(`assets/actor-${name}.glb`).then(g=>g.scene).catch(e=>{models.delete(name);throw e;}));return models.get(name);}

function actor(source,name=''){
 const root=clone(source),bones={},rest={},mouths=[],baked=[],blinks=[],materials=[];
 root.traverse(o=>{
  if(o.isBone){const n=o.name.replaceAll('.','');bones[n]=o;rest[n]={q:o.quaternion.clone(),p:o.position.clone(),s:o.scale.clone()};}
  if(o.isMesh){
   o.frustumCulled=false;
   o.material=(Array.isArray(o.material)?o.material:[o.material]).map(m=>{
    const mat=new THREE.MeshToonMaterial({color:m.color,map:m.map,side:m.side,transparent:m.transparent,opacity:m.opacity,fog:false});
    mat.name=m.name;mat.userData.outlineParameters={thickness:.0025,color:[0,0,0],alpha:1};materials.push({mat,color:mat.color.clone()});return mat;
   });if(o.material.length===1)o.material=o.material[0];
   if(o.morphTargetDictionary?.open!==undefined){o.morphTargetInfluences=[...o.morphTargetInfluences];mouths.push(o);}
   if(o.morphTargetDictionary?.mouth_open!==undefined){o.morphTargetInfluences=[...o.morphTargetInfluences];baked.push(o);}
   if(o.morphTargetDictionary?.blink!==undefined){o.morphTargetInfluences=[...o.morphTargetInfluences];blinks.push(o);}
  }
 });
 // A small tooth plane sits inside the existing oral opening, attached in head
 // space; it is never a camera-facing replacement mouth or a floating face card.
 root.updateMatrixWorld(true);
 const head=bones.head,headPosition=head.getWorldPosition(new THREE.Vector3());
 const teeth=new THREE.Mesh(new THREE.BoxGeometry(.105,.017,.022),new THREE.MeshToonMaterial({color:0xffffff,fog:false}));
 teeth.position.set(0,headPosition.y+.028,.151);root.add(teeth);root.updateMatrixWorld(true);head.attach(teeth);teeth.visible=false;
 function pose(name,x=0,y=0,z=0){if(bones[name])bones[name].quaternion.copy(rest[name].q).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(x,y,z)));}
 return {root,apply(a,mouth='rest',blink=false,style='flat',smearFrom=null){
  for(const [n,b]of Object.entries(bones)){b.quaternion.copy(rest[n].q);b.position.copy(rest[n].p);b.scale.copy(rest[n].s);}
  root.position.set(a.x,0,a.z);root.rotation.y=rad(a.yaw);root.scale.setScalar(a.scale);
  // The authored v10 rest already has lowered arms. Keep the library's local
  // joint convention; large opposite Z rotations fold shoulders into the torso.
  let left=[.08,0,.04],right=[.08,0,-.04],fl=[.1,0,0],fr=[.1,0,0];
  if(a.pose==='point'){right=[1.1,0,-.12];fr=[.2,0,0];}
  if(a.pose==='open-hand'){right=[.73,0,-.24];fr=[.75,0,0];}
  if(a.pose==='shrug'){left=[.3,0,.32];right=[.3,0,-.32];fl=[.9,0,0];fr=[.9,0,0];}
  if(a.pose==='hands-on-hips'){left=[.05,0,.35];right=[.05,0,-.35];fl=[1.4,0,.25];fr=[1.4,0,-.25];}
  left[0]+=rad(a.armL);right[0]+=rad(a.armR);
  left[2]+=armClear[name]||0;right[2]-=armClear[name]||0;
  pose('upper_armL',...left);pose('upper_armR',...right);pose('forearmL',...fl);pose('forearmR',...fr);
  pose('handL',0,rad(a.handL),0);pose('handR',0,rad(a.handR),0);
  pose('head',baked.length?-(headLift[mouth]||0):0,rad(a.headYaw),rad(a.headTilt));
  // Small face/head translation gives an explicit discrete nose/head accent.
  if(a.nose)bones.head.position.z+=a.nose;
  const weights=mouthWeights[mouth]||mouthWeights.rest;
  for(const mesh of mouths){mesh.morphTargetInfluences.fill(0);['open','round','wide'].forEach((n,i)=>mesh.morphTargetInfluences[mesh.morphTargetDictionary[n]]=weights[i]);}
  for(const mesh of baked){mesh.morphTargetInfluences.fill(0);const m=bakedMouths[mouth];if(m&&mesh.morphTargetDictionary[m]!==undefined)mesh.morphTargetInfluences[mesh.morphTargetDictionary[m]]=1;}
  for(const mesh of blinks)mesh.morphTargetInfluences[mesh.morphTargetDictionary.blink]=blink?1:0;
  teeth.visible=mouth==='teeth'&&!baked.length;   // v12 F/V tucks the lip instead
  for(const {mat,color}of materials)mat.color.copy(style==='line'&&!/mouth|eye_black|eye_gloss|pupil|glasses/.test(mat.name)?new THREE.Color('white'):color);
  if(smearFrom){
   const target=Object.fromEntries(Object.entries(bones).map(([n,b])=>[n,{q:b.quaternion.clone(),p:b.position.clone()}]));
   this.apply(smearFrom,mouth,blink,style);
   for(const [n,b]of Object.entries(bones)){
    const delta=b.quaternion.clone().invert().multiply(target[n].q),angle=b.quaternion.angleTo(target[n].q);
    b.quaternion.slerp(target[n].q,.5);b.position.lerp(target[n].p,.5);
    if(angle<.03)continue;
    // Stretch across the moving limb's arc, leaving the torso and still limbs
    // at rest. This is one exaggerated drawing, not a blurred video overlay.
    if(/^(upper_arm|forearm)[LR]$/.test(n)){
     b.scale.x*=1+Math.min(3,(Math.abs(delta.z)+Math.abs(delta.y)*.5)*5);
     b.scale.z*=1+Math.min(3,(Math.abs(delta.x)+Math.abs(delta.y)*.5)*5);
     b.scale.y*=1+Math.min(.12,angle*.08);
    }else if(n==='head'){
     const stretch=1+Math.min(.65,angle*.5);b.scale.x*=stretch;b.scale.z/=stretch;
    }
   }
  }
 },dispose(){root.traverse(o=>{if(o.isMesh){for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});teeth.geometry.dispose();}};
}

export class Stage {
 constructor(canvas,onCameraChange=()=>{}){
  this.canvas=canvas;this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true,alpha:false});
  this.renderer.setPixelRatio(1);this.renderer.outputColorSpace=THREE.SRGBColorSpace;
  this.effect=new OutlineEffect(this.renderer);this.scene=new THREE.Scene();this.scene.add(new THREE.AmbientLight(0xffffff,2));
  this.scenery=new Scenery(this.scene);
  const sun=new THREE.DirectionalLight(0xffffff,2.1);sun.position.set(-3,5,6);this.scene.add(sun);
  this.actors=[];this.names=[];this.camera=new THREE.OrthographicCamera();this.camera.position.set(0,1,6);
  this.controls=new OrbitControls(this.camera,canvas);this.controls.enableDamping=false;this.controls.target.set(0,1,0);this.controls.enablePan=true;
  this.controls.addEventListener('change',()=>this.render());
  this.controls.addEventListener('end',()=>{
   if(!this.state)return;const delta=this.camera.position.clone().sub(this.controls.target),s=new THREE.Spherical().setFromVector3(delta);
   onCameraChange({azimuth:THREE.MathUtils.radToDeg(s.theta),elevation:90-THREE.MathUtils.radToDeg(s.phi),zoom:this.camera.isOrthographicCamera?this.camera.zoom:6/delta.length(),targetX:this.controls.target.x,targetY:this.controls.target.y});
  });
 }
 async prepare(scene){
  const ticket=this.prepareTicket=(this.prepareTicket||0)+1;
  const names=scene.actors.slice(0,scene.count).map(a=>a.model);
  const sources=await Promise.all(names.map(load));if(ticket!==this.prepareTicket)return;
  for(let i=0;i<2;i++)if(this.names[i]!==names[i]){if(this.actors[i]){this.scene.remove(this.actors[i].root);this.actors[i].dispose();}this.actors[i]=sources[i]?actor(sources[i],names[i]):null;this.names[i]=names[i];if(this.actors[i])this.scene.add(this.actors[i].root);}
 }
 draw(state,width=540,height=960,{guides}={}){
  this.state=state;this.renderer.setSize(width,height,false);this.scene.background=new THREE.Color(state.scene.background);
  this.scenery.update(state.scene,guides);
  state.scene.actors.slice(0,state.scene.count).forEach((a,i)=>{const smear=state.smears?.find(s=>s.actor===i);this.actors[i]?.apply(a,state.mouths?.[i],state.blinks?.[i],state.scene.style,smear?{...a,pose:smear.pose,headYaw:smear.headYaw}:null);});
  const c=state.scene.camera,aspect=width/height;
  const next=c.projection==='perspective'?new THREE.PerspectiveCamera(35,aspect,.01,100):new THREE.OrthographicCamera(-1.35*aspect,1.35*aspect,1.35,-1.35,.01,100);
  next.zoom=c.projection==='orthographic'?c.zoom:1;
  const target=new THREE.Vector3(c.targetX,c.targetY,0),distance=c.projection==='perspective'?6/c.zoom:6;
  next.position.copy(target).add(new THREE.Vector3().setFromSpherical(new THREE.Spherical(distance,rad(90-c.elevation),rad(c.azimuth))));next.lookAt(target);next.updateProjectionMatrix();
  this.camera=next;this.controls.object=next;this.controls.target.copy(target);this.render();
 }
 render(){this.effect.render(this.scene,this.camera);}
 async png(){return new Promise((resolve,reject)=>this.canvas.toBlob(b=>b?resolve(b):reject(Error('Image rendering failed')),'image/png'));}
 dispose(){this.controls.dispose();this.actors.forEach(a=>a?.dispose());this.scenery.dispose();this.renderer.dispose();}
}
