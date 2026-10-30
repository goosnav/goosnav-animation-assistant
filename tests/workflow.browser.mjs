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
  await page.getByRole('button',{name:'Speech',exact:true}).click();
  await page.getByRole('button',{name:'Generate speech',exact:true}).click();
  await page.getByText('Speech ready.',{exact:false}).waitFor({timeout:60000});
  const count=Number(await page.locator('#drawing-count').textContent());assert.ok(count>1&&count<=11);
  await page.getByRole('button',{name:'Draw',exact:true}).click();
  await page.locator('#drawing-video').click();await page.getByText('References ready.',{exact:true}).waitFor({timeout:60000});
  await page.locator('#reference-gallery img').first().waitFor({timeout:60000});
  assert.equal(await page.locator('#reference-gallery img').count(),count);
  await page.screenshot({path:'.work/ipad-draw.png',fullPage:true});
  await page.getByText('Other formats',{exact:true}).click();
  const zipDownload=page.waitForEvent('download');await page.getByRole('button',{name:'PNG ZIP',exact:true}).click();
  const archive=unzipSync(await fs.readFile(await (await zipDownload).path()));
  const pngs=Object.entries(archive).filter(([name])=>name.endsWith('.png')).reverse();
  const guideInk=await page.evaluate(async bytes=>{const image=await createImageBitmap(new Blob([new Uint8Array(bytes)]));const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);image.close();const data=ctx.getImageData(canvas.width-500,0,500,220).data;let dark=0;for(let i=0;i<data.length;i+=4)if(data[i]<45&&data[i+1]<45&&data[i+2]<45)dark++;return dark;},[...pngs[0][1]]);
  assert.ok(guideInk>300,'PNG reference export must contain its mouth label');
  await page.locator('#import-artwork').setInputFiles(pngs.map(([name,buffer])=>({name,mimeType:'image/png',buffer:Buffer.from(buffer)})));
  await page.locator('#import-gallery button').last().waitFor();
  for(let i=count-1;i>=0;i--)await page.locator('#import-gallery button').nth(i).click();
  assert.equal(await page.locator('#import-gallery .number').first().textContent(),String(count));
  await page.getByRole('button',{name:'Use drawings',exact:true}).click();
  await page.getByText('Drawings imported.',{exact:false}).waitFor();
  assert.equal(await page.locator('#art-count').textContent(),String(count));
  await page.getByRole('button',{name:'Export',exact:true}).click();
  await page.locator('#audio-mode').selectOption('silent');
  await page.getByRole('button',{name:'Export animation',exact:true}).click();
  await page.getByText('Animation ready to save.',{exact:false}).waitFor({timeout:90000}).catch(async e=>{throw Error(`${e.message}; status: ${await page.locator('#status').textContent()}`);});
  const movie=page.waitForEvent('download');await page.getByRole('button',{name:'Download MP4',exact:true}).click();await (await movie).saveAs('.work/roundtrip.mp4');
  await page.locator('#voiceover-options summary').click();
  await page.locator('#record').click();await page.locator('#countdown').waitFor();await page.locator('#stop-recording').click();
  await page.getByText('Recording cancelled before the countdown finished.',{exact:true}).waitFor();
  assert.equal(await page.locator('#voice-review').isVisible(),false);
  await page.locator('#record').click();await page.locator('#countdown').waitFor();
  await page.locator('#countdown').waitFor({state:'hidden'});await page.waitForTimeout(500);await page.locator('#stop-recording').click();
  await page.getByText('Voiceover recorded.',{exact:false}).waitFor();assert.equal(await page.locator('#export-result').isVisible(),false);
  await page.locator('#export').click();await page.getByText('Animation ready to save.',{exact:false}).waitFor({timeout:90000}).catch(async e=>{throw Error(`${e.message}; status: ${await page.locator('#status').textContent()}`);});
  const voiced=page.waitForEvent('download');await page.locator('#download-video').click();await (await voiced).saveAs('.work/voiced.mp4');
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
  await page.getByRole('button',{name:'Speech',exact:true}).click();await page.locator('#generate').click();
  await page.getByText('Speech ready.',{exact:false}).waitFor({timeout:60000});
  await page.getByRole('button',{name:'Draw',exact:true}).click();await page.locator('#drawing-video').click();
  await page.getByText('References ready.',{exact:false}).waitFor({timeout:90000}).catch(async e=>{throw Error(`${e.message}; status: ${await page.locator('#status').textContent()}`);});
  await page.locator('#new').click();await page.getByText('New clip. Your previous clip',{exact:false}).waitFor();
  await page.getByRole('button',{name:'Export',exact:true}).click();assert.equal(await page.locator('#export-result').isVisible(),false);
  await page.locator('#undo').click();assert.equal(await page.locator('#title').inputValue(),'An ordinary conversation');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 }finally{await browser.close();}
});
