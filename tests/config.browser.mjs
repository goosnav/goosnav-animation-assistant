import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {parseConfig} from '../app/src/config.mjs';
async function exported(page){const download=page.waitForEvent('download');await page.locator('#export-config').click();return JSON.parse(await fs.readFile(await(await download).path(),'utf8'));}
const upload=(page,data)=>page.locator('#load-config').setInputFiles({name:'scene.json',mimeType:'application/json',buffer:Buffer.from(typeof data==='string'?data:JSON.stringify(data))});

test('one JSON upload generates dialogue, actions and seated references; GUI edits export and reload',async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:820,height:1180}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:8793');
  const recipe={format:'goosnav-animation-config',version:1,title:'JSON seated motion',scene:{actors:[{model:'blue',x:0,yaw:0,pose:'sitting',chair:'wood',emotion:'happy'}]},dialogue:[{actor:0,text:'Hello there.',emotion:'surprised'}],actions:[{actor:0,action:'arm_flail',time:.3,duration:2}],timing:{mode:'speech',drawings:3}};
  await upload(page,recipe);await page.getByText('JSON scene loaded.',{exact:true}).waitFor({timeout:90000});
  assert.equal(await page.locator('#title').inputValue(),recipe.title);assert.equal(await page.locator('[data-actor="0"][data-key="pose"]').inputValue(),'sitting');assert.equal(await page.locator('[data-actor="0"][data-key="chair"]').inputValue(),'wood');assert.equal(await page.locator('#play').isEnabled(),true);assert.ok(Number(await page.locator('#drawing-count').textContent())>5);
  await page.locator('[data-tab=rehearse]').click();assert.equal(await page.locator('[data-line-key=text]').inputValue(),'Hello there.');assert.equal(await page.locator('[data-line-key=emotion]').inputValue(),'surprised');
  await page.locator('[data-tab=animate]').click();assert.equal(await page.locator('[data-key-id]').count(),6);
  await page.locator('[data-tab=stage]').click();await page.locator('[data-actor="0"][data-key="chair"]').selectOption('stool');await page.locator('[data-actor="0"][data-key="emotion"]').selectOption('sad');
  const saved=await exported(page);assert.equal(saved.scene.actors[0].chair,'stool');assert.equal(saved.scene.actors[0].emotion,'sad');assert.equal(saved.dialogue[0].emotion,'surprised');assert.equal(saved.keys.length,6);assert.equal(parseConfig(JSON.stringify(saved)).animation.keys.length,6);
  await upload(page,saved);await page.getByText('JSON scene loaded.',{exact:true}).waitFor({timeout:90000});assert.deepEqual(await exported(page),saved);
  await upload(page,'{bad');await page.locator('#status.error').waitFor();assert.deepEqual(await exported(page),saved,'invalid input preserves the entire current setup');
  await page.locator('[data-tab=draw]').click();await page.locator('#drawing-video').click();await page.getByText('References ready.',{exact:true}).waitFor({timeout:90000});assert.ok(await page.locator('#reference-gallery button').count()>5);await page.screenshot({path:'.work/json-seated-reference-ui.png',fullPage:true});
  await page.reload();await page.getByText('Project restored.',{exact:true}).waitFor();assert.equal(await page.locator('#title').inputValue(),recipe.title);assert.deepEqual(await exported(page),saved);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('silent JSON needs no speech, and cancelling an upload preserves the current clip',async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
 try{
  const page=await browser.newPage();await page.goto('http://127.0.0.1:8793');
  await upload(page,await fs.readFile('examples/silent-scene.json','utf8'));await page.getByText('JSON scene loaded.',{exact:true}).waitFor();
  const saved=await exported(page);assert.equal(saved.timing.mode,'silent');assert.deepEqual(saved.dialogue,[]);assert.ok(saved.keys.length>10);assert.equal(await page.locator('#play').isEnabled(),true);
  await page.evaluate(()=>{const original=File.prototype.text;File.prototype.text=async function(){await new Promise(resolve=>window.releaseConfig=resolve);return original.call(this);};});
  await upload(page,{format:'goosnav-animation-config',version:1,title:'Do not replace me',timing:{mode:'silent',duration:2}});
  await page.locator('#cancel').click();await page.evaluate(()=>window.releaseConfig());await page.locator('#busy-panel').waitFor({state:'hidden'});assert.deepEqual(await exported(page),saved);
  const download=page.waitForEvent('download');await page.locator('#example-config').click();const example=await fs.readFile(await(await download).path(),'utf8');assert.equal(parseConfig(example).scene.actors[0].pose,'sitting');
 }finally{await browser.close();}
});
