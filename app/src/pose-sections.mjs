import {ACTOR_CHANNELS,PROP_CHANNELS} from './motion.mjs';

const section=(label,keys)=>Object.freeze({label,keys:Object.freeze(keys)});

// These are numeric offsets on top of the selected held pose and expression.
// Resetting them preserves the actor's model, held pose, chair, and emotion.
// Solver dependencies are included where they can override a neutral offset.
export const ACTOR_SECTIONS=Object.freeze({
 position:section('Position',['x','y','z','yaw','scale','noseContact']),
 head:section('Head',['headYaw','headPitch','headTilt','headSpin','noseContact']),
 body:section('Body',['bodyLean','bodyTurn','rootPitch','rootRoll','noseContact']),
 'left-arm':section('Left arm',['armL','armSideL','elbowL','handL','fingerCurlL','fingerPointL','contactLeft','contactLX','contactLY','contactLZ']),
 'right-arm':section('Right arm',['armR','armSideR','elbowR','handR','fingerCurlR','fingerPointR','contact','contactX','contactY','contactZ','contactHand','noseGrip','armStretchR']),
 legs:section('Legs',['thighL','kneeL','footL','thighR','kneeR','footR','footIK','footForwardL','footForwardR','footLiftL','footLiftR','groundY']),
 cartoon:section('Cartoon',['headScale','handScale','armStretchR','flatten','burst','noseDetach','noseGrip','nose']),
});

export const PROP_SECTIONS=Object.freeze({
 position:section('Position',['x','y','z']),
 rotation:section('Rotation',['rx','ry','rz']),
 dimensions:section('Dimensions',['width','height','depth']),
 book:section('Book',['open','page']),
});

// Each patch is independent and safe to merge into a scene actor, prop, or pose
// draft. Prop dimensions return descriptor defaults within this section only.
export function resetSectionValues(kind,id){
 const sections=kind==='actor'?ACTOR_SECTIONS:kind==='prop'?PROP_SECTIONS:null;
 if(!sections)throw Error('Invalid pose reset kind');
 if(typeof id!=='string'||!Object.hasOwn(sections,id))throw Error('Invalid pose reset section');
 const channels=kind==='actor'?ACTOR_CHANNELS:PROP_CHANNELS;
 return Object.fromEntries(sections[id].keys.map(key=>[key,channels[key].default]));
}
