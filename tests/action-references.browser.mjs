import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {build} from 'esbuild';
import {unpackProject} from '../app/src/archive.mjs';
const harness=(await build({stdin:{contents:"export {Input,BlobSource,MP4,VideoSampleSink} from 'mediabunny';",resolveDir:process.cwd()},bundle:true,format:'esm',write:false})).outputFiles[0].text;

test('choosing arm flail then creating references exports the complete motion without manual keys',async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:820,height:1180}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/action-video-tools.mjs',r=>r.fulfill({body:harness,contentType:'text/javascript'}));
  await page.goto('http://127.0.0.1:8793');await page.locator('[data-tab=animate]').click();await page.locator('#timing-mode').selectOption('silent');
  // Replacing a previously exported still must also refresh the reference cache.
  await page.locator('[data-tab=draw]').click();await page.locator('#drawing-video').click();await page.getByText('References ready.',{exact:true}).waitFor({timeout:90000});assert.equal(await page.locator('#reference-gallery button').count(),1);
  await page.locator('[data-tab=animate]').click();await page.locator('#gesture-preset').selectOption('arm_flail');
  // Selecting an action and continuing to Draw must not silently export a still.
  await page.locator('[data-tab=draw]').click();
  assert.ok(Number(await page.locator('#drawing-count').textContent())>=10,'the selected action must generate its motion before reference export');
  await page.locator('#drawing-video').click();await page.getByText('References ready.',{exact:true}).waitFor({timeout:90000});
  assert.ok(await page.locator('#reference-gallery button').count()>=10);
  const download=page.waitForEvent('download');await page.locator('#download-drawing-video').click();const movie=await fs.readFile(await(await download).path());
  const decoded=await page.evaluate(async bytes=>{
   const {Input,BlobSource,MP4,VideoSampleSink}=await import('/action-video-tools.mjs');const input=new Input({source:new BlobSource(new Blob([new Uint8Array(bytes)])),formats:[MP4]});
   try{const track=await input.getPrimaryVideoTrack(),canvas=document.createElement('canvas');canvas.width=160;canvas.height=284;const ctx=canvas.getContext('2d'),frames=[];
    for await(const sample of new VideoSampleSink(track).samples()){try{sample.draw(ctx,0,0,160,284);frames.push([...ctx.getImageData(0,55,160,210).data]);}finally{sample.close();}}
    return {count:frames.length,differences:frames.slice(1).map(frame=>frame.reduce((n,v,i)=>n+(Math.abs(v-frames[0][i])>25?1:0),0))};
   }finally{input.dispose();}
  },[...movie]);
  assert.equal(decoded.count,await page.locator('#reference-gallery button').count(),'every reference must be encoded');
  assert.ok(decoded.differences.filter(n=>n>500).length>=8,'frames must contain visibly different body poses, not copies of the still');
  await page.locator('.project-tools summary').click();const savedDownload=page.waitForEvent('download');await page.locator('#save-project').click();
  const saved=await unpackProject(new Blob([await fs.readFile(await(await savedDownload).path())]));
  assert.equal(saved.project.animation.keys.length,6,'action must be inserted exactly once');assert.equal(saved.transfer.slots.length,decoded.count);
  await page.reload();await page.getByText('Project restored.',{exact:true}).waitFor();await page.locator('[data-tab=animate]').click();assert.equal(await page.locator('[data-key-id]').count(),6);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('pending actions keep their character and timing, apply once, and can be discarded or corrected',async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
 try{
  const page=await browser.newPage();await page.goto('http://127.0.0.1:8793');await page.locator('[data-tab=animate]').click();await page.locator('#timing-mode').selectOption('silent');
  await page.locator('#key-time').fill('1');await page.locator('#key-time').dispatchEvent('change');await page.locator('#gesture-preset').selectOption('arm_flail');await page.locator('#action-duration').fill('3');
  await page.locator('#motion-target').selectOption('actor:1');assert.equal(await page.locator('[data-key-id]').count(),0,'selection belongs to the original character');
  await page.locator('#motion-target').selectOption('actor:0');assert.equal(await page.locator('[data-key-id]').count(),6);assert.match(await page.locator('[data-key-id]').first().textContent(),/1.00/);assert.match(await page.locator('[data-key-id]').last().textContent(),/4.00/);
  await page.locator('#gesture-preset').selectOption('nod');await page.locator('#discard-action').click();await page.locator('[data-tab=draw]').click();await page.locator('[data-tab=animate]').click();assert.equal(await page.locator('[data-key-id]').count(),6);
  await page.locator('#gesture-preset').selectOption('wave');await page.locator('#action-duration').fill('0');await page.locator('[data-tab=draw]').click();assert.equal(await page.locator('[data-view=animate]').isVisible(),true,'invalid actions must not silently export old references');assert.match(await page.locator('#status').textContent(),/duration/);
  await page.locator('#action-duration').fill('1.8');await page.locator('#add-gesture').click();const keys=await page.locator('[data-key-id]').count();await page.locator('[data-tab=draw]').click();await page.locator('[data-tab=animate]').click();assert.equal(await page.locator('[data-key-id]').count(),keys,'explicit Add action must not be applied twice');
 }finally{await browser.close();}
});

test('retiming a selected key does not move the queued action start',async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
 try{
  const page=await browser.newPage();await page.goto('http://127.0.0.1:8793');await page.locator('[data-tab=animate]').click();await page.locator('#timing-mode').selectOption('silent');await page.locator('#set-key').click();
  await page.locator('#gesture-preset').selectOption('arm_flail');await page.locator('#key-position').fill('2');await page.locator('#key-position').dispatchEvent('change');
  await page.locator('[data-tab=draw]').click();await page.locator('[data-tab=animate]').click();
  assert.match(await page.locator('[data-key-id]').first().textContent(),/0.00/,'action must keep its chosen start time');assert.match(await page.locator('[data-key-id]').last().textContent(),/2.00/);
 }finally{await browser.close();}
});
