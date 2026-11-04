import {newProject,validateProject,uid} from './core.mjs';
import {animationSettings} from './motion.mjs';
import {resetSectionValues} from './pose-sections.mjs';

const scopes=['scene','key','timeline'];
const gazeKeys=['yaw','headYaw','headPitch','headTilt','headSpin','noseContact'];
function scopeTime(scope,time){if(!scopes.includes(scope))throw Error('Use scene, key or timeline scope.');if(!Number.isFinite(time)||time<0||time>120)throw Error('Pose time must be from 0 to 120 seconds.');}
function subject(project,target){
 if(/^actor:[01]$/.test(target)){const index=Number(target.slice(6));if(index>=project.scene.count)throw Error('Choose a visible actor.');return {kind:'actor',value:project.scene.actors[index],index};}
 if(typeof target==='string'&&target.startsWith('prop:')){const value=project.scene.props?.find(prop=>prop.id===target.slice(5));if(value)return {kind:'prop',value};}
 throw Error('Choose an existing actor or prop target.');
}
function insertKey(project,target,values,time){
 const settings=animationSettings(project),at=Math.round(time*project.fps)/project.fps;
 const existing=settings.keys.find(key=>key.target===target&&Math.abs(key.time-at)<.5/project.fps);
 const key=existing?{...existing,time:at,values:{...existing.values,...values}}:{id:uid(),target,time:at,transition:'hold',values:{...values}};
 project.animation={...settings,keys:[...settings.keys.filter(other=>other.id!==key.id),key].sort((a,b)=>a.time-b.time)};
}
function baseWarnings(project,target,values){
 const keys=Object.keys(values),messages=[];
 if(animationSettings(project).keys.some(key=>key.target===target&&keys.some(name=>Object.hasOwn(key.values,name))))messages.push('Animation keys still control this section. Use key scope for the current pose, or timeline scope to reset only this section throughout the animation.');
 if(keys.includes('headYaw')&&target.startsWith('actor:')&&project.lines.some(line=>line.actor===Number(target.slice(6))&&line.headYaw))messages.push('Dialogue still adds an extra head turn. Inspect speaking frames, or reset the head with timeline scope.');
 return messages;
}

/** Neutral numeric offsets; never changes a model, held-pose preset or expression. */
export function resetProjectSection(project,{target,section,scope='scene',time=0}={}){
 validateProject(project);scopeTime(scope,time);const next=structuredClone(project),warnings=[];
 if(target==='camera'){
  if(section!==undefined&&section!=='camera'||scope!=='scene')throw Error('Camera reset uses camera section and scene scope.');
  next.scene.camera=structuredClone(newProject().scene.camera);return {project:validateProject(next),warnings};
 }
 const selected=subject(next,target);if(section==='book'&&(selected.kind!=='prop'||selected.value.kind!=='book'))throw Error('Book section requires a book prop.');
 const values=resetSectionValues(selected.kind,section);
 if(scope==='key')insertKey(next,target,values,time);
 else{
  if(scope==='scene')warnings.push(...baseWarnings(next,target,values));
  Object.assign(selected.value,values);
  if(scope==='timeline'){
   const settings=animationSettings(next),last=Math.max(0,...settings.keys.map(key=>key.time));
   const keys=settings.keys.map(key=>key.target!==target?key:{...key,values:Object.fromEntries(Object.entries(key.values).filter(([name])=>!Object.hasOwn(values,name)))}).filter(key=>Object.keys(key.values).length);
   const remaining=Math.max(0,...keys.map(key=>key.time));
   const end=Math.min(120,(Math.ceil(last*next.fps-.5)+1)/next.fps);
   next.animation={...settings,keys,duration:last>remaining?Math.max(settings.duration,end):settings.duration};
   if(selected.kind==='actor'&&Object.hasOwn(values,'headYaw'))for(const line of next.lines)if(line.actor===selected.index)line.headYaw=0;
  }
 }
 return {project:validateProject(next),warnings};
}

/** Apply a measured, one-time gaze pose to the base or one authored key. */
export function applyProjectPose(project,{changes,scope='scene',time=0}={}){
 validateProject(project);scopeTime(scope,time);if(scope==='timeline')throw Error('Gaze alignment is a one-time pose; use scene or key scope.');
 if(!Array.isArray(changes)||!changes.length||changes.length>2)throw Error('Supply one or two gaze changes.');
 const next=structuredClone(project),warnings=[],seen=new Set();
 for(const change of changes){
  if(!Number.isInteger(change.actor)||seen.has(change.actor))throw Error('Choose each actor once.');seen.add(change.actor);
  if(!change.values||!Object.keys(change.values).length||Object.keys(change.values).some(key=>!gazeKeys.includes(key)))throw Error('Gaze changes contain unsupported controls.');
  const target=`actor:${change.actor}`,selected=subject(next,target);
  if(scope==='key')insertKey(next,target,change.values,time);
  else{warnings.push(...baseWarnings(next,target,change.values));Object.assign(selected.value,change.values);}
 }
 return {project:validateProject(next),warnings:[...new Set(warnings)]};
}
