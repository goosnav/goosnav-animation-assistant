import { WASI, File, OpenFile, ConsoleStdout, PreopenDirectory } from '@bjorn3/browser_wasi_shim';

// Adapted from the 3D Comic Engine WASI adapter; complete segment output is
// collected separately from diagnostics. Audio and phones share one synthesis.
export async function synthesizeSpeech(module,text,{rate=1,speaker=0}={}) {
  if(typeof text!=='string'||!text.trim()||text.length>1000||text.includes('\0'))throw Error('Write 1–1000 characters per line');
  if(!Number.isFinite(rate)||rate<.5||rate>2)throw Error('Speech speed must be 0.5–2×');
  const output=new PreopenDirectory('/out',[]), logs=[];
  const stdout=ConsoleStdout.lineBuffered(line=>logs.push(line));
  const wasi=new WASI(['flite','-voice','kal','-psdur','--setf',`duration_stretch=${1/rate}`,'--setf',`int_f0_target_mean=${speaker?125:95}`,'-t',text,'-o','/out/voice.wav'],[],[new OpenFile(new File([])),stdout,stdout,output],{debug:false});
  wasi.wasiImport.args_sizes_get=(argc,argvSize)=>{const view=new DataView(wasi.inst.exports.memory.buffer);view.setUint32(argc,wasi.args.length,true);view.setUint32(argvSize,wasi.args.reduce((n,a)=>n+new TextEncoder().encode(a).length+1,0),true);return 0;};
  const instance=await WebAssembly.instantiate(module,{wasi_snapshot_preview1:wasi.wasiImport});
  const code=wasi.start(instance), bytes=output.dir.contents.get('voice.wav')?.data;
  if(code!==0||!bytes)throw Error('Robot voice failed: '+logs.join(' ').slice(0,200));
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let rateHz,offset,size;
  const tag=i=>String.fromCharCode(...bytes.subarray(i,i+4));
  for(let i=12;i+8<=bytes.length;){const n=v.getUint32(i+4,true),start=i+8;if(start+n>bytes.length)throw Error('Truncated voice audio');if(tag(i)==='fmt '){if(v.getUint16(start,true)!==1||v.getUint16(start+2,true)!==1||v.getUint16(start+14,true)!==16)throw Error('Unsupported voice format');rateHz=v.getUint32(start+4,true);}if(tag(i)==='data'){offset=start;size=n;}i=start+n+n%2;}
  if(!rateHz||!size||size%2)throw Error('Empty voice audio');
  const samples=new Float32Array(size/2);for(let i=0;i<samples.length;i++)samples[i]=v.getInt16(offset+i*2,true)/32768;
  const phones=[];let utteranceOffset=0;
  for(const line of logs){const matches=[...line.matchAll(/\b([a-z]+):([0-9]+\.[0-9]+)/g)];if(!matches.length)continue;let start=0;for(const m of matches){const end=Number(m[2]);phones.push({phone:m[1],start:utteranceOffset+start,end:utteranceOffset+end});start=end;}utteranceOffset+=start;}
  const duration=samples.length/rateHz;
  const last=phones.at(-1);
  if(!last||last.phone!=='pau'||last.start>duration||duration>last.end+.05)throw Error('The bundled voice did not provide aligned speech timings');
  // Kal's diphone output truncates ~0.1s of the final silence. Spoken segment
  // positions are unchanged: clamp the terminal pause rather than stretching all phones.
  const aligned=phones.filter(p=>p.start<duration).map(p=>({...p,end:Math.min(p.end,duration)}));
  return {samples,sampleRate:rateHz,duration,phones:aligned};
}
