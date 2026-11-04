# Multi-shot films

A sequence joins ordered shots into one drawing-reference carrier and one finished animation. Each shot uses the existing scene configuration: its own camera, characters, dialogue, motion keys and audio. All shots use the same portrait or landscape orientation and 24 fps. Cuts occur exactly between frames.

Start with [`examples/dialogue-coverage.json`](../examples/dialogue-coverage.json): an opening wide two-shot, A close-up speaking, B close-up speaking, then a return wide for the reaction. The [three-shot example](../examples/three-shot-sequence.json) shows a shorter alternative. A character shown alone is actor `0` within that shot; use its model and appearance to keep it consistent with the wide shot.

```json
{
  "format": "goosnav-animation-sequence",
  "version": 1,
  "id": "my-film",
  "title": "My film",
  "shots": [
    {
      "id": "opening",
      "title": "Opening close-up",
      "config": {
        "format": "goosnav-animation-config",
        "version": 1,
        "scene": {"actors": [{"model": "blue", "x": 0, "yaw": 0}]},
        "dialogue": [{"actor": 0, "text": "Hello."}]
      }
    }
  ]
}
```

`id` and `title` on the sequence may be omitted in a new recipe. The importer supplies them, and every export records them. Every shot requires a unique `id`, a `title`, and a nested scene `config`. IDs contain up to 80 letters, digits, or hyphens. Titles have at most 200 characters. Unknown fields and malformed nested values are rejected before replacing an open film.

Sequences support 1–20 shots, at most 600 seconds of finished footage, 2,000 drawing identities, and a JSON file of at most 5 MB. The existing 120-second limit still applies to each shot. Speech duration is checked after synthesis. Drawing detail can reach the JSON size limit before the drawing-count limit.

## Editor

**+ Add shot** starts a new shot with the current staging. **Shot options** duplicates, moves, or removes the selected shot. Scene, Speech, and Animation edit that shot; Draw and Export preview and render the complete film. The title above the strip names the film; Shot name names the selected shot. Changing the canvas orientation applies across the film.

Pending pose/action edits are committed before switching shots. The film has one saved-project identity, and its ZIP backup contains every shot's speech, artwork, references, and recorded voiceover. Removing a shot offers Undo removal; subsequent edits to other shots are preserved. Audio controls and recordings apply to the selected shot, while normal playback on Draw/Export uses the combined film.

## Drawing handoff

Reference export writes `references.mp4` and `sequence.json`. PNG export writes `references/0001.png`, `references/0002.png`, and so on, together with `sequence.json`. The reference images carry shot names, shot IDs, drawing numbers, and the existing mouth labels. A reference MP4 contains each drawing once at 24 fps; it is a drawing carrier, so its duration is unrelated to the finished film's duration. MP4 carriers support at most 100 drawings. Choose PNGs for larger sets.

Keep the exported `sequence.json` with the returned artwork. Return exactly one frame per drawing, in the original carrier order, or consecutively numbered PNG/JPEG/WebP images beginning at 0 or 1. Do not add holds to the drawing carrier. The app restores holds and mouth timing from the exposure timelines.

The exported JSON includes each shot's existing scene handoff plus a global `handoff.slots` list. A global identity combines the shot ID and its local drawing ID, such as `opening:d123...`. Identical local drawing IDs in different shots remain distinct. The global list fixes reference order independently of shot playback order. Moving a shot therefore preserves the meaning of every returned drawing frame. Changing duration or dialogue timing can reuse existing drawings when their visual states still match.

Adding or removing shots or introducing new visual states invalidates the old carrier. The importer rejects incompatible mappings with `HANDOFF_DRAWINGS_CHANGED`; it never shifts subsequent drawings into the wrong shot. Export new references for the changed film. Preserve shot IDs when renaming or reordering shots.

## Audio and finished output

Finished export encodes the whole film once from the combined frame timeline. It does not concatenate encoded MP4 files. Speech is mixed separately per shot; recordings honor the shot's trim and offset settings. Audio is resampled to mono 48 kHz, with exactly 2,000 samples for each video frame, then concatenated at the shot boundaries. Silent shots receive silence. Recorded audio that exceeds a shot is cut at its final frame.

JSON carries speech text and saved phoneme timing, but no images or recorded audio. Use a project backup to transfer recordings and artwork. Importing a portable scene recipe follows the existing recording-to-robot-voice normalization because the recipe has no recording asset.

## Folder batches

A batch folder may contain either one scene JSON or one sequence JSON. A sequence is one batch job regardless of its shot count. Keep returned artwork beside that JSON or in a drawing subfolder. The importer ignores `references/` and previous `generated/` output directories, and rejects folders containing two scene/sequence configurations as ambiguous.

Auto mode creates references when no returned artwork exists and creates the whole finished film when artwork is present. Each run writes into a new `generated`, `generated-2`, or later directory. A sequence run saves `sequence.json`; a single-scene run keeps its existing `scene.json` name. Reference and animation modes can also be selected explicitly. Failed or cancelled imports do not replace project drawings, and ZIP batches include only completed jobs.

## Browser module

The shared engine lives in `app/src/sequence.mjs`; browser automation uses the public pipeline bundle. The parser lives in `app/src/sequence-config.mjs` and requires no browser or speech worker.

| Function | Result |
| --- | --- |
| `parseSequenceDocument(text, options)` | `{id, title, shots: [{id, title, config, project, handoff}], handoff}`. `config` is the nested recipe; `project` and the local `handoff` are parsed scene values. Editing tools may pass `{allowStaleHandoff: true}` to accept structurally valid old carrier metadata and receive `needsReferences: true` when its shot mapping no longer matches. |
| `isSequenceDocument(text)` | Format detection only; always parse before accepting input. |
| `prepareSequence(text, options)` | Prepared film with synthesized speech and restored drawing identities. Supports `signal`, `onProgress`, `newReferences`, and `allowNewDrawings`. |
| `assembleSequence({id, title, shots, handoff = null})` | Prepared film from `shots: [{id, title, scene}]`, where `scene` is a prepared single scene. An existing handoff is validated and keeps carrier order. |
| `sequenceJSON(sequence)` | Strict, portable sequence JSON with global and per-shot handoffs. |
| `attachSequenceArtwork(sequence, files, options)` | New film with per-shot artwork, leaving the input unchanged on success, failure, or cancellation. |
| `renderSequenceReferences(sequence, options)` | Emits references and `sequence.json`. Options include `format: 'mp4' \| 'png' \| 'both'`, `emit(name, blob)`, `signal`, and `onProgress`. |
| `renderSequenceAnimation(sequence, options)` | Finished MP4 `Blob`. Options include `signal`, `onProgress`, and an optional borrowed `audioContext`. |
| `sequenceAudio(sequence, context, {signal} = {})` | Combined mono 48 kHz `AudioBuffer`, or `null` if every shot is silent. The caller owns the context. |
| `validateSequenceHandoffShape(handoff)` | Validates saved metadata independently of current shots, for backups that preserve a reference set after editing. |

`document-pipeline.mjs` provides format dispatch through `prepareDocument`, `documentJSON`, `attachDocumentArtwork`, `renderDocumentReferences`, and `renderDocumentAnimation`, using the same arguments as the scene/sequence equivalents. `processDocumentJob(job, {mode, referenceFormat, signal, onProgress, emit})` runs a discovered folder job and returns `{kind, drawings, duration}`, plus `shots` for a sequence. The public pipeline bundle exports both these generic functions and the existing scene APIs.

A prepared film exposes `kind: 'sequence'`, `id`, `title`, `shots`, `fps`, `width`, `height`, `totalFrames`, `duration`, `drawingSlots`, `exposures`, and `handoff`. Each prepared shot also has `startFrame` and `endFrame`. All end frames are exclusive. Drawing entries expose global `id`, `shotId`, local `slotId`, canonical `key`, and `state`. Global exposures use the global identity in `slotId`, plus `shotId`, `startFrame`, and `endFrame`.

`allowNewDrawings` accepts changed scene visuals or added/removed shots by creating a new mapping and marking the prepared film `needsReferences: true`. Use it only when preparing new references without returned artwork. `newReferences` also accepts these edits and builds a fresh reference set. A strict artwork import uses the default behavior and rejects changed mappings. An explicitly malformed manifest still fails validation in every mode. Batch discovery accepts well-shaped stale metadata, then the chosen generation mode decides whether to regenerate references or reject incompatible artwork.

Progress callbacks receive `{phase, progress}`, with progress between 0 and 1. Imports remain atomic. Reference export checks cancellation between drawings and before each final output; a cancelled output destination may already contain completed PNGs, but never receives a final sequence JSON after cancellation.
