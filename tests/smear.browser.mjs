import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { build } from 'esbuild';
import { unpackProject } from '../app/src/archive.mjs';
import { compileClip } from '../app/src/core.mjs';
const harness=(await build({stdin:{contents:`export {Stage} from './app/src/stage.mjs'; export {exportFrameVideo} from './app/src/frame-video.mjs';
export {Input,BlobSource,MP4,VideoSampleSink} from 'mediabunny';`,resolveDir:process.cwd()},bundle:true,format:'esm',write:false,platform:'browser'})).outputFiles[0].text;

test('optional smear guides deform only moving parts, reset cleanly, and export drawn frames at the planned times',async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:820,height:1180}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/smear-tools.mjs',route=>route.fulfill({contentType:'text/javascript',body:harness}));
  await page.goto('http://127.0.0.1:8793');await page.locator('[data-framing=solo]').click();
  await page.locator('[data-tab=rehearse]').click();await page.locator('[data-remove-line="1"]').click();
  await page.locator('textarea').fill('Move.');await page.locator('textarea').dispatchEvent('change');
  await page.locator('#generate').click();await page.getByText('Speech ready.',{exact:true}).waitFor({timeout:60000});
  await page.locator('.line details summary').click();const smear=page.locator('[data-line-key=smear]');assert.equal(await smear.isChecked(),false);
  const staticCount=await page.locator('#drawing-count').textContent();await smear.check();assert.equal(await page.locator('#drawing-count').textContent(),staticCount);
  await smear.uncheck();await page.locator('[data-line-key=pose]').selectOption('point');const posedCount=Number(await page.locator('#drawing-count').textContent());
  await smear.check();const count=Number(await page.locator('#drawing-count').textContent());assert.ok(count>posedCount&&count<=posedCount+2);
  await page.locator('[data-tab=draw]').click();await page.locator('#drawing-video').click();await page.getByText('References ready.',{exact:true}).waitFor({timeout:90000});
  await page.screenshot({path:'.work/smear-ipad.png',fullPage:true});
  await page.locator('.project-tools summary').click();const download=page.waitForEvent('download');await page.locator('#save-project').click();
  const saved=await unpackProject(new Blob([await fs.readFile(await (await download).path())]));
  const plan=compileClip(saved.project,saved.takes,saved.project.slots),smearSlot=plan.slots.find(s=>s.active&&s.state.smears);
  assert.ok(smearSlot);const flashes=plan.exposures.filter(e=>plan.slots.find(s=>s.id===e.slotId).state.smears);assert.ok(flashes.length>=2);assert.ok(flashes.every(e=>e.endFrame-e.startFrame===1));
  const render=await page.evaluate(async state=>{
   const {Stage}=await import('/smear-tools.mjs'),canvas=document.createElement('canvas'),stage=new Stage(canvas),capture=document.createElement('canvas');capture.width=540;capture.height=960;const ctx=capture.getContext('2d');
   const base=structuredClone(state);delete base.smears;const other=structuredClone(base);Object.assign(other.scene.actors[0],{pose:state.smears[0].pose,headYaw:state.smears[0].headYaw});
   const pixels=()=>{ctx.drawImage(canvas,0,0);return ctx.getImageData(0,0,540,960).data;};
   const png=async()=>[...new Uint8Array(await (await new Promise(r=>capture.toBlob(r))).arrayBuffer())];
   const diff=(a,b)=>{let changed=0;for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>15)changed++;return changed;};
   try{await stage.prepare(state.scene);stage.draw(base,540,960);const before=pixels(),beforePng=await png();stage.draw(state,540,960);const middle=pixels(),middlePng=await png();stage.draw(other,540,960);const after=pixels(),afterPng=await png();stage.draw(base,540,960);const reset=pixels();return {before:beforePng,middle:middlePng,after:afterPng,diffBefore:diff(before,middle),diffAfter:diff(after,middle),reset:diff(before,reset),stillLegs:diff(before.slice(540*740*4),middle.slice(540*740*4))};}finally{stage.dispose();}
  },smearSlot.state);
  assert.ok(render.diffBefore>1000&&render.diffAfter>1000);assert.equal(render.reset,0,'normal render must restore bone scales');assert.equal(render.stillLegs,0,'stationary lower body stays stable');
  for(const name of ['before','middle','after'])await fs.writeFile(`.work/smear-${name}.png`,Buffer.from(render[name]));
  const returned=await page.evaluate(async count=>{const {exportFrameVideo}=await import('/smear-tools.mjs');const c=document.createElement('canvas');c.width=1080;c.height=1920;const ctx=c.getContext('2d');const movie=await exportFrameVideo({canvas:c,frameCount:count,drawFrame:async i=>{ctx.fillStyle=`rgb(${20+(i%4)*60},${30+Math.floor(i/4)*70},220)`;ctx.fillRect(0,0,c.width,c.height);}});return [...new Uint8Array(await movie.arrayBuffer())];},count);
  await page.locator('#import-artwork').setInputFiles({name:'drawn-smears.mp4',mimeType:'video/mp4',buffer:Buffer.from(returned)});await page.getByText(`${count} drawings imported.`,{exact:true}).waitFor({timeout:60000});
  await page.locator('[data-tab=finish]').click();await page.locator('#export').click();await page.getByText('Animation ready to save.',{exact:true}).waitFor({timeout:90000});
  const times=flashes.flatMap(e=>[Math.max(0,e.startFrame-1),e.startFrame,e.endFrame]).map(f=>(f+.5)/plan.fps);
  const pixels=await page.evaluate(async times=>{const {Input,BlobSource,MP4,VideoSampleSink}=await import('/smear-tools.mjs'),input=new Input({source:new BlobSource(await (await fetch(document.querySelector('#final-video').src)).blob()),formats:[MP4]}),c=document.createElement('canvas');c.width=1080;c.height=1920;const ctx=c.getContext('2d'),out=[];try{const sink=new VideoSampleSink(await input.getPrimaryVideoTrack());for(const t of times){const sample=await sink.getSample(t);try{sample.draw(ctx,0,0,c.width,c.height);out.push([...ctx.getImageData(50,50,1,1).data]);}finally{sample.close();}}return out;}finally{input.dispose();}},times);
  for(const [i,t]of times.entries()){const f=Math.floor(t*plan.fps),exposure=plan.exposures.find(e=>f>=e.startFrame&&f<e.endFrame),index=saved.transfer.slots.findIndex(s=>s.id===exposure.slotId),color=[20+(index%4)*60,30+Math.floor(index/4)*70,220];for(let channel=0;channel<3;channel++)assert.ok(Math.abs(pixels[i][channel]-color[channel])<20,`incorrect smear exposure at ${t}: ${pixels[i]} vs ${color}`);}
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
