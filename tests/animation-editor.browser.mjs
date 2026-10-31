import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import {build} from 'esbuild';
import {unpackProject} from '../app/src/archive.mjs';
import {compileClip,slotAt} from '../app/src/core.mjs';
const harness=(await build({stdin:{contents:`export {exportFrameVideo} from './app/src/frame-video.mjs';export {Input,BlobSource,MP4,VideoSampleSink} from 'mediabunny';`,resolveDir:process.cwd()},bundle:true,format:'esm',platform:'browser',write:false})).outputFiles[0].text;

test('animation step supports silent duration, editable poses and prop keys without speech',async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:820,height:1180}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/animation-test-tools.mjs',r=>r.fulfill({contentType:'text/javascript',body:harness}));await page.goto('http://127.0.0.1:8793');
  assert.equal(await page.locator('[data-tab=animate]').count(),1,'Animation must be a normal workflow step');
  await page.locator('[data-tab=animate]').click();await page.locator('#timing-mode').selectOption('silent');await page.locator('#clip-length').fill('4');await page.locator('#clip-length').dispatchEvent('change');
  assert.equal(await page.locator('#duration').textContent(),'4.0');assert.equal(await page.locator('#play').isEnabled(),true);
  await page.locator('[data-tab=stage]').click();await page.locator('#cast-count').selectOption('1');assert.equal(await page.locator('#duration').textContent(),'4.0');await page.locator('#cast-count').selectOption('2');await page.locator('[data-tab=animate]').click();
  await page.locator('#gesture-preset').selectOption('wave');await page.locator('#add-gesture').click();assert.ok(await page.locator('[data-key-id]').count()>=3);
  await page.locator('[data-tab=stage]').click();await page.locator('#objects summary').click();await page.locator('#prop-kind').selectOption('cube');await page.locator('#add-prop').click();
  await page.locator('[data-tab=animate]').click();await page.locator('#motion-target').selectOption({label:'Cube 1'});
  await page.locator('#key-time').fill('2');await page.locator('#key-time').dispatchEvent('change');await page.locator('[data-motion-channel=x]').fill('0.5');await page.locator('[data-motion-channel=x]').dispatchEvent('input');await page.locator('#set-key').click();
  assert.equal(await page.locator('#key-list [data-key-id]').count(),1);
  await page.locator('#key-time').fill('2.125');await page.locator('#key-time').dispatchEvent('change');await page.locator('[data-motion-channel=x]').fill('1.25');await page.locator('[data-motion-channel=x]').dispatchEvent('input');await page.locator('#set-key').click();
  assert.equal(await page.locator('#key-list [data-key-id]').count(),2);
  await page.locator('#key-time').fill('4');await page.locator('#key-time').dispatchEvent('change');assert.equal(await page.locator('[data-motion-channel=x]').inputValue(),'1.25');
  await page.locator('#key-list [data-key-id]').last().click();await page.locator('#next-frame').click();assert.equal(await page.locator('#remove-key').isDisabled(),true);
  await page.screenshot({path:'.work/animation-keyframes-ipad.png',fullPage:true});
  await page.locator('[data-tab=draw]').click();assert.equal(await page.locator('#drawing-video').isEnabled(),true);
  await page.locator('#drawing-video').click();await page.getByText('References ready.',{exact:true}).waitFor({timeout:90000});
  await page.locator('.project-tools summary').click();const download=page.waitForEvent('download');await page.locator('#save-project').click();const saved=await unpackProject(new Blob([await fs.readFile(await (await download).path())]));
  const plan=compileClip(saved.project,saved.takes,saved.project.slots),wipe=plan.slots.find(s=>s.active&&s.state.motionWipes);assert.ok(wipe,'fast prop move must request a wipe');
  const exposure=plan.exposures.find(e=>e.slotId===wipe.id);assert.equal(exposure.endFrame-exposure.startFrame,1);await fs.writeFile('.work/wipe-reference.png',Buffer.from(await saved.refs[wipe.id].arrayBuffer()));
  const red=await page.evaluate(async bytes=>{const image=await createImageBitmap(new Blob([new Uint8Array(bytes)],{type:'image/png'})),canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1920;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);image.close();const d=ctx.getImageData(0,1720,1080,200).data;let red=0;for(let i=0;i<d.length;i+=4)if(d[i]>120&&d[i]>d[i+1]*1.6&&d[i]>d[i+2]*1.6)red++;return red;},[...new Uint8Array(await saved.refs[wipe.id].arrayBuffer())]);assert.ok(red>1000,'real exported wipe frame must include its red instruction');
  const count=saved.transfer.slots.length;assert.ok(count<30,'limited motion should not require redrawing every video frame');
  const returned=await page.evaluate(async count=>{const {exportFrameVideo}=await import('/animation-test-tools.mjs');const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1920;const ctx=canvas.getContext('2d');const movie=await exportFrameVideo({canvas,frameCount:count,drawFrame:async i=>{ctx.fillStyle=`rgb(${20+(i%5)*45},${20+Math.floor(i/5)*45},190)`;ctx.fillRect(0,0,1080,1920);}});return [...new Uint8Array(await movie.arrayBuffer())];},count);
  await page.locator('#import-artwork').setInputFiles({name:'drawn-animation.mp4',mimeType:'video/mp4',buffer:Buffer.from(returned)});await page.getByText(`${count} drawings imported.`,{exact:true}).waitFor({timeout:60000});
  await page.reload();await page.getByText('Project restored.',{exact:true}).waitFor();assert.equal(await page.locator('#art-count').textContent(),String(count),'imported drawings must survive immediate reload');await page.locator('[data-tab=animate]').click();assert.equal(await page.locator('#timing-mode').inputValue(),'silent');assert.equal(await page.locator('#duration').textContent(),'4.0');assert.equal(await page.locator('#stage-canvas').isVisible(),true);assert.equal(await page.locator('#art-canvas').isVisible(),false);
  await page.locator('[data-tab=finish]').click();assert.equal(await page.locator('#audio-mode').inputValue(),'silent');await page.locator('#export').click();await page.getByText('Animation ready to save.',{exact:true}).waitFor({timeout:90000});
  const times=[.1,.6,1.1,2.01,(exposure.startFrame+.5)/24,2.3,3.9];
  const movie=await page.evaluate(async times=>{const {Input,BlobSource,MP4,VideoSampleSink}=await import('/animation-test-tools.mjs');const input=new Input({source:new BlobSource(await (await fetch(document.querySelector('#final-video').src)).blob()),formats:[MP4]});try{const track=await input.getPrimaryVideoTrack(),sink=new VideoSampleSink(track),canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1920;const ctx=canvas.getContext('2d'),colors=[];for(const t of times){const sample=await sink.getSample(t);sample.draw(ctx,0,0,1080,1920);colors.push([...ctx.getImageData(540,1860,1,1).data]);sample.close();}return {audio:!!await input.getPrimaryAudioTrack(),duration:await input.computeDuration(),colors};}finally{input.dispose();}},times);
  assert.equal(movie.audio,false);assert.ok(Math.abs(movie.duration-4)<.05);
  for(const [n,t]of times.entries()){const index=saved.transfer.slots.findIndex(s=>s.id===slotAt(plan,t).id),expected=[20+(index%5)*45,20+Math.floor(index/5)*45,190];expected.forEach((v,ch)=>assert.ok(Math.abs(v-movie.colors[n][ch])<20,'final frames must follow motion exposures without added reference annotations'));}

  await page.screenshot({path:'.work/animation-editor-ipad.png',fullPage:true});assert.deepEqual(errors,[]);
 }catch(e){const pages=browser.contexts().flatMap(c=>c.pages());if(pages[0])await pages[0].screenshot({path:'.work/animation-editor-failure.png',fullPage:true}).catch(()=>{});throw e;}finally{await browser.close();}
});
