# Goosnav Animation Assistant

Make a small library of drawings for a talking-character clip. Set a fixed camera, write dialogue, rehearse with the robot voice, then trace only the distinct mouth/pose pictures. Bring your drawings back and the app repeats them at the original timings.

Everything renders on your device. The hosted app needs static files only: no animation server, AI subscription, or external speech API. English speech and its phoneme timings come from the bundled Flite WASM engine. The six mouth poses are stylized references, not facial motion capture; final voiceover follows the rehearsal timing.

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

1. **Stage:** choose one/two characters, held pose, and camera. Portrait Reels is the default; landscape is available. Orbit with one finger, pinch to zoom, two fingers to pan. The camera stays fixed during the clip.
2. **Rehearse:** write each speaker's lines. Generate, play, adjust speech speed and pauses. Bodies hold still unless you explicitly add acting. Scrub to fix an individual mouth hold if needed.
3. **Draw:** tap **Prepare drawing-reference video**. This silent 6 fps MP4 contains each unique drawing exactly once, not the complete timed animation. Share it to Photos with **Save Video**, or download it to Files. Save a project backup before moving devices; the project stores the reference set’s frame order.
4. In Procreate’s Gallery, tap **Photo** (Photos) or **Import** (Files) and choose the MP4. Each video frame becomes a layer in Animation Assist. Before drawing, confirm that all reference frames imported (the website shows the expected count). Trace on a new layer above each reference, grouping the drawing and reference as one animation frame. Duplicate your base drawing to reuse the body/background, then change the mouth or pose. Hide the reference layers before export. Keep one visible drawing group per reference, in the original order, with no holds, extra frames, or ping-pong loop.
5. In Procreate, choose **Actions → Share → Animated MP4 → Max Resolution**, at **6 fps**. Keep the canvas dimensions unchanged. The result is a short carrier for your drawings; you do not need to repeat mouths or set dialogue timing in Procreate.
6. **Assemble:** choose that drawn video from Photos or Files. The app extracts its actual video frames in display order, checks the count and dimensions, and maps them to the saved references. It then repeats your drawings according to the dialogue timing. Review the numbered drawings and play the reconstructed animation. A failed or cancelled extraction leaves your previous artwork intact.
7. **Finish:** record the whole voiceover against silent playback, trim/offset it, preview, and export the finished MP4. Share it to Photos.

For example, a ten-second scene with six unique drawings transfers as a six-frame MP4. You draw six frames, upload one video, and the app rebuilds ten seconds of animation. A typical static two-speaker clip needs at most **11 distinct drawings**, regardless of how often those mouths repeat. Optional head, blink, or pose changes add drawings. The app warns above 23; keep shots short, around 5–15 seconds. Drawing videos support up to 100 frames and returned files up to 150 MB. Procreate’s layer limit depends on your iPad and canvas size, so an unusually large reference library may not import completely.

The transfer frame rate is independent of the final animation. Return at 6 fps for consistency; another frame rate also works if it preserves exactly one encoded frame per drawing. The app does not guess at extra, missing, or duplicated frames. If import reports a mismatch, remove holds/extra frames and re-export Animated MP4. Matching frame counts cannot prove that the artwork came from the right project or is in the right order: use the latest reference set and check the numbered previews.

Animation timing runs at 6, 8, or 12 fps; the finished MP4 repeats those poses at 24 fps through the encoder. Older browsers using the final-video real-time fallback may have variable frame timestamps. Drawing-reference videos require exact encoding and never use that fallback. Encoding and extraction run locally using WebCodecs; if unavailable, update iPadOS/Safari or use the image alternatives.

Retiming reuses existing artwork. If the required drawing set changes (camera, character, pose, or new mouth states), export a new reference video or restore the original scene before returning artwork. The latest exported reference set is saved in the project, survives browser reloads, and travels in project backups. Duplicate a clip to make the next shot; combine finished shots in your video editor. Multi-scene timelines are deferred.

Image sharing, numbered image import, PNG ZIP, layered PSD, and contact sheet remain available under the alternatives. The separate **timed rehearsal video** includes the dialogue and repeated frames for playback. **Already animated in Procreate?** imports an independently finished video without reconstructing its timing; its audio is replaced with silence or your new voiceover.

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
- `app/assets/`: the eight runtime character snapshots and provenance manifest.
- `app/launcher/`: managed local bootstrap and product manifest.
- `tools/`: static build, development server, icons, and native packaging.
- `tests/`: domain, real speech, archive, local-server, and browser round-trip checks.
- `dev/`: private design decisions, implementation ledger, and review evidence; intentionally Git-ignored and never shipped.
- `submodules/`: supplied source references; not required at runtime or in CI.

Run `npm test`, `python3 -m unittest discover -s tests -p '*_test.py'`, and, with the development server running, `npm run test:browser`. Install Chromium with `npx playwright install chromium` before the browser checks. The verification workflow performs these checks and uploads the static build.

Character provenance and dependency licenses are in [NOTICES.md](NOTICES.md).
