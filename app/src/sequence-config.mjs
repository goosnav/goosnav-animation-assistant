import {parseConfigDocument} from './config.mjs';
import {dimensions,newProject,uid,validateProject} from './core.mjs';

export const SEQUENCE_FORMAT='goosnav-animation-sequence';
export const SEQUENCE_LIMITS=Object.freeze({shots:20,seconds:600,drawings:2000,bytes:5_000_000});
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const fail=(path,message,code)=>{const error=Error(`${path}: ${message}`);if(code)error.code=code;throw error;};
function fields(value,allowed,path){
 if(!object(value))fail(path,'expected an object');
 for(const key of Object.keys(value))if(!allowed.includes(key))fail(`${path}.${key}`,'unknown field');
}
function inspect(value,path='sequence',depth=0){
 if(depth>16)fail(path,'document is nested too deeply');
 if(!value||typeof value!=='object')return;
 for(const [key,child]of Object.entries(value)){
  if(['__proto__','prototype','constructor'].includes(key))fail(`${path}.${key}`,'reserved field');
  inspect(child,`${path}.${key}`,depth+1);
 }
}
export function validateSequenceIdentity(id,title,path='sequence'){
 if(typeof id!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(id))fail(`${path}.id`,'use 1–80 letters, digits, or hyphens');
 if(typeof title!=='string'||title.length>200)fail(`${path}.title`,'expected text of at most 200 characters');
}
export function drawingKey(value){
 if(Array.isArray(value))return `[${value.map(drawingKey).join(',')}]`;
 if(object(value))return `{${Object.keys(value).filter(k=>value[k]!==undefined).sort().map(k=>`${JSON.stringify(k)}:${drawingKey(value[k])}`).join(',')}}`;
 return JSON.stringify(value);
}
/** Validate a backup's metadata even while edits have made its carrier stale. */
export function validateSequenceHandoffShape(handoff){
 const path='Sequence handoff';
 let text;try{text=JSON.stringify(handoff);}catch{fail(path,'invalid metadata');}
 if(!text||text.length>SEQUENCE_LIMITS.bytes||new TextEncoder().encode(text).length>SEQUENCE_LIMITS.bytes)fail(path,'metadata exceeds 5 MB');
 inspect(handoff,path);
 fields(handoff,['version','fps','width','height','slots'],path);
 if(handoff.version!==1||handoff.fps!==24||![[1080,1920],[1920,1080]].some(([w,h])=>handoff.width===w&&handoff.height===h))fail(path,'invalid version, frame rate, or dimensions');
 if(!Array.isArray(handoff.slots)||!handoff.slots.length||handoff.slots.length>SEQUENCE_LIMITS.drawings)fail(path,'expected 1–2000 drawings');
 const seen=new Set();
 for(const slot of handoff.slots){
  fields(slot,['id','shotId','slotId','key'],`${path}.slots`);
  if(typeof slot.shotId!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(slot.shotId)||typeof slot.slotId!=='string'||!/^d[a-z0-9-]{1,64}$/.test(slot.slotId)||slot.id!==`${slot.shotId}:${slot.slotId}`||seen.has(slot.id))fail(path,'duplicate or invalid drawing identity');
  if(typeof slot.key!=='string')fail(path,'invalid drawing state');
  let state;try{state=JSON.parse(slot.key);}catch{fail(path,'invalid drawing state');}
  inspect(state,path);fields(state,['scene','mouths','blinks','smears','motionWipes'],path);
  if(drawingKey(state)!==slot.key)fail(path,'noncanonical drawing state');
  parseConfigDocument(JSON.stringify({format:'goosnav-animation-config',version:1,scene:state.scene,timing:{mode:'silent',duration:.5}}));
  validateProject({...newProject(),slots:[{id:slot.slotId,key:JSON.stringify(state),state}]});seen.add(slot.id);
 }
 return handoff;
}
/** Global carrier order is independent of shot playback order. */
export function validateSequenceHandoff(handoff,available,width,height){
 validateSequenceHandoffShape(handoff);const path='Sequence handoff';
 if(handoff.width!==width||handoff.height!==height)fail(path,'incompatible dimensions','HANDOFF_DRAWINGS_CHANGED');
 const registry=new Map(available.map(s=>[s.id,s]));
 for(const slot of handoff.slots){
  const current=registry.get(slot.id);
  if(!current||slot.shotId!==current.shotId||slot.slotId!==current.slotId||slot.key!==current.key)fail(path,'a shot or drawing changed. Restore the exported film or create new references.','HANDOFF_DRAWINGS_CHANGED');
 }
 if(handoff.slots.length!==registry.size)fail(path,'the required drawings changed. Create new references.','HANDOFF_DRAWINGS_CHANGED');
 return handoff;
}
/** Cheap format detection only; callers must still parse and validate. */
export function isSequenceDocument(text){try{return JSON.parse(text)?.format===SEQUENCE_FORMAT;}catch{return false;}}

/** Parse without generating speech. Editing may retain a well-shaped stale carrier. */
export function parseSequenceDocument(text,{allowStaleHandoff=false}={}){
 if(typeof text!=='string')fail('sequence','expected JSON text');
 if(text.length>SEQUENCE_LIMITS.bytes||new TextEncoder().encode(text).length>SEQUENCE_LIMITS.bytes)fail('sequence','file exceeds 5 MB');
 let data;try{data=JSON.parse(text);}catch{fail('sequence','invalid JSON');}
 inspect(data);fields(data,['format','version','id','title','shots','handoff'],'sequence');
 if(data.format!==SEQUENCE_FORMAT||data.version!==1)fail('sequence','unsupported format or version');
 const id=data.id===undefined?uid():data.id,title=data.title===undefined?'Untitled film':data.title;validateSequenceIdentity(id,title);
 if(!Array.isArray(data.shots)||!data.shots.length||data.shots.length>SEQUENCE_LIMITS.shots)fail('sequence.shots','supply 1–20 shots');
 const ids=new Set();let orientation,totalDuration=0;const available=[];
 const shots=data.shots.map((shot,i)=>{
  const path=`sequence.shots[${i}]`;fields(shot,['id','title','config'],path);validateSequenceIdentity(shot.id,shot.title,path);
  if(ids.has(shot.id))fail(`${path}.id`,'duplicate shot ID');ids.add(shot.id);
  let parsed;try{parsed=parseConfigDocument(JSON.stringify(shot.config));}catch(error){fail(`${path}.config`,error.message);}
  const {project,handoff}=parsed;
  if(orientation&&orientation!==project.scene.format)fail(`${path}.config.scene.format`,'all shots must use the same orientation');orientation=project.scene.format;
  totalDuration+=project.animation.duration;
  for(const slot of handoff?.slots??[])available.push({...slot,id:`${shot.id}:${slot.id}`,shotId:shot.id,slotId:slot.id});
  return {...shot,...parsed};
 });
 if(totalDuration>SEQUENCE_LIMITS.seconds)fail('sequence','film exceeds 600 seconds');
 if(available.length>SEQUENCE_LIMITS.drawings)fail('sequence','film exceeds 2000 drawings');
 const [width,height]=dimensions(shots[0].project);let handoff=null,needsReferences=false;
 if(data.handoff!==undefined){
  try{handoff=validateSequenceHandoff(data.handoff,available,width,height);}
  catch(error){
   // Only compatibility can be deferred; validateSequenceHandoff has already
   // checked metadata shape, bounds, and encoded drawing states before this code.
   if(!allowStaleHandoff||error.code!=='HANDOFF_DRAWINGS_CHANGED')throw error;
   handoff=data.handoff;needsReferences=true;
  }
 }
 return {id,title,shots,handoff,...(needsReferences?{needsReferences:true}:{})};
}
