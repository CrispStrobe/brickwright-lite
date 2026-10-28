## SPIKE G03 sandbox and editor UI qualification — 2026-10-15

CLAIMED — Codex SPIKE integration, branch `docs/spike-g03-ui-claim-20261015`.
Implementation starts after PR948, PR962 and the remaining G02 acceptance review.
Contract: [G03](docs/SPIKE-STATUS-AND-LANES.md#g03--qualify-usable-sandbox-and-responsive-editor-controls).
First inventory working features in the actual rendered UI; fix demonstrated
gaps rather than replacing existing controls or adding unsupported backends.

Envelope: this ledger; `docs/SPIKE-ARENA.md` and
`docs/SPIKE-STATUS-AND-LANES.md`; SPIKE presentation, sandbox editing/persistence,
view switching and bounded Identify feedback in
`overlay/scratch-gui/src/components/tw-pseudocode/{spike-arena-pane,spike-simulator-pane,spike-port-monitor}.jsx`;
SPIKE-only text in `overlay/scratch-gui/src/lib/spike-arena/l10n.js`; focused
`test/spike-arena-{3d-pane,pane-units}.test.mjs` and new scoped UI controls.
In shared `pseudocode-importer.jsx`, only SPIKE entry/run/import toolbar labels
and SPIKE-specific report presentation belong here. In shared
`components/gui/gui.jsx`, only demonstrated SPIKE dock sizing/visibility defects
belong here. Preserve other owners' Arcade/MakeCode/importer/lexical/type work
and use only existing tracked package twins through repository-prescribed writers.
Any wider shared-file or model change needs a separately coordinated envelope.

Acceptance: free sandbox entry; shared 2D/3D world and one firmware owner;
backend/topology admission; reset/edit/save/reopen; narrow desktop/mobile widths;
long errors and conversion reports; keyboard/touch; EN/DE labels; explicit
image/backdrop selection, clear import actions and compact run/undo controls;
a usable right pane at 50–75 percent width. Identify A–F must show its actual
observable boundary and a bounded failure instead of an indefinite pending state.
Qualify real rendered behavior and relevant installed ownership paths; retain
G02 regressions, immutable pins and product budgets. Merge this claim before
implementation and require all enabled exact-head checks before integration.
The separately claimed shared project-world work keeps its ownership. This
claim changes no executable, dependency, fixture, capture or workflow and makes
no fresh guest, performance, physical, reference, release or licence claim.

### Continuation — 2026-10-24

Owner handover: no G03 implementation landed after the 2026-10-15 claim, and the
G02 prerequisites named above have since landed. Claude (operator-assigned) now
continues this claim on `lane/spike-g03-usb-bridge-deadline-20261024`. The
envelope adds `overlay/scratch-gui/src/lib/spike-usb-stream.js` and
`test/spike-usb-stream.test.mjs`, which are the actual Identify A–F path behind
"Read USB ports".

Rendered inventory of the deployed main build (Chromium, 1024–1280 px):
- Working: starter "Control LEGO" opens the SPIKE lesson after the replace
  confirmation; the SPIKE arena dock reflows inside a 355–520 px stage pane
  with no clipped controls; Free sandbox, Challenges, course/level selectors,
  Start/Step/Reset, backend selector, 2D⇄3D toggle with one shared world,
  orbit camera, drive pad, paint/size/grip and mat Save/Open/Empty are present
  and keyboard-focusable.
- Below 1024 px the page scrolls horizontally because of the app-wide Scratch
  `min-width: 1024px`; no SPIKE control is clipped. Changing that minimum is
  shared app layout outside this envelope and is not changed here.
- Identify A–F direct USB already bounds each REPL read (3 s). The browser
  WLAN-bridge route had no deadline: an unanswered bridge kept the toolbar on
  "Reading USB hub ports…" indefinitely, and a non-JSON error page surfaced a
  JSON parse error. Fixed: the browser request uses the desktop app's 120 s
  bound, then reports a bounded failure; a non-JSON reply reports its status.

Remaining G03 items (EN/DE labels, touch, long conversion reports, 50–75 %
right pane, save/reopen) stay open for later passes under this claim.

### Continuation — 2026-10-24 (remaining items)

Branch `lane/spike-g03-remaining-20261024`. Each item was first exercised on the
deployed main build in Chromium (Playwright); only the touch item showed a defect.

- **EN/DE labels — verified working.** With the browser locale `de-DE` the
  starter, toolbar ("Auf SPIKE über USB ausführen", "SPIKE-Arena") and every
  arena control, option, tooltip, `aria-label` and status line render in German
  in mission, sandbox and 3D modes (Freie Arena, Aufgaben, Schritt,
  Zurücksetzen, 3D-/2D-Ansicht, camera modes, drive pad, edit tools, colours,
  Radkontakt, Matte speichern/öffnen, Bereit, readouts). No English-only SPIKE
  string was found. Readout numbers keep a decimal point ("0.0 s") while
  challenge prose uses a comma; recorded, not changed.
- **Touch — one defect fixed.** With a touch context, taps on Free sandbox,
  the drive pad (rover drove and turned), Start, Step (paused), Reset, the
  2D⇄3D toggle and paint/wall/crate/start placement all work, and a touch drag
  orbits the 3D camera (its canvas already has `touch-action: none`). A touch
  drag with the Move tool on the 2D mat did nothing: the canvas had
  `touch-action: auto`, so the browser took the gesture for scrolling and sent
  `pointercancel`, which drops the drag (mouse drag moved the same patch). The
  2D canvas now sets `touch-action: none` while a sandbox editing tool is
  active and keeps `auto` for missions and "View only", so the page still
  scrolls there. Test `sandbox editing tools keep touch drags on the 2D mat` in
  `test/spike-arena-pane-units.test.mjs` fails before the change and passes after.
- **Long conversion/error reports — verified working.** 120 long unsupported
  pseudocode lines converted with ⇦: the status line stays one ellipsized line
  with ×; expanded it is capped at 72 px and scrolls. The conversion report
  starts collapsed with ×; expanded it is capped at 180 px and scrolls. Toolbar
  and run buttons stay at the top, the page does not scroll, and both close.
- **Right pane at 50–75 % — verified working.** Dragging the existing
  "Drag to resize" divider to 50, 60 and 75 % at 1280, 1600 and 1920 px gives
  exactly those fractions. The 2D canvas resizes with its backing store
  (e.g. 924 px wide at 1280/75 %), the 3D canvas is equally wide, no arena control
  is clipped and there is no horizontal scroll. At 75 % the editor column is 277–437 px
  wide and wraps its toolbar but stays usable; the readouts below a large
  canvas are reached by scrolling the pane.
- **Reset/edit/save/reopen — verified working.** Empty mat, then a paint patch,
  wall, crate and new rover start; Save mat downloads `spike-sandbox.json`;
  Empty mat, Start and Reset; Open mat with that file restores the same shapes,
  walls, objects and start, which also survive a page reload.
- **Identify A–F** — the bounded WLAN-bridge failure from the earlier pass is
  on main; `test/spike-usb-stream.test.mjs` passes 7/7.

- **Import actions, undo, image selection — present.** The Code tab's "⋯"
  menu ("Open, save, import, examples and reference") lists Open, Save,
  MakeCode…, Load example…, reference and Custom sprite art; the menu bar has an
  undo icon ("Undo (code)"); the arena shows "Choose image…" for the MicroPython
  backend, and the Backdrops tab stays available.

The app-wide `min-width: 1024px` below 1024 px is unchanged (shared layout,
outside this envelope).

Status: every acceptance item listed in this claim has now been checked on the
rendered UI; the touch drag was the only defect found and it is fixed. One
adjacent item stays **open**: `docs/SPIKE-STATUS-AND-LANES.md` asks G03 to
reproduce the saved-Python-view → empty-Pseudocode transition. That transition
lives in `pseudocode-importer.jsx` outside the SPIKE toolbar/report slice, so it
waits for that file's current owner or a widened envelope. It was not
reproduced or changed here. Until then, G03 is complete except for that
transition. No physical-hub, installed-desktop or performance claim is made.

### Continuation — empty Pseudocode editor after a failed conversion, 2026-10-24

Last open G03 item. The guide kept this change with the owner of
`pseudocode-importer.jsx` until the overlapping claim was released. The only
live overlapping claim is H1–H7 (2026-10-16), whose tasks are all still queued
with no PRs after eight days. On the operator's explicit instruction to close
every G03 gap, this narrowly takes only the conversion-failure path in
`switchTab` (and the byte-identical package mirror). Nothing else in that claim
is touched.

Reproduced in the actual method: from a saved Python view with an empty
Pseudocode buffer, a conversion error kept the editor on Python with only the
error, with no way into an empty Pseudocode editor. The failure now also
offers "Open an empty <language> editor" (DE: "Leeren <language>-Editor
öffnen"). It opens only the tab whose conversion failed, not while busy, keeps
the Python source, and a successful conversion behaves as before. Three focused
controls; two fail on the original source.
