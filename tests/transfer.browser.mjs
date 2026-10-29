import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { build } from 'esbuild';
import fs from 'node:fs/promises';
import { unpackProject } from '../app/src/archive.mjs';
import { compileClip, slotAt } from '../app/src/core.mjs';

const harness = (await build({stdin:{contents:`export * from './app/src/video.mjs'; export * from './app/src/frame-video.mjs';
import { Input, BlobSource, MP4, VideoSampleSink } from 'mediabunny';
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
    ['dimensions',source,{width:1920,height:1080,expectedCount:3}],
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
  assert.match(result.failures.dimensions,/128 × 128/);assert.ok(result.failures.corrupt);assert.equal(result.failures.cancel,'AbortError');assert.equal(result.progress,1);assert.ok(result.failures.unsupported);
 }finally{await browser.close();}
});

test('drawing video UI restores manifest, imports artwork atomically and rebuilds dialogue timing',async()=>{
 const {browser,page}=await setup();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.locator('[data-tab=rehearse]').click();await page.locator('#generate').click();await page.getByText('Animation ready.',{exact:false}).waitFor({timeout:60000});
  const count=Number(await page.locator('#drawing-count').textContent()),duration=Number(await page.locator('#duration').textContent());
  await page.locator('[data-tab=draw]').click();await page.locator('#drawing-video').click();
  await page.getByText('Drawing video ready.',{exact:false}).waitFor({timeout:90000});
  assert.equal(await page.locator('[data-view=draw]').isVisible(),true);
  await page.screenshot({path:'.work/video-reference-ipad.png',fullPage:true});
  const downloaded=page.waitForEvent('download');await page.locator('#download-drawing-video').click();const file=await downloaded;await file.saveAs('.work/drawing-reference.mp4');
  // A real encoder produces an edited return video. Distinct color marks stand in for pencil drawings.
  const bytes=await fs.readFile('.work/drawing-reference.mp4');
  const returned=await page.evaluate(async({bytes,count})=>{
   const {extractDrawingFrames,exportFrameVideo}=window.videoTools;
   const frames=await extractDrawingFrames(new Blob([new Uint8Array(bytes)]),{width:1080,height:1920,expectedCount:count});
   const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1920;const ctx=canvas.getContext('2d');
   const blob=await exportFrameVideo({canvas,frameCount:count,drawFrame:async i=>{const image=await createImageBitmap(frames[i]);ctx.drawImage(image,0,0);image.close();ctx.fillStyle=`rgb(${20+i*20},30,220)`;ctx.fillRect(0,0,100,100);}});
   return [...new Uint8Array(await blob.arrayBuffer())];
  },{bytes:[...bytes],count});
  await fs.writeFile('.work/drawing-return.mp4',Buffer.from(returned));
  // Save a portable backup, then reload so transfer identity cannot rely on transient JS state.
  await page.locator('.project-tools summary').click();const backupWait=page.waitForEvent('download');await page.locator('#save-project').click();await (await backupWait).saveAs('.work/transfer-backup.zip');
  await page.reload();await page.getByText('Project restored.',{exact:false}).waitFor();
  await page.locator('[data-tab=assemble]').click();assert.match(await page.locator('#transfer-summary').textContent(),new RegExp(`${count} frames`));
  await page.locator('#import-drawing-video').setInputFiles('.work/drawing-return.mp4');
  await page.getByText('Drawings extracted and assembled.',{exact:false}).waitFor({timeout:90000});
  assert.equal(await page.locator('#art-count').textContent(),String(count));assert.equal(await page.locator('#assigned-gallery img').count(),count);
  assert.equal(await page.locator('#returned-video').isVisible(),false);assert.equal(await page.locator('#duration').textContent(),String(duration.toFixed(1)));
  // Failure must leave the successfully imported drawings and preview intact; same file can retry.
  await page.locator('#import-drawing-video').setInputFiles({name:'bad.mp4',mimeType:'video/mp4',buffer:Buffer.from('broken')});
  await page.locator('#status.error').waitFor();assert.equal(await page.locator('#art-count').textContent(),String(count));assert.equal(await page.locator('#import-drawing-video').inputValue(),'');
  await page.locator('[data-tab=finish]').click();await page.locator('#audio-mode').selectOption('silent');await page.locator('#export').click();await page.getByText('MP4 ready.',{exact:false}).waitFor({timeout:90000});
  assert.ok(await page.locator('#final-video').evaluate(v=>v.duration)>count/6+1);
  const saved=await unpackProject(new Blob([await fs.readFile('.work/transfer-backup.zip')]));
  const planned=compileClip(saved.project,saved.takes,saved.project.slots);
  const times=[0,.4,.7,1,2,3,5];
  const actualPixels=await page.evaluate(async times=>{const {samplePixels}=await import('/test-video.mjs');return samplePixels(await (await fetch(document.querySelector('#final-video').src)).blob(),times);},times);
  for(const [i,time]of times.entries()){
   const referenceIndex=saved.transfer.slots.findIndex(s=>s.id===slotAt(planned,time).id);
   const expected=[20+referenceIndex*20,30,220];
   for(let channel=0;channel<3;channel++)assert.ok(Math.abs(actualPixels[i][channel]-expected[channel])<15,`Wrong drawing at ${time}s: ${actualPixels[i]} vs ${expected}`);
  }
  await page.screenshot({path:'.work/video-transfer-ipad.png',fullPage:true});
  await page.locator('#new').click();await page.getByText('New clip.',{exact:false}).waitFor();await page.locator('[data-tab=draw]').click();assert.equal(await page.locator('#drawing-video-result').isVisible(),false);
  await page.locator('[data-tab=assemble]').click();assert.match(await page.locator('#transfer-summary').textContent(),/Export a drawing-reference video/);
  await page.locator('.project-tools summary').click();await page.locator('#open-project').setInputFiles('.work/transfer-backup.zip');await page.getByText('Project restored.',{exact:false}).waitFor();
  assert.match(await page.locator('#transfer-summary').textContent(),new RegExp(`${count} frames`));
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
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
