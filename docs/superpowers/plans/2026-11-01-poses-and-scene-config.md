# Poses and scene config implementation plan

> For agentic workers: execute the independent asset and config modules in parallel; integrate and review in the main session.

**Goal:** Fix hands on hips, provide automatic seated characters and three chair choices, and allow a complete animation setup to be imported/exported as JSON.

**Architecture:** Keep the existing static Three.js application and editable keyed motion model. Add reusable seat GLBs from the asset library, deterministic body-relative contact poses, and a versioned configuration parser that expands named actions into existing keys. JSON contains setup, not drawing/audio binaries; ZIP remains the media backup.

**Tech stack:** JavaScript modules, Three.js, Blender/Python, Node tests, Playwright.

**Spec:** User request in this task, 2026-11-01. Implementation choices: folding metal chair, wooden chair and stool; readable recipe JSON plus lossless export of saved motion; preset emotions through existing rig channels.

## Constraints

- Pull remote main first in both repositories; preserve staged unrelated submodules.
- Validate imports before replacing the current project. Invalid files leave it intact.
- Existing project backups and manually authored animation remain supported.
- Assets require editable Blender sources, GLB exports, previews, deterministic rebuilds and Git LFS upload checks.

## Review focus

- Hands contact hips and lap for both standard and short/wide rigs, across rotations and scales.
- Chairs stay aligned with seated actors, disappear when standing, and appear in exported references.
- Config round trips retain custom keys, dialogue, scene, emotions and timing without duplicate action expansion.
- Invalid configs, hidden actors, excessive sizes and unknown properties produce useful errors without partial replacement.
- Loading speech config generates playable speech/action timing; GUI edits can be exported and reloaded.

## Task 1: Chair assets

- [x] Build folding metal chair, wooden chair, and stool in asset repo with seat surface Y=.45m in GLB, seat centered X/Z=0, forward +Z, floor Y=0.
- [x] Include metadata, editable sources, GLBs and rendered review; verify dimensions/layout and inspect previews.
- [x] Commit and push asset repo only after required checks and LFS verification.

## Task 2: Config module

Files: app/src/config.mjs, app/src/emotions.mjs, tests/config.test.mjs, examples/*.json, docs/config.md.

- [x] Write tests for readable recipes, named timed actions/walks, dialogue emotions and full export/import round trips.
- [x] Implement parseConfig(text) -> validated project; exportConfig(project) -> JSON string. Parse named actions using addGesture/addWalk, preserve exact keys in exports. Reject malformed/oversized data with field paths.
- [x] Add examples and schema documentation; prove invalid input does not mutate callers.

## Task 3: Pose and seat rendering

Files: app/src/stage.mjs, app/src/seating.mjs, app/src/core.mjs, app/src/reference.mjs, tests/poses.browser.mjs.

- [x] Reproduce misplaced hands with measured joint locations, write failing contact tests.
- [x] Implement hips and lap contact targets from each rig's rest dimensions; seat hips and bend knees with feet on floor.
- [x] Auto render selected chair for seated actors, aligned and scaled; invalidate old reference image cache.
- [x] Render and inspect contact sheets for different models/views; test resets and exported references.

## Task 4: Integration and delivery

Files: app/index.html, app/src/app.mjs, README.md, app/assets/manifest.json, tests/config.browser.mjs.

- [x] Add Sitting, chair and emotion controls, Load JSON and Export JSON buttons.
- [x] Parse and generate speech into a candidate state before replacing current project; save previous clip and handle cancellation atomically.
- [x] Browser-test import, playback, reference generation, export and reload; run full unit/browser suites and build.
- [x] Independently review, fix findings, and commit only task files.

Delivery: push main and confirm both remote commits.

## Verification and review

- `npm run build`: passed; runtime asset hashes verified by the build.
- `npm test`: 77 passed.
- `npm run test:browser`: 26 passed, including speech/silent JSON upload, export/reload, invalid-file preservation, cancellation, complete arm-flail references, both-hand contact poses, all three chair types, seated smears/wipes, and mixed-height partner contact.
- Python local launcher test: passed.
- Visual contact sheet inspected across blue, fat v12, Billy v2 and Gooby, front and side views; lap targets refined after visual inspection.
- Independent review identified chair displacement during partner contacts. Regression failed before the fix and passed after; reviewer confirmed no remaining actionable findings.
- Asset repository commit `436a2f985f1c0a975160c97b8a23ba2c90567ba2` pushed and remote verified. Asset rebuild/geometry checks passed; parent independently confirmed Git LFS integrity and layout checks.
- Config explicitly accepts 24 fps, matching the app, so loading cannot silently alter a requested lower frame rate. JSON carries setup; media remains in ZIP backups.
