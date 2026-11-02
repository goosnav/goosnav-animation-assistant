import {newProject,validateProject,uid} from './core.mjs';
import {ACTOR_CHANNELS,PROP_CHANNELS,MOTION_PRESETS,animationSettings,addGesture,addWalk} from './motion.mjs';
import {EMOTIONS} from './emotions.mjs';

const FORMAT='goosnav-animation-config',MAX_BYTES=5_000_000;
const fail=(path,message)=>{throw Error(`${path}: ${message}`);};
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function fields(value,allowed,path){
 if(!object(value))fail(path,'expected an object');
 for(const key of Object.keys(value))if(!allowed.includes(key))fail(`${path}.${key}`,'unknown field');
}
function array(value,max,path){if(!Array.isArray(value)||value.length>max)fail(path,`expected an array with at most ${max} entries`);}
function number(value,min,max,path){if(!Number.isFinite(value)||value<min||value>max)fail(path,`expected a number from ${min} to ${max}`);}
function visible(actor,count,path){if(!Number.isInteger(actor)||actor<0||actor>=count)fail(path,'choose a visible actor (0 or 1)');}
function expression(value,path){if(typeof value!=='string'||!Object.hasOwn(EMOTIONS,value))fail(path,'unknown emotion');}
function inspect(value,path='$',depth=0){
 if(depth>12)fail(path,'document is nested too deeply');
 if(!value||typeof value!=='object')return;
 for(const [key,child]of Object.entries(value)){
  if(['__proto__','prototype','constructor'].includes(key))fail(`${path}.${key}`,'reserved field');
  inspect(child,`${path}.${key}`,depth+1);
 }
}
function validateScene(scene){
 fields(scene,['format','style','background','backdrop','count','camera','actors','props'],'scene');
 if(scene.camera!==undefined)fields(scene.camera,['projection','azimuth','elevation','zoom','targetX','targetY'],'scene.camera');
 if(scene.actors!==undefined){
  array(scene.actors,2,'scene.actors');if(!scene.actors.length)fail('scene.actors','supply one or two actors');
  scene.actors.forEach((actor,i)=>{
   const path=`scene.actors[${i}]`;fields(actor,['model','pose','chair','emotion',...Object.keys(ACTOR_CHANNELS)],path);
   if(actor.emotion!==undefined)expression(actor.emotion,`${path}.emotion`);
   if(actor.chair!==undefined&&!['folding','wood','stool'].includes(actor.chair))fail(`${path}.chair`,'unknown chair');
  });
 }
 if(scene.props!==undefined){
  array(scene.props,12,'scene.props');scene.props.forEach((prop,i)=>fields(prop,['id','kind','color','attachment',...Object.keys(PROP_CHANNELS)],`scene.props[${i}]`));
 }
}
function validateActions(actions,count,scene){
 array(actions,100,'actions');
 actions.forEach((a,i)=>{
  const path=`actions[${i}]`;fields(a,['actor','action','time','duration','strength','options'],path);visible(a.actor,count,`${path}.actor`);
  if(typeof a.action!=='string'||a.action!=='walk'&&!Object.hasOwn(MOTION_PRESETS,a.action))fail(`${path}.action`,'unknown action');
  if(a.time!==undefined)number(a.time,0,120,`${path}.time`);
  const options=a.options===undefined?{}:a.options;
  if(a.action==='walk'){
   fields(options,['steps','stride','cadence','direction','inPlace'],`${path}.options`);
   if(a.duration!==undefined||a.strength!==undefined)fail(path,'walk uses options.steps/stride/cadence instead of duration/strength');
   for(const [key,min,max]of [['steps',1,12],['stride',.1,1],['cadence',.5,6],['direction',-180,180]])if(options[key]!==undefined)number(options[key],min,max,`${path}.options.${key}`);
   if(options.steps!==undefined&&!Number.isInteger(options.steps))fail(`${path}.options.steps`,'expected a whole number');
   if(options.inPlace!==undefined&&typeof options.inPlace!=='boolean')fail(`${path}.options.inPlace`,'expected a boolean');
   if((a.time??0)+(options.steps??4)/(options.cadence??2)+.3>120)fail(path,'action exceeds 120 seconds');
  }else{
   const preset=MOTION_PRESETS[a.action],allowed=preset.group==='Partner'?['partner']:preset.group==='Book'?['prop']:[];
   fields(options,allowed,`${path}.options`);
   if(a.duration!==undefined)number(a.duration,.2,60,`${path}.duration`);
   if(a.strength!==undefined)number(a.strength,.25,2,`${path}.strength`);
   if((a.time??0)+(a.duration??preset.duration)>120)fail(path,'action exceeds 120 seconds');
   if(preset.group==='Partner'){
    const partner=options.partner??1-a.actor;visible(partner,count,`${path}.options.partner`);
    if(partner===a.actor)fail(`${path}.options.partner`,'partner must be a different actor');
    if(options.partner===null)fail(`${path}.options.partner`,'expected an actor number');
   }
   if(options.prop!==undefined&&(typeof options.prop!=='string'||!scene.props?.some(p=>p.id===options.prop&&p.kind==='book')))fail(`${path}.options.prop`,'choose an existing book ID');
  }
 });
}

/** Parse a portable scene recipe without changing the current project or generating speech. */
export function parseConfig(text){
 if(typeof text!=='string')fail('config','expected JSON text');
 if(text.length>MAX_BYTES||new TextEncoder().encode(text).length>MAX_BYTES)fail('config','file exceeds 5 MB');
 let data;try{data=JSON.parse(text);}catch{fail('config','invalid JSON');}
 inspect(data);fields(data,['format','version','title','fps','rate','scene','dialogue','timing','actions','keys','guides','overrides','audio'],'config');
 if(data.format!==FORMAT||data.version!==1)fail('config','unsupported format or version');
 if(data.fps!==undefined&&data.fps!==24)fail('fps','this app uses 24 fps');
 if(data.actions!==undefined&&data.keys!==undefined)fail('config','use actions or exact keys, not both');
 if(data.scene!==undefined)validateScene(data.scene);
 if(data.timing!==undefined)fields(data.timing,['mode','duration','drawings'],'timing');
 if(data.audio!==undefined)fields(data.audio,['mode','offset','trimStart','trimEnd'],'audio');
 if(data.guides!==undefined)fields(data.guides,['ground','backdrop'],'guides');
 let p=newProject();p.lines=[];
 for(const key of ['title','fps','rate','guides'])if(data[key]!==undefined)p[key]=data[key];
 if(data.scene){
  const source=data.scene;
  p.scene={...p.scene,...source,camera:{...p.scene.camera,...source.camera},actors:p.scene.actors.map((a,i)=>({...a,...source.actors?.[i]}))};
  if(source.actors&&source.count===undefined)p.scene.count=source.actors.length;
  if(source.props)p.scene.props=source.props.map(prop=>({...Object.fromEntries(Object.entries(PROP_CHANNELS).filter(([key])=>!['open','page'].includes(key)).map(([key,d])=>[key,d.default])),id:uid(),kind:'cube',color:'#888888',attachment:'world',...prop}));
 }
 const timing={mode:'speech',duration:0,drawings:3,...data.timing};
 if(timing.mode==='silent'&&data.timing?.duration===undefined)timing.duration=3;
 p.animation={...timing,keys:[]};
 if(data.dialogue!==undefined){
  array(data.dialogue,30,'dialogue');
  p.lines=data.dialogue.map((line,i)=>{
   const path=`dialogue[${i}]`;fields(line,['actor','text','rate','pause','pose','headYaw','blink','smear','emotion'],path);visible(line.actor,p.scene.count,`${path}.actor`);
   if(line.headYaw!==undefined)number(line.headYaw,-75,75,`${path}.headYaw`);
   for(const name of ['blink','smear'])if(line[name]!==undefined&&typeof line[name]!=='boolean')fail(`${path}.${name}`,'expected a boolean');
   if(line.emotion!==undefined)expression(line.emotion,`${path}.emotion`);
   return {id:uid(),rate:1,pause:.35,pose:'keep',headYaw:0,blink:false,...line};
  });
 }
 if(data.keys!==undefined){
  array(data.keys,1000,'keys');
  data.keys.forEach((key,i)=>{
   fields(key,['id','target','time','values','transition'],`keys[${i}]`);
   if(typeof key.target==='string'&&key.target.startsWith('actor:'))visible(Number(key.target.slice(6)),2,`keys[${i}].target`);
  });p.animation.keys=data.keys;
 }
 if(data.overrides!==undefined){
  array(data.overrides,2000,'overrides');data.overrides.forEach((o,i)=>{fields(o,['actor','start','end','mouth'],`overrides[${i}]`);visible(o.actor,data.keys!==undefined?2:p.scene.count,`overrides[${i}].actor`);});p.overrides=data.overrides;
 }
 for(const prop of p.scene.props??[]){
  if(typeof prop.attachment==='string'&&prop.attachment.startsWith('actor:'))visible(Number(prop.attachment.split(':')[1]),data.keys!==undefined?2:p.scene.count,`scene.props.${prop.id}.attachment`);
 }
 if(data.audio){
  if(data.audio.mode!==undefined)p.audioMode=data.audio.mode;
  for(const [input,output]of [['offset','audioOffset'],['trimStart','audioTrimStart'],['trimEnd','audioTrimEnd']])if(data.audio[input]!==undefined)p[output]=data.audio[input];
 }
 // Validate the requested mode before normalizing a recording with no portable media.
 validateProject(p);
 if(p.animation.mode==='silent')p.audioMode='silent';else if(p.audioMode==='recording')p.audioMode='robot';
 if(data.actions!==undefined){
  validateActions(data.actions,p.scene.count,p.scene);
  data.actions.forEach((a,i)=>{
   try{
    const options={...a.options};if(options.partner!==undefined)options.partner=`actor:${options.partner}`;
    p=a.action==='walk'?addWalk(p,`actor:${a.actor}`,a.time??0,options):addGesture(p,`actor:${a.actor}`,a.action,a.time??0,{...options,...(a.duration!==undefined?{duration:a.duration}:{}),...(a.strength!==undefined?{strength:a.strength}:{})});
   }catch(error){fail(`actions[${i}]`,error.message);}
  });
 }
 return validateProject(p);
}

/** Export setup only; reference drawings, recordings, speech takes and identity stay in ZIP backups. */
export function exportConfig(project){
 validateProject(project);
 const animation=animationSettings(project);
 const data={format:FORMAT,version:1,title:project.title,fps:project.fps,rate:project.rate,scene:project.scene,
  dialogue:project.lines.map(({id,...line})=>line),timing:{mode:animation.mode,duration:animation.duration,drawings:animation.drawings},keys:animation.keys,
  ...(project.guides!==undefined?{guides:project.guides}:{}),overrides:project.overrides,
  audio:{mode:project.audioMode,offset:project.audioOffset,trimStart:project.audioTrimStart,trimEnd:project.audioTrimEnd}};
 const text=JSON.stringify(data,null,2)+'\n';
 // Keep every exported file importable under the same bounds and strict schema.
 parseConfig(text);return text;
}
