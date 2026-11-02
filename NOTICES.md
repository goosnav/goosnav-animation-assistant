# Sources and licenses

Character GLBs are unchanged snapshots from the supplied 3D Comic Engine at
`7d9a08dd32072d28c28654f54ff88c52f75f8d21`, originally authored in Goosnav 3D Assets.
`app/assets/manifest.json` records every source path and SHA-256. Original editable
models remain in the supplied asset-library submodule. Runtime rig positioning
follows the engine's rest-relative v10 joint convention. The small runtime tooth
insert is an assistant reference aid, not new canonical Goosnav comic art.

The Flite WASI adapter is adapted from the supplied 3D Comic Engine, with complete
phoneme timing collection and terminal-silence handling added here.

Native supervisor, bootstrap, platform wrappers, and packaging validators are
adapted from the user-requested Goosnav Software Productization skill templates.

Dependencies: Three.js (MIT), browser_wasi_shim (MIT), Flite (CMU permissive),
fflate (MIT), ag-psd (MIT), Mediabunny (MPL-2.0), esbuild (MIT), Playwright (Apache-2.0).
Mediabunny and @mediabunny/aac-encoder are bundled unmodified. The AAC extension
contains an FFmpeg AAC encoder WebAssembly build (LGPL-2.1-or-later); its license
is shipped as vendor/FFMPEG-LGPL.txt. The unmodified encoder source/bridge and
rebuild instructions are available at
https://github.com/Vanilagy/mediabunny/tree/v1.63.0/packages/aac-encoder and
https://github.com/FFmpeg/FFmpeg . The encoder is a separate dynamically imported
chunk and can be replaced by rebuilding this app with a modified package.
Source and license notices remain in the distribution. No restriction in the
application license overrides rights granted by these dependency licenses.
Mediabunny is bundled unmodified. Its source is available at
https://github.com/Vanilagy/mediabunny ; exact installed versions are locked in
package-lock.json. Build tools copy dependency license texts into vendor/.

Character and book artwork is not open-licensed by inclusion in this tool.
The folding chair, wooden chair, and stool are Goosnav assets from
`goosnav-3D-assets` commit `436a2f985f1c0a975160c97b8a23ba2c90567ba2`.
Editable Blender sources, GLB exports, rebuild script, and previews live in that
repository's `props/seating`, `exports`, `scripts/build_seating.py`, and
`previews/seating`. Their runtime hashes are recorded in the app asset manifest.
The book PDFs are development references and are not shipped in the web build.
