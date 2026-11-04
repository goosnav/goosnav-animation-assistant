import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {unpackProject} from '../app/src/archive.mjs';

async function backup(page){
 const menu=page.locator('#backup-menu');if(!await menu.evaluate(node=>node.open))await menu.locator('summary').click();
 const downloaded=page.waitForEvent('download');await page.locator('#save-project').click();
 const saved=await unpackProject(new Blob([await fs.readFile(await(await downloaded).path())]));
 await menu.locator('summary').click();return saved.project;
}
const recipe={format:'goosnav-animation-config',version:1,title:'Pose tools check',scene:{format:'portrait',count:2,actors:[{model:'v12',x:-1,yaw:0,headPitch:55,headTilt:25,armL:70,armR:40,emotion:'happy'},{model:'v12-fat',x:1,yaw:180,headPitch:50,headTilt:-20}],props:[{id:'book',kind:'book',attachment:'world',x:0,y:1,z:.4,rx:15,ry:20,rz:30,width:.4,height:.6,depth:.1}]},timing:{mode:'silent',duration:2,drawings:3},dialogue:[]};

test('Scene alignment and section resets survive backups, while Animation alignment stays an editable pose',async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1100,height:1100}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:8793/');await page.locator('#actor-fields .actor').first().waitFor();
  await page.locator('#load-config').setInputFiles({name:'pose.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(recipe))});
  await page.getByRole('button',{name:'Look at each other',exact:true}).first().waitFor({timeout:3000});
  const before=await backup(page);
  await page.locator('#align-characters').click();await page.getByText(/Base gaze aligned/).waitFor();
  let after=await backup(page);
  assert.ok(Math.abs(after.scene.actors[0].headPitch)<=25);assert.ok(Math.abs(after.scene.actors[1].headPitch)<=25);
  assert.equal(after.scene.actors[0].headTilt,-4);assert.equal(after.scene.actors[1].headTilt,0);
  for(let i=0;i<2;i++)for(const key of ['x','y','z','model','pose','emotion','armL','armR'])assert.equal(after.scene.actors[i][key],before.scene.actors[i][key]);
  assert.deepEqual(after.scene.props,before.scene.props);assert.deepEqual(after.lines,before.lines);
  const actor=page.locator('#actor-fields .actor').first();await actor.locator('details[data-section="left-arm"] summary').click();
  await actor.getByRole('button',{name:'Reset Left arm',exact:true}).click();
  const reset=await backup(page);assert.equal(reset.scene.actors[0].armL,0);assert.equal(reset.scene.actors[0].armR,40);assert.equal(reset.scene.actors[0].headPitch,after.scene.actors[0].headPitch);
  await page.locator('#objects summary').first().click();await page.locator('#prop-fields summary').filter({hasText:'Rotation',exact:true}).click();await page.getByRole('button',{name:'Reset object Rotation',exact:true}).click();
  const propReset=await backup(page);assert.equal(propReset.scene.props[0].rx,0);assert.equal(propReset.scene.props[0].width,.4);assert.equal(propReset.scene.props[0].y,1);
  await page.locator('[data-tab=animate]').click();await page.locator('#motion-fields details[data-section=head] summary').click();
  await page.locator('[data-motion-channel=headPitch]').fill('50');
  await page.locator('[data-motion-align=camera]').click();await page.getByText(/Gaze aligned in the pose draft/).waitFor();
  assert.equal(await page.locator('#discard-pose').isVisible(),true);
  assert.ok(Math.abs(Number(await page.locator('[data-motion-channel=headPitch]').inputValue()))<=25);
  await page.locator('#set-key').click();after=await backup(page);
  const key=after.animation.keys.find(key=>key.target==='actor:0'&&key.time===0);assert.ok(key);assert.ok(Math.abs(key.values.headPitch)<=25);assert.equal(key.values.armR,40);
  await page.reload();await page.getByText('Project restored.',{exact:true}).waitFor();await page.locator('[data-tab=animate]').click();assert.equal(await page.locator('#key-list button').count(),1);
  for(const width of [1440,390,320]){await page.setViewportSize({width,height:1000});await page.locator('#motion-fields details[data-section=head]').evaluate(node=>node.open=true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
  await fs.mkdir('.work',{recursive:true});await page.screenshot({path:'.work/pose-tools-mobile.png',fullPage:true});assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('agent pose controls use the parsed cast when a single-actor recipe omits count',async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
 try{
  const page=await browser.newPage();await page.goto('http://127.0.0.1:8793/agent.html');
  const solo={...recipe,scene:{format:'portrait',actors:[recipe.scene.actors[0]]}};
  await page.locator('#recipe').fill(JSON.stringify(solo));await page.locator('#validate').click();await page.locator('.pose-tools summary').click();
  assert.equal(await page.locator('#reset-target option[value="actor:1"]').count(),0);
  assert.equal(await page.locator('#gaze-target').inputValue(),'camera');assert.equal(await page.locator('#gaze-target option[value=partner]').evaluate(node=>node.disabled),true);
  await page.locator('#align-gaze').click();await page.getByText(/Gaze aligned once/).waitFor();
  const result=await page.evaluate(()=>JSON.parse(window.animationAgent.exportJSON().text));assert.ok(result.keys.some(key=>key.target==='actor:0'));assert.ok(result.keys.every(key=>key.target!=='actor:1'));
 }finally{await browser.close();}
});
