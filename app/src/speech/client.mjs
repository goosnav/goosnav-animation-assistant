export function generateSpeech(project,{signal,onProgress=()=>{}}={}){
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./voice-worker.mjs',location.href),{type:'module'}),takes={};
  const timer=setTimeout(()=>finish(Error('Speech generation timed out; try a shorter line')),90000);
  const abort=()=>finish(new DOMException('Cancelled','AbortError'));
  function finish(error){clearTimeout(timer);worker.terminate();signal?.removeEventListener('abort',abort);error?reject(error):resolve(takes);}
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)return abort();
  worker.onerror=e=>finish(Error(e.message||'Voice worker failed'));
  worker.onmessage=({data})=>{if(data.error)return finish(Error(data.error));if(data.done)return finish();takes[data.id]=data.take;onProgress(data.index+1);};
  worker.postMessage({lines:project.lines.filter(l=>l.text.trim()),rate:project.rate});
 });
}
export function mixSpeech(context,clip,takes){
 const rate=48000,buffer=context.createBuffer(1,Math.ceil(clip.duration*rate),rate),out=buffer.getChannelData(0);
 for(const line of clip.lines){const t=takes[line.id];if(!t)continue;const start=Math.round(line.start*rate);for(let i=0;i<Math.ceil(t.duration*rate)&&start+i<out.length;i++){const at=i*t.sampleRate/rate,lo=Math.floor(at),f=at-lo;out[start+i]=(t.samples[lo]||0)*(1-f)+(t.samples[lo+1]||0)*f;}}
 return buffer;
}
