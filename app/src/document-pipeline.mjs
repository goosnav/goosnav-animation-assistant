import {isSequenceDocument} from './sequence-config.mjs';
import {prepareScene,attachArtwork,sceneJSON,renderReferences,renderAnimation} from './pipeline.mjs';
import {prepareSequence,attachSequenceArtwork,sequenceJSON,renderSequenceReferences,renderSequenceAnimation} from './sequence.mjs';

const sequence=document=>document?.kind==='sequence';

/** Dispatch portable documents without changing the single-scene API. */
export function prepareDocument(text,options){return isSequenceDocument(text)?prepareSequence(text,options):prepareScene(text,options);}
export function documentJSON(document){return sequence(document)?sequenceJSON(document):sceneJSON(document);}
export function attachDocumentArtwork(document,files,options){return sequence(document)?attachSequenceArtwork(document,files,options):attachArtwork(document,files,options);}
export function renderDocumentReferences(document,options){return sequence(document)?renderSequenceReferences(document,options):renderReferences(document,options);}
export function renderDocumentAnimation(document,options){return sequence(document)?renderSequenceAnimation(document,options):renderAnimation(document,options);}

/** One source folder produces one scene or a complete multi-shot film. */
export async function processDocumentJob(job,{mode='auto',referenceFormat='mp4',signal,onProgress,emit}={}){
 signal?.throwIfAborted();if(job?.error)throw Error(job.error);
 if(!['auto','references','animation'].includes(mode))throw Error('Invalid generation mode.');
 if(typeof job?.config?.text!=='function')throw Error('Missing scene or sequence JSON configuration.');
 if(typeof emit!=='function')throw Error('An output destination is required.');
 const files=job.artwork??[],finish=mode==='animation'||mode==='auto'&&files.length>0,text=await job.config.text();signal?.throwIfAborted();
 const document=await prepareDocument(text,{signal,onProgress,newReferences:!finish});
 const summary={drawings:document.drawingSlots.length,duration:sequence(document)?document.duration:document.clip.duration,...(sequence(document)?{shots:document.shots.length}:{})};
 if(finish){
  const ready=await attachDocumentArtwork(document,files,{signal,onProgress}),video=await renderDocumentAnimation(ready,{signal,onProgress});
  signal?.throwIfAborted();await emit('animation.mp4',video);signal?.throwIfAborted();await emit(sequence(ready)?'sequence.json':'scene.json',new Blob([documentJSON(ready)],{type:'application/json'}));
  return {kind:'animation',...summary};
 }
 await renderDocumentReferences(document,{format:referenceFormat,signal,onProgress,emit});return {kind:'references',...summary};
}
