import {parseSequenceDocument,validateSequenceIdentity,validateSequenceHandoff,drawingKey,SEQUENCE_FORMAT,SEQUENCE_LIMITS} from './sequence-config.mjs';
import {prepareScene,sceneJSON} from './pipeline.mjs';
import {dimensions} from './core.mjs';
import {animationSettings} from './motion.mjs';
import {mixSpeech} from './speech/client.mjs';
import {orderArtwork} from './batch-files.mjs';
import {extractDrawingFrames,exportFrameVideo} from './frame-video.mjs';
import {MAX_TRANSFER_FRAMES} from './drawing-transfer.mjs';
import {Stage} from './stage.mjs';
import {annotatedReference} from './reference.mjs';
import {decodeImage,ImageCache} from './images.mjs';
import {exportMP4,fitVoice} from './video.mjs';

const progress=(fn,phase,value=0)=>fn?.({phase,progress:value});
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const png=canvas=>new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Could not prepare drawing.')),'image/png'));

/** Assemble prepared shots into one exact-frame film without changing scene state. */
export function assembleSequence({id,title,shots,handoff=null}){
 validateSequenceIdentity(id,title);
 if(!Array.isArray(shots)||!shots.length||shots.length>SEQUENCE_LIMITS.shots)throw Error('Supply 1–20 shots.');
 const [width,height]=dimensions(shots[0].scene.project),ids=new Set(),slots=[],exposures=[];let totalFrames=0;
 const prepared=shots.map(shot=>{
  validateSequenceIdentity(shot.id,shot.title,'shot');if(ids.has(shot.id))throw Error('Duplicate shot ID.');ids.add(shot.id);
  const {scene}=shot,{project,clip}=scene;
  if(clip?.fps!==24||project.fps!==24)throw Error('Every shot must use 24 fps.');
  if(dimensions(project).some((size,i)=>size!==[width,height][i]))throw Error('All shots must use the same orientation.');
  if(!Number.isInteger(clip.totalFrames)||clip.totalFrames<1)throw Error('Each shot needs a valid frame timeline.');
  // The scene exporter verifies the timeline against current config and speech,
  // and checks the local reference list before its identities enter the film.
  sceneJSON(scene);
  const local=scene.drawingSlots??clip.slots.filter(s=>s.active),available=new Set(local.map(s=>s.id));
  for(const slot of local)slots.push({...slot,id:`${shot.id}:${slot.id}`,shotId:shot.id,slotId:slot.id,key:drawingKey(slot.state)});
  const startFrame=totalFrames;let end=0;
  for(const exposure of clip.exposures){
   if(!available.has(exposure.slotId)||exposure.startFrame!==end||!Number.isInteger(exposure.endFrame)||exposure.endFrame<=end||exposure.endFrame>clip.totalFrames)throw Error('Invalid shot exposure or drawing identity.');
   exposures.push({...exposure,slotId:`${shot.id}:${exposure.slotId}`,shotId:shot.id,startFrame:startFrame+exposure.startFrame,endFrame:startFrame+exposure.endFrame});end=exposure.endFrame;
  }
  if(end!==clip.totalFrames)throw Error('Incomplete shot exposure timeline.');
  totalFrames+=clip.totalFrames;
  return {...shot,startFrame,endFrame:totalFrames};
 });
 if(totalFrames>SEQUENCE_LIMITS.seconds*24)throw Error('The film exceeds 600 seconds.');
 if(slots.length>SEQUENCE_LIMITS.drawings)throw Error('The film exceeds 2000 drawings.');
 const registry=new Map(slots.map(slot=>[slot.id,slot]));
 const saved=handoff?validateSequenceHandoff(handoff,slots,width,height):{version:1,fps:24,width,height,slots:slots.map(({id,shotId,slotId,key})=>({id,shotId,slotId,key}))};
 const drawingSlots=saved.slots.map(s=>registry.get(s.id));
 return {kind:'sequence',id,title,shots:prepared,fps:24,width,height,totalFrames,duration:totalFrames/24,drawingSlots,exposures,handoff:structuredClone(saved)};
}

export async function prepareSequence(text,{signal,onProgress,newReferences=false,allowNewDrawings=false}={}){
 signal?.throwIfAborted();const parsed=parseSequenceDocument(text,{allowStaleHandoff:newReferences||allowNewDrawings}),shots=[];let changed=!!parsed.needsReferences;
 for(const [index,shot]of parsed.shots.entries()){
  signal?.throwIfAborted();
  const scene=await prepareScene(JSON.stringify(shot.config),{signal,newReferences,allowNewDrawings,onProgress:event=>progress(onProgress,`${shot.title}: ${event.phase}`,(index+event.progress)/parsed.shots.length)});
  changed ||= !!scene.needsReferences;shots.push({id:shot.id,title:shot.title,scene});
 }
 signal?.throwIfAborted();
 const result=assembleSequence({...parsed,shots,handoff:newReferences||changed?null:parsed.handoff});
 return changed?{...result,needsReferences:true}:result;
}

export function sequenceJSON(sequence){
 const current=assembleSequence(sequence),data={format:SEQUENCE_FORMAT,version:1,id:current.id,title:current.title,
  shots:current.shots.map(({id,title,scene})=>({id,title,config:JSON.parse(sceneJSON(scene))})),handoff:current.handoff};
 const text=JSON.stringify(data,null,2)+'\n';parseSequenceDocument(text);return text;
}

/** Import the complete carrier atomically, in its saved order, across all shots. */
export async function attachSequenceArtwork(sequence,files,{signal,onProgress}={}){
 signal?.throwIfAborted();const current=assembleSequence(sequence),ordered=orderArtwork([...files]),slots=current.drawingSlots;
 if(!ordered.length)throw Error('Choose a drawing video or numbered images.');
 const shotMap=new Map(current.shots.map(s=>[s.id,s])),background=i=>shotMap.get(slots[i].shotId).scene.project.scene.background;
 const video=/\.(mp4|mov|m4v)$/i.test(ordered[0].name)||ordered[0].type.startsWith('video/');let frames;
 if(video){
  if(slots.length>MAX_TRANSFER_FRAMES)throw Error('Use numbered PNG images for films with more than 100 drawings.');
  frames=await extractDrawingFrames(ordered[0],{width:current.width,height:current.height,expectedCount:slots.length,background,signal,onProgress:value=>progress(onProgress,'Reading drawings',value)});
 }else{
  if(ordered.length!==slots.length)throw Error(`Found ${ordered.length} images; expected ${slots.length}. Include one numbered image for every reference.`);
  const canvas=document.createElement('canvas');canvas.width=current.width;canvas.height=current.height;const ctx=canvas.getContext('2d');frames=[];let bytes=0;
  try{for(const [i,file]of ordered.entries()){
   signal?.throwIfAborted();const image=await decodeImage(file),scale=Math.min(current.width/image.naturalWidth,current.height/image.naturalHeight),width=image.naturalWidth*scale,height=image.naturalHeight*scale;
   ctx.fillStyle=background(i);ctx.fillRect(0,0,current.width,current.height);ctx.drawImage(image,(current.width-width)/2,(current.height-height)/2,width,height);
   const frame=await png(canvas);bytes+=frame.size;if(bytes>256*1024*1024)throw Error('Prepared drawings exceed 256 MB. Split this film into shorter sequences.');frames.push(frame);
   progress(onProgress,'Reading drawings',(i+1)/ordered.length);await tick();
  }}finally{canvas.width=canvas.height=1;}
 }
 signal?.throwIfAborted();
 const artwork=new Map(current.shots.map(s=>[s.id,{}]));slots.forEach((s,i)=>artwork.get(s.shotId)[s.slotId]=frames[i]);
 return {...current,shots:current.shots.map(s=>({...s,scene:{...s.scene,art:artwork.get(s.id)}}))};
}

async function labelShot(blob,shot,slot,index,shotIndex,shotCount,width,height){
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const image=await createImageBitmap(blob);
 try{
  const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const font=Math.round(Math.min(width,height)/36),margin=Math.round(font*.7),padding=Math.round(font*.5),line=Math.round(font*1.35),boxWidth=Math.min(width*.66,820);
  ctx.fillStyle='#ffffff';ctx.fillRect(margin,margin,boxWidth,line*2+padding*2);ctx.strokeStyle='#000';ctx.lineWidth=2;ctx.strokeRect(margin,margin,boxWidth,line*2+padding*2);
  ctx.fillStyle='#0033a0';ctx.fillRect(margin,margin,5,line*2+padding*2);ctx.fillStyle='#000';ctx.textBaseline='middle';ctx.font=`700 ${font}px Arial, sans-serif`;
  ctx.fillText(`${String(index+1).padStart(4,'0')} · ${shot.title}`,margin+padding,margin+padding+line*.5,boxWidth-padding*2);
  ctx.font=`${Math.round(font*.72)}px Arial, sans-serif`;ctx.fillText(`SHOT ${shotIndex+1}/${shotCount} · ${shot.id} · ${slot.slotId}`,margin+padding,margin+padding+line*1.5,boxWidth-padding*2);
  return await png(canvas);
 }finally{image.close();canvas.width=canvas.height=1;}
}

/** Emit one drawing carrier (or numbered PNGs), followed by its portable JSON. */
export async function renderSequenceReferences(sequence,{format='mp4',emit,signal,onProgress}={}){
 if(!['mp4','png','both'].includes(format))throw Error('Choose MP4, PNG, or both.');
 if(typeof emit!=='function')throw Error('An output destination is required.');
 signal?.throwIfAborted();const current=assembleSequence(sequence),json=sequenceJSON(current),slots=current.drawingSlots,video=format!=='png';
 if(video&&slots.length>MAX_TRANSFER_FRAMES)throw Error(`This film has ${slots.length} drawings. Choose PNG images for more than ${MAX_TRANSFER_FRAMES} drawings.`);
 const {width,height}=current,canvas=document.createElement('canvas'),stage=new Stage(canvas),refs={},shots=new Map(current.shots.map((s,i)=>[s.id,{shot:s,index:i}]));let bytes=0,preparedShot;
 try{
  for(const [i,slot]of slots.entries()){
   signal?.throwIfAborted();const {shot,index}=shots.get(slot.shotId);
   if(preparedShot!==shot.id){await stage.prepare(shot.scene.project.scene);preparedShot=shot.id;}
   signal?.throwIfAborted();stage.draw(slot.state,width,height,{guides:shot.scene.project.guides});
   const reference=await annotatedReference(await stage.png(),slot.state,width,height,shot.scene.project.guides),blob=await labelShot(reference,shot,slot,i,index,current.shots.length,width,height);
   signal?.throwIfAborted();
   if(video){bytes+=blob.size;if(bytes>150*1024*1024)throw Error('Reference video images exceed 150 MB. Choose PNG images.');refs[slot.id]=blob;}
   if(format!=='mp4')await emit(`references/${String(i+1).padStart(4,'0')}.png`,blob);
   progress(onProgress,'Rendering references',(i+1)/slots.length);await tick();
  }
 }finally{stage.dispose();canvas.width=canvas.height=1;}
 if(video){
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d'),images=new ImageCache(refs);
  try{const blob=await exportFrameVideo({canvas,frameCount:slots.length,signal,drawFrame:async i=>ctx.drawImage(await images.get(slots[i].id),0,0,width,height),onProgress:value=>progress(onProgress,'Encoding references',value)});signal?.throwIfAborted();await emit('references.mp4',blob);}
  finally{images.clear();canvas.width=canvas.height=1;}
 }
 signal?.throwIfAborted();await emit('sequence.json',new Blob([json],{type:'application/json'}));
}

const hasSound=scene=>scene.project.audioMode!=='silent'&&(scene.project.audioMode==='recording'||animationSettings(scene.project).mode!=='silent');
/** Mix each shot independently, then concatenate at exact 48 kHz frame boundaries. */
export async function sequenceAudio(sequence,context,{signal}={}){
 signal?.throwIfAborted();if(!sequence.shots.some(s=>hasSound(s.scene)))return null;
 if(!context)throw Error('An audio context is required.');
 const rate=48000,samplesPerFrame=rate/sequence.fps,out=context.createBuffer(1,sequence.totalFrames*samplesPerFrame,rate),data=out.getChannelData(0);
 for(const shot of sequence.shots){
  signal?.throwIfAborted();const {scene}=shot,{project,clip,takes}=scene;if(!hasSound(scene))continue;let audio;
  if(project.audioMode==='recording'){
   if(!scene.recording)throw Error(`Shot “${shot.title}” needs its recorded voiceover. Open its project backup or choose Robot voice / Silent.`);
   audio=fitVoice(context,await context.decodeAudioData(await scene.recording.arrayBuffer()),clip.duration,project);
  }else audio=mixSpeech(context,clip,takes);
  signal?.throwIfAborted();const source=audio.getChannelData(0),start=shot.startFrame*samplesPerFrame,length=(shot.endFrame-shot.startFrame)*samplesPerFrame;
  for(let i=0;i<length;i++){
   const at=i*audio.sampleRate/rate,lo=Math.floor(at),fraction=at-lo;
   data[start+i]=(source[lo]??0)*(1-fraction)+(source[lo+1]??0)*fraction;
  }
 }
 return out;
}

/** Encode the entire timeline once; every hard cut follows the shot's exact frame count. */
export async function renderSequenceAnimation(sequence,{signal,onProgress,audioContext}={}){
 signal?.throwIfAborted();const current=assembleSequence(sequence),shots=new Map(current.shots.map(s=>[s.id,s])),art={};
 for(const slot of current.drawingSlots){const blob=shots.get(slot.shotId).scene.art?.[slot.slotId];if(blob)art[slot.id]=blob;}
 if(current.exposures.some(e=>!art[e.slotId]))throw Error('Some drawings are missing. Upload one image or video frame for every reference.');
 const {width,height}=current,canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d'),images=new ImageCache(art);let context,ownsContext=false,exposureIndex=0;
 try{
  if(current.shots.some(s=>hasSound(s.scene))){context=audioContext||new AudioContext();ownsContext=!audioContext;}
  const audio=await sequenceAudio(current,context,{signal});
  return await exportMP4({canvas,fps:current.fps,frameCount:current.totalFrames,duration:current.duration,audio,signal,exactFrames:true,
   draw:async time=>{const frame=Math.round(time*current.fps);while(exposureIndex<current.exposures.length-1&&frame>=current.exposures[exposureIndex].endFrame)exposureIndex++;
    const exposure=current.exposures[exposureIndex],image=await images.get(exposure.slotId);ctx.fillStyle=shots.get(exposure.shotId).scene.project.scene.background;ctx.fillRect(0,0,width,height);ctx.drawImage(image,0,0,width,height);},
   onProgress:value=>progress(onProgress,'Encoding animation',value)});
 }finally{images.clear();canvas.width=canvas.height=1;if(ownsContext)await context.close();}
}
