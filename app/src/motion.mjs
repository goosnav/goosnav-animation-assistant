import { ACTION_BANK } from './action-bank.mjs';
// Posed animation: a small, deterministic set of drawings between authored keys.
const channel=(label,min,max,step=1,value=0)=>Object.freeze({label,min,max,step,default:value});
export const ACTOR_CHANNELS=Object.freeze({
 x:channel('Position',-20,20,.05),y:channel('Height',-10,10,.05),z:channel('Depth',-20,20,.05),
 yaw:channel('Turn',-180,180),scale:channel('Size',.5,1.5,.05,1),
 headYaw:channel('Head turn',-75,75),headTilt:channel('Head tilt',-35,35),headPitch:channel('Head nod',-45,60),
 armL:channel('Left arm forward',-180,180),armR:channel('Right arm forward',-180,180),
 armSideL:channel('Left arm sideways',-150,150),armSideR:channel('Right arm sideways',-150,150),
 elbowL:channel('Left elbow',-30,135),elbowR:channel('Right elbow',-30,135),
 handL:channel('Left hand',-90,90),handR:channel('Right hand',-90,90),
 thighL:channel('Left upper leg',-100,100),thighR:channel('Right upper leg',-100,100),
 kneeL:channel('Left knee',0,145),kneeR:channel('Right knee',0,145),footL:channel('Left foot',-80,80),footR:channel('Right foot',-80,80),
 footIK:channel('Foot contact solver',0,1,.1),footForwardL:channel('Left foot reach',-2,2,.05),footForwardR:channel('Right foot reach',-2,2,.05),footLiftL:channel('Left foot lift',0,1,.02),footLiftR:channel('Right foot lift',0,1,.02),groundY:channel('Foot ground',-10,10,.05),
 rootPitch:channel('Whole body pitch',-180,180),rootRoll:channel('Whole body roll',-180,180),
 fingerCurlL:channel('Left fist',0,1,.1),fingerCurlR:channel('Right fist',0,1,.1),fingerPointL:channel('Left point fingers',0,1,.1),fingerPointR:channel('Right point fingers',0,1,.1),
 headSpin:channel('Head spin',-1440,1440,15),headScale:channel('Head size',.5,4,.1,1),handScale:channel('Hand size',.5,3,.1,1),
 flatten:channel('Flatten',0,1,.05),burst:channel('Explosion',0,1,.05),noseDetach:channel('Detached nose',0,1,.05),noseGrip:channel('Grip detached nose',0,1,.1),noseContact:channel('Nose contact',0,1,.1),armStretchR:channel('Right arm stretch',1,2,.05,1),
 contactHand:channel('Hand contact shape',0,3,1),
 contactLeft:channel('Left hand contact',0,1,.1),contactLX:channel('Left contact X',-20,20,.05),contactLY:channel('Left contact height',-10,10,.05),contactLZ:channel('Left contact depth',-20,20,.05),
 contact:channel('Right hand contact',0,1,.1),contactX:channel('Contact X',-20,20,.05),contactY:channel('Contact height',-10,10,.05),contactZ:channel('Contact depth',-20,20,.05),
 bodyLean:channel('Body lean',-40,40),bodyTurn:channel('Body turn',-60,60),nose:channel('Nose',-.03,.03,.005),
});
export const PROP_CHANNELS=Object.freeze({
 open:channel('Book opening',0,1,.05),page:channel('Page turn',0,1,.05),
 x:channel('Position',-20,20,.05),y:channel('Height',-10,10,.05),z:channel('Depth',-20,20,.05),
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
  if(!object(p)||!id(p.id)||ids.has(p.id)||!['book','cube','sphere','prism','goose'].includes(p.kind))throw Error('Invalid prop');
  ids.add(p.id);
  if(!/^#[0-9a-f]{6}$/i.test(p.color)||!['world','actor:0:left','actor:0:right','actor:1:left','actor:1:right'].includes(p.attachment))throw Error('Invalid prop appearance or attachment');
  for(const [k,d] of Object.entries(PROP_CHANNELS))if(!['open','page'].includes(k)||p[k]!==undefined)finite(p[k],d.min,d.max,`prop ${k}`);
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
// Every action is expanded at authoring time. Rendering only sees saved poses.
export const MOTION_PRESETS=ACTION_BANK;
function sampled(project,target,time){const state={scene:structuredClone(project.scene)};applyMotion(state,project,time,project.fps);return targetValues(state.scene,target);}
function writeKeys(p,target,time,duration,beats,base,{strength=1,absolute=false}={}){
 const ds=descriptors(target);
 const additions=beats.map(([fraction,delta,transition])=>{
  const values={...base};for(const [k,v]of Object.entries(delta)){let n=absolute?v:base[k]+v*strength;if(circular(k))n=((n+180)%360+360)%360-180;else if(!absolute&&!['x','y','z'].includes(k))n=Math.max(ds[k].min,Math.min(ds[k].max,n));values[k]=round(n);}
  for(const [k,v]of Object.entries(values))finite(v,ds[k].min,ds[k].max,`action ${k}; reduce distance or strength`);
  return {id:globalThis.crypto.randomUUID(),target,time:round(time+fraction*duration),transition:transition??(absolute?'ease':'auto'),values};
 });
 p.animation.keys=p.animation.keys.filter(k=>k.target!==target||k.time<time||k.time>round(time+duration)).concat(additions);
}
function releaseSolvers(base,beats=[],all=false){
 const channels=new Set(beats.flatMap(([,values])=>Object.keys(values)));
 if(all||[...channels].some(k=>/^(armR|armSideR|elbowR|handR|finger.*R)$/.test(k))){base.contact=0;base.noseGrip=0;base.contactHand=0;base.armStretchR=1;}
 if(all||[...channels].some(k=>/^(armL|armSideL|elbowL|handL|finger.*L)$/.test(k)))base.contactLeft=0;
 if(all||[...channels].some(k=>/^(thigh|knee|foot)[LR]$/.test(k)))base.footIK=0;
 if(all||[...channels].some(k=>/^(head|root|x$|y$|z$|yaw$)/.test(k)))base.noseContact=0;
 return base;
}
function ready(project,target,time,duration){
 if(!/^actor:[01]$/.test(target)||+target.slice(6)>=project.scene.count)throw Error('Choose a visible character');
 finite(time,0,120,'action time');finite(duration,.2,60,'action duration');if(time+duration>120)throw Error('Action exceeds two minutes');
 const p=structuredClone(project);p.animation=structuredClone(animationSettings(p));if(p.animation.mode==='silent')p.animation.duration=Math.max(p.animation.duration,round(time+duration));return p;
}
export function addGesture(project,target,presetId,time=0,options={}){
 const preset=MOTION_PRESETS[presetId];if(!preset)throw Error('Invalid gesture');
 const duration=options.duration??preset.duration,strength=options.strength??1;finite(strength,.25,2,'action strength');
 if(presetId==='walk_away'){
  const p=ready(project,target,time,duration),base=sampled(p,target,time),source=structuredClone(p);Object.assign(source.scene.actors[+target.slice(6)],base);source.animation={mode:'silent',duration:.5,drawings:p.animation.drawings,keys:[]};
  const walk=addWalk(source,target,0,{steps:4,stride:.3*strength,cadence:2,direction:+target.slice(6)===0?-90:90});
  writeKeys(p,target,time,duration,walk.animation.keys.map(k=>[k.time/2.3,k.values,k.transition]),base,{absolute:true});validateAnimation(p);return p;
 }
 const p=ready(project,target,time,duration),base=releaseSolvers(sampled(p,target,time),preset.beats,preset.group!=='Gestures');
 if(preset.group==='Partner'){
  const partner=options.partner??`actor:${1-Number(target.slice(6))}`;
  if(partner===target||!/^actor:[01]$/.test(partner)||+partner.slice(6)>=p.scene.count)throw Error('This action needs a second visible character partner');
  const other=releaseSolvers(sampled(p,partner,time),[],true),cx=(base.x+other.x)/2,cz=(base.z+other.z)/2;
  const dx=other.x-base.x,dz=other.z-base.z,len=Math.hypot(dx,dz)||1,ux=len===1&&dx===0&&dz===0?1:dx/len,uz=dz/len;
  const face=Math.atan2(ux,uz)*180/Math.PI,opposite=face>0?face-180:face+180;
  const profile=(model)=>model==='billy-v2'?{shoulder:.586,head:.68,reach:.233}:model==='billy'?{shoulder:.61,head:.67,reach:.253}:model.startsWith('v12-fat')?{shoulder:1.247,head:1.441,reach:.505}:{shoulder:1.3,head:1.487,reach:.505};
  const pa=profile(p.scene.actors[+target.slice(6)].model),pb=profile(p.scene.actors[+partner.slice(6)].model),small=Math.min(pa.reach*base.scale,pb.reach*other.scale),separation=presetId==='nose_touch'?.75:small<.3?.7:1;
  const stance=(b,sign,yaw)=>({...b,x:cx+sign*ux*separation/2,z:cz+sign*uz*separation/2,yaw});
  const a=stance(base,-1,face),b=stance(other,1,opposite),part=presetId==='nose_touch'?'head':'shoulder';
  const top=Math.max(base.y+pa[part]*base.scale,other.y+pb[part]*other.scale);a.y=top-pa[part]*base.scale;b.y=top-pb[part]*other.scale;
  const share=pa.reach*base.scale/(pa.reach*base.scale+pb.reach*other.scale),height=top+(presetId==='high_five'?small*.35:-small*.25),bias=(share-.5)*.38;
  const contact={contact:1,contactHand:presetId==='high_five'?2:1,fingerCurlR:presetId==='handshake'?.6:0,armStretchR:1.6,contactX:a.x+(b.x-a.x)*share+uz*bias,contactY:height,contactZ:a.z+(b.z-a.z)*share-ux*bias};
  let aa,bb;
  if(['handshake','high_five'].includes(presetId)){
   aa=[[0,base],[.2,a],[.4,{...a,...contact,armR:75,elbowR:55}],[.6,{...a,...contact,contactY:height+(presetId==='handshake'?-.1:.04),armR:75,elbowR:55}],[.8,{...a,...contact,armR:75,elbowR:55}],[1,base]];
   bb=aa.map(([t,v])=>[t,t===0||t===1?other:{...b,armR:v.armR??0,elbowR:v.elbowR??0,...(v.contact?{...contact,contactY:v.contactY}:{})}]);
  }else if(presetId==='nose_touch'){
   aa=[[0,base],[.25,a],[.5,{...a,headTilt:8,noseContact:1}],[.75,{...a,headTilt:-5,noseContact:1}],[1,base]];bb=[[0,other],[.25,b],[.5,{...b,headTilt:-8,noseContact:1}],[.75,{...b,headTilt:5,noseContact:1}],[1,other]];
  }else if(presetId==='punch'){
   const step=pa.reach*base.scale<.3?.36:.38,impact={...a,x:a.x+ux*step,z:a.z+uz*step,armR:95,elbowR:0,fingerCurlR:1,contact:1,contactHand:3,armStretchR:1.9,contactX:b.x-ux*.16*other.scale,contactY:top-.08*other.scale,contactZ:b.z-uz*.16*other.scale};
   aa=[[0,base],[.2,{...a,armR:-45,elbowR:110,bodyTurn:-25}],[.38,impact],[.55,{...impact,contact:0,armR:95}],[1,base]];
   bb=[[0,other],[.2,b],[.38,b],[.65,{...b,x:b.x+ux*.7,z:b.z+uz*.7,y:.4,rootRoll:-55,armL:90,armR:-65,thighL:40,kneeR:75}],[.85,{...b,x:b.x+ux*.9,z:b.z+uz*.9,rootPitch:80,y:.15}],[1,other]];
  }else{
   aa=[[0,base],[.2,{...base,armSideL:80,armSideR:-80}],[.6,{...base,y:base.y+2,armSideL:80,armSideR:-80}],[.85,{...base,y:base.y+3,armSideL:80,armSideR:-80}],[1,base]];
   bb=[[0,other],[.2,{...other,headYaw:Math.max(-60,Math.min(60,opposite-other.yaw))}],[.6,{...other,headPitch:-40,armR:50}],[.85,{...other,headPitch:-40}],[1,other]];
  }
  writeKeys(p,target,time,duration,aa,base,{absolute:true});writeKeys(p,partner,time,duration,bb,other,{absolute:true});
 }else if(preset.group==='Book'){
  const short=/^billy/.test(p.scene.actors[+target.slice(6)].model),size=(short?.5:1)*base.scale,angle=base.yaw*Math.PI/180,forward=.36*size,bx=base.x+Math.sin(angle)*forward,bz=base.z+Math.cos(angle)*forward;
  p.scene.props??=[];let book=options.prop?p.scene.props.find(q=>q.id===options.prop||`prop:${q.id}`===options.prop):p.scene.props.find(q=>q.kind==='book');
  if(options.prop&&!book)throw Error('Choose an existing book');if(book&&book.kind!=='book')throw Error('This action needs a book');
  if(!book){if(p.scene.props.length>=12)throw Error('Make room for a book (12 prop limit)');book={id:globalThis.crypto.randomUUID(),kind:'book',color:'#c87843',attachment:'world',x:bx,y:base.y+.93*size,z:bz,rx:65,ry:base.yaw,rz:0,width:short?.25:.36,height:short?.32:.46,depth:.05,open:0,page:0};p.scene.props.push(book);}
  // Attachment belongs to the persistent scene. Never rewrite it while
  // authoring a later action: that would reinterpret every earlier local key.
  if(book.attachment!=='world'){
   if(['place','throw'].includes(presetId))throw Error('Place and throw need a world-placed book. Set Attach to World first.');
   const pb=sampled(p,`prop:${book.id}`,time),opened=['open','turn','hold','read'].includes(presetId)?1:0;
   const beats=presetId==='turn'?[[0,pb],[.35,{...pb,open:1,page:.3}],[.75,{...pb,open:1,page:.8}],[1,{...pb,open:1,page:1}]]:[[0,pb],[.2,pb],[presetId==='slam'?.4:.75,{...pb,open:opened}],[1,{...pb,open:opened}]];
   writeKeys(p,`prop:${book.id}`,time,duration,beats,pb,{absolute:true});
   writeKeys(p,target,time,duration,[[0,base],[.25,{...base,headPitch:20}],[.75,{...base,headPitch:20}],[1,base]],base,{absolute:true});
   validateProps(p.scene);validateAnimation(p);return p;
  }
  // World-space paths keep release/throw fully editable without attachment switches.
  const pb=sampled(p,`prop:${book.id}`,time),hold={...pb,x:bx,y:base.y+1.12*size,z:bz,rx:15,open:1},table={...pb,x:bx,y:base.y+.72*size,z:bz+.08*size,rx:80};
  let beats;
  if(presetId==='open')beats=[[0,{...pb,open:0}],[.2,{...pb,open:0}],[.7,{...pb,open:1}],[1,{...pb,open:1}]];
  if(presetId==='turn')beats=[[0,{...pb,open:1,page:0}],[.3,{...pb,open:1,page:.3}],[.7,{...pb,open:1,page:.8}],[1,{...pb,open:1,page:1}]];
  if(presetId==='hold'||presetId==='read')beats=[[0,{...pb,open:1}],[.4,hold],[.8,hold],[1,hold]];
  if(presetId==='place')beats=[[0,hold],[.3,hold],[.75,{...table,open:1}],[1,{...table,open:1}]];
  if(presetId==='close'||presetId==='slam')beats=[[0,{...pb,open:1}],[.3,{...pb,open:1}],[presetId==='slam'?.45:.8,{...pb,open:0}],[1,{...pb,open:0}]];
  if(presetId==='throw')beats=[[0,hold],[.25,{...hold,y:1.45,z:base.z+.15,rx:-40}],[.5,{...hold,x:base.x+1,y:1.8,open:0,rz:90}],[.8,{...hold,x:base.x+1.8,y:.5,open:0,rz:175}],[1,{...hold,x:base.x+2,y:.07,rx:90,open:0,rz:175}]];
  writeKeys(p,`prop:${book.id}`,time,duration,beats,pb,{absolute:true});
  const actorBeats=beats.map(([t,v])=>[t,{...base,armL:35,elbowL:40,armR:40,elbowR:70,headPitch:presetId==='read'?25:15,armStretchR:1.5,contactHand:0,contact:t===1&&['throw','place','slam','close'].includes(presetId)?0:1,contactX:v.x-Math.cos(angle)*book.width*.4,contactY:v.y,contactZ:v.z+Math.sin(angle)*book.width*.4,contactLeft:presetId==='throw'||t===1&&['place','slam','close'].includes(presetId)?0:1,contactLX:v.x+Math.cos(angle)*book.width*.4,contactLY:v.y,contactLZ:v.z-Math.sin(angle)*book.width*.4}]);
  if(presetId==='throw')actorBeats.splice(2,actorBeats.length-2,[.5,{...base,armR:105,elbowR:0}],[1,base]);
  writeKeys(p,target,time,duration,actorBeats,base,{absolute:true});
 }else{
  writeKeys(p,target,time,duration,preset.beats,base,{strength});
  if(presetId==='goose_chase'){
   p.scene.props??=[];let goose=p.scene.props.find(q=>q.kind==='goose');if(!goose){if(p.scene.props.length>=12)throw Error('Make room for the goose (12 prop limit)');goose={id:globalThis.crypto.randomUUID(),kind:'goose',color:'#ffffff',attachment:'world',x:base.x-.5,y:0,z:base.z+.2,rx:0,ry:90,rz:0,width:.55,height:.55,depth:.55};p.scene.props.push(goose);}
   const gb=targetValues(p.scene,`prop:${goose.id}`);writeKeys(p,`prop:${goose.id}`,time,duration,[[0,gb],[.2,{...gb,y:.1}],[.4,{...gb,x:gb.x+.5,y:0}],[.6,{...gb,x:gb.x+1,y:.07}],[.8,{...gb,x:gb.x+1.6,y:0}],[1,{...gb,x:gb.x+2,y:0}]],gb,{absolute:true});
  }
 }
 validateProps(p.scene);validateAnimation(p);return p;
}
export function addWalk(project,target,time=0,options={}){
 const {steps=4,stride=.25,cadence=2,direction=project.scene.actors[Number(target?.slice(6))]?.yaw??0,inPlace=false}=options;
 finite(steps,1,12,'walk steps');if(!Number.isInteger(steps))throw Error('Walk steps must be whole numbers');finite(stride,.1,1,'walk stride');finite(cadence,.5,6,'walk cadence');finite(direction,-180,180,'walk direction');if(typeof inPlace!=='boolean')throw Error('Invalid walk in-place setting');
 const duration=steps/cadence+.3,p=ready(project,target,time,duration),base=releaseSolvers(sampled(p,target,time),[],true),beats=[[0,base]],heading=direction*Math.PI/180;
 // Contact, down, passing, up: eight distinct silhouettes form a repeatable
 // two-step cycle. Forward leg opposes forward arm. Stop closes both feet.
 const amp=Math.asin(Math.min(.85,stride/(.88*base.scale)))*180/Math.PI;
 const phases=[[amp,0,-amp,0,0],[amp*.65,12,-amp*.7,4,-.025],[0,48,0,0,0],[-amp*.65,22,amp*.65,0,.025]];
 for(let step=0;step<steps;step++)for(let phase=0;phase<4;phase++){
  const age=(step+(phase+1)/4)/cadence,travel=inPlace?0:(step+(phase+1)/4)*stride;
  const [lead,knee,trail,trailKnee,bob]=phases[phase],swap=step%2===1;
  const l=swap?trail:lead,r=swap?lead:trail,u=(phase+1)/4,center=(step+u)*stride;
  const previous=step===0?0:(step-1)*stride,landing=(step+1)*stride,offset=.5*stride,swing=previous+(landing-previous)*(u*u*(3-2*u))-center+offset,support=step*stride-center+offset,lift=Math.sin(u*Math.PI)*.12,drop=Math.max(swing*swing,support*support)/(1.5*base.scale);
  beats.push([age/duration,{...base,x:round(base.x+Math.sin(heading)*travel),z:round(base.z+Math.cos(heading)*travel),y:round(base.y+bob*base.scale-drop),yaw:direction,footIK:1,groundY:base.y,footForwardL:swap?support:swing,footForwardR:swap?swing:support,footLiftL:swap?0:lift,footLiftR:swap?lift:0,thighL:l,thighR:r,kneeL:swap?trailKnee:knee,kneeR:swap?knee:trailKnee,footL:Math.max(-80,Math.min(80,-l-(swap?trailKnee:knee))),footR:Math.max(-80,Math.min(80,-r-(swap?knee:trailKnee))),armL:-l*.75,armR:-r*.75,elbowL:12,elbowR:12,bodyLean:3}]);
 }
 beats.push([1,{...base,x:round(base.x+(inPlace?0:Math.sin(heading)*steps*stride)),z:round(base.z+(inPlace?0:Math.cos(heading)*steps*stride)),yaw:direction}]);
 writeKeys(p,target,time,duration,beats.map(([t,v])=>[t,v,'hold']),base,{absolute:true});validateAnimation(p);return p;
}
