import {validateSequenceHandoffShape} from './sequence-config.mjs';
import {uid,validateProject} from './core.mjs';
const validId=id=>typeof id==='string'&&/^[a-zA-Z0-9-]{1,80}$/.test(id);
const title=value=>typeof value==='string'&&value.length<=200;
export function captureShot(state){const {film,clip,...scene}=state;return structuredClone(scene);}
export function createFilm(state){const id=uid();return {version:1,id:state.project.id,title:state.project.title,activeId:id,shots:[{id,title:state.project.title,state:captureShot(state)}],handoff:null};}
export function validateFilm(film){
 if(!film||film.version!==1||!validId(film.id)||!title(film.title)||!Array.isArray(film.shots)||!film.shots.length||film.shots.length>20)throw Error('Invalid film. Use 1–20 shots.');
 const ids=new Set();for(const shot of film.shots){if(!validId(shot?.id)||ids.has(shot.id)||!title(shot.title)||!shot.state||shot.state.film)throw Error('Invalid or duplicate shot.');ids.add(shot.id);validateProject(shot.state.project);}
 if(!ids.has(film.activeId))throw Error('The selected shot is missing.');
 if(film.handoff!=null)validateSequenceHandoffShape(film.handoff);
 return film;
}
export function saveFilmState(state,film){
 if(!film)return structuredClone(state);
 const copy=structuredClone(film),active=copy.shots.find(s=>s.id===copy.activeId);if(!active)throw Error('The selected shot is missing.');active.state=captureShot(state);validateFilm(copy);
 // Storage has a stable project identity; media lives only inside the shots.
 return {project:{...structuredClone(state.project),id:copy.id,title:copy.title},film:copy};
}
export function updateFilmShot(film,state){const shot=film.shots.find(s=>s.id===film.activeId);if(!shot)throw Error('The selected shot is missing.');shot.state=captureShot(state);return shot;}
export function addFilmShot(film,state){if(film.shots.length>=20)throw Error('Use at most 20 shots per film.');const shot={id:uid(),title:state.project.title,state:captureShot(state)};film.shots.push(shot);film.activeId=shot.id;return shot;}
export function removeFilmShot(film,id){if(film.shots.length===1)throw Error('Keep at least one shot; the last shot cannot be removed.');const index=film.shots.findIndex(s=>s.id===id);if(index<0)throw Error('Shot not found.');const [removed]=film.shots.splice(index,1);if(film.activeId===id)film.activeId=film.shots[Math.min(index,film.shots.length-1)].id;return removed;}
export function moveFilmShot(film,id,direction){const index=film.shots.findIndex(s=>s.id===id),next=index+direction;if(index<0||![-1,1].includes(direction))throw Error('Invalid shot move.');if(next<0||next>=film.shots.length)return;const [shot]=film.shots.splice(index,1);film.shots.splice(next,0,shot);}
