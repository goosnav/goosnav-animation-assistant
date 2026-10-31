import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {unpackProject} from '../app/src/archive.mjs';
import {compileClip} from '../app/src/core.mjs';
async function backup(page){
 const menu=page.locator('.project-tools details');if(!await menu.evaluate(e=>e.open))await menu.locator('summary').click();
 const downloaded=page.waitForEvent('download');await page.locator('#save-project').click();
 return unpackProject(new Blob([await fs.readFile(await(await downloaded).path())]));
}
test('three-point framing preserves staging and walking/action controls produce editable animation',async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:820,height:1180}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:8793');
  await page.locator('[data-framing=three-point]').click({timeout:3000});
  assert.equal(await page.locator('#ground-grid').isChecked(),true);assert.equal(await page.locator('#backdrop-grid').isChecked(),true);
  const scene=(await backup(page)).project.scene;assert.equal(scene.camera.projection,'perspective');assert.equal(scene.camera.azimuth,25);assert.equal(scene.camera.elevation,18);assert.deepEqual(scene.actors.map(a=>a.x),[-.45,.45]);
  await page.locator('[data-tab=animate]').click();await page.locator('#timing-mode').selectOption('silent');
  await page.locator('#gesture-preset').selectOption('explain');await page.locator('#action-duration').fill('0.8');await page.locator('#action-strength').fill('1.5');await page.locator('#add-gesture').click();
  let saved=await backup(page);let keys=saved.project.animation.keys;assert.ok(keys.length>3);assert.ok(Math.abs(Math.max(...keys.map(k=>k.time))-.8)<.001);assert.ok(Math.max(...keys.map(k=>k.values.armR))>55,'explanation should read as a large cartoon gesture');
  for(const action of ['explode','high_five','open','rubber_hose','walk_away'])assert.equal(await page.locator(`#gesture-preset option[value="${action}"]`).count(),1);
  await page.locator('#new').click();await page.locator('[data-tab=animate]').click();await page.locator('#timing-mode').selectOption('silent');
  await page.locator('#walking summary').click();await page.locator('#walk-steps').fill('4');await page.locator('#walk-stride').fill('0.2');await page.locator('#walk-cadence').fill('2.5');await page.locator('#walk-direction').fill('90');await page.locator('#walk-in-place').check();await page.locator('#add-walk').click();
  saved=await backup(page);keys=saved.project.animation.keys;assert.ok(keys.length>=10);assert.equal(new Set(keys.map(k=>k.values.x)).size,1,'walk in place must stay planted at its scene position');assert.ok(keys.some(k=>k.values.thighL>0)&&keys.some(k=>k.values.thighL<0));
  const clip=compileClip(saved.project,{});assert.ok(clip.slots.filter(s=>s.active).length<50,'walk in place must reuse its limited pose drawings');
  await page.reload();await page.getByText('Project restored.',{exact:true}).waitFor();await page.locator('[data-tab=animate]').click();assert.equal(await page.locator('[data-key-id]').count(),keys.length);
  await page.setViewportSize({width:390,height:844});await page.locator('#walking summary').click();await page.locator('#walk-stride').scrollIntoViewIfNeeded();await page.screenshot({path:'.work/walking-controls-phone.png'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('pose drafts survive target changes, key retiming and backup; manual knees override walking solver',async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:820,height:1180}});await page.goto('http://127.0.0.1:8793');await page.locator('[data-tab=animate]').click();await page.locator('#timing-mode').selectOption('silent');
  await page.locator('[data-motion-channel=x]').fill('1.25');await page.locator('#motion-target').selectOption('actor:1');await page.locator('#motion-target').selectOption('actor:0');assert.equal(await page.locator('[data-motion-channel=x]').inputValue(),'1.25');
  await page.locator('#key-list button').first().click();await page.locator('[data-motion-channel=x]').fill('1.1');await page.locator('#key-position').fill('.5');await page.locator('#key-position').dispatchEvent('change');assert.equal(await page.locator('[data-motion-channel=x]').inputValue(),'1.10');
  await page.locator('[data-motion-channel=x]').fill('.8');let saved=await backup(page);assert.ok(saved.project.animation.keys.some(k=>k.values.x===.8),'explicit backup includes visible pending pose');
  await page.locator('#new').click();await page.locator('[data-tab=animate]').click();await page.locator('#timing-mode').selectOption('silent');await page.locator('#walking summary').click();await page.locator('#walk-in-place').check();await page.locator('#add-walk').click();await page.locator('#key-list button').nth(3).click();await page.locator('#motion-fields summary').filter({hasText:'Legs',exact:true}).click();await page.locator('[data-motion-channel=kneeL]').fill('90');await page.locator('#set-key').click();saved=await backup(page);assert.ok(saved.project.animation.keys.some(k=>k.values.kneeL===90&&k.values.footIK===0),'manual leg pose must disable generated foot lock');
 }finally{await browser.close();}
});
