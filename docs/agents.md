# Visual agent workspace

Open [`/agent.html`](/agent.html) to edit a scene or sequence recipe and inspect rendered PNG images. The workspace is separate from the human editor. Its **Open in editor** button imports the accepted recipe into the normal workflow; **Download JSON** produces a portable recipe.

No remote AI service, API key, shell execution or model subscription is involved. Rendering requires a browser with WebGL. The existing local speech and scene/sequence pipeline supplies the animation states.

## Default task

Read [/AGENTS.md](/AGENTS.md) first. Unless the user gives a different task, develop or use their script, compose one scene or a film, inspect actual rendered images, export reference MP4 plus matching JSON, and verify the files were saved to their requested cloud/computer folder. Save locally when no destination is specified. These defaults cover creative direction, animation workload, complete motion, and delivery; the artist returns their drawings later for final assembly.

The full guidance is also in `/llms.txt`, the nonvisual `#agent-workflow` JSON element on both entry pages, `capabilities().workflow`, `agentInstructions()`, and the `instructions`/`help` commands. `status()` points to the same instructions without repeating them on every poll. Reading instructions never starts generation or uploads files.

Default to **Reels, 1080 × 1920 (9:16)**: `scene.format: "portrait"` in every shot. Use landscape when the user asks. Frame the cast large and centered; minimize negative space and balance the top/bottom and left/right margins. Keep the intended poses, heads, hands, feet and required props within the drawing area throughout the action. Start with a body camera fit (default 5% padding), inspect the pixels at motion extremes, then adjust staging and camera for a stable shot.

## Discover before editing

```js
const api = await import('/agent-api.mjs');
const catalog = api.capabilities();
```

The catalog includes accepted model IDs, poses, backdrops, emotions, mouths, chairs, prop kinds, actor/prop channel ranges, camera ranges, actions with their parameters, commands and resource limits. Model IDs and action/channel definitions come directly from the app's current engine. Use actor indices `0` (A) and `1` (B); preserve their identity when composing shots.

The module exports:

| Operation | Input | Result |
| --- | --- | --- |
| `capabilities()` | None | Default workflow, catalog, command contracts and limits |
| `agentInstructions()` | None | Default creative, reference-export and verified-delivery workflow |
| `sampleDocument()` | None | Valid, silent two-actor JSON text |
| `inspectDocument(text)` | Scene or sequence JSON text | `{ok, kind, title, shots, warnings}` or structured errors |
| `editDocument(text, operations)` | JSON text and 1–100 set operations | Validated new `text`, `changedPaths` and inspection |
| `previewDocument(text, options)` | JSON text and rendering options | Promise of `{ok, images, contactSheet, warnings}` |
| `frameDocument(text, options)` | JSON text and framing options | Promise of validated `text`, camera, framing metadata and warnings |
| `createAgentWorkspace({text?, onChange?, onResult?})` | Optional initial recipe and callbacks | Stateful controller with the operations below |

Operations return `{ok:false, errors:[{code,message}]}` for malformed documents, unknown parameters, out-of-range values and rendering failures. A cancelled operation uses error code `CANCELLED`. Errors are bounded, and rejected edits do not return a partially changed document. The controller constructor requires valid initial text and throws if it is invalid.

## Render, look, edit, compare

```js
let text = api.sampleDocument();
const inspection = api.inspectDocument(text);
if (!inspection.ok) throw Error(inspection.errors[0].message);

const options = {samples: [{time: 0}], maxDimension: 384};
let preview = await api.previewDocument(text, options);
if (!preview.ok) throw Error(preview.errors[0].message);

// Display or pass the actual PNG to an image-capable agent.
const image = document.createElement('img');
image.src = preview.images[0].dataURL;
image.alt = preview.images[0].label;
document.body.append(image);

// After inspecting the image, make a precise edit.
const edit = api.editDocument(text, [
  {op: 'set', path: '/scene/actors/1/headYaw', value: 20},
  {op: 'set', path: '/scene/camera/zoom', value: 1.4}
]);
if (edit.ok) {
  text = edit.text;
  preview = await api.previewDocument(text, options);
  image.src = preview.images[0].dataURL;
}
```

View the returned image pixels, then compare the same shot/time before and after editing. Check head size, facial orientation, eyelines, overlap, limbs, held props and the intended composition. Metadata alone is not evidence that an image looks right. The page automatically displays successful preview results, including calls through `window.animationAgent`.

`dataURL` is an actual `data:image/png;base64,...` image. To send it as MCP-style image content, remove the prefix and use `{type:'image', mimeType:'image/png', data:<base64>}` in your own integration. No MCP server is installed by this app. For a Blob in the browser, use `await (await fetch(image.dataURL)).blob()`.

## Preview contract

```js
await api.previewDocument(text, {
  samples: [
    {shotId: 'a-close', time: 0},
    {shotId: 'wide', time: 1.2},
    {shotId: 'b-close', time: 0.5}
  ],
  maxDimension: 640,
  contactSheet: true,
  signal: abortController.signal,
  onProgress: ({phase, progress}) => { /* 0–1, phase-specific */ }
});
```

- `samples`: 1–12 entries. `shotId` is required for a multi-shot document; the single-scene ID is `scene`. `time` defaults to zero and must be within the selected shot's duration. At the exact duration, the last drawing is used. Omit `samples` for the first frame of each shot, up to 12 shots; a warning identifies truncation.
- `maxDimension`: integer from 128 to 1024, default 640. The other dimension follows the scene's orientation.
- `contactSheet`: boolean, default true. Two or more images produce an additional labelled PNG contact sheet. It is limited to 8 million pixels.
- `signal` and `onProgress` are optional browser API arguments. The command console accepts JSON arguments; use its `cancel` command for cancellation.

Each frame contains `shotId`, `title`, shot-local `time`, `globalTime`, zero-based local `frame`, `drawingId`, `label`, `mimeType`, `width`, `height`, `bytes`, `dataURL` and `diagnostics`. Sequence drawing IDs are shot-qualified. Without a saved drawing handoff, fresh preparations may allocate new drawing IDs; compare shot/time and pixels across recipe edits. Existing handoffs retain their valid identities, and a change that requires new references is reported.

Diagnostics report:

- Actual visible actor and head pixel counts from a depth-tested flat-color pass of the posed meshes, including occlusion by actors and scenery. Antialiased edge pixels are excluded; head counts use the model's head meshes.
- Normalized projected bounds of visible posed model geometry: left/top/right/bottom use image coordinates with `(0,0)` at the upper left. Values outside `[0,1]` indicate framing beyond the image edge. Hidden effect groups are excluded; bounds are `null` when that region has no visible geometry, such as a head replaced by an explosion.
- A visible flag and a cropped-bounds flag for the actor and head. These measure different things: overlapping actors can have on-screen bounds but no visible head pixels.

Diagnostics do not grade image quality, expression, facing direction, attractiveness or readability. A bounding box may be conservative for a rotated pose. Inspect the PNG to judge composition. Preview renderers, transient images and canvases are released after each job; the controller retains only its last successful result.

## Precise edits and framing

Edits use JSON pointers with `op: 'set'`. An existing parent is required; a missing leaf may be added if the scene schema allows it. For example, set `/scene/camera` to an object when a partial recipe has no camera field. Replace an entire array to add or remove entries. Array indices must be canonical and in bounds. Unknown fields, prototype-related keys, non-JSON values, excessive nesting and invalid ranges are rejected atomically by the shared strict parser.

For a sequence, target the nested recipe, for example `/shots/2/config/scene/camera/zoom`. Check the shot ID before editing a positional path. Reorder the complete `shots` array with its stable IDs when needed. Structurally valid additions/removals remain editable when an exported handoff becomes stale; inspection and preview warn that new drawing references are required. Malformed handoff metadata is still rejected. The production artwork-import path remains strict about drawing identities; generate new references before attaching artwork to the changed film.

```js
const fitted = await api.frameDocument(text, {
  shotId: 'b-close', // omit only for a single scene/shot
  actors: [1],      // default: every visible actor
  region: 'head',   // 'head' or 'body'; default 'body'
  padding: 0.05,    // fraction per edge, 0–0.35
  time: 0          // shot-local pose to measure
});
```

Framing measures the actual posed model geometry, sets a front camera, and fits the selected actors' heads or bodies. It preserves the projection type, actor indices, models, positions, count, dialogue and animation. Camera ranges still apply; the result warns when their limits constrain the fit. Render the result to review it. For other views, set exact camera azimuth/elevation/target values directly. Framing actor B never remaps B's dialogue to A.

## Small command interface

On the workspace page, the collapsed **Commands** panel and `window.animationAgent.command(...)` operate on the same accepted document and rendered results. This is an allowlisted app command language, not a shell or JavaScript evaluator.

| Command | Example |
| --- | --- |
| `instructions` | `await animationAgent.command('instructions')` |
| `help` | `await animationAgent.command('help')` |
| `status` | `animationAgent.status()` |
| `validate` | `await animationAgent.command('validate')` |
| `preview` | `await animationAgent.command('preview {"maxDimension":384}')` |
| `patch` | `await animationAgent.command('patch [{"op":"set","path":"/scene/camera/zoom","value":1.5}]')` |
| `frame` | `await animationAgent.command('frame {"actors":[1],"region":"head"}')` |
| `exportJSON` | `await animationAgent.command('exportJSON')` |
| `cancel` | `await animationAgent.command('cancel')` |

Structured equivalents use `{command:'preview', options:{...}}` or `{command:'patch', operations:[...]}`. Other commands use `{command:'status'}`, for example. Unexpected keys and arguments are rejected. Command strings are limited to 100 KB. JSON text is supplied through `animationAgent.load(text)` or the page's editor/import controls, not through an unbounded shell command.

`status()` returns `revision`, `busy`, `progress`, `errors`, `artifacts` and `previewRevision`. Artifact entries contain identities, dimensions and diagnostics without base64 image bytes. The actual image results are returned by `preview()`/`command('preview ...')` and displayed by the page. This keeps repeated polling small:

```js
// Start a job; keep its promise to receive the actual images.
const job = animationAgent.command('preview {"maxDimension":384}');
const state = animationAgent.status(); // safe to poll from another browser operation
const result = await job;
```

The controller also exposes `instructions()`, `load(text)`, `validate()`, `edit(operations)`, `frame(options)`, `preview(options)`, `exportJSON()`, `cancel()` and `dispose()`. `onChange(status)` and `onResult(result)` callbacks are available on a controller you create yourself. Starting a new render, accepting another document or cancelling invalidates an older pending job. Typing in the page's JSON editor also cancels a pending job, preserving the newer draft. Invalid edits and cancelled jobs keep the last accepted document and successful previews. A preview whose revision differs from the current document is marked stale. Manually editing the text area requires **Validate** or **Preview images** before commands operate on the new text.

## Editor handoff and limits

The page's **Open in editor** button validates the draft, writes one same-tab session storage record, then opens `/?agentImport=1`. The record uses key `goosnav-agent-import-v1` and shape `{version:1, text:<validated JSON>, createdAt:<ISO string>}`. The editor validates again and consumes the record only after a successful import. Merely loading the agent page or using its API does not mutate an existing editor project.

Documents are limited to 5 MB; sequences to 20 shots, 600 seconds and 2,000 drawings. Each shot shares the film's orientation and 24 fps. Scene constraints, speech, drawing identities and production exports remain governed by the same engine as the human editor. Use `/pipeline.mjs` for drawing-reference carriers, artwork import and final animation output.

## Generate references or finish returned artwork

The [sequence guide](sequence.md) documents the complete film contract. Download the [three-shot recipe](../examples/three-shot-sequence.json) as a starting point. Single scenes use the same methods; the pipeline detects the JSON format.

```js
const pipeline = await import('/pipeline.mjs');
const document = await pipeline.prepareDocument(jsonText, {newReferences: true});
const outputs = new Map();
await pipeline.renderDocumentReferences(document, {
  format: 'both',
  emit: async (name, blob) => outputs.set(name, blob)
});
// Persist outputs with the agent's download/file tools, or use the editor/Batch.
// Give the exported JSON and references to the artist.

// Later, on an independent device, use the exported JSON and returned File objects.
const restored = await pipeline.prepareDocument(exportedJSON);
const ready = await pipeline.attachDocumentArtwork(restored, returnedFiles);
const movie = await pipeline.renderDocumentAnimation(ready);
```

An MP4 reference carrier contains each drawing once and supports up to 100 drawings. Use PNG images for larger libraries. The final MP4 restores holds, cuts, mouth timing, and audio. Returned files must preserve the original carrier order; inspect the exported JSON's drawing identities instead of guessing. Reference exports include `scene.json` or `sequence.json`. For automatic destination handling, use Batch or combine `discoverJobs`, `createOutputWriter`, and `processDocumentJob` from the public pipeline.
