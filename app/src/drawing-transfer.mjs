import { dimensions, uid } from './core.mjs';

export const TRANSFER_FPS = 24;
export const MAX_TRANSFER_FRAMES = 100;

// Keep this manifest with the project: the MP4 is a drawing carrier, not a timeline.
export function makeTransfer(project, clip) {
  const [width, height] = dimensions(project);
  const transfer = { version: 2, id: uid(), fps: TRANSFER_FPS, width, height,
    slots: clip.slots.filter(s => s.active).map(({id, key}) => ({id, key})) };
  return validateTransfer(transfer);
}

export function validateTransfer(transfer) {
  if (!transfer || !((transfer.version === 1 && transfer.fps === 6) || (transfer.version === 2 && transfer.fps === TRANSFER_FPS)) || typeof transfer.id !== 'string' || !/^[a-z0-9-]{1,80}$/.test(transfer.id)
    || ![[1080,1920],[1920,1080]].some(([w,h]) => transfer.width === w && transfer.height === h)
    || !Array.isArray(transfer.slots) || !transfer.slots.length || transfer.slots.length > MAX_TRANSFER_FRAMES) {
    throw Error('Invalid drawing video manifest. Export a new reference video (at most 100 drawings).');
  }
  const ids = new Set();
  for (const slot of transfer.slots) {
    if (!slot || typeof slot.id !== 'string' || !/^d[a-z0-9-]{1,64}$/.test(slot.id) || ids.has(slot.id)
      || typeof slot.key !== 'string' || slot.key.length > 20000) throw Error('Invalid drawing video identity');
    ids.add(slot.id);
  }
  return transfer;
}

export function transferSlots(transfer, project, clip) {
  if (!transfer) throw Error('Export a drawing-reference video from this project first, or open its project backup.');
  validateTransfer(transfer);
  const [w,h] = dimensions(project), registry = new Map(clip.slots.map(s => [s.id,s]));
  const saved = new Map(transfer.slots.map(s => [s.id,s.key]));
  // Legacy 6fps sampling can miss a brief mouth shape. Recover all old drawings;
  // leave genuinely new mouths unassigned rather than discarding existing work.
  const visualPose = s => JSON.stringify([s?.state.scene,s?.state.blinks,s?.state.smears??null]);
  const legacyPoses = new Set(transfer.version === 1 ? transfer.slots.map(s => visualPose(registry.get(s.id))) : []);
  if (w !== transfer.width || h !== transfer.height
    || transfer.slots.some(s => registry.get(s.id)?.key !== s.key)
    || clip.slots.some(s => s.active && saved.get(s.id) !== s.key && !legacyPoses.has(visualPose(s)))) {
    throw Error('The scene or required drawings changed. Restore the exported scene or export a new reference video. Timing-only changes can reuse your drawings.');
  }
  return transfer.slots.map(s => registry.get(s.id));
}

export function checkFrameCount(actual, expected) {
  if (actual !== expected) throw Error(`This video has ${actual} frames; expected ${expected}. In Procreate, keep one frame per drawing in the original order, remove holds and extra frames, then export Animated MP4. No drawings were replaced.`);
}

export function assignTransferFrames(transfer, project, clip, frames, previous = {}) {
  const slots = transferSlots(transfer, project, clip);
  checkFrameCount(frames.length, slots.length);
  if (frames.some(frame => !(frame instanceof Blob) || !frame.size)) throw Error('The video contains an unreadable drawing');
  return { ...previous, ...Object.fromEntries(slots.map((s,i) => [s.id,frames[i]])) };
}
