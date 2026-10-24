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
