# brickwright-lite

A **fully-permissive** (BSD-3-Clause / Apache-2.0 / MIT) foundation for Brickwright — a
*contained* fork of the pre-relicense Scratch stack that you can **bundle and ship on any app
store** (no GPL, no AGPL, no consent, no remote-loading), with the blocks⇄code⇄Python/JS
"Code" tab and LEGO extensions.

This is the "own every part" track. The mainline
[Brickwright](https://github.com/CrispStrobe/brickwright) is a TurboWarp fork (GPL-3.0 editor
chrome); this one starts from the last permissive Scratch source so gui / vm / blocks / paint
are all local, editable, and licence-clean.

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

## Layout (npm workspaces)

```
packages/
  scratch-gui/            ← vendored BSD-3 fork you edit
  scratch-vm/             ← vendored BSD-3 fork you edit
  scratch-blocks/         ← vendored Apache-2.0 fork you edit
  scratch-paint/          ← vendored BSD-3 fork you edit (or rewrite)
  extensions/             ← LEGO/utility extensions, bundled as built-ins
  code-tab/               ← the sb3-creator blocks⇄code⇄Python/JS "Code" tab
scripts/vendor.mjs        ← fetches the pinned permissive sources into packages/
docs/extension-compat.md  ← plan to load BOTH Xcratch and TurboWarp extensions, bundled
```

## Quick start

```bash
npm run vendor      # fetch the pinned BSD-3/Apache sources into packages/
npm install         # link the workspaces
npm run build:gui   # webpack the editor
```

## Roadmap

- [x] Pin & verify the last-BSD permissive base (installs + builds).
- [ ] Vendor gui/vm/blocks/paint as editable workspaces; wire scratch-gui at the local vm/blocks.
- [ ] Port the `sb3-creator` "Code" tab (self-contained — operates on project JSON).
- [ ] Bundle the LEGO/utility extensions as built-ins.
- [ ] Extension shim that loads **both** Xcratch and TurboWarp formats (see `docs/`).
- [ ] (Later) rewrite the paint editor; own vm/gui changes as needed.

Tradeoff vs mainline Brickwright: you own a frozen fork (no free upstream fixes) and lose
TurboWarp's compiler speed + addon system — in exchange for a permissive app you can bundle
and ship on Apple/Google/Microsoft directly.

## License

BSD-3-Clause. Vendored components keep their own permissive licenses (BSD-3 / Apache-2.0);
`docs/` and glue are MIT/BSD.
