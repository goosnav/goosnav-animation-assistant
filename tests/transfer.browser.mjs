import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { build } from 'esbuild';
import fs from 'node:fs/promises';
import { packProject, unpackProject } from '../app/src/archive.mjs';
import { compileClip, slotAt } from '../app/src/core.mjs';
import { makeTransfer } from '../app/src/drawing-transfer.mjs';

const harness = (await build({stdin:{contents:`export * from './app/src/video.mjs'; export * from './app/src/frame-video.mjs';
import { Input, BlobSource, MP4, VideoSampleSink } from 'mediabunny';
export function badgeStats(canvas){
 const ctx=canvas.getContext('2d'),pixels=ctx.getImageData(canvas.width-500,0,500,220).data;let dark=0,blue=0;
 for(let i=0;i<pixels.length;i+=4){if(pixels[i]<45&&pixels[i+1]<45&&pixels[i+2]<45)dark++;if(pixels[i]<30&&pixels[i+1]>25&&pixels[i+1]<90&&pixels[i+2]>100&&pixels[i+2]<200)blue++;}
 return {dark,blue};
}
export async function videoBadge(blob){
 const input=new Input({source:new BlobSource(blob),formats:[MP4]}),canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1920;
 try{const sample=await new VideoSampleSink(await input.getPrimaryVideoTrack()).getSample(0);try{sample.draw(canvas.getContext('2d'),0,0,1080,1920);return badgeStats(canvas);}finally{sample.close();}}finally{input.dispose();}
}
export async function inspectMovie(blob){
 const input=new Input({source:new BlobSource(blob),formats:[MP4]});
 try{const video=await input.getPrimaryVideoTrack(),audio=await input.getPrimaryAudioTrack(),stats=await video.computePacketStats();let peak=0;
 if(audio){const ctx=new AudioContext();try{const decoded=await ctx.decodeAudioData(await blob.arrayBuffer());for(const value of decoded.getChannelData(0))peak=Math.max(peak,Math.abs(value));}finally{await ctx.close();}}
 return {fps:stats.averagePacketRate,frames:stats.packetCount,audio:audio?await audio.getCodec():null,peak};
 }finally{input.dispose();}
}
export async function samplePixels(blob,times){
 const input=new Input({source:new BlobSource(blob),formats:[MP4]}),canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1920;
 try{const sink=new VideoSampleSink(await input.getPrimaryVideoTrack()),ctx=canvas.getContext('2d'),pixels=[];
 for(const time of times){const sample=await sink.getSample(time);try{sample.draw(ctx,0,0,1080,1920);pixels.push([...ctx.getImageData(50,50,1,1).data]);}finally{sample.close();}}return pixels;
 }finally{input.dispose();canvas.width=canvas.height=1;}
}`,resolveDir:process.cwd()},bundle:true,format:'esm',write:false,platform:'browser'})).outputFiles[0].text;
async function setup(width=820){
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
 const page=await browser.newPage({viewport:{width,height:1180}});
 await page.route('**/test-video.mjs',route=>route.fulfill({contentType:'text/javascript',body:harness}));
 await page.goto('http://127.0.0.1:8793');
 await page.evaluate(async()=>{window.videoTools=await import('/test-video.mjs');});
 return {browser,page};
}
test('exact drawing video preserves all frames in order, independently of returned fps',async()=>{
 const {browser,page}=await setup();
 try{
  const result=await page.evaluate(async()=>{
   const {exportFrameVideo,extractDrawingFrames,exportMP4}=window.videoTools;
   const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;const ctx=canvas.getContext('2d');
   const colors=['#ff0000','#00ff00','#0000ff'];
   const draw=async i=>{ctx.fillStyle=colors[i];ctx.fillRect(0,0,128,128);};
   const source=await exportFrameVideo({canvas,frameCount:3,drawFrame:draw});
   window.testSource=source;
   const frames=await extractDrawingFrames(source,{width:128,height:128,expectedCount:3});
   const pixels=[];for(const frame of frames){const b=await createImageBitmap(frame);ctx.drawImage(b,0,0);b.close();pixels.push([...ctx.getImageData(64,64,1,1).data]);}
   const returned=await exportMP4({canvas,duration:3/12,fps:12,frameCount:3,exactFrames:true,draw:async t=>draw(Math.round(t*12))});
   const again=await extractDrawingFrames(returned,{width:128,height:128,expectedCount:3});
   const failures={};
   for(const [name,blob,options]of [
    ['missing',source,{width:128,height:128,expectedCount:4}],
    ['extra',source,{width:128,height:128,expectedCount:2}],
    ['corrupt',new Blob(['not video']),{width:128,height:128,expectedCount:3}]
   ]){try{await extractDrawingFrames(blob,options);}catch(e){failures[name]=e.message;}}
   const controller=new AbortController();let progress=0;
   try{await extractDrawingFrames(source,{width:128,height:128,expectedCount:3,signal:controller.signal,onProgress:()=>{progress++;controller.abort();}});}catch(e){failures.cancel=e.name;}
   // Unsupported exact encoding must not silently fall back to variable-frame capture.
   const encoder=window.VideoEncoder;window.VideoEncoder=undefined;
   try{await exportFrameVideo({canvas,frameCount:3,drawFrame:draw});}catch(e){failures.unsupported=e.message;}finally{window.VideoEncoder=encoder;}
   return {count:frames.length,again:again.length,pixels,failures,progress};
  });
  assert.equal(result.count,3);assert.equal(result.again,3);
  result.pixels.forEach((pixel,i)=>{assert.ok(pixel[i]>235);assert.ok(pixel[(i+1)%3]<20);});
  assert.match(result.failures.missing,/3 frames; expected 4/);assert.match(result.failures.extra,/3 frames; expected 2/);
  assert.match(result.failures.corrupt,/Could not read this video/);assert.equal(result.failures.cancel,'AbortError');assert.equal(result.progress,1);assert.ok(result.failures.unsupported);
 }finally{await browser.close();}
});

test('resized drawing videos fit the scene without losing frames, edges or proportions',async()=>{
 const {browser,page}=await setup();
 try{
  const results=await page.evaluate(async()=>{
   const {exportFrameVideo,extractDrawingFrames}=window.videoTools,results=[];
   for(const [sw,sh,tw,th]of [[1088,1934,1080,1920],[270,480,1080,1920],[320,180,108,192]]){
    const canvas=document.createElement('canvas');canvas.width=sw;canvas.height=sh;const ctx=canvas.getContext('2d');
    const source=await exportFrameVideo({canvas,frameCount:2,drawFrame:async i=>{ctx.fillStyle=i?'#00ff00':'#ff0000';ctx.fillRect(0,0,sw,sh);ctx.fillStyle='#0000ff';ctx.fillRect(0,0,sw*.08,sh);ctx.fillRect(sw*.92,0,sw*.08,sh);}});
    const adjustments=[];const frames=await extractDrawingFrames(source,{width:tw,height:th,expectedCount:2,background:'#ffcd00',onAdjustment:a=>adjustments.push(a)});
    canvas.width=tw;canvas.height=th;const pixels=[];
    for(const blob of frames){const image=await createImageBitmap(blob);ctx.drawImage(image,0,0);pixels.push({width:image.width,height:image.height,center:[...ctx.getImageData(tw/2,th/2,1,1).data],edge:[...ctx.getImageData(tw*.03,th/2,1,1).data],top:[...ctx.getImageData(tw/2,5,1,1).data]});image.close();}
    results.push({pixels,adjustments});
   }return results;
  });
  for(const [i,result]of results.entries()){
   assert.equal(result.pixels.length,2);assert.equal(result.adjustments.length,1);
   for(const [frame,pixel]of result.pixels.entries()){
    assert.equal(pixel.width,i===2?108:1080);assert.equal(pixel.height,i===2?192:1920);
    assert.ok(pixel.center[frame]>230);assert.ok(pixel.edge[2]>230,'left edge must remain visible');
    if(i===2){assert.ok(pixel.top[0]>240);assert.ok(pixel.top[1]>190);assert.ok(pixel.top[2]<15,'letterboxing uses scene background');}
   }
  }
 }finally{await browser.close();}
});

test('drawing video UI restores manifest, imports artwork atomically and rebuilds dialogue timing',async()=>{
 const {browser,page}=await setup();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.locator('[data-tab=rehearse]').click();await page.locator('#generate').click();await page.getByText('Speech ready.',{exact:false}).waitFor({timeout:60000});
  const count=Number(await page.locator('#drawing-count').textContent()),duration=Number(await page.locator('#duration').textContent());
  await page.locator('[data-tab=draw]').click();await page.locator('#drawing-video').click();
  await page.getByText('References ready.',{exact:false}).waitFor({timeout:90000});
  assert.equal(await page.locator('[data-view=draw]').isVisible(),true);
  await page.screenshot({path:'.work/video-reference-ipad.png',fullPage:true});
  const downloaded=page.waitForEvent('download');await page.locator('#download-drawing-video').click();const file=await downloaded;await file.saveAs('.work/drawing-reference.mp4');
  // A real encoder produces an edited return video. Distinct color marks stand in for pencil drawings.
  const bytes=await fs.readFile('.work/drawing-reference.mp4');
  const edited=await page.evaluate(async({bytes,count})=>{
   const {extractDrawingFrames,exportFrameVideo,badgeStats}=window.videoTools;
   const frames=await extractDrawingFrames(new Blob([new Uint8Array(bytes)]),{width:1080,height:1920,expectedCount:count});
   const canvas=document.createElement('canvas');canvas.width=1088;canvas.height=1934;const ctx=canvas.getContext('2d');
   const badges=[];
   const blob=await exportFrameVideo({canvas,frameCount:count,drawFrame:async i=>{const image=await createImageBitmap(frames[i]);ctx.drawImage(image,0,0,canvas.width,canvas.height);image.close();badges.push(badgeStats(canvas));ctx.fillStyle='white';ctx.fillRect(canvas.width-510,0,510,250);ctx.fillStyle=`rgb(${20+(i%4)*60},${30+Math.floor(i/4)*70},220)`;ctx.fillRect(0,0,100,100);}});
   return {bytes:[...new Uint8Array(await blob.arrayBuffer())],referencePNG:[...new Uint8Array(await frames[0].arrayBuffer())],badges};
  },{bytes:[...bytes],count});
  await fs.writeFile('.work/reference-labeled.png',Buffer.from(edited.referencePNG));
  assert.ok(edited.badges.every(b=>b.dark>300&&b.blue>100),'every MP4 reference has a visible corner label');
  const returned=edited.bytes;
  await fs.writeFile('.work/drawing-return.mp4',Buffer.from(returned));
  // Save a portable backup, then reload so transfer identity cannot rely on transient JS state.
  await page.locator('.project-tools summary').click();const backupWait=page.waitForEvent('download');await page.locator('#save-project').click();await (await backupWait).saveAs('.work/transfer-backup.zip');
  await page.reload();await page.getByText('Project restored.',{exact:false}).waitFor();
  await page.locator('[data-tab=draw]').click();assert.equal(await page.locator('input[type=file][accept*=video]').count(),1);assert.equal(await page.locator('#import-artwork').isEnabled(),true);
  await page.locator('#import-artwork').setInputFiles('.work/drawing-return.mp4');
  await page.getByText(`${count} drawings imported. Resized to fit.`,{exact:true}).waitFor({timeout:90000});
  assert.equal(await page.locator('#art-count').textContent(),String(count));assert.equal(await page.locator('#assigned-gallery img').count(),count);
  assert.equal(await page.locator('#returned-video').count(),0);assert.equal(await page.locator('#duration').textContent(),String(duration.toFixed(1)));
  // Reference-only grids must not change assigned drawings or appear in the final movie.
  await page.locator('[data-tab=stage]').click();await page.locator('#ground-grid').check();await page.locator('#backdrop-grid').check();
  assert.equal(await page.locator('#art-count').textContent(),String(count));await page.locator('[data-tab=draw]').click();
  // Failure must leave the successfully imported drawings and preview intact; same file can retry.
  await page.locator('#import-artwork').setInputFiles({name:'bad.mp4',mimeType:'video/mp4',buffer:Buffer.from('broken')});
  await page.locator('#status.error').waitFor();assert.equal(await page.locator('#art-count').textContent(),String(count));assert.equal(await page.locator('#import-artwork').inputValue(),'');
  await page.locator('[data-tab=finish]').click();assert.equal(await page.locator('#audio-mode').inputValue(),'robot');assert.equal(await page.locator('#voiceover-options').getAttribute('open'),null);await page.locator('#export').click();await page.getByText('Animation ready to save.',{exact:false}).waitFor({timeout:90000});
  assert.ok(await page.locator('#final-video').evaluate(v=>v.duration)>count/24+1);
  const movieInfo=await page.evaluate(async()=>{const {inspectMovie}=await import('/test-video.mjs');return inspectMovie(await (await fetch(document.querySelector('#final-video').src)).blob());});
  assert.ok(Math.abs(movieInfo.fps-24)<.01);assert.equal(movieInfo.audio,'aac');assert.ok(movieInfo.peak>.05,'default export must contain audible robot speech');
  const finalBadge=await page.evaluate(async()=>{const {videoBadge}=await import('/test-video.mjs');return videoBadge(await (await fetch(document.querySelector('#final-video').src)).blob());});
  assert.equal(finalBadge.dark,0,'final animation must not add reference labels');assert.equal(finalBadge.blue,0);
  const saved=await unpackProject(new Blob([await fs.readFile('.work/transfer-backup.zip')]));
  const planned=compileClip(saved.project,saved.takes,saved.project.slots);
  const times=[0,.4,.7,1,2,3,5];
  const actualPixels=await page.evaluate(async times=>{const {samplePixels}=await import('/test-video.mjs');return samplePixels(await (await fetch(document.querySelector('#final-video').src)).blob(),times);},times);
  for(const [i,time]of times.entries()){
   const referenceIndex=saved.transfer.slots.findIndex(s=>s.id===slotAt(planned,time).id);
   const expected=[20+(referenceIndex%4)*60,30+Math.floor(referenceIndex/4)*70,220];
   for(let channel=0;channel<3;channel++)assert.ok(Math.abs(actualPixels[i][channel]-expected[channel])<24,`Wrong drawing at ${time}s: ${actualPixels[i]} vs ${expected}`);
  }
  // Speech speed must regenerate audio and phonemes without asking for a second Generate click.
  await page.locator('#rate').fill('1.5');await page.locator('#rate').dispatchEvent('change');await page.getByText('Speech ready.',{exact:true}).waitFor({timeout:60000});
  assert.ok(Number(await page.locator('#duration').textContent())<duration*.85);assert.equal(await page.locator('#art-count').textContent(),String(count));
  assert.equal(await page.locator('#audio-mode').inputValue(),'robot');await page.locator('#export').click();await page.getByText('Animation ready to save.',{exact:true}).waitFor({timeout:90000});
  const faster=await page.evaluate(async()=>{const {inspectMovie}=await import('/test-video.mjs');return inspectMovie(await (await fetch(document.querySelector('#final-video').src)).blob());});
  assert.equal(faster.audio,'aac');assert.ok(faster.peak>.05);assert.ok(faster.frames<movieInfo.frames*.85);assert.ok(Math.abs(faster.fps-24)<.01);
  await page.screenshot({path:'.work/video-transfer-ipad.png',fullPage:true});
  await page.locator('#new').click();await page.getByText('New clip.',{exact:false}).waitFor();await page.locator('[data-tab=draw]').click();assert.equal(await page.locator('#drawing-video-result').isVisible(),false);
  assert.equal(await page.locator('#import-artwork').isDisabled(),true);
  await page.locator('.project-tools summary').click();await page.locator('#open-project').setInputFiles('.work/transfer-backup.zip');await page.getByText('Project restored.',{exact:false}).waitFor();
  assert.equal(await page.locator('#import-artwork').isEnabled(),true);
  // A saved project from the removed importer must recover artwork, never passthrough.
  const unlabeled=await page.evaluate(async()=>{const c=document.createElement('canvas');c.width=1080;c.height=1920;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);return [...new Uint8Array(await (await new Promise(r=>c.toBlob(r))).arrayBuffer())];});
  const legacy={...saved,refs:Object.fromEntries(Object.keys(saved.refs).map(id=>[id,new Blob([Buffer.from(unlabeled)],{type:'image/png'})])),thumbs:{},refsVersion:0,project:{...saved.project,fps:6,audioMode:'silent'},transfer:{...saved.transfer,version:1,fps:6},video:new Blob([Buffer.from(returned)],{type:'video/mp4'}),art:{}};
  await fs.writeFile('.work/legacy-video.zip',Buffer.from(await (await packProject(legacy)).arrayBuffer()));
  await page.locator('#open-project').setInputFiles('.work/legacy-video.zip');await page.getByText('Project restored.',{exact:true}).waitFor({timeout:60000});
  assert.equal(await page.locator('#art-count').textContent(),String(count));assert.equal(await page.locator('#audio-mode').inputValue(),'robot');
  assert.equal(await page.locator('#duration').textContent(),duration.toFixed(1));
  // Older cached references must regenerate labels without replacing imported art.
  await page.locator('#drawing-video').click();await page.getByText('References ready.',{exact:true}).waitFor({timeout:90000});
  assert.equal(await page.locator('#art-count').textContent(),String(count));
  const labeledDownload=page.waitForEvent('download');await page.locator('#download-drawing-video').click();await (await labeledDownload).saveAs('.work/labeled-restored.mp4');
  const restoredInk=await page.evaluate(async bytes=>{const {videoBadge}=await import('/test-video.mjs');return videoBadge(new Blob([new Uint8Array(bytes)]));},[...await fs.readFile('.work/labeled-restored.mp4')]);
  assert.ok(restoredInk.dark>300&&restoredInk.blue>100);
  await page.setViewportSize({width:390,height:844});await page.locator('[data-tab=draw]').click();await page.evaluate(()=>scrollTo(0,0));
  const uploadBox=await page.locator('label:has(#import-artwork)').boundingBox();assert.ok(uploadBox.y+uploadBox.height<844,'Upload should be visible without scrolling on a phone');
  await page.locator('#assigned-gallery button').nth(2).click();await page.waitForFunction(()=>document.querySelectorAll('#assigned-gallery button')[2]?.getAttribute('aria-pressed')==='true');assert.equal(await page.locator('#assigned-gallery button').nth(2).getAttribute('aria-pressed'),'true');
  await page.screenshot({path:'.work/simplified-phone.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.locator('[data-tab=rehearse]').click();await page.locator('textarea').first().fill('New dialogue.');await page.locator('textarea').first().dispatchEvent('change');
  await page.locator('[data-tab=draw]').click();assert.equal(await page.locator('#assigned-gallery button').count(),0);
  // Genuine old sampling omitted a short mouth shape. Recover its drawings without inventing the missing one.
  const oldProject=structuredClone(saved.project);oldProject.fps=6;oldProject.lines=oldProject.lines.slice(0,1);oldProject.slots=[];
  const oldClip=compileClip(oldProject,saved.takes);oldProject.slots=oldClip.slots;
  const oldTransfer={...makeTransfer(oldProject,oldClip),version:1,fps:6};
  const upgraded=compileClip({...oldProject,fps:24},saved.takes,oldProject.slots);
  assert.ok(upgraded.slots.length>oldClip.slots.length,'fixture must contain a newly sampled mouth');
  const oldVideo=await page.evaluate(async count=>{const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1920;const ctx=canvas.getContext('2d');const {exportFrameVideo}=await import('/test-video.mjs');const blob=await exportFrameVideo({canvas,frameCount:count,drawFrame:async i=>{ctx.fillStyle=`rgb(${i*35},30,200)`;ctx.fillRect(0,0,1080,1920);}});return [...new Uint8Array(await blob.arrayBuffer())];},oldTransfer.slots.length);
  await fs.writeFile('.work/genuine-legacy.zip',Buffer.from(await (await packProject({project:oldProject,takes:saved.takes,transfer:oldTransfer,art:{},video:new Blob([Buffer.from(oldVideo)],{type:'video/mp4'})})).arrayBuffer()));
  await page.locator('#open-project').setInputFiles('.work/genuine-legacy.zip');await page.getByText('Project restored.',{exact:true}).waitFor({timeout:60000});
  assert.equal(await page.locator('#art-count').textContent(),String(oldTransfer.slots.length));
  assert.equal(await page.locator('#drawing-count').textContent(),String(upgraded.slots.length));
  assert.match(await page.locator('#transfer-summary').textContent(),/new mouth drawings needed/);
  assert.equal(await page.locator('#scrub').getAttribute('step'),String(1/24));assert.equal(await page.locator('#export').isDisabled(),true);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('independent B-frame videos decode in presentation order and honor rotation',async()=>{
 const {browser,page}=await setup();
 try{
  for(const rotated of [false,true]){
   const bytes=await fs.readFile(`tests/fixtures/drawings-${rotated?'rotated':'bframes'}.mp4`);
   const pixels=await page.evaluate(async({bytes,rotated})=>{
    const {extractDrawingFrames}=window.videoTools,width=rotated?64:128,height=rotated?128:64;
    const frames=await extractDrawingFrames(new Blob([new Uint8Array(bytes)]),{width,height,expectedCount:8});
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d'),colors=[];
    for(const frame of frames){const bitmap=await createImageBitmap(frame);ctx.drawImage(bitmap,0,0);bitmap.close();colors.push([...ctx.getImageData(32,rotated?96:32,1,1).data]);}return colors;
   },{bytes:[...bytes],rotated});
   assert.equal(pixels.length,8);
   pixels.forEach((pixel,i)=>{assert.ok(pixel[i%3]>225,`frame ${i}, rotated=${rotated}: ${pixel}`);assert.ok(pixel[(i+1)%3]<25,`Unexpected color frame ${i}, rotated=${rotated}: ${pixel}`);});
  }
 }finally{await browser.close();}
});
