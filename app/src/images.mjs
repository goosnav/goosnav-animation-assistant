import { zip } from 'fflate';
export function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
export async function shareFiles(files){
 if(!navigator.canShare?.({files}))throw Error('This browser cannot share this batch. Try a smaller batch or Download ZIP.');
 await navigator.share({files});
}
export async function imageZip(files){const entries={};for(const f of files)entries[f.name]=[new Uint8Array(await f.arrayBuffer()),{level:0}];return new Blob([await new Promise((resolve,reject)=>zip(entries,(e,b)=>e?reject(e):resolve(b)))],{type:'application/zip'});}
export async function decodeImage(blob){
 if(blob.size>25*1024*1024)throw Error('An image is larger than 25 MB. Export a smaller PNG from Procreate.');
 const url=URL.createObjectURL(blob),img=new Image();
 try{img.src=url;await img.decode();if(img.naturalWidth*img.naturalHeight>32e6)throw Error('Image dimensions are too large');return img;}finally{URL.revokeObjectURL(url);}
}
export async function normalizeImage(blob,width,height,mode='exact'){
 const img=await decodeImage(blob),w=img.naturalWidth,h=img.naturalHeight;
 if(mode==='exact'&&(w!==width||h!==height))throw Error(`Image is ${w} × ${h}; expected ${width} × ${height}. Choose Fit or Crop, then apply again.`);
 const c=document.createElement('canvas');c.width=width;c.height=height;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,width,height);
 const scale=mode==='crop'?Math.max(width/w,height/h):Math.min(width/w,height/h);
 ctx.drawImage(img,(width-w*scale)/2,(height-h*scale)/2,w*scale,h*scale);
 return new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('Could not prepare image')),'image/png'));
}
export async function thumbnail(blob){
 const img=await decodeImage(blob),c=document.createElement('canvas');const scale=Math.min(180/img.naturalWidth,320/img.naturalHeight);c.width=Math.max(1,Math.round(img.naturalWidth*scale));c.height=Math.max(1,Math.round(img.naturalHeight*scale));c.getContext('2d').drawImage(img,0,0,c.width,c.height);return new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('Thumbnail failed')),'image/jpeg',.85));
}
export class ImageCache {
 constructor(blobs,limit=3){this.blobs=blobs;this.cache=new Map();this.limit=limit;}
 async get(id){if(this.cache.has(id)){const img=this.cache.get(id);this.cache.delete(id);this.cache.set(id,img);return img;}if(!this.blobs[id])throw Error(`Drawing ${id} is missing`);const img=await decodeImage(this.blobs[id]);this.cache.set(id,img);while(this.cache.size>this.limit)this.cache.delete(this.cache.keys().next().value);return img;}
 clear(){this.cache.clear();}
}
export async function layeredPSD(slots,refs,width,height){
 const {default:psd}=await import('ag-psd/dist/bundle.js');const {writePsd}=psd;const layers=[];
 for(const [i,s]of slots.entries()){
  const img=await decodeImage(refs[s.id]),c=document.createElement('canvas');c.width=width;c.height=height;c.getContext('2d').drawImage(img,0,0);
  layers.push({name:`${String(i+1).padStart(2,'0')} • ${s.id} • reference`,canvas:c,hidden:i!==0});
 }
 const data=writePsd({width,height,children:layers.reverse()});
 layers.forEach(l=>{l.canvas.width=1;l.canvas.height=1;});return new Blob([data],{type:'image/vnd.adobe.photoshop'});
}
