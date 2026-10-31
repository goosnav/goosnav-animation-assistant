import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as reference from '../app/src/reference.mjs';
import {Scenery} from '../app/src/scenery.mjs';

const state=(camera={})=>({scene:{camera:{projection:'perspective',azimuth:25,elevation:18,targetX:.4,targetY:1.2,zoom:1,...camera}}});
function cameraFor(c,width,height){
 const camera=new THREE.PerspectiveCamera(35,width/height,.01,1000),target=new THREE.Vector3(c.targetX,c.targetY,0);
 camera.position.copy(target).add(new THREE.Vector3().setFromSpherical(new THREE.Spherical(6/c.zoom,THREE.MathUtils.degToRad(90-c.elevation),THREE.MathUtils.degToRad(c.azimuth))));
 camera.lookAt(target);camera.updateMatrixWorld(true);return camera;
}

// Catches missing vertical/offcanvas VPs and sign/basis mismatches against the actual renderer.
test('three axis vanishing points match Three camera direction projection, including offcanvas points',()=>{
 assert.equal(typeof reference.perspectiveVanishingPoints,'function');
 for(const [width,height]of [[540,960],[960,540]])for(const angles of [[25,18],[-35,-12],[110,45]]){
  const s=state({azimuth:angles[0],elevation:angles[1]}),camera=cameraFor(s.scene.camera,width,height),points=reference.perspectiveVanishingPoints(s,width,height);
  assert.deepEqual(points.map(p=>p.axis),['X','Y','Z']);
  for(const [i,point]of points.entries()){
   const direction=new THREE.Vector4(i===0?1:0,i===1?1:0,i===2?1:0,0).applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
   assert.equal(point.finite,true);assert.ok(Math.abs(point.x-(direction.x/direction.w+1)*width/2)<1e-7);assert.ok(Math.abs(point.y-(1-direction.y/direction.w)*height/2)<1e-7);
   assert.equal(point.visible,point.x>=0&&point.x<=width&&point.y>=0&&point.y<=height);
   assert.ok(point.marker.x>=0&&point.marker.x<=width&&point.marker.y>=0&&point.marker.y<=height);
   if(!point.visible){
    const dx=point.x-width/2,dy=point.y-height/2,mx=point.marker.x-width/2,my=point.marker.y-height/2;
    assert.ok(Math.abs(mx*dy-my*dx)<1e-6,'edge marker points toward the true vanishing point');
    assert.ok(mx*dx+my*dy>0,'edge marker points outward');
   }
  }
 }
});

// Catches fabricated finite VPs when an axis is parallel to the image plane.
test('level/cardinal views keep directions at infinity and orthographic views have no vanishing points',()=>{
 assert.equal(typeof reference.perspectiveVanishingPoints,'function');
 const level=reference.perspectiveVanishingPoints(state({azimuth:0,elevation:0}),540,960);
 assert.deepEqual(level.map(p=>p.finite),[false,false,true]);
 assert.equal(level[2].x,270);assert.equal(level[2].y,480);
 for(const point of level){assert.ok(Number.isFinite(point.marker.x));assert.ok(Number.isFinite(point.marker.y));}
 assert.deepEqual(reference.perspectiveVanishingPoints(state({projection:'orthographic'}),540,960),[]);
 assert.deepEqual(reference.perspectiveVanishingPoints(state({azimuth:25,elevation:0}),540,960).map(p=>p.finite),[true,false,true]);
});

test('vanishing points depend on view orientation and aspect, not dolly distance or pan',()=>{
 assert.equal(typeof reference.perspectiveVanishingPoints,'function');
 assert.deepEqual(reference.perspectiveVanishingPoints(state(),540,960),reference.perspectiveVanishingPoints(state({targetX:-1.3,targetY:2.7,zoom:2.5}),540,960));
});

// A floor extending through the rear guide wall creates overlapping grids,
// obscuring which lines belong to each of the three vanishing directions.
test('reference floor stops at its wall and leaves a readable vertical guide area behind actors',()=>{
 const scenery=new Scenery(new THREE.Scene());
 try{
  const ground=scenery.ground.geometry.getAttribute('position'),wall=scenery.backdrop.geometry.getAttribute('position'),wallZ=wall.getZ(0);
  for(let i=0;i<ground.count;i++)assert.ok(ground.getZ(i)>=wallZ,'floor must not continue behind the wall');
  const camera=cameraFor(state().scene.camera,540,960),base=new THREE.Vector3(0,0,wallZ).project(camera);
  assert.ok((1-base.y)/2>.3,'wall vertical guides must fill a readable portion of the frame');
  assert.ok(wallZ<0,'wall must stay behind the actors');
 }finally{scenery.dispose();}
});
