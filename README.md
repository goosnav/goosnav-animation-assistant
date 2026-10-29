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
3. **Draw:** prepare the unique references. Tap **Share drawings → Photos**, then use **Save Images** when the iPad share sheet offers it. Smaller batches and single-image sharing are available. A website cannot silently write into Photos or guarantee the share sheet's available actions.
4. In Procreate, draw a clean base scene once. Keep the body/background on separate layers, duplicate the base, and replace only the mouth/head drawing needed for each numbered reference. Export each finished composition as a full-size PNG to Photos. You do not need to lay out all repeated animation frames in Procreate.
5. **Assemble:** choose your finished images in one multi-image import. Tap the thumbnails in reference order. Yellow badges show the authoritative 1, 2, 3 order; tap a selected image again to remove it and renumber. The browser's photo-picker order and filenames are not used as drawing identities.
6. **Finish:** record the whole voiceover against silent playback, trim/offset it, preview, and export MP4. Share the MP4 to Photos. A finished Procreate video can also be imported; its timing is preserved and its original audio is replaced with silence or your new voiceover.

A typical static two-speaker clip needs at most **11 distinct drawings**, regardless of how often those mouths repeat. Optional head, blink, or pose changes add drawings. The app warns above 23; keep shots short, around 5–15 seconds. Animation timing runs at 6, 8, or 12 fps; MP4 repeats those poses at 24 fps through the encoder. Older browsers using the real-time fallback may have variable frame timestamps.

Retiming reuses existing artwork. Changing a camera, character, or pose requires new references for the affected visual states. Duplicate a clip to make the next shot; combine finished shots in your video editor. Multi-scene timelines are deferred.

PNG ZIP, a layered PSD drawing library, a contact sheet, and a tracing video are secondary exports. The PSD contains unique references, **not** a timed Procreate animation. For a finished Procreate animation, see its [official animation export guide](https://help.procreate.com/procreate/handbook/5.0/animation/animation-share).

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
