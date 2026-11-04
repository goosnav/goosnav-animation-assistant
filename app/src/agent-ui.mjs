import {createAgentWorkspace,capabilities,sampleDocument,inspectDocument} from './agent-api.mjs';

const $=id=>document.getElementById(id),recipe=$('recipe');let shownRevision=1;
const compact=result=>JSON.stringify(result,(key,value)=>key==='dataURL'?'[PNG displayed above]':value,2);
function message(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
function renderImages(result){
 const fragment=document.createDocumentFragment();
 for(const image of [...(result.contactSheet?[result.contactSheet]:[]),...result.images]){
  const figure=document.createElement('figure'),img=document.createElement('img'),caption=document.createElement('figcaption'),link=document.createElement('a');img.src=image.dataURL;img.alt=image.label;img.width=image.width;img.height=image.height;
  caption.textContent=image.label;link.href=image.dataURL;link.download=`${image.kind==='contact-sheet'?'contact-sheet':`${image.shotId}-${image.frame}`}.png`;link.textContent='Download PNG';caption.append(document.createElement('br'),link);figure.append(img,caption);
  if(image.diagnostics){const details=document.createElement('details'),summary=document.createElement('summary'),pre=document.createElement('pre');summary.textContent=image.diagnostics.actors.map(a=>`${a.actor===0?'A':'B'}: ${a.head.visible?'head visible':'head not visible'}${a.head.clipped?' · cropped':''}`).join(' / ');pre.textContent=JSON.stringify(image.diagnostics,null,2);details.append(summary,pre);figure.append(details);}
  fragment.append(figure);
 }
 $('images').replaceChildren(fragment);
}
function updateShots(){
 const inspection=inspectDocument(controller.exportJSON().text);if(!inspection.ok)return;const previous=$('shot').value;
 $('shot').replaceChildren(new Option('All shots · first frame','all'),...inspection.shots.map(shot=>new Option(shot.kind==='scene'?'Scene':shot.title,shot.id)));
 if([...$('shot').options].some(option=>option.value===previous))$('shot').value=previous;
}
const controller=createAgentWorkspace({text:sampleDocument(),onResult:result=>{
 if(!result.ok){message(result.errors.map(error=>`${error.code}: ${error.message}`).join('\n'),true);return;}
 if(result.images){renderImages(result);message(`${result.images.length} image${result.images.length===1?'':'s'} ready. Inspect the PNGs before the next edit.${result.warnings?.length?' '+result.warnings.join(' '):''}`);}
 else if(result.text){recipe.value=result.text;message((result.framing?'Camera fitted. Render again to inspect the composition.':'Edits accepted. Render again to inspect the changes.')+(result.warnings?.length?' '+result.warnings.join(' '):''));}
 else message(`${result.shots?.length||1} shot${result.shots?.length===1?'':'s'} validated.${result.warnings?.length?' '+result.warnings.join(' '):''}`);
},onChange:status=>{
 $('cancel').disabled=!status.busy;$('progress').hidden=!status.busy;$('progress').value=status.progress?.progress||0;
 $('revision').textContent=`Draft ${status.revision}`;$('stale').hidden=status.previewRevision===null||status.previewRevision===status.revision&&recipe.value===controller.exportJSON().text;
 if(status.busy)message(`${status.progress?.phase||'Preparing'}… ${Math.round((status.progress?.progress||0)*100)}%`);
 if(status.revision!==shownRevision){shownRevision=status.revision;recipe.value=controller.exportJSON().text;updateShots();}
}});
recipe.value=controller.exportJSON().text;window.animationAgent=controller;updateShots();
recipe.addEventListener('input',()=>{
 if(controller.status().busy)controller.cancel();
 const state=controller.status();$('stale').hidden=state.previewRevision===null||state.previewRevision===state.revision&&recipe.value===controller.exportJSON().text;
 message('Unvalidated draft. Validate or preview to accept these edits.');
});
function acceptDraft(){if(recipe.value===controller.exportJSON().text)return true;return controller.load(recipe.value).ok;}
function selected(){const shot=$('shot').value;return shot==='all'?undefined:shot;}
function displayFailure(error){message(error.message||String(error),true);}
$('sample').onclick=()=>{recipe.value=sampleDocument();controller.load(recipe.value);};
$('coverage-sample').onclick=async()=>{const button=$('coverage-sample');button.disabled=true;try{const response=await fetch('examples/dialogue-coverage.json');if(!response.ok)throw Error('Could not load the coverage example.');const text=await response.text();controller.load(text);}catch(error){displayFailure(error);}finally{button.disabled=false;}};
$('file').onchange=async()=>{try{const file=$('file').files[0];if(!file)return;if(file.size>5_000_000)throw Error('Document exceeds 5 MB.');const text=await file.text();recipe.value=text;controller.load(text);}catch(error){displayFailure(error);}finally{$('file').value='';}};
$('validate').onclick=()=>{if(acceptDraft())controller.validate();};
$('preview').onclick=async()=>{if(!acceptDraft())return;const shotId=selected(),options={maxDimension:Number($('size').value)};if(shotId)options.samples=[{shotId,time:Number($('time').value)}];await controller.preview(options);};
$('cancel').onclick=()=>{controller.cancel();message('Cancelled. The last successful preview is still available.');};
async function frame(region){if(!acceptDraft())return;const inspection=inspectDocument(controller.exportJSON().text),shotId=selected()??(inspection.shots.length===1?inspection.shots[0].id:undefined);if(!shotId){message('Choose one shot before fitting its camera.',true);return;}const actors=$('actors').value==='all'?undefined:[Number($('actors').value)];await controller.frame({shotId,actors,region,time:Number($('time').value)});}
$('fit-body').onclick=()=>frame('body');$('fit-head').onclick=()=>frame('head');
$('download').onclick=()=>{if(!acceptDraft())return;const blob=new Blob([controller.exportJSON().text],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='animation-recipe.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('open-editor').onclick=()=>{if(!acceptDraft())return;try{sessionStorage.setItem('goosnav-agent-import-v1',JSON.stringify({version:1,text:controller.exportJSON().text,createdAt:new Date().toISOString()}));location.assign('./?agentImport=1');}catch(error){displayFailure(error);}};
$('run-command').onclick=async()=>{const result=await controller.command($('command').value);$('command-result').textContent=compact(result);};
$('command').addEventListener('keydown',event=>{if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();$('run-command').click();}});
$('catalog').textContent=JSON.stringify(capabilities(),null,2);$('catalog-button').onclick=()=>{$('catalog-details').open=true;$('catalog-details').scrollIntoView({behavior:'smooth'});};
window.addEventListener('pagehide',()=>controller.dispose(),{once:true});
