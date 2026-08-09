# brickwright-lite — agent context (gitignored)

**What this is:** a **fully-permissive (BSD-3 / Apache-2.0 / MIT)** fork of the pre-relicense Scratch
stack that can be **bundled and shipped on any app store** (no GPL/AGPL, no remote-load requirement),
carrying the Brickwright "Code" tab + SoundFX + LEGO/utility extensions. The "own every part" track,
distinct from mainline **Brickwright** (a TurboWarp fork, GPL-3.0 editor chrome).

- **Repo:** `CrispStrobe/brickwright-lite` (PUBLIC → free unlimited Actions). Push directly to `main`,
  **no PRs**. Auto-deploys to **https://brickwright-lite.vercel.app** (Vercel) + GH Pages CI.
- **Local:** `/Users/christianstrobele/code/lego/brickwright-lite` (moved off /tmp 2026-07-07; `packages/`
  + `node_modules` + `build/` preserved). Siblings: `code/lego/brickwright` (mainline, GPL — source of
  robot/soundfx/default-project assets), `code/lego/brickwright-ios`, `.../brickwright-android`.
- **The compiler** (Code tab) comes from `sb3-creator` (`/Users/christianstrobele/code/sb3-creator`).

## Git / deploy rules
- Commit author MUST be `CrispStrobe <cze+github@mailbox.org>` (Vercel git auth). NOT `cze@mailbox.org`.
- **NO `Co-Authored-By: Claude` trailer** — no AI attribution in commit messages at all (2026-08-04).
- `gh` is authed as CrispStrobe; `vercel` as crispstrobe. Vercel CLI is flaky headless — check deploy
  status via GitHub commit **status** (`context=="Vercel"`) + **check-runs** (`name=="build"`).

## Architecture: vendor + OVERLAY (do NOT string-patch)
We are **frozen on pinned versions**, so the base never shifts. We **own full copies of changed files**
in `overlay/`; the build copies them over the vendored sources. To change base behaviour, **edit the
file in `overlay/`** — do not re-derive edits with fragile string replacement.

```
overlay/scratch-gui/   full owned gui files: the Code tab (tw-pseudocode + src/lib/sb3-creator*.js),
                       SoundFX (containers/sound-tab.jsx + components/tw-soundfx + lib/crispfxr-core.js),
                       webpack.config.js, de-branded menu-bar/render-gui/stage-header, extension-library
                       picker, library-item.css, robot icons (static/images, menu-bar), default-project
overlay/scratch-vm/    built-in extensions (src/extensions/crispstrobe/{adapter.js,<id>/index.js}) +
                       their registration in extension-manager.js's builtinExtensions
scripts/vendor.mjs           fetch pinned sources into packages/ (gitignored); validates each dir's
                             package.json so a PARTIAL CI/Vercel build cache self-heals (was a deploy bug)
scripts/integrate.mjs        cpSync overlay/ over vendored gui + micro:bit stub + 3 package.json fields
scripts/apply-vm-overlay.mjs POST-install: cpSync overlay/scratch-vm onto node_modules/scratch-vm +
                             xmlEscape bugfix + full-width number patch + locale trimming
                             (editor-msgs 3.6 MiB→93 KiB, scratch_msgs 999 KiB→25 KiB, en+de only)
scripts/vercel-build.sh      the CI/Vercel build: vendor -> integrate -> npm install -> apply-vm-overlay -> build
```

**Build locally (packages/ + node_modules already present, so this is fast):**
```
node scripts/integrate.mjs && node scripts/apply-vm-overlay.mjs
cd packages/scratch-gui && NODE_ENV=production CI=true NODE_OPTIONS=--max-old-space-size=2560 npm run build
```
Fresh: `npm run vendor` first, then `npm install --ignore-scripts --legacy-peer-deps` before the above.

**Build numbers (2026-08-09, GH Actions):** peak RSS 2.4 GiB, wall-clock 47 s, build/ total 82 MiB,
0 babel deopts, Vercel 8 GiB headroom: ~5.6 GiB. Output is chunk-split with lazy loading:
- Vendor chunk 8.44 MiB (3.3 MiB brotli, immutable — frozen deps never change)
- App chunk 2.05 MiB (500 KiB brotli, immutable)
- Blockly chunk 1.07 MiB (240 KiB brotli, lazy — loads in background, non-blocking)
- Paint editor chunk 375 KiB (87 KiB brotli, lazy — loads on costume tab activation)
- First paint: 3.8 MiB brotli. Repeat visits after a code-only deploy: **500 KiB**.

## Permissive base (exact pins — freeze, don't chase upstream)
Scratch relicensed BSD-3 → AGPL-3.0 on 2024-11-25. Pin the last-BSD:
- **scratch-gui** commit `7a72429477eb` (v4.1.7) BSD-3 · **scratch-blocks** `1.3.0` Apache-2.0 (classic —
  NOT the 2.x Blockly rewrite, which is incompatible) · **scratch-vm** `4.8.115` BSD-3 · scratch-paint
  `2.2.518` · render/audio/storage/svg-renderer pinned, all BSD-3.
- Mobile BLE/BTC bridge (for app builds) is ALSO permissive: `scratch-link` BSD-3, `Swifter` BSD-3,
  `cordova-plugin-bluetooth-serial` Apache-2.0, CodePM/ScratchWebKit MIT (in `brickwright-ios/CodePM`
  + `brickwright-android/ios/App/App/ScratchLink`). Port these into lite's future mobile wrappers.

## CI build fixes that MUST stay (all were real deploy failures)
1. **`devtool: false`** (overlay webpack) — `cheap-module-source-map` over ~80MB blockly was the exit-137
   OOM on 7-8GB runners (peak RSS >8GB → 4.8GB).
2. **micro:bit stub** — `--ignore-scripts` skips the firmware download, so integrate.mjs writes
   `src/generated/microbit-hex-url.cjs`.
3. **vendor cache validation** — Vercel restored a partial `packages/scratch-gui` (src/ but no package.json);
   vendor.mjs now checks `package.json` and re-fetches.
4. **xmlEscape category name** (apply-vm-overlay patches runtime.js ~L1565) — the base VM builds
   `<category name="${name}">` with the RAW name, so any extension whose name has `& < > "`
   (e.g. arrays = "Arrays & Tensors") makes not-well-formed toolbox XML → its blocks never appear.

5. **Offline extension loading** (apply-vm-overlay patches virtual-machine.js) — projects
   saved by sb3-creator embed gallery URLs in `extensionURLs`. On cold open, `installTargets`
   passed the URL to `loadExtensionURL`, bypassing the builtin check (keyed by ID). All 14
   gallery extensions are bundled as builtins, but the URL path fetched from the network and
   hard-failed offline. Fix: try the extension ID first (hits the builtin), fall back to the
   URL only if no builtin is found.

## Build optimisations (2026-08-08/09) — overlay webpack.config.js + apply-vm-overlay.mjs
5. **`dist/` build skipped** — gated behind `BUILD_MODE=dist`. Vercel only serves `build/`; the dist
   library compilation was an entire redundant webpack pass. Biggest single peak-RSS win.
6. **cat-blocks aliased to scratch-blocks** — cat-blocks (65 MiB) is a duplicate blockly for the
   "time travel to 2020" Easter egg. The alias makes both branches of the conditional `require()` in
   `src/lib/blocks.js` resolve to the same module. Easter egg degrades (shows normal blocks).
7. **Locale data trimmed to en + de** — `apply-vm-overlay.mjs` extracts en+de from editor-msgs.js
   (3.6 MiB → 93 KiB) and overwrites scratch-blocks/msg/scratch_msgs.js (999 KiB → 25 KiB) in place.
   Webpack alias points editor-msgs at `src/generated/editor-msgs-lite.js`. Adding a third locale =
   update the extraction in apply-vm-overlay.mjs (two places).
8. **V8 heap cap lowered 4096 → 2560 MiB** — with the reduced workload, 2560 MiB is sufficient.
   Directly prevents V8 from growing into Vercel's 8 GiB container ceiling.
9. **3 unused entry points removed** (blocksonly, compatibilitytesting, player) — Scratch dev/testing
   tools inherited from upstream, never used by Brickwright. Only `gui` remains. Tauri loads the same
   `build/index.html` for all platforms (web, macOS, Windows, Linux, iOS, Android).
10. **Babel skips pre-minified blockly** — `blockly_compressed_vertical.js` is excluded from
    babel-loader (already compiled, `'use strict'`). Eliminated the last babel deopt.
11. **Chunk splitting + content hashes + immutable caching** — `shouldSplitChunks: true` splits
    vendor code (React, scratch-vm) into `chunks/[id].[hash].js`, cached immutably since
    deps are frozen. Entry is `gui.[contenthash:8].js`. UMD library wrapper removed from the web
    build (only needed for dist/). `vercel.json` sets `Cache-Control: immutable` for hashed JS,
    chunks, and `static/assets/`. index.html stays `must-revalidate`.
12. **Lazy-load scratch-blocks** — `lazy-scratch-blocks.js` loads the ~1 MiB blockly core via
    dynamic `import()` into a separate `sb.[hash].js` chunk. A `LoadScratchBlocksHOC` wraps the
    blocks container and defers rendering until the chunk resolves. All static `import ScratchBlocks
    from 'scratch-blocks'` replaced with `LazyScratchBlocks.get()` (blocks.js, make-toolbox-xml.js,
    custom-procedures.jsx, block-to-image.js). Cleanroom implementation (standard React patterns).
13. **Lazy-load scratch-paint** — `paint-editor-wrapper.jsx` uses `React.lazy()` + `Suspense` to
    load the paint editor component only on costume tab activation (375 KiB separate chunk). The
    Redux reducer is imported directly from `scratch-paint/src/reducers/scratch-paint-reducer`
    (small, no UI deps) so the store initialises without the full paint component.

## Extensions
- **Bundled built-ins** (offline): planetemaths, arrays. Each = `overlay/scratch-vm/.../crispstrobe/<id>/index.js`
  wrapping the `reference/extensions/<id>.js` source string via `adapter.js` `makeCrispExtension` (runs the
  TurboWarp/Xcratch source against a `Scratch` shim, captures the registered instance), registered in
  `builtinExtensions`, plus a picker entry in `overlay/.../libraries/extensions/index.jsx`. Add more the
  same way (gamepad next).
- **External gallery loading** (all ~117 at runtime) — CLEAN-ROOM BSD, NOT TurboWarp's MPL loader:
  `extension-manager.loadExtensionURL` has a branch for allow-listed `https://crispstrobe.github.io/*.js`
  (`isCrispExtensionURL`) → fetch source → run via the same adapter → `_registerInternalExtension`.
  Everything else falls through to the vanilla sandbox worker. `containers/extension-library.jsx` fetches
  the gallery index (`crispstrobe.github.io/extensions/generated-metadata/extensions-v0.json`; shape
  `{extensions:[{slug,id,name,description,nameTranslations.de,image,by}]}`, extensionURL=`${base}${slug}.js`)
  once on open, dedups vs bundled built-ins, merges after them. No CSP in base so fetch + `new Function`
  eval work. **Xcratch format** (`export {blockClass,entry}`) is already handled by the adapter → a small
  later add. Gallery JSON ships `de` translations (reuse for i18n).

- **Direct load by URL** (TurboWarp/Xcratch-style) — `loadExtensionURL` loads ANY `http(s)` URL
  in-process via the adapter (`isRemoteExtensionURL` / `_loadRemoteExtension`). The extension-library
  has an "➕ Extension from URL" tile that prompts for a URL; `isTrustedExtensionURL(url)` (our gallery
  host) decides whether the UI shows a `confirm()` warning first (remote code runs with full page
  access). Untrusted URLs need CORS to fetch.

## PWA + branding chrome
- Tab title is **Brickwright** (HtmlWebpackPlugin `title` in overlay webpack.config.js — single entry point).
- PWA: `overlay/scratch-gui/static/manifest.webmanifest` (+ `<link rel=manifest>`, theme-color/apple
  meta in index.ejs) using `static/images/{192,512}.png` + brick-robot.svg. Service worker
  `overlay/scratch-gui/sw.js` is copied to the BUILD ROOT (webpack CopyWebpackPlugin — must be root so
  its scope covers the app) and registered from index.ejs; stale-while-revalidate runtime cache of
  same-origin GETs → offline after first visit.

## Planned: on-device TTS (replace cloud AWS text2speech)
See memory `brickwright-ondevice-tts`. `/Users/christianstrobele/code/CrispASR` (MIT) has 23 TTS
engines compiling to WASM (~4.3MB, client-side) → offline TTS. Needs COOP/COEP (SharedArrayBuffer);
CrispASR ships `examples/coi-serviceworker.js` to inject those headers on static hosts — could merge
into our sw.js. Watch: cross-origin isolation vs the gallery fetch (CORS ok, mind asset CORP).

## Diagnosing extension-load failures (gotchas)
- `require('scratch-vm')` loads the **dist** (main = `dist/node/scratch-vm.js`, UNPATCHED). The browser
  builds from **src** via the webpack alias `scratch-vm$` → `node_modules/scratch-vm/src/index.js`.
  So to test the real path in Node, require `node_modules/scratch-vm/src/engine/runtime`, NOT the package.
- To find a bad extension: run its source through the adapter → `runtime._registerExtensionPrimitives(info)`
  → `runtime.getBlocksXML()` and **xmllint** the category (that's where the `&`-in-name bug surfaced).
- The adapter tolerates Node-only failures (`window`, `requestAnimationFrame`) that work in-browser —
  don't be misled by Node errors.

## Branding = the robot (not bricks/cat)
`brick-robot.svg` (teal/amber mascot, `</>` belly) is the icon everywhere: favicon
(`static/images/brick-robot.svg` + apple-touch-icon + 192/512 PWA png), menu-bar logo, and the default
sprite (overwrite the 2 default-project cat costume SVGs with the robot; md5 keys unchanged → no
project-data.js edit). Dead Scratch UI removed by dropping `showComingSoon` in render-gui.jsx
(Share/Community/My-Stuff/account) + removing `backpackVisible` (Backpack). No scratch.mit.edu redirect.

## German i18n (our additions only)
Our components don't go through scratch-l10n, so they read `state.locales.locale` (redux connect) and
pick en/de from a per-component string table (English fallback). Done: `pseudocode-importer.jsx` (full
`L10N` table — every button/label/tooltip/status/help paragraph) and `tw-soundfx/soundfx-generator.jsx`
+ sound-tab Generate button (a `DE` map keyed by the English source, `tx(locale,en)`). Add a language =
add a column. Untranslated on purpose: code-example placeholders, preset names.

## Invariants
Every push must keep CI **and** Vercel green. Verify features are actually in the bundle
(grep `build/gui.*.js` for distinctive strings — the filename is now `gui.[contenthash].js`)
— a green build doesn't prove an extension loads (see the dist-vs-src gotcha).

## Planned: `stc12live` — the STC12/8051 hardware extension (NOT started)

The 8051 work has a finished compile side and an unstarted extension side. **The extension
belongs here in lite, not in mainline** (decided 2026-08-08).

Siblings: **`/Users/christianstrobele/code/stc-compiler`** (public, live at
<https://stc-compiler.vercel.app> — C / BrickWright pseudocode / Keil C51 → Intel HEX),
**`/Users/christianstrobele/code/stc`** (private lab: wiring, examples, `docs/ROADMAP.md`),
**`/Users/christianstrobele/code/sb3-creator`** (where `generateC()` will live). Read
`stc-compiler/CLAUDE.md` before touching any of it.

**Two modes, and they are very different amounts of work:**

- **Tethered (`stc12live`) — the cheap one, do it first.** Blocks drive a chip that is
  already running resident firmware, over Web Serial. In sb3-creator this is *just another
  `RUNTIME_EXTENSIONS` driver* — **zero emitter code**. Here it is the standard recipe:
  `overlay/scratch-vm/src/extensions/crispstrobe/stc12live/index.js` wrapping a source
  string through `adapter.js`'s `makeCrispExtension`, registered in `builtinExtensions`,
  plus a picker entry in `overlay/scratch-gui/.../libraries/extensions/index.jsx`.
  **Blocker:** the chip-side firmware (`10-live-firmware`, a framed command protocol over
  UART) does not exist yet — it is step 2 of `stc/docs/ROADMAP.md`.
- **Compiled (`stc12`) — `generateC()` in sb3-creator is DONE (2026-08-08).** The scheduling
  model and chip-family/timing rules came from `stc-compiler/stc_pseudocode.py` unchanged.
  Full write-up: `sb3-creator/reference/c-target.md`. What is still missing here is the
  **flashing path** (below).
  - Vendored in via **`npm run sync:sb3creator -- --dir ../../sb3-creator`** (added
    2026-08-08; `--check` for CI drift), then `npm run integrate`. Before that script
    existed, lite's `overlay/scratch-gui/src/lib/sb3-creator*.js` were hand-copied from
    mainline and silently drifted two commits behind. Do not hand-copy again.
  - The Code tab has a 4th tab, **🔌 C (STC12)**, and it is **two-way** since 2026-08-08:
    `cToPseudocode` (vendored as `sb3-creator-c.js`) reads our own C exactly via the `@bw`
    marker header, and hand-written firmware by inference. So you can paste someone's `.c`
    and press "⇦ To blocks". Only the runner and the driver switches are still gated off it.

## Planned: the two surfaces the hardware story still needs (2026-08-08)

Both are additive to the Scratch stage, not replacements for it.

1. **A hardware interaction/visualisation surface** — what
   [S4A](https://s4a.cat/index_en.html) does with its board picture, but modern and
   multi-device: LED states, pin levels, pot/sensor readings, motor speeds, shown live
   next to the stage. Same panel, two sources: **simulated** (fed by the emulator or by the
   driver shim) and **live** (mirroring real hardware over the tethered link). It should
   ride on the existing `RUNTIME_EXTENSIONS` driver contract — the panel is another driver
   consumer, so it needs **no emitter changes**. Targets, in order: LEGO hubs (drivers
   already exist), the 8051 board, later Arduino.
2. **A simulator / emulator / debugger view** — run the emitted image with no hardware
   attached: step, breakpoints, SFR + register view, memory, pin state.
   **`emu8051` is the UX reference** (its TUI shows exactly the right panes — see
   <https://reidemeister.com/blog/2022.07.03>); **`ucsim`/`s51` is the engine we already
   build against** — stc-compiler uses ucsim differential execution as one of its three
   oracles (`stc-research/ucsim_51`, `exec_diff.py`). **The known gap: no ucsim build ships
   an STC model** (verified at git head 0.9.9), so BRT-driven UART subjects stay
   inconclusive. Closing it means an STC12 model — the SFR set, the ADC, the PCA, and the
   1T timing. For the browser the realistic path is ucsim or emu8051 compiled to WASM
   — and **the licences are now checked (2026-08-08, via the API): `jarikomppa/emu8051`
   is MIT, and so are `wokwi/avr8js` and `wokwi/wokwi-elements`.** So the browser path is
   genuinely open, and Wokwi is a reference we may borrow from rather than merely read.
   ucsim, QEMU and unicorn are all GPL-2 and can never be bundled here; Renode reports
   `NOASSERTION` and needs its LICENSE read; Verilator is dual LGPL-3/Artistic-2 and is
   the wrong tool anyway.

**The peripheral model is written down once** in `stc/docs/STC12-PERIPHERAL-MODEL.md`, so the
two emulator forks and the simulator's board layer cannot drift into different answers. The
full simulation architecture — board layer, closed-form component models, where a real MNA
solver becomes unavoidable (the multimeter forces it), and the two fidelity tiers — is in
`sb3-creator/reference/simulation.md`. **The cheap tier needs zero new emitter code**: it is
`RUNTIME_EXTENSIONS` with `driver:"simulator"`, which covers every target we emit and is
exactly how MakeCode simulates micro:bit without emulating a CPU.

Two agents run on the VPS against that contract: `screen -U -r -A ucsim-stc` (GPL-2, CI
oracle only) and `screen -U -r -A emu8051-stc` (**MIT — the one that can actually ship
here**). Emscripten is installed on that box: emsdk at `/mnt/volume1/emsdk`, **emcc 6.0.0**, activated
with `source /mnt/volume1/emsdk/emsdk_env.sh` (not on the default PATH).

**Flashing from the browser, two known constraints:**
1. The STC bootloader only listens **right after a cold power-on** — a reset button will
   not re-enter it. Either instruct the user to unplug VCC, or use the DTR-switches-power
   hack so `setSignals({dataTerminalReady})` can do it (see `stc/README.md` §2).
2. The ISP protocol would be ported to JS from `stcgal` (**MIT** — fine for lite's
   fully-permissive requirement). **SDCC is GPL, so it must NOT be bundled**; compiling
   stays server-side against stc-compiler. That is exactly the constraint lite exists for.
