import {MODELS,MODEL_LABELS,POSES,CHAIRS,BACKDROPS,MOUTHS} from './core.mjs';
import {ACTOR_CHANNELS,PROP_CHANNELS,MOTION_PRESETS} from './motion.mjs';
import {EMOTIONS} from './emotions.mjs';
import {agentInstructions} from './agent-workflow.mjs';
import {SEQUENCE_LIMITS} from './sequence-config.mjs';
import {ACTOR_SECTIONS,PROP_SECTIONS} from './pose-sections.mjs';

export const LIMITS=Object.freeze({jsonBytes:SEQUENCE_LIMITS.bytes,shots:SEQUENCE_LIMITS.shots,sequenceSeconds:SEQUENCE_LIMITS.seconds,sceneSeconds:120,drawings:SEQUENCE_LIMITS.drawings,operations:100,previewImages:12,previewDimension:1024,previewMinDimension:128,contactSheetPixels:8_000_000});
const range=(min,max,extra={})=>({type:'number',min,max,...extra});
export const CAMERA=Object.freeze({projection:{enum:['perspective','orthographic']},azimuth:range(-180,180),elevation:range(-45,75),zoom:range(.4,3),targetX:range(-3,3),targetY:range(0,3)});
export const COMMANDS=Object.freeze({
 help:{arguments:'none',description:'Read the default reference-production workflow and list commands.'},
 instructions:{arguments:'none',description:'Read the default script, composition, visual review, reference export and file-delivery workflow. User instructions take precedence.'},
 status:{arguments:'none',description:'Return revision, progress, errors and image metadata without image bytes.'},
 validate:{arguments:'none',description:'Validate the accepted document and review adjacent-shot coverage warnings without generating speech.'},
 preview:{arguments:'JSON options object (optional)',description:'Render PNG images and a contact sheet. Options: samples [{shotId,time}], maxDimension, contactSheet.'},
 patch:{arguments:'JSON array of {op:"set",path:"/JSON/pointer",value}',description:'Atomically apply up to 100 precise edits. Existing parent paths are required.'},
 frame:{arguments:'JSON object {shotId?,actors?:[0,1],region?:"body"|"head",padding?:0.05,time?:0}',description:'Fit a front camera to rendered model geometry. Preserve actors, dialogue and animation.'},
 reset:{arguments:'JSON object {shotId?,target:"actor:0"|"actor:1"|"prop:<id>"|"camera",section?,scope?:"scene"|"key"|"timeline",time?:0}',description:'Reset one numeric section. Scene scope changes the base; key scope resets one pose; timeline removes only this section throughout the animation. Held pose and expression stay selected. Camera uses scene scope.'},
 align:{arguments:'JSON object {shotId?,actors?:[0,1],target?:"partner"|"camera"|{point:[x,y,z]},turnBody?:true,scope?:"key"|"scene",time?:0}',description:'Author a one-shot gaze alignment from actual posed face geometry. Body may turn minimally to avoid neck strain. Default key scope; no persistent tracking.'},
 exportJSON:{arguments:'none',description:'Return the accepted JSON document.'},
 cancel:{arguments:'none',description:'Cancel the current preview, framing or alignment job.'},
});

/** A fresh compact catalog: enums and articulated channels come from the renderer's own definitions. */
export function capabilities(){
 const actions=Object.entries(MOTION_PRESETS).map(([id,preset])=>({id,label:preset.label,group:preset.group,defaultDuration:preset.duration,parameters:{actor:{enum:[0,1]},time:range(0,120),duration:range(.2,60),strength:range(.25,2),options:preset.group==='Partner'?{partner:{enum:[0,1],description:'A different visible actor'}}:preset.group==='Book'?{prop:{type:'string',description:'Existing book prop ID'}}:{}}}));
 actions.push({id:'walk',label:'Walk',parameters:{actor:{enum:[0,1]},time:range(0,120),options:{steps:range(1,12,{type:'integer'}),stride:range(.1,1),cadence:range(.5,6),direction:range(-180,180),inPlace:{type:'boolean'}}}});
 return structuredClone({
  version:1,workflow:agentInstructions(),module:'/agent-api.mjs',workspace:'/agent.html',formats:['goosnav-animation-config','goosnav-animation-sequence'],fps:24,limits:LIMITS,
  models:MODELS.map(id=>({id,label:MODEL_LABELS[id]||id})),poses:POSES,chairs:CHAIRS,backdrops:BACKDROPS,
  emotions:Object.fromEntries(Object.entries(EMOTIONS).map(([id,e])=>[id,e.label||id])),mouths:MOUTHS,props:['book','cube','sphere','prism','goose'],
  parameters:{camera:CAMERA,actor:ACTOR_CHANNELS,prop:PROP_CHANNELS,
   scene:{format:{enum:['portrait','landscape'],default:'portrait',description:'Reels, 1080 × 1920 (9:16). Use landscape only when requested.'},style:{enum:['flat','line']},count:{enum:[1,2]}},
   timing:{mode:{enum:['silent','speech']},duration:range(0,120,{description:'Silent scenes require at least 0.5 seconds.'}),drawings:{enum:[3,5,9]}},
   dialogue:{actor:{enum:[0,1]},text:{type:'string',maxLength:1000},rate:range(.5,2),pause:range(0,10),pose:{enum:['keep',...POSES]},headYaw:range(-75,75),blink:{type:'boolean'},smear:{type:'boolean'},emotion:{enum:Object.keys(EMOTIONS)}},
   audio:{mode:{enum:['robot','silent','recording']},offset:range(-120,120),trimStart:range(0,120),trimEnd:range(0,120)},
   key:{target:{description:'actor:0, actor:1 or prop:<existing-ID>'},time:range(0,120),transition:{enum:['auto','ease','hold','wipe']},values:{description:'Actor or prop channel names and numeric values from this catalog.'}}
  },poseSections:{actor:ACTOR_SECTIONS,prop:PROP_SECTIONS},actions,commands:COMMANDS,operations:['agentInstructions','inspectDocument','editDocument','resetDocument','alignDocument','frameDocument','previewDocument','createAgentWorkspace'],
  api:{
   inspectDocument:{text:'Scene or sequence JSON string; no speech or rendering',returns:'Inspection and warnings; sequences include coverage.cuts with similar flags for near-identical adjacent cameras/cast.'},
   editDocument:{text:'JSON string',operations:'1–100 {op:"set",path:<absolute JSON pointer>,value:<JSON value>} objects; existing parents required'},
   previewDocument:{text:'JSON string',options:{samples:'1–12 {shotId?:string,time?:number} entries; multi-shot documents require shotId',maxDimension:range(128,1024,{type:'integer',default:640}),contactSheet:{type:'boolean',default:true},signal:'Optional AbortSignal',onProgress:'Optional ({phase,progress}) callback'},returns:'PNG data URLs plus shot/time/drawing identity, composition diagnostics and diagnostics.gaze face vectors/partner angular residuals'},
   frameDocument:{text:'JSON string',options:{shotId:'Required for multi-shot documents',actors:'Array of existing visible actor indices; default all',region:{enum:['head','body'],default:'body'},padding:range(0,.35,{default:.05}),time:range(0,120,{default:0}),signal:'Optional AbortSignal',onProgress:'Optional ({phase,progress}) callback'},returns:'Validated JSON text with only the chosen camera changed; front view with original projection'},
   resetDocument:{text:'JSON string',options:{shotId:'Required for multi-shot documents',target:'actor:0, actor:1, prop:<existing-ID> or camera',section:'ID from poseSections.actor or poseSections.prop; camera may omit it',scope:{enum:['scene','key','timeline'],default:'scene'},time:range(0,120,{default:0})},returns:'Atomic validated text, inspection and warnings. Timeline head reset also clears selected actor dialogue head turns; unrelated fields, audio and handoff metadata survive.'},
   alignDocument:{text:'JSON string',options:{shotId:'Required for multi-shot documents',actors:'Unique visible actor indices; default all',target:'partner (default), camera or {point:[x,y,z]} with finite safe world coordinates',turnBody:{type:'boolean',default:true},scope:{enum:['key','scene'],default:'key'},time:range(0,120,{default:0}),signal:'Optional AbortSignal',onProgress:'Optional ({phase,progress}) callback'},returns:'Validated text, inspection, warnings and alignment {shotId,actors,target,turnBody,scope,time,changes,diagnostics}. One-shot offsets only; no persistent gaze lock.'},
  },
  diagnostics:{coverage:'Sequence inspection warns about near-identical adjacent views. This is an advisory camera/cast/staging heuristic; compare rendered cut boundaries. A nonadjacent return wide is allowed.',visibility:'Visible actor/head pixels measured by an occlusion-aware flat-color render. Bounds are projections of the posed model geometry.',gaze:'Actual posed face origins, forward/up vectors and partner angular residuals. A partner residual is not the intended target for camera address, reading or motivated look-away beats.',limitations:'Pixel counts, framing bounds and gaze residuals do not judge expression, readability or artistic quality. Inspect the PNG images.'}
 });
}
