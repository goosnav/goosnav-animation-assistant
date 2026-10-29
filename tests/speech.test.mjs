import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { synthesizeSpeech } from '../app/src/speech/synth.mjs';
test('real bundled speech returns timed phones aligned with its PCM, including sentences',async()=>{
 const module=await WebAssembly.compile(await fs.readFile('node_modules/@echogarden/flite-wasi/flite.wasm'));
 const a=await synthesizeSpeech(module,'My blue balloon. Five more balloons!',{rate:1});
 assert.ok(a.samples.length>1000);assert.ok(a.phones.length>20);
 assert.ok(a.phones.some(p=>p.phone==='m'));assert.ok(a.phones.some(p=>p.phone==='f'));
 assert.ok(a.phones.every((p,i)=>p.end>=p.start&&(!i||p.start>=a.phones[i-1].end-.002)));
 assert.ok(Math.abs(a.phones.at(-1).end-a.duration)<.1);
 const b=await synthesizeSpeech(module,'My blue balloon. Five more balloons!',{rate:1.5});
 assert.ok(b.duration<a.duration*.85);
 const slow=await synthesizeSpeech(module,'Hello, you! I have a perfectly reasonable question. That has never stopped you before.',{rate:.5});
 assert.ok(slow.duration>9);assert.equal(slow.phones.at(-1).end,slow.duration);
 assert.ok(slow.phones.slice(0,-1).every(p=>p.end<=slow.duration));
});
