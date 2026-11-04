import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {unzipSync,strFromU8} from 'fflate';
import {build} from 'esbuild';
const recipe={format:'goosnav-animation-config',version:1,title:'Handoff',scene:{actors:[{model:'blue',x:0,yaw:0}]},timing:{mode:'silent',duration:1,drawings:3},keys:[{id:'start',target:'actor:0',time:0,values:{headYaw:0},transition:'hold'},{id:'turn',target:'actor:0',time:.5,values:{headYaw:30},transition:'hold'}]};
const payload=(name,data,mimeType='application/json')=>({name,mimeType,buffer:Buffer.from(typeof data==='string'?data:JSON.stringify(data))});
const jsonFile=data=>payload('scene.json',data);
const launch=()=>chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});

test('a fresh collaborator can open JSON with returned images and export without regenerating references',async()=>{
 const browser=await launch();try{
  const source=await browser.newPage();await source.goto('http://127.0.0.1:8793');await source.locator('#load-config').setInputFiles(jsonFile(recipe));await source.getByText('JSON scene loaded.',{exact:true}).waitFor();
  await source.locator('[data-tab=draw]').click();await source.getByText('Other formats',{exact:true}).click();const packDownload=source.waitForEvent('download');await source.locator('#zip').click();const packed=unzipSync(new Uint8Array(await fs.readFile(await(await packDownload).path())));
  assert.ok(packed['references/0001.png'],'guides are kept in the reference directory so Batch cannot mistake them for artwork');assert.ok(packed['scene.json'],'reference ZIP includes the portable scene JSON');const scene=strFromU8(packed['scene.json']);
  const images=Object.entries(packed).filter(([name])=>name.endsWith('.png')).map(([name,bytes])=>({name:name.split('/').at(-1),mimeType:'image/png',buffer:Buffer.from(bytes)}));assert.equal(images.length,2);
  const receiver=await browser.newPage({viewport:{width:820,height:1180}});await receiver.goto('http://127.0.0.1:8793');await receiver.locator('#load-config').setInputFiles([payload('scene.json',scene),...images]);
  await receiver.getByText('Drawings loaded. Ready to export.',{exact:true}).waitFor({timeout:90000});assert.equal(await receiver.locator('#art-count').textContent(),'2');assert.equal(await receiver.locator('#reference-gallery button').count(),0);assert.equal(await receiver.locator('[data-view=finish]').isVisible(),true);
  const output=receiver.waitForEvent('download');await receiver.locator('#export').click();const result=await output;assert.ok(result.suggestedFilename().endsWith('.mp4'));assert.ok((await fs.stat(await result.path())).size>1000);
 }finally{await browser.close();}
});

test('folder batches save references and animations to their source folders and isolate a bad scene',async()=>{
 const browser=await launch();try{
  const page=await browser.newPage();await page.goto('http://127.0.0.1:8793');
  await page.evaluate(async recipe=>{
   const root=await navigator.storage.getDirectory(),source=await root.getDirectoryHandle('batch-input',{create:true});
   async function write(dir,name,data){const f=await dir.getFileHandle(name,{create:true}),w=await f.createWritable();await w.write(data);await w.close();}
   const references=await source.getDirectoryHandle('01-reference',{create:true}),finished=await source.getDirectoryHandle('02-finished',{create:true}),bad=await source.getDirectoryHandle('03-bad',{create:true});
   await write(references,'scene.json',JSON.stringify(recipe));await write(finished,'scene.json',JSON.stringify(recipe));await write(bad,'scene.json','{bad');
   const art=await finished.getDirectoryHandle('drawings',{create:true}),canvas=document.createElement('canvas');canvas.width=54;canvas.height=96;
   for(const [i,color]of ['#ff0000','#0000ff'].entries()){canvas.getContext('2d').fillStyle=color;canvas.getContext('2d').fillRect(0,0,54,96);await write(art,`${String(i+1).padStart(4,'0')}.png`,await new Promise(r=>canvas.toBlob(r)));}
   window.showDirectoryPicker=async()=>source;
  },recipe);
  await page.locator('#batch-mode-button').click();await page.locator('#batch-folder').click();await page.getByText('3 scenes ready.',{exact:true}).waitFor();await page.locator('#batch-format').selectOption('png');await page.locator('#batch-generate').click();await page.getByText('2/3 scenes saved.',{exact:true}).waitFor({timeout:90000});
  const result=await page.evaluate(async()=>{
   const source=await(await navigator.storage.getDirectory()).getDirectoryHandle('batch-input');
   const a=await source.getDirectoryHandle('01-reference'),b=await source.getDirectoryHandle('02-finished'),ga=await a.getDirectoryHandle('generated'),gb=await b.getDirectoryHandle('generated');
   return {reference:(await(await(await ga.getDirectoryHandle('references')).getFileHandle('0001.png')).getFile()).size,scene:JSON.parse(await(await(await ga.getFileHandle('scene.json')).getFile()).text()),movie:(await(await gb.getFileHandle('animation.mp4')).getFile()).size,input:JSON.parse(await(await(await b.getFileHandle('scene.json')).getFile()).text())};
  });
  assert.ok(result.reference>1000);assert.ok(result.movie>1000);assert.ok(result.scene.handoff);assert.deepEqual(result.input,recipe);
  await page.screenshot({path:'.work/batch-results.png',fullPage:true});
  await page.locator('#editor-mode').click();assert.equal(await page.locator('#title').inputValue(),'An ordinary conversation','batch leaves editor project intact');
 }finally{await browser.close();}
});


const mediaHarness=(await build({stdin:{contents:`export {packProject} from './app/src/archive.mjs';
export {exportFrameVideo} from './app/src/frame-video.mjs';
import {Input,BlobSource,MP4,VideoSampleSink,AudioSampleSink} from 'mediabunny';
export async function inspect(blob){const input=new Input({source:new BlobSource(blob),formats:[MP4]}),canvas=document.createElement('canvas');canvas.width=canvas.height=8;try{const video=await input.getPrimaryVideoTrack(),audio=await input.getPrimaryAudioTrack(),samples=[];for await(const sample of new VideoSampleSink(video).samples()){try{sample.draw(canvas.getContext('2d'),0,0,8,8);samples.push({time:sample.timestamp,pixel:[...canvas.getContext('2d').getImageData(4,4,1,1).data]});}finally{sample.close();}}const audioSamples=[];if(audio)for await(const sample of new AudioSampleSink(audio).samples()){try{const options={planeIndex:0,format:'f32'},data=new Uint8Array(sample.allocationSize(options));sample.copyTo(data,options);audioSamples.push({time:sample.timestamp,rate:sample.sampleRate,channels:sample.numberOfChannels,frames:sample.numberOfFrames,hash:[...new Uint8Array(await crypto.subtle.digest('SHA-256',data))]});}finally{sample.close();}}return {samples,audio:!!audio,audioSamples,duration:await input.computeDuration()};}finally{input.dispose();}}
`,resolveDir:process.cwd()},bundle:true,format:'esm',write:false})).outputFiles[0].text;

test('speech JSON plus returned MP4 produces the same decoded animation on an independent device',async()=>{
 const browser=await launch();try{
  const source=await browser.newPage();await source.route('**/test-media.mjs',r=>r.fulfill({contentType:'text/javascript',body:mediaHarness}));await source.goto('http://127.0.0.1:8793');
  const original=await source.evaluate(async()=>{
   const api=await import('/pipeline.mjs'),media=await import('/test-media.mjs');const recipe={format:'goosnav-animation-config',version:1,title:'Speech handoff',scene:{actors:[{x:0,yaw:0}]},dialogue:[{actor:0,text:'Hello.',pose:'point'}]};
   const scene=await api.prepareScene(JSON.stringify(recipe)),files={};await api.renderReferences(scene,{format:'mp4',emit:async(name,blob)=>files[name]=blob});
   const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1920;
   const returned=await media.exportFrameVideo({canvas,frameCount:scene.drawingSlots.length,drawFrame:async i=>{const ctx=canvas.getContext('2d');ctx.fillStyle=['#ff0000','#00ff00','#0000ff','#ffff00','#ff00ff','#00ffff'][i%6];ctx.fillRect(0,0,1080,1920);}});
   const ready=await api.attachArtwork(scene,[new File([returned],'artwork.mp4',{type:'video/mp4'})]),finished=await api.renderAnimation(ready);
   return {json:await files['scene.json'].text(),returned:[...new Uint8Array(await returned.arrayBuffer())],inspection:await media.inspect(finished),references:await media.inspect(files['references.mp4']),count:scene.drawingSlots.length,exposures:scene.clip.exposures};
  });
  assert.equal(original.references.samples.length,original.count);assert.equal(original.inspection.audio,true);
  const receiver=await browser.newPage();await receiver.route('**/test-media.mjs',r=>r.fulfill({contentType:'text/javascript',body:mediaHarness}));await receiver.goto('http://127.0.0.1:8793');
  await receiver.locator('#load-config').setInputFiles([payload('scene.json',original.json),{name:'artwork.mp4',mimeType:'video/mp4',buffer:Buffer.from(original.returned)}]);await receiver.getByText('Drawings loaded. Ready to export.',{exact:true}).waitFor({timeout:90000});
  const download=receiver.waitForEvent('download');await receiver.locator('#export').click();const bytes=await fs.readFile(await(await download).path());
  const received=await receiver.evaluate(async bytes=>{const media=await import('/test-media.mjs');return media.inspect(new Blob([new Uint8Array(bytes)],{type:'video/mp4'}));},[...bytes]);
  assert.deepEqual(received,original.inspection,'same color order, frame timestamps, duration and decoded audio samples');
  const before=await receiver.locator('#title').inputValue();await receiver.locator('#load-config').setInputFiles([jsonFile({...recipe,title:'Must not replace'}),{name:'bad.mp4',mimeType:'video/mp4',buffer:Buffer.from('broken')}]);await receiver.locator('#status.error').waitFor();assert.equal(await receiver.locator('#title').inputValue(),before,'failed combined import is atomic');
 }finally{await browser.close();}
});

test('batch without directory writing downloads one ZIP and supports an alternate output folder',async()=>{
 const browser=await launch();try{
  const page=await browser.newPage({viewport:{width:390,height:844}});await page.goto('http://127.0.0.1:8793');await page.evaluate(()=>window.showDirectoryPicker=undefined);
  await page.locator('#batch-mode-button').click();await page.locator('#batch-files').setInputFiles(jsonFile(recipe));await page.getByText('1 scene ready.',{exact:true}).waitFor();await page.locator('#batch-format').selectOption('png');
  const downloads=[];page.on('download',d=>downloads.push(d));const done=page.waitForEvent('download');await page.locator('#batch-generate').click();const result=await done;await page.getByText('1/1 scenes saved.',{exact:true}).waitFor();
  const files=unzipSync(new Uint8Array(await fs.readFile(await result.path())));assert.equal(downloads.length,1);assert.ok(files['scene/generated/scene.json']);assert.ok(files['scene/generated/references/0001.png']);assert.ok(files['batch-report.json']);
  assert.equal(await page.locator('#batch-output').isVisible(),false);await page.screenshot({path:'.work/batch-phone.png',fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.evaluate(async()=>{const out=await(await navigator.storage.getDirectory()).getDirectoryHandle('chosen-output',{create:true});window.showDirectoryPicker=async()=>out;});await page.locator('#batch-mode').selectOption('references');await page.locator('#batch-output').click();await page.locator('#batch-generate').click();await page.getByText('1/1 scenes saved.',{exact:true}).waitFor();
  const saved=await page.evaluate(async()=>{const out=await(await navigator.storage.getDirectory()).getDirectoryHandle('chosen-output'),run=await out.getDirectoryHandle('generated');return (await(await run.getFileHandle('scene.json')).getFile()).size;});assert.ok(saved>100);assert.equal(downloads.length,1,'chosen folder saves automatically without another download');
 }finally{await browser.close();}
});


test('numbered images uploaded after JSON are assigned without tapping every drawing',async()=>{
 const browser=await launch();try{
  const page=await browser.newPage();await page.goto('http://127.0.0.1:8793');await page.locator('#load-config').setInputFiles(jsonFile(recipe));await page.getByText('JSON scene loaded.',{exact:true}).waitFor();
  const bytes=await page.evaluate(async()=>{const c=document.createElement('canvas');c.width=54;c.height=96;c.getContext('2d').fillRect(0,0,54,96);return [...new Uint8Array(await(await new Promise(r=>c.toBlob(r))).arrayBuffer())];});
  await page.locator('[data-tab=draw]').click();await page.locator('#import-artwork').setInputFiles([2,1].map(i=>({name:`000${i}.png`,mimeType:'image/png',buffer:Buffer.from(bytes)})));
  await page.getByText('Drawings loaded. Ready to export.',{exact:true}).waitFor({timeout:10000});assert.equal(await page.locator('#art-count').textContent(),'2');assert.equal(await page.locator('#selection-tools').isVisible(),false);
 }finally{await browser.close();}
});

test('edited JSON can create new references while old artwork is rejected against changed visuals',async()=>{
 const browser=await launch();try{
  const page=await browser.newPage();await page.goto('http://127.0.0.1:8793');
  const edited=await page.evaluate(async recipe=>{const api=await import('/pipeline.mjs'),scene=await api.prepareScene(JSON.stringify(recipe)),doc=JSON.parse(api.sceneJSON(scene));doc.scene.camera.zoom=1.5;return doc;},recipe);
  await page.locator('#load-config').setInputFiles(jsonFile(edited));await page.getByText('Scene changed. Create new references.',{exact:true}).waitFor();
  const exported=page.waitForEvent('download');await page.locator('#export-config').click();const updated=JSON.parse(await fs.readFile(await(await exported).path(),'utf8'));assert.equal(updated.scene.camera.zoom,1.5);assert.notEqual(updated.handoff.source,edited.handoff.source);
  const before=await page.locator('#title').inputValue();await page.locator('#load-config').setInputFiles([jsonFile({...edited,title:'Invalid handoff'}),{name:'artwork.mp4',mimeType:'video/mp4',buffer:Buffer.from('irrelevant')}]);await page.locator('#status.error').waitFor();assert.equal(await page.locator('#title').inputValue(),before);assert.match(await page.locator('#status').textContent(),/references|drawing/i);
 }finally{await browser.close();}
});

test('cancelling a folder batch preserves completed saves and skips later scenes',async()=>{
 const browser=await launch();try{
  const page=await browser.newPage();await page.goto('http://127.0.0.1:8793');
  await page.evaluate(async recipe=>{
   const root=await(await navigator.storage.getDirectory()).getDirectoryHandle('cancel-batch',{create:true});
   const long={...recipe,keys:Array.from({length:100},(_,i)=>({id:`k${i}`,target:'actor:0',time:i/10,values:{headYaw:-50+i},transition:'hold'}))};
   for(const [name,doc]of [['01-done',recipe],['02-interrupted',long],['03-skipped',recipe]]){const dir=await root.getDirectoryHandle(name,{create:true}),w=await(await dir.getFileHandle('scene.json',{create:true})).createWritable();await w.write(JSON.stringify(doc));await w.close();}
   window.showDirectoryPicker=async()=>root;
  },recipe);
  await page.locator('#batch-mode-button').click();await page.locator('#batch-folder').click();await page.getByText('3 scenes ready.',{exact:true}).waitFor();await page.locator('#batch-format').selectOption('png');await page.locator('#batch-generate').click();
  await page.waitForFunction(()=>document.querySelectorAll('#batch-jobs li')[0]?.textContent.includes('Saved')&&document.querySelectorAll('#batch-jobs li')[1]?.textContent.includes('Rendering references'));
  await page.locator('#cancel').click();await page.getByText('1/3 scenes saved. Cancelled.',{exact:true}).waitFor();
  assert.match(await page.locator('#batch-jobs li').nth(2).textContent(),/Cancelled/);
  const checked=await page.evaluate(async()=>{const root=await(await navigator.storage.getDirectory()).getDirectoryHandle('cancel-batch'),done=await(await root.getDirectoryHandle('01-done')).getDirectoryHandle('generated'),last=await root.getDirectoryHandle('03-skipped');return {saved:(await(await done.getFileHandle('scene.json')).getFile()).size,skipped:await Array.fromAsync(last.keys())};});assert.ok(checked.saved>100);assert.deepEqual(checked.skipped,['scene.json']);
 }finally{await browser.close();}
});

test('retiming a large image handoff keeps every original drawing in exported JSON',async()=>{
 const browser=await launch();try{
  const page=await browser.newPage();await page.goto('http://127.0.0.1:8793');
  const doc=await page.evaluate(async recipe=>{const api=await import('/pipeline.mjs'),scene=await api.prepareScene(JSON.stringify({...recipe,keys:Array.from({length:110},(_,i)=>({id:`k${i}`,target:'actor:0',time:i/10,values:{headYaw:-55+i},transition:'hold'}))})),json=JSON.parse(api.sceneJSON(scene));json.keys=json.keys.slice(0,20);return json;},recipe);
  assert.equal(doc.handoff.slots.length,110);await page.locator('#load-config').setInputFiles(jsonFile(doc));await page.getByText('JSON scene loaded.',{exact:true}).waitFor();
  const saved=page.waitForEvent('download');await page.locator('#export-config').click();const actual=JSON.parse(await fs.readFile(await(await saved).path(),'utf8'));assert.deepEqual(actual.handoff.slots,doc.handoff.slots,'original numbered image order survives retiming and export');
 }finally{await browser.close();}
});

test('replacing drawings through the combined picker retains a recorded voiceover and pending pose',async()=>{
 const browser=await launch();try{
  const page=await browser.newPage();await page.route('**/test-media.mjs',r=>r.fulfill({contentType:'text/javascript',body:mediaHarness}));await page.goto('http://127.0.0.1:8793');
  const fixtures=await page.evaluate(async recipe=>{
   const api=await import('/pipeline.mjs'),{packProject}=await import('/test-media.mjs'),scene=await api.prepareScene(JSON.stringify(recipe));
   const wav=new Uint8Array(44+3200),v=new DataView(wav.buffer);const str=(at,s)=>[...s].forEach((c,i)=>v.setUint8(at+i,c.charCodeAt(0)));str(0,'RIFF');v.setUint32(4,wav.length-8,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,16000,true);v.setUint32(28,32000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,3200,true);for(let i=0;i<1600;i++)v.setInt16(44+i*2,Math.sin(i/10)*4000,true);
   scene.project.audioMode='recording';const archive=await packProject({...scene,recording:new Blob([wav],{type:'audio/wav'})}),canvas=document.createElement('canvas');canvas.width=54;canvas.height=96;canvas.getContext('2d').fillRect(0,0,54,96);const png=await new Promise(r=>canvas.toBlob(r));return {archive:[...new Uint8Array(await archive.arrayBuffer())],png:[...new Uint8Array(await png.arrayBuffer())]};
  },recipe);
  await page.locator('#open-project').setInputFiles({name:'voice-project.zip',mimeType:'application/zip',buffer:Buffer.from(fixtures.archive)});await page.getByText('Project restored.',{exact:true}).waitFor();
  await page.locator('[data-tab=animate]').click();await page.locator('#key-list button').first().click();await page.locator('[data-motion-channel=x]').fill('0.75');
  await page.locator('#load-config').setInputFiles([1,2].map(i=>({name:`000${i}.png`,mimeType:'image/png',buffer:Buffer.from(fixtures.png)})));await page.getByText('Drawings loaded. Ready to export.',{exact:true}).waitFor();
  assert.equal(await page.locator('#audio-mode').inputValue(),'recording');assert.equal(await page.locator('#audio-mode option[value=recording]').isDisabled(),false);assert.ok(await page.locator('#voice-review').getAttribute('src'));
  const configDownload=page.waitForEvent('download');await page.locator('#export-config').click();const edited=JSON.parse(await fs.readFile(await(await configDownload).path(),'utf8'));assert.ok(edited.keys.some(k=>k.values.x===0.75),'pending pose is committed before importing replacement drawings');
  const saved=page.waitForEvent('download');await page.locator('#export').click();const result=await fs.readFile(await(await saved).path());const inspected=await page.evaluate(async bytes=>{const {inspect}=await import('/test-media.mjs');return inspect(new Blob([new Uint8Array(bytes)],{type:'video/mp4'}));},[...result]);assert.equal(inspected.audio,true);
 }finally{await browser.close();}
});
