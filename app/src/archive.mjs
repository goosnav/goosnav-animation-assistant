import { zip, unzipSync, strToU8, strFromU8 } from 'fflate';
import { validateProject } from './core.mjs';
import { validateTransfer } from './drawing-transfer.mjs';
const LIMIT=256*1024*1024;
export async function packProject(state){
 const files={};let next=0,total=0;
 async function encode(v){
  if(v instanceof Blob||v instanceof Float32Array){
   const data=v instanceof Blob?new Uint8Array(await v.arrayBuffer()):new Uint8Array(v.buffer,v.byteOffset,v.byteLength);
   total+=data.byteLength;if(total>LIMIT)throw Error('Project exceeds the 256 MB portable backup limit');
   const path=`media/${++next}.bin`;files[path]=[data,{level:0}];return {__media:path,kind:v instanceof Blob?'blob':'float32',type:v.type||''};
  }
  if(Array.isArray(v))return Promise.all(v.map(encode));
  if(v&&typeof v==='object'){const result={};for(const [k,x]of Object.entries(v))result[k]=await encode(x);return result;}
  return v;
 }
 files['project.json']=strToU8(JSON.stringify(await encode(state)));
 const bytes=await new Promise((resolve,reject)=>zip(files,{level:3},(e,b)=>e?reject(e):resolve(b)));
 return new Blob([bytes],{type:'application/zip'});
}
export async function unpackProject(blob){
 if(blob.size>LIMIT)throw Error('Project archive is too large');let total=0;
 const files=unzipSync(new Uint8Array(await blob.arrayBuffer()),{filter:file=>{total+=file.originalSize;if(total>LIMIT)throw Error('Expanded project is too large');return true;}});
 if(!files['project.json']||files['project.json'].length>8*1024*1024)throw Error('Missing or oversized project manifest');
 const parsed=JSON.parse(strFromU8(files['project.json']));
 function decode(v,depth=0){
  if(depth>40)throw Error('Project nesting is too deep');
  if(v&&typeof v==='object'&&v.__media){const bytes=files[v.__media];if(!bytes)throw Error('Project media is missing');if(v.kind==='blob')return new Blob([bytes],{type:v.type});if(v.kind==='float32'&&bytes.length%4===0)return new Float32Array(bytes.slice().buffer);throw Error('Invalid project media');}
  if(Array.isArray(v))return v.map(x=>decode(x,depth+1));
  if(v&&typeof v==='object'){const out=Object.create(null);for(const[k,x]of Object.entries(v)){if(['__proto__','constructor','prototype'].includes(k))throw Error('Invalid project property');out[k]=decode(x,depth+1);}return out;}
  return v;
 }
 const result=decode(parsed);validateProject(result.project);
 if(result.transfer!=null)validateTransfer(result.transfer);
 for(const key of ['recording','video'])if(result[key]!=null&&!(result[key] instanceof Blob))throw Error('Invalid saved media');
 for(const collection of [result.art,result.refs,result.thumbs,result.artThumbs])if(collection&&Object.values(collection).some(b=>!(b instanceof Blob)))throw Error('Invalid drawing media');
 if(result.takes)for(const t of Object.values(result.takes)){if(!(t.samples instanceof Float32Array)||!Array.isArray(t.phones)||t.phones.length>20000||!Number.isFinite(t.duration)||t.duration<=0||t.duration>120||![8000,16000,22050,24000,44100,48000].includes(t.sampleRate))throw Error('Invalid saved speech');for(const phone of t.phones)if(typeof phone.phone!=='string'||phone.phone.length>12||!Number.isFinite(phone.start)||!Number.isFinite(phone.end)||phone.start<0||phone.end<phone.start||phone.end>t.duration+.05)throw Error('Invalid saved phoneme timing');}
 return result;
}
