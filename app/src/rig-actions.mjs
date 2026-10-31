import * as THREE from 'three';
// CCD changes only the two joints between a shoulder/hip and its endpoint.
// Targets are authored world positions, never a clock-driven simulation.
export function reach(root,joints,end,target,weight=1,iterations=24){
 if(!end||joints.some(j=>!j)||!weight)return;
 const originals=joints.map(j=>j.quaternion.clone());
 for(let pass=0;pass<iterations;pass++)for(let n=joints.length-1;n>=0;n--){
  const joint=joints[n];root.updateMatrixWorld(true);
  const pivot=joint.getWorldPosition(new THREE.Vector3()),tip=end.getWorldPosition(new THREE.Vector3());
  const a=tip.sub(pivot).normalize(),b=target.clone().sub(pivot).normalize();
  const change=new THREE.Quaternion().setFromUnitVectors(a,b),world=joint.getWorldQuaternion(new THREE.Quaternion()),parent=joint.parent.getWorldQuaternion(new THREE.Quaternion());
  joint.quaternion.copy(parent.invert().multiply(change.multiply(world)));
 }
 joints.forEach((joint,i)=>joint.quaternion.slerpQuaternions(originals[i],joint.quaternion.clone(),weight));root.updateMatrixWorld(true);
}
export function actorEffects(root,bones){
 const ownedGeometry=[];let nose=null;
 root.updateMatrixWorld(true);
 // v12 has an actual nose bone. Legacy v10 packs the rigid nose into the body;
 // separate its head-weighted triangles just as the source engine does.
 if(!bones.nose)root.traverse(mesh=>{
  if(nose||!mesh.isSkinnedMesh||!(mesh.name==='guy_nose'||mesh.parent?.name==='guy_body'||/_body$/.test(mesh.parent?.name)&&/skin/.test(mesh.material?.name)))return;
  const g=mesh.geometry,idx=g.index,skin=g.attributes.skinIndex,weights=g.attributes.skinWeight,head=mesh.skeleton.bones.indexOf(bones.head);if(!idx||!skin||head<0)return;
  const onHead=i=>{let w=0;for(let k=0;k<4;k++)if(skin.getComponent(i,k)===head)w+=weights.getComponent(i,k);return w>.99;},removed=[],kept=[];
  for(let i=0;i<idx.count;i+=3){const tri=[idx.getX(i),idx.getX(i+1),idx.getX(i+2)];(tri.every(onHead)?removed:kept).push(...tri);}
  if(!removed.length)return;const extracted=g.clone();extracted.setIndex(removed);const geometry=extracted.toNonIndexed();extracted.dispose();geometry.deleteAttribute('skinIndex');geometry.deleteAttribute('skinWeight');geometry.applyMatrix4(bones.head.matrixWorld.clone().invert().multiply(mesh.matrixWorld));geometry.computeBoundingBox();const center=geometry.boundingBox.getCenter(new THREE.Vector3());geometry.translate(-center.x,-center.y,-center.z);
  nose=new THREE.Mesh(geometry,mesh.material);nose.name='detached-original-nose';nose.position.copy(center);bones.head.add(nose);mesh.geometry=g.clone();mesh.geometry.setIndex(kept);ownedGeometry.push(geometry,mesh.geometry);
 });
 let noseMesh=nose;root.traverse(o=>{if(o.isSkinnedMesh&&/_nose$/.test(o.name))noseMesh=o;});
 const noseObject=bones.nose||nose,noseRest=noseObject?.position.clone(),modelMeshes=[];root.traverse(o=>{if(o.isMesh)modelMeshes.push(o);});
 const burst=new THREE.Group();burst.name='keyed-explosion';root.add(burst);const geometry=new THREE.IcosahedronGeometry(.065,0),materials=[0xffc451,0xf2873d,0xf4d1ae].map(color=>new THREE.MeshToonMaterial({color}));
 for(let i=0;i<30;i++)burst.add(new THREE.Mesh(geometry,materials[i%3]));
 return {nose:noseObject,noseTip(){
  root.updateMatrixWorld(true);if(!noseMesh)return bones.head.getWorldPosition(new THREE.Vector3());
  const forward=new THREE.Vector3(0,0,1).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion())),attribute=noseMesh.geometry.attributes.position;let best=-Infinity,tip=new THREE.Vector3();
  for(let i=0;i<attribute.count;i++){const point=new THREE.Vector3().fromBufferAttribute(attribute,i);if(noseMesh.isSkinnedMesh)noseMesh.applyBoneTransform(i,point);point.applyMatrix4(noseMesh.matrixWorld);const score=point.dot(forward);if(score>best){best=score;tip.copy(point);}}
  return tip;
 },apply(a){
  if(noseObject){noseObject.position.copy(noseRest);noseObject.position.addScaledVector(new THREE.Vector3(.32,-.16,.32),a.noseDetach||0);}
  burst.visible=(a.burst||0)>0;for(const mesh of modelMeshes)mesh.visible=!burst.visible;
  if(burst.visible)burst.children.forEach((piece,i)=>{const y=1-2*(i+.5)/30,r=Math.sqrt(1-y*y),angle=i*2.3999632297,u=a.burst;piece.position.set(Math.cos(angle)*r,y,Math.sin(angle)*r).multiplyScalar(.15+u*2.2);piece.position.y+=1.1+u*.4-u*u*.8;piece.rotation.set(u*(i+1),u*4,u*3);piece.scale.set(1+i%3,.7+i%2,.8);});
 },dispose(){ownedGeometry.forEach(g=>g.dispose());geometry.dispose();materials.forEach(m=>m.dispose());}};
}
