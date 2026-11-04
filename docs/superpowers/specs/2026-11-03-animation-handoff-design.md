# Portable animation handoff and batch generation

The user needs identical finished animation whether the same artist creates the scene and draws its references, or a collaborator/AI creates the scene and another artist returns drawings on a different device. JSON is both editable source and the portable bridge. Existing JSON loses the reference manifest; video import currently requires that manifest in local project storage.

## Product behavior

- Keep the existing scene/speech/animation/draw/export editor. Add a compact Editor/Batch switch, not another step in the sequential editor.
- Export JSON includes editable parameters plus, when timing exists, ordered reference identities and timing metadata. Loading that JSON reconstructs the mapping without generating reference pictures first. Plain recipe JSON remains accepted and editable.
- Manual loading accepts JSON with either one drawing MP4/MOV or numbered images, together or in successive selections. Matching artwork attaches automatically and goes to Export. GUI edits are reflected in exported JSON.
- Batch accepts a scene folder or a parent containing scene folders. A folder with a scene JSON is a job; nested artwork/reference directories belong to that scene. Detect each scene independently and report ambiguous/missing inputs. Deterministic numeric image order; reject duplicate/missing indices, mixed image/video inputs, or ambiguous JSONs instead of guessing.
- JSON only produces a reference package (scene.json, references.mp4 and/or reference PNGs). JSON plus returned artwork produces animation.mp4 and editable scene JSON. Offer Auto / References / Animation and MP4 / PNG / Both reference format choices. Generated outputs are excluded from input detection on subsequent runs.
- Desktop folder access: choose source once with write permission; default output is a generated subdirectory within each source scene, preserving inputs. Optional output directory mirrors job paths. Never overwrite existing output files silently; create a unique generated run directory. Write files as jobs finish; failures do not stop other jobs. Cancellation stops the queue and closes/aborts active writes.
- Browsers without external-directory writing accept folder uploads or selected files and automatically download one ZIP containing successful results and a batch report. Offer one download retry; no per-file saving loop. Do not promise unrestricted mobile file-system writes.
- Batch jobs run sequentially and release render/media resources per scene. A compact results list shows ready/running/saved/error/cancelled and path/error. Batch operations do not replace the active editor project.
- A public browser module pipeline permits AI automation using the same validated JSON and artifacts; document the folder layout and JSON contract with examples.

## Choices made for implementation

Use the existing local-only JavaScript/Three.js/Flite/WebCodecs stack, no backend or new service. Use File System Access API where present, webkitdirectory/file input fallback elsewhere. JSON contains settings and reference metadata; uploaded personal audio/drawings remain media. Generated robot speech is reconstructed deterministically and timing incompatibility must be detected rather than silently assigning wrong drawings. Preserve existing backup ZIP behavior.

## Acceptance

Two independent browser contexts (no shared storage) produce identical exposure/frame ordering from exported JSON + returned video/images. Assert actual decoded frames and output duration, not just button state. Prove GUI edits survive JSON roundtrip; JSON-only recipes generate references; source/output folders and nested batches save correctly without overwriting inputs; invalid jobs don't block good jobs; cancellation and unsupported API fallbacks work. Verify at tablet viewport and desktop, run existing test suites and build, and independently review before delivery.
