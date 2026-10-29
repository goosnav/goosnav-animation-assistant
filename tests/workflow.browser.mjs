import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import { unzipSync } from 'fflate';
test('iPad-sized workflow generates unique references and restores a saved clip',async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 try{
  const page=await browser.newPage({viewport:{width:820,height:1180},deviceScaleFactor:1,permissions:['microphone']});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8793');
  await page.getByRole('button',{name:'02 Rehearse',exact:true}).click();
  await page.getByRole('button',{name:'Generate animation',exact:true}).click();
  await page.getByText('Animation ready.',{exact:false}).waitFor({timeout:60000});
  const count=Number(await page.locator('#drawing-count').textContent());assert.ok(count>1&&count<=11);
  await page.getByRole('button',{name:'03 Draw',exact:true}).click();
  await page.getByText('Image alternatives',{exact:true}).click();
  await page.getByRole('button',{name:'Prepare drawings',exact:true}).click();
  await page.locator('#reference-gallery img').first().waitFor({timeout:60000});
  assert.equal(await page.locator('#reference-gallery img').count(),count);
  await page.screenshot({path:'.work/ipad-draw.png',fullPage:true});
  await page.getByText('Other export options',{exact:true}).click();
  const zipDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Download PNG ZIP',exact:true}).click();
  const archive=unzipSync(await fs.readFile(await (await zipDownload).path()));
  const pngs=Object.entries(archive).filter(([name])=>name.endsWith('.png')).reverse();
  await page.getByRole('button',{name:'04 Assemble',exact:true}).click();
  await page.getByText('Import individual images instead',{exact:true}).click();
  await page.locator('#import-images').setInputFiles(pngs.map(([name,buffer])=>({name,mimeType:'image/png',buffer:Buffer.from(buffer)})));
  await page.locator('#import-gallery button').last().waitFor();
  for(let i=count-1;i>=0;i--)await page.locator('#import-gallery button').nth(i).click();
  assert.equal(await page.locator('#import-gallery .number').first().textContent(),String(count));
  await page.getByRole('button',{name:'Use these drawings',exact:true}).click();
  await page.getByText('Your drawings are assembled.',{exact:false}).waitFor();
  assert.equal(await page.locator('#art-count').textContent(),String(count));
  await page.getByRole('button',{name:'05 Finish',exact:true}).click();
  await page.locator('#audio-mode').selectOption('silent');
  await page.getByRole('button',{name:'Export finished MP4',exact:true}).click();
  await page.getByText('MP4 ready.',{exact:false}).waitFor({timeout:90000}).catch(async e=>{throw Error(`${e.message}; status: ${await page.locator('#status').textContent()}`);});
  const movie=page.waitForEvent('download');await page.getByRole('button',{name:'Download MP4',exact:true}).click();await (await movie).saveAs('.work/roundtrip.mp4');
  await page.locator('#record').click();await page.locator('#countdown').waitFor();await page.locator('#stop-recording').click();
  await page.getByText('Recording cancelled before the countdown finished.',{exact:true}).waitFor();
  assert.equal(await page.locator('#voice-review').isVisible(),false);
  await page.locator('#record').click();await page.locator('#countdown').waitFor();
  await page.locator('#countdown').waitFor({state:'hidden'});await page.waitForTimeout(500);await page.locator('#stop-recording').click();
  await page.getByText('Voiceover recorded.',{exact:false}).waitFor();assert.equal(await page.locator('#export-result').isVisible(),false);
  await page.locator('#export').click();await page.getByText('MP4 ready.',{exact:false}).waitFor({timeout:90000}).catch(async e=>{throw Error(`${e.message}; status: ${await page.locator('#status').textContent()}`);});
  const voiced=page.waitForEvent('download');await page.locator('#download-video').click();await (await voiced).saveAs('.work/voiced.mp4');
  await page.getByRole('button',{name:'04 Assemble',exact:true}).click();await page.getByText('Already animated in Procreate?',{exact:true}).click();
  await page.locator('#import-video').setInputFiles('.work/voiced.mp4');await page.getByText('Finished video imported.',{exact:false}).waitFor();
  assert.equal(await page.locator('#audio-mode').inputValue(),'silent');
  assert.equal(await page.locator('#audio-mode option[value=robot]').evaluate(option=>option.disabled),true);
  assert.equal(await page.locator('#export-result').isVisible(),false);
  await page.locator('#next-frame').click();assert.ok(await page.locator('#returned-video').evaluate(v=>v.currentTime>0));
  await page.locator('#remove-video').click();assert.equal(await page.locator('#returned-video').isVisible(),false);
  await page.reload();await page.getByText('Project restored',{exact:false}).waitFor();
  assert.deepEqual(errors,[]);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 }finally{await browser.close();}
});

test('new clips clear previous exports and edit history',async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.goto('http://127.0.0.1:8793');
  await page.locator('#title').fill('First clip');await page.locator('#title').dispatchEvent('change');
  await page.getByRole('button',{name:'02 Rehearse',exact:true}).click();await page.locator('#generate').click();
  await page.getByText('Animation ready.',{exact:false}).waitFor({timeout:60000});
  await page.getByRole('button',{name:'03 Draw',exact:true}).click();await page.getByText('Other export options',{exact:true}).click();await page.locator('#reference-video').click();
  await page.getByText('MP4 ready.',{exact:false}).waitFor({timeout:90000}).catch(async e=>{throw Error(`${e.message}; status: ${await page.locator('#status').textContent()}`);});
  await page.locator('#new').click();await page.getByText('New clip. Your previous clip',{exact:false}).waitFor();
  await page.getByRole('button',{name:'05 Finish',exact:true}).click();assert.equal(await page.locator('#export-result').isVisible(),false);
  await page.locator('#undo').click();assert.equal(await page.locator('#title').inputValue(),'An ordinary conversation');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 }finally{await browser.close();}
});
