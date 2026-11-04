import {parseConfig} from './config.mjs';
import {isSequenceDocument,parseSequenceDocument} from './sequence-config.mjs';

const DEFAULT_LIMITS={maxFiles:5000,maxBytes:2_000_000_000,maxDepth:16};
const imagePattern=/\.(?:png|jpe?g|webp)$/i;
const videoPattern=/\.(?:mp4|mov|m4v)$/i;
const generatedPattern=/^generated(?:-\d+)?$/i;
const referenceDirectory=/^(?:refs?|references?)$/i;
const referenceFilename=/(?:^|[._ -])(?:refs?|references?)(?=[._ -]|\d|$)/i;
const dirname=path=>path.split('/').slice(0,-1).join('/');
const basename=path=>path.split('/').at(-1);
const compare=(a,b)=>a<b?-1:a>b?1:0;

function checkCancelled(signal){if(signal?.aborted)throw signal.reason??new DOMException('Cancelled','AbortError');}
function limitsFor(options){
  const limits={...DEFAULT_LIMITS};
  for(const key of Object.keys(limits))if(options[key]!==undefined){
    if(!Number.isSafeInteger(options[key])||options[key]<1)throw Error(`Invalid ${key} limit`);
    limits[key]=options[key];
  }
  return limits;
}
function safePath(path,{allowEmpty=false,maxDepth=DEFAULT_LIMITS.maxDepth}={}){
  if(allowEmpty&&path==='')return [];
  if(typeof path!=='string'||!path||path.length>4096||/[\\\u0000-\u001f\u007f]/.test(path))throw Error('Unsafe file path');
  const parts=path.split('/');
  if(parts.some(p=>!p||p==='.'||p==='..'||p.length>255))throw Error(`Unsafe file path: ${path}`);
  if(parts.length-1>maxDepth)throw Error(`Folder depth exceeds ${maxDepth}: ${path}`);
  return parts;
}
function ignored(path){
  const parts=path.split('/');
  return parts.some(p=>p.startsWith('.'))||parts.slice(0,-1).some(p=>generatedPattern.test(p)||referenceDirectory.test(p));
}
function boundedEntries(entries,options={}){
  const limits=limitsFor(options);let bytes=0,count=0;
  const result=[];
  for(const entry of entries){
    checkCancelled(options.signal);safePath(entry.path,limits);
    if(ignored(entry.path))continue;
    if(++count>limits.maxFiles)throw Error(`Selection exceeds ${limits.maxFiles} files`);
    if(entry.file){
      if(!Number.isSafeInteger(entry.file.size)||entry.file.size<0)throw Error(`Unreadable file size: ${entry.path}`);
      bytes+=entry.file.size;
      if(bytes>limits.maxBytes)throw Error(`Selection exceeds ${limits.maxBytes} bytes`);
    }
    result.push(entry);
  }
  return result;
}

/** Normalize a webkitdirectory upload or an ordinary multi-file picker. */
export function entriesFromFiles(files,options={}){
  const entries=Array.from(files,file=>({path:file.webkitRelativePath||file.name,file}));
  // webkitRelativePath includes the selected directory; ordinary Files do not.
  const root=entries[0]?.file.webkitRelativePath?.split('/')[0];
  const stripRoot=root&&entries.every(e=>e.file.webkitRelativePath&&e.path.startsWith(`${root}/`));
  for(const entry of entries){
    safePath(entry.path,{maxDepth:Number.MAX_SAFE_INTEGER});
    if(stripRoot)entry.path=entry.path.slice(root.length+1);
  }
  return boundedEntries(entries,options);
}

function artworkInOrder(entries){
  const videos=entries.filter(e=>videoPattern.test(e.path));
  const images=entries.filter(e=>imagePattern.test(e.path));
  if(videos.length&&images.length)throw Error('Mixed artwork: supply either one drawing video or numbered images, not both');
  if(videos.length>1)throw Error('Multiple drawing videos: supply exactly one MP4, MOV or M4V');
  if(videos.length)return [videos[0].file];
  const numbered=images.map(entry=>{
    const name=basename(entry.path);
    // Older reference ZIPs use 01-d<uuid>.png; UUID suffix digits are not indices.
    const match=name.match(/^(\d+)[_-]/)??name.match(/(\d+)\.[^.]+$/);
    if(!match)throw Error(`Number each drawing image to establish its order: ${entry.path}`);
    const index=Number(match[1]);
    if(!Number.isSafeInteger(index))throw Error(`Invalid drawing number: ${entry.path}`);
    return {entry,index};
  }).sort((a,b)=>a.index-b.index||compare(a.entry.path,b.entry.path));
  for(let i=1;i<numbered.length;i++){
    if(numbered[i].index===numbered[i-1].index)throw Error(`Duplicate drawing index ${numbered[i].index}`);
    if(numbered[i].index!==numbered[i-1].index+1)throw Error(`Missing drawing index after ${numbered[i-1].index}; use consecutive numbers`);
  }
  if(numbered.length&&numbered[0].index!==0&&numbered[0].index!==1)throw Error('Missing starting drawing index; number images from 0 or 1');
  return numbered.map(n=>n.entry.file);
}

/** Discover independent scenes; malformed scenes carry an error instead of hiding good jobs. */
export async function discoverJobs(input,options={}){
  const entries=boundedEntries(input,options).filter(e=>!referenceFilename.test(basename(e.path)));
  const jsonDirectories=new Map();
  for(const entry of entries)if(/\.json$/i.test(entry.path)){
    const path=dirname(entry.path);
    if(!jsonDirectories.has(path))jsonDirectories.set(path,[]);
    jsonDirectories.get(path).push(entry);
  }
  const jobs=new Map(),unrecognized=[];
  const makeJob=(path,configEntry)=>({name:basename(path)||configEntry?.file?.name?.replace(/\.json$/i,'')||'Scene',path,
    config:configEntry?.file,artwork:[],...(configEntry?.directoryHandle?{sourceDirectory:configEntry.directoryHandle}:{})});
  for(const [path,candidates]of jsonDirectories){
    checkCancelled(options.signal);
    const inspected=[];
    for(const entry of candidates){
      let error,kind='scene',sceneLike=/^(?:scene|sequence)\.json$/i.test(basename(entry.path));
      try{
        if(entry.error)throw Error(entry.error);
        if(entry.file.size>5_000_000)throw Error('Scene JSON exceeds 5 MB');
        const text=await entry.file.text();checkCancelled(options.signal);
        const isSequence=isSequenceDocument(text);kind=isSequence?'sequence':'scene';
        try{sceneLike ||= isSequence||JSON.parse(text)?.format==='goosnav-animation-config';}catch{}
        // Discovery does not know whether the user will request fresh references
        // or return old artwork. Processing applies that compatibility policy.
        if(isSequence)parseSequenceDocument(text,{allowStaleHandoff:true});else parseConfig(text);
      }catch(cause){checkCancelled(options.signal);error=cause.message;}
      inspected.push({entry,error,sceneLike,kind});
    }
    const sceneCandidates=inspected.filter(c=>!c.error||c.sceneLike);
    const selected=sceneCandidates[0]??inspected[0];
    const job={...makeJob(path,selected.entry),kind:selected.kind};
    if(sceneCandidates.length>1)job.error='Ambiguous scene: multiple scene JSON configurations in one directory';
    else if(selected.error)job.error=selected.error;
    if(sceneCandidates.length)jobs.set(path,job);else unrecognized.push(job);
  }
  // A drawing application's nested metadata is not a child scene. Unknown JSON
  // outside every scene still receives a useful validation error.
  for(const job of unrecognized.sort((a,b)=>a.path.length-b.path.length)){
    if(![...jobs.keys()].some(path=>path===''||job.path===path||job.path.startsWith(`${path}/`)))jobs.set(job.path,job);
  }
  const owned=new Map([...jobs.keys()].map(path=>[path,[]]));
  for(const entry of entries){
    if(!entry.error&&!imagePattern.test(entry.path)&&!videoPattern.test(entry.path))continue;
    const parent=entry.kind==='directory'?entry.path:dirname(entry.path);
    let owner=[...jobs.keys()].filter(path=>path===''||parent===path||parent.startsWith(`${path}/`)).sort((a,b)=>b.length-a.length)[0];
    if(owner===undefined){
      owner=parent;const job=makeJob(parent,entry);job.config=undefined;job.error=entry.error||'Missing scene JSON configuration';
      jobs.set(owner,job);owned.set(owner,[]);
    }
    if(entry.error)jobs.get(owner).error??=entry.error;
    else owned.get(owner).push(entry);
  }
  for(const [path,job]of jobs){
    if(job.error)continue;
    try{job.artwork=artworkInOrder(owned.get(path));}catch(error){job.error=error.message;}
  }
  return [...jobs.values()].sort((a,b)=>compare(a.path,b.path));
}
/** Validate the same video/image contract for manual imports. Images start at 0 or 1. */
export function orderArtwork(files){
  const entries=boundedEntries(Array.from(files,file=>({path:file.name,file})));
  if(entries.some(e=>!imagePattern.test(e.path)&&!videoPattern.test(e.path)))throw Error('Artwork must be PNG, JPEG, WebP, MP4, MOV or M4V');
  return artworkInOrder(entries);
}

/** Read a browser FileSystemDirectoryHandle without changing any files. */
export async function readDirectory(handle,options={}){
  const limits=limitsFor(options),entries=[];let count=0,bytes=0;
  if(handle?.kind!=='directory')throw Error('Choose a source directory');
  async function walk(directory,path,depth){
    checkCancelled(options.signal);
    if(depth>limits.maxDepth)throw Error(`Folder depth exceeds ${limits.maxDepth}: ${path}`);
    let iterator;
    try{iterator=directory.values()[Symbol.asyncIterator]();}catch(error){
      if(!path)throw error;
      entries.push({path,kind:'directory',directoryHandle:directory,error:error.message});return;
    }
    while(true){
      checkCancelled(options.signal);let next;
      try{next=await iterator.next();}catch(error){
        if(!path)throw error;
        entries.push({path,kind:'directory',directoryHandle:directory,error:error.message});return;
      }
      if(next.done)break;
      const child=next.value,childPath=path?`${path}/${child.name}`:child.name;
      safePath(childPath,limits);
      if(ignored(childPath)||child.name.startsWith('.')||child.kind==='directory'&&(generatedPattern.test(child.name)||referenceDirectory.test(child.name)))continue;
      if(++count>limits.maxFiles)throw Error(`Selection exceeds ${limits.maxFiles} files or folder entries`);
      if(child.kind==='directory'){await walk(child,childPath,depth+1);continue;}
      if(child.kind!=='file')continue;
      let file;
      try{file=await child.getFile();}catch(error){
        entries.push({path:childPath,directoryHandle:directory,error:error.message});continue;
      }
      checkCancelled(options.signal);bytes+=file.size;
      if(bytes>limits.maxBytes)throw Error(`Selection exceeds ${limits.maxBytes} bytes`);
      entries.push({path:childPath,file,directoryHandle:directory});
    }
  }
  await walk(handle,'',0);
  return entries.sort((a,b)=>compare(a.path,b.path));
}

async function exists(directory,name){
  try{await directory.getDirectoryHandle(name);return true;}
  catch(error){if(error.name==='NotFoundError')return false;if(error.name==='TypeMismatchError')return true;throw error;}
}
async function writablePermission(directory){
  if(!directory.queryPermission)return;
  let permission=await directory.queryPermission({mode:'readwrite'});
  if(permission==='prompt'&&directory.requestPermission)permission=await directory.requestPermission({mode:'readwrite'});
  if(permission!=='granted')throw Error('Write permission denied for the output directory');
}
// Serialize reservations within this page: two simultaneous jobs cannot choose the same run.
let reservationQueue=Promise.resolve();
async function reserveRun(directory,signal){
  let release;
  const previous=reservationQueue;
  reservationQueue=new Promise(resolve=>{release=resolve;});
  await previous;
  try{
    for(let index=1;index<=10000;index++){
      checkCancelled(signal);
      const name=index===1?'generated':`generated-${index}`;
      if(await exists(directory,name))continue;
      checkCancelled(signal);
      return {name,directory:await directory.getDirectoryHandle(name,{create:true})};
    }
    throw Error('Too many generated output directories; choose another output folder');
  }finally{release();}
}

/** Reserve a new run in the source scene or beneath an explicit output root.
 * The returned path is relative to the selected root. Writes are sequential and
 * only newly created output files are opened; close/abort release cancellation listeners.
 */
export async function createOutputWriter({root,job,source,signal}={}){
  const path=job?.path??'',parts=safePath(path,{allowEmpty:true});
  let parent=root??source??job?.sourceDirectory;
  if(parent?.kind!=='directory')throw Error('Choose an output directory or use ZIP download');
  checkCancelled(signal);await writablePermission(parent);checkCancelled(signal);
  if(root)for(const name of parts){checkCancelled(signal);parent=await parent.getDirectoryHandle(name,{create:true});}
  const reserved=await reserveRun(parent,signal),directory=reserved.directory;
  let closed=false,aborted=false,active=null,pending=null,abortPromise=null;
  function ensureOpen(){
    checkCancelled(signal);
    if(aborted)throw new DOMException('Output cancelled','AbortError');
    if(closed)throw Error('Output writer is closed');
  }
  async function abortActive(){
    if(!active)return;
    if(!abortPromise)abortPromise=Promise.resolve().then(()=>active?.abort()).catch(()=>{});
    await abortPromise;
  }
  const onAbort=()=>{aborted=true;void abortActive();};
  signal?.addEventListener('abort',onAbort,{once:true});
  const writer={
    path:[path,reserved.name].filter(Boolean).join('/'),directory,
    async write(relativePath,blob){
      ensureOpen();
      const names=safePath(relativePath);
      if(!(blob instanceof Blob))throw Error('Output data must be a Blob');
      if(pending)throw Error('Write output files sequentially');
      const operation=(async()=>{
        let target=directory,created=false;
        const filename=names.pop();
        try{
          for(const name of names){ensureOpen();target=await target.getDirectoryHandle(name,{create:true});}
          ensureOpen();
          if(await exists(target,filename))throw Error(`Output already exists; refusing to overwrite ${relativePath}`);
          ensureOpen();
          const file=await target.getFileHandle(filename,{create:true});created=true;
          ensureOpen();
          active=await file.createWritable({keepExistingData:false,mode:'exclusive'});
          ensureOpen();await active.write(blob);ensureOpen();await active.close();active=null;
          return [writer.path,relativePath].join('/');
        }catch(error){
          await abortActive();
          if(created)try{await target.removeEntry(filename);}catch{}
          throw error;
        }finally{active=null;abortPromise=null;}
      })();
      pending=operation;
      try{return await operation;}finally{pending=null;}
    },
    async close(){
      if(pending)await pending;
      ensureOpen();closed=true;signal?.removeEventListener('abort',onAbort);
    },
    async abort(){
      aborted=true;signal?.removeEventListener('abort',onAbort);await abortActive();
      if(pending)try{await pending;}catch{}
      closed=true;
    },
  };
  if(signal?.aborted){await writer.abort();checkCancelled(signal);}
  return writer;
}
