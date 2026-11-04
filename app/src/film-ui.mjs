const $=s=>document.querySelector(s);
export function setupShotStrip({getFilm,getState,select,add,duplicate,remove,move,undo,rename}){
 let urls=[];
 $('#add-shot').onclick=add;$('#duplicate-shot').onclick=duplicate;$('#remove-shot').onclick=remove;
 $('#shot-earlier').onclick=()=>move(-1);$('#shot-later').onclick=()=>move(1);$('#undo-shot-remove').onclick=undo;
 $('#shot-name').onchange=e=>rename(e.target.value);
 function refresh({canUndo=false,busy=false}={}){
  urls.forEach(URL.revokeObjectURL);urls=[];const film=getFilm(),state=getState(),shots=film?.shots||[{id:'current',title:state.project.title,state}],active=film?.activeId||'current';
  $('#shot-list').hidden=!film;$('#shot-list').replaceChildren();for(const [i,shot]of shots.entries()){
   const button=document.createElement('button');button.type='button';button.dataset.shotId=shot.id;button.setAttribute('aria-pressed',String(shot.id===active));button.setAttribute('aria-label',`Shot ${i+1}: ${shot.title}`);button.disabled=busy;
   const thumb=(shot.id===active?state:shot.state).shotThumbnail;if(thumb instanceof Blob){const image=document.createElement('img');image.src=URL.createObjectURL(thumb);urls.push(image.src);image.alt='';button.append(image);}
   const number=document.createElement('span'),name=document.createElement('strong');number.textContent=String(i+1).padStart(2,'0');name.textContent=shot.title||`Shot ${i+1}`;button.append(number,name);button.onclick=()=>select(shot.id);$('#shot-list').append(button);
  }
  const index=shots.findIndex(s=>s.id===active);$('#shot-name').value=shots[index]?.title||'';$('#shot-settings').hidden=!film;
  $('#remove-shot').disabled=busy||shots.length===1;$('#shot-earlier').disabled=busy||index===0;$('#shot-later').disabled=busy||index===shots.length-1;$('#add-shot').disabled=busy||shots.length>=20;$('#duplicate-shot').disabled=busy||shots.length>=20;$('#undo-shot-remove').hidden=!canUndo;
  $('#film-scope').textContent=film?`${shots.length} shots · Draw and Export include the whole film`:'One shot';
 }
 return {refresh};
}
