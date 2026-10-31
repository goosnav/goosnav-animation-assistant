import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Snapshots of CURRENT library exports; provenance and hashes live in assets/manifest.json.
export const WORLD_IDS=['black-pyramids','red-mesas','space','backrooms','starter-overgrown-courtyard','colonnade','threshold'];
const sources=new Map();let desertTexture;
function loadDesertTexture(){if(!desertTexture)desertTexture=new THREE.TextureLoader().loadAsync('assets/sky-black-pyramids.jpg').then(t=>{t.colorSpace=THREE.SRGBColorSpace;t.flipY=false;return t;}).catch(e=>{desertTexture=null;throw e;});return desertTexture;}
function loadWorld(name){
 if(!sources.has(name))sources.set(name,new GLTFLoader().loadAsync(`assets/world-${name}.glb`).then(g=>g.scene).catch(e=>{sources.delete(name);throw e;}));
 return sources.get(name);
}
function release(group){
 const geometries=new Set(),materials=new Set();
 group.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);});
 geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());group.clear();
}
function adapt(source,name,texture){
 const group=source.clone(true),remove=[];
 group.traverse(o=>{
  // The theatre's shared reading table is optional furniture, not the environment.
  if(o.isCamera||o.isLight||/^Table_(body|top|leg)/.test(o.name)||/^Anchor_/.test(o.name)||(name==='black-pyramids'&&['Floor','Far_pyramid','Near_pyramid'].includes(o.name)))remove.push(o);
  if(o.isMesh){
   o.geometry=o.geometry.clone();
   const materials=(Array.isArray(o.material)?o.material:[o.material]).map(m=>{
    const mat=m.clone();mat.fog=false;mat.userData.outlineParameters={visible:false};return mat;
   });o.material=Array.isArray(o.material)?materials:materials[0];
  }
 });
 for(const o of remove){o.removeFromParent();if(o.isMesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}}
 // The original baked desert includes dunes and properly distant monuments.
 // The theatre's extra close monuments filled a portrait camera, so use its
 // authentic panorama on its own instead of inventing replacement geometry.
 const panorama=group.getObjectByName('Panorama_background');
 if(name==='black-pyramids'&&panorama){
  panorama.rotation.y+=.1;if(texture)panorama.material.emissiveMap=texture;
  // Correct the inward sphere's mirrored view while keeping its authored
  // longitude: the source preview's small companion and cut are on the left.
  // Lift the distant silhouettes above the inward-facing actors' noses.
  const mirror=new THREE.Group();mirror.scale.x=-1;mirror.rotation.x=.045;group.add(mirror);mirror.add(panorama);
 }
 if(name==='red-mesas'&&panorama)panorama.rotation.x-=.20;
 if(name==='colonnade'){group.position.z=-20;}
 if(name==='threshold'){group.scale.setScalar(.055);group.position.z=-5;}
 return group;
}
function grid(vertical=false){
 const vertices=[],line=(...points)=>vertices.push(...points);
 // Every floor line is finite and segmented, including cross lines; lines behind
 // the near plane cannot turn into full-screen streaks when orbiting the camera.
 for(let x=-15;x<=15;x+=.5){
  if(vertical)line(x,0,-10,x,10,-10);
  else for(let z=-40;z<15;z+=.5)line(x,.012,z,x,.012,z+.5);
 }
 if(vertical){for(let y=0;y<=10;y+=.5)line(-15,y,-10,15,y,-10);}
 else for(let z=-40;z<=15;z+=.5)for(let x=-15;x<15;x+=.5)line(x,.012,z,x+.5,.012,z);
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
 const material=new THREE.LineBasicMaterial({color:'#527fb5',transparent:true,opacity:.48,depthWrite:false});
 material.userData.outlineParameters={visible:false};return new THREE.LineSegments(geometry,material);
}
export class Scenery{
 constructor(scene){
  this.scene=scene;this.root=new THREE.Group();scene.add(this.root);
  this.ground=grid();this.backdrop=grid(true);scene.add(this.ground,this.backdrop);
  this.ground.visible=this.backdrop.visible=false;this.name='none';this.ticket=0;
 }
 async prepare(scene){
  const name=WORLD_IDS.includes(scene.backdrop)?scene.backdrop:'none';
  const ticket=++this.ticket;if(name===this.name)return;
  const [source,texture]=await Promise.all([name==='none'?null:loadWorld(name),name==='black-pyramids'?loadDesertTexture():null]);
  if(ticket!==this.ticket)return;
  release(this.root);if(source)this.root.add(adapt(source,name,texture));this.name=name;
 }
 update(scene,guides={}){
  this.root.visible=this.name===(scene.backdrop||'none');
  this.ground.visible=!!guides.ground;this.backdrop.visible=!!guides.backdrop;
  this.scene.fog=null;
  if(this.name==='space')this.scene.background=new THREE.Color('#03050b');
  if(this.name==='starter-overgrown-courtyard')this.scene.background=new THREE.Color('#8ba9bd');
 }
 dispose(){this.ticket++;release(this.root);this.scene.remove(this.root,this.ground,this.backdrop);for(const g of [this.ground,this.backdrop]){g.geometry.dispose();g.material.dispose();}}
}
