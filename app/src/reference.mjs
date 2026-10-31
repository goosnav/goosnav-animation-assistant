// Reference annotations describe reusable mouth drawings, not transcript letters.
// Keep this module out of the finished-animation render path.
export const REFERENCE_VERSION = 6;
export function referenceGuideKey(project){return JSON.stringify([!!project.guides?.ground,!!project.guides?.backdrop]);}
const sounds={rest:'M/B/P',small:'E',open:'A',wide:'EE',round:'O/U',teeth:'F/V'};
export function referenceLabels(state){
 return state.mouths.slice(0,state.scene.count).map((mouth,i)=>
  `${state.scene.count===2?`${i?'B':'A'}: `:''}${sounds[mouth]}${state.smears?.some(s=>s.actor===i)?' · SMEAR':''}${state.blinks?.[i]?' · BLINK':''}`);
}
export function drawReferenceLabels(ctx,state,width,height){
 const labels=referenceLabels(state),font=Math.round(Math.min(width,height)/30),padding=Math.round(font*.5),margin=Math.round(font*.7),lineHeight=Math.round(font*1.4);
 ctx.save();ctx.font=`700 ${font}px Arial, sans-serif`;
 const boxWidth=Math.ceil(Math.max(...labels.map(label=>ctx.measureText(label).width)))+padding*2;
 const boxHeight=lineHeight*labels.length+padding*2,x=width-margin-boxWidth,y=margin;
 ctx.fillStyle='#fff';ctx.fillRect(x,y,boxWidth,boxHeight);
 ctx.lineWidth=Math.max(1,Math.round(font/18));ctx.strokeStyle='#000';ctx.strokeRect(x,y,boxWidth,boxHeight);
 ctx.fillStyle='#0033a0';ctx.fillRect(x,y,Math.max(3,Math.round(font/8)),boxHeight);
 ctx.fillStyle='#000';ctx.textAlign='right';ctx.textBaseline='middle';
 labels.forEach((label,i)=>ctx.fillText(label,width-margin-padding,y+padding+lineHeight*(i+.5)));
 ctx.restore();
}
// Stage's lookAt camera has right=(cos az,0,-sin az),
// up=(-sin az*sin el,cos el,-cos az*sin el), and forward toward the target.
// Project directions (homogeneous w=0), so pan and dolly never move the VPs.
export function perspectiveVanishingPoints(state,width,height){
 const c=state.scene.camera;if(c.projection!=='perspective')return [];
 const az=c.azimuth*Math.PI/180,el=c.elevation*Math.PI/180,sa=Math.sin(az),ca=Math.cos(az),se=Math.sin(el),ce=Math.cos(el);
 const focal=height/(2*Math.tan(35*Math.PI/360)),cx=width/2,cy=height/2,inset=Math.max(12,Math.min(width,height)*.035);
 return [['X',ca,-sa*se,-sa*ce],['Y',0,ce,-se],['Z',-sa,-ca*se,-ca*ce]].map(([axis,right,up,depth])=>{
  const finite=Math.abs(depth)>1e-8,x=finite?cx+focal*right/depth:null,y=finite?cy-focal*up/depth:null;
  const visible=finite&&x>=0&&x<=width&&y>=0&&y<=height;
  const dx=finite?x-cx:right,dy=finite?y-cy:-up,length=Math.hypot(dx,dy);
  // Offscreen markers sit on the ray to the actual VP. They are arrows, never
  // replacement convergence points; the grid remains projected 3D geometry.
  const t=visible?1:Math.min((cx-inset)/Math.max(Math.abs(dx),1e-12),(cy-inset)/Math.max(Math.abs(dy),1e-12));
  return {axis,finite,x,y,visible,marker:{x:cx+dx*t,y:cy+dy*t,dx:length?dx/length:0,dy:length?dy/length:0}};
 });
}
// Retain the original horizon/visible-ground-point API for reference consumers.
export function perspectiveGuide(state,width,height){
 const c=state.scene.camera;if(c.projection!=='perspective')return null;
 const az=c.azimuth*Math.PI/180,el=c.elevation*Math.PI/180,f=1/Math.tan(35*Math.PI/360),aspect=width/height;
 const horizon=(1-Math.tan(el)*f)*height/2,points=[];
 for(const [side,forward]of [[Math.sin(az),Math.cos(az)*Math.cos(el)],[Math.cos(az),-Math.sin(az)*Math.cos(el)]]){
  if(Math.abs(forward)<1e-6)continue;const x=(1+side/forward*f/aspect)*width/2;
  if(x>=0&&x<=width)points.push(x);
 }
 return {horizon,points};
}
export function drawPerspectiveGuides(ctx,state,width,height,guides={}){
 if(!guides?.ground&&!guides?.backdrop)return;const guide=perspectiveGuide(state,width,height);if(!guide)return;
 const r=Math.max(4,Math.min(width,height)/110),font=Math.max(11,Math.min(width,height)/38);
 ctx.save();ctx.strokeStyle='#527fb5';ctx.fillStyle='#527fb5';ctx.lineWidth=Math.max(1,width/700);ctx.globalAlpha=.85;
 if(guides.ground&&guide.horizon>=0&&guide.horizon<=height){ctx.setLineDash([r,r]);ctx.beginPath();ctx.moveTo(0,guide.horizon);ctx.lineTo(width,guide.horizon);ctx.stroke();}
 ctx.setLineDash([]);ctx.font=`700 ${font}px Arial, sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';
 for(const point of perspectiveVanishingPoints(state,width,height)){
  if(point.axis==='Y'&&!guides.backdrop||point.axis==='Z'&&!guides.ground)continue;
  const {x,y,dx,dy}=point.marker;ctx.beginPath();
  if(point.visible){ctx.arc(x,y,r,0,Math.PI*2);ctx.moveTo(x-r*1.5,y);ctx.lineTo(x+r*1.5,y);ctx.moveTo(x,y-r*1.5);ctx.lineTo(x,y+r*1.5);}
  else{ctx.moveTo(x-dx*r*3,y-dy*r*3);ctx.lineTo(x,y);ctx.lineTo(x-dx*r*1.5-dy*r,y-dy*r*1.5+dx*r);ctx.moveTo(x,y);ctx.lineTo(x-dx*r*1.5+dy*r,y-dy*r*1.5-dx*r);}
  ctx.stroke();
  const label=point.axis+(point.finite?'':' ∞'),lx=point.visible?Math.min(width-font,Math.max(font,x+r*3)):x-dx*(r*4+font/2),ly=point.visible?Math.min(height-font,Math.max(font,y-r*3)):y-dy*(r*4+font/2);
  ctx.fillText(label,lx,ly);
 }
 ctx.restore();
}
export function referenceInstruction(state){return state.smears?.length||state.motionWipes?.length?'WIPE FRAME':'';}
export function drawReferenceInstruction(ctx,state,width,height){
 const instruction=referenceInstruction(state);if(!instruction)return;
 const font=Math.round(Math.min(width,height)/23),padding=Math.round(font*.4),bottom=Math.round(font*.6);
 ctx.save();ctx.font=`700 ${font}px Arial, sans-serif`;const boxWidth=ctx.measureText(instruction).width+padding*2;
 ctx.fillStyle='#fff';ctx.fillRect((width-boxWidth)/2,height-bottom-font-padding*2,boxWidth,font+padding*2);
 ctx.fillStyle='#da291c';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(instruction,width/2,height-bottom-padding-font/2);ctx.restore();
}
export async function annotatedReference(source,state,width,height,guides={}){
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 const image=await createImageBitmap(source);
 try{
  const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,width,height);drawPerspectiveGuides(ctx,state,width,height,guides);drawReferenceLabels(ctx,state,width,height);drawReferenceInstruction(ctx,state,width,height);
  return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Could not label this reference.')),'image/png'));
 }finally{image.close();canvas.width=1;canvas.height=1;}
}
