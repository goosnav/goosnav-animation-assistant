# Scene configuration JSON

Load JSON accepts one UTF-8 file that sets up the scene, dialogue, expressions and timed actions. The app generates speech for speech scenes before replacing the current clip. Export JSON saves the current editable setup, including hand-edited motion keys. Use ZIP backups to keep recordings, generated speech, uploaded drawings and other media; JSON does not contain these assets.

Start with [speech-scene.json](../examples/speech-scene.json), which seats two characters and adds dialogue and gestures, or [silent-scene.json](../examples/silent-scene.json), which walks and waves without speech.

## Smallest useful recipe

```json
{
  "format": "goosnav-animation-config",
  "version": 1,
  "scene": {"actors": [{"model": "blue", "emotion": "happy"}]},
  "dialogue": [{"actor": 0, "text": "Hello there!"}],
  "actions": [{"actor": 0, "action": "wave", "time": 0.3}]
}
```

Actor numbers start at zero. Times and durations are seconds from the beginning of the clip, not relative to a dialogue line. Generated speech starts after a 0.3-second lead-in; speaking speed determines subsequent line times. Actions stay at their specified absolute times when dialogue changes.

## Top-level fields

Only `format` and `version` are required. Unknown fields and explicit wrong types (including `null`) are rejected.

| Field | Meaning and default |
| --- | --- |
| `format` | Exactly `"goosnav-animation-config"`. |
| `version` | Exactly `1`. |
| `title` | Project title, up to 200 characters. |
| `fps` | `24`, the app's animation frame rate; defaults to `24`. Other rates are rejected. |
| `rate` | Global speech rate, `0.5`–`2`; defaults to `1`. |
| `scene` | Partial scene settings; see below. |
| `dialogue` | Up to 30 lines; defaults to an empty array, never example dialogue. |
| `timing` | `{ "mode": "speech", "duration": 0, "drawings": 3 }`. |
| `actions` | Up to 100 action recipes. Cannot be combined with `keys`. |
| `keys` | Exact editable animation keys, up to 1,000. Cannot be combined with `actions`. |
| `guides` | Optional boolean `ground` and `backdrop` reference guides. |
| `overrides` | Mouth edits: `{ "actor": 0, "start": 1, "end": 1.2, "mouth": "round" }`. |
| `audio` | Optional `mode`, `offset`, `trimStart`, `trimEnd`; defaults to robot audio and zero timing adjustments. |

`timing.mode` is `speech` or `silent`. Silent mode defaults to a 3-second duration; an explicit silent duration must be `0.5`–`120`. Speech duration may be `0`–`120` and is a minimum; speech and motion can extend it. `drawings` is `3`, `5` or `9`, controlling the number of intermediate poses. Actions extend silent duration as necessary. The entire compiled clip must fit within 120 seconds.

`audio.mode` accepts `robot`, `silent` or `recording`. A loaded `recording` setting becomes `robot` for speech scenes because JSON contains no recording. Silent timelines always use silent audio. Audio offsets range from `-120` to `120`; trim values range from `0` to `120`. Export retains these timing adjustments.

## Scene and characters

`scene` accepts `format` (`portrait` or `landscape`), `style` (`flat` or `line`), `background` (six-digit hexadecimal color), `backdrop`, `count`, `camera`, `actors`, and `props`.

`actors` contains one or two partial actor objects. The visible count defaults to the number supplied; `count` can explicitly select one or two. The project keeps two actor slots internally. Omitted actor fields retain the normal new-project defaults. Dialogue and named actions cannot address hidden actors. Recipes also reject mouth overrides and prop attachments for hidden actors. Exact `keys` documents (including every export) preserve dormant keys, mouth overrides and attached props for either actor slot, so switching a scene to solo does not lose its authored second-actor setup.

Each actor accepts:

- `model`: an ID from the app's character selector, such as `blue`, `rust-beady`, `v12`, `v12-fat-glasses` or `billy-v2`.
- `pose`: `stand`, `point`, `shrug`, `open-hand`, `hands-on-hips` or `sitting`.
- `chair`: `folding` (the default), `wood` or `stool`; shown automatically while sitting.
- `emotion`: `neutral`, `happy`, `sad`, `angry`, `surprised` or `skeptical`. Expressions add subtle head pitch, head tilt and body lean; mouth shapes remain driven by speech.
- Numeric rig channels such as `x`, `y`, `z`, `yaw`, `scale`, `headYaw`, `headPitch`, `headTilt`, `armL`, `armR`, `elbowL`, `elbowR`, `bodyLean`, `thighL`, `kneeL` and the other supported [actor channels](../app/src/motion.mjs). All channels use the same limits as the editor.

Camera fields are `projection` (`perspective` or `orthographic`), `azimuth` (`-180`–`180`), `elevation` (`-45`–`75`), `zoom` (`0.4`–`3`), `targetX` (`-3`–`3`) and `targetY` (`0`–`3`). Each is optional.

Backdrop IDs are `none`, `black-pyramids`, `red-mesas`, `space`, `backrooms`, `starter-overgrown-courtyard`, `colonnade` and `threshold`.

Up to 12 props are supported. Props accept `id`, `kind` (`book`, `cube`, `sphere`, `prism`, `goose`), `color`, `attachment`, and numeric [prop channels](../app/src/motion.mjs): `x`, `y`, `z`, `rx`, `ry`, `rz`, `width`, `height`, `depth`, `open`, `page`. Defaults are a gray cube at the origin, dimensions `0.3 × 0.4 × 0.05`, zero rotation, closed book/page, a fresh ID, and `attachment: "world"`. Attachments also accept `actor:0:left`, `actor:0:right`, `actor:1:left`, `actor:1:right`. Give a prop a stable `id` when referencing it from actions or keys.

## Dialogue

Each line requires `actor` and `text` (up to 1,000 characters). Optional fields are `rate` (`0.5`–`2`, default `1`), `pause` (`0`–`10`, default `0.35`), `pose` (an actor pose or default `keep`), `headYaw` (`-75`–`75`, default `0`), `blink` and `smear` (booleans), and `emotion` (the six actor emotions). A line's emotion overrides the character's base emotion while that line is spoken.

New project and dialogue IDs are generated on every load. JSON exports omit these IDs; they are not media references.

## Actions and walks

A gesture recipe has this shape:

```json
{"actor": 0, "action": "arm_flail", "time": 1, "duration": 2, "strength": 1}
```

`actor` and `action` are required. `time` defaults to `0`; duration defaults to the action's normal length and can be `0.2`–`60`; strength defaults to `1` and can be `0.25`–`2`. Action IDs match the app's [action bank](../app/src/action-bank.mjs), including `nod`, `head_tilt`, `explain`, `shrug`, `point`, `wave`, `arm_flail`, `dance`, `handshake` and book actions such as `read`.

Partner actions accept `options: {"partner": 1}`; the default is the other actor, who must be visible. Book actions accept `options: {"prop": "book-1"}` for an existing book. Without a prop option they reuse an available book or create one. Options unsupported by that action are rejected.

Walks compute their duration from steps and cadence:

```json
{"actor": 0, "action": "walk", "time": 0, "options": {
  "steps": 4, "stride": 0.25, "cadence": 2, "direction": 90, "inPlace": false
}}
```

Walk defaults are shown above, except `direction` defaults to the actor's yaw. `steps` is an integer from `1` to `12`; `stride` is `0.1`–`1`; `cadence` is `0.5`–`6` steps per second; direction is `-180`–`180` degrees. Duration is `steps / cadence + 0.3`. Walks do not accept `duration` or `strength`.

Actions expand into editable keys in array order using the editor's normal action tools. Later actions replace keys on the same target inside their time span; arrange actions without overlaps when you want separate moves. Partner and book actions can also affect another actor or prop.

## Exact keys and export behavior

Export JSON always writes `keys` rather than `actions`. This preserves GUI edits and avoids expanding a gesture twice on reload. Exact keys have a unique `id`, a `target` such as `actor:0` or `prop:book-1`, a `time` (`0`–`120`), a `transition` (`auto`, `ease`, `hold` or `wipe`), and nonempty `values` containing supported numeric channels:

```json
{"id": "look-right", "target": "actor:0", "time": 1,
 "transition": "ease", "values": {"headYaw": 30}}
```

Key IDs survive a round trip. Two keys cannot target the same subject at the same time. Mouth override shapes are `rest`, `small`, `open`, `wide`, `round` and `teeth`; up to 2,000 edits are allowed, each with `0 <= start <= end <= 120`.

The parser rejects files larger than 5,000,000 UTF-8 bytes, excessive nesting, reserved prototype-related fields, unsupported versions, unknown fields, invalid values and unavailable targets. Parsing returns a validated candidate project and performs no speech generation, storage or current-project mutation. The app generates required speech and compiles that candidate before committing the replacement. `parseConfig(text)` and `exportConfig(project)` are exported from [config.mjs](../app/src/config.mjs).
