// Reference annotations describe reusable mouth drawings, not transcript letters.
// Keep this module out of the finished-animation render path.
export const REFERENCE_VERSION = 1;
const sounds={rest:'M/B/P',small:'E',open:'A',wide:'EE',round:'O/U',teeth:'F/V'};
export function referenceLabels(state){
 return state.mouths.slice(0,state.scene.count).map((mouth,i)=>
  `${state.scene.count===2?`${i?'B':'A'}: `:''}${sounds[mouth]}${state.blinks?.[i]?' · BLINK':''}`);
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
export async function annotatedReference(source,state,width,height){
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 const image=await createImageBitmap(source);
 try{
  const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,width,height);drawReferenceLabels(ctx,state,width,height);
  return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Could not label this reference.')),'image/png'));
 }finally{image.close();canvas.width=1;canvas.height=1;}
}
