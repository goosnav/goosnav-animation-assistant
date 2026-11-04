import {Box3,Vector3,Color,MeshBasicMaterial} from 'three';

const round=n=>Math.round(n*10000)/10000;
const headMesh=o=>o.isMesh&&/head/i.test(o.name);

/** Bounds of the posed/skinned vertices, not an assumed common actor height. */
export function actorBounds(actor,region='body'){
 const box=new Box3(),point=new Vector3();actor.root.updateWorldMatrix(true,true);
 // setFromObject includes invisible descendants. Effects keep their previous
 // transforms while hidden, so measure only currently rendered mesh vertices.
 actor.root.traverseVisible(mesh=>{
  if(!mesh.isMesh||region==='head'&&!headMesh(mesh)||!mesh.geometry?.attributes.position)return;
  if(!(Array.isArray(mesh.material)?mesh.material:[mesh.material]).some(material=>material.visible))return;
  const {index,attributes,drawRange}=mesh.geometry,end=Math.min(index?.count??attributes.position.count,drawRange.start+drawRange.count);
  for(let i=drawRange.start;i<end;i++){mesh.getVertexPosition(index?index.getX(i):i,point);box.expandByPoint(point.applyMatrix4(mesh.matrixWorld));}
 });
 return box;
}

function projectedBounds(box,camera){
 if(box.isEmpty())return null;
 const points=[];for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])points.push(new Vector3(x,y,z).project(camera));
 const x=points.map(p=>(p.x+1)/2),y=points.map(p=>(1-p.y)/2),depth=points.map(p=>p.z);
 return {left:round(Math.min(...x)),top:round(Math.min(...y)),right:round(Math.max(...x)),bottom:round(Math.max(...y)),inDepthRange:Math.min(...depth)<=1&&Math.max(...depth)>=-1};
}
const clipped=bounds=>!!bounds&&(bounds.left<0||bounds.top<0||bounds.right>1||bounds.bottom>1);

/** Flat-color IDs are depth-tested by the same camera and posed meshes as the PNG. */
export function compositionDiagnostics(stage,width,height){
 const palettes=[['#ff0000','#0000ff'],['#00ff00','#ffff00']],originals=[],black=new MeshBasicMaterial({color:0}),materials=palettes.map(pair=>pair.map(color=>new MeshBasicMaterial({color}))),background=stage.scene.background;
 const actorByMesh=new Map();stage.actors.forEach((actor,index)=>actor?.root.traverse(o=>{if(o.isMesh)actorByMesh.set(o,{index,head:headMesh(o)});}));
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 let counts=[{body:0,head:0},{body:0,head:0}];
 try{
  stage.scene.traverse(o=>{
   if(!o.isMesh)return;originals.push([o,o.material]);const actor=actorByMesh.get(o),m=actor?materials[actor.index][actor.head?1:0]:black;
   // Preserve double-sided geometry in the ID pass as well as the normal render.
   o.material=Array.isArray(o.material)?o.material.map(source=>{const copy=m.clone();copy.side=source.side;return copy;}):Object.assign(m.clone(),{side:o.material.side});
  });
  stage.scene.background=new Color(0);stage.renderer.render(stage.scene,stage.camera);
  const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(stage.canvas,0,0);const pixels=context.getImageData(0,0,width,height).data;
  for(let i=0;i<pixels.length;i+=4){const [r,g,b]=[pixels[i],pixels[i+1],pixels[i+2]];if(r===255&&g===0&&b===0)counts[0].body++;else if(r===0&&g===255&&b===0)counts[1].body++;else if(r===0&&g===0&&b===255)counts[0].head++;else if(r===255&&g===255&&b===0)counts[1].head++;}
 }finally{
  for(const [object,material]of originals){for(const m of Array.isArray(object.material)?object.material:[object.material])m.dispose();object.material=material;}
  stage.scene.background=background;black.dispose();materials.flat().forEach(m=>m.dispose());canvas.width=canvas.height=1;stage.render();
 }
 return {basis:'Depth-tested visible pixels; projected posed-geometry bounds. Head counts use head meshes. Antialiased edge pixels are excluded.',actors:stage.actors.filter(Boolean).map((actor,index)=>{
  const bounds=projectedBounds(actorBounds(actor),stage.camera),headBounds=projectedBounds(actorBounds(actor,'head'),stage.camera),visiblePixels=counts[index].body+counts[index].head;
  return {actor:index,model:stage.names[index],visible:visiblePixels>0,visiblePixels,imageFraction:round(visiblePixels/(width*height)),bounds,clipped:clipped(bounds),head:{visible:counts[index].head>0,visiblePixels:counts[index].head,bounds:headBounds,clipped:clipped(headBounds)}};
 })};
}

/** A reproducible front-camera fit. It changes only camera fields, never actor order/count. */
export function fittedCamera(stage,{actors,region,padding,aspect}){
 const box=new Box3();for(const index of actors){const bounds=actorBounds(stage.actors[index],region);if(bounds.isEmpty())throw Error(`Actor ${index} has no visible ${region} geometry at this time.`);box.union(bounds);}
 const center=box.getCenter(new Vector3()),size=box.getSize(new Vector3()),projection=stage.state.scene.camera.projection;
 const halfHeight=Math.max(size.y/2,size.x/(2*aspect))/(1-2*padding);
 const zoom=projection==='orthographic'?1.35/Math.max(.01,halfHeight):6/(box.max.z+halfHeight/Math.tan(35*Math.PI/360));
 const camera={projection,azimuth:0,elevation:0,zoom:Math.min(3,Math.max(.4,zoom)),targetX:Math.min(3,Math.max(-3,center.x)),targetY:Math.min(3,Math.max(0,center.y))};
 const warnings=[];if(camera.zoom!==zoom||camera.targetX!==center.x||camera.targetY!==center.y)warnings.push('Camera limits constrained this fit. Inspect the preview and adjust staging if necessary.');
 return {camera,warnings};
}
