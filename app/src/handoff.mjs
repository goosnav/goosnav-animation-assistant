import {compileClip,dimensions,newProject,validateProject} from './core.mjs';
import {ACTOR_CHANNELS,PROP_CHANNELS,animationSettings} from './motion.mjs';
import {MAX_TRANSFER_FRAMES,TRANSFER_FPS,transferSlots,validateTransfer} from './drawing-transfer.mjs';

const MAX_BYTES=5_000_000,MAX_DRAWINGS=2000,MAX_FRAMES=2880;
const fail=(message,code)=>{const error=Error(`Drawing handoff: ${message}`);if(code)error.code=code;throw error;};
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function fields(value,allowed){if(!object(value)||Object.keys(value).some(k=>!allowed.includes(k)))fail('invalid or unknown metadata field');}
function bounded(value,min,max){return Number.isFinite(value)&&value>=min&&value<=max;}
function inspect(value,depth=0){
 if(depth>12)fail('metadata is nested too deeply');
 if(!value||typeof value!=='object')return;
 for(const [key,child]of Object.entries(value)){
  if(['__proto__','prototype','constructor'].includes(key))fail('reserved metadata field');
  inspect(child,depth+1);
 }
}
// Project/line IDs and object insertion order are not drawing identity.
function canonical(value){
 if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;
 if(object(value))return `{${Object.keys(value).filter(k=>value[k]!==undefined).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
 return JSON.stringify(value);
}
function sceneFields(scene){
 fields(scene,['format','style','background','backdrop','count','camera','actors','props']);
 fields(scene.camera,['projection','azimuth','elevation','zoom','targetX','targetY']);
 if(!Array.isArray(scene.actors)||scene.actors.length>2)fail('invalid drawing actors');
 for(const actor of scene.actors)fields(actor,['model','pose','chair','emotion',...Object.keys(ACTOR_CHANNELS)]);
 if(scene.props!==undefined){if(!Array.isArray(scene.props)||scene.props.length>12)fail('invalid drawing props');for(const prop of scene.props)fields(prop,['id','kind','color','attachment',...Object.keys(PROP_CHANNELS)]);}
}
function dialogue(line){
 return {actor:line.actor,text:line.text,rate:line.rate,pause:line.pause,pose:line.pose,headYaw:line.headYaw??0,blink:!!line.blink,smear:!!line.smear,...(line.emotion!==undefined?{emotion:line.emotion}:{})};
}
function source(project){
 const animation=animationSettings(project);
 return canonical({fps:project.fps,rate:project.rate,scene:project.scene,dialogue:project.lines.map(dialogue),animation:{...animation,keys:animation.keys.map(({id,...key})=>key)},overrides:project.overrides});
}
function parseCanonical(text,label){
 if(typeof text!=='string'||text.length>MAX_BYTES)fail(`invalid ${label}`);
 let value;try{value=JSON.parse(text);}catch{fail(`invalid ${label}`);}
 inspect(value);if(canonical(value)!==text)fail(`noncanonical ${label}`);return value;
}
function decodeSource(text){
 const value=parseCanonical(text,'source');fields(value,['fps','rate','scene','dialogue','animation','overrides']);sceneFields(value.scene);
 if(!Array.isArray(value.dialogue)||value.dialogue.length>30)fail('invalid source dialogue');
 for(const line of value.dialogue){
  fields(line,['actor','text','rate','pause','pose','headYaw','blink','smear','emotion']);
  if(typeof line.blink!=='boolean'||typeof line.smear!=='boolean')fail('invalid source dialogue flags');
 }
 fields(value.animation,['mode','duration','drawings','keys']);
 if(!Array.isArray(value.animation.keys)||value.animation.keys.length>1000)fail('invalid source keys');
 value.animation.keys.forEach(key=>fields(key,['target','time','values','transition']));
 if(!Array.isArray(value.overrides)||value.overrides.length>2000)fail('invalid source mouth edits');
 value.overrides.forEach(o=>fields(o,['actor','start','end','mouth']));
 const p={...newProject(),fps:value.fps,rate:value.rate,scene:value.scene,lines:value.dialogue.map((l,i)=>({id:`line-${i}`,...l})),animation:{...value.animation,keys:value.animation.keys.map((k,i)=>({id:`key-${i}`,...k}))},overrides:value.overrides};
 validateProject(p);return value;
}
function decodeSlots(handoff){
 return handoff.slots.map(({id,key})=>({id,key,state:JSON.parse(key),active:false}));
}
function transferFor(project,slots,id){
 if(slots.length>MAX_TRANSFER_FRAMES)return null;
 const [width,height]=dimensions(project);
 return validateTransfer({version:2,id:id??slots[0].id.slice(1),fps:TRANSFER_FPS,width,height,slots:slots.map(({id,key})=>({id,key}))});
}
function sameTimeline(a,b){
 if(a.fps!==b.fps||a.totalFrames!==b.totalFrames||a.exposures.length!==b.exposures.length)return false;
 const states=clip=>new Map(clip.slots.map(s=>[s.id,canonical(s.state)])),left=states(a),right=states(b);
 return a.exposures.every((e,i)=>e.startFrame===b.exposures[i].startFrame&&e.endFrame===b.exposures[i].endFrame&&left.get(e.slotId)===right.get(b.exposures[i].slotId));
}

/** Validate the complete portable metadata, including states encoded as JSON strings. */
export function validateHandoff(handoff){
 let text;try{text=JSON.stringify(handoff);}catch{fail('invalid metadata');}
 if(!text||text.length>MAX_BYTES||new TextEncoder().encode(text).length>MAX_BYTES)fail('metadata exceeds 5 MB');
 inspect(handoff);fields(handoff,['version','id','fps','width','height','source','slots','speech','totalFrames','exposures']);
 if(handoff.version!==1||handoff.fps!==24||typeof handoff.id!=='string'||!/^[a-z0-9-]{1,80}$/.test(handoff.id)
  ||![[1080,1920],[1920,1080]].some(([w,h])=>handoff.width===w&&handoff.height===h))fail('unsupported format, version, or dimensions');
 const original=decodeSource(handoff.source);
 if(original.fps!==handoff.fps||dimensions({scene:original.scene}).some((n,i)=>n!==[handoff.width,handoff.height][i]))fail('source dimensions do not match');
 if(!Array.isArray(handoff.slots)||!handoff.slots.length||handoff.slots.length>MAX_DRAWINGS)fail('expected 1–2000 drawing identities');
 const ids=new Set(),keys=new Set(),slots=[];
 for(const slot of handoff.slots){
  fields(slot,['id','key']);
  if(typeof slot.id!=='string'||!/^d[a-z0-9-]{1,64}$/.test(slot.id)||ids.has(slot.id))fail('duplicate or invalid drawing identity');
  const state=parseCanonical(slot.key,'drawing state');fields(state,['scene','mouths','blinks','smears','motionWipes']);sceneFields(state.scene);
  if(keys.has(slot.key))fail('duplicate drawing state');
  ids.add(slot.id);keys.add(slot.key);slots.push({...slot,state});
 }
 validateProject({...newProject(),slots});
 if(!Number.isInteger(handoff.totalFrames)||!bounded(handoff.totalFrames,1,MAX_FRAMES)||!Array.isArray(handoff.exposures)||!handoff.exposures.length||handoff.exposures.length>MAX_FRAMES)fail('invalid exposure timeline');
 let end=0;for(const exposure of handoff.exposures){
  fields(exposure,['slotId','startFrame','endFrame']);
  if(!ids.has(exposure.slotId)||exposure.startFrame!==end||!Number.isInteger(exposure.endFrame)||exposure.endFrame<=end||exposure.endFrame>handoff.totalFrames)fail('exposures must cover the timeline in order');
  end=exposure.endFrame;
 }if(end!==handoff.totalFrames)fail('incomplete exposure timeline');
 const spoken=original.animation.mode==='silent'?[]:original.dialogue.flatMap((l,i)=>l.text.trim()?[i]:[]);
 if(!Array.isArray(handoff.speech)||handoff.speech.length!==spoken.length)fail('missing speech timing');
 handoff.speech.forEach((take,i)=>{
  fields(take,['line','duration','phones']);
  if(take.line!==spoken[i]||!bounded(take.duration,Number.MIN_VALUE,120))fail('invalid speech timing');
  if(!Array.isArray(take.phones)||!take.phones.length||take.phones.length>20000)fail('invalid phoneme timing');
  for(const phone of take.phones){fields(phone,['phone','start','end']);if(typeof phone.phone!=='string'||phone.phone.length>12||!phone.phone.length||!bounded(phone.start,0,take.duration+.05)||!bounded(phone.end,phone.start,take.duration+.05))fail('invalid phoneme timing');}
 });
 return handoff;
}

/** Capture compact reference order and timing; no pictures or audio samples are embedded. */
export function makeHandoff(project,clip,takes={},transfer=null,drawingSlots){
 validateProject(project);
 if(clip?.fps!==24||clip.fps!==project.fps)fail('compile the current 24 fps clip before exporting');
 if(animationSettings(project).mode!=='silent'&&project.lines.some(l=>l.text.trim()&&!takes[l.id]?.phones?.length))fail('supply generated speech takes with phoneme timing when exporting a speech handoff');
 if(!sameTimeline(compileClip(project,takes),clip))fail('the clip is stale; compile the current settings before exporting');
 let slots=clip.slots.filter(s=>s.active),id;
 if(transfer){
  slots=transferSlots(transfer,project,clip);id=transfer.id;
 }else if(drawingSlots!==undefined){
  if(!Array.isArray(drawingSlots)||!drawingSlots.length||drawingSlots.length>MAX_DRAWINGS)fail('invalid ordered drawing list');
  const registry=new Map(clip.slots.map(s=>[s.id,s]));
  slots=drawingSlots.map(s=>{
   const current=registry.get(s?.id);
   if(!current||current.key!==s.key)fail('the ordered drawing list is incompatible with the current clip');
   return current;
  });
 }
 const available=new Set(slots.map(s=>s.id));
 if(clip.slots.some(s=>s.active&&!available.has(s.id)))fail('the reference set is incomplete; export new references');
 const [width,height]=dimensions(project);
 const speech=animationSettings(project).mode==='silent'?[]:project.lines.flatMap((line,index)=>{
  if(!line.text.trim())return [];
  const take=takes[line.id];
  return [{line:index,duration:take.duration,phones:take.phones.map(({phone,start,end})=>({phone,start,end}))}];
 });
 return validateHandoff({version:1,id:id??slots[0]?.id.slice(1),fps:clip.fps,width,height,source:source(project),slots:slots.map(({id,state})=>({id,key:canonical(state)})),speech,totalFrames:clip.totalFrames,exposures:clip.exposures.map(e=>({...e}))});
}

/** Restore on any device without generating reference images. Returned takes pin saved timings. */
export function restoreHandoff(project,takes={},handoff=null){
 validateProject(project);
 const candidate=structuredClone(project),timedTakes={...takes};
 if(!handoff){
  const clip=compileClip(candidate,timedTakes,candidate.slots),drawingSlots=clip.slots.filter(s=>s.active);candidate.slots=clip.slots;
  return {project:candidate,clip,takes:timedTakes,drawingSlots,transfer:transferFor(candidate,drawingSlots)};
 }
 validateHandoff(handoff);
 const original=decodeSource(handoff.source),sameSource=source(candidate)===handoff.source;
 for(const saved of animationSettings(candidate).mode==='silent'?[]:handoff.speech){
  const line=candidate.lines[saved.line],prior=original.dialogue[saved.line];
  if(!line||line.text!==prior.text||line.actor!==prior.actor||line.rate!==prior.rate||candidate.rate!==original.rate)continue;
  const take=takes[line.id];
  if(!take||!bounded(take.duration,saved.duration-1/candidate.fps,saved.duration+1/candidate.fps)
    ||!Array.isArray(take.phones)||take.phones.length!==saved.phones.length||take.phones.some((p,i)=>p.phone!==saved.phones[i].phone||Math.abs(p.start-saved.phones[i].start)>1/candidate.fps||Math.abs(p.end-saved.phones[i].end)>1/candidate.fps))fail('generated speech is incompatible with the saved timing; regenerate references with this voice');
  timedTakes[line.id]={...take,duration:saved.duration,phones:structuredClone(saved.phones)};
 }
 const compiled=compileClip({...candidate,slots:[]},timedTakes),savedSlots=decodeSlots(handoff),byState=new Map(savedSlots.map(s=>[s.key,s])),rebound=new Map();
 for(const slot of compiled.slots){
  const saved=byState.get(canonical(slot.state));
  if(!saved)fail('the scene or required drawings changed. Restore the exported scene or create new references. Timing-only changes can reuse drawings.','HANDOFF_DRAWINGS_CHANGED');
  saved.state=slot.state;saved.key=slot.key;saved.active=slot.active;rebound.set(slot.id,saved.id);
 }
 const clip={...compiled,slots:savedSlots,exposures:compiled.exposures.map(e=>({...e,slotId:rebound.get(e.slotId)}))};
 if(sameSource){
  if(clip.totalFrames!==handoff.totalFrames||canonical(clip.exposures)!==canonical(handoff.exposures))fail('the saved exposure timeline is incompatible with the scene timing');
  clip.totalFrames=handoff.totalFrames;clip.duration=handoff.totalFrames/handoff.fps;clip.exposures=handoff.exposures.map(e=>({...e}));
  const active=new Set(clip.exposures.map(e=>e.slotId));for(const slot of clip.slots)slot.active=active.has(slot.id);
 }
 candidate.slots=clip.slots;validateProject(candidate);
 return {project:candidate,clip,takes:timedTakes,drawingSlots:clip.slots,transfer:transferFor(candidate,clip.slots,handoff.id)};
}
