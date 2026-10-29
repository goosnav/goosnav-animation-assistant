import { packProject, unpackProject } from './archive.mjs';
let dbPromise,local;
async function db(){return dbPromise??=new Promise((resolve,reject)=>{const r=indexedDB.open('goosnav-animation',1);r.onupgradeneeded=()=>r.result.createObjectStore('projects');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function localConfig(){
 if(local!==undefined)return local;
 try{const r=await fetch('/api/config');local=r.ok&&r.headers.get('content-type')?.includes('application/json')?await r.json():null;}catch{local=null;}
 return local;
}
export async function saveState(state){
 const config=await localConfig();
 if(config){const blob=await packProject(state),r=await fetch('/api/project',{method:'PUT',headers:{'X-Launch-Token':config.token,'X-Project-Id':state.project.id,'X-Project-Title':encodeURIComponent(state.project.title)},body:blob});if(!r.ok)throw Error('Local project could not be saved');return;}
 const d=await db();await new Promise((resolve,reject)=>{const tx=d.transaction('projects','readwrite'),store=tx.objectStore('projects');store.put(state,`clip:${state.project.id}`);store.put({id:state.project.id,title:state.project.title,updated:Date.now()},`meta:${state.project.id}`);store.put(state.project.id,'current');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Storage was interrupted'));});
}
export async function loadState(){
 const config=await localConfig();
 if(config){const r=await fetch('/api/project');return r.ok?unpackProject(await r.blob()):null;}
 const d=await db();const current=await new Promise((resolve,reject)=>{const r=d.transaction('projects').objectStore('projects').get('current');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 return typeof current==='string'?loadSaved(current):current;
}
export async function loadSaved(id){
 const config=await localConfig();if(config){const r=await fetch(`/api/project?id=${encodeURIComponent(id)}`);if(!r.ok)throw Error('Saved clip could not be opened');return unpackProject(await r.blob());}
 const d=await db();return new Promise((resolve,reject)=>{const r=d.transaction('projects').objectStore('projects').get(`clip:${id}`);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
}
export async function listSaved(){
 const config=await localConfig();if(config){const r=await fetch('/api/projects');if(!r.ok)throw Error('Saved clips could not be listed');return r.json();}
 const d=await db();return new Promise((resolve,reject)=>{const r=d.transaction('projects').objectStore('projects').getAll(IDBKeyRange.bound('meta:','meta:\uffff'));r.onsuccess=()=>resolve(r.result.sort((a,b)=>b.updated-a.updated));r.onerror=()=>reject(r.error);});
}

export async function localApp(){return !!(await localConfig());}
export async function quitLocal(){const config=await localConfig();if(!config)return;const r=await fetch('/api/quit',{method:'POST',headers:{'X-Launch-Token':config.token}});if(!r.ok)throw Error('Could not stop the local app');}
