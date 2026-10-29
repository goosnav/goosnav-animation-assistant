import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { build } from 'esbuild';
await fs.mkdir('.work',{recursive:true});
const out=await fs.mkdtemp('.work/static-build-');
const entries=JSON.parse(await fs.readFile('app/assets/manifest.json','utf8'));
await fs.mkdir(`${out}/assets`,{recursive:true});
for(const e of entries){const bytes=await fs.readFile(`app/assets/${e.file}`);if(crypto.createHash('sha256').update(bytes).digest('hex')!==e.sha256)throw Error(`Asset changed without manifest review: ${e.file}`);await fs.writeFile(`${out}/assets/${e.file}`,bytes);}
for(const file of ['index.html','style.css'])await fs.copyFile(`app/${file}`,`${out}/${file}`);
await build({entryPoints:{app:'app/src/app.mjs','voice-worker':'app/src/speech/worker.mjs'},outdir:out,bundle:true,splitting:true,format:'esm',platform:'browser',target:['es2022'],outExtension:{'.js':'.mjs'},minify:false,chunkNames:'chunks/[name]-[hash]'});
await fs.mkdir(`${out}/vendor`,{recursive:true});await fs.copyFile('node_modules/@echogarden/flite-wasi/flite.wasm',`${out}/vendor/flite.wasm`);
for(const [from,to] of [['@echogarden/flite-wasi/COPYING','FLITE.txt'],['@bjorn3/browser_wasi_shim/LICENSE-MIT','WASI.txt'],['three/LICENSE','THREE.txt'],['ag-psd/LICENSE','AG-PSD.txt'],['fflate/LICENSE','FFLATE.txt'],['mediabunny/LICENSE','MEDIABUNNY.txt'],['pako/LICENSE','PAKO.txt'],['@mediabunny/aac-encoder/LICENSE','AAC-ENCODER.txt'],['@mediabunny/aac-encoder/README.md','AAC-SOURCE.md']])await fs.copyFile(`node_modules/${from}`,`${out}/vendor/${to}`);
await fs.writeFile(`${out}/_headers`,'/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: same-origin\n  Permissions-Policy: microphone=(self), camera=()\n');
await fs.writeFile(`${out}/_redirects`,'');
async function check(dir){for(const e of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())await check(p);else if((await fs.stat(p)).size>25*1024*1024)throw Error(`Cloudflare file limit exceeded: ${p}`);}}
await fs.copyFile('app/licenses/FFMPEG-LGPL.txt',`${out}/vendor/FFMPEG-LGPL.txt`);
await fs.copyFile('NOTICES.md',`${out}/NOTICES.md`);
await check(out);
try{for(const name of await fs.readdir('dist'))if(!['assets','vendor','chunks','index.html','style.css','app.mjs','voice-worker.mjs','_headers','_redirects','NOTICES.md'].includes(name))throw Error(`Unexpected file in generated dist/: ${name}. Move it before rebuilding.`);await fs.rm('dist',{recursive:true});}catch(e){if(e.code!=='ENOENT')throw e;}
await fs.rename(out,'dist');console.log('Built self-contained static app in dist/');
