# brickwright-lite

A **fully-permissive** (BSD-3-Clause / Apache-2.0 / MIT) foundation for Brickwright — a
*contained* fork of the pre-relicense Scratch stack that you can **bundle and ship on any app
store** (no GPL, no AGPL, no consent, no remote-loading), with the blocks⇄code⇄Python/JS
"Code" tab and LEGO extensions.

This is the "own every part" track. The mainline
[Brickwright](https://github.com/CrispStrobe/brickwright) is a TurboWarp fork (GPL-3.0 editor
chrome); this one starts from the last permissive Scratch source so gui / vm / blocks / paint
are all local, editable, and licence-clean.

**Live:** <https://brickwright-lite.vercel.app> — auto-deploys from `main` (Vercel + GitHub Pages
CI). The repo is public so Actions are free/unlimited.

## Why this base

Scratch Foundation relicensed the whole stack **BSD-3-Clause → AGPL-3.0 on 2024-11-25**
(scratch-gui commit `3de24da0`). Everything *before* that is BSD-3; `scratch-blocks` is
Apache-2.0 throughout. Xcratch's own gui/vm forks followed upstream to AGPL, so they aren't a
clean base either — only its MIT tooling/extension format stayed permissive.

So we pin the **last BSD-3 commit** and freeze it:

| Component | Pin | License |
|---|---|---|
| **scratch-gui** | commit `7a72429477eb` (v4.1.7, 2024-11-23) | **BSD-3-Clause** |
| **scratch-blocks** | `1.3.0` (classic — *not* the 2.x Blockly rewrite) | **Apache-2.0** |
| **scratch-vm** | `4.8.115` | **BSD-3-Clause** |
| **scratch-paint** | `2.2.518` (or rewrite) | **BSD-3-Clause** |
| scratch-render / audio / storage / svg-renderer | pinned | **BSD-3-Clause** |

> **Verified:** this exact base **installs (1231 pkgs) and builds cleanly** (`webpack` →
> 135 MB `build/`, exit 0). The permissive foundation compiles as-is.

**Do not** swap in `scratch-blocks@2.x` — it's a ground-up Blockly rewrite (ESM, new API)
incompatible with the v4 GUI's classic `ScratchBlocks.*`; that combination fails to build.

## How it's built: vendor + overlay

We are **frozen on pinned versions**, so the pristine base never shifts under us. That means we
don't string-patch the base every build — we **own full copies of the files we change** in
`overlay/`, and the build just copies them over the vendored sources. To change base behaviour,
edit the file in `overlay/`.

```
overlay/scratch-gui/   ← every gui file we own: the Code tab (tw-pseudocode + sb3-creator libs),
                          the SoundFX creator, webpack.config.js, de-branded menu-bar/render-gui,
                          the extension-library picker, the robot icons + default sprite
overlay/scratch-vm/    ← built-in extensions (extensions/crispstrobe/*) + their registration
scripts/
  vendor.mjs           ← fetch the pinned permissive sources into packages/ (gitignored)
  integrate.mjs        ← copy overlay/ over the vendored gui + micro:bit stub + 3 package.json fields
  apply-vm-overlay.mjs ← post-install: lay the vm overlay onto node_modules/scratch-vm + one
                          upstream bugfix (xmlEscape the extension category name)
```

`packages/` (the vendored sources) is gitignored — `vendor.mjs` repopulates it, and validates each
dir's `package.json` so a partial CI/Vercel build cache self-heals.

## Quick start

```bash
npm run vendor                                   # fetch pinned BSD-3/Apache sources into packages/
node scripts/integrate.mjs                       # overlay our delta
cd packages/scratch-gui
npm install --ignore-scripts --legacy-peer-deps  # --ignore-scripts skips the flaky micro:bit download
node ../../scripts/apply-vm-overlay.mjs          # built-in extensions + the category-name bugfix
NODE_ENV=production npm run build                # -> build/  (CI/Vercel run scripts/vercel-build.sh)
```

The production build sets `devtool:false` (no source maps) — source maps over ~80 MB of blockly
were the exit-137 OOM on 7–8 GB CI/Vercel runners; the fix drops peak RSS from >8 GB to ~4.8 GB.

## What's integrated

- **The "Code" tab** — blocks ⇄ pseudocode ⇄ Python ⇄ JavaScript ([sb3-creator](https://github.com/CrispStrobe/sb3-creator)),
  with in-editor Run (Skulpt / JS) and a Custom-sprite-art dialog.
- **SoundFX creator** (crispfxr) in the sound editor.
- **Built-in extensions** (bundled, offline): Planète Maths, Arrays & Vectors. Each wraps its
  TurboWarp/Xcratch source through a `Scratch`-shim adapter into a vanilla built-in.
- **External extension loading** — the picker fetches the
  [CrispStrobe gallery](https://crispstrobe.github.io/extensions/) and loads any of its ~117
  extensions at runtime. Clean-room BSD path (not TurboWarp's MPL loader): allow-listed gallery
  URLs are fetched and run in-process through the same adapter.
- **De-branded** — Brickwright robot as favicon / menu-bar logo / default sprite; no scratch.mit.edu
  redirect; the non-functional Share / Community / My-Stuff / account / Backpack UI is removed.

## Roadmap

- [x] Pin & verify the last-BSD permissive base (installs + builds, green on CI + Vercel).
- [x] **Port the `sb3-creator` "Code" tab** — blocks⇄pseudocode⇄Python⇄JS, build-verified.
- [x] SoundFX creator in the sound editor.
- [x] Bundle utility extensions as built-ins (Planète Maths, Arrays & Vectors); gamepad next.
- [x] Runtime loading of the CrispStrobe gallery — TurboWarp-unsandboxed format (clean-room BSD).
- [x] Brickwright branding (robot favicon / logo / default sprite); de-brand the dead Scratch UI.
- [x] German i18n for our additions (Code tab + SoundFX) via a per-component locale table.
- [ ] Xcratch-format loading (the adapter already handles its `{blockClass, entry}` shape).
- [ ] (Later) rewrite the paint editor; own vm/gui/blocks changes as needed.

Tradeoff vs mainline Brickwright: you own a frozen fork (no free upstream fixes) and lose
TurboWarp's compiler speed + addon system — in exchange for a permissive app you can bundle
and ship on Apple/Google/Microsoft directly.

## License

BSD-3-Clause. Vendored components keep their own permissive licenses (BSD-3 / Apache-2.0);
`docs/` and glue are MIT/BSD.
