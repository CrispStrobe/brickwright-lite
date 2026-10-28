# Code file actions in the shared File menu

Owner: shared editor-menu UX maintainer. Status: CLAIMED.
Base: 88f7367ed653398560c725f75e78845172c066f5.

Extend the existing shared menu task: expose Open code and Save code as through
File when Code is active. Reuse the importer’s actual file chooser and existing
openCodeFile/saveCodeFile handlers, including supported formats and filenames.
Preserve global project open/save and the Code toolbar actions.

Owned paths: editor-menu-actions.js (new tiny provider registry); menu-bar.jsx;
pseudocode-importer.jsx ONLY its file-input ref, menu provider method,
registration/cleanup and visibility/busy/reveal notifications; the shared chrome
message catalog; required overlay/package mirrors; focused controls and the
existing verify-chrome-sweep.mjs acceptance journey. Do not edit the importer’s
openCodeFile/saveCodeFile bodies, compiler/exporter, project-history, autosave,
example loading or GUI navigation. Other editor owners retain their hunks.

Refuse hidden, unmounted, busy-open, missing-input, unknown or ambiguous actions.
Recheck availability when clicked. Preserve saving while busy if the existing
save toolbar permits it. No fabricated command events or synthetic import path.

Qualification: provider lifetime/currentness controls and actual importer routing
controls; hosted browser must open the real chooser, import a supported text
file and download the same buffer/filename through the shared File menu.
Normal source qualification applies; documentation registration uses the user’s
explicit normal direct-main exception. No new builds or suites on the shared VPS.


Implementation: the contextual File entries now use a live editor provider and
the original chooser/save callbacks. Busy/visibility changes are rechecked on
click, duplicate visible providers refuse, and disposal removes registration.
27 focused menu/locale/history/lane controls pass, with syntax, unchanged-handler
and disabled-action mutation checks. The hosted chrome sweep now opens an actual
.bw source file and verifies the downloaded filename and exact UTF-8 bytes.
Hosted browser/build qualification remains pending in PR #1536; these host
controls do not qualify the product.

Next owner: refresh the final PR head and every enabled check. Diagnose any
failure without relaxing file-byte assertions, history checks or resource limits.
Merge only after exact-head qualification. A later menu slice can expose existing
Code conversion or target-specific export callbacks after agreeing their precise
owner boundaries; do not invent fallback exporters or alter compiler behavior.
