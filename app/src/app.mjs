import { newProject, validateProject, compileClip, slotAt, dimensions, toggleSelection, MODELS, MOUTHS, POSES, uid } from './core.mjs';
import { Stage } from './stage.mjs';
import { generateSpeech, mixSpeech } from './speech/client.mjs';
import { saveState, loadState, listSaved, loadSaved, localApp, quitLocal } from './storage.mjs';
import { packProject, unpackProject } from './archive.mjs';
import { download, shareFiles, imageZip, normalizeImage, ImageCache, layeredPSD, decodeImage, thumbnail } from './images.mjs';
import { exportMP4, probeMP4, microphone, fitVoice, validateVideo } from './video.mjs';
import { makeTransfer, validateTransfer, transferSlots, assignTransferFrames } from './drawing-transfer.mjs';
import { exportFrameVideo, extractDrawingFrames } from './frame-video.mjs';

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const tabs=['stage','rehearse','draw','assemble','finish'];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const option=(v,label,selected)=>`<option value="${esc(v)}" ${selected===v?'selected':''}>${esc(label)}</option>`;
const pretty=s=>s.replaceAll('-',' ').replace(/^./,c=>c.toUpperCase());
let state={project:newProject(),takes:{},art:{},refs:{},recording:null,video:null,thumbs:{},artThumbs:{}},clip=null,stage,tab='stage',time=0;
let closing=false,busy=null,playing=false,playToken=0,source=null,context,cache,renderTicket=0,saveTimer,saveChain=Promise.resolve(),mic=null,recordingActive=false,recordingToken=0;
let imports=[],order=[],undo=[],redo=[],lastHistory,urls=[],voiceUrl,returnedUrl,finalUrl,finalBlob,referenceFiles=[];
let drawingVideoBlob,drawingVideoUrl;
const p=()=>state.project;
function status(message,error=false){$('#status').textContent=message;$('#status').classList.toggle('error',error);}
function audioContext(){return context??=new AudioContext();}
function currentDuration(){return state.video?$('#returned-video').duration:clip?.duration||0;}
function slots(){return clip?.slots.filter(s=>s.active)||[];}
function filename(suffix){return (p().title.replace(/[^a-z0-9_-]+/gi,'-').slice(0,60)||'animation')+suffix;}
function snapshot(){return JSON.stringify(p());}
function remember(){if(lastHistory){undo.push(lastHistory);if(undo.length>30)undo.shift();}redo=[];lastHistory=snapshot();}
function save(){if(closing)return;clearTimeout(saveTimer);$('#saved').textContent='Saving…';saveTimer=setTimeout(()=>flushSave().catch(()=>{}),250);}
function flushSave(){
 if(closing)return Promise.resolve();clearTimeout(saveTimer);const copy=structuredClone(state);
 saveChain=saveChain.catch(()=>{}).then(()=>saveState(copy)).then(()=>$('#saved').textContent='Saved on this device').catch(e=>{$('#saved').textContent='Not saved — download a backup';status(`Autosave unavailable: ${e.message}`,true);throw e;});return saveChain;
}
function clearExport(){finalBlob=null;if(finalUrl)URL.revokeObjectURL(finalUrl);finalUrl=null;$('#final-video').removeAttribute('src');$('#final-video').load();$('#export-result').hidden=true;}
function clearDrawingVideo(){drawingVideoBlob=null;if(drawingVideoUrl)URL.revokeObjectURL(drawingVideoUrl);drawingVideoUrl=null;$('#drawing-video-preview').removeAttribute('src');$('#drawing-video-preview').load();$('#drawing-video-result').hidden=true;}
function refreshTransfer(){
 const transfer=state.transfer;
 if(!transfer){$('#transfer-summary').textContent='Export a drawing-reference video in Draw first.';return;}
 const label=`Reference set ${transfer.id.slice(0,8)} · ${transfer.slots.length} frames · ${transfer.width} × ${transfer.height}.`;
 let note=' Choose the drawn MP4 made from this reference set.';
 try{if(clip)transferSlots(transfer,p(),clip);else note=' Generate dialogue in Rehearse before importing.';}catch(e){note=' '+e.message;}
 $('#transfer-summary').textContent=label+note;
}
function invalidateVideo(){clearExport();if(state.recording){state.voiceStale=true;$('#voice-stale').hidden=false;}}
function recompile(){
 if(!Object.keys(state.takes).length){clip=null;return;}
 try{clip=compileClip(p(),state.takes,p().slots);p().slots=clip.slots;}catch{clip=null;}
}
function changed({speech=false}={}){
 stopPlayback();remember();invalidateVideo();clearDrawingVideo();
 if(speech){state.takes={};clip=null;p().overrides=[];}else recompile();
 referenceFiles=[];$('#share-controls').hidden=true;refreshStats();renderReferences();save();renderPreview().catch(e=>status(e.message,true));
}
function activeState(){return clip?slotAt(clip,time)?.state:{scene:p().scene,mouths:['rest','rest'],blinks:[false,false]};}
async function renderPreview(){
 const ticket=++renderTicket;
 if(state.video){const v=$('#returned-video');v.hidden=false;if(!playing&&v.readyState>0)v.currentTime=Math.min(time,Math.max(0,v.duration-.001));$('#stage-canvas').hidden=true;$('#art-canvas').hidden=true;$('#preview-badge').textContent='YOUR VIDEO';updateClock();return;}
 $('#returned-video').hidden=true;
 const useArt=$('#show-art').checked&&clip,slot=clip&&slotAt(clip,time);
 const [w,h]=dimensions(p()),width=p().scene.format==='portrait'?432:768,height=Math.round(width*h/w);
 $('#preview-frame').className=p().scene.format;
 if(useArt&&state.art[slot?.id]){
  cache??=new ImageCache(state.art);const img=await cache.get(slot.id);if(ticket!==renderTicket)return;
  const c=$('#art-canvas');if(c.width!==width||c.height!==height){c.width=width;c.height=height;}const ctx=c.getContext('2d');ctx.fillStyle=p().scene.background;ctx.fillRect(0,0,width,height);ctx.drawImage(img,0,0,width,height);
  c.hidden=false;$('#stage-canvas').hidden=true;$('#preview-badge').textContent='YOUR DRAWING';
 }else{
  $('#art-canvas').hidden=true;$('#stage-canvas').hidden=false;$('#preview-badge').textContent=useArt?'MISSING DRAWING':'3D GUIDE';
  if(stage){await stage.prepare(p().scene);if(ticket!==renderTicket)return;stage.draw(activeState(),width,height);stage.controls.enabled=tab==='stage'&&!busy&&!playing;}
 }
 updateClock();
}
function updateClock(){const d=currentDuration()||0;$('#scrub').max=d;$('#scrub').step=1/p().fps;$('#scrub').value=time;$('#time').textContent=`${time.toFixed(2)} / ${d.toFixed(2)} s`;}
function refreshStats(){
 refreshTransfer();
 const n=slots().length,done=slots().filter(s=>state.art[s.id]).length;
 $('#drawing-count').textContent=clip?n:'—';$('#duration').textContent=clip?clip.duration.toFixed(1):'—';$('#art-count').textContent=done;
 $('#budget').textContent=n>23?`${n} drawings. Consider fewer acting changes or a shorter clip to stay under 24.`:'Bodies hold still. Mouth drawings repeat automatically.';
 $('#budget').classList.toggle('warning',n>23);$('#voice-stale').hidden=!state.voiceStale;updateClock();
}
function showTab(next){tab=next;$$('[data-view]').forEach(e=>e.hidden=e.dataset.view!==tab);$('#saved-clips').ontoggle=async()=>{if(!$('#saved-clips').open)return;try{const saved=await listSaved();$('#saved-list').innerHTML=saved.length?saved.map(s=>`<button data-open-saved="${esc(s.id)}">${esc(s.title)}</button>`).join(''):'No saved clips yet.';}catch(e){status(e.message,true);}};
$('#saved-list').onclick=e=>{const id=e.target.closest('[data-open-saved]')?.dataset.openSaved;if(id)run('Opening saved clip…',async()=>{await flushSave();await restore(await loadSaved(id));$('#saved-clips').open=false;status('Project restored.');});};
$$('[data-tab]').forEach(e=>{if(e.dataset.tab===tab)e.setAttribute('aria-current','step');else e.removeAttribute('aria-current');});$('#footer-label').textContent={stage:'Set the scene',rehearse:'Adjust the performance',draw:'Draw in Procreate',assemble:'Import your drawn video',finish:'Voice and export'}[tab];$('#back').disabled=tabs.indexOf(tab)===0;$('#next').hidden=tab==='finish';if(stage)stage.controls.enabled=tab==='stage'&&!busy;}
function slider(label,key,value,min,max,step=1,attrs=''){
 return `<label>${esc(label)} <output>${Number(value).toFixed(step<1?2:0)}</output><input type="range" data-key="${key}" ${attrs} min="${min}" max="${max}" step="${step}" value="${value}"></label>`;
}
function populate(){
 $('#title').value=p().title;$('#format').value=p().scene.format;$('#style').value=p().scene.style;$('#background').value=p().scene.background;$('#cast-count').value=p().scene.count;$('#projection').value=p().scene.camera.projection;$('#fps').value=p().fps;$('#rate').value=p().rate;$('#rate-label').textContent=p().rate.toFixed(2)+'×';
 $('#camera-fields').innerHTML=[['Orbit','azimuth',-180,180],['Elevation','elevation',-45,75],['Zoom','zoom',.4,3,.05],['Pan sideways','targetX',-3,3,.05],['Pan up/down','targetY',0,3,.05]].map(([l,k,min,max,step])=>slider(l,k,p().scene.camera[k],min,max,step||1,'data-camera')).join('');
 $('#actor-fields').innerHTML=p().scene.actors.slice(0,p().scene.count).map((a,i)=>`<div class="actor"><h3>Character ${i?'B':'A'}</h3><div class="field-pair"><label>Character<select data-actor="${i}" data-key="model">${MODELS.map(m=>option(m,pretty(m),a.model)).join('')}</select></label><label>Held pose<select data-actor="${i}" data-key="pose">${POSES.map(m=>option(m,pretty(m),a.pose)).join('')}</select></label></div><div class="sliders">${[['Position','x',-3,3,.05],['Depth','z',-2,2,.05],['Turn','yaw',-180,180,1],['Size','scale',.5,1.5,.05]].map(([l,k,min,max,step])=>slider(l,k,a[k],min,max,step,`data-actor="${i}"`)).join('')}</div><details><summary>Head, arms, and hands</summary><div class="sliders">${[['Head turn','headYaw',-75,75],['Head tilt','headTilt',-35,35],['Left arm','armL',-90,90],['Right arm','armR',-90,90],['Left hand','handL',-90,90],['Right hand','handR',-90,90]].map(([l,k,min,max])=>slider(l,k,a[k],min,max,1,`data-actor="${i}"`)).join('')}</div></details></div>`).join('');
 renderLines();$('#override-mouth').innerHTML=MOUTHS.map(m=>option(m,pretty(m),'rest')).join('');
 $('#audio-mode').value=p().audioMode;$('#audio-offset').value=p().audioOffset;$('#trim-start').value=p().audioTrimStart;$('#trim-end').value=p().audioTrimEnd;
 refreshStats();renderReferences();renderAssigned();
}
function renderLines(){
 $('#lines').innerHTML=p().lines.map((l,i)=>`<div class="line" data-line="${i}"><div class="line-heading"><h3>Line ${i+1}</h3><button data-remove-line="${i}" aria-label="Remove line ${i+1}">Remove</button></div><label>Speaker<select data-line-key="actor">${[0,1].slice(0,p().scene.count).map(n=>option(String(n),`Character ${n?'B':'A'}`,String(l.actor))).join('')}</select></label><label class="sr-only" for="line-${i}">Dialogue ${i+1}</label><textarea id="line-${i}" data-line-key="text" maxlength="1000" placeholder="What do they say?">${esc(l.text)}</textarea><div class="field-pair"><label>Speed<input data-line-key="rate" type="number" min=".5" max="2" step=".05" value="${l.rate}"></label><label>Pause afterward (s)<input data-line-key="pause" type="number" min="0" max="10" step=".1" value="${l.pause}"></label></div><details><summary>Optional acting change</summary><label>Held pose while speaking<select data-line-key="pose">${['keep',...POSES].map(m=>option(m,m==='keep'?'Keep scene pose':pretty(m),l.pose)).join('')}</select></label><label>Extra head turn<input data-line-key="headYaw" type="range" min="-75" max="75" step="5" value="${l.headYaw||0}"></label><label class="check"><input data-line-key="blink" type="checkbox" ${l.blink?'checked':''}> Blink at the start of this line</label><p class="hint">An acting change may require additional drawings.</p></details></div>`).join('');
}
function clearGalleryURLs(){urls.forEach(URL.revokeObjectURL);urls=[];}
function blobURL(blob){const u=URL.createObjectURL(blob);urls.push(u);return u;}
function releaseGallery(selector){$$(selector+' img').forEach(img=>{if(img.src.startsWith('blob:')){URL.revokeObjectURL(img.src);urls=urls.filter(u=>u!==img.src);}});}
function renderReferences(){
 releaseGallery('#reference-gallery');$('#reference-gallery').replaceChildren();
 slots().forEach((s,i)=>{if(!state.refs[s.id])return;const box=document.createElement('div');box.className='drawing';box.innerHTML=`<figure><img src="${blobURL(state.thumbs[s.id]||state.refs[s.id])}" alt="Reference ${i+1}, ${s.state.mouths.map(pretty).join(' / ')}"><span class="number">${i+1}</span><figcaption>${esc(s.state.mouths.slice(0,p().scene.count).map(pretty).join(' / '))}</figcaption></figure><button data-share-ref="${esc(s.id)}">Share image</button>`;$('#reference-gallery').append(box);});
}
function renderAssigned(){
 releaseGallery('#assigned-gallery');$('#assigned-gallery').replaceChildren();slots().filter(s=>state.art[s.id]).forEach(s=>{const i=slots().indexOf(s),box=document.createElement('div');box.className='drawing';box.innerHTML=`<img src="${blobURL(state.artThumbs[s.id]||state.art[s.id])}" alt="Assigned drawing ${i+1}"><span class="number">${i+1}</span><span class="caption">Drawing assigned</span>`;$('#assigned-gallery').append(box);});
}
function renderImports(){
 $('#selection-tools').hidden=!imports.length;$('#selection-count').textContent=`${order.length} of ${slots().length} drawings numbered. Tap in reference order.`;
 $$('#import-gallery .match img').forEach(img=>{URL.revokeObjectURL(img.src);urls=urls.filter(u=>u!==img.src);});$('#import-gallery').replaceChildren();
 for(const item of imports){const n=order.indexOf(item.id),s=slots()[n],button=document.createElement('button');button.className='drawing'+(n>=0?' selected':'');button.dataset.choose=item.id;button.setAttribute('aria-pressed',n>=0);button.setAttribute('aria-label',n>=0?`Drawing ${n+1}, tap to unselect`:`Select ${item.name}`);button.innerHTML=`<img src="${item.url}" alt="${esc(item.name)}">${n>=0?`<span class="number">${n+1}</span>`:''}<span class="caption">${n>=0?`Assigned to reference ${n+1}`:'Tap to number'}</span>${s&&state.refs[s.id]?`<span class="match"><img src="${blobURL(state.thumbs[s.id]||state.refs[s.id])}" alt="Reference ${n+1}">Reference ${n+1}</span>`:''}`;$('#import-gallery').append(button);}
}
async function run(label,fn){
 if(busy)return;stopPlayback();busy=new AbortController();const controller=busy;
 $$('button,input,select,textarea').forEach(e=>e.disabled=true);$('#cancel').disabled=false;$('#busy-panel').hidden=false;$('#progress').removeAttribute('value');status(label);
 if(stage)stage.controls.enabled=false;
 try{await fn(controller.signal);}
 catch(e){status(e.name==='AbortError'?'Cancelled. Your project is still here.':e.message,e.name!=='AbortError');}
 finally{busy=null;$$('button,input,select,textarea').forEach(e=>e.disabled=false);$('#busy-panel').hidden=true;showTab(tab);$('#audio-mode option[value=robot]').disabled=!!state.video;if(!closing)save();}
}
function requireClip(){if(!clip)throw Error('Generate the animation in Rehearse first.');}
function requireArt(){requireClip();if(slots().some(s=>!state.art[s.id]))throw Error('Import your drawn video or assign all drawings before exporting the finished clip.');}
async function selectedAudio(duration){
 const c=audioContext();if(p().audioMode==='silent')return null;
 if(p().audioMode==='recording'){if(!state.recording)throw Error('Record a voiceover first, or choose Robot voice / Silent.');return fitVoice(c,await c.decodeAudioData(await state.recording.arrayBuffer()),duration,p());}
 if(state.video)return null;
 requireClip();return mixSpeech(c,clip,state.takes);
}
function stopPlayback(){playing=false;playToken++;if(source){try{source.stop();}catch{}source=null;}$('#returned-video').pause();$('#play').textContent='▶ Play';}
async function play({silent=false,fromStart=false,onEnd}={}){
 stopPlayback();if(!state.video)requireClip();const duration=currentDuration();if(!Number.isFinite(duration)||!duration)throw Error('No playable animation yet');
 if(fromStart||time>=duration-.05)time=0;
 const c=audioContext();await c.resume();const token=++playToken;
 let audio;if(!silent)audio=await selectedAudio(duration);if(token!==playToken)return;
 if(audio){source=c.createBufferSource();source.buffer=audio;source.connect(c.destination);source.start(0,time);}
 playing=true;$('#play').textContent='■ Pause';const started=c.currentTime-time;
 if(state.video){const v=$('#returned-video');v.currentTime=time;v.muted=true;await v.play();}
 while(playing&&token===playToken){time=Math.min(duration,c.currentTime-started);if(time>=duration){stopPlayback();time=0;await renderPreview();onEnd?.();break;}await renderPreview();updateClock();await new Promise(r=>setTimeout(r,1000/p().fps));}
}
async function prepareDrawings(signal){
 requireClip();const [w,h]=dimensions(p()),canvas=document.createElement('canvas'),renderer=new Stage(canvas);const fresh={...state.refs};
 try{await renderer.prepare(p().scene);for(const [i,s]of slots().entries()){signal.throwIfAborted();if(!fresh[s.id]){renderer.draw(s.state,w,h);fresh[s.id]=await renderer.png();state.thumbs[s.id]=await thumbnail(fresh[s.id]);}$('#progress').value=(i+1)/slots().length;await new Promise(r=>setTimeout(r,0));}}finally{renderer.dispose();canvas.width=1;canvas.height=1;}
 state.refs=fresh;referenceFiles=slots().map((s,i)=>new File([fresh[s.id]],`${String(i+1).padStart(2,'0')}-${s.id}.png`,{type:'image/png'}));
 $('#share-batch').innerHTML=Array.from({length:Math.ceil(referenceFiles.length/6)},(_,i)=>option(String(i),`Images ${i*6+1}–${Math.min(referenceFiles.length,(i+1)*6)}`,i?'':'0')).join('');
 $('#share-controls').hidden=false;renderReferences();status(`${referenceFiles.length} drawings ready. Tap Share drawings, then Save Images in the iPad share sheet.`);
}
async function prepareDrawingVideo(signal){
 requireClip();const transfer=makeTransfer(p(),clip);
 await prepareDrawings(signal);signal.throwIfAborted();
 const canvas=document.createElement('canvas');canvas.width=transfer.width;canvas.height=transfer.height;
 const ctx=canvas.getContext('2d'),images=new ImageCache(state.refs);
 try{
  status(`Encoding ${transfer.slots.length} unique drawings at 6 fps…`);
  const blob=await exportFrameVideo({canvas,frameCount:transfer.slots.length,signal,onProgress:f=>{$('#progress').value=f;},drawFrame:async i=>{ctx.drawImage(await images.get(transfer.slots[i].id),0,0,canvas.width,canvas.height);}});
  signal.throwIfAborted();
  // Save the mapping before exposing the download. Otherwise leaving for Procreate could lose it.
  const previous=state.transfer;state.transfer=transfer;
  try{await flushSave();}catch(e){state.transfer=previous;throw e;}
  clearDrawingVideo();drawingVideoBlob=blob;drawingVideoUrl=URL.createObjectURL(blob);
  $('#drawing-video-preview').src=drawingVideoUrl;$('#drawing-video-result').hidden=false;
  $('#drawing-video-info').textContent=`${transfer.slots.length} drawing frames · 6 fps · reference set ${transfer.id.slice(0,8)}. Save to Photos or Files, then import in Procreate.`;
  refreshTransfer();status('Drawing video ready. Share or download it, then trace the frames in Procreate.');
 }finally{images.clear();canvas.width=1;canvas.height=1;}
}
async function importDrawingVideo(file,signal){
 requireClip();const transfer=state.transfer;transferSlots(transfer,p(),clip);
 const frames=await extractDrawingFrames(file,{width:transfer.width,height:transfer.height,expectedCount:transfer.slots.length,signal,onProgress:f=>{$('#progress').value=f;}});
 const next=assignTransferFrames(transfer,p(),clip,frames,state.art),thumbs={...state.artThumbs};
 for(const [i,s]of transfer.slots.entries()){signal.throwIfAborted();thumbs[s.id]=await thumbnail(frames[i]);}
 signal.throwIfAborted();
 state.art=next;state.artThumbs=thumbs;state.video=null;time=0;
 if(returnedUrl)URL.revokeObjectURL(returnedUrl);returnedUrl=null;$('#returned-video').removeAttribute('src');$('#returned-video').load();
 $('#remove-video').hidden=true;$('#audio-mode option[value=robot]').disabled=false;
 imports.forEach(i=>URL.revokeObjectURL(i.url));imports=[];order=[];renderImports();
 cache?.clear();cache=null;invalidateVideo();$('#show-art').checked=true;renderAssigned();refreshStats();await renderPreview();
 status(`Drawings extracted and assembled. ${frames.length} drawings now follow your ${clip.duration.toFixed(1)}-second dialogue. Review the numbered drawings and play the animation, then continue to voiceover.`);
}
async function exportClip(reference,signal){
 if(!state.video){reference?requireClip():requireArt();}
 const duration=currentDuration();if(duration>120)throw Error('Split videos longer than two minutes');
 status('Checking MP4 support on this device…');await probeMP4((reference&&!state.video)||p().audioMode!=='silent');signal.throwIfAborted();
 const [w,h]=dimensions(p()),canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d');
 let renderer,draw,video;if(state.video){video=document.createElement('video');video.src=returnedUrl;video.muted=true;video.playsInline=true;await new Promise((resolve,reject)=>{video.onloadeddata=resolve;video.onerror=()=>reject(Error('Cannot read imported video'));video.load();});draw=async t=>{if(Math.abs(video.currentTime-t)>.001)await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Video seeking timed out')),5000);video.onseeked=()=>{clearTimeout(timer);resolve();};video.currentTime=Math.min(t,video.duration-.001);});ctx.fillStyle=p().scene.background;ctx.fillRect(0,0,w,h);const scale=Math.min(w/video.videoWidth,h/video.videoHeight);ctx.drawImage(video,(w-video.videoWidth*scale)/2,(h-video.videoHeight*scale)/2,video.videoWidth*scale,video.videoHeight*scale);};}
 else if(reference){renderer=new Stage(document.createElement('canvas'));await renderer.prepare(p().scene);draw=async t=>{renderer.draw(slotAt(clip,t).state,w,h);ctx.drawImage(renderer.canvas,0,0);};}
 else {const images=new ImageCache(state.art);draw=async t=>{const img=await images.get(slotAt(clip,t).id);ctx.fillStyle=p().scene.background;ctx.fillRect(0,0,w,h);ctx.drawImage(img,0,0,w,h);};}
 try{const audio=reference&&!state.video?mixSpeech(audioContext(),clip,state.takes):await selectedAudio(duration);status('Encoding MP4…');
  finalBlob=await exportMP4({canvas,duration,audio,draw,signal,onProgress:f=>{$('#progress').value=f;},onFallback:()=>status('Using real-time MP4 capture. Keep this page visible.')});
  signal.throwIfAborted();if(finalUrl)URL.revokeObjectURL(finalUrl);finalUrl=URL.createObjectURL(finalBlob);$('#final-video').src=finalUrl;$('#export-result').hidden=false;showTab('finish');status('MP4 ready. Play it back, then share it to Photos.');
 }finally{renderer?.dispose();canvas.width=1;canvas.height=1;if(video){video.removeAttribute('src');video.load();}}
}
async function setRecording(blob){
 clearExport();state.recording=blob;state.voiceStale=false;p().audioMode='recording';$('#audio-mode').value='recording';$('#voice-stale').hidden=true;
 if(voiceUrl)URL.revokeObjectURL(voiceUrl);voiceUrl=URL.createObjectURL(blob);$('#voice-review').src=voiceUrl;$('#voice-review').hidden=false;save();
}
function recordingUI(active){
 recordingActive=active;$$('button,input,select,textarea').forEach(e=>e.disabled=active);
 $('#stop-recording').disabled=false;$('#stop-recording').hidden=!active;$('#record').hidden=active;
 if(!active){$('#countdown').hidden=true;showTab(tab);}if(stage)stage.controls.enabled=!active&&tab==='stage';
}
async function stopRecording(){
 if(!mic)return;recordingToken++;const current=mic;mic=null;stopPlayback();
 try{const blob=await current.stop();if(blob.size){await setRecording(blob);status('Voiceover recorded. Preview it before exporting.');}else status('Recording cancelled before the countdown finished.');}
 finally{recordingUI(false);}
}

async function restore(loaded){
 validateProject(loaded.project);if(loaded.transfer!=null)validateTransfer(loaded.transfer);stopPlayback();clearTimeout(saveTimer);clearExport();clearDrawingVideo();
 imports.forEach(i=>URL.revokeObjectURL(i.url));imports=[];order=[];undo=[];redo=[];referenceFiles=[];
 $('#share-controls').hidden=true;$('#show-art').checked=false;renderImports();
 if(voiceUrl)URL.revokeObjectURL(voiceUrl);voiceUrl=null;$('#voice-review').removeAttribute('src');$('#voice-review').hidden=true;
 state={takes:{},art:{},refs:{},recording:null,video:null,thumbs:{},artThumbs:{},...loaded};cache=null;recompile();time=0;lastHistory=snapshot();clearGalleryURLs();populate();
 if(state.recording){const stale=state.voiceStale,mode=p().audioMode;await setRecording(state.recording);state.voiceStale=stale;p().audioMode=mode;$('#audio-mode').value=mode;$('#voice-stale').hidden=!stale;}
 if(returnedUrl)URL.revokeObjectURL(returnedUrl);returnedUrl=state.video?URL.createObjectURL(state.video):null;$('#returned-video').src=returnedUrl||'';$('#remove-video').hidden=!state.video;$('#audio-mode option[value=robot]').disabled=!!state.video;await renderPreview();
}

$$('[data-tab]').forEach(b=>b.onclick=()=>showTab(b.dataset.tab));$('#next').onclick=()=>showTab(tabs[Math.min(4,tabs.indexOf(tab)+1)]);$('#back').onclick=()=>showTab(tabs[Math.max(0,tabs.indexOf(tab)-1)]);
$('#quit-local').onclick=()=>run('Saving and closing the local app…',async()=>{await flushSave();await quitLocal();closing=true;status('Local app closed. You can close this tab.');});
$('#returned-video').onloadedmetadata=updateClock;
$('#quit-local').hidden=!(await localApp());
$('#cancel').onclick=()=>busy?.abort();
$('#title').onchange=e=>{p().title=e.target.value;remember();save();};
for(const [id,key]of [['format','format'],['style','style'],['background','background']])$('#'+id).onchange=e=>{p().scene[key]=e.target.value;changed();};
$('#projection').onchange=e=>{p().scene.camera.projection=e.target.value;changed();};
$('#cast-count').onchange=e=>{p().scene.count=Number(e.target.value);p().lines.forEach(l=>l.actor=Math.min(l.actor,p().scene.count-1));renderLines();populate();changed({speech:true});};
$('#camera-fields').onchange=e=>{if(e.target.dataset.key){p().scene.camera[e.target.dataset.key]=Number(e.target.value);e.target.previousElementSibling.textContent=e.target.value;changed();}};
$('#actor-fields').onchange=e=>{const el=e.target;if(el.dataset.actor!==undefined){p().scene.actors[Number(el.dataset.actor)][el.dataset.key]=el.tagName==='SELECT'?el.value:Number(el.value);if(el.previousElementSibling?.tagName==='OUTPUT')el.previousElementSibling.textContent=el.value;changed();}};
$$('[data-framing]').forEach(b=>b.onclick=()=>{const kind=b.dataset.framing;p().scene.camera={projection:'orthographic',azimuth:0,elevation:5,zoom:kind==='close'?1.75:kind==='wide'?.75:1,targetX:kind==='close'?p().scene.actors[0].x:0,targetY:kind==='close'?1.45:1};if(kind==='solo'){p().scene.count=1;p().scene.actors[0].x=0;p().lines.forEach(l=>l.actor=0);state.takes={};}populate();changed();});
$('#reset-camera').onclick=()=>{$('[data-framing="duet"]').click();};
$('#rate').onchange=e=>{p().rate=Number(e.target.value);$('#rate-label').textContent=p().rate.toFixed(2)+'×';changed({speech:true});};
$('#fps').onchange=e=>{p().fps=Number(e.target.value);changed();};
$('#lines').onchange=e=>{const el=e.target,index=Number(el.closest('[data-line]')?.dataset.line),key=el.dataset.lineKey;if(!key)return;p().lines[index][key]=el.type==='checkbox'?el.checked:['actor','rate','pause','headYaw'].includes(key)?Number(el.value):el.value;changed({speech:['text','rate','actor'].includes(key)});};
$('#lines').onclick=e=>{const b=e.target.closest('[data-remove-line]');if(b){p().lines.splice(Number(b.dataset.removeLine),1);renderLines();changed({speech:true});}};
$('#add-line').onclick=()=>{if(p().lines.length>=30)return status('Use at most 30 lines in one clip',true);p().lines.push({id:uid(),actor:p().scene.count===2?p().lines.length%2:0,text:'',rate:1,pause:.35,pose:'keep',headYaw:0,blink:false});renderLines();changed({speech:true});};
$('#generate').onclick=()=>run('Generating robot dialogue…',async signal=>{validateProject(p());state.takes=await generateSpeech(p(),{signal,onProgress:n=>status(`Generating line ${n} of ${p().lines.filter(l=>l.text.trim()).length}…`)});clip=compileClip(p(),state.takes,p().slots);p().slots=clip.slots;lastHistory=snapshot();time=0;refreshStats();await renderPreview();status('Animation ready. Play it, rehearse, and adjust the timing.');});
$('#play').onclick=()=>{if(playing)stopPlayback();else play().catch(e=>status(e.message,true));};
$('#scrub').oninput=e=>{stopPlayback();time=Number(e.target.value);if(state.video)$('#returned-video').currentTime=time;renderPreview().catch(e=>status(e.message,true));updateClock();};
$('#prev-frame').onclick=()=>{stopPlayback();time=Math.max(0,time-1/p().fps);renderPreview().catch(e=>status(e.message,true));};$('#next-frame').onclick=()=>{stopPlayback();time=Math.min(currentDuration(),time+1/p().fps);renderPreview().catch(e=>status(e.message,true));};
$('#show-art').onchange=()=>{cache=null;renderPreview().catch(e=>status(e.message,true));};
$('#apply-mouth').onclick=()=>{try{requireClip();p().overrides.push({actor:Number($('#override-actor').value),mouth:$('#override-mouth').value,start:time,end:time+Number($('#override-frames').value)/p().fps});changed();}catch(e){status(e.message,true);}};
$('#clear-mouths').onclick=()=>{p().overrides=[];changed();};
$('#prepare').onclick=()=>run('Preparing your unique drawings…',prepareDrawings);
$('#drawing-video').onclick=()=>run('Preparing your drawing-reference video…',prepareDrawingVideo);
$('#download-drawing-video').onclick=()=>{if(drawingVideoBlob)download(drawingVideoBlob,filename(`-draw-${state.transfer.id.slice(0,8)}-6fps.mp4`));};
$('#share-drawing-video').onclick=()=>{
 if(!drawingVideoBlob)return;
 const file=new File([drawingVideoBlob],filename(`-draw-${state.transfer.id.slice(0,8)}-6fps.mp4`),{type:'video/mp4'});
 if(!navigator.canShare?.({files:[file]}))return status('Use Download drawing MP4 to save to Files. In Procreate, choose Import from the Gallery.');
 shareFiles([file]).then(()=>status('Drawing video handed to the share sheet. Choose Save Video to keep it in Photos.')).catch(e=>status(e.name==='AbortError'?'Sharing cancelled. The drawing video is still ready.':e.message,e.name!=='AbortError'));
};
$('#import-drawing-video').onchange=e=>{const file=e.target.files[0];e.target.value='';if(file)run('Extracting your drawn frames…',signal=>importDrawingVideo(file,signal));};
$('#share-all').onclick=()=>shareFiles(referenceFiles).then(()=>status('Images handed to the iPad share sheet. Check Photos before leaving.')).catch(e=>status(e.name==='AbortError'?'Sharing cancelled.':e.message,e.name!=='AbortError'));
$('#share-small').onclick=()=>{const i=Number($('#share-batch').value);shareFiles(referenceFiles.slice(i*6,i*6+6)).catch(e=>status(e.message,true));};
$('#reference-gallery').onclick=e=>{const id=e.target.closest('[data-share-ref]')?.dataset.shareRef;if(id){const i=slots().findIndex(s=>s.id===id),file=new File([state.refs[id]],`${i+1}-${id}.png`,{type:'image/png'});if(navigator.canShare?.({files:[file]}))shareFiles([file]).catch(e=>status(e.message,true));else download(file,file.name);}};
$('#zip').onclick=()=>run('Preparing image ZIP…',async()=>{requireClip();if(slots().some(s=>!state.refs[s.id]))throw Error('Prepare drawings first');const files=slots().map((s,i)=>new File([state.refs[s.id]],`${String(i+1).padStart(2,'0')}-${s.id}.png`,{type:'image/png'}));files.push(new File([JSON.stringify({fps:clip.fps,exposures:clip.exposures,drawings:slots().map(s=>({id:s.id,mouths:s.state.mouths}))},null,2)],'timing.json'));download(await imageZip(files),filename('-drawings.zip'));status('Drawing ZIP downloaded.');});
$('#psd').onclick=()=>run('Building the layered drawing library…',async()=>{requireClip();if(slots().some(s=>!state.refs[s.id]))throw Error('Prepare drawings first');if(slots().length>23)throw Error('For more than 23 drawings, use the image export to keep memory manageable');download(await layeredPSD(slots(),state.refs,...dimensions(p())),filename('-references.psd'));status('PSD downloaded. Trace each unique drawing; timing is rebuilt here.');});
$('#contact-sheet').onclick=()=>run('Preparing contact sheet…',async()=>{requireClip();if(slots().some(s=>!state.refs[s.id]))throw Error('Prepare drawings first');const c=document.createElement('canvas');c.width=1200;c.height=Math.ceil(slots().length/4)*350;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);for(const [i,s]of slots().entries()){const img=await decodeImage(state.refs[s.id]),x=i%4*300,y=Math.floor(i/4)*350;ctx.drawImage(img,x+65,y,170,302);ctx.fillStyle='black';ctx.font='bold 22px Arial';ctx.fillText(String(i+1),x+140,y+332);}const b=await new Promise(r=>c.toBlob(r));download(b,filename('-contact-sheet.png'));status('Contact sheet downloaded.');});
$('#reference-video').onclick=()=>run('Preparing tracing video…',s=>exportClip(true,s));
$('#import-images').onchange=e=>run('Loading your drawings…',async signal=>{
 requireClip();const files=[...e.target.files];if(files.length>100)throw Error('Import at most 100 drawings at once');
 imports.forEach(i=>URL.revokeObjectURL(i.url));imports=[];order=[];
 for(const f of files){signal.throwIfAborted();const thumb=await thumbnail(f);imports.push({id:uid(),name:f.name,blob:f,url:URL.createObjectURL(thumb)});}renderImports();status('Tap your drawings in reference order. The yellow badges determine the sequence.');e.target.value='';
});
$('#import-gallery').onclick=e=>{const id=e.target.closest('[data-choose]')?.dataset.choose;if(!id)return;if(!order.includes(id)&&order.length>=slots().length)return status('All references are numbered. Unselect a drawing to replace it.');order=toggleSelection(order,id);renderImports();};
$('#selection-undo').onclick=()=>{order=order.slice(0,-1);renderImports();};$('#selection-clear').onclick=()=>{order=[];renderImports();};
$('#use-drawings').onclick=()=>run('Assigning your numbered drawings…',async signal=>{
 if(order.length!==slots().length)throw Error(`Number exactly ${slots().length} drawings before applying.`);
 const next={...state.art},[w,h]=dimensions(p());for(const [i,id]of order.entries()){signal.throwIfAborted();next[slots()[i].id]=await normalizeImage(imports.find(x=>x.id===id).blob,w,h,$('#image-fit').value);$('#progress').value=(i+1)/order.length;}
 state.art=next;for(const s of slots())state.artThumbs[s.id]=await thumbnail(next[s.id]);state.video=null;$('#remove-video').hidden=true;$('#audio-mode option[value=robot]').disabled=false;cache=null;invalidateVideo();$('#show-art').checked=true;renderAssigned();refreshStats();await renderPreview();status('Your drawings are assembled. Play the animation or continue to voiceover.');
});
$('#import-video').onchange=e=>run('Checking your finished video…',async()=>{const f=e.target.files[0];if(!f)return;if(f.size>150*1024*1024)throw Error('Use a video smaller than 150 MB');const info=await validateVideo(f);if(!Number.isFinite(info.duration)||info.duration>120)throw Error('Use a video of two minutes or less');invalidateVideo();time=0;state.video=f;$('#audio-mode option[value=robot]').disabled=true;if(returnedUrl)URL.revokeObjectURL(returnedUrl);returnedUrl=URL.createObjectURL(f);$('#returned-video').src=returnedUrl;$('#remove-video').hidden=false;p().audioMode='silent';$('#audio-mode').value='silent';await renderPreview();status('Finished video imported. Its timing stays intact; choose Silent or record a new voiceover.');});
$('#remove-video').onclick=()=>{stopPlayback();invalidateVideo();time=0;state.video=null;$('#audio-mode option[value=robot]').disabled=false;$('#remove-video').hidden=true;save();renderPreview().catch(e=>status(e.message,true));};
for(const [id,key]of [['audio-mode','audioMode'],['audio-offset','audioOffset'],['trim-start','audioTrimStart'],['trim-end','audioTrimEnd']])$('#'+id).onchange=e=>{p()[key]=id==='audio-mode'?e.target.value:Number(e.target.value);invalidateVideo();save();};
$('#record').onclick=async()=>{
 const attempt=++recordingToken;
 try{if(!state.video)requireArt();recordingUI(true);$('#stop-recording').disabled=true;mic=await microphone();$('#stop-recording').disabled=false;$('#countdown').hidden=false;
  for(let n=3;n>0;n--){if(!recordingActive||attempt!==recordingToken)return;$('#countdown').textContent=n;await new Promise(r=>setTimeout(r,1000));}
  if(!recordingActive||attempt!==recordingToken)return;$('#countdown').hidden=true;mic.start();await play({silent:true,fromStart:true,onEnd:()=>stopRecording().catch(e=>status(e.message,true))});
 }catch(e){if(attempt!==recordingToken)return;mic?.cancel();mic=null;recordingUI(false);status(e.message,true);}
};
$('#stop-recording').onclick=()=>stopRecording().catch(e=>status(e.message,true));
$('#export').onclick=()=>run('Preparing finished animation…',s=>exportClip(false,s));
$('#share-video').onclick=()=>{if(finalBlob)shareFiles([new File([finalBlob],filename('.mp4'),{type:'video/mp4'})]).catch(e=>status(e.message,true));};$('#download-video').onclick=()=>{if(finalBlob)download(finalBlob,filename('.mp4'));};
$('#save-project').onclick=()=>run('Preparing project backup…',async()=>{download(await packProject(state),filename('-project.zip'));status('Backup downloaded. It contains your scene, drawings, and sound.');});
$('#open-project').onchange=e=>run('Opening project…',async()=>{const f=e.target.files[0];if(f){await flushSave();await restore(await unpackProject(f));status('Project restored.');}e.target.value='';});
$('#new').onclick=()=>run('Starting a new clip…',async()=>{await flushSave();await restore({project:newProject()});imports=[];order=[];renderImports();undo=[];redo=[];showTab('stage');status('New clip. Your previous clip is in Saved clips on this device.');});
$('#duplicate').onclick=()=>run('Duplicating this scene…',async()=>{await flushSave();const project=structuredClone(p());project.id=uid();project.title+=' — next shot';await restore({...state,project});showTab('stage');status('Scene duplicated. Your previous clip is saved; change this framing for your next shot.');});
function travelHistory(from,to){if(!from.length)return;clearDrawingVideo();to.push(snapshot());state.project=JSON.parse(from.pop());lastHistory=snapshot();state.takes={};clip=null;referenceFiles=[];$('#share-controls').hidden=true;invalidateVideo();populate();save();renderPreview().catch(e=>status(e.message,true));status('Edit restored. Generate dialogue again to refresh timing.');}
$('#undo').onclick=()=>travelHistory(undo,redo);$('#redo').onclick=()=>travelHistory(redo,undo);
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(recordingActive)stopRecording().catch(e=>status(e.message,true));stopPlayback();flushSave().catch(()=>{});}});
window.addEventListener('pagehide',()=>{stopPlayback();flushSave().catch(()=>{});});

populate();lastHistory=snapshot();
try{
 stage=new Stage($('#stage-canvas'),camera=>{for(const[k,v]of Object.entries(camera)){const bounds={azimuth:[-180,180],elevation:[-45,75],zoom:[.4,3],targetX:[-3,3],targetY:[0,3]}[k];p().scene.camera[k]=Math.max(bounds[0],Math.min(bounds[1],Math.round(v*100)/100));}populate();changed();});
 const stored=await loadState();if(stored){await restore(stored);$('#saved').textContent='Saved on this device';status('Project restored. Continue where you left off.');}else{await renderPreview();status('Set a scene, then write your dialogue.');save();}
}catch(e){status(e.message,true);$('#saved').textContent='Use Save backup to protect your work';if(stage)renderPreview().catch(e=>status(e.message,true));}
