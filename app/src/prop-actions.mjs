import * as THREE from 'three';
const material=color=>new THREE.MeshToonMaterial({color,side:THREE.DoubleSide});
function mesh(root,g,m,x,y,z,sx=1,sy=1,sz=1){const o=new THREE.Mesh(g,m);o.position.set(x,y,z);o.scale.set(sx,sy,sz);root.add(o);return o;}
export function goose(){
 const root=new THREE.Group(),white=material('#f6f4e8'),orange=material('#ed9a25'),black=material('#111111');
 mesh(root,new THREE.SphereGeometry(1,20,14),white,0,.28,0,.24,.19,.36);
 mesh(root,new THREE.CapsuleGeometry(.065,.4,6,10),white,0,.54,.23);
 mesh(root,new THREE.SphereGeometry(.11,16,12),white,0,.8,.23);
 mesh(root,new THREE.BoxGeometry(.12,.05,.2),orange,0,.78,.38);
 for(const side of [-1,1]){mesh(root,new THREE.SphereGeometry(.018,8,6),black,side*.094,.825,.277);mesh(root,new THREE.BoxGeometry(.02,.11,.02),orange,side*.12,.095,0);mesh(root,new THREE.BoxGeometry(.1,.035,.17),orange,side*.12,.025,.05);mesh(root,new THREE.SphereGeometry(1,12,8),white,side*.2,.3,-.02,.055,.12,.25);}
 return root;
}
export function articulatedBook(source){
 const root=new THREE.Group(),hinge=new THREE.Group(),leaf=new THREE.Group();root.add(hinge,leaf);
 let front,back;source?.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material]){if(m.name==='Front')front=m.clone();if(m.name==='Back')back=m.clone();}});
 front??=material('#c86e37');back??=material('#854629');const paper=material('#fff9df'),edge=material('#ece3c8');
 const box=new THREE.BoxGeometry(1,1,1),fixed=mesh(root,box,back,0,0,-.5),pages=mesh(root,box.clone(),edge,0,0,0),cover=mesh(hinge,box.clone(),front,.5,0,0),sheet=mesh(leaf,new THREE.PlaneGeometry(1,1),paper,.5,0,0);
 // Visible ink lines on both sides distinguish a real page turn from a cover turn.
 const ink=material('#57554f');for(let row=0;row<7;row++){const line=mesh(sheet,new THREE.PlaneGeometry(.72,.012),ink,0,.32-row*.09,.001);line.material.side=THREE.DoubleSide;}
 return {root,update(p){
  const w=p.width,h=p.height,d=p.depth;fixed.position.set(0,0,-d/2);fixed.scale.set(w,h,.003);pages.scale.set(w*.96,h*.96,d*.8);pages.position.set(0,0,0);
  hinge.position.set(-w/2,0,d/2);hinge.rotation.y=-Math.PI*(p.open??0);cover.position.set(w/2,0,0);cover.scale.set(w,h,.003);
  leaf.position.set(-w/2,0,d/2+.003);leaf.rotation.y=-Math.PI*(p.open??0)*(p.page??0);sheet.position.set(w/2,0,0);sheet.scale.set(w*.96,h*.96,1);leaf.visible=(p.open??0)>.05;
 }};
}
