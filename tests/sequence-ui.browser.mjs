import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {unpackProject} from '../app/src/archive.mjs';
const launch=()=>chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
const recipe={format:'goosnav-animation-config',version:1,title:'First shot',scene:{actors:[{model:'blue',x:0,yaw:0}]},timing:{mode:'silent',duration:1}};
const file=data=>({name:'scene.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
async function backup(page){const menu=page.locator('.project-tools details');if(!await menu.evaluate(e=>e.open))await menu.locator('summary').click();const saved=page.waitForEvent('download');await page.locator('#save-project').click();return unpackProject(new Blob([await fs.readFile(await(await saved).path())]));}
test('shot editor saves one film, preserves pending poses across switches, and restores all shots',async()=>{
 const browser=await launch();try{
  const page=await browser.newPage({viewport:{width:820,height:1180}});await page.goto('http://127.0.0.1:8793');await page.locator('#load-config').setInputFiles(file(recipe));await page.getByText('JSON scene loaded.',{exact:true}).waitFor();
  await page.locator('#add-shot').click({timeout:10000});await waitReady(page);assert.equal(await page.locator('[data-shot-id]').count(),2);await page.locator('#shot-name').fill('Wide reply');await page.locator('#shot-name').dispatchEvent('change');
  await page.locator('[data-tab=animate]').click();await page.locator('[data-motion-channel=x]').fill('.7');await page.locator('[data-shot-id]').first().click();await waitReady(page);assert.equal(await page.locator('#shot-name').inputValue(),'First shot');
  await page.locator('[data-shot-id]').nth(1).click();await waitReady(page);assert.equal(await page.locator('[data-motion-channel=x]').inputValue(),'0.70');
  const saved=await backup(page);assert.equal(saved.film.shots.length,2);assert.ok(saved.film.shots[1].state.project.animation.keys.some(k=>k.values.x===.7));assert.equal(saved.recording,undefined);
  await page.reload();await page.getByText('Project restored.',{exact:true}).waitFor();assert.equal(await page.locator('[data-shot-id]').count(),2);assert.equal(await page.locator('#shot-name').inputValue(),'Wide reply');
  await page.locator('#shot-options summary').click();await page.locator('#remove-shot').click();await page.locator('#busy-panel').waitFor({state:'hidden'});assert.equal(await page.locator('[data-shot-id]').count(),1);await page.locator('#shot-name').fill('Keep this edit');await page.locator('#shot-name').dispatchEvent('change');await page.locator('#undo-shot-remove').click();await page.locator('#busy-panel').waitFor({state:'hidden'});assert.equal(await page.locator('[data-shot-id]').count(),2);assert.match(await page.locator('[data-shot-id]').first().textContent(),/Keep this edit/);
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'.work/film-phone.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 }finally{await browser.close();}
});

const mediaHarness=(await (await import('esbuild')).build({stdin:{contents:`export {exportFrameVideo} from './app/src/frame-video.mjs';
import {Input,BlobSource,MP4,VideoSampleSink} from 'mediabunny';
export async function inspect(blob){const input=new Input({source:new BlobSource(blob),formats:[MP4]}),canvas=document.createElement('canvas');canvas.width=canvas.height=8;try{const track=await input.getPrimaryVideoTrack(),frames=[];for await(const sample of new VideoSampleSink(track).samples()){try{sample.draw(canvas.getContext('2d'),0,0,8,8);frames.push({time:sample.timestamp,pixel:[...canvas.getContext('2d').getImageData(4,4,1,1).data]});}finally{sample.close();}}return frames;}finally{input.dispose();}}
`,resolveDir:process.cwd()},bundle:true,format:'esm',write:false})).outputFiles[0].text;
const waitReady=page=>page.locator('#busy-panel').waitFor({state:'hidden',timeout:90000});
async function routeMedia(page){await page.route('**/film-media.mjs',r=>r.fulfill({contentType:'text/javascript',body:mediaHarness}));}
async function downloaded(page,button){const result=page.waitForEvent('download',{timeout:90000});await page.locator(button).click();const bytes=await fs.readFile(await(await result).path());await waitReady(page);return bytes;}
test('film UI exports one carrier, preserves its order after rearrangement, and rebuilds a fresh returned video',async()=>{
 const {unzipSync,strFromU8}=await import('fflate'),browser=await launch();try{
  const source=await browser.newPage({viewport:{width:1280,height:1000}});await routeMedia(source);await source.goto('http://127.0.0.1:8793');
  const sequence={format:'goosnav-animation-sequence',version:1,id:'ui-film',title:'Three shots',shots:['Opening','Wide reply','Closing'].map((title,i)=>({id:`shot-${i}`,title,config:{...recipe,title,scene:{...recipe.scene,background:['#ffcccc','#ccffcc','#ccccff'][i]},timing:{mode:'silent',duration:.5}}}))};
  await source.locator('#load-config').setInputFiles(file(sequence));await source.getByText('JSON scene loaded.',{exact:true}).waitFor();await source.locator('[data-tab=draw]').click();
  const packed=unzipSync(new Uint8Array(await downloaded(source,'#drawing-video'))),json=JSON.parse(strFromU8(packed['sequence.json']));assert.equal(json.shots.length,3);assert.ok(packed['references.mp4']);assert.equal(await source.locator('#reference-gallery button').count(),3);
  const actualCarrier=await source.evaluate(async bytes=>(await import('/film-media.mjs')).inspect(new Blob([new Uint8Array(bytes)])),[...packed['references.mp4']]);assert.equal(actualCarrier.length,3);
  // Move the final shot first; artwork still arrives in the original carrier order.
  await source.locator('[data-shot-id]').nth(2).click();await waitReady(source);await source.locator('#shot-options summary').click();await source.locator('#shot-earlier').click();await waitReady(source);await source.locator('#shot-earlier').click();await waitReady(source);
  const reordered=JSON.parse((await downloaded(source,'#export-config')).toString());assert.equal(reordered.shots[0].id,'shot-2');assert.deepEqual(reordered.handoff.slots,json.handoff.slots);
  const returned=await source.evaluate(async()=>{const {exportFrameVideo}=await import('/film-media.mjs'),canvas=document.createElement('canvas');canvas.width=54;canvas.height=96;const blob=await exportFrameVideo({canvas,frameCount:3,drawFrame:async i=>{const ctx=canvas.getContext('2d');ctx.fillStyle=['#ff0000','#00ff00','#0000ff'][i];ctx.fillRect(0,0,54,96);}});return [...new Uint8Array(await blob.arrayBuffer())];});
  const receiver=await browser.newPage({viewport:{width:1280,height:1000}});await routeMedia(receiver);await receiver.goto('http://127.0.0.1:8793');
  await receiver.locator('#load-config').setInputFiles([file(reordered),{name:'returned.mp4',mimeType:'video/mp4',buffer:Buffer.from(returned)}]);await receiver.getByText('Drawings loaded. Ready to export.',{exact:true}).waitFor({timeout:90000});assert.equal(await receiver.locator('#art-count').textContent(),'3');assert.equal(await receiver.locator('#assigned-gallery button').count(),3);
  await receiver.locator('#scrub').fill('0.75');await receiver.locator('#scrub').dispatchEvent('input');await receiver.getByText('SHOT 2 · YOUR DRAWING',{exact:true}).waitFor();
  const bytes=await downloaded(receiver,'#export'),frames=await receiver.evaluate(async bytes=>(await import('/film-media.mjs')).inspect(new Blob([new Uint8Array(bytes)])),[...bytes]);assert.equal(frames.length,36);
  for(const [at,color]of [[0,[0,0,255]],[11,[0,0,255]],[12,[255,0,0]],[23,[255,0,0]],[24,[0,255,0]],[35,[0,255,0]]])frames[at].pixel.slice(0,3).forEach((value,i)=>assert.ok(Math.abs(value-color[i])<25));
  const saved=await backup(receiver);assert.equal(saved.film.shots.length,3);assert.ok(saved.film.shots.every(s=>Object.keys(s.state.art).length===1));
  await receiver.screenshot({path:'.work/film-export-desktop.png',fullPage:true});
  // Invalid import must leave all three shots and artwork intact.
  await receiver.locator('#load-config').setInputFiles([file(sequence),{name:'bad.mp4',mimeType:'video/mp4',buffer:Buffer.from('broken')}]);await receiver.locator('#status.error').waitFor();assert.equal(await receiver.locator('[data-shot-id]').count(),3);assert.equal(await receiver.locator('#art-count').textContent(),'3');
 }finally{await browser.close();}
});

test('agent workspace opens its accepted multi-shot JSON in the editor without manual file transfer',async()=>{
 const browser=await launch();try{const page=await browser.newPage();await page.goto('http://127.0.0.1:8793/agent.html');const text=JSON.stringify({format:'goosnav-animation-sequence',version:1,id:'agent-film',title:'Agent film',shots:[{id:'one',title:'One',config:recipe},{id:'two',title:'Two',config:recipe}]});await page.locator('#recipe').fill(text);await page.locator('#open-editor').click();await page.getByText('JSON scene loaded.',{exact:true}).waitFor();assert.equal(await page.locator('#title').inputValue(),'Agent film');assert.equal(await page.locator('[data-shot-id]').count(),2);assert.equal(await page.evaluate(()=>sessionStorage.getItem('goosnav-agent-import-v1')),null);assert.equal(new URL(page.url()).search,'');}finally{await browser.close();}
});
