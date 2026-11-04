import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../app/src/document-pipeline.mjs';
const scene={format:'goosnav-animation-config',version:1,timing:{mode:'silent',duration:.5}};
const sequence={format:'goosnav-animation-sequence',version:1,id:'film',title:'Film',shots:[{id:'a',title:'A',config:scene},{id:'b',title:'B',config:scene}]};

test('generic document preparation and export preserve scene compatibility and all sequence shots',async()=>{
 assert.equal(typeof api.prepareDocument,'function');
 const single=await api.prepareDocument(JSON.stringify(scene)),film=await api.prepareDocument(JSON.stringify(sequence));
 assert.equal(single.clip.totalFrames,12);assert.equal(film.totalFrames,24);assert.equal(film.shots.length,2);
 assert.equal(JSON.parse(api.documentJSON(single)).format,'goosnav-animation-config');assert.equal(JSON.parse(api.documentJSON(film)).format,'goosnav-animation-sequence');
});

test('document jobs reject malformed modes, source errors, missing configs and pre-aborted work before output',async()=>{
 assert.equal(typeof api.processDocumentJob,'function');
 const emitted=[],options={emit:(name)=>emitted.push(name)},job={config:new File([JSON.stringify(sequence)],'sequence.json'),artwork:[]};
 await assert.rejects(api.processDocumentJob(job,{...options,mode:'unknown'}),/mode/);
 await assert.rejects(api.processDocumentJob({...job,error:'Folder failed'},options),/Folder failed/);
 await assert.rejects(api.processDocumentJob({artwork:[]},options),/JSON|configuration/);
 const controller=new AbortController();controller.abort();await assert.rejects(api.processDocumentJob(job,{...options,signal:controller.signal}),{name:'AbortError'});
 assert.deepEqual(emitted,[]);
});
