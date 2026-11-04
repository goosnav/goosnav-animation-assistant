import test from 'node:test';
import assert from 'node:assert/strict';
import {entriesFromFiles,readDirectory,discoverJobs,createOutputWriter,orderArtwork} from '../app/src/batch-files.mjs';

const recipe=JSON.stringify({format:'goosnav-animation-config',version:1,title:'Scene',timing:{mode:'silent',duration:1}});
function file(path,content=path){
  const value=new File([content],path.split('/').at(-1));
  Object.defineProperty(value,'webkitRelativePath',{value:path});
  return value;
}
function entry(path,content){return {path,file:file(path,content)};}

test('folder uploads strip exactly one shared selected root without losing nested scenes',async()=>{
  const files=[file('Batch/a/scene.json',recipe),file('Batch/a/drawings/2.png'),file('Batch/a/drawings/1.png'),file('Batch/b/custom.json',recipe)];
  const entries=entriesFromFiles(files);
  assert.deepEqual(entries.map(e=>e.path),['a/scene.json','a/drawings/2.png','a/drawings/1.png','b/custom.json']);
  const jobs=await discoverJobs(entries);
  assert.deepEqual(jobs.map(j=>[j.path,j.artwork.map(f=>f.name),j.error]),[['a',['1.png','2.png'],undefined],['b',[],undefined]]);
  assert.equal(jobs[0].config,files[0]);
});

test('nested scene configs own their artwork and generated/reference assets never become drawings',async()=>{
  const jobs=await discoverJobs([
    entry('scene.json',recipe),entry('drawings/02.png'),entry('drawings/01.png'),
    entry('references/scene.json','{}'),entry('references/01.png'),entry('refs/output.mp4'),entry('reference-01.png'),entry('references.mp4'),
    entry('generated/scene.json',recipe),entry('generated/animation.mp4'),entry('generated-2/scene.json',recipe),
    entry('nested/scene.json',recipe),entry('nested/drawings/movie.mp4'),
  ]);
  assert.deepEqual(jobs.map(j=>[j.path,j.artwork.map(f=>f.name),j.error]),[['',['01.png','02.png'],undefined],['nested',['movie.mp4'],undefined]]);
});

test('plain manual file selection keeps filenames and accepts an arbitrary video filename',async()=>{
  const files=[new File([recipe],'my scene.json'),new File(['video'],'sketch export.MOV')];
  const jobs=await discoverJobs(entriesFromFiles(files));
  assert.equal(jobs.length,1);
  assert.equal(jobs[0].path,'');
  assert.deepEqual(jobs[0].artwork,[files[1]]);
  assert.equal(jobs[0].error,undefined);
});

test('bad jobs report ambiguity, duplicate or missing drawing indices, and mixed media independently',async()=>{
  const jobs=await discoverJobs([
    entry('good/scene.json',recipe),entry('good/001.png'),entry('good/002.png'),
    entry('ambiguous/scene.json',recipe),entry('ambiguous/another.json',recipe),
    entry('duplicate/scene.json',recipe),entry('duplicate/01.png'),entry('duplicate/drawings/frame-1.jpg'),
    entry('missing/scene.json',recipe),entry('missing/1.png'),entry('missing/3.png'),
    entry('mixed/scene.json',recipe),entry('mixed/1.png'),entry('mixed/art.mp4'),
    entry('invalid/scene.json','{'),entry('orphan/drawings.mp4'),
  ]);
  const byPath=Object.fromEntries(jobs.map(j=>[j.path,j]));
  assert.equal(byPath.good.error,undefined);
  assert.match(byPath.ambiguous.error,/multiple|ambiguous/i);
  assert.match(byPath.duplicate.error,/duplicate/i);
  assert.match(byPath.missing.error,/missing|consecutive/i);
  assert.match(byPath.mixed.error,/mixed|both/i);
  assert.match(byPath.invalid.error,/JSON/i);
  assert.match(byPath.orphan.error,/scene.*JSON|JSON.*scene/i);
});

test('manual images use numeric order and unsafe or unnumbered paths fail before rendering',async()=>{
  const jobs=await discoverJobs(entriesFromFiles([new File([recipe],'scene.json'),new File(['x'],'art2.png'),new File(['x'],'art1.png')]));
  assert.deepEqual(jobs[0].artwork.map(f=>f.name),['art1.png','art2.png']);
  const bad=await discoverJobs([entry('scene.json',recipe),entry('sketch.png')]);
  assert.match(bad[0].error,/number/i);
  assert.throws(()=>entriesFromFiles([file('Batch/../scene.json',recipe)]),/path/i);
  assert.throws(()=>entriesFromFiles([file('Batch/a\\evil.png')]),/path/i);
});

test('unrelated JSON manifests beside a valid recipe are ignored but a second recipe is ambiguous',async()=>{
  const jobs=await discoverJobs([entry('scene.json',recipe),entry('manifest.json','{"slots":[1,2]}'),entry('01.png')]);
  assert.equal(jobs[0].config.name,'scene.json');
  assert.equal(jobs[0].error,undefined);
  assert.equal(jobs[0].artwork.length,1);
});

test('nested unrelated manifests do not steal artwork from their enclosing scene',async()=>{
  const jobs=await discoverJobs([entry('scene.json',recipe),entry('drawings/manifest.json','{"frames":2}'),entry('drawings/1.png'),entry('drawings/2.png')]);
  assert.equal(jobs.length,1);
  assert.equal(jobs[0].error,undefined);
  assert.deepEqual(jobs[0].artwork.map(f=>f.name),['1.png','2.png']);
});

test('numbered reference filenames are excluded and no returned artwork means a reference-only job',async()=>{
  const [job]=await discoverJobs([entry('scene.json',recipe),entry('reference001.png'),entry('ref002.png')]);
  assert.equal(job.error,undefined);
  assert.deepEqual(job.artwork,[]);
});

test('file selection limits reject excessive files, bytes and nesting',()=>{
  assert.throws(()=>entriesFromFiles([file('a.png'),file('b.png')],{maxFiles:1}),/files/i);
  assert.throws(()=>entriesFromFiles([file('a.png','1234')],{maxBytes:3}),/bytes|size/i);
  assert.throws(()=>entriesFromFiles([file('Batch/a/b/c.png')],{maxDepth:1}),/depth|deep/i);
});

test('manual media ordering is available without a scene JSON',()=>{
  const first=new File(['first'],'frame-1.png'),second=new File(['second'],'frame-2.png');
  assert.deepEqual(orderArtwork([second,first]),[first,second]);
  assert.throws(()=>orderArtwork([first,new File(['duplicate'],'01.jpg')]),/duplicate/i);
  assert.throws(()=>orderArtwork([first,new File(['video'],'art.mp4')]),/mixed|both/i);
});

test('legacy reference ZIP filenames sort by their leading index instead of UUID suffixes',()=>{
  const first=new File(['first'],'01-d16cdb21f-0012-477d-a48e-748b4f5d9259.png');
  const second=new File(['second'],'02-d1ce5675d-4ad4-4251-8117-d518a6750100.png');
  const third=new File(['third'],'03_d417a50ef-5bc6-4b08-a1d9-c978250523a1.png');
  assert.deepEqual(orderArtwork([third,second,first]),[first,second,third]);
  assert.throws(()=>orderArtwork([first,new File(['duplicate'],'drawing001.png')]),/duplicate/i);
});

test('M4V returned artwork works in manual selection and discovered scenes',async()=>{
  const video=new File(['movie'],'artist export.M4V');
  assert.deepEqual(orderArtwork([video]),[video]);
  const [job]=await discoverJobs([entry('scene.json',recipe),{path:video.name,file:video}]);
  assert.equal(job.error,undefined);
  assert.deepEqual(job.artwork,[video]);
  assert.throws(()=>orderArtwork([video,new File(['frame'],'001.png')]),/mixed|both/i);
});

const missing=()=>new DOMException('Entry does not exist','NotFoundError');
class MemoryFile{
  constructor(name,content=''){this.kind='file';this.name=name;this.content=new Blob([content]);this.streams=[];}
  async getFile(){if(this.readError)throw this.readError;return new File([this.content],this.name);}
  async createWritable(){
    if(this.openError)throw this.openError;
    const handle=this;
    const stream={aborted:false,closed:false,pending:null,
      async write(blob){this.pending=blob;await handle.onWrite?.(this);if(handle.writeError)throw handle.writeError;},
      async close(){if(handle.closeError)throw handle.closeError;handle.content=this.pending;this.closed=true;},
      async abort(){this.aborted=true;this.pending=null;await handle.onAbort?.();},
    };
    this.streams.push(stream);return stream;
  }
}
class MemoryDirectory{
  constructor(name,children={}){this.kind='directory';this.name=name;this.children=new Map();this.permission='granted';for(const [key,value]of Object.entries(children))this.children.set(key,typeof value==='string'?new MemoryFile(key,value):value);}
  async *entries(){if(this.readError)throw this.readError;yield* this.children.entries();}
  async *values(){if(this.readError)throw this.readError;yield* this.children.values();}
  async queryPermission(){return this.permission;}
  async requestPermission(){return this.permission;}
  async getDirectoryHandle(name,{create=false}={}){
    if(this.writeError&&create)throw this.writeError;
    let child=this.children.get(name);
    if(!child){if(!create)throw missing();child=new MemoryDirectory(name);this.children.set(name,child);}
    if(child.kind!=='directory')throw new DOMException('Entry is a file','TypeMismatchError');
    return child;
  }
  async getFileHandle(name,{create=false}={}){
    let child=this.children.get(name);
    if(!child){if(!create)throw missing();child=new MemoryFile(name);this.onFile?.(child);this.children.set(name,child);}
    if(child.kind!=='file')throw new DOMException('Entry is a directory','TypeMismatchError');
    return child;
  }
  async removeEntry(name){this.children.delete(name);}
}

test('directory traversal retains source handles, skips generated/hidden assets and bounds scans',async()=>{
  const scene=new MemoryDirectory('one',{'scene.json':recipe,drawings:new MemoryDirectory('drawings',{'1.png':'first'})});
  const root=new MemoryDirectory('Batch',{one:scene,generated:new MemoryDirectory('generated',{'scene.json':recipe}),'.hidden':new MemoryDirectory('.hidden',{'secret.png':'x'})});
  const entries=await readDirectory(root);
  assert.deepEqual(entries.map(e=>e.path),['one/drawings/1.png','one/scene.json']);
  const [job]=await discoverJobs(entries);
  assert.equal(job.sourceDirectory,scene);
  assert.deepEqual(job.artwork.map(f=>f.name),['1.png']);
  await assert.rejects(()=>readDirectory(root,{maxBytes:1}),/bytes|size/i);
  await assert.rejects(()=>readDirectory(root,{maxDepth:1}),/depth|deep/i);
  await assert.rejects(()=>readDirectory(root,{maxFiles:1}),/files|entries/i);
});

test('unreadable scenes become error jobs while inaccessible source roots surface their error',async()=>{
  const blocked=new MemoryDirectory('blocked');blocked.readError=new DOMException('Permission denied','NotAllowedError');
  const root=new MemoryDirectory('Batch',{blocked,good:new MemoryDirectory('good',{'scene.json':recipe})});
  const jobs=await discoverJobs(await readDirectory(root));
  assert.equal(jobs.find(j=>j.path==='good').error,undefined);
  assert.match(jobs.find(j=>j.path==='blocked').error,/permission/i);
  await assert.rejects(()=>readDirectory(blocked),/Permission denied/);
});

test('source output uses unique run folders and never modifies scene inputs or previous output',async()=>{
  const scene=new MemoryDirectory('scene',{'scene.json':recipe,'1.png':'original',generated:new MemoryDirectory('generated',{'animation.mp4':'previous'}),'generated-2':'reserved file'});
  const writer=await createOutputWriter({job:{path:'scene',sourceDirectory:scene}});
  assert.equal(writer.path,'scene/generated-3');
  await writer.write('animation.mp4',new Blob(['new animation']));
  await writer.write('references/01.png',new Blob(['new reference']));
  await writer.close();
  const generated=scene.children.get('generated-3');
  assert.equal(await generated.children.get('animation.mp4').content.text(),'new animation');
  assert.equal(await generated.children.get('references').children.get('01.png').content.text(),'new reference');
  assert.equal(await scene.children.get('scene.json').content.text(),recipe);
  assert.equal(await scene.children.get('1.png').content.text(),'original');
  assert.equal(await scene.children.get('generated').children.get('animation.mp4').content.text(),'previous');
  await assert.rejects(()=>writer.write('late.mp4',new Blob(['x'])),/closed/i);
});

test('chosen output root mirrors nested scene paths without writing to the source',async()=>{
  const scene=new MemoryDirectory('scene',{'scene.json':recipe}),root=new MemoryDirectory('Output');
  const writer=await createOutputWriter({root,job:{path:'batch/scene',sourceDirectory:scene}});
  assert.equal(writer.path,'batch/scene/generated');
  await writer.write('scene.json',new Blob([recipe]));await writer.close();
  assert.deepEqual([...scene.children.keys()],['scene.json']);
  assert.equal(await root.children.get('batch').children.get('scene').children.get('generated').children.get('scene.json').content.text(),recipe);
});

test('writers reject traversal and duplicate output files before modifying existing data',async()=>{
  const root=new MemoryDirectory('Output');
  await assert.rejects(()=>createOutputWriter({root,job:{path:'../escape'}}),/path/i);
  assert.equal(root.children.size,0);
  const writer=await createOutputWriter({root,job:{path:''}});
  await assert.rejects(()=>writer.write('../escape.mp4',new Blob(['x'])),/path/i);
  await writer.write('animation.mp4',new Blob(['first']));
  await assert.rejects(()=>writer.write('animation.mp4',new Blob(['second'])),/exist|overwrite/i);
  assert.equal(await writer.directory.children.get('animation.mp4').content.text(),'first');
  await writer.close();
});

test('denied output permissions and file write errors surface without replacing source inputs',async()=>{
  const source=new MemoryDirectory('scene',{'scene.json':recipe});source.permission='denied';
  await assert.rejects(()=>createOutputWriter({source,job:{path:''}}),/permission/i);
  assert.deepEqual([...source.children.keys()],['scene.json']);
  source.permission='granted';
  for(const failure of ['writeError','closeError']){
    const writer=await createOutputWriter({source,job:{path:''}});
    let output;writer.directory.onFile=handle=>{output=handle;handle[failure]=Error('Disk full');};
    await assert.rejects(()=>writer.write('animation.mp4',new Blob(['new'])),/Disk full/);
    assert.equal(output.streams[0].aborted,true);
    assert.equal(await output.content.text(),'');
  }
  assert.equal(await source.children.get('scene.json').content.text(),recipe);
});

test('cancelling an active write aborts its stream and prevents further files',async()=>{
  const source=new MemoryDirectory('scene'),controller=new AbortController();
  const writer=await createOutputWriter({source,job:{path:''},signal:controller.signal});
  let started,unblock;
  const writing=new Promise(resolve=>{started=resolve;});
  writer.directory.onFile=handle=>{
    handle.onWrite=()=>{started();return new Promise(resolve=>{unblock=resolve;});};
    handle.onAbort=()=>unblock();
  };
  const pending=writer.write('animation.mp4',new Blob(['incomplete']));
  await writing;controller.abort();
  await assert.rejects(()=>pending,error=>error.name==='AbortError');
  const output=writer.directory.children.get('animation.mp4');
  if(output)assert.equal(await output.content.text(),'');
  await assert.rejects(()=>writer.write('scene.json',new Blob([recipe])),error=>error.name==='AbortError');
  assert.equal(writer.directory.children.has('scene.json'),false);
});

test('cancelled scans and output creation stop before mutating the filesystem',async()=>{
  const controller=new AbortController();controller.abort();
  const source=new MemoryDirectory('source',{'scene.json':recipe});
  await assert.rejects(()=>readDirectory(source,{signal:controller.signal}),error=>error.name==='AbortError');
  await assert.rejects(()=>discoverJobs([entry('scene.json',recipe)],{signal:controller.signal}),error=>error.name==='AbortError');
  await assert.rejects(()=>createOutputWriter({source,job:{path:''},signal:controller.signal}),error=>error.name==='AbortError');
  assert.deepEqual([...source.children.keys()],['scene.json']);
});

test('simultaneous writers reserve different generated folders',async()=>{
  const root=new MemoryDirectory('output');
  const writers=await Promise.all([createOutputWriter({root,job:{path:''}}),createOutputWriter({root,job:{path:''}})]);
  assert.deepEqual(writers.map(w=>w.path),['generated','generated-2']);
  await writers[0].write('animation.mp4',new Blob(['first']));
  await writers[1].write('animation.mp4',new Blob(['second']));
  await Promise.all(writers.map(w=>w.close()));
  assert.equal(await root.children.get('generated').children.get('animation.mp4').content.text(),'first');
  assert.equal(await root.children.get('generated-2').children.get('animation.mp4').content.text(),'second');
});
