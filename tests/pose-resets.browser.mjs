import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const byId=keys=>[...keys].sort((a,b)=>a.id.localeCompare(b.id));

// Serve the actual editor markup and source modules without rebuilding shared
// dist. The harness owns persistence/preview callbacks; editor behavior is real.
async function sourceEditor(){
 const root=fileURLToPath(new URL('../app/',import.meta.url));
 const server=createServer(async(req,res)=>{
  try{
   const pathname=new URL(req.url,'http://localhost').pathname;
   const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
   if(!file.startsWith(root)){res.writeHead(403).end();return;}
   let content=await fs.readFile(file);
   if(pathname==='/')content=String(content).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'');
   res.writeHead(200,{'Content-Type':file.endsWith('.mjs')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'}).end(content);
  }catch{res.writeHead(404).end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:820,height:1180}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.evaluate(async()=>{
   const [{AnimationEditor},{newProject,compileClip,slotAt,validateProject}]=await Promise.all([import('/src/animation-ui.mjs'),import('/src/core.mjs')]);
   let project=newProject(),time=0;
   project.scene.actors[0].pose='point';project.scene.actors[0].emotion='happy';
   project.scene.props=[{id:'book',kind:'book',attachment:'world',color:'#123456',x:2,y:1,z:0,rx:30,ry:40,rz:50,width:.9,height:1.2,depth:.1,open:.75,page:.4}];
   project.animation={mode:'silent',duration:4,drawings:3,keys:[
    {id:'selected',target:'actor:0',time:.5,transition:'ease',values:{armL:72,armSideL:-18,elbowL:60,handL:12,fingerCurlL:.8,fingerPointL:1,contactLeft:1,contactLX:2,contactLY:3,contactLZ:-1,armR:45,contact:1,headYaw:32,headPitch:9,kneeL:70,footIK:1,groundY:1}},
    {id:'later',target:'actor:0',time:2,transition:'hold',values:{armR:88}},
    {id:'partner',target:'actor:1',time:1,transition:'ease',values:{headPitch:12}},
    {id:'prop-key',target:'prop:book',time:1,transition:'ease',values:{open:.8}},
   ]};
   let clip=compileClip(project,{}),preview=null;
   const editor=new AnimationEditor({project:()=>project,clip:()=>clip,time:()=>time,seek:at=>{time=at;},change:next=>{validateProject(next);project=next;clip=compileClip(project,{});},preview:()=>{preview=editor.draftState(slotAt(clip,time).state);},error:message=>{throw Error(message);}});
   document.querySelector('[data-view=animate]').hidden=false;editor.refresh();
   window.poseResetHarness={editor,project:()=>project,preview:()=>preview};
  });
  return {page,errors,close:async()=>{await browser.close();await new Promise(resolve=>server.close(resolve));}};
 }catch(error){await browser.close();await new Promise(resolve=>server.close(resolve));throw error;}
}

test('animation section resets stay in the pose draft, discard cleanly, and update only the selected key',async()=>{
 const harness=await sourceEditor(),{page}=harness;
 try{
  await page.locator('[data-key-id=selected]').click();
  const before=await page.evaluate(()=>structuredClone(window.poseResetHarness.project()));
  assert.equal(await page.locator('#motion-fields summary button').count(),0);
  assert.equal(await page.locator('#motion-fields [data-motion-reset-section]').count(),7);
  await page.locator('#motion-fields summary').filter({hasText:'Head',exact:true}).click();
  await page.locator('[data-motion-channel=headPitch]').fill('12');
  await page.locator('#motion-fields summary').filter({hasText:'Left arm',exact:true}).click();
  await page.getByRole('button',{name:'Reset Left arm',exact:true}).click({timeout:3000});
  assert.equal(await page.locator('[data-motion-channel=armL]').inputValue(),'0');
  assert.equal(await page.locator('[data-motion-channel=headPitch]').inputValue(),'12');
  assert.equal(await page.locator('#discard-pose').isVisible(),true);
  assert.deepEqual(await page.evaluate(()=>window.poseResetHarness.project()),before,'reset must not persist the animation automatically');
  let preview=await page.evaluate(()=>window.poseResetHarness.preview());
  assert.equal(preview.scene.actors[0].contactLeft,0);assert.equal(preview.scene.actors[0].armR,45);assert.equal(preview.scene.actors[0].headPitch,12);assert.equal(preview.scene.actors[0].pose,'point');assert.equal(preview.scene.actors[0].emotion,'happy');
  await page.locator('#discard-pose').click();
  assert.equal(await page.locator('[data-motion-channel=armL]').inputValue(),'72');
  assert.equal(await page.locator('[data-motion-channel=headPitch]').inputValue(),'9');
  assert.deepEqual(await page.evaluate(()=>window.poseResetHarness.project()),before);
  await page.locator('[data-key-id=selected]').click();
  await page.getByRole('button',{name:'Reset Left arm',exact:true}).click();
  await page.locator('[data-motion-channel=headPitch]').fill('12');
  await page.locator('#set-key').click();
  let after=await page.evaluate(()=>window.poseResetHarness.project()),saved=after.animation.keys.find(k=>k.id==='selected');
  assert.equal(after.animation.keys.length,before.animation.keys.length);assert.equal(saved.time,.5);assert.equal(saved.transition,'ease');
  assert.equal(saved.values.armL,0);assert.equal(saved.values.contactLeft,0);assert.equal(saved.values.headPitch,12);assert.equal(saved.values.armR,45);
  assert.deepEqual(byId(after.animation.keys.filter(k=>k.id!=='selected')),byId(before.animation.keys.filter(k=>k.id!=='selected')));
  assert.deepEqual(after.scene,before.scene);
  await page.locator('#motion-fields summary').filter({hasText:'Legs',exact:true}).click();
  await page.getByRole('button',{name:'Reset Legs',exact:true}).click();
  await page.locator('#motion-target').selectOption('actor:1');
  after=await page.evaluate(()=>window.poseResetHarness.project());saved=after.animation.keys.find(k=>k.id==='selected');
  assert.equal(saved.values.kneeL,0);assert.equal(saved.values.footIK,0);assert.equal(saved.values.groundY,0);
  assert.equal(saved.values.headPitch,12);assert.equal(after.animation.keys.length,before.animation.keys.length);
  assert.deepEqual(harness.errors,[]);
 }finally{await harness.close();}
});

test('prop section reset uses the same draft and leaves prop appearance and other channels intact',async()=>{
 const harness=await sourceEditor(),{page}=harness;
 try{
  await page.locator('#motion-target').selectOption('prop:book');
  const before=await page.evaluate(()=>structuredClone(window.poseResetHarness.project()));
  assert.equal(await page.locator('#motion-fields [data-motion-reset-section]').count(),4);
  await page.locator('#motion-fields summary').filter({hasText:'Dimensions',exact:true}).click();
  await page.getByRole('button',{name:'Reset Dimensions',exact:true}).click({timeout:3000});
  assert.equal(await page.locator('[data-motion-channel=width]').inputValue(),'0.30');
  assert.deepEqual(await page.evaluate(()=>window.poseResetHarness.project()),before);
  await page.locator('#set-key').click();
  const after=await page.evaluate(()=>window.poseResetHarness.project()),saved=after.animation.keys.find(k=>k.target==='prop:book'&&k.time===0);
  assert.equal(saved.values.width,.3);assert.equal(saved.values.height,.4);assert.equal(saved.values.depth,.05);assert.equal(saved.values.x,2);assert.equal(saved.values.rx,30);assert.equal(saved.values.open,.75);
  assert.deepEqual(after.scene,before.scene);assert.deepEqual(byId(after.animation.keys.filter(k=>k.id!==saved.id)),byId(before.animation.keys));
  assert.deepEqual(harness.errors,[]);
 }finally{await harness.close();}
});

test('resetting a sparse selected head key preserves the arm inherited from an earlier key',async()=>{
 const harness=await sourceEditor(),{page}=harness;
 try{
  await page.evaluate(()=>{const h=window.poseResetHarness,p=structuredClone(h.project());p.animation.keys=[{id:'arm',target:'actor:0',time:.5,transition:'hold',values:{armR:65}},{id:'head',target:'actor:0',time:1,transition:'hold',values:{headPitch:20}}];h.editor.change(p);h.editor.refresh();});
  await page.locator('[data-key-id=head]').click();
  await page.locator('#motion-fields summary').filter({hasText:'Head',exact:true}).click();await page.getByRole('button',{name:'Reset Head',exact:true}).click();await page.locator('#set-key').click();
  const saved=await page.evaluate(()=>window.poseResetHarness.project().animation.keys.find(key=>key.id==='head'));
  assert.equal(saved.values.headPitch,0);assert.equal(saved.values.armR,65,'section reset must retain the displayed inherited arm pose');assert.deepEqual(harness.errors,[]);
 }finally{await harness.close();}
});
