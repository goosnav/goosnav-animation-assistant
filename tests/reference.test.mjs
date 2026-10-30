import test from 'node:test';
import assert from 'node:assert/strict';
import { referenceLabels } from '../app/src/reference.mjs';
import { newProject, compileClip, slotAt } from '../app/src/core.mjs';

test('reference sound labels cover every reusable mouth and distinguish two characters',()=>{
 for(const [mouth,label]of Object.entries({rest:'M/B/P',small:'E',open:'A',wide:'EE',round:'O/U',teeth:'F/V'})){
  assert.deepEqual(referenceLabels({scene:{count:1},mouths:[mouth,'rest'],blinks:[false,false]}),[label]);
 }
 assert.deepEqual(referenceLabels({scene:{count:2},mouths:['open','round'],blinks:[false,true]}),['A: A','B: O/U · BLINK']);
});
function fixture(pause=.35){
 const p=newProject();p.lines=[0,1].map(i=>({id:`line${i}`,actor:0,text:'Hello',rate:1,pause,pose:'keep',blink:true}));
 const takes=Object.fromEntries(p.lines.map(l=>[l.id,{duration:.5,phones:[{phone:'aa',start:0,end:.2},{phone:'uw',start:.2,end:.5}]}]));
 return {p,takes};
}
test('optional blinks happen in pauses and reuse one closed-mouth drawing',()=>{
 const {p,takes}=fixture();const c=compileClip(p,takes),blinks=c.slots.filter(s=>s.active&&s.state.blinks.some(Boolean));
 assert.equal(blinks.length,1);assert.deepEqual(blinks[0].state.mouths,['rest','rest']);
 assert.equal(slotAt(c,.4).state.blinks[0],false);
 for(const e of c.exposures.filter(e=>e.slotId===blinks[0].id)){
  const t=(e.startFrame+.5)/c.fps;
  assert.ok(c.lines.some(l=>t>=l.end&&t<l.end+l.pause));
  assert.ok(e.endFrame-e.startFrame>=2);
 }
 assert.equal(c.exposures.filter(e=>e.slotId===blinks[0].id).length,2);
 const without=structuredClone(p);without.lines.forEach(l=>l.blink=false);
 assert.equal(c.slots.filter(s=>s.active).length,compileClip(without,takes).slots.length+1);
});
test('a blink never extends a zero-pause line or leaks into the next line',()=>{
 const {p,takes}=fixture(0);const c=compileClip(p,takes);
 assert.equal(c.slots.some(s=>s.active&&s.state.blinks.some(Boolean)),false);
 assert.equal(c.lines[1].start,c.lines[0].end);
});
