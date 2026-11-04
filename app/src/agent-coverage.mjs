const angle=(a,b)=>Math.abs(((a-b+180)%360+360)%360-180);
const ratio=(a,b)=>Math.max(a/b,b/a);

/** Advisory recipe comparison, not a judgement of rendered images or story quality. */
export function reviewCoverage(shots){
 const cuts=[],warnings=[];
 for(let i=1;i<shots.length;i++){
  const before=shots[i-1],after=shots[i],a=before.project.scene,b=after.project.scene;
  const castA=a.actors.slice(0,a.count),castB=b.actors.slice(0,b.count);
  const sameCast=castA.length===castB.length&&castA.every((actor,j)=>actor.model===castB[j].model);
  const sameStaging=sameCast&&castA.every((actor,j)=>{
   const other=castB[j];return Math.hypot(actor.x-other.x,actor.z-other.z)<.2&&ratio(actor.scale,other.scale)<1.2&&angle(actor.yaw,other.yaw)<20;
  });
  const x=a.camera,y=b.camera,scale=ratio(x.zoom,y.zoom);
  const similar=sameStaging&&x.projection===y.projection&&scale<1.35&&angle(x.azimuth,y.azimuth)<20&&Math.abs(x.elevation-y.elevation)<20&&Math.hypot(x.targetX-y.targetX,x.targetY-y.targetY)<.25;
  const cut={fromShotId:before.id,toShotId:after.id,sameCast,similar,scaleChangePercent:Math.round((scale-1)*100)};cuts.push(cut);
  if(similar)warnings.push(`Nearly identical adjacent shots "${before.id}" → "${after.id}" (${cut.scaleChangePercent}% camera scale change). A tiny zoom is not new coverage. Combine them or change the subject, shot size or viewing angle substantially; inspect both rendered frames.`);
 }
 return {basis:'Advisory comparison of adjacent recipe cameras, cast and staging. Does not judge rendered motion, expression or artistic quality; inspect the PNG contact sheet. Nonadjacent return shots are allowed.',cuts,warnings};
}
