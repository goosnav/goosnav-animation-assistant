import * as THREE from 'three';
import {reach} from './rig-actions.mjs';

// Contact poses use the loaded rig's proportions, in actor-local coordinates.
// Fixed shoulder angles alone put the hands in front of the character.
export function bodyPoses(root,bones){
 root.updateMatrixWorld(true);
 const local=name=>root.worldToLocal(bones[name].getWorldPosition(new THREE.Vector3()));
 const hip=local('hips'),shoulder=local('upper_armL'),thigh=local('thighL'),knee=local('shinL');
 const torso=shoulder.y-hip.y,leg=thigh.distanceTo(knee);
 function handAt(side,target,direction){
  const hand=bones[`hand${side}`];reach(root,[bones[`upper_arm${side}`],bones[`forearm${side}`]],hand,root.localToWorld(target.clone()),1,48);
  const finger=bones[`f11${side}`];if(!finger)return;
  root.updateMatrixWorld(true);
  const axis=finger.getWorldPosition(new THREE.Vector3()).sub(hand.getWorldPosition(new THREE.Vector3())).normalize();
  const desired=direction.clone().transformDirection(root.matrixWorld),world=hand.getWorldQuaternion(new THREE.Quaternion());
  hand.quaternion.copy(hand.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(new THREE.Quaternion().setFromUnitVectors(axis,desired).multiply(world)));
 }
 return {
  seat:null,
  settle(a,restFeet){
   this.seat=null;if(a.pose!=='sitting')return;
   root.updateMatrixWorld(true);
   const now=bones.footL.getWorldPosition(new THREE.Vector3());
   root.position.y+=restFeet.L.y-now.y;root.updateMatrixWorld(true);
   const pelvis=local('hips');
   // Seat surface meets the underside of the pelvis; short characters get a
   // lower chair without shrinking its width below their body width.
   const surface=pelvis.y-torso*.14;
   this.seat={height:surface+root.position.y/a.scale-(a.y||0)/a.scale,width:Math.max(.38,shoulder.x*2+.10),depth:Math.max(.28,leg*1.1),z:hip.z};
  },
  hands(a){
   if(!['hands-on-hips','sitting'].includes(a.pose))return;
   for(const [side,sign]of [['L',1],['R',-1]]){
    if(['arm','armSide','elbow'].some(k=>Math.abs(a[`${k}${side}`]||0)>.001))continue;
    if(a.pose==='hands-on-hips')handAt(side,new THREE.Vector3(sign*(shoulder.x+.01),hip.y+torso*.24,hip.z+.015),new THREE.Vector3(0,-1,0));
    else {
     const short=leg<torso*.7;
     handAt(side,new THREE.Vector3(sign*(short?shoulder.x+.03:Math.max(thigh.x,shoulder.x*.85)),thigh.y+leg*.25,thigh.z+leg*.65),new THREE.Vector3(-sign*(short?.8:.25),-.12,short?.6:1));
    }
   }
  },
 };
}
