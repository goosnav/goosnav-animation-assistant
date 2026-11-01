import {slotAt} from './core.mjs';
import { ACTOR_CHANNELS, PROP_CHANNELS, animationSettings, targetValues, addGesture, addWalk, MOTION_PRESETS } from './motion.mjs';

const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const propLabel=(prop,index)=>`${prop.kind==='book'?'Goosnav book':prop.kind[0].toUpperCase()+prop.kind.slice(1)} ${index+1}`;
const copy=p=>structuredClone(p);
const uid=()=>crypto.randomUUID();
const field=(key,c,value)=>`<label>${esc(c.label)}<input type="number" data-motion-channel="${key}" min="${c.min}" max="${c.max}" step="${c.step}" value="${Number(value??c.default??0).toFixed(c.step<1?2:0)}"><input type="range" data-motion-range="${key}" min="${c.min}" max="${c.max}" step="${c.step}" value="${value??c.default??0}"></label>`;

export class AnimationEditor{
 constructor({project,clip,time,seek,change,preview,error}){
  Object.assign(this,{project,clip,time,seek,change,preview,error});this.target='actor:0';this.draft=null;this.selected=null;this.dirty=false;
  $('#timing-mode').onchange=e=>{const p=copy(project()),a=animationSettings(p);p.animation={...a,mode:e.target.value,duration:e.target.value==='silent'?Math.min(120,Math.max(5,...a.keys.map(k=>k.time+1/24))):0};p.audioMode=e.target.value==='silent'?'silent':'robot';this.commit(p);};
  $('#clip-length').onchange=e=>{const p=copy(project()),a=animationSettings(p),duration=Number(e.target.value),last=Math.max(0,...a.keys.map(k=>k.time));if(duration<last){error(`The last key is at ${last.toFixed(2)} s. Move or remove later keys before shortening the clip.`);this.refresh();return;}p.animation={...a,duration};this.commit(p);};
  $('#motion-drawings').onchange=e=>{const p=copy(project());p.animation={...animationSettings(p),drawings:Number(e.target.value)};this.commit(p);};
  $('#motion-target').onchange=e=>{const next=e.target.value;if(!this.finishEdits()){$('#motion-target').value=this.target;return;}this.target=next;this.resetDraft();this.refresh();preview();};
  const scrub=e=>{const value=Number(e.target.value);if(!Number.isFinite(value)||Math.abs(value-time())<1e-7)return;if(!this.finishEdits())return;this.resetDraft();seek(value);this.refreshFields();};
  $('#animation-scrub').oninput=scrub;$('#key-time').onchange=scrub;
  $('#key-list').onclick=e=>{const button=e.target.closest('[data-key-id]');if(!button)return;if(!this.finishEdits())return;const key=animationSettings(project()).keys.find(k=>k.id===button.dataset.keyId);if(!key)return;this.selected=key.id;this.target=key.target;this.draft={...targetValues(project().scene,key.target),...key.values};this.dirty=false;$('#key-transition').value=key.transition;seek(key.time);this.refresh();preview();};
  $('#speech-beats').onclick=e=>{const button=e.target.closest('[data-beat-time]');if(button){if(!this.finishEdits())return;this.resetDraft();seek(Number(button.dataset.beatTime));this.refreshFields();}};
  $('#motion-fields').oninput=e=>{const key=e.target.dataset.motionChannel||e.target.dataset.motionRange;if(!key)return;const channel=this.channels()[key],value=Number(e.target.value);if(e.target.value===''||!Number.isFinite(value)||value<channel.min||value>channel.max)return;this.draft??=this.values();this.draft[key]=value;if(this.target.startsWith('actor:')){if(['x','y','z','yaw','headYaw','headPitch','headTilt'].includes(key))this.draft.noseContact=0;if(/^(thigh|knee|foot)[LR]$/.test(key))this.draft.footIK=0;if(['armL','armSideL','elbowL','handL'].includes(key))this.draft.contactLeft=0;if(['armR','armSideR','elbowR','handR'].includes(key)){this.draft.contact=0;if('noseGrip' in this.draft)this.draft.noseGrip=0;}}const paired=$(e.target.type==='range'?`[data-motion-channel="${key}"]`:`[data-motion-range="${key}"]`);if(paired)paired.value=value;this.dirty=true;this.draftUI();preview();};
  $('#key-transition').onchange=()=>{if(this.selected){this.dirty=true;this.draft??=this.values();this.draftUI();}};
  $('#set-key').onclick=()=>this.setKey();
  $('#key-position').onchange=e=>{const p=copy(project()),a=copy(animationSettings(p)),key=a.keys.find(k=>k.id===this.selected);if(!key)return;if(this.dirty){key.values={...this.values(),...this.draft};key.transition=$('#key-transition').value;}key.time=Math.round(Number(e.target.value)*p.fps)/p.fps;p.animation=a;try{this.change(p);seek(key.time);this.draft=null;this.dirty=false;this.refresh();}catch(e){error(e.message);this.refresh();}};
  $('#remove-key').onclick=()=>{const p=copy(project());p.animation={...animationSettings(p),keys:animationSettings(p).keys.filter(k=>k.id!==this.selected)};this.resetDraft();this.commit(p);};
  $('#discard-pose').onclick=()=>{this.resetDraft();this.refresh();preview();};
  $('#gesture-preset').onchange=()=>{this.actionDefaults();this.queueAction();};
  for(const id of ['action-duration','action-strength'])$('#'+id).oninput=()=>this.queueAction();
  $('#add-gesture').onclick=()=>this.addAction();
  $('#discard-action').onclick=()=>this.clearAction();
  $('#add-walk').onclick=()=>{
   if(!this.finishEdits())return;
   try{const next=addWalk(project(),this.target,time(),{steps:Number($('#walk-steps').value),stride:Number($('#walk-stride').value),cadence:Number($('#walk-cadence').value),direction:Number($('#walk-direction').value),inPlace:$('#walk-in-place').checked});this.resetDraft();this.commit(next);}catch(e){error(e.message);}
  };
 }
 queueAction(){this.pendingAction??={target:this.target,time:this.time()};$('#pending-action').hidden=false;$('#pending-action-label').textContent=`${MOTION_PRESETS[$('#gesture-preset').value].label} selected at ${this.pendingAction.time.toFixed(2)} s. Add it now, or continue to generate the whole motion automatically.`;}
 clearAction(){this.pendingAction=null;$('#pending-action').hidden=true;}
 addAction(){
  if(this.dirty&&!this.setKey())return false;
  try{
   const next=addGesture(this.project(),this.pendingAction?.target??this.target,$('#gesture-preset').value,this.pendingAction?.time??this.time(),{duration:Number($('#action-duration').value),strength:Number($('#action-strength').value)});
   this.change(next);this.clearAction();this.resetDraft();this.refresh();return true;
  }catch(e){this.error(e.message);return false;}
 }
 finishEdits(){if(this.pendingAction&&!this.addAction())return false;return !this.dirty||this.setKey();}
 actionDefaults(){const action=MOTION_PRESETS[$('#gesture-preset').value];if(action)$('#action-duration').value=action.duration;this.actionAvailability();}
 actionAvailability(){const group=MOTION_PRESETS[$('#gesture-preset').value]?.group;$('#add-gesture').disabled=!this.target.startsWith('actor:')||group==='Partner'&&this.project().scene.count<2;$('#action-strength').closest('label').hidden=['Book','Partner'].includes(group);$('#action-strength').disabled=!this.target.startsWith('actor:')||['Book','Partner'].includes(group);}
 channels(){return this.target.startsWith('actor:')?ACTOR_CHANNELS:PROP_CHANNELS;}
 values(){return {...targetValues(this.clip()?slotAt(this.clip(),this.time()).state.scene:this.project().scene,this.target)};}
 commit(project){try{this.change(project);this.refresh();}catch(e){this.error(e.message);this.refresh();}}
 resetDraft(){this.selected=null;this.draft=null;this.dirty=false;this.draftUI();}
 draftUI(){document.querySelector('[data-view=animate]').classList.toggle('pose-draft',this.dirty);$('#discard-pose').hidden=!this.dirty;$('#set-key').textContent=this.selected?'Update keyframe':'Set keyframe';$('#remove-key').disabled=!this.selected;}
 setKey(){
  const p=copy(this.project()),a=animationSettings(p),at=Math.round(this.time()*p.fps)/p.fps;
  const existing=a.keys.find(k=>k.id===this.selected)||a.keys.find(k=>k.target===this.target&&Math.abs(k.time-at)<.5/p.fps);
  const key={id:existing?.id||uid(),target:this.target,time:at,values:this.draft||this.values(),transition:$('#key-transition').value};
  p.animation={...a,keys:[...a.keys.filter(k=>k.id!==key.id),key].sort((a,b)=>a.time-b.time)};
  try{this.change(p);this.selected=key.id;this.draft=null;this.dirty=false;this.refresh();return true;}catch(e){this.error(e.message);return false;}
 }
 // Set keyframe and navigation commit the visible draft; Discard pose abandons it.
 draftState(base){if(!this.draft)return base;const state=copy(base);if(this.target.startsWith('actor:'))Object.assign(state.scene.actors[Number(this.target.split(':')[1])],this.draft);else{const prop=state.scene.props?.find(p=>`prop:${p.id}`===this.target);if(prop)Object.assign(prop,this.draft);}delete state.motionWipes;delete state.smears;return state;}
 refreshFields(){
  const channels=this.channels(),values=this.draft||this.values();
  const groups=this.target.startsWith('actor:')?[
   ['Position',['x','y','z','yaw','scale']],['Head & body',['headYaw','headPitch','headTilt','bodyLean','bodyTurn']],['Left arm',['armL','armSideL','elbowL','handL','fingerCurlL','fingerPointL']],['Right arm',['armR','armSideR','elbowR','handR','fingerCurlR','fingerPointR']],['Legs',['thighL','kneeL','footL','thighR','kneeR','footR']],['Cartoon',['rootPitch','rootRoll','headSpin','headScale','handScale','armStretchR','flatten','burst','noseDetach']],
  ]:[['Position',['x','y','z']],['Rotation',['rx','ry','rz']],['Dimensions',['width','height','depth']],...(this.project().scene.props?.find(p=>`prop:${p.id}`===this.target)?.kind==='book'?[['Book',['open','page']]]:[])];
  if(this.fieldTarget===this.target&&$('#motion-fields').children.length){for(const input of document.querySelectorAll('[data-motion-channel],[data-motion-range]')){const key=input.dataset.motionChannel||input.dataset.motionRange,c=channels[key];if(document.activeElement!==input)input.value=Number(values[key]??c.default??0).toFixed(c.step<1?2:0);}this.draftUI();return;}
  this.fieldTarget=this.target;const open=new Set([...document.querySelectorAll('#motion-fields details[open]')].map(d=>d.dataset.group));
  $('#motion-fields').innerHTML=groups.map(([label,keys],i)=>`<details data-group="${label}" ${i===0||open.has(label)?'open':''}><summary>${label}</summary><div class="sliders">${keys.filter(k=>channels[k]).map(k=>field(k,channels[k],values[k])).join('')}</div></details>`).join('');
  this.draftUI();
 }
 refresh(){
  const p=this.project(),a=animationSettings(p),clip=this.clip();
  $('#timing-mode').value=a.mode;$('#clip-length-label').hidden=a.mode!=='silent';$('#clip-length').value=a.duration||5;$('#motion-drawings').value=a.drawings;
  const targets=p.scene.actors.slice(0,p.scene.count).map((_,i)=>[`actor:${i}`,`Character ${i?'B':'A'}`]).concat((p.scene.props||[]).map((v,i)=>[`prop:${v.id}`,propLabel(v,i)]));
  if(!targets.some(([id])=>id===this.target)){this.target='actor:0';this.resetDraft();}
  $('#motion-target').innerHTML=targets.map(([id,label])=>`<option value="${id}" ${id===this.target?'selected':''}>${esc(label)}</option>`).join('');
  $('#key-list').innerHTML=a.keys.filter(k=>k.target===this.target).sort((a,b)=>a.time-b.time).map(k=>`<button data-key-id="${esc(k.id)}" aria-label="Keyframe at ${k.time.toFixed(2)} seconds" aria-pressed="${k.id===this.selected}">${k.time.toFixed(2)} s</button>`).join('');
  $('#speech-beats').innerHTML=(clip?.lines||[]).map(l=>`<button data-beat-time="${l.start}" title="${esc(l.text)}">${l.actor?'B':'A'} · ${l.start.toFixed(2)} s · ${esc(l.text.slice(0,38))}</button>`).join('');
  $('#animation-prerequisite').hidden=!!clip;$('#animation-tools').hidden=!clip;
  const previousPreset=$('#gesture-preset').value,preset=previousPreset||'explain',groups=[...new Set(Object.values(MOTION_PRESETS).map(g=>g.group||'Gestures'))];
  $('#gesture-preset').innerHTML=groups.map(group=>`<optgroup label="${esc(group)}${group==='Partner'&&p.scene.count<2?' · 2 characters':''}" ${group==='Partner'&&p.scene.count<2?'disabled':''}>${Object.entries(MOTION_PRESETS).filter(([,g])=>(g.group||'Gestures')===group).map(([id,g])=>`<option value="${id}" ${id===preset?'selected':''}>${esc(g.label)}</option>`).join('')}</optgroup>`).join('');
  if(!previousPreset)this.actionDefaults();
  const isActor=this.target.startsWith('actor:');
  for(const id of ['add-gesture','gesture-preset','action-duration','action-strength','add-walk','walk-steps','walk-stride','walk-cadence','walk-direction','walk-in-place'])$('#'+id).disabled=!isActor;
  this.actionAvailability();$('#walking').hidden=!isActor;
  const walkTarget=`${p.id}:${this.target}`;if(this.walkTarget!==walkTarget&&isActor){this.walkTarget=walkTarget;$('#walk-direction').value=this.values().yaw;}

  const selected=a.keys.find(k=>k.id===this.selected);$('#key-position-label').hidden=!selected;if(selected)$('#key-position').value=selected.time.toFixed(3);this.refreshFields();this.clock();
 }
 clock(){const duration=this.clip()?.duration||animationSettings(this.project()).duration||5;$('#animation-scrub').max=duration;$('#animation-scrub').value=this.time();$('#key-time').max=duration;if(document.activeElement!==$('#key-time'))$('#key-time').value=this.time().toFixed(3);}
}
