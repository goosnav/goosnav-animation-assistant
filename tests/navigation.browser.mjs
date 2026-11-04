import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {unpackProject} from '../app/src/archive.mjs';

test('workspace navigation stays visible on phones and backups round-trip the current animation',async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:8793/');await page.locator('#actor-fields .actor').first().waitFor();
  const nav=page.getByRole('navigation',{name:'Workspace',exact:true}),agent=nav.getByRole('link',{name:'Agent workspace',exact:true});
  assert.equal(await agent.isVisible(),true);assert.equal(await agent.locator('xpath=ancestor::details').count(),0);
  for(const width of [1440,390,320]){
   await page.setViewportSize({width,height:1000});assert.equal(await agent.isVisible(),true);
   await nav.getByRole('button',{name:'Batch',exact:true}).click();assert.equal(await page.locator('#batch-panel').isVisible(),true);assert.equal(await agent.isVisible(),true);
   await nav.getByRole('button',{name:'Editor',exact:true}).click();assert.equal(await page.locator('#batch-panel').isVisible(),false);
   const menu=page.locator('#backup-menu');await menu.locator('summary').click();
   const bounds=await menu.locator('.menu').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width,'backup menu stays inside the viewport');
   await menu.locator('summary').press('Escape');assert.equal(await menu.evaluate(node=>node.open),false);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await fs.mkdir('.work',{recursive:true});await page.screenshot({path:`.work/navigation-${width}.png`});
  }
  await page.locator('#title').fill('Navigation backup');await page.locator('#title').dispatchEvent('change');
  await page.locator('#backup-menu summary').click();const downloading=page.waitForEvent('download');await page.locator('#save-project').click();
  const download=await downloading,buffer=await fs.readFile(await download.path()),saved=await unpackProject(new Blob([buffer]));assert.equal(saved.project.title,'Navigation backup');
  await page.locator('#title').fill('Changed');await page.locator('#title').dispatchEvent('change');
  if(!await page.locator('#backup-menu').evaluate(node=>node.open))await page.locator('#backup-menu summary').click();
  await page.locator('#open-project').setInputFiles({name:'backup.zip',mimeType:'application/zip',buffer});
  await page.getByText('Project restored.',{exact:true}).waitFor();assert.equal(await page.locator('#title').inputValue(),'Navigation backup');
  assert.equal(await page.locator('#backup-menu').evaluate(node=>node.open),false);
  // Leave before the normal autosave debounce: the direct link must persist the latest edit.
  await page.locator('#title').fill('Continue after agent');await page.locator('#title').dispatchEvent('change');await agent.click();
  await page.waitForURL('**/agent.html');await page.getByRole('link',{name:'Animation editor',exact:false}).click();
  await page.getByText('Project restored.',{exact:true}).waitFor();assert.equal(await page.locator('#title').inputValue(),'Continue after agent');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
