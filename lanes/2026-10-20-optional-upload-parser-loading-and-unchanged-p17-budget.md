## Optional upload parser loading and unchanged P17 budget — 2026-10-20

CLAIMED / DOCS ONLY — Codex GUI integration. This claim must land before
product implementation. Preserve file-upload and monitor ownership boundaries;
the existing Arcade tilemap startup claim does not include generic GIF or CSV
upload behavior.

Envelope: `overlay/scratch-gui/src/lib/file-uploader.js`,
`overlay/scratch-gui/src/lib/gif-decoder.js`,
`overlay/scratch-gui/src/lib/import-csv.js`, their tracked package mirrors,
focused upload/parser boundary controls, and this ledger. Only add the overlay
needed for a selected candidate. Keep the existing dependencies, parsers and
actual decoder implementations; do not substitute a reduced parser.

Move optional parser loading to the actual upload action only where the current
API can preserve its user-visible behavior. Keep the CSV picker creation and
click synchronous with user activation; parser loading may begin after a file
is selected. Preserve the actual parser receiver, options, delimiter handling,
complete/error callbacks, returned data, file removal and original error
identity. Explicitly test chunk-load failure and retry. Review synchronous
parser exceptions separately rather than silently converting or swallowing
them. For GIF, preserve frame order, disposal, transparency, costume/sprite
upload completion and error handling; the current first-frame callback is
synchronous, so an async boundary requires an explicit reviewed contract and
must not be presented as unchanged behavior.

Keep all existing P17 limits, baseline identities, ownership accounting and
other lazy chunk checks unchanged. No workflow, budget, dependency/pin,
side-effect declaration, VM authority, artwork validator or renderer change.
Source-attributed bytes are not emitted savings. A candidate needs complete
focused controls, actual upload journeys and the existing exact-head hosted
production/profile build and `I8086_ENFORCE_WEBPACK_BOUNDARY=1 node
scripts/report-webpack-ownership.mjs` result, with original failure retained.
Only measured emitted assets can establish that P17 passes; an import scan or
raw source reduction does not establish fit or faster startup.
