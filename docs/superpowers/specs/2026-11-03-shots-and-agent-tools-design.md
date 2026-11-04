# Multi-shot films and visual agent tools

The user wants ordered close/wide/close scenes to become one drawing-template MP4 and one finished animation with synchronized dialogue. They also authorize useful agent-interface improvements, provided the human editor remains coherent and agents can inspect actual images rather than infer composition from parameters.

## Decisions

Keep the existing local Three.js/Flite/WebCodecs stack and scene JSON format. Introduce a versioned sequence document containing ordered shots, each with its existing scene config and handoff. One shot still uses the existing editor and exports. Multiple shots share a canvas orientation and 24 fps and join by exact hard cuts. Each shot retains its own actors, camera, dialogue, keys, audio and drawing identities. Concatenate samples at exact shot frame boundaries; do not concatenate already-encoded videos.

An exported sequence records global reference order explicitly using shot IDs and drawing IDs. Drawings are distinct across shots even when IDs/visual states match. Reordering shots may change playback but must not change the meaning of already-returned drawing frames. New states require new references. Unknown/removed identities must fail explicitly, never shift subsequent assignments. Reference MP4s contain each required drawing once in that global order, with shot/drawing labels; final playback repeats them at each shot's original exposure timings. Numbered PNGs are the alternative above the existing 100-drawing MP4 transfer limit. Bound sequences to 20 shots, 600 seconds, 2,000 drawings and 5 MB JSON. These are implementation choices, not user-specified values.

## Human editor

Add a compact horizontal shot strip above the existing Scene/Speech/Animation/Draw/Export steps. Add, duplicate, rename, reorder and remove shots there. The selected shot owns the normal scene/dialogue/animation controls and preview. The film title stays separate from the shot name. Draw and Export operate on the whole film when it has multiple shots and say so explicitly. Reference galleries identify shot boundaries. Preserve the current single-shot UI behaviors and selectors. Keep Batch as a separate workspace; each folder may now contain a single scene or a sequence JSON. Opening sequence JSON with returned media restores the entire film. Autosave and backups preserve every shot and its recordings/artwork, with one stable saved-film identity.

Use one orientation across the film; changing format in the editor updates all shots and invalidates incompatible references. Prevent removing the last shot. Removing a shot is reversible through an immediate undo action; do not silently delete a saved film. Playback across shots is available in Draw/Export; editing preview remains local to the selected shot.

## Agent tools

Research supports a small set of task-oriented operations, strict parameter contracts, compact structured feedback and image results. Provide a separate discoverable agent workspace and browser module, sharing the same render/config/sequence pipeline. Do not require an AI service or model subscription. Include current catalogs/ranges, validated document inspection, precise JSON edits, framing helpers, rendered PNG previews and a shot contact sheet. Return actual viewable image data/URLs together with shot IDs, timestamps, drawing IDs and useful composition diagnostics (such as actor/head visibility). Diagnostics are aids, not proof of artistic quality. A preview-review-edit loop is documented and tested; no claim that an arbitrary agent necessarily looks at the images.

The agent page offers a JSON editor, validate/preview actions, visible image results, export/import to the human editor, and a concise tool guide. No hidden production-state mutations: working drafts in that page remain separate until the person/agent opens their JSON in the editor. Invalid edits leave the last successful preview intact. Bound preview dimensions/results; release image/WebGL resources. Keep the human editor free of agent-specific controls except a link in Project.

## Shared engine interfaces

`sequence-config.mjs`: strict parse/detect for format `goosnav-animation-sequence`, version 1, id, title, shots `{id,title,config}`, optional global handoff. Existing config format stays accepted independently.

`sequence.mjs`: `prepareSequence(text, options)`, `assembleSequence({id,title,shots,handoff})` where each shot is `{id,title,scene}` with a normal prepared scene; `sequenceJSON(sequence)`, `attachSequenceArtwork(sequence,files,options)`, `renderSequenceReferences(sequence,options)`, `renderSequenceAnimation(sequence,options)`. Prepared sequence exposes kind, id, title, shots, fps, width/height, totalFrames/duration, drawingSlots, exposures and handoff. Drawing entries include shotId, slotId and state; global id is shot-qualified. Frame ranges use exclusive ends. Per-shot recording media remains in its scene state.

Root integration provides document dispatch for editor/batch and public pipeline exports. Agent workspace consumes these same interfaces. Browser rendering produces actual PNG/MP4 artifacts.

## Verification

Three speech shots: A close-up, A+B wide with both speaking, B close-up. Verify one carrier includes all unique drawings and labels; color-coded returned artwork maps to correct shots/mouth states; final decoded frames/cut boundaries/duration/audio match an independent fresh-browser reconstruction. Cover reordered shots after reference export, reused local IDs across shots, wrong counts, malformed manifests, cancellation, atomic imports, persistence/backups, recordings and single-shot regressions. Validate desktop/tablet/narrow layout and actual rendered agent PNGs, plus structured errors and precise framing edits. Run full existing tests and independent code review before commit/push. Preserve pre-existing staged submodule registrations.

## Research

- Anthropic, Writing effective tools for agents: https://www.anthropic.com/research/writing-tools-for-agents — focused tools, concise actionable context and evaluations.
- Playwright MCP snapshots: https://playwright.dev/mcp/snapshots — combine structured accessibility state with screenshots for canvas/image-heavy applications.
- MCP tools: https://modelcontextprotocol.io/specification/2025-06-18/server/tools — explicit schemas, structured results and actual image content. The browser module uses these design principles without adding a network MCP server.
