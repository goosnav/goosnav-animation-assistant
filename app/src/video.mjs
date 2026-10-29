import { Output, Mp4OutputFormat, BufferTarget, CanvasSource, AudioBufferSource, canEncodeVideo, canEncodeAudio } from 'mediabunny';

export async function validateVideo(blob){
 const url=URL.createObjectURL(blob),video=document.createElement('video');video.muted=true;video.playsInline=true;
 try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('The exported video could not be opened')),10000);video.onloadeddata=()=>{clearTimeout(timer);resolve();};video.onerror=()=>{clearTimeout(timer);reject(Error('The exported video is not playable'));};video.src=url;video.load();});if(!video.videoWidth)throw Error('Video contains no picture');return {width:video.videoWidth,height:video.videoHeight,duration:video.duration};}
 finally{video.removeAttribute('src');video.load();URL.revokeObjectURL(url);}
}
async function webcodecs({canvas,duration,audio,draw,signal,onProgress=()=>{}}){
 const target=new BufferTarget(),out=new Output({format:new Mp4OutputFormat(),target});
 const source=new CanvasSource(canvas,{codec:'avc',bitrate:6_000_000});out.addVideoTrack(source,{frameRate:24});
 let sound;if(audio){sound=new AudioBufferSource({codec:'aac',bitrate:128000});out.addAudioTrack(sound);}
 try{await out.start();if(sound)await sound.add(audio);
  const frames=Math.ceil(duration*24);
  for(let i=0;i<frames;i++){signal?.throwIfAborted();await draw(i/24);await source.add(i/24,1/24);onProgress((i+1)/frames);if(i%12===0)await new Promise(r=>setTimeout(r,0));}
  source.close();sound?.close();await out.finalize();return new Blob([target.buffer],{type:'video/mp4'});
 }catch(e){await out.cancel().catch(()=>{});throw e;}
}
function mp4Mime(withAudio=false){return (withAudio?['video/mp4;codecs=avc1.42E01E,mp4a.40.2']:['video/mp4;codecs=avc1.42E01E','video/mp4']).find(t=>globalThis.MediaRecorder?.isTypeSupported(t));}
async function realtime({canvas,duration,audio,draw,signal,onProgress=()=>{}}){
 if(document.hidden)throw Error('Keep this page visible while exporting');
 const mimeType=mp4Mime(!!audio);if(!mimeType)throw Error('This browser cannot encode MP4. Your project and drawings can still be saved.');
 const context=new AudioContext();await context.resume();const destination=context.createMediaStreamDestination();
 const silent=context.createConstantSource();silent.offset.value=0;silent.connect(destination);silent.start();
 let source;if(audio){source=context.createBufferSource();source.buffer=audio;source.connect(destination);}
 await draw(0);const stream=canvas.captureStream(24);if(audio)destination.stream.getAudioTracks().forEach(t=>stream.addTrack(t));
 const recorder=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:6_000_000}),chunks=[];let stopped=false,abortError;
 const stop=(e)=>{if(e)abortError=e;if(stopped)return;stopped=true;if(recorder.state!=='inactive')recorder.stop();};
 const abort=()=>stop(new DOMException('Export cancelled','AbortError'));
 const hidden=()=>{if(document.hidden)stop(Error('Export interrupted. Keep the page visible and try again.'));};
 signal?.addEventListener('abort',abort,{once:true});document.addEventListener('visibilitychange',hidden);
 try{
  const done=new Promise((resolve,reject)=>{recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.onerror=e=>reject(e.error||Error('Video encoder failed'));recorder.onstop=resolve;});
  recorder.start();source?.start();const start=context.currentTime;
  while(!stopped){signal?.throwIfAborted();const t=context.currentTime-start;if(t>=duration){stop();break;}await draw(t);onProgress(t/duration);await new Promise(r=>setTimeout(r,20));}
  await done;if(abortError)throw abortError;const blob=new Blob(chunks,{type:'video/mp4'});if(!blob.size)throw Error('The video encoder produced an empty file');return blob;
 }finally{stop();source?.stop();silent.stop();stream.getTracks().forEach(t=>t.stop());await context.close();signal?.removeEventListener('abort',abort);document.removeEventListener('visibilitychange',hidden);}
}
let aacReady;
export async function exportMP4(options){
 if(options.audio&&!(await canEncodeAudio('aac'))){aacReady??=import('@mediabunny/aac-encoder').then(m=>m.registerAacEncoder());await aacReady;}
 const capable=await canEncodeVideo('avc',{width:options.canvas.width,height:options.canvas.height})&&(!options.audio||await canEncodeAudio('aac',{sampleRate:options.audio.sampleRate,numberOfChannels:1}));
 let blob;
 if(capable){try{blob=await webcodecs(options);}catch(e){if(options.signal?.aborted)throw e;if(!mp4Mime(!!options.audio))throw e;options.onFallback?.();blob=await realtime(options);}}
 else {options.onFallback?.();blob=await realtime(options);}
 await validateVideo(blob);return blob;
}
export async function probeMP4(withAudio=true){
 const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;const c=canvas.getContext('2d');
 const context=new AudioContext();const audio=withAudio?context.createBuffer(1,12000,48000):null;await context.close();
 return exportMP4({canvas,duration:.25,audio,draw:async t=>{c.fillStyle=t<.1?'#0033a0':'#ffcd00';c.fillRect(0,0,128,128);}});
}
export async function microphone(){
 if(!navigator.mediaDevices?.getUserMedia)throw Error('Microphone recording requires HTTPS or localhost');
 const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
 const mimeType=['audio/mp4','audio/webm;codecs=opus','audio/webm'].find(t=>MediaRecorder.isTypeSupported(t));
 let recorder;try{recorder=new MediaRecorder(stream,mimeType?{mimeType}:{});}catch(e){stream.getTracks().forEach(t=>t.stop());throw e;}
 const chunks=[];recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
 let finish,fail,started=false;
 const done=new Promise((resolve,reject)=>{finish=resolve;fail=reject;});done.catch(()=>{});
 const release=()=>stream.getTracks().forEach(t=>t.stop());
 recorder.onstop=()=>{release();finish(new Blob(chunks,{type:recorder.mimeType}));};
 recorder.onerror=e=>{release();fail(e.error||Error('Recording failed'));};
 return {start(){recorder.start();started=true;},stop(){if(recorder.state!=='inactive')recorder.stop();else if(!started){release();finish(new Blob([]));}return done;},cancel(){if(recorder.state!=='inactive')recorder.stop();else finish(new Blob([]));release();}};
}
export function fitVoice(context,buffer,duration,{audioOffset=0,audioTrimStart=0,audioTrimEnd=0}={}){
 const rate=buffer.sampleRate,out=context.createBuffer(1,Math.ceil(duration*rate),rate),data=out.getChannelData(0);
 const start=Math.max(0,Math.round(audioTrimStart*rate)),end=Math.max(start,buffer.length-Math.round(audioTrimEnd*rate)),offset=Math.round(audioOffset*rate);
 for(let i=start;i<end;i++){const dest=i-start+offset;if(dest<0||dest>=data.length)continue;for(let ch=0;ch<buffer.numberOfChannels;ch++)data[dest]+=buffer.getChannelData(ch)[i]/buffer.numberOfChannels;}
 return out;
}
