import {parseConfigDocument,exportConfig} from './config.mjs';
import {restoreHandoff} from './handoff.mjs';
import {dimensions,slotAt} from './core.mjs';
import {animationSettings} from './motion.mjs';
import {generateSpeech,mixSpeech} from './speech/client.mjs';
import {orderArtwork} from './batch-files.mjs';
import {extractDrawingFrames,exportFrameVideo} from './frame-video.mjs';
import {MAX_TRANSFER_FRAMES} from './drawing-transfer.mjs';
import {Stage} from './stage.mjs';
import {annotatedReference} from './reference.mjs';
import {decodeImage,ImageCache} from './images.mjs';
import {exportMP4,fitVoice} from './video.mjs';

const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const png=canvas=>new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Could not prepare drawing.')),'image/png'));
const progress=(fn,phase,value=0)=>fn?.({phase,progress:value});
export async function prepareScene(text,{signal,onProgress,newReferences=false,allowNewDrawings=false}={}){
 signal?.throwIfAborted();const {project,handoff}=parseConfigDocument(text);
 progress(onProgress,'Speech');
 const takes=animationSettings(project).mode==='speech'?await generateSpeech(project,{signal,onProgress:n=>progress(onProgress,'Speech',n/Math.max(1,project.lines.filter(l=>l.text.trim()).length))}):{};
 signal?.throwIfAborted();
 try{return {...restoreHandoff(project,takes,newReferences?null:handoff),art:{}};}
 catch(error){if(!allowNewDrawings||error.code!=='HANDOFF_DRAWINGS_CHANGED')throw error;return {...restoreHandoff(project,takes,null),art:{},needsReferences:true};}
}
export async function attachArtwork(scene,files,{signal,onProgress}={}){
 signal?.throwIfAborted();const ordered=orderArtwork([...files]),slots=scene.drawingSlots||scene.clip.slots.filter(s=>s.active),[width,height]=dimensions(scene.project);
 if(!ordered.length)throw Error('Choose a drawing video or numbered images.');
 const video=/\.(mp4|mov|m4v)$/i.test(ordered[0].name)||ordered[0].type.startsWith('video/');let frames;
 if(video){
  frames=await extractDrawingFrames(ordered[0],{width,height,expectedCount:slots.length,background:scene.project.scene.background,signal,onProgress:value=>progress(onProgress,'Reading drawings',value)});
 }else{
  if(ordered.length!==slots.length)throw Error(`Found ${ordered.length} images; expected ${slots.length}. Include one numbered image for every reference.`);
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');frames=[];let bytes=0;
  try{for(const [i,file]of ordered.entries()){
   signal?.throwIfAborted();const img=await decodeImage(file),scale=Math.min(width/img.naturalWidth,height/img.naturalHeight),w=img.naturalWidth*scale,h=img.naturalHeight*scale;
   ctx.fillStyle=scene.project.scene.background;ctx.fillRect(0,0,width,height);ctx.drawImage(img,(width-w)/2,(height-h)/2,w,h);
   const frame=await png(canvas);bytes+=frame.size;if(bytes>256*1024*1024)throw Error('Prepared drawings exceed 256 MB. Split this scene into shorter clips.');frames.push(frame);progress(onProgress,'Reading drawings',(i+1)/ordered.length);await tick();
  }}finally{canvas.width=1;canvas.height=1;}
 }
 signal?.throwIfAborted();return {...scene,art:Object.fromEntries(slots.map((s,i)=>[s.id,frames[i]]))};
}
export function sceneJSON(scene){return exportConfig(scene.project,{clip:scene.clip,takes:scene.takes,transfer:scene.transfer,drawingSlots:scene.drawingSlots});}
export async function renderReferences(scene,{format='mp4',signal,onProgress,emit}={}){
 if(!['mp4','png','both'].includes(format))throw Error('Choose MP4, PNG, or both.');
 if(typeof emit!=='function')throw Error('An output destination is required.');
 const slots=scene.drawingSlots||scene.clip.slots.filter(s=>s.active),video=format!=='png';
 if(video&&slots.length>MAX_TRANSFER_FRAMES)throw Error(`This scene has ${slots.length} drawings. Choose PNG images for more than ${MAX_TRANSFER_FRAMES} drawings.`);
 const [width,height]=dimensions(scene.project),canvas=document.createElement('canvas'),stage=new Stage(canvas),refs={};let bytes=0;
 try{
  await stage.prepare(scene.project.scene);
  for(const [i,s]of slots.entries()){
   signal?.throwIfAborted();stage.draw(s.state,width,height,{guides:scene.project.guides});const blob=await annotatedReference(await stage.png(),s.state,width,height,scene.project.guides);
   if(video){bytes+=blob.size;if(bytes>150*1024*1024)throw Error('Reference video images exceed 150 MB. Choose PNG images.');refs[s.id]=blob;}
   if(format!=='mp4')await emit(`references/${String(i+1).padStart(4,'0')}.png`,blob);
   progress(onProgress,'Rendering references',(i+1)/slots.length);await tick();
  }
 }finally{stage.dispose();canvas.width=1;canvas.height=1;}
 if(video){
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d'),images=new ImageCache(refs);
  try{const blob=await exportFrameVideo({canvas,frameCount:slots.length,signal,drawFrame:async i=>ctx.drawImage(await images.get(slots[i].id),0,0,width,height),onProgress:value=>progress(onProgress,'Encoding references',value)});signal?.throwIfAborted();await emit('references.mp4',blob);}
  finally{images.clear();canvas.width=1;canvas.height=1;}
 }
 signal?.throwIfAborted();await emit('scene.json',new Blob([sceneJSON(scene)],{type:'application/json'}));
}
export async function renderAnimation(scene,{signal,onProgress,audioContext}={}){
 const {project,clip,art,takes}=scene;
 if(clip.slots.some(s=>s.active&&!art[s.id]))throw Error('Some drawings are missing. Upload one image or video frame for every reference.');
 signal?.throwIfAborted();const [w,h]=dimensions(project),canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d'),images=new ImageCache(art);let context,ownsContext=false;
 try{
  let audio=null;
  if(project.audioMode!=='silent'&&(project.audioMode==='recording'||animationSettings(project).mode!=='silent')){
   context=audioContext||new AudioContext();ownsContext=!audioContext;
   if(project.audioMode==='recording'){
    if(!scene.recording)throw Error('This scene needs its recorded voiceover. Open its project backup or choose Robot voice / Silent.');
    audio=fitVoice(context,await context.decodeAudioData(await scene.recording.arrayBuffer()),clip.duration,project);
   }else audio=mixSpeech(context,clip,takes);
  }
  return await exportMP4({canvas,fps:clip.fps,frameCount:clip.totalFrames,duration:clip.duration,audio,signal,exactFrames:true,
   draw:async t=>{const img=await images.get(slotAt(clip,t).id);ctx.fillStyle=project.scene.background;ctx.fillRect(0,0,w,h);ctx.drawImage(img,0,0,w,h);},onProgress:value=>progress(onProgress,'Encoding animation',value)});
 }finally{images.clear();canvas.width=1;canvas.height=1;if(ownsContext)await context.close();}
}
// Same pipeline for one scene, folder batches, and browser automation.
export async function processSceneJob(job,{mode='auto',referenceFormat='mp4',signal,onProgress,emit}={}){
 if(job.error)throw Error(job.error);if(!['auto','references','animation'].includes(mode))throw Error('Invalid generation mode.');
 const finish=mode==='animation'||mode==='auto'&&job.artwork.length>0,scene=await prepareScene(await job.config.text(),{signal,onProgress,newReferences:!finish});
 if(finish){const ready=await attachArtwork(scene,job.artwork,{signal,onProgress}),video=await renderAnimation(ready,{signal,onProgress});signal?.throwIfAborted();await emit('animation.mp4',video);await emit('scene.json',new Blob([sceneJSON(ready)],{type:'application/json'}));return {kind:'animation',drawings:ready.drawingSlots.length,duration:ready.clip.duration};}
 await renderReferences(scene,{format:referenceFormat,signal,onProgress,emit});return {kind:'references',drawings:scene.drawingSlots.length,duration:scene.clip.duration};
}
