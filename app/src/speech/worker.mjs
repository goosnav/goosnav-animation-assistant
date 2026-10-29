import { synthesizeSpeech } from './synth.mjs';
let module;
self.onmessage=async({data:{lines,rate}})=>{
 try{
  if(!module){const r=await fetch(new URL('./vendor/flite.wasm',self.location.href));if(!r.ok)throw Error('Cannot load the bundled robot voice');module=await WebAssembly.compile(await r.arrayBuffer());}
  let duration=0;
  for(const [index,l] of lines.entries()){
   const take=await synthesizeSpeech(module,l.text,{rate:Math.max(.5,Math.min(2,rate*l.rate)),speaker:l.actor});duration+=take.duration+l.pause;
   if(duration>120)throw Error('Please split this dialogue into shorter clips');
   self.postMessage({id:l.id,index,take},[take.samples.buffer]);
  }
  self.postMessage({done:true});
 }catch(e){self.postMessage({error:e.message});}
};
