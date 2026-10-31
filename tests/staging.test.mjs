import test from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../app/src/core.mjs';
import { packProject, unpackProject } from '../app/src/archive.mjs';

function fixture(){const p=core.newProject();p.lines=[{...p.lines[0],id:'a',text:'Ah.'}];return {p,takes:{a:{duration:.5,phones:[{phone:'aa',start:0,end:.5}]}}};}
test('two shot restores inward facing staging after solo; camera reset preserves actors',()=>{
 const p=core.newProject();assert.deepEqual(p.scene.actors.map(a=>a.yaw),[60,-60]);
 const solo=core.withFraming(p,'solo');assert.equal(solo.scene.count,1);assert.equal(solo.scene.actors[0].x,0);assert.equal(solo.scene.actors[0].yaw,0);
 const duet=core.withFraming(solo,'duet');assert.equal(duet.scene.count,2);assert.deepEqual(duet.scene.actors.map(a=>[a.x,a.yaw]),[[-.45,60],[.45,-60]]);
 solo.scene.actors[0].yaw=67;solo.scene.camera.azimuth=90;
 const reset=core.withFraming(solo,'reset');assert.deepEqual(reset.scene.actors,solo.scene.actors);assert.equal(reset.scene.count,1);assert.equal(reset.scene.camera.azimuth,0);assert.equal(p.scene.count,2);
});
test('reference grids preserve drawing identities and speech; backdrops change the drawing',()=>{
 const {p,takes}=fixture(),first=core.compileClip(p,takes);p.guides={ground:true,backdrop:true};
 const guides=core.compileClip(p,takes,first.slots);assert.deepEqual(guides.exposures,first.exposures);assert.equal(guides.duration,first.duration);
 p.scene.backdrop='black-pyramids';const backdrop=core.compileClip(p,takes,guides.slots);
 assert.ok(backdrop.slots.filter(s=>s.active).every(s=>!first.slots.some(o=>s.id===o.id)));
});
test('old projects stay valid; backdrop and grid settings survive backups and reject invalid values',async()=>{
 const {p}=fixture();delete p.guides;delete p.scene.backdrop;assert.doesNotThrow(()=>core.validateProject(p));
 p.guides={ground:true,backdrop:false};p.scene.backdrop='red-mesas';
 const restored=(await unpackProject(await packProject({project:p}))).project;
 assert.equal(restored.scene.backdrop,'red-mesas');assert.equal(restored.guides.ground,true);
 for(const backdrop of ['bogus',{},null,['none']])assert.throws(()=>core.validateProject({...p,scene:{...p.scene,backdrop}}),/backdrop/i);
 for(const guides of [null,[],{ground:'yes'},{backdrop:1}])assert.throws(()=>core.validateProject({...p,guides}),/guide/i);
});
