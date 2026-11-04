import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { build } from 'esbuild';
import {agentInstructions,agentInstructionsMarkdown} from '../app/src/agent-workflow.mjs';
await fs.mkdir('.work',{recursive:true});
const out=await fs.mkdtemp('.work/static-build-');
const entries=JSON.parse(await fs.readFile('app/assets/manifest.json','utf8'));
await fs.mkdir(`${out}/assets`,{recursive:true});
for(const e of entries){const bytes=await fs.readFile(`app/assets/${e.file}`);if(crypto.createHash('sha256').update(bytes).digest('hex')!==e.sha256)throw Error(`Asset changed without manifest review: ${e.file}`);await fs.writeFile(`${out}/assets/${e.file}`,bytes);}
for(const file of ['style.css','agent.css'])await fs.copyFile(`app/${file}`,`${out}/${file}`);
const instructions=JSON.stringify(agentInstructions()).replaceAll('<','\\u003c');
for(const file of ['index.html','agent.html']){const html=await fs.readFile(`app/${file}`,'utf8');if(!html.includes('<!-- AGENT_WORKFLOW -->'))throw Error(`Missing agent workflow discovery point in ${file}`);await fs.writeFile(`${out}/${file}`,html.replace('<!-- AGENT_WORKFLOW -->',`<script id="agent-workflow" type="application/json">${instructions}</script>`));}
await fs.writeFile(`${out}/AGENTS.md`,agentInstructionsMarkdown());
await fs.writeFile(`${out}/llms.txt`,(await fs.readFile('app/llms.txt','utf8'))+'\n'+agentInstructionsMarkdown());
await build({entryPoints:{app:'app/src/app.mjs',pipeline:'app/src/pipeline-entry.mjs','agent-api':'app/src/agent-api.mjs','agent-ui':'app/src/agent-ui.mjs','voice-worker':'app/src/speech/worker.mjs'},outdir:out,bundle:true,splitting:true,format:'esm',platform:'browser',target:['es2022'],outExtension:{'.js':'.mjs'},minify:false,chunkNames:'chunks/[name]-[hash]'});
await fs.mkdir(`${out}/docs`,{recursive:true});for(const file of ['agents.md','sequence.md'])await fs.copyFile(`docs/${file}`,`${out}/docs/${file}`);
await fs.mkdir(`${out}/examples`,{recursive:true});for(const file of ['speech-scene.json','silent-scene.json','three-shot-sequence.json'])await fs.copyFile(`examples/${file}`,`${out}/examples/${file}`);
await fs.mkdir(`${out}/vendor`,{recursive:true});await fs.copyFile('node_modules/@echogarden/flite-wasi/flite.wasm',`${out}/vendor/flite.wasm`);
for(const [from,to] of [['@echogarden/flite-wasi/COPYING','FLITE.txt'],['@bjorn3/browser_wasi_shim/LICENSE-MIT','WASI.txt'],['three/LICENSE','THREE.txt'],['ag-psd/LICENSE','AG-PSD.txt'],['fflate/LICENSE','FFLATE.txt'],['mediabunny/LICENSE','MEDIABUNNY.txt'],['pako/LICENSE','PAKO.txt'],['@mediabunny/aac-encoder/LICENSE','AAC-ENCODER.txt'],['@mediabunny/aac-encoder/README.md','AAC-SOURCE.md']])await fs.copyFile(`node_modules/${from}`,`${out}/vendor/${to}`);
await fs.writeFile(`${out}/_headers`,'/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: same-origin\n  Permissions-Policy: microphone=(self), camera=()\n');
await fs.writeFile(`${out}/_redirects`,'');
async function check(dir){for(const e of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())await check(p);else if((await fs.stat(p)).size>25*1024*1024)throw Error(`Cloudflare file limit exceeded: ${p}`);}}
await fs.copyFile('app/licenses/FFMPEG-LGPL.txt',`${out}/vendor/FFMPEG-LGPL.txt`);
await fs.copyFile('NOTICES.md',`${out}/NOTICES.md`);
await check(out);
try{for(const name of await fs.readdir('dist'))if(!['assets','vendor','chunks','index.html','style.css','agent.html','agent.css','llms.txt','AGENTS.md','agent-api.mjs','agent-ui.mjs','docs','examples','app.mjs','pipeline.mjs','voice-worker.mjs','_headers','_redirects','NOTICES.md'].includes(name))throw Error(`Unexpected file in generated dist/: ${name}. Move it before rebuilding.`);await fs.rm('dist',{recursive:true});}catch(e){if(e.code!=='ENOENT')throw e;}
await fs.rename(out,'dist');console.log('Built self-contained static app in dist/');
