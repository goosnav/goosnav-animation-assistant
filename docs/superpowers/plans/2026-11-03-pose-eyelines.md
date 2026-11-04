# Pose and eyeline tools implementation plan

> **For agentic workers:** Use focused parallel implementation for the geometry solver and numeric reset groups; integrate and verify the shared UI/API contracts in the current task.

**Goal:** Let people and agents make believable one-time gaze changes, reset one pose area, and visually review resulting reference frames.

**Architecture:** Keep gaze solving in a renderer-aware geometry module, numeric sections in a shared catalog, and project edits in pure helpers. Main editor and agent commands use the same operations. Existing JSON formats, animation compilation, export order and artwork reconstruction remain compatible.

**Tech stack:** Existing JavaScript modules, Three.js rigs, Node tests and Playwright.

**Spec:** User request in this task: inspect unnatural head poses, require logical poses/eyelines, add a one-click snap and section resets, update agent controls, test and push.

## Constraints and review focus

- Alignment is a one-time edit, never continuous tracking. Use posed face geometry and natural neck limits; accommodate unequal heights, yaw, emotion and sitting.
- Preserve models, positions, hands, props, dialogue, camera, other shots and unrelated keys. Turn body yaw only when necessary and report limitations.
- Resets affect one selected actor/prop section. Scene resets change base offsets; key resets change one pose; explicit timeline resets remove only that area's contributions while preserving animation duration.
- Keep the current JSON schema and stale-handoff warnings. Existing artwork must still be rejected when visual identities change.
- Validate bad targets, unknown sections, coincident gaze points, cancelled jobs and newer draft edits atomically.
- Render actual frames. Numeric bounds and gaze vectors assist review but do not establish that an expression or shot makes sense.

## Tasks

1. **Gaze geometry** — `gaze-alignment.mjs`, calibrated face frames in `stage.mjs`, real-rig browser tests. Export `alignGaze(stage, {actors, target, turnBody})` and `gazeDiagnostics(stage)`; restore temporary rig transforms after solving.
2. **Scoped offsets** — `pose-sections.mjs`, AnimationEditor Reset buttons, unit tests. Export frozen `ACTOR_SECTIONS`, `PROP_SECTIONS`, and fresh `resetSectionValues(kind, section)`.
3. **Pure project edits** — `pose-editing.mjs`, unit tests for base/key/timeline scopes and preservation of unrelated values, keys and clip duration.
4. **Agent controls** — add validated `alignDocument`/`resetDocument`, `align`/`reset` commands and catalog contracts. Reuse cancellation, revisions and stale-preview behavior. Show gaze diagnostics and pose review warnings.
5. **Human controls** — Scene gaze buttons and resets, current-pose alignment in Animation, prop sections, undo/autosave, and compact agent controls with the existing black/green branding.
6. **Directions and verification** — require visual inspection of head pitch/roll, body orientation, target eyelines, hand/prop interactions and action/cut extremes. Test API and GUI operations, exports, cancelled work and handoff compatibility. Commit only task files and push `main`; separately report live deployment status.
