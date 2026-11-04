import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright';

const harness=(await build({stdin:{contents:`export * from './app/src/sequence.mjs';
export {exportFrameVideo} from './app/src/frame-video.mjs';
export {setSpeechWorkerURL} from './app/src/speech/client.mjs';
import {Input,BlobSource,MP4,VideoSampleSink,AudioSampleSink} from 'mediabunny';
export async function inspect(blob){
 const input=new Input({source:new BlobSource(blob),formats:[MP4]}),canvas=document.createElement('canvas');canvas.width=canvas.height=16;
 try{const video=await input.getPrimaryVideoTrack(),audio=await input.getPrimaryAudioTrack(),frames=[];
 for await(const sample of new VideoSampleSink(video).samples()){try{sample.draw(canvas.getContext('2d'),0,0,16,16);frames.push({time:sample.timestamp,pixel:[...canvas.getContext('2d').getImageData(8,8,1,1).data]});}finally{sample.close();}}
 const sound=[];if(audio)for await(const sample of new AudioSampleSink(audio).samples()){try{const options={planeIndex:0,format:'f32'},data=new Uint8Array(sample.allocationSize(options));sample.copyTo(data,options);sound.push({time:sample.timestamp,rate:sample.sampleRate,frames:sample.numberOfFrames,hash:[...new Uint8Array(await crypto.subtle.digest('SHA-256',data))]});}finally{sample.close();}}
 return {frames,sound,duration:await input.computeDuration()};}finally{input.dispose();canvas.width=canvas.height=1;}
}
export async function pixels(blob,points){const image=await createImageBitmap(blob),c=document.createElement('canvas');c.width=image.width;c.height=image.height;try{const ctx=c.getContext('2d');ctx.drawImage(image,0,0);return points.map(([x,y])=>[...ctx.getImageData(x,y,1,1).data]);}finally{image.close();c.width=c.height=1;}}
`,resolveDir:process.cwd()},bundle:true,platform:'browser',format:'esm',write:false})).outputFiles[0].text;
const launch=()=>chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
async function pageFor(browser){
 const page=await browser.newPage();await page.route('**/sequence-harness.mjs',r=>r.fulfill({contentType:'text/javascript',body:harness}));
 await page.goto('http://127.0.0.1:8793');await page.evaluate(async()=>{window.seq=await import('/sequence-harness.mjs');window.seq.setSpeechWorkerURL('/voice-worker.mjs');});return page;
}

test('three speech shots produce one labelled carrier and exact cuts with identical audio on a fresh browser',async()=>{
 const browser=await launch();try{
  const source=await pageFor(browser);const available=await source.evaluate(()=>typeof window.seq.renderSequenceAnimation);assert.equal(available,'function');
  const original=await source.evaluate(async()=>{
   const api=window.seq,recipe={format:'goosnav-animation-sequence',version:1,id:'speech-film',title:'Three speech cuts',shots:[
    {id:'close-a',title:'A close',config:{format:'goosnav-animation-config',version:1,scene:{actors:[{model:'blue',x:0,yaw:0}],camera:{zoom:1.7,targetY:1.45}},dialogue:[{actor:0,text:'Oh.'}]}},
    {id:'wide',title:'Together',config:{format:'goosnav-animation-config',version:1,dialogue:[{actor:0,text:'Hi.'},{actor:1,text:'Yes.'}]}},
    {id:'close-b',title:'B close',config:{format:'goosnav-animation-config',version:1,scene:{actors:[{model:'rust-beady',x:0,yaw:0}],camera:{zoom:1.7,targetY:1.45}},dialogue:[{actor:0,text:'Bye.'}]}},
   ]};
   const film=await api.prepareSequence(JSON.stringify(recipe)),files={};await api.renderSequenceReferences(film,{format:'both',emit:async(name,blob)=>files[name]=blob});
   const canvas=document.createElement('canvas');canvas.width=108;canvas.height=192;const colors=['#ff0000','#00ff00','#0000ff','#ffff00','#ff00ff','#00ffff'];
   const returned=await api.exportFrameVideo({canvas,frameCount:film.drawingSlots.length,drawFrame:async i=>{const ctx=canvas.getContext('2d');ctx.fillStyle=colors[i%6];ctx.fillRect(0,0,108,192);}});
   const ready=await api.attachSequenceArtwork(film,[new File([returned],'returned.mp4',{type:'video/mp4'})]),final=await api.renderSequenceAnimation(ready);
   const first=await createImageBitmap(files['references/0001.png']),labelCanvas=document.createElement('canvas');labelCanvas.width=first.width;labelCanvas.height=first.height;labelCanvas.getContext('2d').drawImage(first,0,0);first.close();
   const label=labelCanvas.getContext('2d').getImageData(15,15,600,150).data;let dark=0;for(let i=0;i<label.length;i+=4)if(label[i]<80&&label[i+1]<80&&label[i+2]<80)dark++;
   return {json:await files['sequence.json'].text(),returned:[...new Uint8Array(await returned.arrayBuffer())],reference:await api.inspect(files['references.mp4']),final:await api.inspect(final),slots:film.drawingSlots.map(s=>s.id),exposures:film.exposures,cuts:film.shots.map(s=>[s.startFrame,s.endFrame]),frames:film.totalFrames,files:Object.keys(files),dark};
  });
  assert.equal(original.reference.frames.length,original.slots.length);assert.equal(original.reference.sound.length,0);assert.equal(original.final.frames.length,original.frames);assert.ok(original.final.sound.length>0);assert.ok(original.dark>200,'each reference includes a visible shot/drawing label');
  assert.equal(original.files.filter(name=>name.endsWith('.png')).length,original.slots.length);
  const colors=[[255,0,0],[0,255,0],[0,0,255],[255,255,0],[255,0,255],[0,255,255]];
  for(const exposure of original.exposures){
   const color=colors[original.slots.indexOf(exposure.slotId)%6];
   for(const at of [exposure.startFrame,exposure.endFrame-1])original.final.frames[at].pixel.slice(0,3).forEach((value,ch)=>assert.ok(Math.abs(value-color[ch])<25,`frame ${at} must belong to ${exposure.shotId}`));
  }
  const receiver=await pageFor(browser),fresh=await receiver.evaluate(async original=>{
   const api=window.seq,film=await api.prepareSequence(original.json),ready=await api.attachSequenceArtwork(film,[new File([new Uint8Array(original.returned)],'returned.mp4',{type:'video/mp4'})]);
   return api.inspect(await api.renderSequenceAnimation(ready));
  },original);
  assert.deepEqual(fresh,original.final,'fresh reconstruction has identical decoded frame colors, sample times, audio, and duration');
 }finally{await browser.close();}
});

test('returned images and resized video retain shot backgrounds, original reference order, and atomic cancellation',async()=>{
 const browser=await launch();try{
  const page=await pageFor(browser);assert.equal(await page.evaluate(()=>typeof window.seq.attachSequenceArtwork),'function');
  const result=await page.evaluate(async()=>{
   const api=window.seq,recipe={format:'goosnav-animation-sequence',version:1,id:'film',title:'Backgrounds',shots:['#ff0000','#0000ff'].map((background,i)=>({id:`s-${i}`,title:`Shot ${i}`,config:{format:'goosnav-animation-config',version:1,scene:{background},timing:{mode:'silent',duration:.5}}}))};
   const film=await api.prepareSequence(JSON.stringify(recipe)),data=JSON.parse(api.sequenceJSON(film));data.shots.reverse();const reordered=await api.prepareSequence(JSON.stringify(data));
   const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const ctx=canvas.getContext('2d');ctx.fillStyle='#00ff00';ctx.fillRect(0,0,64,64);const image=await new Promise(r=>canvas.toBlob(r));
   const files=[new File([image],'0002.png',{type:'image/png'}),new File([image],'0001.png',{type:'image/png'})],images=await api.attachSequenceArtwork(reordered,files);
   const video=await api.exportFrameVideo({canvas,frameCount:2,drawFrame:async()=>{}}),movie=await api.attachSequenceArtwork(reordered,[new File([video],'returned.mp4',{type:'video/mp4'})]);
   const samples=async film=>Promise.all(film.shots.map(async s=>({id:s.id,pixels:await api.pixels(s.scene.art[s.scene.drawingSlots[0].id],[[500,5],[500,960]])})));
   let mismatch,cancelled;try{await api.attachSequenceArtwork(reordered,files.slice(1));}catch(e){mismatch=e.message;}
   const controller=new AbortController();try{await api.attachSequenceArtwork(reordered,files,{signal:controller.signal,onProgress:()=>controller.abort()});}catch(e){cancelled=e.name;}
   return {images:await samples(images),movie:await samples(movie),mismatch,cancelled,unchanged:reordered.shots.every(s=>Object.keys(s.scene.art).length===0),ids:images.drawingSlots.map(s=>s.shotId)};
  });
  assert.deepEqual(result.ids,['s-0','s-1']);assert.equal(result.images[0].id,'s-1');assert.deepEqual(result.images[0].pixels[0],[0,0,255,255]);assert.deepEqual(result.images[1].pixels[0],[255,0,0,255]);
  for(const kind of ['images','movie']){assert.ok(result[kind][0].pixels[0][2]>240);assert.ok(result[kind][1].pixels[0][0]>240);assert.ok(result[kind][0].pixels[1][1]>235);}
  assert.match(result.mismatch,/1 images; expected 2/);assert.equal(result.cancelled,'AbortError');assert.equal(result.unchanged,true);
 }finally{await browser.close();}
});

test('recorded audio is resampled and cut at exact frame boundaries without leaking into silent shots',async()=>{
 const browser=await launch();try{
  const page=await pageFor(browser);assert.equal(await page.evaluate(()=>typeof window.seq.sequenceAudio),'function');
  const result=await page.evaluate(async()=>{
   const api=window.seq,recipe={format:'goosnav-animation-sequence',version:1,id:'audio-film',title:'Exact audio',shots:[12,13,12].map((frames,i)=>({id:`s-${i}`,title:`Shot ${i}`,config:{format:'goosnav-animation-config',version:1,timing:{mode:'silent',duration:frames/24}}}))};
   const film=await api.prepareSequence(JSON.stringify(recipe));
   function wav(value){const a=new Uint8Array(44+44100*2),v=new DataView(a.buffer),text=(offset,s)=>[...s].forEach((c,i)=>v.setUint8(offset+i,c.charCodeAt(0)));text(0,'RIFF');v.setUint32(4,a.length-8,true);text(8,'WAVE');text(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,44100,true);v.setUint32(28,88200,true);v.setUint16(32,2,true);v.setUint16(34,16,true);text(36,'data');v.setUint32(40,a.length-44,true);for(let i=44;i<a.length;i+=2)v.setInt16(i,value,true);return new Blob([a],{type:'audio/wav'});}
   film.shots[0].scene.project.audioMode='recording';film.shots[0].scene.recording=wav(8192);
   film.shots[2].scene.project.audioMode='recording';film.shots[2].scene.recording=wav(-16384);
   const context=new AudioContext({sampleRate:44100});try{const buffer=await api.sequenceAudio(film,context),samples=buffer.getChannelData(0);return {rate:buffer.sampleRate,length:buffer.length,values:[100,23999,24000,49999,50000,50100,73999].map(i=>samples[i])};}finally{await context.close();}
  });
  assert.equal(result.rate,48000);assert.equal(result.length,74000);assert.ok(Math.abs(result.values[0]-.25)<.01);assert.ok(Math.abs(result.values[1]-.25)<.03);assert.equal(result.values[2],0);assert.equal(result.values[3],0);assert.ok(Math.abs(result.values[5]+.5)<.01);assert.ok(Math.abs(result.values[6]+.5)<.05);
 }finally{await browser.close();}
});
