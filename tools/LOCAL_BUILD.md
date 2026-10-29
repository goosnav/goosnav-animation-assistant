# Local application packaging

The web build and the local application share all animation code. The local Python adapter only hosts static files and saves portable project archives on loopback. Customers do not install developer tooling: the native supervisor opens a setup page, uses bundled uv 0.12.19 to install managed Python 3.12.10, then opens the app.

## Build the payload

```sh
npm ci
npm run build
python3 tools/package-local.py --payload-only --fetch-tools
```

The result is `release/staging/app/`, plus the customer README and license. The six uv executables are checked against upstream archive hashes and recorded in `launcher/checksums.sha256`. This payload alone is not the universal release.

## Build the five launchers

Build prerequisites: Go 1.22+, Python 3.10+, and the platform packaging tools below. These are developer prerequisites only. Icons are already supplied in `tools/native/icons/`; regenerate them with Pillow and `python3 tools/make-icons.py` if needed.

All targets use the same invocation:

```sh
python3 tools/native/build.py --target TARGET \
  --name 'Goosnav Animation Assistant' --bundle-id shop.goosnav.animation \
  --icons tools/native/icons --output /absolute/path/to/release/launchers
```

| TARGET | Additional build input |
| --- | --- |
| `macos` | `lipo` from Xcode, or set `LIPO=/path/to/llvm-lipo`; combines Intel and Apple Silicon |
| `windows-x64` | `--windows-resource /absolute/path/to/animation_windows_amd64.syso` |
| `windows-arm64` | `--windows-resource /absolute/path/to/animation_windows_arm64.syso` |
| `linux-x64` | `--appimagetool /absolute/path/to/appimagetool` |
| `linux-arm64` | Same x86_64 build-host appimagetool, producing an ARM64 image |

Create both Windows resources using the pinned resource compiler:

```sh
go install github.com/tc-hib/go-winres@v0.3.3
go-winres simply --arch amd64,arm64 --out animation \
  --icon tools/native/icons/AppIcon.ico --manifest gui \
  --product-name 'Goosnav Animation Assistant' \
  --file-description 'Open Goosnav Animation Assistant' \
  --product-version 1.0.0 --file-version 1.0.0
```

For Linux container builds without FUSE, set `APPIMAGE_EXTRACT_AND_RUN=1` for appimagetool. The launcher has no application source embedded; it resolves the adjacent mutable `app/` directory.

For a build host with all prerequisites, `python3 tools/build-all-native.py` performs these five builds. The manual GitHub workflow `local-package.yml` builds and uploads an explicitly unverified universal ZIP.

Once the five images are in `release/launchers/`:

```sh
python3 tools/package-local.py
```

This validates the root allowlist, runtime manifest, bundled-tool hashes, expected launcher paths, and absence of private development data, then writes `release/GoosnavAnimationAssistant-universal.zip`. The archive contains all target images; its presence alone does not establish platform support.

## Verification status — 2026-10-29

- Linux x86_64: native AppImage built; cold launch from a different working directory downloaded managed Python, opened Chrome with the real GUI, saved a project, and shut down through the GUI Quit action. Port 8793 was occupied, so the app correctly selected a free loopback port. Tested with extraction mode in this host environment.
- macOS universal, Windows x64, Windows ARM64, Linux ARM64: cross-built images; native launch and interaction tests remain unverified.
- Full release matrix remains open. M1a is **ACTIVE**, not accepted and not a verified universal release.

Before distribution, run each image on its actual OS/architecture. Verify cold/warm launches, a path containing spaces, launch from a different working directory, occupied port, duplicate launch, offline warm start, interrupted runtime installation, source-only update, failed dependency update recovery, missing payload, writable-data failure, GUI workflow, and GUI quit. Preserve user data during failure tests. macOS universal needs separate Intel and Apple Silicon smoke tests. Browser/share support also needs a physical iPad round trip.

Data and logs live in `GoosnavAnimationAssistant` under macOS Application Support, Windows LocalAppData, or Linux XDG data/home. Nothing is written into the customer app folder during normal execution.
