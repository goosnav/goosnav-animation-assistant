# Goosnav Animation Assistant

Make a small library of drawings for a talking-character clip. Set a fixed camera, write dialogue, rehearse with the robot voice, then trace only the distinct mouth/pose pictures. Bring your drawings back and the app repeats them at the original timings.

Everything renders on your device. The hosted app needs static files only: no animation server, AI subscription, or external speech API. English speech and its phoneme timings come from the bundled Flite WASM engine. The six mouth poses are stylized references, not facial motion capture; the default robot audio and mouth timing are generated together. An optional voiceover follows that timing.

## Characters

Choose any character for A or B on **Stage**. The original actors come from the 3D comic engine. The v12 people come
from [goosnav-3D-assets](https://github.com/goosnav/goosnav-3D-assets):

- **Guy v12** and **Guy v12 (beady)**: the v10 guy iterated.
- **Fat guy** and **Fat guy with glasses**: from Book Two.
- **Little Billy v2**: from his Goosklerf card.

These five talk like their 3D-asset versions. Each of the six mouth references is baked from the real puppet jaw,
lip shapes and tongue, and the head tips back a little as the mouth opens. Their actors are rebuilt with
`scripts/export_v12_app_actors.py` in that repository.

## Staging and drawing guides

**Held pose → Hands on hips** places the palms against the waist with elbows out. **Sitting** bends the legs, plants the feet, and rests the hands on the lap. Choose a **folding metal chair**, **wooden chair**, or **wooden stool** under **Chair when sitting**. The chair fits the character and appears automatically in previews and reference exports whenever that character sits. Arm actions can lift the hands from the resting pose.

**Expression** sets a character's head/body attitude; individual dialogue lines can override it while speaking. Speech continues to control the mouth shapes.

New two-character scenes stand at **−0.45 / +0.45** and face inward at **+60° / −60°**. **Two shot** restores that staging after Solo; **Reset** changes only the camera. Saved scenes keep their existing turns.

The **Backdrop** selector uses current Goosnav environment assets: the black-pyramid sunset, red-mesa canyon, space, Backrooms, overgrown courtyard, reading hall, and Threshold. These are bundled local assets with their actual artwork, not procedural substitutes. The distant desert panoramas rotate with the camera; nearby geometry supplies perspective. **Over A / Over B** frames the other character over a foreground shoulder. Backdrops stay still across mouth drawings, so you can trace the background once and reuse it.

**Reference grids → Ground / Backdrop** adds half-unit grid lines to the 3D preview and reference exports. Enabling a grid selects Perspective. **Three-point** sets an angled, tilted perspective camera and turns on both grids. Ground and wall lines converge toward their true X/Y/Z vanishing points. Offscreen points have directional arrows; a level or cardinal camera correctly marks parallel directions with ∞. Floor and wall meet at the same rear edge; the dashed horizon appears when it falls inside the image. Choosing Orthographic turns the reference grids off. Switching grids preserves your drawing assignments and speech. Hide the reference layers, including grids and sound labels, in Procreate; the final exporter adds neither. Changing the actual backdrop changes the scene and requires fresh drawings.

## Keyframes, gestures, and objects

The workflow is **Scene → Speech → Animation → Draw → Export**. Generate dialogue first to establish its timing, or choose **Silent clip** in Animation and enter a duration. Silent clips need no dialogue or recording.

In **Animation**, choose a character or object, scrub to a time, adjust its sliders or numeric fields, and tap **Set keyframe**. Tap a key to edit it; **Key time** retimes that key. **Discard pose** abandons an unsaved adjustment. Changing target, selecting another time/key, leaving Animation, or downloading a backup saves the pending pose. Retiming a selected key preserves its current edits. Undo restores motion edits without discarding unchanged speech. The preview stays in 3D while posing, even after drawings are imported.

The **Action** menu offers the full current comic-engine action/gesture catalog in grouped menus: gestures, book actions, paired actions, and cartoon stunts. This includes flailing, crying, windmills, rubber-hose poses, high-fives, handshakes, punches, nose-touching, opening/turning/throwing the book, head spins, flattening, explosions, ragdoll, helicopter, and goose chase. Choosing an action prepares its entire motion, including intermediate drawings; you do not need to set its keys manually. Tap **Add action** to apply it immediately, or continue to **Draw**, play, change character/time, or save a backup to apply the selection automatically. **Discard selected action** cancels it. The selected action is applied once, and invalid settings keep you in Animation with an explanation. All actions become editable keys, with exaggerated silhouettes and authored anticipation/holds. Set **Action duration** before insertion; **Strength** adjusts gestures and stunts. Paired actions require two visible characters. Book actions add a book when needed; goose chase adds its goose. The source catalog is adapted from `3D-comic-engine` commit `7d9a08d`; the app has no runtime dependency on that checkout. **Drawings per move** chooses 3, 5, or 9 sampled poses with eased timing. Mouth changes can add combinations; the drawing counter shows the actual tracing workload. **Auto** requests one wipe drawing only for a large rapid change. **Ease**, **Hold / cut**, and **Wipe** provide explicit control. Wipe references carry a red **WIPE FRAME** instruction at the bottom; sound labels remain at the top right. Neither is added to the finished animation.

**Walking** inserts a repeatable cycle with controls for steps, step length, steps per second, direction, and walking in place. Direction uses world heading: 0° forward, +90° right. Contact/down/passing/up poses use held drawings by default; the four-step in-place default needs 12 unique drawings, including start and settle. Traveling changes the composition and needs more drawings. Legs oppose the arms; planted feet use a joint solver. Editing a thigh, knee, or foot takes manual control of that pose. Individual walk keys can be retimed or changed to Ease for more in-betweens.

Under **Scene → Objects**, add the actual Goosnav book, a goose, or a cube, sphere, or triangular prism. Set dimensions, position, rotation, and color; attach an object to either hand to follow its joints. Object transforms can also be keyed in Animation. Shoulder, elbow, wrist, finger, leg, head, and body controls are available. Book opening and page turn can be keyed, as can cartoon scaling and rotation effects. Opening, turning, reading, holding, closing, and slamming also work on hand-attached books without altering earlier frames. Place and Throw require a world-placed book; an attached book is left intact with a short instruction to change Attach to World. Book artwork comes from the current asset library and is not recolored by the primitive color control.

Retiming can reuse drawings when the sampled poses stay the same. Changing poses, adding objects, or introducing new speech/motion combinations may require fresh references. A last key extends the clip enough to show its destination pose; shortening past existing keys asks you to move or remove them first. **Clear** restores all defaults while keeping the previous clip in Saved clips.

## Set up a clip from JSON

Use **Load JSON** to configure characters, chairs, camera, dialogue, expressions, timed actions, and drawing density from one file. Speech is generated automatically; silent scenes are ready immediately. **Export JSON** saves the current setup and editable motion keys, including GUI changes. **Example JSON** downloads a working conversation recipe. Invalid files leave the current scene intact.

See the [configuration guide](docs/config.md) and [speech](examples/speech-scene.json) / [silent animation](examples/silent-scene.json) examples. JSON contains the editable setup; use a project ZIP backup to retain drawings and recorded audio.

## Start locally

For development, install Node.js 22.12 or newer, then:

```sh
npm ci
npm start
```

Open **http://127.0.0.1:8793**. This serves the same static application as Cloudflare and saves clips in the browser. `PORT=8794 npm start` selects another port. Re-run the build after source edits.

For the Python local persistence adapter, run `npm run build`, then `python3 app/src/local_server.py`. It opens your browser, binds to loopback, and keeps portable clip archives outside the checkout. It chooses a free port if 8793 is busy. Quit with the **Quit local app** button.

Native customer launchers use a managed Python runtime and require no Node or Python installation. Packaging and current platform evidence are in [tools/LOCAL_BUILD.md](tools/LOCAL_BUILD.md). The universal release is not yet accepted: platform launch tests remain outstanding.

## The iPad workflow

1. **Scene:** choose one/two characters, held pose, and camera. Portrait Reels is the default; landscape is available. Orbit with one finger, pinch to zoom, two fingers to pan. The camera stays fixed during the clip.
2. **Speech:** write each speaker's lines. Generate, play, adjust speech speed and pauses. Bodies hold still unless you explicitly add acting. Scrub to fix an individual mouth hold if needed.
3. **Animation:** add any gestures or keyframes against the established dialogue timing. For animation without speech, choose Silent clip and set the duration here.
4. **Draw:** tap **Create references**. The silent 24 fps MP4 contains each required drawing once. Choose **Save to Photos** or **Download MP4**. Each reference has a top-right mouth-shape label: A, E, EE, O/U, F/V, or M/B/P (closed lips, also used for rest). Two-character scenes label both A and B. Labels appear on PNG, MP4, PSD, and contact-sheet references. Save a project backup before moving devices; it stores the reference order.
5. In Procreate’s Gallery, tap **Photo** (Photos) or **Import** (Files) and choose the MP4. Confirm all reference frames imported. Trace above each reference and group the two layers as one animation frame. Duplicate your base drawing to reuse the body/background, then change the mouth or pose. Hide the reference layers, including their sound labels, before export. The final renderer adds no reference labels; anything left visible in your drawn video is part of that artwork. Keep one drawing per reference in the original order, without holds, extra frames, or ping-pong loops.
6. Choose **Actions → Share → Animated MP4 → Max Resolution** in Procreate. Different export resolutions are resized to the scene automatically; different proportions are fitted without cropping. This short video carries your drawings; it does not need the finished dialogue timing.
7. Back in **Draw**, choose **Upload drawings**. The app extracts the actual video frames in display order and assigns them to the saved mouth/pose references. It rebuilds the animation by repeating those drawings at the dialogue’s phoneme timings. Tap a numbered drawing to inspect it. Failed or cancelled imports preserve existing artwork.
8. **Export:** tap **Export animation**. Robot voice is selected automatically. The **Speech speed** slider regenerates audio and mouth timing together while reusing the drawings. Record a voiceover only if you want one. Save the finished MP4 to Photos or Files.

For example, a ten-second scene with six unique drawings transfers as a six-frame MP4. You draw six frames, upload one video, and the app rebuilds ten seconds of animation. A typical static two-speaker clip needs at most **11 distinct drawings**, regardless of how often those mouths repeat. Optional head or pose changes add drawings. **Blink in the pause** adds a brief closed-eye drawing during that line’s pause. Repeated blinks at the same pose reuse one additional drawing per character; zero-pause lines do not blink. Blinking is off by default. **Smear pose change** is also optional: choose a held pose or head turn for a line, then enable it to add single-frame stretched in-betweens into and out of that pose. References mark these drawings **SMEAR**. Repeated or reverse moves reuse a drawing when the pose and mouth match. Unchanged poses add no smear; speech timing stays fixed. The app warns above 23; keep shots short, around 5–15 seconds. Drawing videos support up to 100 frames and returned files up to 150 MB. Procreate’s layer limit depends on your iPad and canvas size, so an unusually large reference library may not import completely.

The transfer frame rate is independent of the final animation. The reference video uses 24 fps; a returned video at another frame rate also works if it preserves exactly one encoded frame per drawing. The app does not guess at extra, missing, or duplicated frames. If import reports a mismatch, remove holds/extra frames and re-export Animated MP4. Matching frame counts cannot prove that the artwork came from the right project or is in the right order: use the latest reference set and check the numbered previews.

Animation timing and finished MP4 output use 24 fps. Older saved projects migrate to 24 fps while keeping their drawing identities. Changing speech speed clears manual mouth corrections because their original timestamps no longer match the speech. Older browsers using the final-video real-time fallback may have variable frame timestamps. Drawing-reference videos require exact encoding and never use that fallback. Encoding and extraction run locally using WebCodecs; if unavailable, update iPadOS/Safari or use the image alternatives.

Retiming reuses existing artwork. If the required drawing set changes (camera, character, pose, or new mouth states), export a new reference video or restore the original scene before returning artwork. The latest exported reference set is saved in the project, survives browser reloads, and travels in project backups. Duplicate a clip to make the next shot; combine finished shots in your video editor. Multi-scene timelines are deferred.

The same **Upload drawings** control accepts images: tap them in reference order to assign numbers. PNG ZIP, layered PSD, and contact sheet exports remain under **Other formats**. Uploaded videos always supply drawing frames; there is no finished-video passthrough. Saved projects from the older passthrough importer attempt frame extraction on restore and keep their original source if recovery fails. Upgrading old 6 fps timing may reveal a short mouth shape that was previously skipped. Existing drawings are retained; any additional drawings are identified before export.

Official Procreate instructions: [import a video from Photos or Files](https://help.procreate.com/articles/zynnkd-how-to-import-video) and [export Animated MP4](https://help.procreate.com/procreate/handbook/animation/animation-share). The website cannot silently save into Photos; use the iPad share sheet or Files.

## Publish on Cloudflare from GitHub

First push the application source to the repository's `main` branch. Cloudflare cannot build an empty GitHub repository: a failure at **Cloning repository / fetching repository**, before npm runs, must be fixed at the Git checkout step. The deployed branch contains the runtime asset snapshots, not the development-only reference submodules.

For **Workers Builds** (the dashboard with a deploy command), use:

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Root directory | `/` |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Build variable `NODE_VERSION` | `22` |

The root `wrangler.jsonc` publishes `dist/` as static Workers Assets. Dependency installation runs before the build command. Add `animation.goosnav.shop` under the Worker's **Settings → Domains & Routes** after a successful deployment. See [Cloudflare's static-assets guide](https://developers.cloudflare.com/workers/static-assets/get-started/).

The following is the alternative **Pages** deployment route; it does not use the Workers deploy command.

Build with `npm ci && npm run build`; publish **dist/**. The build includes the character snapshots and speech engine, so deployment does not need Git submodules or a running backend.

The included `.github/workflows/deploy.yml` uses GitHub Actions to deploy to an existing Cloudflare Pages project. Create that project and set:

| GitHub setting | Value |
| --- | --- |
| Repository variable `CLOUDFLARE_PAGES_PROJECT` | Your Pages project name |
| Secret `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID |
| Secret `CLOUDFLARE_API_TOKEN` | Token scoped to that account with Cloudflare Pages Edit |

The workflow runs on pushes to `main` or a manual dispatch. It stays disabled until the project variable is present. Alternatively, connect GitHub directly in Pages with framework **None**, build command `npm run build`, output directory `dist`, and Node 22. Set `SKIP_DEPENDENCY_INSTALL=1` and use `npm ci && npm run build` if you want the build command to own dependency installation. The Actions path explicitly skips submodule checkout and is the simplest route when reference submodules are private.

After the first deployment, add **animation.goosnav.shop** in the Pages project's **Custom domains** section and follow Cloudflare's DNS setup. Do not point DNS at a nonexistent project. See [Cloudflare's static-site guide](https://developers.cloudflare.com/pages/framework-guides/deploy-anything/) and [custom-domain instructions](https://developers.cloudflare.com/pages/configuration/custom-domains/).

`wrangler.jsonc` also supports a static Workers Assets deployment if preferred. Choose one deployment route. No account credentials are included, and no live domain has been deployed by this build.

## Storage and compatibility

Hosted clips use IndexedDB on the current browser/origin. Clearing website data can remove them. **Project → Save backup** downloads a portable archive with scene, timings, drawings, and sound; open it on another device. Saved clips and duplicate scenes stay on the current device. Local launchers store files under `GoosnavAnimationAssistant` in the platform application-data directory.

Use HTTPS on iPad for native sharing and microphone access. Keep the app in the foreground while recording or using real-time video export. MP4 support is tested on the current browser before export; unsupported codecs produce a visible error rather than a mislabeled WebM. Physical iPad Safari, Photos, and Procreate testing is still required; Chromium viewport tests do not establish iPad support.

## Source layout

- `app/src/`: clip planner, speech, 3D stage, image/video adapters, persistence, and UI.
- `app/assets/`: the thirteen runtime character snapshots (eight comic-engine actors, five v12 people) and provenance manifest.
- `app/launcher/`: managed local bootstrap and product manifest.
- `tools/`: static build, development server, icons, and native packaging.
- `tests/`: domain, real speech, archive, local-server, and browser round-trip checks.
- `dev/`: private design decisions, implementation ledger, and review evidence; intentionally Git-ignored and never shipped.
- `submodules/`: supplied source references; not required at runtime or in CI.

Run `npm test`, `python3 -m unittest discover -s tests -p '*_test.py'`, and, with the development server running, `npm run test:browser`. Install Chromium with `npx playwright install chromium` before the browser checks. The verification workflow performs these checks and uploads the static build.

Character provenance and dependency licenses are in [NOTICES.md](NOTICES.md).
