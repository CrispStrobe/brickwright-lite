# bw-bundle handoff — 2026-08-15 (session 8)

## What was done this session (42 tasks, all pushed)

### micro:bit MicroPython integration (8a05485–bc15da1)
- Synced `generateMicroPython` from sb3-creator (cooperative generators)
- Conditional `🤖 micro:bit` tab in Code tab (read-only, python mode)
- Self-hosted micro:bit simulator (MIT, built from source with emscripten)
- MicrobitSimPane: iframe + postMessage flash/stop/reset/serial terminal
- Stage-header micro:bit toggle (conditional on DEVICE MICROBIT)

### P1 regression fix (4192b77)
- StageWrapper always renders (view buttons never vanish)
- dockMode guards stale localStorage; micro:bit button conditional on device

### Chrome sweep (4e5a6f9, 7a16445)
- Editor scroll: CM6 height:100% + .cm-scroller overflow:auto
- BASIC Run guard: button only for python/javascript
- Tab renamed "Code ⇄ Blocks" → "Code"
- Chrome compression: title row merged into language tabs, maximize mode
- Hamburger menu: compact mode hides menu bar entirely (39f0970)

### i18n sweep (073a587)
- 40+ strings moved to L10N dict (EN+DE) in pseudocode-importer
- microbit-sim-pane, gui.jsx, chrome-toggle localised
- L10N parity test: en/de key sets must match

### BASIC real-machine run (0952333, 25553e9, 8b28bf0)
- BasicMachineRunner (6502 MS BASIC, MIT ROM) + BbcZ80Runner (BBC BASIC Z80, zlib COM)
- Both profiles: rAF pump loop, reason handling, Playwright verified

### VDU terminal (b82287d)
- VduDecoder → canvas: DRAW/MOVE/PLOT as lines, text as character grid
- Renders in real time during BBC BASIC runs

### Debugger UX (82e22d2–9662f11)
- Suite RED fixed: 6 features restored from sync-deleted vendored code
- Semantic right-pane redesign: 3 modes (Circuit | Debugger | Scratch)
- "Pause here" block menu: installed flag fix + bwDeviceId gate
- Power toggle → runner stop; designer scroll in right-pane portal
- Retro-bench extractors wired to DRC (contention/open vectors as warnings)

### Upstream reconciliation (54fda1b)
- Carried all lite patches upstream to bw-circuit-ui (fd19b43)
- Zero divergence between lite and upstream; sync guard passes
- setExtractors() injection pattern for cross-repo integration

### Example loading + instruments (d52ff27, 5e26e0d, a868831)
- Example loader: kind:circuit examples now load program.bw
- Debugger panel gated on MCU presence (not shown for pure circuits)
- Scope/Meter toggles persisted to localStorage
- vcc voltage editable via InlineEditor (dynamic label)

### VdpScreen (ad4b7bb)
- TMS9918A video output wired into debug panel (polls runner.video())

## Blocked / open

- **VDP gallery example** — VdpScreen renders but no gallery example with CHIP vdp exists yet
- **ASM assemble endpoint** — button stubbed, waiting for bw-cfront
- **ili9341 body face** — TFT face not in upstream yet
- **Examples intro.md rendering** — pilot audit lane writing content; wiring later

---

# bw-bundle handoff — 2026-08-14 (session 7, continued)

## What was done this session

### CodeMirror 6 editor (1e88579, 1ea4adf)

Replaced hand-rolled textarea-over-pre with CodeMirror 6 (MIT). See previous
handoff block for full details. Lazy chunk `bw-codemirror` (~600 KiB).

### ASM tab (f374a1c, cb002cd)

Added a 6th language tab — `🔩 ASM` — with dual-mode operation:

**Source mode (default, editable):**
- Fully editable CodeMirror buffer using `cm-lang-asm.js` (custom
  StreamLanguage with 8051, 6502, AVR, and ARM mnemonics).
- Buffer persists like other language buffers (cleared on From blocks /
  To blocks / example load, re-editable on tab switch).
- `🔩 Assemble & Run` button — STUBBED. The raw-assemble endpoint in
  bw-cfront is being built; until it lands the button shows a status note.
  When wired, it will POST `{source, target, format}` to `/assemble` and
  get `{hex, listing, errors}`. Errors will surface as CM diagnostics
  (gutter markers).

**Listing mode (read-only, from compile service):**
- Fetches disassembly from `POST /compile {disassemble: true}` on the
  hosted compile service.
- Consumes `response.listing = {asm, lineMap: [{addr, file, line}], format, v: 1}`
  (shape v1 from stc-compiler 8c7693c). Falls back to `response.disassembly`
  string for older service versions.
- Cached by FNV-1a hash of the C source — tab switching doesn't recompile.
- `lineMap` stored as `state.asmLineMap` for the future current-PC highlight
  seam. `setHighlightedLine(n)` from the editor is exactly what it will call.

**Deliberate asymmetry:** No ASM-to-blocks path. The note in the tab says so.

**Mode toggle:** dropdown above the editor: "Source (editable)" / "Listing
(from compiler)". Switching to Listing triggers the compile fetch.

### Files added/modified
- `overlay/scratch-gui/src/lib/cm-lang-asm.js` — ASM language mode
- `overlay/scratch-gui/src/lib/codemirror-editor.jsx` — added `asm` case
- `overlay/scratch-gui/src/components/tw-pseudocode/pseudocode-importer.jsx` —
  ASM tab, dual mode, `fetchAsmListing`, `assembleAndRun` stub, L10N en+de

### Verified
- Playwright `verify-editor.mjs`: 15 checks pass (CM render, line numbers,
  typing, search, To blocks, dark theme, maximize, ASM source mode, ASM mode
  dropdown, Assemble & Run button, ASM typing, asymmetry note)
- Full test suite: 135/136 pass, 0 fail, 1 skip
- Production build: gui.233ee962.js (2.13 MiB), CM chunk ~600 KiB lazy
- All buffer paths include `asm: ''` to prevent stale state

## Nothing in flight

All changes pushed to `main`. No branches, no stashes, no WIP.

## What the next session should know

- **Assemble & Run is stubbed** — `assembleAndRun()` shows a status note.
  Wire it when bw-cfront provides `/assemble` endpoint. Expected response:
  `{hex, listing, errors}`. Errors → CM diagnostics via `@codemirror/lint`.
- **`asmListing` is a separate state field** from `buffers.asm`. Source mode
  uses `buffers.asm` (editable); listing mode uses `asmListing` (read-only).
  `activeCode()` returns the right one based on `asmMode`.
- **`_asmCache`** keys on FNV-1a hash of the C source. Cleared implicitly
  when the C buffer changes (because the hash won't match).
- **lineMap** stored as `state.asmLineMap` — array of `{addr, file, line}`.
  The debugger integration should call `this.setHighlightedLine(lineMap[i].line)`
  when the PC matches `lineMap[i].addr`.
- **CM language modes** are all in `overlay/scratch-gui/src/lib/cm-lang-*.js`.
  To add a new one, create the StreamLanguage file and add a case in
  `codemirror-editor.jsx`'s `langExtension()`.

## Open items

- **Wire assembleAndRun** — needs bw-cfront `/assemble` endpoint
- **CM diagnostics** — assembler errors should show as gutter markers
- **Wire setHighlightedLine to debug panel** — BASIC TRACE + PC highlight
- **6502 browser emulator** — no wasm engine exists yet
- **cc65 compile service** — stc-compiler needs a cc65 backend endpoint
- **7 device stubs** hidden from palette — need drivers in bw-board
- **Code-tab debugger strip** — placement approved, not started
