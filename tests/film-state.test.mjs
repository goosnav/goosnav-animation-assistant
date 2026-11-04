import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject} from '../app/src/core.mjs';
import {createFilm,saveFilmState,validateFilm,captureShot,addFilmShot,removeFilmShot,moveFilmShot} from '../app/src/film-state.mjs';
import {packProject,unpackProject} from '../app/src/archive.mjs';
const state=()=>({project:newProject(),takes:{},art:{},refs:{},recording:new Blob(['voice'],{type:'audio/wav'})});
test('film saves one stable identity and all shot media without duplicating the selected media',async()=>{
 const a=state(),film=createFilm(a),b=state();addFilmShot(film,b);const saved=saveFilmState(b,film);assert.equal(saved.project.id,a.project.id);assert.equal(saved.project.title,film.title);assert.equal(saved.recording,undefined);assert.equal(saved.film.shots.length,2);assert.equal(await saved.film.shots[0].state.recording.text(),'voice');
 const restored=await unpackProject(await packProject(saved));assert.equal(restored.film.activeId,film.activeId);assert.equal(await restored.film.shots[1].state.recording.text(),'voice');
 b.project.title='Changed later';assert.notEqual(saved.film.shots[1].state.project.title,b.project.title);
});
test('shot reordering preserves ids and carrier, removal refuses the last shot',()=>{
 const a=state(),film=createFilm(a),first=film.activeId;addFilmShot(film,state());const second=film.activeId;film.handoff={version:1};moveFilmShot(film,second,-1);assert.deepEqual(film.shots.map(s=>s.id),[second,first]);assert.deepEqual(film.handoff,{version:1});removeFilmShot(film,second);assert.equal(film.activeId,first);assert.throws(()=>removeFilmShot(film,first),/last shot/i);assert.equal(captureShot(a).film,undefined);
});
test('nested invalid projects/media are rejected before an archive can replace a film',async()=>{
 const a=state(),film=createFilm(a);addFilmShot(film,state());film.shots[1].state.project.scene.camera.zoom=999;assert.throws(()=>validateFilm(film),/camera/);
 film.shots[1].state.project.scene.camera.zoom=1;film.shots[1].state.recording='not media';await assert.rejects(unpackProject(await packProject({project:a.project,film})),/saved media/);
});
