import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { build } from 'esbuild';
import { unpackProject } from '../app/src/archive.mjs';
const harness=(await build({stdin:{contents:`export {Stage} from './app/src/stage.mjs';export {newProject} from './app/src/core.mjs';export {Vector3} from 'three';`,resolveDir:process.cwd()},bundle:true,format:'esm',write:false,platform:'browser'})).outputFiles[0].text;

test('backdrops and reference grids render in 3D and switching them releases geometry',async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/scene-tools.mjs',r=>r.fulfill({contentType:'text/javascript',body:harness}));await page.goto('http://127.0.0.1:8793');
  const result=await page.evaluate(async()=>{
   const {Stage,newProject,Vector3}=await import('/scene-tools.mjs'),p=newProject(),canvas=document.createElement('canvas'),stage=new Stage(canvas),copy=document.createElement('canvas');copy.width=540;copy.height=960;const ctx=copy.getContext('2d');
   p.scene.camera.projection='orthographic';const state={scene:p.scene,mouths:['rest','rest'],blinks:[false,false]};
   const capture=()=>{ctx.drawImage(canvas,0,0);return ctx.getImageData(0,0,540,960).data;};
   const diff=(a,b)=>{let n=0;for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>20)n++;return n;};
   const png=()=>copy.toDataURL().split(',')[1];
   try{
    await stage.prepare(p.scene);stage.draw(state,540,960);const plain=capture(),geometry=stage.renderer.info.memory.geometries;
    const grids={};for(const name of ['ground','backdrop']){stage.draw(state,540,960,{guides:{[name]:true}});grids[name]=diff(plain,capture());}
    stage.draw(state,540,960,{guides:{ground:true,backdrop:true}});capture();const gridPng=png();
    p.scene.camera.projection='perspective';stage.draw(state,540,960,{guides:{ground:true,backdrop:true}});capture();const perspectivePng=png(),floorPoint=new Vector3(.5,.012,1.23).project(stage.camera),floorPixel=[...ctx.getImageData(Math.round((floorPoint.x+1)*270),Math.round((1-floorPoint.y)*480),1,1).data];p.scene.camera.projection='orthographic';
    stage.draw(state,540,960);const reset=diff(plain,capture()),backdrops={};
    for(const name of ['black-pyramids','red-mesas','colonnade','threshold']){
     p.scene.backdrop=name;const skies={'black-pyramids':'#e8b897','red-mesas':'#c8dce2',colonnade:'#e9e4d7',threshold:'#c8d1d5'};p.scene.background=skies[name];await stage.prepare(p.scene);stage.draw(state,540,960);const pixels=capture();backdrops[name]={diff:diff(plain,pixels),png:png()};
     p.scene.camera.azimuth=25;stage.draw(state,540,960);backdrops[name].orbit=diff(pixels,capture());p.scene.camera.azimuth=0;
    }
    for(let i=0;i<8;i++){p.scene.backdrop=i%2?'threshold':'red-mesas';await stage.prepare(p.scene);stage.draw(state,540,960,{guides:{ground:true}});}
    p.scene.backdrop='none';p.scene.background='#ffffff';await stage.prepare(p.scene);stage.draw(state,540,960);const after=stage.renderer.info.memory.geometries,finalReset=diff(plain,capture());
    p.scene.camera.projection='perspective';p.scene.camera.zoom=.4;stage.draw(state,540,960);const wide=capture();p.scene.backdrop='red-mesas';await stage.prepare(p.scene);stage.draw(state,540,960);const scenery=capture();let actorDelta=0,actorPixels=0;
    const blue=i=>wide[i+2]>wide[i]*1.2&&wide[i+1]>wide[i]*1.1;
    for(let i=540*4;i<wide.length-540*4;i+=4)if(blue(i)&&blue(i-4)&&blue(i+4)&&blue(i-540*4)&&blue(i+540*4)){actorPixels++;actorDelta=Math.max(actorDelta,Math.abs(wide[i]-scenery[i])+Math.abs(wide[i+1]-scenery[i+1])+Math.abs(wide[i+2]-scenery[i+2]));}
    return {grids,gridPng,perspectivePng,floorPixel,reset,backdrops,geometry,after,finalReset,actorDelta,actorPixels};
   }finally{stage.dispose();}
  });
  assert.ok(result.floorPixel[2]-result.floorPixel[0]>10,'floor grid lines must converge in perspective');assert.ok(result.grids.ground>1000,'ground grid must be visible');assert.ok(result.grids.backdrop>1000,'backdrop grid must be visible');assert.equal(result.reset,0);assert.equal(result.finalReset,0);assert.ok(result.actorPixels>50);assert.ok(result.actorDelta<=2,'scenery haze must not wash out characters when zoomed out');
  assert.ok(result.after<=result.geometry+4,'switching scenery must release old geometries');
  for(const [name,b]of Object.entries(result.backdrops)){assert.ok(b.diff>10000,`${name} must render`);assert.ok(b.orbit>5000,`${name} must respond to camera`);await fs.writeFile(`.work/backdrop-${name}.png`,Buffer.from(b.png,'base64'));}
  await fs.writeFile('.work/orthographic-grids.png',Buffer.from(result.gridPng,'base64'));await fs.writeFile('.work/perspective-grids.png',Buffer.from(result.perspectivePng,'base64'));assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('tablet staging controls persist; reference grid changes rebuild guides without replacing drawings',async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:820,height:1180}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:8793');
  const turn=i=>page.locator(`[data-actor="${i}"][data-key=yaw]`);
  assert.equal(await turn(0).inputValue(),'60');assert.equal(await turn(1).inputValue(),'-60');
  await page.locator('[data-framing=solo]').click();await page.locator('#reset-camera').click();assert.equal(await page.locator('#cast-count').inputValue(),'1');assert.equal(await turn(0).inputValue(),'0');
  await page.locator('[data-framing=duet]').click();assert.equal(await page.locator('#cast-count').inputValue(),'2');assert.equal(await turn(1).inputValue(),'-60');
  await page.locator('#cast-count').selectOption('1');assert.equal(await turn(0).inputValue(),'0');await page.locator('#cast-count').selectOption('2');assert.equal(await turn(0).inputValue(),'60');assert.equal(await turn(1).inputValue(),'-60');
  await page.locator('#backdrop').selectOption('red-mesas');assert.equal(await page.locator('#background').inputValue(),'#c8dce2');
  await page.locator('#projection').selectOption('perspective');await page.locator('#ground-grid').check();await page.locator('#backdrop-grid').check();
  await page.screenshot({path:'.work/staging-ipad.png',fullPage:true});
  await page.locator('[data-tab=rehearse]').click();await page.locator('[data-remove-line="1"]').click();await page.locator('textarea').fill('Ah.');await page.locator('textarea').dispatchEvent('change');
  await page.locator('#generate').click();await page.getByText('Speech ready.',{exact:true}).waitFor({timeout:60000});
  await page.locator('[data-tab=draw]').click();await page.locator('#drawing-video').click();await page.getByText('References ready.',{exact:true}).waitFor({timeout:90000});
  async function backup(){if(!await page.locator('.project-tools details').evaluate(e=>e.open))await page.locator('.project-tools summary').click();const download=page.waitForEvent('download');await page.locator('#save-project').click();return unpackProject(new Blob([await fs.readFile(await (await download).path())]));}
  const before=await backup();assert.equal(before.project.guides.ground,true);assert.equal(before.project.scene.backdrop,'red-mesas');
  // Reuse the reference carrier as stand-in artwork to exercise the normal return path.
  const movie=page.waitForEvent('download');await page.locator('#download-drawing-video').click();const file=await (await movie).path();await page.locator('#import-artwork').setInputFiles({name:'drawn.mp4',mimeType:'video/mp4',buffer:await fs.readFile(file)});
  const count=before.transfer.slots.length;await page.getByText(`${count} drawings imported.`,{exact:true}).waitFor({timeout:60000});
  await page.locator('[data-tab=stage]').click();await page.locator('#ground-grid').uncheck();await page.locator('#backdrop-grid').uncheck();
  assert.equal(await page.locator('#art-count').textContent(),String(count));
  await page.locator('[data-tab=draw]').click();await page.locator('#drawing-video').click();await page.getByText('References ready.',{exact:true}).waitFor({timeout:90000});
  const after=await backup();assert.deepEqual(after.transfer.slots,before.transfer.slots);assert.equal(Object.keys(after.art).length,count);
  const id=before.transfer.slots[0].id;assert.notEqual(Buffer.compare(Buffer.from(await before.refs[id].arrayBuffer()),Buffer.from(await after.refs[id].arrayBuffer())),0,'reference cache must regenerate when guides change');
  await page.reload();await page.getByText('Project restored.',{exact:true}).waitFor();assert.equal(await page.locator('#backdrop').inputValue(),'red-mesas');assert.equal(await page.locator('#ground-grid').isChecked(),false);assert.equal(await page.locator('#backdrop-grid').isChecked(),false);assert.equal(await page.locator('#art-count').textContent(),String(count));
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
