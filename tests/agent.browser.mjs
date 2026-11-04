import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {prepareSequence,sequenceJSON} from '../app/src/sequence.mjs';
import {sampleDocument} from '../app/src/agent-api.mjs';

async function openWorkspace(){
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
 try{
  const bundles={};for(const entry of ['agent-api','agent-ui'])bundles[`/${entry}.mjs`]=(await build({entryPoints:[`app/src/${entry}.mjs`],bundle:true,format:'esm',write:false})).outputFiles[0].text;
  const page=await browser.newPage();await page.route('http://localhost:19879/**',async route=>{
   const path=new URL(route.request().url()).pathname;
   if(bundles[path])return route.fulfill({contentType:'text/javascript',body:bundles[path]});
   if(path.startsWith('/assets/'))return route.fulfill({contentType:path.endsWith('.jpg')?'image/jpeg':'model/gltf-binary',body:await fs.readFile(`app${path}`)});
   if(path==='/agent.css')return route.fulfill({contentType:'text/css',body:await fs.readFile('app/agent.css')});
   return route.fulfill({contentType:'text/html',body:await fs.readFile('app/agent.html')});
  });await page.goto('http://localhost:19879/agent.html');await page.waitForFunction(()=>!!window.animationAgent);return {browser,page};
 }catch(error){await browser.close();throw error;}
}

test('agent previews contain actual posed pixels, precise edits change pixels, and geometry framing retains B identity',async()=>{
 const {browser,page}=await openWorkspace();try{
  const result=await page.evaluate(async()=>{
   const api=await import('/agent-api.mjs'),text=api.sampleDocument();
   const before=await api.previewDocument(text,{maxDimension:384,samples:[{time:0}]});
   const moved=api.editDocument(text,[{op:'set',path:'/scene/actors/1/headYaw',value:65},{op:'set',path:'/scene/actors/1/armR',value:90}]);
   const after=await api.previewDocument(moved.text,{maxDimension:384});
   const framed=await api.frameDocument(text,{actors:[1],region:'head'});
   const close=await api.previewDocument(framed.text,{maxDimension:384});
   const off=api.editDocument(text,[{op:'set',path:'/scene/actors/1/x',value:20}]);const invisible=await api.previewDocument(off.text,{maxDimension:384});
   const overlapping=api.editDocument(text,[{op:'set',path:'/scene/actors/0/x',value:0},{op:'set',path:'/scene/actors/1/x',value:0},{op:'set',path:'/scene/actors/0/z',value:1},{op:'set',path:'/scene/actors/1/z',value:0}]);
   const occlusion=await api.previewDocument(overlapping.text,{maxDimension:384});
   return {before,after,close,framed:JSON.parse(framed.text),original:JSON.parse(text),invisible,occlusion};
  });
  assert.equal(result.before.ok,true);assert.equal(result.after.ok,true);assert.equal(result.close.ok,true);
  const a=result.before.images[0],b=result.after.images[0];assert.match(a.dataURL,/^data:image\/png;base64,/);assert.notEqual(a.dataURL,b.dataURL);
  assert.ok(a.diagnostics.actors.every(a=>a.visiblePixels>20&&a.head.visiblePixels>10));
  assert.equal(result.invisible.images[0].diagnostics.actors[1].visiblePixels,0);assert.equal(result.invisible.images[0].diagnostics.actors[1].head.visiblePixels,0);
  assert.ok(result.occlusion.images[0].diagnostics.actors[1].head.visiblePixels<a.diagnostics.actors[1].head.visiblePixels,'front actor occludes part of rear actor head');
  assert.deepEqual(result.framed.scene.actors,result.original.scene.actors);assert.deepEqual(result.framed.dialogue,result.original.dialogue);assert.equal(result.framed.scene.count,2);
  assert.ok(result.close.images[0].diagnostics.actors[1].head.visiblePixels>a.diagnostics.actors[1].head.visiblePixels);
  await fs.mkdir('.work',{recursive:true});await fs.writeFile('.work/agent-verified-preview.png',Buffer.from(a.dataURL.split(',')[1],'base64'));
 }finally{await browser.close();}
});

test('agent page displays labelled images, preserves last good preview on errors, and exposes bounded command status',async()=>{
 const {browser,page}=await openWorkspace();try{
  await page.getByRole('button',{name:'Preview images',exact:true}).click();
  const picture=page.getByRole('img',{name:/Scene.*0.00 s/}).first();await picture.waitFor({timeout:30000});assert.ok(await picture.isVisible());const src=await picture.getAttribute('src');
  await page.getByRole('textbox',{name:'Scene or sequence JSON'}).fill('{"bad":');await page.getByRole('button',{name:'Preview images',exact:true}).click();
  await page.getByRole('status').filter({hasText:/invalid JSON/}).waitFor();assert.equal(await picture.getAttribute('src'),src);
  const status=await page.evaluate(()=>window.animationAgent.status());assert.equal(status.busy,false);assert.ok(status.artifacts[0].width>0);assert.equal(status.artifacts[0].dataURL,undefined);
  const invalid=await page.evaluate(()=>window.animationAgent.command('preview {"maxDimension":99999}'));assert.equal(invalid.ok,false);assert.equal(await picture.getAttribute('src'),src);
  await page.getByText('Commands', {exact:true}).click();await page.getByRole('textbox',{name:'Command'}).fill('status');await page.getByRole('button',{name:'Run command',exact:true}).click();assert.match(await page.getByLabel('Command result').textContent(),/revision/);
  await page.evaluate(()=>{const data=JSON.parse(window.animationAgent.exportJSON().text);data.title='Loaded from automation';window.animationAgent.load(JSON.stringify(data,null,2));});
  assert.equal(JSON.parse(await page.getByRole('textbox',{name:'Scene or sequence JSON'}).inputValue()).title,'Loaded from automation');
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 }finally{await browser.close();}
});

test('cancellation and load during rendering cannot replace the last accepted preview',async()=>{
 const {browser,page}=await openWorkspace();try{
  const result=await page.evaluate(async()=>{
   const api=await import('/agent-api.mjs'),w=api.createAgentWorkspace({text:api.sampleDocument()});await w.preview({maxDimension:256});const old=w.status();
   const pending=w.preview({maxDimension:256,samples:[{time:0},{time:.5},{time:1}]});w.cancel();const cancelled=await pending;
   const pending2=w.preview({maxDimension:256});w.load(api.sampleDocument());const superseded=await pending2;
   const external=new AbortController(),pending3=w.preview({maxDimension:256,signal:external.signal});external.abort();const externalCancellation=await pending3;
   const end=w.status();w.dispose();return {old,cancelled,superseded,externalCancellation,end};
  });
  assert.equal(result.cancelled.ok,false);assert.equal(result.cancelled.errors[0].code,'CANCELLED');assert.equal(result.superseded.ok,false);assert.equal(result.externalCancellation.ok,false);assert.equal(result.externalCancellation.errors[0].code,'CANCELLED');assert.equal(result.end.busy,false);assert.deepEqual(result.end.artifacts,result.old.artifacts);
 }finally{await browser.close();}
});

test('sequence contact sheets label explicit shot/time samples and enforce bounds before rendering',async()=>{
 const {browser,page}=await openWorkspace();try{
  const result=await page.evaluate(async()=>{
   const api=await import('/agent-api.mjs'),config=JSON.parse(api.sampleDocument());
   const text=JSON.stringify({format:'goosnav-animation-sequence',version:1,id:'film',title:'Contact test',shots:[{id:'first',title:'First',config},{id:'second',title:'Second',config:{...config,scene:{...config.scene,camera:{...config.scene.camera,zoom:1.6}}}}]});
   const preview=await api.previewDocument(text,{samples:[{shotId:'second',time:1},{shotId:'first',time:.5}],maxDimension:256});
   const bad=[];for(const options of [{samples:[{shotId:'missing'}]},{samples:[{time:0}]},{samples:[{shotId:'first',time:3}]},{samples:Array.from({length:13},()=>({shotId:'first'}))},{contactSheet:'yes'}])bad.push(await api.previewDocument(text,options));
   return {preview,bad};
  });
  assert.equal(result.preview.ok,true);assert.deepEqual(result.preview.images.map(i=>[i.shotId,i.time,i.globalTime]),[['second',1,3],['first',.5,.5]]);
  assert.match(result.preview.images[0].drawingId,/^second:d/);assert.match(result.preview.images[1].drawingId,/^first:d/);
  assert.match(result.preview.contactSheet.dataURL,/^data:image\/png;base64,/);assert.equal(result.preview.contactSheet.samples,2);
  assert.notEqual(result.preview.images[0].dataURL,result.preview.images[1].dataURL);assert.ok(result.bad.every(r=>r.ok===false));
 }finally{await browser.close();}
});

test('typing a newer JSON draft cancels an in-flight camera fit instead of overwriting it',async()=>{
 const {browser,page}=await openWorkspace();let release;
 try{
  const gate=new Promise(resolve=>release=resolve);let requested;const requestSeen=new Promise(resolve=>requested=resolve);
  await page.route('**/assets/actor-*.glb',async route=>{requested();await gate;await route.fulfill({contentType:'model/gltf-binary',body:await fs.readFile(`app${new URL(route.request().url()).pathname}`)});});
  await page.evaluate(()=>{const original=window.animationAgent.frame;window.animationAgent.frame=options=>(window.pendingFrame=original(options));});
  await page.getByText('Fit camera to actors',{exact:true}).click();await page.getByRole('button',{name:'Fit heads',exact:true}).click();await requestSeen;
  const draft=JSON.parse(await page.getByRole('textbox',{name:'Scene or sequence JSON'}).inputValue());draft.title='A newer typed draft';const text=JSON.stringify(draft,null,2);
  await page.getByRole('textbox',{name:'Scene or sequence JSON'}).fill(text);release();const result=await page.evaluate(()=>window.pendingFrame);
  assert.equal(await page.getByRole('textbox',{name:'Scene or sequence JSON'}).inputValue(),text);assert.equal(result.ok,false);assert.equal(result.errors[0].code,'CANCELLED');assert.equal(await page.evaluate(()=>window.animationAgent.status().busy),false);
 }finally{release?.();await browser.close();}
});

test('composition bounds ignore hidden effect geometry and do not depend on earlier sampled poses',async()=>{
 const {browser,page}=await openWorkspace();try{
  const result=await page.evaluate(async()=>{
   const api=await import('/agent-api.mjs'),config=JSON.parse(api.sampleDocument());
   config.keys=[{id:'burst',target:'actor:0',time:0,transition:'hold',values:{burst:1}},{id:'restore',target:'actor:0',time:1,transition:'hold',values:{burst:0}}];
   const text=JSON.stringify(config),both=await api.previewDocument(text,{maxDimension:256,samples:[{time:0},{time:1.5}],contactSheet:false}),alone=await api.previewDocument(text,{maxDimension:256,samples:[{time:1.5}]});
   return {both,alone,headFit:await api.frameDocument(text,{actors:[0],region:'head',time:0})};
  });
  assert.equal(result.both.ok,true);assert.equal(result.alone.ok,true);assert.equal(result.both.images[1].dataURL,result.alone.images[0].dataURL);
  assert.deepEqual(result.both.images[1].diagnostics,result.alone.images[0].diagnostics,'hidden prior explosion pieces must not inflate current bounds');
  assert.equal(result.both.images[0].diagnostics.actors[0].head.bounds,null);assert.equal(result.both.images[0].diagnostics.actors[0].head.visiblePixels,0);assert.equal(result.headFit.ok,false);
 }finally{await browser.close();}
});

test('an exported film remains previewable after a shot removal and reports the stale reference carrier',async()=>{
 const config=JSON.parse(sampleDocument()),text=sequenceJSON(await prepareSequence(JSON.stringify({format:'goosnav-animation-sequence',version:1,id:'film',title:'Film',shots:[{id:'first',title:'First',config},{id:'second',title:'Second',config}]})));
 const {browser,page}=await openWorkspace();try{
  const result=await page.evaluate(async text=>{const api=await import('/agent-api.mjs'),data=JSON.parse(text),edit=api.editDocument(text,[{op:'set',path:'/shots',value:[data.shots[1]]}]);return {edit,preview:await api.previewDocument(edit.text,{maxDimension:256})};},text);
  assert.equal(result.edit.ok,true);assert.equal(result.preview.ok,true);assert.equal(result.preview.images.length,1);assert.equal(result.preview.images[0].shotId,'second');assert.ok(result.preview.warnings.some(message=>/new.*references/i.test(message)));
 }finally{await browser.close();}
});
