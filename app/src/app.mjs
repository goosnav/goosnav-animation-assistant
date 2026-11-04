import { newProject, withFraming, BACKDROPS, validateProject, withSpeechRate, upgradeTiming, compileClip, slotAt, dimensions, toggleSelection, MODELS, MODEL_LABELS, MOUTHS, POSES, CHAIRS, uid } from './core.mjs';
import {EMOTIONS} from './emotions.mjs';
import {exportConfig} from './config.mjs';
import {prepareScene,attachArtwork,renderAnimation} from './pipeline.mjs';
import {createOutputWriter} from './batch-files.mjs';
import {setupBatch} from './batch-ui.mjs';
import {prepareSequence,assembleSequence,sequenceJSON,attachSequenceArtwork,renderSequenceReferences,renderSequenceAnimation,sequenceAudio} from './sequence.mjs';
import {createFilm,validateFilm,captureShot,saveFilmState,updateFilmShot,addFilmShot,removeFilmShot,moveFilmShot} from './film-state.mjs';
import {isSequenceDocument} from './sequence-config.mjs';
import {setupShotStrip} from './film-ui.mjs';
import exampleConfig from '../../examples/speech-scene.json';
import { AnimationEditor, propLabel } from './animation-ui.mjs';
import { ACTOR_CHANNELS, PROP_CHANNELS, animationSettings } from './motion.mjs';
import {ACTOR_SECTIONS,PROP_SECTIONS} from './pose-sections.mjs';
import {resetProjectSection,applyProjectPose} from './pose-editing.mjs';
import {alignGaze} from './gaze-alignment.mjs';
import { Stage } from './stage.mjs';
import { generateSpeech, mixSpeech } from './speech/client.mjs';
import { saveState, loadState, listSaved, loadSaved, localApp, quitLocal } from './storage.mjs';
import { packProject, unpackProject } from './archive.mjs';
import { download, shareFiles, imageZip, normalizeImage, ImageCache, layeredPSD, decodeImage, thumbnail } from './images.mjs';
import { microphone, fitVoice } from './video.mjs';
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
let drawingVideoBlob,animationEditor,batchUI,editorOutput=null,pendingArtwork=[];
let film=null,shotUI,removedFilm=null,filmViewCache=null,filmTime=0,previewCacheOwner=null,shotPlayback=false;
const p=()=>state.project;
function status(message,error=false){$('#status').textContent=message;$('#status').classList.toggle('error',error);}
function audioContext(){return context??=new AudioContext();}
const filmScope=()=>!!film&&!shotPlayback&&['draw','finish'].includes(tab);
function currentDuration(){return filmScope()?(filmView()?.duration||0):(clip?.duration||0);}
const clockTime=()=>filmScope()?filmTime:time;
function seekTime(value){if(filmScope())filmTime=value;else time=value;}
function slots(){return clip?.slots.filter(s=>s.active)||[];}
function filename(suffix){return ((film?.title||p().title).replace(/[^a-z0-9_-]+/gi,'-').slice(0,60)||'animation')+suffix;}
function currentTransfer(){
 if(!clip)return null;
 const ordered=currentDrawingSlots();if(ordered.length>100)return null;
 if(state.transfer){try{const saved=transferSlots(state.transfer,p(),clip);if(saved.length===ordered.length&&saved.every((s,i)=>s.id===ordered[i].id))return state.transfer;}catch{}}
 const transfer=makeTransfer(p(),{...clip,slots:ordered.map(s=>({...s,active:true}))});transfer.id=ordered[0].id.slice(1);return transfer;
}
function currentDrawingSlots(){
 const ordered=Array.isArray(state.drawingOrder)&&new Set(state.drawingOrder).size===state.drawingOrder.length?state.drawingOrder.map(id=>clip?.slots.find(s=>s.id===id)):null;
 return ordered?.every(Boolean)&&slots().every(s=>ordered.some(d=>d.id===s.id))?ordered:slots();
}
function orderedDrawings(saved,compiled,fresh=false){
 const active=compiled.slots.filter(s=>s.active),order=!fresh&&Array.isArray(saved.drawingOrder)?saved.drawingOrder.map(id=>compiled.slots.find(s=>s.id===id)):null;
 return order?.length&&new Set(order).size===order.length&&order.every(Boolean)&&active.every(s=>order.includes(s))?order:active;
}
function preparedShot(saved,fresh=false){const compiled=compileClip(saved.project,saved.takes||{},saved.project.slots);return {...saved,project:{...saved.project,slots:compiled.slots},clip:compiled,takes:saved.takes||{},art:saved.art||{},transfer:null,drawingSlots:orderedDrawings(saved,compiled,fresh)};}
function filmSequence({fresh=false,allowNew=false}={}){
 const shots=film.shots.map(shot=>({id:shot.id,title:shot.title,scene:preparedShot(shot.id===film.activeId?state:shot.state,fresh)}));
 try{return assembleSequence({id:film.id,title:film.title,shots,handoff:fresh?null:film.handoff});}
 catch(e){if(!allowNew||e.code!=='HANDOFF_DRAWINGS_CHANGED')throw e;return assembleSequence({id:film.id,title:film.title,shots});}
}
function filmView(){if(!film)return null;try{return filmViewCache??=filmSequence({allowNew:true});}catch{return null;}}
function filmRecipe(){return JSON.stringify({format:'goosnav-animation-sequence',version:1,id:film.id,title:film.title,shots:film.shots.map(s=>({id:s.id,title:s.title,config:JSON.parse(exportConfig((s.id===film.activeId?state:s.state).project))}))},null,2)+'\n';}
function portableJSON(){
 if(film){const prepared=filmView();return prepared?sequenceJSON(prepared):filmRecipe();}
 return exportConfig(p(),clip?{clip,takes:state.takes,transfer:currentTransfer(),drawingSlots:currentDrawingSlots()}:{});
}
function stateFromScene(scene){const {clip,drawingSlots,needsReferences,...saved}=scene;return {...saved,drawingOrder:drawingSlots.map(s=>s.id)};}
async function prepareFilm(signal,{fresh=false}={}){
 const draft=saveFilmState(state,film).film,shots=[];
 for(const [i,shot]of draft.shots.entries()){
  signal?.throwIfAborted();const saved=shot.state;
  if(animationSettings(saved.project).mode==='speech'&&saved.project.lines.some(l=>l.text.trim()&&!saved.takes?.[l.id]))saved.takes=await generateSpeech(saved.project,{signal,onProgress:()=>status(`Preparing shot ${i+1}/${draft.shots.length}…`)});
  try{shots.push({id:shot.id,title:shot.title,scene:preparedShot(saved,fresh)});}catch(e){throw Error(`${shot.title}: ${e.message}`);}
 }
 return assembleSequence({id:draft.id,title:draft.title,shots,handoff:fresh?null:draft.handoff});
}
async function adoptSequence(sequence,{activeId=film?.activeId,keepView=true}={}){
 const shots=sequence.shots.map(s=>({id:s.id,title:s.title,state:stateFromScene(s.scene)}));
 const next={version:1,id:sequence.id,title:sequence.title,activeId:shots.some(s=>s.id===activeId)?activeId:shots[0].id,shots,handoff:sequence.handoff};
 const view=tab;await restore({project:shots[0].state.project,film:next});if(keepView)showTab(view);
}
function previewContext(){
 const sequence=filmScope()?filmView():null;
 if(sequence){const frame=Math.min(sequence.totalFrames-1,Math.max(0,Math.floor(filmTime*24))),shot=sequence.shots.find(s=>frame<s.endFrame),localTime=(frame-shot.startFrame)/24;return {...shot.scene,slot:slotAt(shot.scene.clip,localTime),shotId:shot.id,shotIndex:sequence.shots.indexOf(shot)};}
 return {...state,clip,slot:clip&&slotAt(clip,time)};
}
async function captureShotThumbnail(){
 if(!stage||filmScope())return;const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;const source=$('#art-canvas').hidden?$('#stage-canvas'):$('#art-canvas'),scale=Math.min(128/source.width,128/source.height);canvas.getContext('2d').drawImage(source,(128-source.width*scale)/2,(128-source.height*scale)/2,source.width*scale,source.height*scale);state.shotThumbnail=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.75));
}
function refreshShots(){shotUI?.refresh({canUndo:!!removedFilm,busy:!!busy||recordingActive});}
async function saveEditorFiles(files,name,signal){
 if(editorOutput){const writer=await createOutputWriter({source:editorOutput,job:{path:''},signal});try{for(const file of files)await writer.write(file.name,file);await writer.close();}catch(e){await writer.abort();throw e;}}
 else download(files.length===1?files[0]:await imageZip(files),name);
}
function pipelineProgress(info){status(info.phase+'…');$('#progress').value=info.progress;}
function setWorkspace(mode){
 if(mode==='batch'&&animationEditor&&!animationEditor.finishEdits())return;
 stopPlayback();
 for(const selector of ['.project-title','.config-tools','#saved-clips','#shots-panel','.steps','.workspace','.step-footer','.project-tools'])$(selector).hidden=mode==='batch';
 $('#batch-panel').hidden=mode!=='batch';$('#editor-mode').setAttribute('aria-pressed',String(mode==='editor'));$('#batch-mode-button').setAttribute('aria-pressed',String(mode==='batch'));batchUI?.refresh();
}
function snapshot(){return JSON.stringify(p());}
function remember(){if(lastHistory){undo.push(lastHistory);if(undo.length>30)undo.shift();}redo=[];lastHistory=snapshot();}
function save(){if(closing)return;clearTimeout(saveTimer);$('#saved').textContent='Saving…';saveTimer=setTimeout(()=>flushSave().catch(()=>{}),250);}
function flushSave(){
 if(closing)return Promise.resolve();clearTimeout(saveTimer);const copy=saveFilmState(state,film);
 saveChain=saveChain.catch(()=>{}).then(()=>saveState(copy)).then(()=>$('#saved').textContent='Saved').catch(e=>{$('#saved').textContent='Not saved — download a backup';status(`Autosave unavailable: ${e.message}`,true);throw e;});return saveChain;
}
function clearExport(){finalBlob=null;if(finalUrl)URL.revokeObjectURL(finalUrl);finalUrl=null;$('#final-video').removeAttribute('src');$('#final-video').load();$('#export-result').hidden=true;}
function clearDrawingVideo(){drawingVideoBlob=null;$('#drawing-video-result').hidden=true;}
function refreshTransfer(){
 if(film){let note='';try{filmSequence();}catch(e){if(film.handoff)note='Film changed. Create new references.';}$('#transfer-summary').textContent=note;$('#transfer-summary').hidden=!note;return;}
 const transfer=state.transfer;let note='';
 if(transfer&&clip){try{transferSlots(transfer,p(),clip);const missing=slots().filter(s=>!transfer.slots.some(t=>t.id===s.id)&&!state.art[s.id]).length;if(missing)note=`${missing} new mouth drawings needed. Create references.`;}catch{note='Scene changed. Create new references.';}}
 $('#transfer-summary').textContent=note;$('#transfer-summary').hidden=!note;
}
function refreshActions(){
 if(busy||recordingActive)return;
 const sequence=film?filmView():null,ready=film?!!sequence&&sequence.shots.every(s=>s.scene.clip.slots.every(d=>!d.active||s.scene.art[d.id])):!!clip&&slots().every(s=>state.art[s.id]);
 $('#play').disabled=filmScope()?!sequence:!clip;$('#drawing-video').disabled=film?false:!clip;$('#import-artwork').disabled=film?!sequence:!clip;$('#export').disabled=!ready;
 $('#audio-mode option[value=recording]').disabled=!state.recording;$('#shot-audio-label').hidden=!film;
 $('#drawing-video').classList.toggle('primary',!drawingVideoBlob);
 $('.speed-control').hidden=animationSettings(p()).mode==='silent';
}
const mouthNames={rest:'Closed',small:'E',open:'A',wide:'EE',round:'O / U',teeth:'F / V'};
function invalidateVideo(){filmViewCache=null;clearExport();if(state.recording){state.voiceStale=true;$('#voice-stale').hidden=false;}}
function recompile(){
 try{clip=compileClip(p(),state.takes,p().slots);p().slots=clip.slots;if(animationSettings(p()).mode==='silent')p().animation.duration=clip.duration;}catch(e){clip=null;if(animationSettings(p()).mode==='silent'||Object.keys(state.takes).length)status(e.message,true);}
}
function changed({speech=false}={}){
 stopPlayback();invalidateVideo();clearDrawingVideo();
 if(speech){state.takes={};p().overrides=[];}recompile();remember();
 referenceFiles=[];time=Math.min(time,currentDuration());refreshStats();renderAssigned();animationEditor?.refresh();save();renderPreview().catch(e=>status(e.message,true));
}
function activeState(){return previewContext().slot?.state||{scene:p().scene,mouths:['rest','rest'],blinks:[false,false]};}
function resetBaseSection(target,section){
 try{
  const result=resetProjectSection(p(),{target,section});state.project=result.project;
  animationEditor?.resetDraft();changed();populate();status(`Section reset.${result.warnings.length?' '+result.warnings.join(' '):''}`);
 }catch(error){status(error.message,true);}
}
async function alignPose(actors,target,{draft=false}={}){
 if(!stage)return;
 return run('Aligning gaze…',async signal=>{
  ++renderTicket;
  const shown=draft?animationEditor.draftState(activeState()):{scene:structuredClone(p().scene),mouths:['rest','rest'],blinks:[false,false]};
  await stage.prepare(shown.scene);signal.throwIfAborted();
  const [w,h]=dimensions(p());stage.draw(shown,432,Math.round(432*h/w));
  const result=alignGaze(stage,{actors,target});signal.throwIfAborted();
  if(!result.changes.length){status(result.warnings.join(' ')||'No gaze change needed.');return;}
  let warnings=result.warnings;
  if(draft){animationEditor.setPoseDraft(result.changes[0].values);status(`Gaze aligned in the pose draft. Set keyframe to keep it.${warnings.length?' '+warnings.join(' '):''}`);}
  else{
   const edited=applyProjectPose(p(),{changes:result.changes});state.project=edited.project;warnings=[...warnings,...edited.warnings];
   animationEditor.resetDraft();changed();populate();status(`Base gaze aligned.${warnings.length?' '+warnings.join(' '):''}`);
  }
  await renderPreview();
 });
}
async function renderPreview(){
 const ticket=++renderTicket,view=previewContext(),project=view.project,slot=view.slot;
 const useArt=$('#show-art').checked&&view.clip&&tab!=='animate';
 const [w,h]=dimensions(project),width=project.scene.format==='portrait'?432:768,height=Math.round(width*h/w);
 $('#preview-frame').className=project.scene.format;
 if(useArt&&view.art?.[slot?.id]){
  const owner=view.shotId||project.id;if(previewCacheOwner!==owner){cache?.clear();cache=null;previewCacheOwner=owner;}cache??=new ImageCache(view.art);const img=await cache.get(slot.id);if(ticket!==renderTicket)return;
  const c=$('#art-canvas');if(c.width!==width||c.height!==height){c.width=width;c.height=height;}const ctx=c.getContext('2d');ctx.fillStyle=project.scene.background;ctx.fillRect(0,0,width,height);ctx.drawImage(img,0,0,width,height);
  c.hidden=false;$('#guide-canvas').hidden=true;$('#stage-canvas').hidden=true;$('#preview-badge').textContent='YOUR DRAWING';
 }else{
  $('#art-canvas').hidden=true;$('#stage-canvas').hidden=false;$('#preview-badge').textContent=useArt?'MISSING DRAWING':'3D GUIDE';
  if(stage){const shown=slot?.state||{scene:project.scene,mouths:['rest','rest'],blinks:[false,false]};await stage.prepare(shown.scene);if(ticket!==renderTicket)return;stage.draw(tab==='animate'?animationEditor.draftState(shown):shown,width,height,{guides:project.guides});stage.controls.enabled=tab==='stage'&&!busy&&!playing;const guide=$('#guide-canvas');guide.hidden=false;guide.width=width;guide.height=height;drawPerspectiveGuides(guide.getContext('2d'),shown,width,height,project.guides);}
 }
 if(view.shotId)$('#preview-badge').textContent=`SHOT ${view.shotIndex+1} · `+$('#preview-badge').textContent;
 updateClock();
}
function updateClock(){const view=previewContext(),selected=view.slot&&(view.shotId?`${view.shotId}:${view.slot.id}`:view.slot.id);$$('[data-preview-slot]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.previewSlot===selected));const d=currentDuration()||0,at=clockTime();$('#scrub').max=d;$('#scrub').step=1/p().fps;$('#scrub').value=at;$('#time').textContent=`${at.toFixed(2)} / ${d.toFixed(2)} s`;animationEditor?.clock();}
function refreshStats(){
 refreshTransfer();
 const sequence=filmScope()?filmView():null,n=sequence?sequence.drawingSlots.length:slots().length,done=sequence?sequence.drawingSlots.filter(d=>sequence.shots.find(s=>s.id===d.shotId).scene.art[d.slotId]).length:slots().filter(s=>state.art[s.id]).length;
 $('#drawing-count').textContent=sequence||clip?n:'—';$('#duration').textContent=sequence?sequence.duration.toFixed(1):clip?clip.duration.toFixed(1):'—';$('#art-count').textContent=done;
 $('#reference-plan').textContent=sequence?`${sequence.shots.length} shots · ${n} drawings to trace · ${sequence.totalFrames} playback frames.`:clip?`${n} drawing${n===1?'':'s'} to trace · ${clip.totalFrames} playback frames. Repeated poses reuse your drawings.`:'Choose an action in Animation or generate speech to prepare your drawings.';
 $('#budget').hidden=n<=23;$('#budget').textContent=`${n} drawings`;
 refreshActions();refreshShots();$('#voice-stale').hidden=!state.voiceStale;updateClock();
}
function showTab(next){if(tab==='animate'&&next!==tab&&animationEditor&&!animationEditor.finishEdits())return;if(next!==tab)stopPlayback();tab=next;document.body.dataset.step=tab;if(stage)renderPreview().catch(e=>status(e.message,true));$$('[data-view]').forEach(e=>e.hidden=e.dataset.view!==tab);$('#saved-clips').ontoggle=async()=>{if(!$('#saved-clips').open)return;try{const saved=await listSaved();$('#saved-list').innerHTML=saved.length?saved.map(s=>`<button data-open-saved="${esc(s.id)}">${esc(s.title)}</button>`).join(''):'No saved clips yet.';}catch(e){status(e.message,true);}};
$('#saved-list').onclick=e=>{const id=e.target.closest('[data-open-saved]')?.dataset.openSaved;if(id&&(!animationEditor||animationEditor.finishEdits()))run('Opening saved clip…',async()=>{await flushSave();await restore(await loadSaved(id));$('#saved-clips').open=false;if(!state.video)status('Project restored.');});};
$$('[data-tab]').forEach(e=>{if(e.dataset.tab===tab)e.setAttribute('aria-current','step');else e.removeAttribute('aria-current');});$('#footer-label').textContent={stage:'Scene',rehearse:'Speech',animate:'Animation',draw:'Drawings',finish:'Export'}[tab];$('#back').disabled=tabs.indexOf(tab)===0;$('#next').hidden=tab==='finish';if(stage)stage.controls.enabled=tab==='stage'&&!busy;refreshActions();refreshStats();renderAssigned();}
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
 if($('#prop-fields').dataset.prop===prop.id){for(const input of $$('[data-prop-key]'))if(document.activeElement!==input)input.value=prop[input.dataset.propKey]??PROP_CHANNELS[input.dataset.propKey].default;}else{$('#prop-fields').dataset.prop=prop.id;$('#prop-fields').innerHTML=Object.entries(PROP_SECTIONS).filter(([id])=>id!=='book'||prop.kind==='book').map(([id,{label,keys}])=>`<details ${id==='rotation'?'':'open'}><summary>${label}</summary><div class="pose-section-actions"><button type="button" data-prop-reset-section="${id}" aria-label="Reset object ${label}">Reset</button></div><div class="sliders">${keys.map(key=>{const c=PROP_CHANNELS[key];return `<label>${esc(c.label)}<input data-prop-key="${key}" type="number" min="${c.min}" max="${c.max}" step="${c.step}" value="${prop[key]??c.default}"></label>`;}).join('')}</div></details>`).join('');}
}
function updateProp(key,value){
 const project=structuredClone(p()),prop=project.scene.props?.find(v=>v.id===$('#prop-select').value);if(!prop)return;
 prop[key]=value;try{validateProject(project);state.project=project;animationEditor?.resetDraft();changed();renderProps();}catch(e){status(e.message,true);renderProps();}
}
const scenePoseFields={position:['x','y','z','yaw','scale'],head:['headYaw','headPitch','headTilt','headSpin'],body:['bodyLean','bodyTurn','rootPitch','rootRoll'],'left-arm':['armL','armSideL','elbowL','handL','fingerCurlL','fingerPointL'],'right-arm':['armR','armSideR','elbowR','handR','fingerCurlR','fingerPointR'],legs:['thighL','kneeL','footL','thighR','kneeR','footR'],cartoon:['headScale','handScale','armStretchR','flatten','burst','noseDetach','nose']};
function actorSections(actor,index){
 return Object.entries(ACTOR_SECTIONS).map(([id,{label}])=>`<details data-section="${id}" ${id==='position'?'open':''}><summary>${label}</summary><div class="pose-section-actions"><button type="button" data-actor-reset-section="${id}" data-actor-index="${index}" aria-label="Reset ${label}" title="Reset base ${label.toLowerCase()} offsets. Held pose and expression stay selected.">Reset</button>${id==='head'?`${p().scene.count===2?`<button type="button" data-actor-align="partner" data-actor-index="${index}">Look at partner</button>`:''}<button type="button" data-actor-align="camera" data-actor-index="${index}">Look at camera</button>`:''}</div><div class="sliders">${scenePoseFields[id].map(key=>{const c=ACTOR_CHANNELS[key];return slider(c.label,key,actor[key]??c.default,c.min,c.max,c.step,`data-actor="${index}"`);}).join('')}</div></details>`).join('');
}
function populate(){
 $('#title').value=film?.title||p().title;$('#project-kind').textContent=film?'Film':'Clip';refreshShots();$('#format').value=p().scene.format;$('#style').value=p().scene.style;$('#background').value=p().scene.background;$('#cast-count').value=p().scene.count;$('#projection').value=p().scene.camera.projection;$('#rate').value=p().rate;$('#rate-label').textContent=p().rate.toFixed(2)+'×';
 $('#backdrop').innerHTML=Object.entries(BACKDROPS).map(([id,b])=>option(id,b.label,p().scene.backdrop||'none')).join('');
 for(const key of ['ground','backdrop'])$('#'+key+'-grid').checked=!!p().guides?.[key];
 $('#camera-fields').innerHTML=[['Orbit','azimuth',-180,180],['Elevation','elevation',-45,75],['Zoom','zoom',.4,3,.05],['Pan sideways','targetX',-3,3,.05],['Pan up/down','targetY',0,3,.05]].map(([l,k,min,max,step])=>slider(l,k,p().scene.camera[k],min,max,step||1,'data-camera')).join('');
 $('#align-characters').textContent=p().scene.count===2?'Look at each other':'Look at camera';
 const openSections=new Set($$('#actor-fields details[open]').map(node=>`${node.closest('.actor').dataset.index}:${node.dataset.section}`));
 $('#actor-fields').innerHTML=p().scene.actors.slice(0,p().scene.count).map((a,i)=>`<div class="actor" data-index="${i}"><h3>Character ${i?'B':'A'}</h3><div class="field-pair"><label>Character<select data-actor="${i}" data-key="model">${MODELS.map(m=>option(m,MODEL_LABELS[m]||pretty(m),a.model)).join('')}</select></label><label>Held pose<select data-actor="${i}" data-key="pose">${POSES.map(m=>option(m,pretty(m),a.pose)).join('')}</select></label></div><div class="field-pair"><label>Chair when sitting<select data-actor="${i}" data-key="chair">${Object.entries(CHAIRS).map(([id,label])=>option(id,label,a.chair||'folding')).join('')}</select></label><label>Expression<select data-actor="${i}" data-key="emotion">${Object.entries(EMOTIONS).map(([id,e])=>option(id,e.label,a.emotion||'neutral')).join('')}</select></label></div>${actorSections(a,i)}</div>`).join('');
 for(const node of $$('#actor-fields details'))if(openSections.has(`${node.closest('.actor').dataset.index}:${node.dataset.section}`))node.open=true;
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
function galleryDrawings(){const sequence=filmScope()?filmView():null;return sequence?sequence.drawingSlots.map(d=>({slot:d,localId:d.slotId,owner:sequence.shots.find(s=>s.id===d.shotId).scene,shotLabel:`${sequence.shots.findIndex(s=>s.id===d.shotId)+1}. ${sequence.shots.find(s=>s.id===d.shotId).title}`})):slots().map(slot=>({slot,localId:slot.id,owner:state}));}
function renderGallery(selector,kind){
 releaseGallery(selector);$(selector).replaceChildren();const drawings=galleryDrawings();
 if(kind==='refs')$(selector).hidden=drawings.length>0&&drawings.every(d=>d.owner.art?.[d.localId]);
 for(const [i,{slot,localId,owner,shotLabel}]of drawings.entries()){const blob=owner[kind]?.[localId];if(!blob)continue;const box=document.createElement('button');box.className='drawing';box.dataset.previewSlot=slot.id;box.setAttribute('aria-label',`Preview drawing ${i+1}`);const caption=slot.state.mouths.slice(0,owner.project.scene.count).map((m,n)=>`${owner.project.scene.count===2?(n?'B: ':'A: '):''}${mouthNames[m]}`).join(' · ');box.innerHTML=`<img src="${blobURL(owner[kind==='refs'?'thumbs':'artThumbs']?.[localId]||blob)}" alt="${kind==='refs'?'Reference':'Drawing'} ${i+1}"><span class="number">${i+1}</span><span class="caption">${shotLabel?`<span>${esc(shotLabel)}</span>`:''}${esc(caption)}</span>`;$(selector).append(box);}
}
function renderReferences(){renderGallery('#reference-gallery','refs');}
function renderAssigned(){renderGallery('#assigned-gallery','art');renderReferences();}
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
 finally{busy=null;$$('button,input,select,textarea').forEach(e=>e.disabled=false);$('#busy-panel').hidden=true;showTab(tab);batchUI?.refresh();refreshShots();if(!closing)save();}
}
function requireClip(){if(!clip)throw Error('Generate speech or choose a silent duration in Animation.');}
function requireArt(){if(film){const sequence=filmSequence();if(sequence.shots.some(s=>s.scene.clip.slots.some(d=>d.active&&!s.scene.art[d.id])))throw Error('Import drawings for every shot before exporting the film.');return;}requireClip();if(slots().some(s=>!state.art[s.id]))throw Error('Import your drawn video or assign all drawings before exporting the finished clip.');}
async function selectedAudio(duration){
 const c=audioContext();if(filmScope())return sequenceAudio(filmSequence({allowNew:true}),c);if(p().audioMode==='silent'||p().audioMode==='robot'&&animationSettings(p()).mode==='silent')return null;
 if(p().audioMode==='recording'){if(!state.recording)throw Error('Record a voiceover first, or choose Robot voice / Silent.');return fitVoice(c,await c.decodeAudioData(await state.recording.arrayBuffer()),duration,p());}
 requireClip();return mixSpeech(c,clip,state.takes);
}
function stopPlayback(){playing=false;playToken++;if(source){try{source.stop();}catch{}source=null;}$('#play').textContent='Play';$('#play').setAttribute('aria-label','Play animation');}
async function play({silent=false,fromStart=false,onEnd}={}){
 stopPlayback();if(!filmScope())requireClip();const duration=currentDuration();if(!Number.isFinite(duration)||!duration)throw Error('No playable animation yet');
 if(fromStart||clockTime()>=duration-.05)seekTime(0);
 const c=audioContext();await c.resume();const token=++playToken;
 let audio;if(!silent)audio=await selectedAudio(duration);if(token!==playToken)return;
 if(audio){source=c.createBufferSource();source.buffer=audio;source.connect(c.destination);source.start(0,clockTime());}
 playing=true;$('#play').textContent='Pause';$('#play').setAttribute('aria-label','Pause animation');const started=c.currentTime-clockTime();
 while(playing&&token===playToken){seekTime(Math.min(duration,c.currentTime-started));if(clockTime()>=duration){stopPlayback();seekTime(0);await renderPreview();onEnd?.();break;}await renderPreview();updateClock();await new Promise(r=>setTimeout(r,1000/p().fps));}
}
async function prepareDrawings(signal){
 requireClip();const [w,h]=dimensions(p()),canvas=document.createElement('canvas'),renderer=new Stage(canvas);
 const guideKey=referenceGuideKey(p()),reuse=state.refsVersion===REFERENCE_VERSION&&state.refsGuides===guideKey;
 const fresh=reuse?{...state.refs}:{},thumbs=reuse?{...state.thumbs}:{};
 try{await renderer.prepare(p().scene);for(const [i,s]of slots().entries()){signal.throwIfAborted();if(!fresh[s.id]){renderer.draw(s.state,w,h,{guides:p().guides});fresh[s.id]=await annotatedReference(await renderer.png(),s.state,w,h,p().guides);thumbs[s.id]=await thumbnail(fresh[s.id]);}$('#progress').value=(i+1)/slots().length;await new Promise(r=>setTimeout(r,0));}}finally{renderer.dispose();canvas.width=1;canvas.height=1;}
 signal.throwIfAborted();state.refs=fresh;state.thumbs=thumbs;state.refsVersion=REFERENCE_VERSION;state.refsGuides=guideKey;referenceFiles=slots().map((s,i)=>new File([fresh[s.id]],`${String(i+1).padStart(4,'0')}.png`,{type:'image/png'}));
 renderReferences();

}
async function prepareFilmReferences(signal,format){
 const candidate=await prepareFilm(signal,{fresh:true}),files=[];let video;
 await renderSequenceReferences(candidate,{format:format==='mp4'?'both':'png',signal,onProgress:pipelineProgress,emit:async(name,blob)=>{
  if(name.startsWith('references/')){const index=Number(name.match(/(\d+)\.png$/)[1])-1,slot=candidate.drawingSlots[index],scene=candidate.shots.find(s=>s.id===slot.shotId).scene;scene.refs??={};scene.thumbs??={};scene.refs[slot.slotId]=blob;scene.thumbs[slot.slotId]=await thumbnail(blob);if(scene.drawingSlots[0].id===slot.slotId)scene.shotThumbnail=scene.thumbs[slot.slotId];}
  if(name==='references.mp4')video=blob;
  if(format==='png'||!name.startsWith('references/'))files.push(new File([blob],name,{type:blob.type}));
 }});
 signal.throwIfAborted();await adoptSequence(candidate);await flushSave();
 if(video){drawingVideoBlob=video;$('#drawing-video-result').hidden=false;$('#drawing-video-info').textContent=`${candidate.drawingSlots.length} drawings · ${candidate.shots.length} shots · 24 fps`;}
 await saveEditorFiles(files,filename('-references.zip'),signal);status('References ready.');
}
async function prepareDrawingVideo(signal){
 if(film)return prepareFilmReferences(signal,'mp4');
 requireClip();let transfer=currentTransfer();if(!transfer||transfer.slots.length!==slots().length){transfer=makeTransfer(p(),clip);transfer.id=slots()[0].id.slice(1);}
 await prepareDrawings(signal);signal.throwIfAborted();
 const canvas=document.createElement('canvas');canvas.width=transfer.width;canvas.height=transfer.height;
 const ctx=canvas.getContext('2d'),images=new ImageCache(state.refs);
 try{
  status(`Encoding ${transfer.slots.length} drawings…`);
  const blob=await exportFrameVideo({canvas,frameCount:transfer.slots.length,signal,onProgress:f=>{$('#progress').value=f;},drawFrame:async i=>{ctx.drawImage(await images.get(transfer.slots[i].id),0,0,canvas.width,canvas.height);}});
  signal.throwIfAborted();
  // Save the mapping before exposing the download. Otherwise leaving for Procreate could lose it.
  const previous=state.transfer,previousOrder=state.drawingOrder;state.transfer=transfer;state.drawingOrder=transfer.slots.map(s=>s.id);
  try{await flushSave();}catch(e){state.transfer=previous;state.drawingOrder=previousOrder;throw e;}
  clearDrawingVideo();drawingVideoBlob=blob;$('#drawing-video-result').hidden=false;
  $('#drawing-video-info').textContent=`${transfer.slots.length} frames · 24 fps`;
  await saveEditorFiles([new File([blob],'references.mp4',{type:'video/mp4'}),new File([portableJSON()],'scene.json',{type:'application/json'})],filename('-references.zip'),signal);
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
 requireArt();status('Encoding animation…');
 finalBlob=await (film?renderSequenceAnimation(filmSequence(),{signal,audioContext:audioContext(),onProgress:pipelineProgress}):renderAnimation({...state,clip},{signal,audioContext:audioContext(),onProgress:pipelineProgress}));
 signal.throwIfAborted();if(finalUrl)URL.revokeObjectURL(finalUrl);finalUrl=URL.createObjectURL(finalBlob);$('#final-video').src=finalUrl;$('#export-result').hidden=false;
 await saveEditorFiles([new File([finalBlob],filename('.mp4'),{type:'video/mp4'})],filename('.mp4'),signal);status('Animation saved.');
}
async function generatePerformance(signal,candidate=structuredClone(p())){
 if(candidate.animation)candidate.animation.mode='speech';candidate.audioMode='robot';
 validateProject(candidate);
 const takes=await generateSpeech(candidate,{signal,onProgress:n=>status(`Generating speech ${n}/${candidate.lines.filter(l=>l.text.trim()).length}…`)});
 const compiled=compileClip(candidate,takes,candidate.slots);signal.throwIfAborted();
 state.project=candidate;state.takes=takes;clip=compiled;p().slots=compiled.slots;remember();time=0;invalidateVideo();clearDrawingVideo();refreshStats();renderAssigned();animationEditor?.resetDraft();animationEditor?.refresh();await renderPreview();status('Speech ready.');
}
async function setRecording(blob){
 invalidateVideo();state.recording=blob;state.voiceStale=false;p().audioMode='recording';$('#audio-mode').value='recording';$('#voice-stale').hidden=true;
 if(voiceUrl)URL.revokeObjectURL(voiceUrl);voiceUrl=URL.createObjectURL(blob);$('#voice-review').src=voiceUrl;$('#voice-review').hidden=false;save();
}
function recordingUI(active){
 recordingActive=active;shotPlayback=active;$$('button,input,select,textarea').forEach(e=>e.disabled=active);
 $('#stop-recording').disabled=false;$('#stop-recording').hidden=!active;$('#record').hidden=active;
 if(!active){$('#countdown').hidden=true;showTab(tab);}if(stage)stage.controls.enabled=!active&&tab==='stage';
}
async function stopRecording(){
 if(!mic)return;recordingToken++;const current=mic;mic=null;stopPlayback();
 try{const blob=await current.stop();if(blob.size){await setRecording(blob);status('Voiceover recorded. Preview it before exporting.');}else status('Recording cancelled before the countdown finished.');}
 finally{recordingUI(false);}
}

async function restore(loaded,{keepFilm=false}={}){
 validateProject(loaded.project);if(!keepFilm)removedFilm=null;if(loaded.film){film=structuredClone(validateFilm(loaded.film));loaded=film.shots.find(s=>s.id===film.activeId).state;}else if(!keepFilm){film=null;removedFilm=null;}filmViewCache=null;filmTime=0;pendingArtwork=[];cache?.clear();previewCacheOwner=null;
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

for(const selector of ['#reference-gallery','#assigned-gallery'])$(selector).onclick=e=>{const id=e.target.closest('[data-preview-slot]')?.dataset.previewSlot,timeline=filmScope()?filmView():clip;if(!id||!timeline||busy||recordingActive)return;stopPlayback();const exposure=timeline.exposures.find(e=>e.slotId===id);if(!exposure)return;seekTime((exposure.startFrame+.5)/timeline.fps);$('#show-art').checked=selector==='#assigned-gallery';renderPreview().catch(e=>status(e.message,true));};
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
$('#prop-fields').onclick=e=>{const button=e.target.closest('[data-prop-reset-section]');if(button)resetBaseSection(`prop:${$('#prop-select').value}`,button.dataset.propResetSection);};
$('#prop-color').onchange=e=>updateProp('color',e.target.value);
$('#prop-attachment').onchange=e=>{
 const project=structuredClone(p()),prop=project.scene.props.find(v=>v.id===$('#prop-select').value);prop.attachment=e.target.value;
 Object.assign(prop,e.target.value==='world'?{x:0,y:1,z:.4}:{x:0,y:.08,z:.05});validateProject(project);state.project=project;animationEditor?.resetDraft();changed();renderProps();
};
$('#remove-prop').onclick=()=>{const id=$('#prop-select').value;p().scene.props=p().scene.props.filter(v=>v.id!==id);if(!p().scene.props.length)delete p().scene.props;if(p().animation)p().animation.keys=p().animation.keys.filter(k=>k.target!==`prop:${id}`);animationEditor?.resetDraft();changed();renderProps();};
$('#title').onchange=e=>{if(film){film.title=e.target.value;filmViewCache=null;}else p().title=e.target.value;remember();refreshShots();save();};
for(const [id,key]of [['format','format'],['style','style'],['background','background']])$('#'+id).onchange=e=>{p().scene[key]=e.target.value;if(film&&key==='format')for(const shot of film.shots)shot.state.project.scene.format=e.target.value;changed();};
$('#backdrop').onchange=e=>{const name=e.target.value;if(name==='none')delete p().scene.backdrop;else p().scene.backdrop=name;p().scene.background=BACKDROPS[name].sky;$('#background').value=p().scene.background;changed();};
for(const key of ['ground','backdrop'])$('#'+key+'-grid').onchange=e=>{
 p().guides={...p().guides,[key]:e.target.checked};if(e.target.checked&&p().scene.camera.projection!=='perspective'){p().scene.camera.projection='perspective';$('#projection').value='perspective';changed();}else remember();clearDrawingVideo();referenceFiles=[];
 state.refs={};state.thumbs={};renderReferences();save();renderPreview().catch(e=>status(e.message,true));
};
$('#projection').onchange=e=>{p().scene.camera.projection=e.target.value;if(e.target.value==='orthographic'){p().guides={ground:false,backdrop:false};$('#ground-grid').checked=$('#backdrop-grid').checked=false;}changed();};
$('#cast-count').onchange=e=>frame(e.target.value==='1'?'solo':'duet');
$('#camera-fields').onchange=e=>{if(e.target.dataset.key){p().scene.camera[e.target.dataset.key]=Number(e.target.value);e.target.previousElementSibling.textContent=e.target.value;changed();}};
$('#actor-fields').onchange=e=>{const el=e.target;if(el.dataset.actor!==undefined){p().scene.actors[Number(el.dataset.actor)][el.dataset.key]=el.tagName==='SELECT'?el.value:Number(el.value);if(el.previousElementSibling?.tagName==='OUTPUT')el.previousElementSibling.textContent=el.value;changed();}};
$('#actor-fields').onclick=e=>{const reset=e.target.closest('[data-actor-reset-section]');if(reset)resetBaseSection(`actor:${reset.dataset.actorIndex}`,reset.dataset.actorResetSection);const gaze=e.target.closest('[data-actor-align]');if(gaze)alignPose([Number(gaze.dataset.actorIndex)],gaze.dataset.actorAlign);};
$('#align-characters').onclick=()=>alignPose(undefined,p().scene.count===2?'partner':'camera');
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
$('#scrub').oninput=e=>{const at=Number(e.target.value);if(animationEditor&&!animationEditor.finishEdits())return;stopPlayback();animationEditor?.resetDraft();seekTime(at);animationEditor?.refreshFields();renderPreview().catch(e=>status(e.message,true));updateClock();};
$('#prev-frame').onclick=()=>stepFrame(-1);$('#next-frame').onclick=()=>stepFrame(1);
function stepFrame(direction){if(animationEditor&&!animationEditor.finishEdits())return;stopPlayback();animationEditor?.resetDraft();seekTime(Math.max(0,Math.min(currentDuration(),clockTime()+direction/p().fps)));animationEditor?.refreshFields();renderPreview().catch(e=>status(e.message,true));}
$('#show-art').onchange=()=>{cache=null;renderPreview().catch(e=>status(e.message,true));};
$('#apply-mouth').onclick=()=>{try{requireClip();p().overrides.push({actor:Number($('#override-actor').value),mouth:$('#override-mouth').value,start:time,end:time+Number($('#override-frames').value)/p().fps});changed();}catch(e){status(e.message,true);}};
$('#clear-mouths').onclick=()=>{p().overrides=[];changed();};
$('#drawing-video').onclick=()=>run('Preparing your drawing-reference video…',prepareDrawingVideo);
$('#download-drawing-video').onclick=()=>{if(drawingVideoBlob)download(drawingVideoBlob,filename(`-draw-${(film?.id||state.transfer.id).slice(0,8)}-24fps.mp4`));};
$('#share-drawing-video').onclick=()=>{
 if(!drawingVideoBlob)return;
 const file=new File([drawingVideoBlob],filename(`-draw-${(film?.id||state.transfer.id).slice(0,8)}-24fps.mp4`),{type:'video/mp4'});
 if(!navigator.canShare?.({files:[file]}))return status('Use Download drawing MP4 to save to Files. In Procreate, choose Import from the Gallery.');
 shareFiles([file]).then(()=>status('Shared.')).catch(e=>status(e.name==='AbortError'?'Sharing cancelled.':e.message,e.name!=='AbortError'));
};
$('#import-artwork').onchange=e=>{
 const files=[...e.target.files];e.target.value='';if(!files.length)return;
 run('Importing drawings…',async signal=>{
  if(film){const ready=await attachSequenceArtwork(filmSequence(),files,{signal,onProgress:pipelineProgress});await prepareArtThumbs(ready,signal);signal.throwIfAborted();await adoptSequence(ready);$('#show-art').checked=true;showTab('finish');await renderPreview();await flushSave();status('Drawings loaded. Ready to export.');return;}
  requireClip();const videos=files.filter(f=>f.type.startsWith('video/')||/\.(mp4|mov|m4v)$/i.test(f.name));
  if(videos.length){if(files.length!==1)throw Error('Choose one video, or choose images together.');return importDrawingVideo(videos[0],signal);}
  if(files.length>2000||files.reduce((n,f)=>n+f.size,0)>256*1024*1024)throw Error('Use at most 2,000 images and 256 MB per scene.');
  if(files.every(f=>/^\d+[-_]|\d+\.[^.]+$/.test(f.name))){
   const ready=await attachArtwork({project:p(),clip,takes:state.takes,drawingSlots:currentDrawingSlots()},files,{signal,onProgress:pipelineProgress}),thumbs={};
   for(const [id,blob]of Object.entries(ready.art)){signal.throwIfAborted();thumbs[id]=await thumbnail(blob);}
   signal.throwIfAborted();state.art=ready.art;state.artThumbs=thumbs;state.video=null;cache?.clear();cache=null;invalidateVideo();
   imports.forEach(i=>URL.revokeObjectURL(i.url));imports=[];order=[];renderImports();$('#show-art').checked=true;renderAssigned();refreshStats();showTab('finish');await renderPreview();await flushSave();status('Drawings loaded. Ready to export.');return;
  }
  const next=[];
  try{for(const f of files){signal.throwIfAborted();const thumb=await thumbnail(f);next.push({id:uid(),name:f.name,blob:f,url:URL.createObjectURL(thumb)});}}catch(e){next.forEach(i=>URL.revokeObjectURL(i.url));throw e;}
  imports.forEach(i=>URL.revokeObjectURL(i.url));imports=next;order=[];renderImports();status('Tap images in reference order.');
 });
};
$('#zip').onclick=()=>run('Preparing image ZIP…',async signal=>{if(film)return prepareFilmReferences(signal,'png');await prepareDrawings(signal);const files=slots().map((s,i)=>new File([state.refs[s.id]],`references/${String(i+1).padStart(4,'0')}.png`,{type:'image/png'}));files.push(new File([JSON.stringify({fps:clip.fps,exposures:clip.exposures,drawings:slots().map(s=>({id:s.id,mouths:s.state.mouths}))},null,2)],'timing.json'));const transfer=slots().length<=100?makeTransfer(p(),clip):null;if(transfer)transfer.id=slots()[0].id.slice(1);state.transfer=transfer;state.drawingOrder=slots().map(s=>s.id);files.push(new File([portableJSON()],'scene.json',{type:'application/json'}));await saveEditorFiles(files,filename('-drawings.zip'),signal);status('Drawing ZIP downloaded.');});
async function referenceSet(signal){
 if(!film){await prepareDrawings(signal);return {slots:slots(),refs:state.refs,width:dimensions(p())[0],height:dimensions(p())[1]};}
 const candidate=await prepareFilm(signal,{fresh:true}),refs={};await renderSequenceReferences(candidate,{format:'png',signal,onProgress:pipelineProgress,emit:async(name,blob)=>{if(!name.startsWith('references/'))return;const index=Number(name.match(/(\d+)\.png$/)[1])-1,slot=candidate.drawingSlots[index],scene=candidate.shots.find(s=>s.id===slot.shotId).scene;refs[slot.id]=blob;scene.refs??={};scene.thumbs??={};scene.refs[slot.slotId]=blob;scene.thumbs[slot.slotId]=await thumbnail(blob);if(scene.drawingSlots[0].id===slot.slotId)scene.shotThumbnail=scene.thumbs[slot.slotId];}});signal.throwIfAborted();await adoptSequence(candidate);return {slots:candidate.drawingSlots,refs,width:candidate.width,height:candidate.height};
}
$('#psd').onclick=()=>run('Building the layered drawing library…',async signal=>{const set=await referenceSet(signal);if(set.slots.length>23)throw Error('For more than 23 drawings, use PNG ZIP.');await saveEditorFiles([new File([await layeredPSD(set.slots,set.refs,set.width,set.height)],filename('-references.psd')),new File([portableJSON()],film?'sequence.json':'scene.json',{type:'application/json'})],filename('-references.zip'),signal);status('PSD and JSON saved.');});
$('#contact-sheet').onclick=()=>run('Preparing contact sheet…',async signal=>{const set=await referenceSet(signal);if(set.slots.length>200)throw Error('For more than 200 drawings, use PNG ZIP.');const c=document.createElement('canvas');c.width=1200;c.height=Math.ceil(set.slots.length/4)*350;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);for(const [i,s]of set.slots.entries()){signal.throwIfAborted();const img=await decodeImage(set.refs[s.id]),x=i%4*300,y=Math.floor(i/4)*350,scale=Math.min(280/img.naturalWidth,302/img.naturalHeight),w=img.naturalWidth*scale,h=img.naturalHeight*scale;ctx.drawImage(img,x+(300-w)/2,y,w,h);ctx.fillStyle='black';ctx.font='bold 22px Arial';ctx.fillText(String(i+1),x+140,y+332);}const blob=await new Promise(r=>c.toBlob(r));await saveEditorFiles([new File([blob],filename('-contact-sheet.png'),{type:'image/png'})],filename('-contact-sheet.png'),signal);status('Contact sheet saved.');});
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
 try{requireClip();if(slots().some(s=>!state.art[s.id]))throw Error('Import this shot’s drawings before recording.');recordingUI(true);$('#stop-recording').disabled=true;mic=await microphone();$('#stop-recording').disabled=false;$('#countdown').hidden=false;
  for(let n=3;n>0;n--){if(!recordingActive||attempt!==recordingToken)return;$('#countdown').textContent=n;await new Promise(r=>setTimeout(r,1000));}
  if(!recordingActive||attempt!==recordingToken)return;$('#countdown').hidden=true;mic.start();await play({silent:true,fromStart:true,onEnd:()=>stopRecording().catch(e=>status(e.message,true))});
 }catch(e){if(attempt!==recordingToken)return;mic?.cancel();mic=null;recordingUI(false);status(e.message,true);}
};
$('#stop-recording').onclick=()=>stopRecording().catch(e=>status(e.message,true));
$('#export').onclick=()=>run('Preparing finished animation…',exportClip);
$('#share-video').onclick=()=>{if(finalBlob)shareFiles([new File([finalBlob],filename('.mp4'),{type:'video/mp4'})]).catch(e=>status(e.message,true));};$('#download-video').onclick=()=>{if(finalBlob)download(finalBlob,filename('.mp4'));};
$('#save-project').onclick=()=>{if(animationEditor&&!animationEditor.finishEdits())return;return run('Preparing project backup…',async()=>{await flushSave();download(await packProject(saveFilmState(state,film)),filename('-project.zip'));status('Backup downloaded. It contains your scene, drawings, and sound.');});};
$('#export-config').onclick=()=>{
 if(animationEditor&&!animationEditor.finishEdits())return;
 try{download(new Blob([portableJSON()],{type:'application/json'}),filename(film?'-sequence.json':'-scene.json'));status('JSON exported.');}catch(e){status(e.message,true);}
};
$('#example-config').onclick=()=>download(new Blob([JSON.stringify(exampleConfig,null,2)+'\n'],{type:'application/json'}),'example-scene.json');
async function prepareArtThumbs(candidate,signal){for(const scene of candidate.kind==='sequence'?candidate.shots.map(s=>s.scene):[candidate]){scene.artThumbs={};for(const [id,blob]of Object.entries(scene.art||{})){signal?.throwIfAborted();scene.artThumbs[id]=await thumbnail(blob);}scene.shotThumbnail=Object.values(scene.artThumbs)[0]||scene.shotThumbnail;}}
async function loadDocument(text,artwork,signal){
 const options={signal,onProgress:pipelineProgress,allowNewDrawings:!artwork.length};
 let candidate=text?(isSequenceDocument(text)?await prepareSequence(text,options):await prepareScene(text,options)):film?filmSequence():{...state,clip,transfer:currentTransfer(),drawingSlots:currentDrawingSlots()};
 if(artwork.length)candidate=await(candidate.kind==='sequence'?attachSequenceArtwork(candidate,artwork,options):attachArtwork(candidate,artwork,options));
 await prepareArtThumbs(candidate,signal);signal.throwIfAborted();if(animationEditor&&!animationEditor.finishEdits())return;
 await flushSave();signal.throwIfAborted();if(candidate.kind==='sequence')await adoptSequence(candidate,{keepView:false});else await restore({...stateFromScene(candidate),video:null});
 pendingArtwork=[];showTab(artwork.length?'finish':'stage');$('#show-art').checked=!!artwork.length;await renderPreview();await flushSave();status(artwork.length?'Drawings loaded. Ready to export.':candidate.needsReferences?'Scene changed. Create new references.':'JSON scene loaded.');
}
$('#load-config').onchange=e=>{
 const files=[...e.target.files];e.target.value='';if(!files.length)return;
 return run('Loading JSON…',async signal=>{
  const configs=files.filter(f=>/\.json$/i.test(f.name)),media=files.filter(f=>!configs.includes(f));
  if(configs.length>1)throw Error('Choose one JSON, or use Batch for multiple animations.');
  if(!configs.length&&animationEditor&&!animationEditor.finishEdits())return;
  if(!configs.length&&!clip&&!film){pendingArtwork=media;status('Drawings selected. Open the scene JSON to continue.');return;}
  if(configs[0]?.size>5_000_000)throw Error('Config file exceeds 5 MB.');
  await loadDocument(configs.length?await configs[0].text():null,media.length?media:pendingArtwork,signal);
 });
};
$('#editor-mode').onclick=()=>setWorkspace('editor');$('#batch-mode-button').onclick=()=>setWorkspace('batch');
$('#agent-workspace-link').onclick=event=>{
 if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
 const href=event.currentTarget.href;
 event.preventDefault();
 if(busy||recordingActive){status('Finish or cancel the current task before opening the agent workspace.',true);return;}
 if(animationEditor&&!animationEditor.finishEdits())return;
 return run('Saving before opening the agent workspace…',async()=>{await flushSave();location.assign(href);});
};
const backupMenu=$('#backup-menu');
document.addEventListener('pointerdown',event=>{if(backupMenu.open&&!backupMenu.contains(event.target))backupMenu.open=false;});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&backupMenu.open){backupMenu.open=false;backupMenu.querySelector('summary').focus();}});
$('#editor-output').hidden=!globalThis.showDirectoryPicker;
$('#editor-output').onclick=async()=>{try{editorOutput=await showDirectoryPicker({id:'animation-editor-output',mode:'readwrite'});$('#editor-output-label').textContent=editorOutput.name;$('#editor-reset-output').hidden=false;}catch(e){if(e.name!=='AbortError')status(e.message,true);}};
$('#editor-reset-output').onclick=()=>{editorOutput=null;$('#editor-output-label').textContent='Downloads';$('#editor-reset-output').hidden=true;};
batchUI=setupBatch({run,status,onProgress:value=>{$('#progress').value=value;}});
$('#open-project').onchange=e=>run('Opening project…',async()=>{const f=e.target.files[0];if(f){if(animationEditor&&!animationEditor.finishEdits())return;await flushSave();await restore(await unpackProject(f));$('.project-tools details').open=false;if(!state.video)status('Project restored.');}e.target.value='';});
$('#new').onclick=()=>{if(animationEditor&&!animationEditor.finishEdits())return;return run('Starting a new clip…',async()=>{await flushSave();await restore({project:newProject()});imports=[];order=[];renderImports();undo=[];redo=[];showTab('stage');status('New clip. Defaults restored; your previous clip is saved.');});};
$('#duplicate').onclick=()=>{if(animationEditor&&!animationEditor.finishEdits())return;return run('Duplicating this scene…',async()=>{await flushSave();if(film){const saved=saveFilmState(state,film);saved.film.id=uid();saved.film.title+=' copy';await restore(saved);}else{const project=structuredClone(p());project.id=uid();project.title+=' copy';await restore({...state,project});}showTab('stage');status('Project duplicated.');});};
function speechSignature(project){return JSON.stringify([project.rate,project.lines.map(l=>[l.id,l.actor,l.text,l.rate])]);}
function travelHistory(from,to){if(!from.length)return;const previousSpeech=speechSignature(p());clearDrawingVideo();to.push(snapshot());state.project=JSON.parse(from.pop());lastHistory=snapshot();if(previousSpeech!==speechSignature(p()))state.takes={};recompile();time=Math.min(time,currentDuration());animationEditor?.resetDraft();animationEditor?.clearAction();referenceFiles=[];invalidateVideo();populate();save();renderPreview().catch(e=>status(e.message,true));status(clip?'Edit restored.':'Edit restored. Generate dialogue to refresh timing.');}
$('#undo').onclick=()=>travelHistory(undo,redo);$('#redo').onclick=()=>travelHistory(redo,undo);
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(recordingActive)stopRecording().catch(e=>status(e.message,true));stopPlayback();flushSave().catch(()=>{});}});
window.addEventListener('pagehide',()=>{stopPlayback();flushSave().catch(()=>{});});

animationEditor=new AnimationEditor({align:(actor,target)=>alignPose([actor],target,{draft:true}),project:p,clip:()=>clip,time:()=>time,seek:at=>{stopPlayback();time=Math.max(0,Math.min(currentDuration(),at));renderPreview().catch(e=>status(e.message,true));},change:project=>{validateProject(project);if(animationSettings(project).mode==='silent'||Object.keys(state.takes).length)compileClip(project,state.takes,project.slots);state.project=project;changed();renderProps();},preview:()=>renderPreview().catch(e=>status(e.message,true)),error:message=>status(message,true)});
async function stashShot(){if(animationEditor&&!animationEditor.finishEdits())return false;await captureShotThumbnail();if(film)updateFilmShot(film,state);await flushSave();return true;}
function shotTask(label,action){return run(label,async()=>{if(!await stashShot())return;await action();filmViewCache=null;clearDrawingVideo();clearExport();refreshStats();renderAssigned();await renderPreview();await flushSave();status('');});}
shotUI=setupShotStrip({getFilm:()=>film,getState:()=>state,
 select:id=>{if(!film||id===film.activeId)return;return shotTask('Opening shot…',async()=>{film.activeId=id;await restore(film.shots.find(s=>s.id===id).state,{keepFilm:true});if(filmScope())filmTime=(filmView()?.shots.find(s=>s.id===id)?.startFrame||0)/24;});},
 add:()=>shotTask('Adding shot…',async()=>{film??=createFilm(state);const project=structuredClone(p());project.id=uid();project.title=`Shot ${film.shots.length+1}`;project.lines=[];project.slots=[];project.overrides=[];project.animation={...project.animation,mode:'silent',duration:3,keys:[]};project.audioMode='silent';const shot=addFilmShot(film,{project});await restore(shot.state,{keepFilm:true});}),
 duplicate:()=>shotTask('Duplicating shot…',async()=>{film??=createFilm(state);const saved=captureShot(state);saved.project.id=uid();saved.project.title+=' copy';const shot=addFilmShot(film,saved);await restore(shot.state,{keepFilm:true});}),
 remove:()=>shotTask('Removing shot…',async()=>{const index=film.shots.findIndex(s=>s.id===film.activeId),handoff=structuredClone(film.handoff),shot=removeFilmShot(film,film.activeId);removedFilm={filmId:film.id,index,shot,handoff};await restore(film.shots.find(s=>s.id===film.activeId).state,{keepFilm:true});}),
 move:direction=>shotTask('Reordering shots…',async()=>{moveFilmShot(film,film.activeId,direction);}),
 undo:()=>shotTask('Restoring shot…',async()=>{if(!removedFilm||removedFilm.filmId!==film?.id)return;if(film.shots.length>=20)throw Error('Remove a shot before restoring this one.');const previous=removedFilm;removedFilm=null;film.shots.splice(Math.min(previous.index,film.shots.length),0,previous.shot);film.activeId=previous.shot.id;film.handoff=previous.handoff;await restore(previous.shot.state,{keepFilm:true});}),
 rename:title=>{if(!film)return;p().title=title;film.shots.find(s=>s.id===film.activeId).title=title;filmViewCache=null;remember();refreshShots();save();}
});
populate();lastHistory=snapshot();
try{
 stage=new Stage($('#stage-canvas'),camera=>{for(const[k,v]of Object.entries(camera)){const bounds={azimuth:[-180,180],elevation:[-45,75],zoom:[.4,3],targetX:[-3,3],targetY:[0,3]}[k];p().scene.camera[k]=Math.max(bounds[0],Math.min(bounds[1],Math.round(v*100)/100));}populate();changed();});
 const stored=await loadState();if(stored){await run('Loading…',()=>restore(stored));$('#saved').textContent='Saved';if(!state.video)status('Project restored.');}else{await renderPreview();status('');save();}
}catch(e){status(e.message,true);$('#saved').textContent='Use Save backup to protect your work';if(stage)renderPreview().catch(e=>status(e.message,true));}

if(new URL(location.href).searchParams.has('agentImport')){await run('Opening agent scene…',async signal=>{const raw=sessionStorage.getItem('goosnav-agent-import-v1');if(!raw)throw Error('Agent scene is missing. Open it from the Agent workspace again.');const data=JSON.parse(raw);if(data.version!==1||typeof data.text!=='string'||data.text.length>5_000_000)throw Error('Invalid agent scene.');await loadDocument(data.text,[],signal);sessionStorage.removeItem('goosnav-agent-import-v1');const url=new URL(location.href);url.searchParams.delete('agentImport');history.replaceState(null,'',url);});}
