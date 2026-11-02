import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
const sources=new Map();
async function load(kind){
 if(!sources.has(kind))sources.set(kind,new GLTFLoader().loadAsync(`assets/chair-${kind==='wood'?'wood':kind==='stool'?'stool':'folding'}.glb`).then(g=>g.scene).catch(e=>{sources.delete(kind);throw e;}));
 return sources.get(kind);
}
function make(source,kind){
 const root=source.clone(true),materials=[];
 root.traverse(o=>{if(o.isMesh){o.geometry=o.geometry.clone();o.material=(Array.isArray(o.material)?o.material:[o.material]).map(m=>{const mat=new THREE.MeshToonMaterial({color:m.color,side:THREE.DoubleSide});mat.userData.outlineParameters={thickness:.002,color:[0,0,0]};materials.push({mat,color:mat.color.clone()});return mat;});if(o.material.length===1)o.material=o.material[0];}});
 root.visible=false;return {root,kind,materials};
}
function dispose(item){item.root.removeFromParent();item.root.traverse(o=>o.geometry?.dispose());item.materials.forEach(({mat})=>mat.dispose());}
// A seat is part of a held pose, so it follows the actor and appears in every
// reference/export using that pose. It never consumes a hand-prop attachment.
export class Seating{
 constructor(scene){this.scene=scene;this.items=[];this.ticket=0;}
 async prepare(scene){
  const ticket=++this.ticket,kinds=scene.actors.slice(0,scene.count).map(a=>a.chair||'folding');
  const loaded=await Promise.all(kinds.map(load));if(ticket!==this.ticket)return;
  for(let i=0;i<2;i++)if(this.items[i]?.kind!==kinds[i]){if(this.items[i])dispose(this.items[i]);this.items[i]=loaded[i]?make(loaded[i],kinds[i]):null;if(this.items[i])this.scene.add(this.items[i].root);}
 }
 update(scene,actors){
  this.items.forEach((item,i)=>{
   if(!item)return;const a=scene.actors[i],seat=actors[i]?.seat;item.root.visible=i<scene.count&&!!seat;if(!item.root.visible)return;
   const yaw=THREE.MathUtils.degToRad(a.yaw),offset=seat.z*a.scale;
   const rendered=actors[i].root.position;
   // Partner contacts can move the rendered body after its held pose settles.
   item.root.position.set(rendered.x+Math.sin(yaw)*offset,(a.y||0)+rendered.y-seat.rootY,rendered.z+Math.cos(yaw)*offset);item.root.rotation.set(0,yaw,0);
   item.root.scale.set(seat.width/.42*a.scale,Math.max(.1,seat.height)/.45*a.scale,seat.depth/.42*a.scale);
   for(const {mat,color}of item.materials)mat.color.copy(scene.style==='line'?new THREE.Color('white'):color);
  });
 }
 dispose(){this.ticket++;this.items.forEach(item=>{if(item)dispose(item);});this.items=[];}
}
