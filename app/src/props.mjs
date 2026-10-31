import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const rad=THREE.MathUtils.degToRad;
const turnDistance=(from,to)=>Math.abs(THREE.MathUtils.euclideanModulo(to-from+180,360)-180);
let book;
async function loadBook(){if(!book)book=new GLTFLoader().loadAsync('assets/prop-book.glb').then(g=>g.scene).catch(e=>{book=null;throw e;});return book;}
function primitive(kind){
 if(kind==='sphere')return new THREE.SphereGeometry(.5,24,16);
 if(kind==='prism'){
  const shape=new THREE.Shape();shape.moveTo(-.5,-.5);shape.lineTo(.5,-.5);shape.lineTo(0,.5);shape.closePath();
  const g=new THREE.ExtrudeGeometry(shape,{depth:1,bevelEnabled:false});g.translate(0,0,-.5);return g;
 }
 return new THREE.BoxGeometry(1,1,1);
}
function make(p,source){
 const root=new THREE.Group();let body;
 if(p.kind==='book'){
  body=source.clone(true);body.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(body),center=box.getCenter(new THREE.Vector3());
  // The library book lies flat on X/Z, with its thickness along Y. Stand it
  // upright so width/height/depth match the same axes as the primitive props.
  const orient=new THREE.Group();orient.add(body);body.position.sub(center);orient.rotation.x=Math.PI/2;orient.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(orient),s=bounds.getSize(new THREE.Vector3());
  const normalized=new THREE.Group();normalized.scale.set(1/s.x,1/s.y,1/s.z);normalized.add(orient);body=normalized;
  body.traverse(o=>{if(o.isMesh){o.geometry=o.geometry.clone();const ms=(Array.isArray(o.material)?o.material:[o.material]).map(m=>{const n=m.clone();n.userData.outlineParameters={thickness:.002,color:[0,0,0]};return n;});o.material=Array.isArray(o.material)?ms:ms[0];}});
 }else body=new THREE.Mesh(primitive(p.kind),new THREE.MeshToonMaterial({color:p.color||'#c87843'}));
 root.add(body);return {root,body,kind:p.kind};
}
function dispose(p){p.root.removeFromParent();p.root.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();});}
export class Props{
 constructor(scene){this.scene=scene;this.items=new Map();this.ticket=0;}
 async prepare(props=[]){
  const ticket=++this.ticket,source=props.some(p=>p.kind==='book')?await loadBook():null;if(ticket!==this.ticket)return;
  const ids=new Set(props.map(p=>p.id));
  for(const [id,p]of this.items)if(!ids.has(id)){dispose(p);this.items.delete(id);}
  for(const p of props){if(this.items.get(p.id)?.kind!==p.kind){if(this.items.has(p.id))dispose(this.items.get(p.id));const item=make(p,source);this.items.set(p.id,item);this.scene.add(item.root);}}
 }
 detach(){for(const p of this.items.values())this.scene.add(p.root);}
 update(props=[],actors=[],wipes=[],style='flat'){
  for(const item of this.items.values())item.root.visible=false;
  for(const p of props){
   const item=this.items.get(p.id);if(!item)continue;const root=item.root;root.visible=true;
   root.position.set(p.x||0,p.y||0,p.z||0);root.rotation.set(rad(p.rx||0),rad(p.ry||0),rad(p.rz||0));root.scale.set(p.width||.2,p.height||.3,p.depth||.04);
   const match=/^actor:([01]):(left|right)$/.exec(p.attachment||'');
   const hand=match?actors[+match[1]]?.bones[`hand${match[2]==='left'?'L':'R'}`]:null;
   const parent=hand||this.scene;if(root.parent!==parent)parent.add(root);
   if(match&&!hand){root.visible=false;continue;}
   if(item.kind!=='book')item.body.material.color.set(style==='line'?'white':p.color||'#c87843');
   const wipe=wipes.find(w=>w.target===`prop:${p.id}`);
   if(wipe){
    const from=new THREE.Vector3(wipe.from.x??p.x,wipe.from.y??p.y,wipe.from.z??p.z),to=new THREE.Vector3(wipe.to.x??p.x,wipe.to.y??p.y,wipe.to.z??p.z),delta=to.sub(from);
    root.position.copy(from.addScaledVector(delta,.5));
    // A single elongated volume joins both positions in the prop's local frame.
    delta.applyQuaternion(root.quaternion.clone().invert());root.scale.x+=Math.abs(delta.x);root.scale.y+=Math.abs(delta.y);root.scale.z+=Math.abs(delta.z);
    const turn=Math.max(...['rx','ry','rz'].map(k=>turnDistance(wipe.from[k]??p[k]??0,wipe.to[k]??p[k]??0)));
    if(turn>20){root.scale.x*=1+Math.min(1.5,turn/120);root.scale.z*=1+Math.min(1,turn/180);}
   }
  }
 }
 dispose(){this.ticket++;for(const p of this.items.values())dispose(p);this.items.clear();}
}
