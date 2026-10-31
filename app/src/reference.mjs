// Reference annotations describe reusable mouth drawings, not transcript letters.
// Keep this module out of the finished-animation render path.
export const REFERENCE_VERSION = 5;
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
// Vanishing directions at infinity for the same 35-degree camera as Stage.
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
 if(!guides?.ground)return;const guide=perspectiveGuide(state,width,height);if(!guide||guide.horizon<0||guide.horizon>height)return;
 const y=guide.horizon,r=Math.max(5,width/100);ctx.save();ctx.strokeStyle='#527fb5';ctx.lineWidth=Math.max(1,width/700);ctx.globalAlpha=.75;ctx.setLineDash([r,r]);ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(width,y);ctx.stroke();ctx.setLineDash([]);
 for(const x of guide.points){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.moveTo(x-r*1.5,y);ctx.lineTo(x+r*1.5,y);ctx.moveTo(x,y-r*1.5);ctx.lineTo(x,y+r*1.5);ctx.stroke();}ctx.restore();
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
