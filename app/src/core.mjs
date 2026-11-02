import {ACTOR_CHANNELS,animationSettings,applyMotion,validateAnimation,validateProps,validateMotionWipes} from './motion.mjs';
import {EMOTIONS} from './emotions.mjs';
export const MOUTHS = ['rest', 'small', 'open', 'wide', 'round', 'teeth'];
export const MODELS = ['blue', 'blue-beady', 'rust', 'rust-beady', 'olive', 'olive-beady', 'billy', 'gooby',
  'v12', 'v12-beady', 'v12-fat', 'v12-fat-glasses', 'billy-v2'];
// Display names; models without one use their ID. The v12 people come from goosnav-3D-assets.
export const MODEL_LABELS = { 'v12': 'Guy v12', 'v12-beady': 'Guy v12 (beady)', 'v12-fat': 'Fat guy (v12)',
  'v12-fat-glasses': 'Fat guy with glasses (v12)', 'billy-v2': 'Little Billy v2' };
export const POSES = ['stand', 'point', 'shrug', 'open-hand', 'hands-on-hips', 'sitting'];
export const CHAIRS = {folding:'Folding metal chair',wood:'Wooden chair',stool:'Wooden stool'};
export const BACKDROPS = {
  none: {label:'Plain',sky:'#ffffff'},
  'black-pyramids': {label:'Black pyramids',sky:'#e8b897'},
  'red-mesas': {label:'Red mesas',sky:'#c8dce2'},
  space: {label:'Space',sky:'#111320'},
  backrooms: {label:'Backrooms',sky:'#d9d0a2'},
  'starter-overgrown-courtyard': {label:'Overgrown courtyard',sky:'#bdced2'},
  colonnade: {label:'Colonnade',sky:'#e9e4d7'},
  threshold: {label:'Threshold',sky:'#c8d1d5'},
};
export const uid = () => globalThis.crypto.randomUUID();
export function newProject() {
  const actor = (model, x, yaw) => ({ model, x, z: 0, yaw, scale: 1, pose: 'stand', headYaw: 0, headTilt: 0, armL: 0, armR: 0, handL: 0, handR: 0, nose: 0 });
  return { version: 1, id: uid(), title: 'An ordinary conversation', fps: 24, rate: 1,
    scene: { format: 'portrait', style: 'flat', background: '#ffffff', count: 2,
      camera: { projection: 'perspective', azimuth: 0, elevation: 5, zoom: 1, targetX: 0, targetY: 1 },
      actors: [actor('blue', -.45, 60), actor('rust-beady', .45, -60)] },
    lines: [{ id: uid(), actor: 0, text: 'I have a perfectly reasonable question.', rate: 1, pause: .35, pose: 'keep', headYaw: 0, blink: false },
      { id: uid(), actor: 1, text: 'That has never stopped you before.', rate: 1, pause: .5, pose: 'keep', headYaw: 0, blink: false }],
    overrides: [], slots: [], audioOffset: 0, audioTrimStart: 0, audioTrimEnd: 0, audioMode: 'robot' };
}
// Presets stage actors deliberately; Reset changes only the camera.
export function withFraming(project, kind) {
  if(!['solo','duet','close','wide','reset','ots-left','ots-right','three-point'].includes(kind))throw Error('Invalid framing');
  const p=structuredClone(project);
  p.scene.camera={projection:'perspective',azimuth:0,elevation:5,zoom:kind==='close'?1.75:kind==='wide'?.75:1,targetX:kind==='close'?p.scene.actors[0].x:0,targetY:kind==='close'?1.45:1};
  if(kind==='solo'){
    p.scene.count=1;Object.assign(p.scene.actors[0],{x:0,z:0,yaw:0});p.lines.forEach(l=>l.actor=0);
  }else if(kind==='duet'){
    p.scene.count=2;p.scene.actors.forEach((a,i)=>Object.assign(a,{x:i?.45:-.45,z:0,yaw:i?-60:60}));
  }else if(kind==='three-point'){
    Object.assign(p.scene.camera,{azimuth:25,elevation:18});p.guides={ground:true,backdrop:true};
  }else if(kind.startsWith('ots-')){
    const left=kind==='ots-left';Object.assign(p.scene.camera,{azimuth:left?-45:45,elevation:12,zoom:2.1,targetX:p.scene.actors[left?1:0].x*.55,targetY:1.25});
  }
  return validateProject(p);
}
function finite(n, min, max, name) { if (!Number.isFinite(n) || n < min || n > max) throw Error(`Invalid ${name}`); }
export function validateProject(p) {
  if (!p || p.version !== 1) throw Error('Unsupported project version');
  if (typeof p.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(p.id) || typeof p.title !== 'string' || p.title.length > 200) throw Error('Invalid project title or ID');
  if (![6,8,12,24].includes(p.fps)) throw Error('Invalid animation frame rate');
  finite(p.rate,.5,2,'speech rate');
  if(!['robot','silent','recording'].includes(p.audioMode))throw Error('Invalid audio mode');
  finite(p.audioOffset,-120,120,'audio offset');finite(p.audioTrimStart,0,120,'audio trim');finite(p.audioTrimEnd,0,120,'audio trim');
  if (!['portrait','landscape'].includes(p.scene?.format) || !['flat','line'].includes(p.scene?.style)) throw Error('Invalid scene format or style');
  if (!/^#[0-9a-f]{6}$/i.test(p.scene.background)) throw Error('Invalid background');
  if (p.scene.backdrop!==undefined&&(typeof p.scene.backdrop!=='string'||!Object.hasOwn(BACKDROPS,p.scene.backdrop)))throw Error('Invalid backdrop');
  if (p.guides!==undefined&&(!p.guides||Array.isArray(p.guides)||typeof p.guides!=='object'||Object.entries(p.guides).some(([k,v])=>!['ground','backdrop'].includes(k)||typeof v!=='boolean')))throw Error('Invalid reference guides');
  if (![1,2].includes(p.scene.count) || !Array.isArray(p.scene.actors) || p.scene.actors.length!==2) throw Error('Invalid characters');
  if (!['orthographic','perspective'].includes(p.scene.camera?.projection)) throw Error('Invalid camera');
  for(const [k,min,max] of [['azimuth',-180,180],['elevation',-45,75],['zoom',.4,3],['targetX',-3,3],['targetY',0,3]]) finite(p.scene.camera[k],min,max,`camera ${k}`);
  for (const a of p.scene.actors) {
    if (!MODELS.includes(a.model)||!POSES.includes(a.pose)) throw Error('Invalid character or pose');
    if(a.chair!==undefined&&!Object.hasOwn(CHAIRS,a.chair))throw Error('Invalid character chair');
    if(a.emotion!==undefined&&!Object.hasOwn(EMOTIONS,a.emotion))throw Error('Invalid character emotion');
    const required=['x','z','yaw','scale','headYaw','headTilt','armL','armR','handL','handR','nose'];
    for(const [k,d] of Object.entries(ACTOR_CHANNELS))if(required.includes(k)||a[k]!==undefined)finite(a[k],d.min,d.max,k);
  }
  validateProps(p.scene);validateAnimation(p);
  if (!Array.isArray(p.lines)||p.lines.length>30) throw Error('Use at most 30 lines');
  const ids = new Set();
  for (const l of p.lines) {
    if (typeof l.id!=='string'||ids.has(l.id)) throw Error('Duplicate or missing line ID'); ids.add(l.id);
    if (![0,1].includes(l.actor)||l.actor>=p.scene.count||typeof l.text!=='string'||l.text.length>1000||l.text.includes('\0')) throw Error('Invalid dialogue');
    finite(l.rate,.5,2,'line rate');finite(l.pause,0,10,'pause');
    if (l.pose!=='keep'&&!POSES.includes(l.pose)) throw Error('Invalid line pose');
    if(l.emotion!==undefined&&!Object.hasOwn(EMOTIONS,l.emotion))throw Error('Invalid line emotion');
    finite(l.headYaw??0,-75,75,'line head turn');
    if(l.smear!==undefined&&typeof l.smear!=='boolean')throw Error('Invalid smear option');
  }
  if (!Array.isArray(p.overrides)||p.overrides.length>2000) throw Error('Invalid mouth edits');
  for(const o of p.overrides){finite(o.start,0,120,'mouth edit');finite(o.end,o.start,120,'mouth edit');if(![0,1].includes(o.actor)||!MOUTHS.includes(o.mouth))throw Error('Invalid mouth edit');}
  if(!Array.isArray(p.slots)||p.slots.length>2000)throw Error('Invalid drawing registry');
  const drawingIds=new Set();
  for(const s of p.slots){
    if(!s||typeof s.id!=='string'||!/^d[a-z0-9-]{1,64}$/.test(s.id)||drawingIds.has(s.id)||s.key!==JSON.stringify(s.state))throw Error('Invalid drawing identity');
    drawingIds.add(s.id);
    if(!Array.isArray(s.state?.mouths)||s.state.mouths.length!==2||s.state.mouths.some(m=>!MOUTHS.includes(m))||!Array.isArray(s.state.blinks)||s.state.blinks.length!==2||s.state.blinks.some(b=>typeof b!=='boolean'))throw Error('Invalid drawing state');
    validateMotionWipes(s.state);
    if(s.state.smears!==undefined){
      if(!Array.isArray(s.state.smears)||!s.state.smears.length||s.state.smears.length>2)throw Error('Invalid drawing smear');
      const actors=new Set();
      for(const smear of s.state.smears){
        if(!smear||![0,1].includes(smear.actor)||smear.actor>=s.state.scene?.count||actors.has(smear.actor)||!POSES.includes(smear.pose)||Object.keys(smear).some(k=>!['actor','pose','headYaw'].includes(k)))throw Error('Invalid drawing smear');
        finite(smear.headYaw,-75,75,'drawing smear');actors.add(smear.actor);
      }
    }
    const scene=structuredClone(s.state.scene);
    if(scene?.count===1&&scene.actors?.length===1)scene.actors.push(structuredClone(scene.actors[0]));
    try{validateProject({...p,scene,animation:undefined,slots:[],lines:[],overrides:[]});}catch{throw Error('Invalid drawing scene');}
  }
  return p;
}
export function withSpeechRate(project, rate) {
  const next=structuredClone(project);next.rate=rate;next.overrides=[];
  return validateProject(next);
}
export function upgradeTiming(project) {
  validateProject(project);
  const next=structuredClone(project);next.fps=24;
  return next;
}
export function dimensions(p) { return p.scene.format === 'portrait' ? [1080,1920] : [1920,1080]; }
export function phoneMouth(phone) {
  const p=phone.toLowerCase().replace(/[0-9]/g,'');
  if (['pau','sil','m','b','p'].includes(p)) return 'rest';
  if (['f','v'].includes(p)) return 'teeth';
  if (['uw','uh','ow','oy','w','r','er','ao'].includes(p)) return 'round';
  if (['iy','ey','y','s','z'].includes(p)) return 'wide';
  if (['aa','ae','ah','aw','ay'].includes(p)) return 'open';
  return 'small';
}
export function compileClip(project, takes = {}, previous = []) {
  validateProject(project);
  const animation=animationSettings(project),silent=animation.mode==='silent';
  const slots=previous.map(s=>({...s,active:false})), byKey=new Map(slots.map(s=>[s.key,s]));
  const lines=[]; let cursor=.3;
  for (const l of silent?[]:project.lines.filter(l=>l.text.trim())) {
    const take=takes[l.id]; if (!take?.phones?.length) throw Error('Generate speech before compiling the clip');
    finite(take.duration,Number.MIN_VALUE,120,'speech duration');
    if(!Array.isArray(take.phones)||take.phones.some(p=>typeof p.phone!=='string'||!Number.isFinite(p.start)||!Number.isFinite(p.end)||p.start<0||p.end<p.start||p.end>take.duration+.05))throw Error('Invalid speech phoneme timing');
    lines.push({...l,start:cursor,end:cursor+take.duration,take});cursor+=take.duration+l.pause;
  }
  if (!silent&&!lines.length) throw Error('Write at least one line of dialogue');
  // Include the destination drawing when the final key itself extends the clip.
  const lastKey=Math.max(0,...animation.keys.map(k=>k.time));
  const keyedDuration=animation.keys.length?Math.min(120,(Math.ceil(lastKey*project.fps-.5)+1)/project.fps):0;
  const duration=Math.max(silent?0:cursor+.5,animation.duration,keyedDuration);
  if (duration>120) throw Error('This clip exceeds two minutes. Split it into shorter clips.');
  // A pause blink has a closed mouth, so repeated accents reuse one drawing
  // instead of needing a new blink variant for each spoken mouth shape.
  const blinks=lines.filter(l=>l.blink&&l.pause>0).map(l=>{
    const duration=Math.min(3/project.fps,l.pause);
    return {actor:l.actor,start:l.end+(l.pause-duration)/2,end:l.end+(l.pause+duration)/2};
  });
  const totalFrames=Math.ceil(duration*project.fps), exposures=[];
  function frameState(f){
    const t=(f+.5)/project.fps, line=lines.find(l=>t>=l.start&&t<l.end);
    const state={scene:structuredClone(project.scene),mouths:['rest','rest'],blinks:[false,false]};
    if (line) {
      const age=t-line.start, phone=line.take.phones.find(p=>age>=p.start&&age<p.end);
      state.mouths[line.actor]=phone?phoneMouth(phone.phone):'rest';
      const a=state.scene.actors[line.actor];if(line.pose!=='keep')a.pose=line.pose;
      if(line.emotion!==undefined)a.emotion=line.emotion;
      a.headYaw=Math.max(-75,Math.min(75,a.headYaw+(line.headYaw??0)));
    }
    for(const blink of blinks)if(t>=blink.start&&t<blink.end)state.blinks[blink.actor]=true;
    for(const o of project.overrides) if(t>=o.start&&t<o.end) state.mouths[o.actor]=o.mouth;
    // Inactive actor values do not inflate the drawing library for solo scenes.
    state.scene.actors=state.scene.actors.slice(0,state.scene.count);
    return state;
  }
  const transitions=new Map();
  for(const line of lines.filter(l=>l.smear))for(const edge of ['start','end']){
    const boundary=Math.ceil(line[edge]*project.fps-.5);
    if(boundary<1||boundary>=totalFrames)continue;
    const from=frameState(boundary-1).scene.actors[line.actor],to=frameState(boundary).scene.actors[line.actor];
    if(from.pose===to.pose&&from.headYaw===to.headYaw)continue;
    const beforeTime=(boundary-.5)/project.fps;
    const quiet=!lines.some(l=>beforeTime>=l.start&&beforeTime<l.end);
    let frame=edge==='start'&&quiet?boundary-1:boundary;
    // A very short pause can already contain the preceding outgoing smear.
    if(frame!==boundary&&transitions.get(frame)?.has(line.actor))frame=boundary;
    if(!transitions.has(frame))transitions.set(frame,new Map());
    transitions.get(frame).set(line.actor,[from,to]);
  }
  for (let f=0; f<totalFrames; f++) {
    const state=frameState(f);
    if(transitions.has(f)){
      state.smears=[];
      for(const [actor,endpoints]of [...transitions.get(f)].sort(([a],[b])=>a-b)){
        // Reverse moves share the same in-between when their mouths match.
        endpoints.sort((a,b)=>{const x=JSON.stringify([a.pose,a.headYaw]),y=JSON.stringify([b.pose,b.headYaw]);return x<y?-1:x>y?1:0;});
        const [a,b]=endpoints;state.scene.actors[actor].pose=a.pose;state.scene.actors[actor].headYaw=a.headYaw;
        state.smears.push({actor,pose:b.pose,headYaw:b.headYaw});
      }
    }
    const sampleTime=(f+.5)/project.fps;
    applyMotion(state,project,duration===120&&f===totalFrames-1?Math.max(sampleTime,lastKey):sampleTime,project.fps);
    const key=JSON.stringify(state);let slot=byKey.get(key);
    if(!slot){
      if(slots.length>=2000)throw Error('Drawing library exceeds 2000 drawings. Use fewer keys or fewer drawings per move, or start a new clip.');
      slot={id:`d${uid()}`,key,state};byKey.set(key,slot);slots.push(slot);
    }
    slot.active=true;
    const last=exposures.at(-1);
    if(last?.slotId===slot.id)last.endFrame=f+1;else exposures.push({slotId:slot.id,startFrame:f,endFrame:f+1});
  }
  return {fps:project.fps,totalFrames,duration:totalFrames/project.fps,slots,exposures,lines:lines.map(({take,...l})=>l)};
}
export function slotAt(clip,time){
  const frame=Math.min(clip.totalFrames-1,Math.max(0,Math.floor(time*clip.fps)));
  const e=clip.exposures.find(e=>frame>=e.startFrame&&frame<e.endFrame);
  return clip.slots.find(s=>s.id===e?.slotId);
}
export function toggleSelection(order,id){ return order.includes(id)?order.filter(x=>x!==id):[...order,id]; }
