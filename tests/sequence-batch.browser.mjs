import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright';

const harness=(await build({stdin:{contents:`export * from './app/src/document-pipeline.mjs';
export {readDirectory,discoverJobs,createOutputWriter} from './app/src/batch-files.mjs';
export {exportFrameVideo} from './app/src/frame-video.mjs';
import {Input,BlobSource,MP4,VideoSampleSink} from 'mediabunny';
export async function inspect(blob){const input=new Input({source:new BlobSource(blob),formats:[MP4]}),c=document.createElement('canvas');c.width=c.height=8;try{const video=await input.getPrimaryVideoTrack(),frames=[];for await(const sample of new VideoSampleSink(video).samples()){try{sample.draw(c.getContext('2d'),0,0,8,8);frames.push([...c.getContext('2d').getImageData(4,4,1,1).data]);}finally{sample.close();}}return {frames,duration:await input.computeDuration()};}finally{input.dispose();}}
`,resolveDir:process.cwd()},bundle:true,format:'esm',platform:'browser',write:false})).outputFiles[0].text;
const recipe={format:'goosnav-animation-sequence',version:1,id:'folder-film',title:'Folder film',shots:['a','wide','b'].map((id,i)=>({id,title:`Shot ${i+1}`,config:{format:'goosnav-animation-config',version:1,scene:{actors:[{model:i===2?'rust-beady':'blue',x:0,yaw:0}],camera:{zoom:i===1?.8:1.7}},timing:{mode:'silent',duration:.5}}}))};
async function setup(){
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']}),page=await browser.newPage();
 await page.route('**/sequence-batch-harness.mjs',r=>r.fulfill({contentType:'text/javascript',body:harness}));await page.goto('http://127.0.0.1:8793');
 return {browser,page};
}

test('one sequence folder saves references then returned-artwork animation in separate runs',async()=>{
 const {browser,page}=await setup();try{
  const result=await page.evaluate(async recipe=>{
   const api=await import('/sequence-batch-harness.mjs'),root=await navigator.storage.getDirectory(),source=await root.getDirectoryHandle('sequence-folder',{create:true});
   const write=async(name,blob)=>{const file=await source.getFileHandle(name,{create:true}),stream=await file.createWritable();await stream.write(blob);await stream.close();};
   await write('sequence.json',JSON.stringify(recipe));
   const jobs=await api.discoverJobs(await api.readDirectory(source)),referenceWriter=await api.createOutputWriter({job:jobs[0]}),referenceResult=await api.processDocumentJob(jobs[0],{referenceFormat:'png',emit:referenceWriter.write});await referenceWriter.close();
   const firstRun=await source.getDirectoryHandle('generated'),references=await firstRun.getDirectoryHandle('references'),referenceNames=[];for await(const entry of references.values())referenceNames.push(entry.name);
   const handoff=await(await(await firstRun.getFileHandle('sequence.json')).getFile()).text(),unchanged=JSON.parse(await(await(await source.getFileHandle('sequence.json')).getFile()).text());
   await write('sequence.json',handoff);
   const canvas=document.createElement('canvas');canvas.width=64;canvas.height=112;const ctx=canvas.getContext('2d'),colors=['#ff0000','#00ff00','#0000ff'];
   const returned=await api.exportFrameVideo({canvas,frameCount:3,drawFrame:async i=>{ctx.fillStyle=colors[i];ctx.fillRect(0,0,64,112);}});await write('returned.mp4',returned);
   const next=await api.discoverJobs(await api.readDirectory(source)),animationWriter=await api.createOutputWriter({job:next[0]}),animationResult=await api.processDocumentJob(next[0],{emit:animationWriter.write});await animationWriter.close();
   const secondRun=await source.getDirectoryHandle('generated-2'),movie=await(await secondRun.getFileHandle('animation.mp4')).getFile(),restored=JSON.parse(await(await(await secondRun.getFileHandle('sequence.json')).getFile()).text());
   return {jobCount:jobs.length,kind:jobs[0].kind,referenceResult,referenceNames:referenceNames.sort(),unchanged,nextCount:next.length,artwork:next[0].artwork.map(f=>f.name),animationResult,movie:await api.inspect(movie),restored,oldReferenceBytes:(await(await references.getFileHandle('0001.png')).getFile()).size};
  },recipe);
  assert.equal(result.jobCount,1);assert.equal(result.kind,'sequence');assert.deepEqual(result.referenceNames,['0001.png','0002.png','0003.png']);assert.deepEqual(result.unchanged,recipe);assert.equal(result.nextCount,1);assert.deepEqual(result.artwork,['returned.mp4']);assert.equal(result.referenceResult.kind,'references');assert.equal(result.referenceResult.shots,3);assert.equal(result.animationResult.kind,'animation');assert.equal(result.animationResult.shots,3);
  assert.equal(result.movie.frames.length,36);assert.equal(result.movie.duration,1.5);assert.ok(result.oldReferenceBytes>1000);assert.equal(result.restored.shots.length,3);
  for(const [index,channel]of [[0,0],[11,0],[12,1],[23,1],[24,2],[35,2]])assert.ok(result.movie.frames[index][channel]>235,`frame ${index} belongs to the expected shot`);
 }finally{await browser.close();}
});

test('cancelled sequence batch emits no final JSON and invalid artwork emits no animation',async()=>{
 const {browser,page}=await setup();try{
  const result=await page.evaluate(async recipe=>{
   const api=await import('/sequence-batch-harness.mjs'),job={config:new File([JSON.stringify(recipe)],'sequence.json'),artwork:[]},controller=new AbortController(),files=[];let cancelled,failed;
   try{await api.processDocumentJob(job,{referenceFormat:'png',signal:controller.signal,emit:async name=>{files.push(name);controller.abort();}});}catch(e){cancelled=e.name;}
   const output=[];try{await api.processDocumentJob({...job,artwork:[new File(['broken'],'returned.mp4',{type:'video/mp4'})]},{emit:async name=>output.push(name)});}catch(e){failed=e.message;}
   return {cancelled,files,failed,output};
  },recipe);
  assert.equal(result.cancelled,'AbortError');assert.deepEqual(result.files,['references/0001.png']);assert.match(result.failed,/video/i);assert.deepEqual(result.output,[]);
 }finally{await browser.close();}
});

test('reference-mode batches regenerate added or removed shots while animation mode rejects the stale carrier',async()=>{
 const {browser,page}=await setup();try{
  const results=await page.evaluate(async recipe=>{
   const api=await import('/sequence-batch-harness.mjs'),text=api.documentJSON(await api.prepareDocument(JSON.stringify(recipe))),results=[];
   for(const edit of [d=>d.shots.pop(),d=>d.shots.push({...structuredClone(d.shots[0]),id:'added',title:'Added shot'})]){
    const edited=JSON.parse(text);edit(edited);
    const [job]=await api.discoverJobs([{path:'sequence.json',file:new File([JSON.stringify(edited)],'sequence.json')},{path:'returned.mp4',file:new File(['old artwork'],'returned.mp4',{type:'video/mp4'})}]);
    const files={};let strictCode;try{await api.processDocumentJob(job,{mode:'animation',emit:async(name,blob)=>files[name]=blob});}catch(error){strictCode=error.code;}
    const countBefore=Object.keys(files).length,result=await api.processDocumentJob(job,{mode:'references',referenceFormat:'png',emit:async(name,blob)=>files[name]=blob});
    const saved=JSON.parse(await files['sequence.json'].text());results.push({strictCode,countBefore,result,shots:saved.shots.length,pngs:Object.keys(files).filter(name=>name.endsWith('.png')).length});
   }
   return results;
  },recipe);
  for(const [i,result]of results.entries()){assert.equal(result.strictCode,'HANDOFF_DRAWINGS_CHANGED');assert.equal(result.countBefore,0);assert.equal(result.result.kind,'references');assert.equal(result.shots,i?4:2);assert.equal(result.pngs,i?4:2);}
 }finally{await browser.close();}
});
