// Posed animation: a small, deterministic set of drawings between authored keys.
const channel=(label,min,max,step=1,value=0)=>Object.freeze({label,min,max,step,default:value});
export const ACTOR_CHANNELS=Object.freeze({
 x:channel('Position',-3,3,.05),y:channel('Height',-1,3,.05),z:channel('Depth',-2,2,.05),
 yaw:channel('Turn',-180,180),scale:channel('Size',.5,1.5,.05,1),
 headYaw:channel('Head turn',-75,75),headTilt:channel('Head tilt',-35,35),headPitch:channel('Head nod',-45,60),
 armL:channel('Left arm forward',-90,90),armR:channel('Right arm forward',-90,90),
 armSideL:channel('Left arm sideways',-90,90),armSideR:channel('Right arm sideways',-90,90),
 elbowL:channel('Left elbow',-30,135),elbowR:channel('Right elbow',-30,135),
 handL:channel('Left hand',-90,90),handR:channel('Right hand',-90,90),
 bodyLean:channel('Body lean',-40,40),bodyTurn:channel('Body turn',-60,60),nose:channel('Nose',-.03,.03,.005),
});
export const PROP_CHANNELS=Object.freeze({
 x:channel('Position',-5,5,.05),y:channel('Height',-3,5,.05),z:channel('Depth',-5,5,.05),
 rx:channel('Tilt',-180,180),ry:channel('Turn',-180,180),rz:channel('Roll',-180,180),
 width:channel('Width',.01,3,.01,.3),height:channel('Height',.01,3,.01,.4),depth:channel('Thickness',.005,3,.005,.05),
});
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const finite=(n,min,max,label)=>{if(!Number.isFinite(n)||n<min||n>max)throw Error(`Invalid ${label}`);};
const id=v=>typeof v==='string'&&/^[a-zA-Z0-9-]{1,80}$/.test(v);
const descriptors=target=>target.startsWith('actor:')?ACTOR_CHANNELS:PROP_CHANNELS;
function subject(scene,target){
 if(typeof target!=='string')return undefined;
 if(/^actor:[01]$/.test(target))return scene?.actors?.[Number(target.slice(6))];
 if(target.startsWith('prop:'))return scene?.props?.find(p=>p.id===target.slice(5));
}
export function animationSettings(project){return project.animation??{mode:'speech',duration:0,drawings:3,keys:[]};}
export function targetValues(scene,target){
 const value=subject(scene,target);if(!value)throw Error('Invalid animation target');
 return Object.fromEntries(Object.entries(descriptors(target)).map(([k,d])=>[k,value[k]??d.default]));
}
function validateValues(values,target,label){
 if(!object(values)||!Object.keys(values).length)throw Error(`Invalid ${label}`);
 const channels=descriptors(target);
 for(const [k,v] of Object.entries(values)){
  if(!Object.hasOwn(channels,k))throw Error(`Invalid ${label} channel`);
  finite(v,channels[k].min,channels[k].max,label);
 }
}
export function validateProps(scene){
 if(scene.props===undefined)return scene;
 if(!Array.isArray(scene.props)||scene.props.length>12)throw Error('Invalid props');
 const ids=new Set();
 for(const p of scene.props){
  if(!object(p)||!id(p.id)||ids.has(p.id)||!['book','cube','sphere','prism'].includes(p.kind))throw Error('Invalid prop');
  ids.add(p.id);
  if(!/^#[0-9a-f]{6}$/i.test(p.color)||!['world','actor:0:left','actor:0:right','actor:1:left','actor:1:right'].includes(p.attachment))throw Error('Invalid prop appearance or attachment');
  for(const [k,d] of Object.entries(PROP_CHANNELS))finite(p[k],d.min,d.max,`prop ${k}`);
 }
 return scene;
}
export function validateAnimation(project){
 if(project.animation===undefined)return project;
 const a=project.animation;
 if(!object(a)||Object.keys(a).some(k=>!['mode','duration','drawings','keys'].includes(k))||!['speech','silent'].includes(a.mode)||![3,5,9].includes(a.drawings)||!Array.isArray(a.keys)||a.keys.length>1000)throw Error('Invalid animation settings');
 finite(a.duration,a.mode==='silent'?.5:0,120,'animation duration');
 const ids=new Set(),times=new Set();
 for(const k of a.keys){
  if(!object(k)||Object.keys(k).some(n=>!['id','target','time','values','transition'].includes(n))||!id(k.id)||ids.has(k.id)||!subject(project.scene,k.target)||!['auto','ease','hold','wipe'].includes(k.transition))throw Error('Invalid animation key');
  finite(k.time,0,120,'animation key time');
  const stamp=`${k.target}:${k.time}`;if(times.has(stamp))throw Error('Duplicate animation key time');
  ids.add(k.id);times.add(stamp);validateValues(k.values,k.target,'animation key');
 }
 return project;
}
export function validateMotionWipes(state){
 if(state.motionWipes===undefined)return;
 if(!Array.isArray(state.motionWipes)||!state.motionWipes.length||state.motionWipes.length>14)throw Error('Invalid drawing wipe');
 const targets=new Set();
 for(const w of state.motionWipes){
  if(!object(w)||Object.keys(w).some(k=>!['target','from','to'].includes(k))||!subject(state.scene,w.target)||targets.has(w.target))throw Error('Invalid drawing wipe');
  targets.add(w.target);validateValues(w.from,w.target,'drawing wipe');validateValues(w.to,w.target,'drawing wipe');
  if(JSON.stringify(Object.keys(w.from).sort())!==JSON.stringify(Object.keys(w.to).sort()))throw Error('Invalid drawing wipe endpoints');
 }
}
const round=n=>Math.round(n*1e6)/1e6||0;
const circular=k=>['yaw','rx','ry','rz'].includes(k);
function channelDelta(k,from,to){
 const delta=to-from;
 return circular(k)?delta>180?delta-360:delta< -180?delta+360:delta:delta;
}
const mix=(from,to,amount)=>Object.fromEntries(Object.keys(from).map(k=>{
 // Preserve authored endpoints; only intermediate circular angles normalize.
 if(amount===0)return [k,from[k]];if(amount===1)return [k,to[k]];
 let value=from[k]+channelDelta(k,from[k],to[k])*amount;
 if(circular(k))value=((value+180)%360+360)%360-180;
 return [k,round(value)];
}));
function largeRapid(from,to,seconds){
 if(seconds>.25)return false;
 return Object.keys(from).some(k=>{
  const delta=Math.abs(channelDelta(k,from[k],to[k]));
  return ['x','y','z'].includes(k)?delta>=.35&&delta/seconds>=2:
   ['scale','width','height','depth','nose'].includes(k)?false:delta>=40&&delta/seconds>=180;
 });
}
export function applyMotion(state,project,time,fps=project.fps){
 const settings=animationSettings(project);if(!settings.keys.length)return state;
 const targets=[...new Set(settings.keys.map(k=>k.target))].sort();
 for(const target of targets){
  const actor=subject(state.scene,target);if(!actor)continue;
  const keys=settings.keys.filter(k=>k.target===target).sort((a,b)=>a.time-b.time);
  const channels=Object.keys(descriptors(target)).filter(k=>keys.some(key=>Object.hasOwn(key.values,k)));
  const base=targetValues(project.scene,target);
  let from=Object.fromEntries(channels.map(k=>[k,base[k]])),start=0,applied=from;
  for(const key of keys){
   const to={...from,...key.values};
   const span=key.time-start;
   const changed=channels.some(k=>channelDelta(k,from[k],to[k])!==0);
   const wipe=span>0&&changed&&(key.transition==='wipe'||key.transition==='auto'&&largeRapid(from,to,span));
   const wipeFrame=Math.floor((start+span/2)*fps),frame=Math.floor(time*fps);
   // Even a transition shorter than one sample gets its authored wipe frame.
   if(time>=key.time&&!(wipe&&frame===wipeFrame)){from=to;start=key.time;applied=to;continue;}
   if(span<=0)break;
   if(wipe){
    applied=frame<wipeFrame?from:frame>wipeFrame?to:mix(from,to,.5);
    if(frame===wipeFrame){
     // Canonical endpoint order lets reverse moves reuse the same drawing.
     const endpoints=[from,to].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
     (state.motionWipes??=[]).push({target,from:{...endpoints[0]},to:{...endpoints[1]}});
    }
   }else if(key.transition==='hold')applied=from;
   else{
    const u=Math.max(0,Math.min(1,(time-start)/span)),eased=u*u*(3-2*u);
    applied=mix(from,to,Math.round(eased*(settings.drawings-1))/(settings.drawings-1));
   }
   break;
  }
  const baseline=subject(project.scene,target),defaults=descriptors(target);
  for(const [channel,value] of Object.entries(applied)){
   // Optional rest channels did not exist in old drawing identities. Avoid
   // creating a second drawing for a full snapshot of that same resting pose.
   if(!Object.hasOwn(baseline,channel)&&value===defaults[channel].default)delete actor[channel];
   else actor[channel]=value;
  }
 }
 return state;
}
// Adapted from comic-engine's gesture-performance/actor motion bank. One clear
// anticipation, action and settle replaces its continuous procedural cycles.
const preset=(label,duration,beats)=>Object.freeze({label,duration,beats});
export const MOTION_PRESETS=Object.freeze({
 nod:preset('Nod',.9,[[0,{}],[.18,{headPitch:-6}],[.42,{headPitch:17}],[.7,{headPitch:-3}],[.9,{}]]),
 'look-book':preset('Look at book',1.4,[[0,{}],[.2,{headPitch:-3}],[.65,{headPitch:28,headYaw:-12}],[1.1,{headPitch:28,headYaw:-12}],[1.4,{}]]),
 explain:preset('Explain',1.5,[[0,{}],[.2,{armR:-8,bodyLean:-3}],[.65,{armR:38,elbowR:38,armSideR:-12,handR:15,bodyLean:4}],[1.05,{armR:38,elbowR:38,armSideR:-12,handR:15,bodyLean:4}],[1.5,{}]]),
 shrug:preset('Shrug',1.2,[[0,{}],[.2,{bodyLean:3}],[.55,{armL:13,armR:13,elbowL:46,elbowR:46,armSideL:16,armSideR:-16,headTilt:7}],[.85,{armL:13,armR:13,elbowL:46,elbowR:46,armSideL:16,armSideR:-16,headTilt:7}],[1.2,{}]]),
 point:preset('Point',1.3,[[0,{}],[.2,{armR:-10,bodyTurn:-4}],[.55,{armR:62,elbowR:10,armSideR:-12,bodyTurn:8}],[.95,{armR:62,elbowR:10,armSideR:-12,bodyTurn:8}],[1.3,{}]]),
 wave:preset('Wave',1.6,[[0,{}],[.2,{armR:-8}],[.5,{armR:65,elbowR:65,armSideR:-25,handR:-25}],[.8,{armR:65,elbowR:65,armSideR:-25,handR:25}],[1.1,{armR:65,elbowR:65,armSideR:-25,handR:-25}],[1.6,{}]]),
});
export function addGesture(project,target,presetId,time=0){
 if(!/^actor:[01]$/.test(target)||!Object.hasOwn(MOTION_PRESETS,presetId))throw Error('Invalid gesture');
 finite(time,0,120,'gesture time');
 const p=structuredClone(project),preset=MOTION_PRESETS[presetId];
 if(time+preset.duration>120)throw Error('Gesture exceeds two minutes');
 p.animation=structuredClone(animationSettings(p));
 const state={scene:structuredClone(p.scene)};applyMotion(state,p,time,p.fps);
 const base=targetValues(state.scene,target);
 const additions=preset.beats.map(([offset,delta])=>({id:globalThis.crypto.randomUUID(),target,time:round(time+offset),transition:'ease',values:Object.fromEntries(Object.entries(base).map(([k,v])=>[k,round(Math.max(ACTOR_CHANNELS[k].min,Math.min(ACTOR_CHANNELS[k].max,v+(delta[k]??0))))]))}));
 p.animation.keys=p.animation.keys.filter(k=>k.target!==target||k.time<time||k.time>time+preset.duration).concat(additions);
 if(p.animation.mode==='silent')p.animation.duration=Math.max(p.animation.duration,time+preset.duration);
 validateAnimation(p);return p;
}
