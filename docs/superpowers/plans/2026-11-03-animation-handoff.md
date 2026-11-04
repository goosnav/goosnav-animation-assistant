# Animation handoff implementation plan

Design: ../specs/2026-11-03-animation-handoff-design.md. User request authorizes implementation, verification, and minimal folder/batch workflow. Preserve pre-existing staged submodule registrations.

1. Portable handoff module and config extension: failing regression for JSON losing reference order; implement validation/rebinding/timing preservation; test independent projects and edited configs. Owner: handoff agent, only config/handoff/transfer module/tests.
2. Folder job discovery and output sinks: test nested grouping, ambiguity, numeric order, output exclusion, safe unique directories, sequential failure handling and cancellation. Owner: folder agent, only batch-files module/tests.
3. Shared scene pipeline: parse/generate speech/compile, load returned frames, render references, render final MP4, release resources; integrate handoff contract. Owner: primary.
4. UI: concise Editor/Batch navigation, manual JSON+art input, reference handoff package, automatic output saving and one-ZIP fallback, output location choice, status list. Retain existing selectors/flows where possible. Owner: primary.
5. End-to-end tests: separate browser contexts, video and image handoff, edited config, manual/folder/batch modes, errors/cancellation, mocked real filesystem handle contract plus real media encoding. Update README/config/folder docs.
6. Full build, unit/browser/local-server tests; fresh independent review, fix findings, commit task files and push authorized repository branch/main. Confirm remote.

## Verification and review

Implemented the portable JSON handoff, shared browser pipeline, folder discovery/output writers, Editor/Batch UI, automatic saving, and workflow documentation. MP4 and PNG reference packages carry scene JSON. Returning drawings on a fresh browser does not require local reference generation.

Verification on 2026-11-03:

- `npm run build`: passed.
- `npm test`: 115 passed, zero failures.
- `npm run test:browser`: 35 passed, zero failures. Includes independent-browser decoded video frame order/timestamps/duration and decoded audio sample hashes, image handoffs, JSON edits, source/custom output folders, ZIP fallback, mixed-job failures, cancellation, large image ordering, and recording/pending-edit preservation.
- `python3 -m unittest discover -s tests -p '*_test.py'`: 1 passed.
- `git diff --check`: passed.
- Independent review completed with no unresolved findings. Fixed its four findings: voiceover loss on artwork-only import, inactive drawing identity reuse, large handoff order after retiming, and speech-to-silent JSON imports. Each has a regression test.

Desktop and narrow-screen Chromium were verified. Physical iPad/Safari/Procreate remains a device acceptance check; browsers without writable folder support receive one ZIP. Pre-existing staged submodule registrations are excluded from this change.
