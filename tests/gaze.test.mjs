import test from 'node:test';
import assert from 'node:assert/strict';

// A missing solver or an accidentally permissive boundary must fail before any
// actor pose is sampled. The browser tests exercise its real rig behavior.
const gaze=await import('../app/src/gaze-alignment.mjs').catch(()=>({}));
test('gaze alignment exposes a one-shot solver and diagnostics',()=>{
 assert.equal(typeof gaze.alignGaze,'function');
 assert.equal(typeof gaze.gazeDiagnostics,'function');
});
test('gaze alignment rejects malformed stages and arguments explicitly',()=>{
 assert.equal(typeof gaze.alignGaze,'function');
 for(const stage of [null,{}, {actors:[],state:{scene:{count:2,actors:[]}}}])assert.throws(()=>gaze.alignGaze(stage),/stage|actor/i);
});
