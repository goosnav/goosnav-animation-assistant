import { newProject, withFraming, BACKDROPS, validateProject, withSpeechRate, upgradeTiming, compileClip, slotAt, dimensions, toggleSelection, MODELS, MODEL_LABELS, MOUTHS, POSES, CHAIRS, uid } from './core.mjs';
import {EMOTIONS} from './emotions.mjs';
import {parseConfig,exportConfig} from './config.mjs';
import exampleConfig from '../../examples/speech-scene.json';
import { AnimationEditor, propLabel } from './animation-ui.mjs';
import { ACTOR_CHANNELS, PROP_CHANNELS, animationSettings } from './motion.mjs';
import { Stage } from './stage.mjs';
import { generateSpeech, mixSpeech } from './speech/client.mjs';
import { saveState, loadState, listSaved, loadSaved, localApp, quitLocal } from './storage.mjs';
import { packProject, unpackProject } from './archive.mjs';
import { download, shareFiles, imageZip, normalizeImage, ImageCache, layeredPSD, decodeImage, thumbnail } from './images.mjs';
import { exportMP4, probeMP4, microphone, fitVoice } from './video.mjs';
import { makeTransfer, validateTransfer, transferSlots, assignTransferFrames } from './drawing-transfer.mjs';
import { exportFrameVideo, extractDrawingFrames } from './frame-video.mjs';
import { REFERENCE_VERSION, referenceGuideKey, drawPerspectiveGuides, annotatedReference } from './reference.mjs';

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const tabs=['stage','rehearse','animate','draw','finish'];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const option=(v,label,selected)=>`<option value="${esc(v)}" ${selected===v?'selected':''}>${esc(label)}</option>`;
const pretty=s=>s.replaceAll('-',' ').replace(/^./,c=>c.toUpperCase());
let state={project:newProject(),takes:{},art:{},refs:{},recording:null,video:null,thumbs:{},artThumbs:{}},clip=null,stage,tab='stage',time=0;
let closing=false,busy=null,playing=false,playToken=0,source=null,context,cache,renderTicket=0,saveTimer,saveChain=Promise.resolve(),mic=null,recordingActive=false,recordingToken=0;
let imports=[],order=[],undo=[],redo=[],lastHistory,urls=[],voiceUrl,finalUrl,finalBlob,referenceFiles=[];
let drawingVideoBlob,animationEditor;
const p=()=>state.project;
function status(message,error=false){$('#status').textContent=message;$('#status').classList.toggle('error',error);}
function audioContext(){return context??=new AudioContext();}
function currentDuration(){return clip?.duration||0;}
function slots(){return clip?.slots.filter(s=>s.active)||[];}
function filename(suffix){return (p().title.replace(/[^a-z0-9_-]+/gi,'-').slice(0,60)||'animation')+suffix;}
function snapshot(){return JSON.stringify(p());}
function remember(){if(lastHistory){undo.push(lastHistory);if(undo.length>30)undo.shift();}redo=[];lastHistory=snapshot();}
function save(){if(closing)return;clearTimeout(saveTimer);$('#saved').textContent='Saving…';saveTimer=setTimeout(()=>flushSave().catch(()=>{}),250);}
function flushSave(){
 if(closing)return Promise.resolve();clearTimeout(saveTimer);const copy=structuredClone(state);
 saveChain=saveChain.catch(()=>{}).then(()=>saveState(copy)).then(()=>$('#saved').textContent='Saved').catch(e=>{$('#saved').textContent='Not saved — download a backup';status(`Autosave unavailable: ${e.message}`,true);throw e;});return saveChain;
}
function clearExport(){finalBlob=null;if(finalUrl)URL.revokeObjectURL(finalUrl);finalUrl=null;$('#final-video').removeAttribute('src');$('#final-video').load();$('#export-result').hidden=true;}
function clearDrawingVideo(){drawingVideoBlob=null;$('#drawing-video-result').hidden=true;}
function refreshTransfer(){
 const transfer=state.transfer;let note='';
 if(transfer&&clip){try{transferSlots(transfer,p(),clip);const missing=slots().filter(s=>!transfer.slots.some(t=>t.id===s.id)&&!state.art[s.id]).length;if(missing)note=`${missing} new mouth drawings needed. Create references.`;}catch{note='Scene changed. Create new references.';}}
 $('#transfer-summary').textContent=note;$('#transfer-summary').hidden=!note;
}
function refreshActions(){
 if(busy||recordingActive)return;
 const ready=!!clip&&slots().every(s=>state.art[s.id]);
 $('#play').disabled=!clip;$('#drawing-video').disabled=!clip;$('#import-artwork').disabled=!clip;$('#export').disabled=!ready;
 $('#audio-mode option[value=recording]').disabled=!state.recording;
 $('#drawing-video').classList.toggle('primary',!drawingVideoBlob);
 $('.speed-control').hidden=animationSettings(p()).mode==='silent';
}
const mouthNames={rest:'Closed',small:'E',open:'A',wide:'EE',round:'O / U',teeth:'F / V'};
function mouthCaption(s){return s.state.mouths.slice(0,p().scene.count).map((m,i)=>`<span>${p().scene.count===2?(i?'B: ':'A: '):''}${mouthNames[m]}</span>`).join('');}
function invalidateVideo(){clearExport();if(state.recording){state.voiceStale=true;$('#voice-stale').hidden=false;}}
function recompile(){
 try{clip=compileClip(p(),state.takes,p().slots);p().slots=clip.slots;if(animationSettings(p()).mode==='silent')p().animation.duration=clip.duration;}catch(e){clip=null;if(animationSettings(p()).mode==='silent'||Object.keys(state.takes).length)status(e.message,true);}
}
function changed({speech=false}={}){
 stopPlayback();invalidateVideo();clearDrawingVideo();
 if(speech){state.takes={};p().overrides=[];}recompile();remember();
 referenceFiles=[];time=Math.min(time,currentDuration());refreshStats();renderAssigned();animationEditor?.refresh();save();renderPreview().catch(e=>status(e.message,true));
}
function activeState(){return clip?slotAt(clip,time)?.state:{scene:p().scene,mouths:['rest','rest'],blinks:[false,false]};}
async function renderPreview(){
 const ticket=++renderTicket;
 const useArt=$('#show-art').checked&&clip&&tab!=='animate',slot=clip&&slotAt(clip,time);
 const [w,h]=dimensions(p()),width=p().scene.format==='portrait'?432:768,height=Math.round(width*h/w);
 $('#preview-frame').className=p().scene.format;
 if(useArt&&state.art[slot?.id]){
  cache??=new ImageCache(state.art);const img=await cache.get(slot.id);if(ticket!==renderTicket)return;
  const c=$('#art-canvas');if(c.width!==width||c.height!==height){c.width=width;c.height=height;}const ctx=c.getContext('2d');ctx.fillStyle=p().scene.background;ctx.fillRect(0,0,width,height);ctx.drawImage(img,0,0,width,height);
  c.hidden=false;$('#guide-canvas').hidden=true;$('#stage-canvas').hidden=true;$('#preview-badge').textContent='YOUR DRAWING';
 }else{
  $('#art-canvas').hidden=true;$('#stage-canvas').hidden=false;$('#preview-badge').textContent=useArt?'MISSING DRAWING':'3D GUIDE';
  if(stage){await stage.prepare(p().scene);if(ticket!==renderTicket)return;stage.draw(tab==='animate'?animationEditor.draftState(activeState()):activeState(),width,height,{guides:p().guides});stage.controls.enabled=tab==='stage'&&!busy&&!playing;const guide=$('#guide-canvas');guide.hidden=false;guide.width=width;guide.height=height;drawPerspectiveGuides(guide.getContext('2d'),activeState(),width,height,p().guides);}
 }
 updateClock();
}
function updateClock(){const selected=clip&&slotAt(clip,time)?.id;$$('[data-preview-slot]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.previewSlot===selected));const d=currentDuration()||0;$('#scrub').max=d;$('#scrub').step=1/p().fps;$('#scrub').value=time;$('#time').textContent=`${time.toFixed(2)} / ${d.toFixed(2)} s`;animationEditor?.clock();}
function refreshStats(){
 refreshTransfer();
 const n=slots().length,done=slots().filter(s=>state.art[s.id]).length;
 $('#drawing-count').textContent=clip?n:'—';$('#duration').textContent=clip?clip.duration.toFixed(1):'—';$('#art-count').textContent=done;
 $('#reference-plan').textContent=clip?`${n} drawing${n===1?'':'s'} to trace · ${clip.totalFrames} playback frames. Repeated poses reuse your drawings.`:'Choose an action in Animation or generate speech to prepare your drawings.';
 $('#budget').hidden=n<=23;$('#budget').textContent=`${n} drawings`;
 refreshActions();$('#voice-stale').hidden=!state.voiceStale;updateClock();
}
function showTab(next){if(tab==='animate'&&next!==tab&&animationEditor&&!animationEditor.finishEdits())return;tab=next;if(stage)renderPreview().catch(e=>status(e.message,true));$$('[data-view]').forEach(e=>e.hidden=e.dataset.view!==tab);$('#saved-clips').ontoggle=async()=>{if(!$('#saved-clips').open)return;try{const saved=await listSaved();$('#saved-list').innerHTML=saved.length?saved.map(s=>`<button data-open-saved="${esc(s.id)}">${esc(s.title)}</button>`).join(''):'No saved clips yet.';}catch(e){status(e.message,true);}};
$('#saved-list').onclick=e=>{const id=e.target.closest('[data-open-saved]')?.dataset.openSaved;if(id&&(!animationEditor||animationEditor.finishEdits()))run('Opening saved clip…',async()=>{await flushSave();await restore(await loadSaved(id));$('#saved-clips').open=false;if(!state.video)status('Project restored.');});};
$$('[data-tab]').forEach(e=>{if(e.dataset.tab===tab)e.setAttribute('aria-current','step');else e.removeAttribute('aria-current');});$('#footer-label').textContent={stage:'Scene',rehearse:'Speech',animate:'Animation',draw:'Drawings',finish:'Export'}[tab];$('#back').disabled=tabs.indexOf(tab)===0;$('#next').hidden=tab==='finish';if(stage)stage.controls.enabled=tab==='stage'&&!busy;refreshActions();}
function slider(label,key,value,min,max,step=1,attrs=''){
 return `<label>${esc(label)} <output>${Number(value).toFixed(step<1?2:0)}</output><input type="range" data-key="${key}" ${attrs} min="${min}" max="${max}" step="${step}" value="${value}"></label>`;
}
function renderProps(){
 const props=p().scene.props||[],selected=$('#prop-select').value;
 $('#prop-editor').hidden=!props.length;
 $('#prop-select').innerHTML=props.map((prop,i)=>option(prop.id,propLabel(prop,i),selected)).join('');
 const prop=props.find(v=>v.id===$('#prop-select').value)||props[0];if(!prop)return;
 $('#prop-attachment').innerHTML=option('world','World',prop.attachment)+p().scene.actors.flatMap((_,i)=>['left','right'].map(side=>option(`actor:${i}:${side}`,`${i?'B':'A'} · ${side} hand${i>=p().scene.count?' (hidden)':''}`,prop.attachment))).join('');
 $('#prop-color').value=prop.color;$('#prop-color').closest('label').hidden=prop.kind==='book';
 if($('#prop-fields').dataset.prop===prop.id){for(const input of $$('[data-prop-key]'))if(document.activeElement!==input)input.value=prop[input.dataset.propKey]??PROP_CHANNELS[input.dataset.propKey].default;}else{$('#prop-fields').dataset.prop=prop.id;$('#prop-fields').innerHTML=[['Position',['x','y','z']],['Rotation',['rx','ry','rz']],['Dimensions',['width','height','depth']],...(prop.kind==='book'?[['Book',['open','page']]]:[])].map(([label,keys])=>`<details ${label==='Rotation'?'':'open'}><summary>${label}</summary><div class="sliders">${keys.map(key=>{const c=PROP_CHANNELS[key];return `<label>${esc(c.label)}<input data-prop-key="${key}" type="number" min="${c.min}" max="${c.max}" step="${c.step}" value="${prop[key]??c.default}"></label>`;}).join('')}</div></details>`).join('');}
}
function updateProp(key,value){
 const project=structuredClone(p()),prop=project.scene.props?.find(v=>v.id===$('#prop-select').value);if(!prop)return;
 prop[key]=value;try{validateProject(project);state.project=project;animationEditor?.resetDraft();changed();renderProps();}catch(e){status(e.message,true);renderProps();}
}
function populate(){
 $('#title').value=p().title;$('#format').value=p().scene.format;$('#style').value=p().scene.style;$('#background').value=p().scene.background;$('#cast-count').value=p().scene.count;$('#projection').value=p().scene.camera.projection;$('#rate').value=p().rate;$('#rate-label').textContent=p().rate.toFixed(2)+'×';
 $('#backdrop').innerHTML=Object.entries(BACKDROPS).map(([id,b])=>option(id,b.label,p().scene.backdrop||'none')).join('');
 for(const key of ['ground','backdrop'])$('#'+key+'-grid').checked=!!p().guides?.[key];
 $('#camera-fields').innerHTML=[['Orbit','azimuth',-180,180],['Elevation','elevation',-45,75],['Zoom','zoom',.4,3,.05],['Pan sideways','targetX',-3,3,.05],['Pan up/down','targetY',0,3,.05]].map(([l,k,min,max,step])=>slider(l,k,p().scene.camera[k],min,max,step||1,'data-camera')).join('');
 $('#actor-fields').innerHTML=p().scene.actors.slice(0,p().scene.count).map((a,i)=>`<div class="actor"><h3>Character ${i?'B':'A'}</h3><div class="field-pair"><label>Character<select data-actor="${i}" data-key="model">${MODELS.map(m=>option(m,MODEL_LABELS[m]||pretty(m),a.model)).join('')}</select></label><label>Held pose<select data-actor="${i}" data-key="pose">${POSES.map(m=>option(m,pretty(m),a.pose)).join('')}</select></label></div><div class="field-pair"><label>Chair when sitting<select data-actor="${i}" data-key="chair">${Object.entries(CHAIRS).map(([id,label])=>option(id,label,a.chair||'folding')).join('')}</select></label><label>Expression<select data-actor="${i}" data-key="emotion">${Object.entries(EMOTIONS).map(([id,e])=>option(id,e.label,a.emotion||'neutral')).join('')}</select></label></div><div class="sliders">${[['Position','x',-3,3,.05],['Depth','z',-2,2,.05],['Turn','yaw',-180,180,1],['Size','scale',.5,1.5,.05]].map(([l,k,min,max,step])=>slider(l,k,a[k],min,max,step,`data-actor="${i}"`)).join('')}</div><details><summary>Head, arms, and hands</summary><div class="sliders">${['headYaw','headPitch','headTilt','bodyLean','bodyTurn','armL','armSideL','elbowL','handL','armR','armSideR','elbowR','handR'].map(k=>slider(ACTOR_CHANNELS[k].label,k,a[k]??ACTOR_CHANNELS[k].default,ACTOR_CHANNELS[k].min,ACTOR_CHANNELS[k].max,1,`data-actor="${i}"`)).join('')}</div></details></div>`).join('');
 renderLines();$('#override-mouth').innerHTML=MOUTHS.map(m=>option(m,mouthNames[m],'rest')).join('');
 $('#audio-mode').value=p().audioMode;$('#audio-offset').value=p().audioOffset;$('#trim-start').value=p().audioTrimStart;$('#trim-end').value=p().audioTrimEnd;
 refreshStats();renderReferences();renderAssigned();renderProps();animationEditor?.refresh();
}
function renderLines(){
 $('#lines').innerHTML=p().lines.map((l,i)=>`<div class="line" data-line="${i}"><div class="line-heading"><h3>Line ${i+1}</h3><button data-remove-line="${i}" aria-label="Remove line ${i+1}">Remove</button></div><label>Speaker<select data-line-key="actor">${[0,1].slice(0,p().scene.count).map(n=>option(String(n),`Character ${n?'B':'A'}`,String(l.actor))).join('')}</select></label><label class="sr-only" for="line-${i}">Dialogue ${i+1}</label><textarea id="line-${i}" data-line-key="text" maxlength="1000" placeholder="What do they say?">${esc(l.text)}</textarea><div class="field-pair"><label>Speed<input data-line-key="rate" type="number" min=".5" max="2" step=".05" value="${l.rate}"></label><label>Pause afterward (s)<input data-line-key="pause" type="number" min="0" max="10" step=".1" value="${l.pause}"></label></div><details><summary>Optional acting change</summary><label>Expression<select data-line-key="emotion">${option('','Use character expression',l.emotion||'')}${Object.entries(EMOTIONS).map(([id,e])=>option(id,e.label,l.emotion)).join('')}</select></label><label>Held pose while speaking<select data-line-key="pose">${['keep',...POSES].map(m=>option(m,m==='keep'?'Keep scene pose':pretty(m),l.pose)).join('')}</select></label><label>Extra head turn<input data-line-key="headYaw" type="range" min="-75" max="75" step="5" value="${l.headYaw||0}"></label><label class="check"><input data-line-key="blink" type="checkbox" ${l.blink?'checked':''}> Blink in the pause</label><label class="check"><input data-line-key="smear" type="checkbox" ${l.smear?'checked':''}> Smear pose change</label></details></div>`).join('');
}
function clearGalleryURLs(){urls.forEach(URL.revokeObjectURL);urls=[];}
function blobURL(blob){const u=URL.createObjectURL(blob);urls.push(u);return u;}
function releaseGallery(selector){$$(selector+' img').forEach(img=>{if(img.src.startsWith('blob:')){URL.revokeObjectURL(img.src);urls=urls.filter(u=>u!==img.src);}});}
function renderReferences(){
 releaseGallery('#reference-gallery');$('#reference-gallery').replaceChildren();
 $('#reference-gallery').hidden=slots().length>0&&slots().every(s=>state.art[s.id]);
 slots().forEach((s,i)=>{if(!state.refs[s.id])return;const box=document.createElement('button');box.className='drawing';box.dataset.previewSlot=s.id;box.setAttribute('aria-label',`Preview drawing ${i+1}`);box.innerHTML=`<img src="${blobURL(state.thumbs[s.id]||state.refs[s.id])}" alt="Reference ${i+1}"><span class="number">${i+1}</span><span class="caption">${mouthCaption(s)}</span>`;$('#reference-gallery').append(box);});
}
function renderAssigned(){
 releaseGallery('#assigned-gallery');$('#assigned-gallery').replaceChildren();slots().filter(s=>state.art[s.id]).forEach(s=>{const i=slots().indexOf(s),box=document.createElement('button');box.className='drawing';box.dataset.previewSlot=s.id;box.setAttribute('aria-label',`Preview drawing ${i+1}`);box.innerHTML=`<img src="${blobURL(state.artThumbs[s.id]||state.art[s.id])}" alt="Drawing ${i+1}"><span class="number">${i+1}</span><span class="caption">${mouthCaption(s)}</span>`;$('#assigned-gallery').append(box);});
 renderReferences();
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
 catch(e){status(e.name==='AbortError'?'Cancelled.':e.message,e.name!=='AbortError');}
 finally{busy=null;$$('button,input,select,textarea').forEach(e=>e.disabled=false);$('#busy-panel').hidden=true;showTab(tab);if(!closing)save();}
}
function requireClip(){if(!clip)throw Error('Generate speech or choose a silent duration in Animation.');}
function requireArt(){requireClip();if(slots().some(s=>!state.art[s.id]))throw Error('Import your drawn video or assign all drawings before exporting the finished clip.');}
async function selectedAudio(duration){
 const c=audioContext();if(p().audioMode==='silent'||p().audioMode==='robot'&&animationSettings(p()).mode==='silent')return null;
 if(p().audioMode==='recording'){if(!state.recording)throw Error('Record a voiceover first, or choose Robot voice / Silent.');return fitVoice(c,await c.decodeAudioData(await state.recording.arrayBuffer()),duration,p());}
 requireClip();return mixSpeech(c,clip,state.takes);
}
function stopPlayback(){playing=false;playToken++;if(source){try{source.stop();}catch{}source=null;}$('#play').textContent='Play';$('#play').setAttribute('aria-label','Play animation');}
async function play({silent=false,fromStart=false,onEnd}={}){
 stopPlayback();requireClip();const duration=currentDuration();if(!Number.isFinite(duration)||!duration)throw Error('No playable animation yet');
 if(fromStart||time>=duration-.05)time=0;
 const c=audioContext();await c.resume();const token=++playToken;
 let audio;if(!silent)audio=await selectedAudio(duration);if(token!==playToken)return;
 if(audio){source=c.createBufferSource();source.buffer=audio;source.connect(c.destination);source.start(0,time);}
 playing=true;$('#play').textContent='Pause';$('#play').setAttribute('aria-label','Pause animation');const started=c.currentTime-time;
 while(playing&&token===playToken){time=Math.min(duration,c.currentTime-started);if(time>=duration){stopPlayback();time=0;await renderPreview();onEnd?.();break;}await renderPreview();updateClock();await new Promise(r=>setTimeout(r,1000/p().fps));}
}
async function prepareDrawings(signal){
 requireClip();const [w,h]=dimensions(p()),canvas=document.createElement('canvas'),renderer=new Stage(canvas);
 const guideKey=referenceGuideKey(p()),reuse=state.refsVersion===REFERENCE_VERSION&&state.refsGuides===guideKey;
 const fresh=reuse?{...state.refs}:{},thumbs=reuse?{...state.thumbs}:{};
 try{await renderer.prepare(p().scene);for(const [i,s]of slots().entries()){signal.throwIfAborted();if(!fresh[s.id]){renderer.draw(s.state,w,h,{guides:p().guides});fresh[s.id]=await annotatedReference(await renderer.png(),s.state,w,h,p().guides);thumbs[s.id]=await thumbnail(fresh[s.id]);}$('#progress').value=(i+1)/slots().length;await new Promise(r=>setTimeout(r,0));}}finally{renderer.dispose();canvas.width=1;canvas.height=1;}
 signal.throwIfAborted();state.refs=fresh;state.thumbs=thumbs;state.refsVersion=REFERENCE_VERSION;state.refsGuides=guideKey;referenceFiles=slots().map((s,i)=>new File([fresh[s.id]],`${String(i+1).padStart(2,'0')}-${s.id}.png`,{type:'image/png'}));
 renderReferences();

}
async function prepareDrawingVideo(signal){
 requireClip();const transfer=makeTransfer(p(),clip);
 await prepareDrawings(signal);signal.throwIfAborted();
 const canvas=document.createElement('canvas');canvas.width=transfer.width;canvas.height=transfer.height;
 const ctx=canvas.getContext('2d'),images=new ImageCache(state.refs);
 try{
  status(`Encoding ${transfer.slots.length} drawings…`);
  const blob=await exportFrameVideo({canvas,frameCount:transfer.slots.length,signal,onProgress:f=>{$('#progress').value=f;},drawFrame:async i=>{ctx.drawImage(await images.get(transfer.slots[i].id),0,0,canvas.width,canvas.height);}});
  signal.throwIfAborted();
  // Save the mapping before exposing the download. Otherwise leaving for Procreate could lose it.
  const previous=state.transfer;state.transfer=transfer;
  try{await flushSave();}catch(e){state.transfer=previous;throw e;}
  clearDrawingVideo();drawingVideoBlob=blob;$('#drawing-video-result').hidden=false;
  $('#drawing-video-info').textContent=`${transfer.slots.length} frames · 24 fps`;
  refreshTransfer();status('References ready.');
 }finally{images.clear();canvas.width=1;canvas.height=1;}
}
async function importDrawingVideo(file,signal){
 requireClip();const transfer=state.transfer;transferSlots(transfer,p(),clip);
 let resized=false;
 const frames=await extractDrawingFrames(file,{width:transfer.width,height:transfer.height,expectedCount:transfer.slots.length,background:p().scene.background,signal,onAdjustment:()=>{resized=true;},onProgress:f=>{$('#progress').value=f;}});
 const next=assignTransferFrames(transfer,p(),clip,frames,state.art),thumbs={...state.artThumbs};
 for(const [i,s]of transfer.slots.entries()){signal.throwIfAborted();thumbs[s.id]=await thumbnail(frames[i]);}
 signal.throwIfAborted();
 state.art=next;state.artThumbs=thumbs;state.video=null;time=0;
 p().audioMode=animationSettings(p()).mode==='silent'?'silent':'robot';$('#audio-mode').value=p().audioMode;
 imports.forEach(i=>URL.revokeObjectURL(i.url));imports=[];order=[];renderImports();
 cache?.clear();cache=null;invalidateVideo();$('#show-art').checked=true;renderAssigned();refreshStats();await renderPreview();
 await flushSave();status(`${frames.length} drawings imported.${resized?' Resized to fit.':''}`);
}
async function exportClip(signal){
 requireArt();const duration=clip.duration;
 status('Encoding animation…');await probeMP4(p().audioMode!=='silent'&&!(p().audioMode==='robot'&&animationSettings(p()).mode==='silent'));signal.throwIfAborted();
 const [w,h]=dimensions(p()),canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
 const ctx=canvas.getContext('2d'),images=new ImageCache(state.art);
 try{
  const audio=await selectedAudio(duration);
  finalBlob=await exportMP4({canvas,duration,audio,signal,draw:async t=>{const img=await images.get(slotAt(clip,t).id);ctx.fillStyle=p().scene.background;ctx.fillRect(0,0,w,h);ctx.drawImage(img,0,0,w,h);},onProgress:f=>{$('#progress').value=f;},onFallback:()=>status('Encoding in real time. Keep this tab open.')});
  signal.throwIfAborted();if(finalUrl)URL.revokeObjectURL(finalUrl);finalUrl=URL.createObjectURL(finalBlob);$('#final-video').src=finalUrl;$('#export-result').hidden=false;status('Animation ready to save.');
 }finally{images.clear();canvas.width=1;canvas.height=1;}
}
async function generatePerformance(signal,candidate=structuredClone(p())){
 if(candidate.animation)candidate.animation.mode='speech';candidate.audioMode='robot';
 validateProject(candidate);
 const takes=await generateSpeech(candidate,{signal,onProgress:n=>status(`Generating speech ${n}/${candidate.lines.filter(l=>l.text.trim()).length}…`)});
 const compiled=compileClip(candidate,takes,candidate.slots);signal.throwIfAborted();
 state.project=candidate;state.takes=takes;clip=compiled;p().slots=compiled.slots;remember();time=0;invalidateVideo();clearDrawingVideo();refreshStats();renderAssigned();animationEditor?.resetDraft();animationEditor?.refresh();await renderPreview();status('Speech ready.');
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
 $('#show-art').checked=false;renderImports();
 if(voiceUrl)URL.revokeObjectURL(voiceUrl);voiceUrl=null;$('#voice-review').removeAttribute('src');$('#voice-review').hidden=true;
 animationEditor?.resetDraft();animationEditor?.clearAction();
 state={takes:{},art:{},refs:{},recording:null,video:null,thumbs:{},artThumbs:{},...loaded,project:upgradeTiming(loaded.project)};cache=null;recompile();time=0;lastHistory=snapshot();clearGalleryURLs();populate();
 if(state.recording){const stale=state.voiceStale,mode=p().audioMode;await setRecording(state.recording);state.voiceStale=stale;p().audioMode=mode;$('#audio-mode').value=mode;$('#voice-stale').hidden=!stale;}
 await renderPreview();
 // Recover older projects that used the removed passthrough importer. Keep their source if decoding fails.
 if(state.video instanceof Blob){p().audioMode=animationSettings(p()).mode==='silent'?'silent':'robot';$('#audio-mode').value=p().audioMode;try{await importDrawingVideo(state.video,busy?.signal??new AbortController().signal);}catch(e){status(`Saved video needs reimport: ${e.message}`,true);}}
}

for(const selector of ['#reference-gallery','#assigned-gallery'])$(selector).onclick=e=>{const id=e.target.closest('[data-preview-slot]')?.dataset.previewSlot;if(!id||!clip||busy||recordingActive)return;stopPlayback();const exposure=clip.exposures.find(e=>e.slotId===id);if(!exposure)return;time=(exposure.startFrame+.5)/clip.fps;$('#show-art').checked=selector==='#assigned-gallery';renderPreview().catch(e=>status(e.message,true));};
$$('[data-tab]').forEach(b=>b.onclick=()=>showTab(b.dataset.tab));$('#next').onclick=()=>showTab(tabs[Math.min(tabs.length-1,tabs.indexOf(tab)+1)]);$('#back').onclick=()=>showTab(tabs[Math.max(0,tabs.indexOf(tab)-1)]);
$('#quit-local').onclick=()=>run('Saving and closing the local app…',async()=>{await flushSave();await quitLocal();closing=true;status('Local app closed. You can close this tab.');});
$('#quit-local').hidden=!(await localApp());
$('#cancel').onclick=()=>busy?.abort();
$('#add-prop').onclick=()=>{
 if((p().scene.props?.length||0)>=12)return status('Use at most 12 objects.',true);
 const kind=$('#prop-kind').value,prop={id:uid(),kind,x:0,y:kind==='goose'?0:1,z:.4,rx:0,ry:0,rz:0,width:kind==='book'?.28:.35,height:kind==='book'?.38:.35,depth:kind==='book'?.04:.35,color:kind==='goose'?'#ffffff':'#ffcd00',attachment:'world'};
 p().scene.props??=[];p().scene.props.push(prop);animationEditor?.resetDraft();changed();renderProps();$('#prop-select').value=prop.id;renderProps();
};
$('#prop-select').onchange=renderProps;
$('#prop-fields').onchange=e=>{if(e.target.dataset.propKey)updateProp(e.target.dataset.propKey,Number(e.target.value));};
$('#prop-color').onchange=e=>updateProp('color',e.target.value);
$('#prop-attachment').onchange=e=>{
 const project=structuredClone(p()),prop=project.scene.props.find(v=>v.id===$('#prop-select').value);prop.attachment=e.target.value;
 Object.assign(prop,e.target.value==='world'?{x:0,y:1,z:.4}:{x:0,y:.08,z:.05});validateProject(project);state.project=project;animationEditor?.resetDraft();changed();renderProps();
};
$('#remove-prop').onclick=()=>{const id=$('#prop-select').value;p().scene.props=p().scene.props.filter(v=>v.id!==id);if(!p().scene.props.length)delete p().scene.props;if(p().animation)p().animation.keys=p().animation.keys.filter(k=>k.target!==`prop:${id}`);animationEditor?.resetDraft();changed();renderProps();};
$('#title').onchange=e=>{p().title=e.target.value;remember();save();};
for(const [id,key]of [['format','format'],['style','style'],['background','background']])$('#'+id).onchange=e=>{p().scene[key]=e.target.value;changed();};
$('#backdrop').onchange=e=>{const name=e.target.value;if(name==='none')delete p().scene.backdrop;else p().scene.backdrop=name;p().scene.background=BACKDROPS[name].sky;$('#background').value=p().scene.background;changed();};
for(const key of ['ground','backdrop'])$('#'+key+'-grid').onchange=e=>{
 p().guides={...p().guides,[key]:e.target.checked};if(e.target.checked&&p().scene.camera.projection!=='perspective'){p().scene.camera.projection='perspective';$('#projection').value='perspective';changed();}else remember();clearDrawingVideo();referenceFiles=[];
 state.refs={};state.thumbs={};renderReferences();save();renderPreview().catch(e=>status(e.message,true));
};
$('#projection').onchange=e=>{p().scene.camera.projection=e.target.value;if(e.target.value==='orthographic'){p().guides={ground:false,backdrop:false};$('#ground-grid').checked=$('#backdrop-grid').checked=false;}changed();};
$('#cast-count').onchange=e=>frame(e.target.value==='1'?'solo':'duet');
$('#camera-fields').onchange=e=>{if(e.target.dataset.key){p().scene.camera[e.target.dataset.key]=Number(e.target.value);e.target.previousElementSibling.textContent=e.target.value;changed();}};
$('#actor-fields').onchange=e=>{const el=e.target;if(el.dataset.actor!==undefined){p().scene.actors[Number(el.dataset.actor)][el.dataset.key]=el.tagName==='SELECT'?el.value:Number(el.value);if(el.previousElementSibling?.tagName==='OUTPUT')el.previousElementSibling.textContent=el.value;changed();}};
function frame(kind){animationEditor?.resetDraft();const next=withFraming(p(),kind),speech=next.lines.some((l,i)=>l.actor!==p().lines[i].actor);state.project=next;changed({speech});populate();}
$$('[data-framing]').forEach(b=>b.onclick=()=>frame(b.dataset.framing));
$('#reset-camera').onclick=()=>frame('reset');
$('#rate').oninput=e=>{$('#rate-label').textContent=Number(e.target.value).toFixed(2)+'×';};
$('#rate').onchange=e=>{const candidate=withSpeechRate(p(),Number(e.target.value));run('Updating speech…',signal=>generatePerformance(signal,candidate)).finally(()=>{$('#rate').value=p().rate;$('#rate-label').textContent=p().rate.toFixed(2)+'×';});};
$('#lines').onchange=e=>{const el=e.target,index=Number(el.closest('[data-line]')?.dataset.line),key=el.dataset.lineKey;if(!key)return;if(key==='emotion'&&!el.value){delete p().lines[index].emotion;changed();return;}p().lines[index][key]=el.type==='checkbox'?el.checked:['actor','rate','pause','headYaw'].includes(key)?Number(el.value):el.value;changed({speech:['text','rate','actor'].includes(key)});};
$('#lines').onclick=e=>{const b=e.target.closest('[data-remove-line]');if(b){p().lines.splice(Number(b.dataset.removeLine),1);renderLines();changed({speech:true});}};
$('#add-line').onclick=()=>{if(p().lines.length>=30)return status('Use at most 30 lines in one clip',true);p().lines.push({id:uid(),actor:p().scene.count===2?p().lines.length%2:0,text:'',rate:1,pause:.35,pose:'keep',headYaw:0,blink:false});renderLines();changed({speech:true});};
$('#generate').onclick=()=>run('Generating speech…',generatePerformance);
$('#play').onclick=()=>{if(animationEditor&&!animationEditor.finishEdits())return;animationEditor?.resetDraft();if(playing)stopPlayback();else play().catch(e=>status(e.message,true));};
$('#scrub').oninput=e=>{const at=Number(e.target.value);if(animationEditor&&!animationEditor.finishEdits())return;stopPlayback();animationEditor?.resetDraft();time=at;animationEditor?.refreshFields();renderPreview().catch(e=>status(e.message,true));updateClock();};
$('#prev-frame').onclick=()=>stepFrame(-1);$('#next-frame').onclick=()=>stepFrame(1);
function stepFrame(direction){if(animationEditor&&!animationEditor.finishEdits())return;stopPlayback();animationEditor?.resetDraft();time=Math.max(0,Math.min(currentDuration(),time+direction/p().fps));animationEditor?.refreshFields();renderPreview().catch(e=>status(e.message,true));}
$('#show-art').onchange=()=>{cache=null;renderPreview().catch(e=>status(e.message,true));};
$('#apply-mouth').onclick=()=>{try{requireClip();p().overrides.push({actor:Number($('#override-actor').value),mouth:$('#override-mouth').value,start:time,end:time+Number($('#override-frames').value)/p().fps});changed();}catch(e){status(e.message,true);}};
$('#clear-mouths').onclick=()=>{p().overrides=[];changed();};
$('#drawing-video').onclick=()=>run('Preparing your drawing-reference video…',prepareDrawingVideo);
$('#download-drawing-video').onclick=()=>{if(drawingVideoBlob)download(drawingVideoBlob,filename(`-draw-${state.transfer.id.slice(0,8)}-24fps.mp4`));};
$('#share-drawing-video').onclick=()=>{
 if(!drawingVideoBlob)return;
 const file=new File([drawingVideoBlob],filename(`-draw-${state.transfer.id.slice(0,8)}-24fps.mp4`),{type:'video/mp4'});
 if(!navigator.canShare?.({files:[file]}))return status('Use Download drawing MP4 to save to Files. In Procreate, choose Import from the Gallery.');
 shareFiles([file]).then(()=>status('Shared.')).catch(e=>status(e.name==='AbortError'?'Sharing cancelled.':e.message,e.name!=='AbortError'));
};
$('#import-artwork').onchange=e=>{
 const files=[...e.target.files];e.target.value='';if(!files.length)return;
 run('Importing drawings…',async signal=>{
  requireClip();const videos=files.filter(f=>f.type.startsWith('video/')||/\.(mp4|mov|m4v)$/i.test(f.name));
  if(videos.length){if(files.length!==1)throw Error('Choose one video, or choose images together.');return importDrawingVideo(videos[0],signal);}
  if(files.length>100)throw Error('Choose at most 100 images.');
  const next=[];
  try{for(const f of files){signal.throwIfAborted();const thumb=await thumbnail(f);next.push({id:uid(),name:f.name,blob:f,url:URL.createObjectURL(thumb)});}}catch(e){next.forEach(i=>URL.revokeObjectURL(i.url));throw e;}
  imports.forEach(i=>URL.revokeObjectURL(i.url));imports=next;order=[];renderImports();status('Tap images in reference order.');
 });
};
$('#zip').onclick=()=>run('Preparing image ZIP…',async signal=>{await prepareDrawings(signal);const files=slots().map((s,i)=>new File([state.refs[s.id]],`${String(i+1).padStart(2,'0')}-${s.id}.png`,{type:'image/png'}));files.push(new File([JSON.stringify({fps:clip.fps,exposures:clip.exposures,drawings:slots().map(s=>({id:s.id,mouths:s.state.mouths}))},null,2)],'timing.json'));download(await imageZip(files),filename('-drawings.zip'));status('Drawing ZIP downloaded.');});
$('#psd').onclick=()=>run('Building the layered drawing library…',async signal=>{await prepareDrawings(signal);if(slots().length>23)throw Error('For more than 23 drawings, use the image export to keep memory manageable');download(await layeredPSD(slots(),state.refs,...dimensions(p())),filename('-references.psd'));status('PSD downloaded. Trace each unique drawing; timing is rebuilt here.');});
$('#contact-sheet').onclick=()=>run('Preparing contact sheet…',async signal=>{await prepareDrawings(signal);const c=document.createElement('canvas');c.width=1200;c.height=Math.ceil(slots().length/4)*350;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);for(const [i,s]of slots().entries()){const img=await decodeImage(state.refs[s.id]),x=i%4*300,y=Math.floor(i/4)*350;ctx.drawImage(img,x+65,y,170,302);ctx.fillStyle='black';ctx.font='bold 22px Arial';ctx.fillText(String(i+1),x+140,y+332);}const b=await new Promise(r=>c.toBlob(r));download(b,filename('-contact-sheet.png'));status('Contact sheet downloaded.');});
$('#import-gallery').onclick=e=>{const id=e.target.closest('[data-choose]')?.dataset.choose;if(!id)return;if(!order.includes(id)&&order.length>=slots().length)return status('All references are numbered. Unselect a drawing to replace it.');order=toggleSelection(order,id);renderImports();};
$('#selection-undo').onclick=()=>{order=order.slice(0,-1);renderImports();};$('#selection-clear').onclick=()=>{order=[];renderImports();};
$('#use-drawings').onclick=()=>run('Assigning your numbered drawings…',async signal=>{
 if(order.length!==slots().length)throw Error(`Number exactly ${slots().length} drawings before applying.`);
 const next={...state.art},[w,h]=dimensions(p());for(const [i,id]of order.entries()){signal.throwIfAborted();next[slots()[i].id]=await normalizeImage(imports.find(x=>x.id===id).blob,w,h,$('#image-fit').value);$('#progress').value=(i+1)/order.length;}
 state.art=next;for(const s of slots())state.artThumbs[s.id]=await thumbnail(next[s.id]);state.video=null;p().audioMode=animationSettings(p()).mode==='silent'?'silent':'robot';$('#audio-mode').value=p().audioMode;cache=null;invalidateVideo();$('#show-art').checked=true;renderAssigned();refreshStats();await renderPreview();await flushSave();status('Drawings imported.');
});
for(const [id,key]of [['audio-mode','audioMode'],['audio-offset','audioOffset'],['trim-start','audioTrimStart'],['trim-end','audioTrimEnd']])$('#'+id).onchange=e=>{p()[key]=id==='audio-mode'?e.target.value:Number(e.target.value);invalidateVideo();save();};
$('#record').onclick=async()=>{
 const attempt=++recordingToken;
 try{requireArt();recordingUI(true);$('#stop-recording').disabled=true;mic=await microphone();$('#stop-recording').disabled=false;$('#countdown').hidden=false;
  for(let n=3;n>0;n--){if(!recordingActive||attempt!==recordingToken)return;$('#countdown').textContent=n;await new Promise(r=>setTimeout(r,1000));}
  if(!recordingActive||attempt!==recordingToken)return;$('#countdown').hidden=true;mic.start();await play({silent:true,fromStart:true,onEnd:()=>stopRecording().catch(e=>status(e.message,true))});
 }catch(e){if(attempt!==recordingToken)return;mic?.cancel();mic=null;recordingUI(false);status(e.message,true);}
};
$('#stop-recording').onclick=()=>stopRecording().catch(e=>status(e.message,true));
$('#export').onclick=()=>run('Preparing finished animation…',exportClip);
$('#share-video').onclick=()=>{if(finalBlob)shareFiles([new File([finalBlob],filename('.mp4'),{type:'video/mp4'})]).catch(e=>status(e.message,true));};$('#download-video').onclick=()=>{if(finalBlob)download(finalBlob,filename('.mp4'));};
$('#save-project').onclick=()=>{if(animationEditor&&!animationEditor.finishEdits())return;return run('Preparing project backup…',async()=>{await flushSave();download(await packProject(state),filename('-project.zip'));status('Backup downloaded. It contains your scene, drawings, and sound.');});};
$('#export-config').onclick=()=>{
 if(animationEditor&&!animationEditor.finishEdits())return;
 try{download(new Blob([exportConfig(p())],{type:'application/json'}),filename('-scene.json'));status('JSON exported.');}catch(e){status(e.message,true);}
};
$('#example-config').onclick=()=>download(new Blob([JSON.stringify(exampleConfig,null,2)+'\n'],{type:'application/json'}),'example-scene.json');
$('#load-config').onchange=e=>{
 const file=e.target.files[0];if(!file)return;
 return run('Loading JSON scene…',async signal=>{
  try{
   if(file.size>5_000_000)throw Error('Config file exceeds 5 MB.');
   const candidate=parseConfig(await file.text());signal.throwIfAborted();
   const takes=animationSettings(candidate).mode==='speech'?await generateSpeech(candidate,{signal,onProgress:n=>status(`Generating speech ${n}/${candidate.lines.filter(l=>l.text.trim()).length}…`)}):{};
   candidate.slots=compileClip(candidate,takes).slots;signal.throwIfAborted();
   // Do not touch the current project until parsing, speech and timing succeed.
   if(animationEditor&&!animationEditor.finishEdits())return;
   await flushSave();signal.throwIfAborted();await restore({project:candidate,takes});showTab('stage');await flushSave();status('JSON scene loaded.');
  }finally{e.target.value='';}
 });
};
$('#open-project').onchange=e=>run('Opening project…',async()=>{const f=e.target.files[0];if(f){if(animationEditor&&!animationEditor.finishEdits())return;await flushSave();await restore(await unpackProject(f));$('.project-tools details').open=false;if(!state.video)status('Project restored.');}e.target.value='';});
$('#new').onclick=()=>{if(animationEditor&&!animationEditor.finishEdits())return;return run('Starting a new clip…',async()=>{await flushSave();await restore({project:newProject()});imports=[];order=[];renderImports();undo=[];redo=[];showTab('stage');status('New clip. Defaults restored; your previous clip is saved.');});};
$('#duplicate').onclick=()=>{if(animationEditor&&!animationEditor.finishEdits())return;return run('Duplicating this scene…',async()=>{await flushSave();const project=structuredClone(p());project.id=uid();project.title+=' — next shot';await restore({...state,project});showTab('stage');status('Scene duplicated. Your previous clip is saved; change this framing for your next shot.');});};
function speechSignature(project){return JSON.stringify([project.rate,project.lines.map(l=>[l.id,l.actor,l.text,l.rate])]);}
function travelHistory(from,to){if(!from.length)return;const previousSpeech=speechSignature(p());clearDrawingVideo();to.push(snapshot());state.project=JSON.parse(from.pop());lastHistory=snapshot();if(previousSpeech!==speechSignature(p()))state.takes={};recompile();time=Math.min(time,currentDuration());animationEditor?.resetDraft();animationEditor?.clearAction();referenceFiles=[];invalidateVideo();populate();save();renderPreview().catch(e=>status(e.message,true));status(clip?'Edit restored.':'Edit restored. Generate dialogue to refresh timing.');}
$('#undo').onclick=()=>travelHistory(undo,redo);$('#redo').onclick=()=>travelHistory(redo,undo);
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(recordingActive)stopRecording().catch(e=>status(e.message,true));stopPlayback();flushSave().catch(()=>{});}});
window.addEventListener('pagehide',()=>{stopPlayback();flushSave().catch(()=>{});});

animationEditor=new AnimationEditor({project:p,clip:()=>clip,time:()=>time,seek:at=>{stopPlayback();time=Math.max(0,Math.min(currentDuration(),at));renderPreview().catch(e=>status(e.message,true));},change:project=>{validateProject(project);if(animationSettings(project).mode==='silent'||Object.keys(state.takes).length)compileClip(project,state.takes,project.slots);state.project=project;changed();renderProps();},preview:()=>renderPreview().catch(e=>status(e.message,true)),error:message=>status(message,true)});
populate();lastHistory=snapshot();
try{
 stage=new Stage($('#stage-canvas'),camera=>{for(const[k,v]of Object.entries(camera)){const bounds={azimuth:[-180,180],elevation:[-45,75],zoom:[.4,3],targetX:[-3,3],targetY:[0,3]}[k];p().scene.camera[k]=Math.max(bounds[0],Math.min(bounds[1],Math.round(v*100)/100));}populate();changed();});
 const stored=await loadState();if(stored){await run('Loading…',()=>restore(stored));$('#saved').textContent='Saved';if(!state.video)status('Project restored.');}else{await renderPreview();status('');save();}
}catch(e){status(e.message,true);$('#saved').textContent='Use Save backup to protect your work';if(stage)renderPreview().catch(e=>status(e.message,true));}
