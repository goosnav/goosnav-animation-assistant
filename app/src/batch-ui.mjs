import {readDirectory,entriesFromFiles,discoverJobs,createOutputWriter} from './batch-files.mjs';
import {processSceneJob} from './pipeline.mjs';
import {download,imageZip} from './images.mjs';
const MAX_ZIP_BYTES=128*1024*1024;
const $=s=>document.querySelector(s);
const safe=name=>name.replace(/[^a-z0-9_-]+/gi,'-').slice(0,80)||'scene';
export function setupBatch({run,status,onProgress}){
 let jobs=[],outputRoot=null,archive=null;
 function refresh(){
  $('#batch-generate').disabled=!jobs.length;
  $('#batch-format-label').hidden=$('#batch-mode').value==='animation';
  $('#batch-output').hidden=!globalThis.showDirectoryPicker;$('#batch-reset-output').hidden=!outputRoot;
  $('#batch-output-label').textContent=outputRoot?outputRoot.name:jobs.some(j=>j.sourceDirectory)?'Save inside each scene folder':'Download one ZIP';
 }
 function render(){
  const list=$('#batch-jobs');list.replaceChildren();
  for(const job of jobs){const row=document.createElement('li'),name=document.createElement('strong'),state=document.createElement('span');name.textContent=job.path||job.name;state.textContent=job.status||job.error||(job.artwork.length?'Animation':'References');row.append(name,state);row.classList.toggle('error',!!job.error);list.append(row);}
  refresh();
 }
 async function load(entries,signal){const found=await discoverJobs(entries,{signal});signal?.throwIfAborted();jobs=found;archive=null;$('#batch-download').hidden=true;render();status(jobs.length?`${jobs.length} scene${jobs.length===1?'':'s'} ready.`:'No scene JSON found.');}
 $('#batch-folder').onclick=async()=>{
  if(!globalThis.showDirectoryPicker){$('#batch-folder-input').click();return;}
  try{const root=await showDirectoryPicker({id:'animation-source',mode:'readwrite'});await run('Reading folder…',async signal=>load(await readDirectory(root,{signal}),signal));}
  catch(e){if(e.name!=='AbortError')status(e.message,true);}
 };
 $('#batch-folder-input').onchange=e=>{const files=[...e.target.files];if(files.length)run('Reading folder…',signal=>load(entriesFromFiles(files),signal));e.target.value='';};
 $('#batch-files').onchange=e=>{const files=[...e.target.files];if(files.length)run('Reading files…',signal=>load(entriesFromFiles(files),signal));e.target.value='';};
 $('#batch-output').onclick=async()=>{try{outputRoot=await showDirectoryPicker({id:'animation-output',mode:'readwrite'});refresh();}catch(e){if(e.name!=='AbortError')status(e.message,true);}};
 $('#batch-reset-output').onclick=()=>{outputRoot=null;refresh();};$('#batch-mode').onchange=refresh;
 $('#batch-download').onclick=()=>{if(archive)download(archive,'animations.zip');};
 $('#batch-generate').onclick=()=>run('Generating scenes…',async signal=>{
  const mode=$('#batch-mode').value,referenceFormat=$('#batch-format').value,files=[],report=[];let totalBytes=0,completed=0;
  archive=null;$('#batch-download').hidden=true;
  for(const [i,job]of jobs.entries()){
   if(signal.aborted){job.status='Cancelled';report.push({scene:job.path||job.name,status:'cancelled'});continue;}
   let writer;const pending=[];let pendingBytes=0;
   try{
    if(job.error)throw Error(job.error);
    job.status='Starting…';render();$('#batch-generate').disabled=true;
    if(outputRoot||job.sourceDirectory)writer=await createOutputWriter({job,root:outputRoot||undefined,signal});
    const result=await processSceneJob(job,{mode,referenceFormat,signal,onProgress:info=>{
     job.status=`${info.phase} ${Math.round(info.progress*100)}%`;render();$('#batch-generate').disabled=true;onProgress((i+info.progress)/jobs.length);status(`${i+1}/${jobs.length} · ${job.path||job.name}`);
    },emit:async(name,blob)=>{
     signal.throwIfAborted();if(writer)await writer.write(name,blob);else{pendingBytes+=blob.size;if(totalBytes+pendingBytes>MAX_ZIP_BYTES)throw Error('ZIP output exceeds 128 MB. Choose an output folder or run fewer scenes.');pending.push(new File([blob],`${job.path||safe(job.name)}/generated/${name}`,{type:blob.type}));}
    }});
    signal.throwIfAborted();if(writer)await writer.close();else{files.push(...pending);totalBytes+=pendingBytes;}
    completed++;job.status=writer?`Saved · ${writer.path}`:'Ready in ZIP';report.push({scene:job.path||job.name,status:'saved',output:writer?.path||`${job.path||safe(job.name)}/generated`,...result});
   }catch(e){await writer?.abort().catch(()=>{});job.status=e.name==='AbortError'?'Cancelled':e.message;report.push({scene:job.path||job.name,status:e.name==='AbortError'?'cancelled':'error',error:e.message});}
   render();$('#batch-generate').disabled=true;await new Promise(resolve=>setTimeout(resolve,0));
  }
  if(files.length){files.push(new File([JSON.stringify(report,null,2)],'batch-report.json',{type:'application/json'}));archive=await imageZip(files);$('#batch-download').hidden=false;download(archive,'animations.zip');}
  render();status(`${completed}/${jobs.length} scenes saved.${signal.aborted?' Cancelled.':''}`,completed<jobs.length);
 });
 refresh();return {refresh};
}
