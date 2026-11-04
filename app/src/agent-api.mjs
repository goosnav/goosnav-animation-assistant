import {parseConfigDocument} from './config.mjs';
import {parseSequenceDocument} from './sequence-config.mjs';
import {prepareScene} from './pipeline.mjs';
import {prepareSequence} from './sequence.mjs';
import {dimensions,slotAt} from './core.mjs';
import {animationSettings} from './motion.mjs';
import {Stage} from './stage.mjs';
import {compositionDiagnostics,fittedCamera} from './agent-composition.mjs';
import {capabilities,LIMITS,COMMANDS} from './agent-catalog.mjs';
import {agentInstructions} from './agent-workflow.mjs';
import {reviewCoverage} from './agent-coverage.mjs';
export {capabilities,agentInstructions};

const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const invalid=message=>{throw Object.assign(Error(message),{code:'INVALID_ARGUMENT'});};
const failure=error=>({ok:false,errors:[{code:error?.name==='AbortError'?'CANCELLED':error?.code||'INVALID_DOCUMENT',message:String(error?.message||error).slice(0,550)}]});
function allowed(value,keys,label){if(!object(value)||Object.keys(value).some(k=>!keys.includes(k)))invalid(`${label}: use only ${keys.join(', ')}.`);}
function number(value,min,max,label){if(!Number.isFinite(value)||value<min||value>max)invalid(`${label}: expected a number from ${min} to ${max}.`);}
function callbacks(options){if(options.onProgress!==undefined&&typeof options.onProgress!=='function')invalid('onProgress must be a function.');if(options.signal!==undefined&&!(options.signal instanceof AbortSignal))invalid('signal must be an AbortSignal.');}
function json(text){if(typeof text!=='string')invalid('Supply JSON text.');if(text.length>LIMITS.jsonBytes||new TextEncoder().encode(text).length>LIMITS.jsonBytes)invalid('Document exceeds 5 MB.');try{return JSON.parse(text);}catch{invalid('Document contains invalid JSON.');}}
function parse(text){const data=json(text);if(data?.format==='goosnav-animation-sequence'){const parsed=parseSequenceDocument(text,{allowStaleHandoff:true});return {kind:'sequence',data,...parsed};}const parsed=parseConfigDocument(text);return {kind:'scene',data,shots:[{id:'scene',title:parsed.project.title,config:data,...parsed}]};}
function summary(parsed){
 const warnings=[];
 const coverage=parsed.kind==='sequence'?reviewCoverage(parsed.shots):null;
 if(coverage)warnings.push(...coverage.warnings);
 if(parsed.needsReferences)warnings.push('The shot or drawing list changed. Create new drawing references before importing artwork.');
 if(parsed.shots.some(shot=>shot.config.audio?.mode==='recording'))warnings.push('Portable JSON does not contain recorded audio. Preview uses the portable speech recipe.');
 return {ok:true,kind:parsed.kind,title:parsed.title||parsed.shots[0].project.title,shots:parsed.shots.map(shot=>({id:shot.id,title:shot.title,format:shot.project.scene.format,mode:animationSettings(shot.project).mode,duration:animationSettings(shot.project).duration,actors:shot.project.scene.actors.slice(0,shot.project.scene.count).map((actor,index)=>({actor:index,model:actor.model,pose:actor.pose})),dialogueLines:shot.project.lines.length,camera:structuredClone(shot.project.scene.camera),hasHandoff:!!shot.handoff})),...(coverage?{coverage}:{}),warnings};
}

/** Strict syntax/schema inspection without speech, image generation or external mutations. */
export function inspectDocument(text){try{return summary(parse(text));}catch(error){return failure(error);}}

function safeValue(value,depth=0){
 if(depth>12)invalid('Edit value is nested too deeply.');
 if(value===null||typeof value==='string'||typeof value==='boolean')return;
 if(typeof value==='number'){if(!Number.isFinite(value))invalid('Edit numbers must be finite.');return;}
 if(typeof value!=='object'||(!Array.isArray(value)&&Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null))invalid('Edit values must be JSON values.');
 for(const [key,child]of Object.entries(value)){if(['__proto__','prototype','constructor'].includes(key))invalid('Reserved edit field.');safeValue(child,depth+1);}
}

/** Atomic JSON-pointer set. It may add a leaf, but cannot invent parent objects or array entries. */
export function editDocument(text,operations){
 try{
  const parsed=parse(text),data=parsed.data;
  if(!Array.isArray(operations)||!operations.length||operations.length>LIMITS.operations)invalid('Supply 1–100 set operations.');
  for(const operation of operations){
   allowed(operation,['op','path','value'],'Edit');if(operation.op!=='set'||!Object.hasOwn(operation,'value'))invalid('Each edit requires op:"set", path and value.');safeValue(operation.value);
   if(typeof operation.path!=='string'||!operation.path.startsWith('/')||operation.path.length>600)invalid('Use an absolute JSON pointer such as /scene/camera/zoom.');
   const keys=operation.path.slice(1).split('/').map(key=>{if(/~(?![01])/u.test(key))invalid('Invalid JSON pointer escape.');const decoded=key.replaceAll('~1','/').replaceAll('~0','~');if(['__proto__','prototype','constructor'].includes(decoded))invalid('Reserved edit path.');return decoded;});
   let parent=data;
   keys.forEach((key,index)=>{
    if(!parent||typeof parent!=='object')invalid('Edit parent path does not exist.');
    if(Array.isArray(parent)&&(!/^(0|[1-9]\d*)$/.test(key)||Number(key)>=parent.length))invalid('Edit array index is out of bounds. Replace the array to add or remove entries.');
    if(index===keys.length-1)parent[key]=structuredClone(operation.value);
    else {if(!Object.hasOwn(parent,key))invalid('Edit parent path does not exist. Set its object first.');parent=parent[key];}
   });
  }
  const next=JSON.stringify(data,null,2)+'\n',inspection=inspectDocument(next);if(!inspection.ok)return inspection;
  return {...inspection,text:next,changedPaths:operations.map(operation=>operation.path)};
 }catch(error){return failure(error);}
}

export function sampleDocument(){return JSON.stringify({format:'goosnav-animation-config',version:1,title:'Agent composition study',scene:{format:'portrait',style:'flat',background:'#f8f5ee',count:2,camera:{projection:'perspective',azimuth:0,elevation:0,zoom:.938459,targetX:-.084864,targetY:.831262},actors:[{model:'v12-fat',x:-.55,yaw:25},{model:'billy-v2',x:.55,yaw:-25}]},dialogue:[{actor:0,text:'First speaker.'},{actor:1,text:'Second speaker.'}],timing:{mode:'silent',duration:2,drawings:3}},null,2)+'\n';}

function previewOptions(options){
 allowed(options,['samples','maxDimension','contactSheet','signal','onProgress'],'Preview options');
 const maxDimension=options.maxDimension??640;number(maxDimension,LIMITS.previewMinDimension,LIMITS.previewDimension,'maxDimension');if(!Number.isInteger(maxDimension))invalid('maxDimension must be an integer.');
 if(options.contactSheet!==undefined&&typeof options.contactSheet!=='boolean')invalid('contactSheet must be a boolean.');
 if(options.samples!==undefined){if(!Array.isArray(options.samples)||!options.samples.length||options.samples.length>LIMITS.previewImages)invalid('Supply 1–12 preview samples.');for(const sample of options.samples){allowed(sample,['shotId','time'],'Sample');if(sample.shotId!==undefined&&typeof sample.shotId!=='string')invalid('shotId must be a string.');number(sample.time??0,0,120,'Sample time');}}
 callbacks(options);
 return {...options,maxDimension};
}
async function prepared(text,parsed,options){
 const opts={signal:options.signal,onProgress:options.onProgress,allowNewDrawings:true};
 if(parsed.kind==='sequence')return prepareSequence(text,opts);
 return {kind:'scene',shots:[{id:'scene',title:parsed.shots[0].title,startFrame:0,scene:await prepareScene(text,opts)}]};
}
function chooseShot(shots,id){if(id===undefined&&shots.length===1)return shots[0];const shot=shots.find(shot=>shot.id===id);if(!shot)invalid('Choose an existing shotId; it is required for a multi-shot document.');return shot;}
function size(project,maxDimension){const [w,h]=dimensions(project),factor=maxDimension/Math.max(w,h);return [Math.round(w*factor),Math.round(h*factor)];}
function release(stage,canvas){if(stage){stage.dispose();stage.renderer.forceContextLoss();}if(canvas)canvas.width=canvas.height=1;}
async function pngResult(canvas,metadata){const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('Could not encode preview.')),'image/png'));const dataURL=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Could not read preview.'));reader.readAsDataURL(blob);});return {...metadata,mimeType:'image/png',width:canvas.width,height:canvas.height,bytes:blob.size,dataURL};}
async function sheet(images,signal){
 const columns=Math.min(3,images.length),cellWidth=320,cellHeight=Math.max(...images.map(i=>Math.round(i.height/i.width*cellWidth)))+48,canvas=document.createElement('canvas');
 canvas.width=columns*cellWidth;canvas.height=Math.ceil(images.length/columns)*cellHeight;if(canvas.width*canvas.height>LIMITS.contactSheetPixels)invalid('Contact sheet exceeds pixel limit.');
 const context=canvas.getContext('2d');context.fillStyle='#eeeae0';context.fillRect(0,0,canvas.width,canvas.height);
 try{for(const [index,image]of images.entries()){
  signal?.throwIfAborted();const bitmap=await createImageBitmap(await (await fetch(image.dataURL)).blob()),x=(index%columns)*cellWidth,y=Math.floor(index/columns)*cellHeight;
  try{const height=Math.round(image.height/image.width*cellWidth);context.drawImage(bitmap,x,y,cellWidth,height);context.fillStyle='#171b1a';context.font='13px sans-serif';context.fillText(`${image.shotId} · ${image.time.toFixed(2)} s`,x+8,y+height+18,cellWidth-16);context.font='10px monospace';context.fillText(image.drawingId,x+8,y+height+34,cellWidth-16);}finally{bitmap.close();}
 }return await pngResult(canvas,{kind:'contact-sheet',label:'Shot contact sheet',samples:images.length});}finally{canvas.width=canvas.height=1;}
}

/** Browser operation. Actual PNG pixels accompany compact frame identities and composition diagnostics. */
export async function previewDocument(text,options={}){
 let stage,canvas;
 try{
  options=previewOptions(options);options.signal?.throwIfAborted();const parsed=parse(text);
  const samples=options.samples??parsed.shots.slice(0,LIMITS.previewImages).map(shot=>({shotId:shot.id,time:0}));samples.forEach(sample=>chooseShot(parsed.shots,sample.shotId));
  const document=await prepared(text,parsed,options),images=[],warnings=[...summary(parsed).warnings];
  if(document.needsReferences)warnings.push('The film needs new drawing references before importing artwork.');
  if(!options.samples&&parsed.shots.length>LIMITS.previewImages)warnings.push('Showing the first 12 shots. Request remaining shot IDs explicitly.');
  options.signal?.throwIfAborted();canvas=globalThis.document.createElement('canvas');stage=new Stage(canvas);
  for(const [index,sample]of samples.entries()){
   options.signal?.throwIfAborted();const shot=chooseShot(document.shots,sample.shotId),scene=shot.scene,time=sample.time??0;
   number(time,0,scene.clip.duration,'Sample time');const slot=slotAt(scene.clip,Math.min(time,Math.max(0,scene.clip.duration-1e-7))),[width,height]=size(scene.project,options.maxDimension);
   await stage.prepare(slot.state.scene);options.signal?.throwIfAborted();stage.draw(slot.state,width,height,{guides:scene.project.guides});
   const diagnostics=compositionDiagnostics(stage,width,height),drawingId=parsed.kind==='sequence'?`${shot.id}:${slot.id}`:slot.id;
   images.push(await pngResult(canvas,{kind:'frame',shotId:shot.id,title:shot.title,time,globalTime:(shot.startFrame||0)/24+time,frame:Math.min(scene.clip.totalFrames-1,Math.floor(time*24)),drawingId,label:`${shot.id==='scene'?'Scene':shot.title} · ${time.toFixed(2)} s · ${drawingId}`,diagnostics}));
   if(scene.needsReferences)warnings.push(`${shot.id}: changes require new drawing references.`);
   options.onProgress?.({phase:'Rendering previews',progress:(index+1)/samples.length});await tick();
  }
  const contactSheet=options.contactSheet!==false&&images.length>1?await sheet(images,options.signal):null;options.signal?.throwIfAborted();
  return {ok:true,kind:parsed.kind,images,contactSheet,warnings:[...new Set(warnings)]};
 }catch(error){return failure(error);}finally{release(stage,canvas);}
}

export async function frameDocument(text,options={}){
 let stage,canvas;
 try{
  allowed(options,['shotId','actors','region','padding','time','signal','onProgress'],'Framing options');
  callbacks(options);
  const region=options.region??'body',padding=options.padding??.05;if(!['head','body'].includes(region))invalid('region must be head or body.');number(padding,0,.35,'padding');number(options.time??0,0,120,'time');
  const parsed=parse(text),source=chooseShot(parsed.shots,options.shotId),actors=options.actors??Array.from({length:source.project.scene.count},(_,i)=>i);
  if(!Array.isArray(actors)||!actors.length||actors.length>2||new Set(actors).size!==actors.length||actors.some(i=>!Number.isInteger(i)||i<0||i>=source.project.scene.count))invalid('actors must contain existing visible actor indices, once each.');
  options.signal?.throwIfAborted();const document=await prepared(text,parsed,options),shot=chooseShot(document.shots,source.id),time=options.time??0;number(time,0,shot.scene.clip.duration,'time');
  const slot=slotAt(shot.scene.clip,Math.min(time,Math.max(0,shot.scene.clip.duration-1e-7))),[width,height]=size(shot.scene.project,320);
  canvas=globalThis.document.createElement('canvas');stage=new Stage(canvas);await stage.prepare(slot.state.scene);options.signal?.throwIfAborted();stage.draw(slot.state,width,height);
  const fit=fittedCamera(stage,{actors,region,padding,aspect:width/height}),path=parsed.kind==='sequence'?`/shots/${parsed.shots.indexOf(source)}/config/scene`:'/scene';
  const data=parsed.data,config=parsed.kind==='sequence'?data.shots[parsed.shots.indexOf(source)].config:data;config.scene??={};
  const result=editDocument(JSON.stringify(data),[{op:'set',path:`${path}/camera`,value:fit.camera}]);options.signal?.throwIfAborted();return {...result,camera:fit.camera,warnings:[...(result.warnings||[]),...fit.warnings],framing:{shotId:source.id,actors,region,time,view:'front'}};
 }catch(error){return failure(error);}finally{release(stage,canvas);}
}

const imageMetadata=image=>{const {dataURL,...rest}=image;return rest;};
/** Isolated accepted document + cancellable jobs. Invalid drafts never replace it or the last image result. */
export function createAgentWorkspace({text=sampleDocument(),onChange=()=>{},onResult=()=>{}}={}){
 let currentText='',revision=0,lastPreview=null,busy=false,progress=null,errors=[],controller=null,job=0,disposed=false;
 const notify=()=>onChange(status());
 function status(){return {ok:true,instructions:{url:'/AGENTS.md',command:'instructions'},revision,busy,progress:progress?{...progress}:null,errors:structuredClone(errors),artifacts:lastPreview?[...lastPreview.images,...(lastPreview.contactSheet?[lastPreview.contactSheet]:[])].map(imageMetadata):[],previewRevision:lastPreview?.revision??null};}
 function report(result){errors=result.ok?[]:result.errors;onResult(result);notify();return result;}
 function cancel(){controller?.abort();controller=null;job++;busy=false;progress=null;notify();return {ok:true,cancelled:true};}
 function accept(next,result){cancel();currentText=next;revision++;return report({...result,revision});}
 function load(next){if(disposed)return failure(Error('Workspace is disposed.'));const result=inspectDocument(next);return result.ok?accept(next,result):report(result);}
 function validate(){return report(inspectDocument(currentText));}
 function edit(operations){const result=editDocument(currentText,operations);return result.ok?accept(result.text,result):report(result);}
 async function run(kind,options){
  if(disposed)return failure(Error('Workspace is disposed.'));
  try{if(kind==='preview')previewOptions(options);else{allowed(options,['shotId','actors','region','padding','time','signal','onProgress'],'Framing options');callbacks(options);}}catch(error){return report(failure(error));}
  cancel();const active=controller=new AbortController(),ticket=job,atRevision=revision,signal=active.signal,externalAbort=()=>active.abort();
  options.signal?.addEventListener('abort',externalAbort,{once:true});if(options.signal?.aborted)active.abort();
  busy=true;progress={phase:kind==='preview'?'Preparing previews':'Preparing framing',progress:0};errors=[];notify();
  let result;try{result=await (kind==='preview'?previewDocument:frameDocument)(currentText,{...options,signal,onProgress:value=>{if(ticket===job){progress=value;notify();options.onProgress?.(value);}}});}finally{options.signal?.removeEventListener('abort',externalAbort);}
  if(ticket!==job)return failure(new DOMException('Cancelled','AbortError'));
  controller=null;busy=false;progress=null;
  if(signal.aborted)return report(failure(new DOMException('Cancelled','AbortError')));
  if(result.ok){if(kind==='preview'){lastPreview={...result,revision:atRevision};}else{currentText=result.text;revision++;}}
  return report({...result,revision});
 }
 async function command(input){
  try{
   let name,args;
   if(typeof input==='string'){
    if(input.length>100_000)invalid('Command exceeds 100 KB.');const trimmed=input.trim();
    if(trimmed.startsWith('{'))input=json(trimmed);
    else{const match=/^(\S+)(?:\s+([\s\S]+))?$/.exec(trimmed);if(!match)invalid('Enter a command.');name=match[1];if(match[2]!==undefined)args=json(match[2]);}
   }
   if(typeof input!=='string'){
    allowed(input,['command','options','operations'],'Command');name=input.command;
    if(Object.hasOwn(input,'operations')&&name!=='patch'||Object.hasOwn(input,'options')&&!['preview','frame'].includes(name))invalid('Unexpected command arguments.');args=name==='patch'?input.operations:input.options;
   }
   if(typeof name!=='string'||!Object.hasOwn(COMMANDS,name))invalid('Unknown command. Run help for the allowlist.');
   if(!['patch','preview','frame'].includes(name)&&args!==undefined)invalid(`${name} takes no arguments.`);
   if(name==='help')return {ok:true,workflow:agentInstructions(),commands:structuredClone(COMMANDS)};
   if(name==='instructions')return instructions();
   if(name==='status')return status();if(name==='validate')return validate();if(name==='cancel')return cancel();if(name==='exportJSON')return {ok:true,text:currentText,revision};if(name==='patch')return edit(args);
   if(name==='preview'){previewOptions(args??{});return run('preview',args??{});}return run('frame',args??{});
  }catch(error){return report(failure(error));}
 }
 const instructions=()=>({ok:true,workflow:agentInstructions()});
 const initial=inspectDocument(text);if(!initial.ok)throw Error(initial.errors[0].message);currentText=text;revision=1;
 return {status,instructions,load,validate,edit,frame:options=>run('frame',options??{}),preview:options=>run('preview',options??{}),exportJSON:()=>({ok:true,text:currentText,revision}),command,cancel,dispose(){cancel();disposed=true;lastPreview=null;}};
}
