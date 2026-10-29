import { Input, BlobSource, MP4, QTFF, VideoSampleSink } from 'mediabunny';
import { exportMP4 } from './video.mjs';
import { TRANSFER_FPS, MAX_TRANSFER_FRAMES, checkFrameCount } from './drawing-transfer.mjs';

class DrawingVideoError extends Error {}
function requireFrameCount(actual,expected){
  try { checkFrameCount(actual,expected); }
  catch(error){ throw new DrawingVideoError(error.message,{cause:error}); }
}

function inputFor(blob) {
  if (!(blob instanceof Blob) || !blob.size || blob.size > 150*1024*1024) throw new DrawingVideoError('Choose a drawing video smaller than 150 MB.');
  return new Input({source:new BlobSource(blob),formats:[MP4,QTFF]});
}

async function drawingTrack(input, expectedCount) {
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new DrawingVideoError('No drawings found in this video. Export Animated MP4 from Procreate and try again.');
  const w = await track.getDisplayWidth(), h = await track.getDisplayHeight();
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1 || w*h > 4096*4096) throw new DrawingVideoError('This video is too large to read on this device. Export it at a lower resolution and try again.');
  const {packetCount} = await track.computePacketStats(MAX_TRANSFER_FRAMES+1);
  requireFrameCount(packetCount,expectedCount);
  return {track,width:w,height:h};
}

export async function exportFrameVideo({canvas,frameCount,drawFrame,signal,onProgress}) {
  if (!Number.isInteger(frameCount) || frameCount < 1 || frameCount > MAX_TRANSFER_FRAMES) throw Error('Use 1–100 drawings in one reference video.');
  const blob = await exportMP4({canvas,frameCount,fps:TRANSFER_FPS,duration:frameCount/TRANSFER_FPS,
    exactFrames:true,signal,onProgress,draw:t=>drawFrame(Math.round(t*TRANSFER_FPS))});
  const input = inputFor(blob);
  try { signal?.throwIfAborted();const info=await drawingTrack(input,frameCount);if(info.width!==canvas.width||info.height!==canvas.height)throw Error('The reference video changed size during encoding. Try creating references again.');return blob; }
  finally { input.dispose(); }
}

// Decode actual samples, not time-based screenshots: the editor may change FPS.
// Each decoded sample is released immediately; only compressed PNGs are retained.
export async function extractDrawingFrames(blob,{width,height,expectedCount,background='white',signal,onProgress=()=>{},onAdjustment=()=>{}}) {
  signal?.throwIfAborted();
  if (!Number.isInteger(expectedCount) || expectedCount < 1 || expectedCount > MAX_TRANSFER_FRAMES
    || !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width*height > 1920*1080) throw Error('Invalid drawing video dimensions or frame count.');
  const input = inputFor(blob), abort = ()=>input.dispose();
  signal?.addEventListener('abort',abort,{once:true});
  const canvas = document.createElement('canvas');
  try {
    const {track,width:sourceWidth,height:sourceHeight} = await drawingTrack(input,expectedCount);
    signal?.throwIfAborted();
    if (!(await track.canDecode())) throw new DrawingVideoError('This browser cannot read this video format. Export Animated MP4 from Procreate and try again, or upload the drawings as images.');
    canvas.width=width;canvas.height=height;
    const context=canvas.getContext('2d'),frames=[];let bytes=0;
    // Editors may round dimensions or export a smaller size. Normalize here,
    // preserving the whole drawing and its proportions, including rotation metadata.
    const scale=Math.min(width/sourceWidth,height/sourceHeight),dw=sourceWidth*scale,dh=sourceHeight*scale;
    const dx=(width-dw)/2,dy=(height-dh)/2;
    context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';
    for await (const sample of new VideoSampleSink(track).samples()) {
      try {
        signal?.throwIfAborted();
        if (frames.length >= expectedCount) requireFrameCount(frames.length+1,expectedCount);
        context.fillStyle=background;context.fillRect(0,0,width,height);sample.draw(context,dx,dy,dw,dh);
        const png=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Could not extract this drawing.')),'image/png'));
        bytes+=png.size;if(bytes>150*1024*1024)throw new DrawingVideoError('Extracted drawings exceed 150 MB. Split this into shorter clips.');
        frames.push(png);onProgress(frames.length/expectedCount);
      } finally { sample.close(); }
    }
    signal?.throwIfAborted();requireFrameCount(frames.length,expectedCount);
    if(sourceWidth!==width||sourceHeight!==height)onAdjustment({sourceWidth,sourceHeight,width,height});
    return frames;
  } catch (error) {
    signal?.throwIfAborted();
    if(error instanceof DrawingVideoError)throw error;
    throw new DrawingVideoError('Could not read this video. Your drawings are unchanged. Export Animated MP4 from Procreate and upload it again.',{cause:error});
  }
  finally { signal?.removeEventListener('abort',abort);input.dispose();canvas.width=1;canvas.height=1; }
}
