import * as THREE from 'three';
import {EMOTIONS} from './emotions.mjs';

const deg=THREE.MathUtils.radToDeg,clamp=THREE.MathUtils.clamp;
const wrap=a=>THREE.MathUtils.euclideanModulo(a+180,360)-180;
const finiteVector=v=>v?.isVector3&&[v.x,v.y,v.z].every(Number.isFinite);

function inspectStage(stage){
 const scene=stage?.state?.scene;
 if(!scene||![1,2].includes(scene.count)||!Array.isArray(scene.actors)||scene.actors.length<scene.count||!Array.isArray(stage.actors))throw new TypeError('Gaze alignment requires a drawn Stage with visible actors.');
 for(let i=0;i<scene.count;i++){
  const actor=stage.actors[i],a=scene.actors[i];
  if(!actor?.root?.isObject3D||typeof actor.apply!=='function'||typeof actor.faceFrame!=='function')throw new TypeError(`Stage actor ${i} is not prepared for gaze alignment.`);
  if(!a||!['x','z','yaw','scale'].every(k=>Number.isFinite(a[k]))||a.scale<=0)throw new TypeError(`Stage actor ${i} has invalid placement.`);
  for(const k of ['y','headYaw','headPitch','headTilt','headSpin','rootPitch','rootRoll','bodyLean','bodyTurn'])if(a[k]!==undefined&&!Number.isFinite(a[k]))throw new TypeError(`Stage actor ${i} has invalid ${k}.`);
  frame(actor);
 }
 return scene;
}
function frame(actor){
 const f=actor.faceFrame();
 if(!finiteVector(f?.origin)||!finiteVector(f?.forward)||!finiteVector(f?.up)||f.forward.lengthSq()<1e-12||f.up.lengthSq()<1e-12)throw new TypeError('Stage actor has an invalid face frame.');
 return {origin:f.origin.clone(),forward:f.forward.clone().normalize(),up:f.up.clone().normalize()};
}
function residual(own,target){const direction=target.clone().sub(own.origin);return direction.lengthSq()<1e-12?null:deg(own.forward.angleTo(direction.normalize()));}

// Sampling actor.apply is necessary because emotions, rest bone frames, mouth
// lift and body poses all contribute to the final face orientation. Preserve
// the actual displayed graph, including smears and constraints, on every exit.
function preserve(actors){
 const nodes=[],materials=new Map(),seats=[];
 for(const actor of actors){
  const seat=actor.seat;seats.push([actor,seat,seat?{...seat}:null]);
  actor.root.traverse(o=>{
   nodes.push([o,o.position.clone(),o.quaternion.clone(),o.scale.clone(),o.visible,o.morphTargetInfluences?.slice()]);
   if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])if(m.color&&!materials.has(m))materials.set(m,m.color.clone());
  });
 }
 return ()=>{
  for(const [o,p,q,s,visible,morph]of nodes){o.position.copy(p);o.quaternion.copy(q);o.scale.copy(s);o.visible=visible;if(morph)o.morphTargetInfluences.splice(0,o.morphTargetInfluences.length,...morph);}
  for(const [m,color]of materials)m.color.copy(color);
  for(const [actor,seat,saved]of seats){actor.seat=seat;if(saved)Object.assign(seat,saved);}
  for(const actor of actors)actor.root.updateMatrixWorld(true);
 };
}

/** Read the currently displayed face frames without changing the pose. */
export function gazeDiagnostics(stage){
 const scene=inspectStage(stage),frames=stage.actors.slice(0,scene.count).map(frame);
 return {actors:frames.map((f,i)=>({actor:i,origin:f.origin.toArray(),forward:f.forward.toArray(),up:f.up.toArray(),partnerAngularResidual:scene.count===2?residual(f,frames[1-i].origin):null}))};
}

/** Return one-shot channel patches; the supplied state and displayed pose stay intact. */
export function alignGaze(stage,options={}){
 const scene=inspectStage(stage);
 if(!options||typeof options!=='object'||Array.isArray(options))throw new TypeError('Gaze options must be an object.');
 const {actors=Array.from({length:scene.count},(_,i)=>i),target='partner',turnBody=true}=options;
 if(!Array.isArray(actors)||new Set(actors).size!==actors.length||actors.some(i=>!Number.isInteger(i)||i<0||i>=scene.count))throw new TypeError('Gaze actors must be unique visible actor indices.');
 if(typeof turnBody!=='boolean')throw new TypeError('Gaze turnBody must be a boolean.');
 let point=null;
 if(target==='camera'){
  if(!finiteVector(stage.camera?.position))throw new TypeError('Gaze camera target requires a valid Stage camera.');
  point=stage.camera.getWorldPosition?stage.camera.getWorldPosition(new THREE.Vector3()):stage.camera.position.clone();
 }else if(target!=='partner'){
  if(!target||typeof target!=='object'||Array.isArray(target)||Object.keys(target).some(k=>k!=='point')||!Array.isArray(target.point)||target.point.length!==3||!target.point.every(Number.isFinite))throw new TypeError('Gaze target must be partner, camera, or {point:[x,y,z]}.');
  point=new THREE.Vector3(...target.point);
 }
 const warnings=[];
 if(target==='partner'&&scene.count<2)return {changes:[],warnings:['Partner gaze needs two visible actors.'],diagnostics:gazeDiagnostics(stage)};
 const selected=actors.filter(i=>{
  const own=frame(stage.actors[i]),destination=point||frame(stage.actors[1-i]).origin;
  if(own.origin.distanceToSquared(destination)>=1e-12)return true;
  warnings.push(`Actor ${i+1}: gaze target coincides with the face; alignment was skipped.`);return false;
 });
 if(!selected.length)return {changes:[],warnings,diagnostics:gazeDiagnostics(stage)};
 const restore=preserve(stage.actors.slice(0,scene.count)),values=new Map(),originalYaw=new Map();
 const apply=i=>{
  const a={...scene.actors[i],...values.get(i)};
  // Limb contact IK cannot move the face. Skip that unrelated work while
  // sampling, especially the iterative automatic seated-hand placement.
  for(const side of ['L','R'])if(Math.abs(a[`arm${side}`]||0)<=.001)a[`arm${side}`]=.002;
  a.contact=0;a.contactLeft=0;a.noseGrip=0;a.footIK=0;
  stage.actors[i].apply(a,stage.state.mouths?.[i]||'rest',stage.state.blinks?.[i]||false,scene.style);
 };
 const targetFor=i=>point||frame(stage.actors[1-i]).origin;
 try{
  for(const i of selected){
   const a=scene.actors[i],emotion=EMOTIONS[a.emotion]||EMOTIONS.neutral;
   values.set(i,{yaw:a.yaw,headYaw:clamp(a.headYaw||0,-60,60),headPitch:clamp(a.headPitch||0,-25,25),headTilt:-emotion.headTilt,headSpin:0,noseContact:0});originalYaw.set(i,a.yaw);apply(i);
  }
  // Releasing either participant disables the paired nose-contact translation
  // on the next drawing, including the untouched partner's displayed root.
  if(scene.count===2&&scene.actors.every(a=>a.noseContact))for(let i=0;i<scene.count;i++)if(!values.has(i))apply(i);
  // Two neck channels are fitted to the actual moving face origin, rather
  // than just yaw/pitch angles about a common hypothetical character height.
  function fitNeck(i){
   const v=values.get(i),emotion=EMOTIONS[scene.actors[i].emotion]||EMOTIONS.neutral;
   const pitchMin=Math.max(-25,-25-emotion.headPitch),pitchMax=Math.min(25,25-emotion.headPitch);
   const limit=(key,value)=>clamp(value,key==='headYaw'?-60:pitchMin,key==='headYaw'?60:pitchMax);
   function error(){
    apply(i);const f=frame(stage.actors[i]),direction=targetFor(i).clone().sub(f.origin);if(direction.lengthSq()<1e-12)return null;
    const heading=Math.atan2(direction.x,direction.z)-Math.atan2(f.forward.x,f.forward.z);
    // Separate azimuth and elevation so an unreachable rear target clamps its
    // turn naturally instead of reducing 3D error by looking at the ceiling.
    return new THREE.Vector3(Math.atan2(Math.sin(heading),Math.cos(heading)),Math.atan2(direction.y,Math.hypot(direction.x,direction.z))-Math.atan2(f.forward.y,Math.hypot(f.forward.x,f.forward.z)),0);
   }
   let best=null;
   // The target can begin directly behind the actor; a single local gradient
   // is stationary there. A small deterministic set of starts avoids that trap.
   for(const start of [[v.headYaw,v.headPitch],[-60,0],[0,0],[60,0]]){
    [v.headYaw,v.headPitch]=[limit('headYaw',start[0]),limit('headPitch',start[1])];
    for(let pass=0;pass<12;pass++){
     const e=error();if(!e)return {coincident:true,error:Infinity};if(e.lengthSq()<1e-13)break;
     const derivatives=['headYaw','headPitch'].map(key=>{const old=v[key],step=old>=limit(key,old+.05)?-.05:.05;v[key]=old+step;const next=error();v[key]=old;return next?next.sub(e).divideScalar(step):new THREE.Vector3();});
     const [a,b]=derivatives,aa=a.dot(a)+1e-8,bb=b.dot(b)+1e-8,ab=a.dot(b),det=aa*bb-ab*ab,ae=a.dot(e),be=b.dot(e);
     const dy=clamp((-ae*bb+be*ab)/det,-25,25),dp=clamp((-be*aa+ae*ab)/det,-15,15),oldYaw=v.headYaw,oldPitch=v.headPitch,score=e.lengthSq();
     let accepted=false;
     for(const weight of [1,.5,.2,.05]){v.headYaw=limit('headYaw',oldYaw+dy*weight);v.headPitch=limit('headPitch',oldPitch+dp*weight);const next=error();if(next&&next.lengthSq()<score-1e-14){accepted=true;break;}}
     if(!accepted){v.headYaw=oldYaw;v.headPitch=oldPitch;break;}
    }
    const e=error(),score=e?e.lengthSq():Infinity;if(!best||score<best.score)best={score,headYaw:v.headYaw,headPitch:v.headPitch};
   }
   Object.assign(v,{headYaw:best.headYaw,headPitch:best.headPitch});apply(i);
   // At a hard yaw stop, preserve the target's elevation rather than spending
   // the pitch range for a tiny improvement to an unreachable horizontal turn.
   if(Math.abs(v.headYaw)>59.999&&residual(frame(stage.actors[i]),targetFor(i))>.3)for(let pass=0;pass<8;pass++){
    const e=error();if(!e||Math.abs(e.y)<1e-7)break;
    const old=v.headPitch,step=old>=pitchMax?-.05:.05;v.headPitch=old+step;const next=error();v.headPitch=old;
    const derivative=next?(next.y-e.y)/step:0;if(Math.abs(derivative)<1e-8)break;
    v.headPitch=limit('headPitch',old-clamp(e.y/derivative,-10,10));
    const improved=error();if(!improved||Math.abs(improved.y)>=Math.abs(e.y)){v.headPitch=old;break;}
   }
   apply(i);
   return {error:residual(frame(stage.actors[i]),targetFor(i)),coincident:false};
  }
  for(let round=0;round<7;round++)for(const i of selected){
   const v=values.get(i),fit=fitNeck(i);if(fit.coincident||!turnBody||fit.error<.015)continue;
   // Find a body turn that makes the neck's natural range sufficient. Then
   // bisect back toward the authored body angle to keep that turn minimal.
   const from=v.yaw,start={...v},own=frame(stage.actors[i]),direction=targetFor(i).clone().sub(own.origin),flatForward=new THREE.Vector3(own.forward.x,0,own.forward.z),flatTarget=new THREE.Vector3(direction.x,0,direction.z);
   if(flatForward.lengthSq()<1e-10||flatTarget.lengthSq()<1e-10)continue;
   const delta=wrap(deg(Math.atan2(flatTarget.x,flatTarget.z)-Math.atan2(flatForward.x,flatForward.z)));
   let best={...v},bestError=fit.error,bestDelta=0;
   for(const candidate of [delta,delta/2,-delta,90,-90,180]){
    Object.assign(v,start,{yaw:from+candidate});const result=fitNeck(i);
    if(result.error<bestError){best={...v};bestError=result.error;bestDelta=candidate;}
    if(bestError<.01)break;
   }
   if(bestError<.02){
    let lo=0,hi=1;
    for(let pass=0;pass<14;pass++){const t=(lo+hi)/2;Object.assign(v,best,{yaw:from+bestDelta*t});const result=fitNeck(i);if(result.error<.02){hi=t;best={...v};}else lo=t;}
   }
   Object.assign(v,best);apply(i);
  }
  const diagnostics=gazeDiagnostics(stage),changes=[];
  for(const i of selected){
   const v=values.get(i),error=residual(frame(stage.actors[i]),targetFor(i));
   if(error===null){warnings.push(`Actor ${i+1}: gaze target coincides with the face; alignment was skipped.`);continue;}
   if(error>.3)warnings.push(`Actor ${i+1}: target remains ${error.toFixed(1)}° outside the natural head range${turnBody?'':' with body turning disabled'}.`);
   const patch={...v};if(Math.abs(wrap(v.yaw-originalYaw.get(i)))<1e-7)delete patch.yaw;else patch.yaw=wrap(v.yaw);
   changes.push({actor:i,values:patch});
  }
  return {changes,warnings,diagnostics};
 }finally{restore();}
}
