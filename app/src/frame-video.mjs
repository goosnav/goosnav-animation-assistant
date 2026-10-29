import { Input, BlobSource, MP4, QTFF, VideoSampleSink } from 'mediabunny';
import { exportMP4 } from './video.mjs';
import { TRANSFER_FPS, MAX_TRANSFER_FRAMES, checkFrameCount } from './drawing-transfer.mjs';

function inputFor(blob) {
  if (!(blob instanceof Blob) || !blob.size || blob.size > 150*1024*1024) throw Error('Choose a drawing video smaller than 150 MB.');
  return new Input({source:new BlobSource(blob),formats:[MP4,QTFF]});
}

async function drawingTrack(input, expectedCount, width, height) {
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw Error('No video frames found. Export Animated MP4 from Procreate.');
  const w = await track.getDisplayWidth(), h = await track.getDisplayHeight();
  if (w !== width || h !== height) throw Error(`Video is ${w} × ${h}; expected ${width} × ${height}. Export at Max Resolution in Procreate without resizing the canvas.`);
  const {packetCount} = await track.computePacketStats(MAX_TRANSFER_FRAMES+1);
  checkFrameCount(packetCount,expectedCount);
  return track;
}

export async function exportFrameVideo({canvas,frameCount,drawFrame,signal,onProgress}) {
  if (!Number.isInteger(frameCount) || frameCount < 1 || frameCount > MAX_TRANSFER_FRAMES) throw Error('Use 1–100 drawings in one reference video.');
  const blob = await exportMP4({canvas,frameCount,fps:TRANSFER_FPS,duration:frameCount/TRANSFER_FPS,
    exactFrames:true,signal,onProgress,draw:t=>drawFrame(Math.round(t*TRANSFER_FPS))});
  const input = inputFor(blob);
  try { signal?.throwIfAborted();await drawingTrack(input,frameCount,canvas.width,canvas.height);return blob; }
  finally { input.dispose(); }
}

// Decode actual samples, not time-based screenshots: the editor may change FPS.
// Each decoded sample is released immediately; only compressed PNGs are retained.
export async function extractDrawingFrames(blob,{width,height,expectedCount,signal,onProgress=()=>{}}) {
  signal?.throwIfAborted();
  if (!Number.isInteger(expectedCount) || expectedCount < 1 || expectedCount > MAX_TRANSFER_FRAMES
    || !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width*height > 1920*1080) throw Error('Invalid drawing video dimensions or frame count.');
  const input = inputFor(blob), abort = ()=>input.dispose();
  signal?.addEventListener('abort',abort,{once:true});
  const canvas = document.createElement('canvas');
  try {
    const track = await drawingTrack(input,expectedCount,width,height);
    signal?.throwIfAborted();
    if (!(await track.canDecode())) throw Error('This browser cannot extract this video. Export Animated MP4 in Procreate and update iPadOS/Safari, or use image import.');
    canvas.width=width;canvas.height=height;
    const context=canvas.getContext('2d'),frames=[];let bytes=0;
    for await (const sample of new VideoSampleSink(track).samples()) {
      try {
        signal?.throwIfAborted();
        if (frames.length >= expectedCount) checkFrameCount(frames.length+1,expectedCount);
        context.fillStyle='white';context.fillRect(0,0,width,height);sample.draw(context,0,0,width,height);
        const png=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Could not extract this drawing.')),'image/png'));
        bytes+=png.size;if(bytes>150*1024*1024)throw Error('Extracted drawings exceed 150 MB. Split this into shorter clips.');
        frames.push(png);onProgress(frames.length/expectedCount);
      } finally { sample.close(); }
    }
    signal?.throwIfAborted();checkFrameCount(frames.length,expectedCount);return frames;
  } catch (error) { signal?.throwIfAborted();throw error; }
  finally { signal?.removeEventListener('abort',abort);input.dispose();canvas.width=1;canvas.height=1; }
}
