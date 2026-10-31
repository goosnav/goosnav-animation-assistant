import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {build} from 'esbuild';

const harness=(await build({stdin:{contents:`export {Stage} from './app/src/stage.mjs';export {newProject} from './app/src/core.mjs';export {drawPerspectiveGuides,perspectiveVanishingPoints,annotatedReference} from './app/src/reference.mjs';`,resolveDir:process.cwd()},bundle:true,format:'esm',write:false,platform:'browser'})).outputFiles[0].text;

test('three-point references show all offcanvas axis directions in portrait and landscape and do not contaminate clean renders',async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('http://localhost:19879/**',async route=>{
   const path=new URL(route.request().url()).pathname;
   if(path==='/harness.mjs')return route.fulfill({contentType:'text/javascript',body:harness});
   if(path.startsWith('/assets/'))return route.fulfill({body:await fs.readFile(`app${path}`)});
   return route.fulfill({contentType:'text/html',body:'<canvas></canvas>'});
  });await page.goto('http://localhost:19879/');
  const results=await page.evaluate(async()=>{
   const {Stage,newProject,drawPerspectiveGuides,perspectiveVanishingPoints,annotatedReference}=await import('/harness.mjs');
   const project=newProject(),stage=new Stage(document.querySelector('canvas')),state={scene:project.scene,mouths:['rest','rest'],blinks:[false,false]},results=[];
   Object.assign(project.scene.camera,{projection:'perspective',azimuth:25,elevation:18});
   try{
    for(const [width,height]of [[540,960],[960,540]])for(const count of [0,2]){
     project.scene.count=count;await stage.prepare(project.scene);stage.draw(state,width,height);const plain=stage.canvas.toDataURL();
     stage.draw(state,width,height,{guides:{ground:true,backdrop:true}});const raw=stage.canvas.toDataURL(),source=await stage.png();
     const overlay=document.createElement('canvas');overlay.width=width;overlay.height=height;const ctx=overlay.getContext('2d');
     drawPerspectiveGuides(ctx,state,width,height,{ground:true,backdrop:true});
     const pixels=ctx.getImageData(0,0,width,height).data,points=perspectiveVanishingPoints(state,width,height);
     const marks=points.map(p=>{let n=0;for(let y=Math.max(0,Math.floor(p.marker.y)-40);y<Math.min(height,p.marker.y+40);y++)for(let x=Math.max(0,Math.floor(p.marker.x)-40);x<Math.min(width,p.marker.x+40);x++)if(pixels[(y*width+x)*4+3]>30)n++;return {axis:p.axis,n};});
     ctx.clearRect(0,0,width,height);drawPerspectiveGuides(ctx,state,width,height,{});const cleanOverlay=ctx.getImageData(0,0,width,height).data.every(v=>v===0);
     ctx.clearRect(0,0,width,height);drawPerspectiveGuides(ctx,state,width,height,{backdrop:true});const wallPixels=ctx.getImageData(Math.floor(width/2)-20,height-70,40,70).data;let vertical=0;for(let i=3;i<wallPixels.length;i+=4)if(wallPixels[i]>30)vertical++;
     let png;
     if(count){const annotated=await annotatedReference(source,state,width,height,{ground:true,backdrop:true});png=[...new Uint8Array(await annotated.arrayBuffer())];}
     else{ctx.clearRect(0,0,width,height);ctx.drawImage(stage.canvas,0,0);drawPerspectiveGuides(ctx,state,width,height,{ground:true,backdrop:true});png=[...new Uint8Array(await(await new Promise(r=>overlay.toBlob(r))).arrayBuffer())];}
     stage.draw(state,width,height);results.push({width,height,count,marks,vertical,cleanOverlay,gridVisible:raw!==plain,reset:stage.canvas.toDataURL()===plain,png});
    }
   }finally{stage.dispose();}
   return results;
  });
  await fs.mkdir('.work',{recursive:true});
  for(const result of results){
   assert.ok(result.gridVisible);assert.ok(result.reset,'final render must return to the identical grid-free pixels');assert.ok(result.cleanOverlay);
   for(const mark of result.marks)assert.ok(mark.n>30,`${mark.axis} direction must remain visible when its VP is offcanvas`);
   assert.ok(result.vertical>30,'wall-only guides must display the vertical vanishing direction even with the horizon offscreen');
   await fs.writeFile(`.work/three-point-${result.width}x${result.height}-${result.count?'actors':'empty'}.png`,Buffer.from(result.png));
  }
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
