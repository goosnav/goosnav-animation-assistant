# Shots and agent tools implementation plan

**Goal:** one portable multi-shot animation workflow plus a visual, precise agent authoring interface.
**Architecture:** independent sequence engine and agent workspace reuse the existing single-scene pipeline; the primary editor integrates a shot strip and document dispatch.
**Tech stack:** existing ES modules, Three.js, Flite, WebCodecs, Playwright; no new production dependency.
**Spec:** ../specs/2026-11-03-shots-and-agent-tools-design.md

## Constraints and review focus

Preserve current scene JSON and single-shot behaviors, staged submodules, recordings and backups. Never infer returned-artwork order from current shot order after a reorder. Keep reference and final timing separate. Agent tools must return actual rendered images. Test malformed manifests and mixed formats, shot ID collisions, failed/cancelled imports, pending edits during shot switches, and audio boundaries.

- [x] Sequence engine: failing tests for three shots, global drawing order, strict document validation, reordered shots, audio/frame boundaries; implement sequence-config.mjs and sequence.mjs plus examples and focused tests. Independent owner.
- [x] Agent tools: inspect actual catalogs and render API; failing tests for validation/edit/PNG previews; implement separate agent workspace/module and documentation with preview-review-edit flow. Independent owner; coordinate sequence contract.
- [x] Human editor and persistence: shot strip, active-shot save/restore, overall film save identity, whole-film references/import/export/playback; strict nested backup validation. Primary owner, browser regressions before implementation.
- [x] Batch/build integration: accept both config formats, export sequence functions, ship agent page/discovery docs; retain automatic output semantics. Primary owner.
- [x] Verify: actual three-shot speech carrier and returned-artwork roundtrip on fresh browser, agent visual outputs, narrow layout, full unit/browser/Python checks, independent review. Integration follows verification: commit only task files, push main and verify the remote.

User has already authorized implementation and interface changes. Proceed with the stated design choices; no additional approval gate is needed for reversible implementation work.

## Verification result

The static build, 139 unit tests, 51 browser tests, and one Python local-server test passed. Real decoded multi-shot video/audio matched a fresh-browser reconstruction. Browser checks covered carrier order after shot moves, automatic folder writes, stale-reference regeneration, cancelled imports/agent work, backup/undo preservation, rendered image diagnostics, and phone/tablet layout. Independent review found no remaining material issues after its regressions were corrected. Physical iPad/Procreate testing was not performed.
