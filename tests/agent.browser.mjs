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
  bundles['/voice-worker.mjs']=(await build({entryPoints:['app/src/speech/worker.mjs'],bundle:true,format:'esm',write:false})).outputFiles[0].text;
  const page=await browser.newPage();await page.route('http://localhost:19879/**',async route=>{
   const path=new URL(route.request().url()).pathname;
   if(bundles[path])return route.fulfill({contentType:'text/javascript',body:bundles[path]});
   if(path==='/vendor/flite.wasm')return route.fulfill({contentType:'application/wasm',body:await fs.readFile('node_modules/@echogarden/flite-wasi/flite.wasm')});
   if(path.startsWith('/assets/'))return route.fulfill({contentType:path.endsWith('.jpg')?'image/jpeg':'model/gltf-binary',body:await fs.readFile(`app${path}`)});
   if(path.startsWith('/examples/'))return route.fulfill({contentType:'application/json',body:await fs.readFile(`.${path}`)});
   if(path==='/agent.css')return route.fulfill({contentType:'text/css',body:await fs.readFile('app/agent.css')});
   return route.fulfill({contentType:'text/html',body:await fs.readFile('app/agent.html')});
  });await page.goto('http://localhost:19879/agent.html');await page.waitForFunction(()=>!!window.animationAgent);return {browser,page};
 }catch(error){await browser.close();throw error;}
}

test('Reels camera fit fills the available frame and balances margins without cropping',async()=>{
 const {browser,page}=await openWorkspace();try{
  const result=await page.evaluate(async()=>{
   const api=await import('/agent-api.mjs'),config=JSON.parse(api.sampleDocument());config.scene.format='portrait';
   // An off-center character and an unequal-height pair must both be centered by the fit.
   const images=[];
   for(const actors of [[{model:'v12-fat',x:1.2,yaw:20}],config.scene.actors]){
    const text=JSON.stringify({...config,dialogue:config.dialogue.filter(line=>line.actor<actors.length),scene:{...config.scene,count:actors.length,actors}});
    const fitted=await api.frameDocument(text),preview=await api.previewDocument(fitted.text,{maxDimension:640});
    images.push(preview.images[0]);
   }
   return images;
  });
  for(const [index,image]of result.entries()){
   const bounds=image.diagnostics.actors.map(actor=>actor.bounds),left=Math.min(...bounds.map(b=>b.left)),right=Math.max(...bounds.map(b=>b.right)),top=Math.min(...bounds.map(b=>b.top)),bottom=Math.max(...bounds.map(b=>b.bottom));
   assert.ok(image.diagnostics.actors.every(a=>!a.clipped&&a.head.visible));
   assert.ok(Math.max(right-left,bottom-top)>=.87,`characters should fill at least 87% of the limiting dimension: ${JSON.stringify(bounds)}`);
   assert.ok(Math.abs(top-(1-bottom))<.04,'top and bottom margins should balance');
   assert.ok(Math.abs(left-(1-right))<.04,'left and right margins should balance');
   await fs.writeFile(`.work/reels-fit-${index}.png`,Buffer.from(image.dataURL.split(',')[1],'base64'));
  }
 }finally{await browser.close();}
});

test('agent workspace uses the black and green Goosnav controls without recoloring preview pixels',async()=>{
 const {browser,page}=await openWorkspace();try{
  const style=await page.evaluate(()=>({background:getComputedStyle(document.documentElement).backgroundColor,ink:getComputedStyle(document.documentElement).color,font:getComputedStyle(document.querySelector('h1')).fontFamily,radius:getComputedStyle(document.querySelector('.recipe-panel')).borderRadius}));
  assert.equal(style.background,'rgb(0, 0, 0)');assert.equal(style.ink,'rgb(102, 255, 102)');assert.match(style.font,/Helvetica/);assert.equal(style.radius,'0px');
  assert.ok(await page.getByText('GOOSNAV',{exact:false}).first().isVisible());
  await page.getByRole('button',{name:'Preview images',exact:true}).click();const picture=page.getByRole('img',{name:/Scene.*0.00 s/}).first();await picture.waitFor();
  assert.equal(await picture.evaluate(node=>getComputedStyle(node).filter),'none');
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await fs.mkdir('.work',{recursive:true});await page.screenshot({path:'.work/agent-green-mobile.png',fullPage:true});
  await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'.work/agent-green-desktop.png',fullPage:true});
 }finally{await browser.close();}
});

test('dialogue coverage example renders a wide, distinct speaker close-ups and a return wide',async()=>{
 const {browser,page}=await openWorkspace();try{
  await page.getByRole('button',{name:'Load dialogue coverage',exact:true}).click();
  await page.waitForFunction(()=>JSON.parse(window.animationAgent.exportJSON().text).shots?.length===4);
  const result=await page.evaluate(async()=>{
   const api=await import('/agent-api.mjs'),text=window.animationAgent.exportJSON().text,inspection=api.inspectDocument(text);
   const preview=await window.animationAgent.preview({maxDimension:640,samples:[{shotId:'opening-wide'},{shotId:'a-close'},{shotId:'b-close'},{shotId:'return-wide'},{shotId:'a-close',time:.8},{shotId:'b-close',time:.8}]});
   return {inspection,preview,data:JSON.parse(text)};
  });
  assert.equal(result.preview.ok,true,JSON.stringify(result.preview.errors));assert.deepEqual(result.inspection.coverage.warnings,[]);
  assert.deepEqual(result.inspection.shots.map(s=>s.actors.length),[2,1,1,2]);
  const [wide,a,b,returnWide]=result.preview.images,headHeight=(image,index)=>{const bounds=image.diagnostics.actors[index].head.bounds;return bounds.bottom-bounds.top;};
  assert.ok(headHeight(a,0)>headHeight(wide,0)*1.5,'A close-up substantially enlarges the speaking face');
  assert.ok(headHeight(b,0)>headHeight(wide,1)*1.5,'B close-up substantially enlarges the speaking face');
  for(const image of result.preview.images)assert.ok(image.diagnostics.actors.every(actor=>actor.head.visible&&!actor.head.clipped),'speaking faces stay visible through the action');
  assert.ok([...wide.diagnostics.actors,...returnWide.diagnostics.actors].every(actor=>!actor.clipped),'wide shots preserve full bodies');
  assert.equal(result.data.shots[2].config.scene.actors[0].model,result.data.shots[0].config.scene.actors[1].model);
  assert.ok(result.data.shots[2].config.dialogue.every(line=>line.actor===0),'B dialogue uses B’s local actor index');
  await fs.mkdir('.work',{recursive:true});await fs.writeFile('.work/dialogue-coverage-contact.png',Buffer.from(result.preview.contactSheet.dataURL.split(',')[1],'base64'));
 }finally{await browser.close();}
});

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
  assert.ok(a.height>a.width,'starter uses Reels');
  assert.ok(a.diagnostics.actors.every(actor=>!actor.clipped),'starter keeps the full cast inside the frame');
  const starterBounds=a.diagnostics.actors.map(actor=>actor.bounds);
  assert.ok(Math.abs(Math.min(...starterBounds.map(b=>b.top))-(1-Math.max(...starterBounds.map(b=>b.bottom))))<.04,'starter balances space above and below the cast');
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

test('one-shot agent alignment improves actual posed gaze and preserves later keys, raw audio and base state',async()=>{
 const {browser,page}=await openWorkspace();try{
  const result=await page.evaluate(async()=>{
   const api=await import('/agent-api.mjs'),config=JSON.parse(api.sampleDocument());
   Object.assign(config.scene.actors[0],{headPitch:-35,headTilt:22,armR:58,pose:'point'});Object.assign(config.scene.actors[1],{headPitch:30,headTilt:-18});
   config.audio={mode:'recording',offset:.25,trimStart:.5,trimEnd:1.5};config.keys=[{id:'later',target:'actor:0',time:1.5,transition:'hold',values:{headYaw:-12,armR:91}}];
   const text=JSON.stringify(config),before=await api.previewDocument(text,{maxDimension:256}),aligned=await api.alignDocument(text),after=aligned.ok?await api.previewDocument(aligned.text,{maxDimension:256,samples:[{time:0},{time:1.7}]}):null;
   const baseAtStart=await api.alignDocument(text,{scope:'scene',time:0}),baseDuringMotion=await api.alignDocument(text,{scope:'scene',time:1.7});
   return {config,before,aligned,after,baseAtStart,baseDuringMotion};
  });
  assert.equal(result.aligned.ok,true,JSON.stringify(result.aligned.errors));assert.equal(result.after.ok,true,JSON.stringify(result.after.errors));
  const data=JSON.parse(result.aligned.text);assert.deepEqual(data.scene,result.config.scene);assert.deepEqual(data.audio,result.config.audio);assert.deepEqual(data.dialogue,result.config.dialogue);
  assert.deepEqual(data.keys.find(k=>k.id==='later'),result.config.keys[0]);assert.equal(data.keys.length,3);
  assert.equal(result.aligned.alignment.scope,'key');assert.deepEqual(result.aligned.alignment.actors,[0,1]);
  const before=result.before.images[0],after=result.after.images[0];assert.notEqual(before.dataURL,after.dataURL);
  for(const [index,actor] of after.diagnostics.gaze.actors.entries()){
   assert.ok(actor.partnerAngularResidual<before.diagnostics.gaze.actors[index].partnerAngularResidual-5,'saved offsets improve the rendered eyeline');
   assert.ok(Number.isFinite(actor.forward[0]));const key=data.keys.find(k=>k.time===0&&k.target===`actor:${index}`);assert.ok(Math.abs(key.values.headPitch)<=25.001);assert.equal(key.values.headTilt,0);assert.equal(key.values.headSpin,0);
  }
  assert.equal(result.baseAtStart.ok,true,JSON.stringify(result.baseAtStart.errors));assert.equal(result.baseDuringMotion.ok,true,JSON.stringify(result.baseDuringMotion.errors));
  assert.deepEqual(result.baseAtStart.alignment.changes,result.baseDuringMotion.alignment.changes,'scene scope solves the base/rest pose at either playhead time');
  assert.deepEqual(JSON.parse(result.baseDuringMotion.text).keys,result.config.keys);
 }finally{await browser.close();}
});

test('agent alignment edits one original sequence config and materializes its generated action props once',async()=>{
 const {browser,page}=await openWorkspace();try{
  const result=await page.evaluate(async()=>{
   const api=await import('/agent-api.mjs'),config=JSON.parse(api.sampleDocument()),second=structuredClone(config);
   second.audio={mode:'recording',offset:.2,trimStart:.1,trimEnd:1};second.actions=[{actor:0,action:'read',time:0,duration:1}];
   const input={format:'goosnav-animation-sequence',version:1,id:'film',title:'Gaze isolation',shots:[{id:'first',title:'First',config},{id:'second',title:'Second',config:second}]};
   const text=JSON.stringify(input),aligned=await api.alignDocument(text,{shotId:'second',actors:[0],target:'camera',time:.5});
   const bad=await api.alignDocument(text,{target:'camera'}),point=await api.alignDocument(JSON.stringify(config),{actors:[0],target:{point:[0,1.5,3]},turnBody:false,scope:'scene'});
   return {input,aligned,bad,point,preview:aligned.ok?await api.previewDocument(aligned.text,{samples:[{shotId:'second',time:.5}],maxDimension:256}):null};
  });
  assert.equal(result.aligned.ok,true,JSON.stringify(result.aligned.errors));assert.equal(result.preview.ok,true,JSON.stringify(result.preview.errors));assert.equal(result.bad.ok,false);assert.equal(result.point.ok,true,JSON.stringify(result.point.errors));
  const data=JSON.parse(result.aligned.text),selected=data.shots[1].config;
  assert.deepEqual(data.shots[0],result.input.shots[0]);assert.deepEqual(selected.audio,result.input.shots[1].config.audio);assert.equal(selected.actions,undefined);
  assert.equal(selected.scene.props.length,1);assert.equal(selected.scene.props[0].kind,'book');assert.ok(selected.keys.some(k=>k.target===`prop:${selected.scene.props[0].id}`));
  assert.equal(result.aligned.alignment.shotId,'second');assert.deepEqual(result.aligned.alignment.actors,[0]);assert.equal(result.aligned.alignment.target,'camera');
  assert.ok(result.preview.images[0].diagnostics.gaze.actors.every(actor=>actor.origin.length===3));
 }finally{await browser.close();}
});

test('cancel, external abort, synchronous reset and newer accepted drafts supersede an alignment job',async()=>{
 const {browser,page}=await openWorkspace();try{
  const result=await page.evaluate(async()=>{
   const api=await import('/agent-api.mjs'),w=api.createAgentWorkspace({text:api.sampleDocument()});await w.preview({maxDimension:256});const before=w.status();
   const pending=w.align();w.cancel();const cancelled=await pending;
   const external=new AbortController(),pending2=w.align({signal:external.signal});external.abort();const aborted=await pending2;
   const pending3=w.align(),reset=w.reset({target:'actor:0',section:'head'}),supersededByReset=await pending3;
   const pending4=w.align(),newer=JSON.parse(w.exportJSON().text);newer.title='A newer accepted draft';w.load(JSON.stringify(newer));const supersededByDraft=await pending4;
   const end=w.status(),text=w.exportJSON().text;w.dispose();return {before,cancelled,aborted,reset,supersededByReset,supersededByDraft,end,text};
  });
  for(const resultValue of [result.cancelled,result.aborted,result.supersededByReset,result.supersededByDraft]){assert.equal(resultValue.ok,false);assert.equal(resultValue.errors[0].code,'CANCELLED');}
  assert.equal(result.reset.ok,true);assert.equal(result.end.busy,false);assert.deepEqual(result.end.artifacts,result.before.artifacts);
  assert.equal(JSON.parse(result.text).title,'A newer accepted draft');assert.equal(JSON.parse(result.text).scene.actors[0].headPitch,0);
 }finally{await browser.close();}
});

test('agent pose controls align and reset a current head key while preserving its arm and stale preview',async()=>{
 const {browser,page}=await openWorkspace();try{
  await page.evaluate(()=>{const config=JSON.parse(window.animationAgent.exportJSON().text);config.keys=[{id:'current',target:'actor:0',time:0,transition:'hold',values:{headPitch:-35,headTilt:20,armR:70}}];window.animationAgent.load(JSON.stringify(config));});
  await page.getByRole('button',{name:'Preview images',exact:true}).click();await page.getByRole('img',{name:/Scene.*0.00 s/}).first().waitFor();
  await page.getByText('Pose and gaze',{exact:true}).click();
  await page.locator('#gaze-actors').selectOption('0');await page.locator('#gaze-target').selectOption('camera');await page.locator('#align-gaze').click();
  await page.waitForFunction(()=>window.animationAgent.status().revision===3&&!window.animationAgent.status().busy);
  assert.equal(await page.locator('#stale').isVisible(),true);
  await page.locator('#reset-target').selectOption('actor:0');await page.locator('#reset-section').selectOption('head');await page.locator('#reset-scope').selectOption('key');await page.locator('#reset-section-button').click();
  const data=JSON.parse(await page.getByRole('textbox',{name:'Scene or sequence JSON'}).inputValue()),key=data.keys.find(k=>k.id==='current');
  assert.equal(key.values.headPitch,0);assert.equal(key.values.headYaw,0);assert.equal(key.values.headTilt,0);assert.equal(key.values.armR,70);
  assert.equal(await page.locator('#stale').isVisible(),true);assert.equal(await page.getByRole('img',{name:/Scene.*0.00 s/}).first().isVisible(),true);
 }finally{await browser.close();}
});

test('typing a newer JSON draft cancels alignment instead of replacing the typed text',async()=>{
 const {browser,page}=await openWorkspace();let release;
 try{
  const gate=new Promise(resolve=>release=resolve);let requested;const requestSeen=new Promise(resolve=>requested=resolve);
  await page.route('**/assets/actor-*.glb',async route=>{requested();await gate;await route.fulfill({contentType:'model/gltf-binary',body:await fs.readFile(`app${new URL(route.request().url()).pathname}`)});});
  await page.evaluate(()=>{const original=window.animationAgent.align;window.animationAgent.align=options=>(window.pendingAlign=original(options));});
  await page.getByText('Pose and gaze',{exact:true}).click();await page.locator('#align-gaze').click();await requestSeen;
  const draft=JSON.parse(await page.getByRole('textbox',{name:'Scene or sequence JSON'}).inputValue());draft.title='A newer typed gaze draft';const text=JSON.stringify(draft,null,2);
  await page.getByRole('textbox',{name:'Scene or sequence JSON'}).fill(text);release();const result=await page.evaluate(()=>window.pendingAlign);
  assert.equal(await page.getByRole('textbox',{name:'Scene or sequence JSON'}).inputValue(),text);assert.equal(result.ok,false);assert.equal(result.errors[0].code,'CANCELLED');assert.equal(await page.evaluate(()=>window.animationAgent.status().busy),false);
 }finally{release?.();await browser.close();}
});
