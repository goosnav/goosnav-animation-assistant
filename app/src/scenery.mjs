import * as THREE from 'three';

// Small, deterministic staging sketches of the active goosnav-3D-assets sets.
// All geometry is local: no environment downloads, textures, or moving scenery.
function release(group){
 const geometries=new Set(),materials=new Set();
 group.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);});
 geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());group.clear();
}
function buildBackdrop(name,outline){
 const group=new THREE.Group();
 const material=color=>{const m=new THREE.MeshLambertMaterial({color:outline?'#ffffff':color,flatShading:true});m.userData.outlineParameters={thickness:.0015,color:[.18,.18,.18],visible:outline};return m;};
 function mesh(geometry,color,x,y,z){const m=new THREE.Mesh(geometry,material(color));m.position.set(x,y,z);group.add(m);return m;}
 const box=(x,y,z,w,h,d,color)=>mesh(new THREE.BoxGeometry(w,h,d),color,x,y,z);
 const floor=color=>box(0,-.035,0,100,.04,100,color);
 if(name==='black-pyramids'){
  floor('#bb875e');
  // The larger monument has the library's characteristic open circular notch.
  const shape=new THREE.Shape();shape.moveTo(-1.25,0);shape.lineTo(1.25,0);shape.lineTo(0,2.5);shape.lineTo(-.65+.3/Math.sqrt(5),1.2+.6/Math.sqrt(5));
  shape.absarc(-.65,1.2,.3,Math.atan2(2,1),Math.atan2(2,1)-Math.PI,true);shape.lineTo(-1.25,0);
  const large=mesh(new THREE.ExtrudeGeometry(shape,{depth:.7,bevelEnabled:false,curveSegments:12}),'#111015',.2,0,-8);large.scale.setScalar(.55);
  const small=mesh(new THREE.ConeGeometry(.3,.65,4),'#19151a',-.65,.325,-7.2);small.rotation.y=Math.PI/4;
  for(let i=0;i<5;i++){
   const dune=mesh(new THREE.SphereGeometry(1,12,6),'#c2946b',i*3.8-7,.01,-4-i%2*2);dune.scale.set(3,.16,1.3);
  }
 }else if(name==='red-mesas'){
  floor('#c2906e');
  const stacks=[[-1.2,-7,1.05,.65],[-.7,-11,1.3,.5],[.8,-9,.9,.55],[1.5,-12,1.4,.8],[.1,-15,.95,.6]];
  for(const [x,z,h,r]of stacks){
   mesh(new THREE.CylinderGeometry(r*.68,r,h,7),'#ad6d54',x,h/2,z);
   mesh(new THREE.CylinderGeometry(r*.7,r*.77,.17,7),'#ddb18a',x,h-.04,z);
   mesh(new THREE.CylinderGeometry(r*.84,r*.94,.18,7),'#ce9670',x,h*.4,z);
  }
 }else if(name==='colonnade'){
  floor('#c5c1b3');box(0,2.5,-9,18,5,.3,'#ddd8cb');
  for(const z of [-3.8,-6.5,-8])for(const x of [-.68,.68]){
   mesh(new THREE.CylinderGeometry(.08,.1,2.3,10),'#e6e0d1',x,1.15,z);
   box(x,.07,z,.28,.14,.28,'#b5b2a5');box(x,2.25,z,.28,.16,.28,'#e6e0d1');
  }
  for(const z of [-3.8,-6.5])box(0,2.45,z,1.7,.24,.4,'#d3ccba');
  for(let i=-2;i<=2;i++)box(i*.7,1.4,-8.8,.4,1.8,.08,'#9da9a7');
 }else if(name==='threshold'){
  floor('#afb7b4');
  box(-.65,.9,-7,.28,1.8,.6,'#697c7b');box(.65,.9,-7,.28,1.8,.6,'#697c7b');
  box(0,1.9,-7,1.65,.3,.7,'#849390');
  const keystone=box(0,1.45,-7,.28,.28,.28,'#d4c197');keystone.rotation.z=Math.PI/4;
  for(let i=0;i<3;i++)box(0,.09+i*.12,-6.7-i*.4,1.8-i*.2,.18+i*.24,1.6-i*.4,'#919d98');
 }
 return group;
}
function grid(vertical=false){
 const vertices=[];
 const line=(...points)=>vertices.push(...points);
 // The wall meets the floor: neither grid continues through the other plane.
 // Short depth segments keep perspective clipping reliable behind the camera.
 for(let x=-10;x<=10;x+=.5){
  if(vertical)line(x,0,-3.5,x,10,-3.5);else for(let z=-3.5;z<10;z+=.5)line(x,.008,z,x,.008,z+.5);
 }
 if(vertical){for(let y=0;y<=10;y+=.5)line(-10,y,-3.5,10,y,-3.5);}
 else{for(let z=-3.5;z<=10;z+=.5)line(-10,.008,z,10,.008,z);}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
 const material=new THREE.LineBasicMaterial({color:'#527fb5',transparent:true,opacity:.42,depthWrite:false});
 material.userData.outlineParameters={visible:false};
 return new THREE.LineSegments(geometry,material);
}
export class Scenery{
 constructor(scene){
  this.scene=scene;this.root=new THREE.Group();scene.add(this.root);
  this.ground=grid();this.backdrop=grid(true);scene.add(this.ground,this.backdrop);
  this.ground.visible=this.backdrop.visible=false;this.key='';
 }
 update(scene,guides={}){
  const name=scene.backdrop||'none',key=`${name}:${scene.style}`;
  if(key!==this.key){release(this.root);this.root.add(buildBackdrop(name,scene.style==='line'));this.key=key;}
  this.ground.visible=!!guides.ground;this.backdrop.visible=!!guides.backdrop;
  this.scene.fog=name==='none'?null:new THREE.Fog(scene.background,10,28);
 }
 dispose(){release(this.root);this.scene.remove(this.root,this.ground,this.backdrop);for(const g of [this.ground,this.backdrop]){g.geometry.dispose();g.material.dispose();}}
}
