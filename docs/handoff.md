# Handoff and batch workflows

A scene JSON is the editable source. An exported JSON also records the ordered drawings and playback timing, so another person or AI agent can prepare references and you can finish the animation on a different device.

## One scene

1. Open a [recipe JSON](config.md), or create a scene in the editor.
2. Create references. The automatically saved package includes `scene.json` and a reference MP4 or numbered PNGs.
3. Draw one image per reference in the same order. Return a short drawing MP4 with one encoded frame per drawing, or images named `0001.png`, `0002.png`, etc. Do not add holds or repeated frames to the drawing video; the app reconstructs playback timing.
4. On any device, choose **Open JSON + drawings** and select `scene.json` with the returned artwork. You can select them together or load the JSON first.
5. Click **Export animation**. The finished MP4 saves automatically. **Export JSON** saves the current editor settings, including changes made after import.

An MP4 handoff supports up to 100 drawings. PNG handoffs support up to 2,000 drawing states, within the 5 MB JSON limit. Image filenames must have consecutive numbers starting at 0 or 1; numeric order wins over file-picker order. Extra/missing frames, mixed videos and images, duplicate numbers, or missing indices produce an error rather than a guessed assignment. The editor's separate **Upload drawings** control still allows manual ordering for unnumbered images.

Timing edits reuse drawings when all required visual states already exist. Changing a camera, character, or pose may require new references. Loading an edited JSON alone allows creating those references; loading it with incompatible old artwork rejects the combination and preserves the current scene.

JSON contains no recorded voiceover. Use a project backup to move recorded audio, or regenerate the robot speech. The drawing video supplies artwork, not the final audio track.

## A folder of scenes

Put one scene JSON in each scene folder:

```text
shots/
  01-introduction/
    scene.json
  02-reply/
    scene.json
    artwork.mp4
  03-reaction/
    scene.json
    drawings/
      0001.png
      0002.png
```

Choose **Batch → Choose folder → shots**, then **Generate all**. Scene folders can be nested. Drawing subfolders belong to the nearest scene JSON. The mode controls the output:

| Mode | JSON alone | JSON + artwork |
| --- | --- | --- |
| Auto | Reference package | Finished animation + JSON |
| References | Reference package | New reference package |
| Finished animations | Missing-artwork error | Finished animation + JSON |

Reference packages contain `scene.json` plus `references.mp4`, `references/0001.png` etc., or both formats. Finished packages contain `animation.mp4` and `scene.json`.

With writable folder access, outputs go into a new `generated` directory inside each source scene. **Output folder** selects another root and keeps the scene paths below it. Repeated runs reserve `generated-2`, `generated-3`, etc.; they do not overwrite inputs or earlier exports. Jobs run one at a time. An error appears beside that scene while other jobs continue. Cancel stops the queue and keeps completed files.

Give the generated reference package to the artist as its own scene folder. Keep its `scene.json`, and add the returned `artwork.mp4` or a `drawings` folder. Selecting that folder creates the finished animation without repeating reference generation. The parent-folder scanner ignores `generated` and `generated-N` output folders, `references`/`refs` directories, and media named `references.*`, preventing previous outputs or guides from becoming drawing inputs. Select a generated package itself if that is your new input folder.

## Browser and mobile saving

Browsers with [directory-writing support](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker) ask for folder access once when you choose the source or destination. The app then saves each result there automatically. HTTPS or localhost is required.

Other browsers use a folder-upload picker or **Choose files** and automatically download one `animations.zip`, containing successful scenes and `batch-report.json`. **Download results** retries that download. There is no separate save action per scene. ZIP batches are limited to 128 MB; use smaller batches or a browser with writable folders for larger output. Mobile file pickers vary, so manual selection remains available. Physical iPad/Procreate testing is still required; desktop Chromium tests cover the narrow-screen layout and ZIP fallback.

## Browser automation / AI agents

The built app exposes `/pipeline.mjs`, an ES module using the same parser, speech engine, drawing importer, and exact-frame renderer as the UI. Run it in a browser with WebGL and WebCodecs, from the app's origin. It performs no server requests for scene processing and does not need editor clicks.

```js
const api = await import('/pipeline.mjs');
const jobs = await api.discoverJobs(api.entriesFromFiles(selectedFiles));

for (const job of jobs) {
  // outputRoot is a directory handle selected with a user gesture.
  const writer = await api.createOutputWriter({job, root: outputRoot});
  try {
    await api.processSceneJob(job, {
      mode: 'auto',
      referenceFormat: 'both',
      emit: (name, blob) => writer.write(name, blob),
      onProgress: ({phase, progress}) => console.log(phase, progress),
    });
    await writer.close();
  } catch (error) {
    await writer.abort();
    console.error(job.path, error);
  }
}
```

For browser automation without a native folder picker, pass `File` objects and collect emitted blobs, then save them through the automation host. `readDirectory(handle)` returns entries with source handles; `createOutputWriter({job})` then saves beside the scene automatically. An `AbortSignal` is accepted by directory reading, discovery, output writing, and each rendering operation.

Lower-level exports are `prepareScene(jsonText)`, `attachArtwork(scene, files)`, `renderReferences(scene, {format, emit})`, `renderAnimation(scene)` (returns an MP4 `Blob`), and `sceneJSON(scene)`. Reference formats are `mp4`, `png`, and `both`. Use `prepareScene(text, {newReferences: true})` when deliberately generating a new reference set from edited JSON. Keep the original handoff for returned artwork so mismatched drawings are detected.
