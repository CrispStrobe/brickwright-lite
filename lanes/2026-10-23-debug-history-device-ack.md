# Wait for applied device before debugger browser media delivery

DONE — Codex hub-coverage owner, base `9a8d5df3f`, prerequisite for #1233
and the combined #1239 coverage candidate. Official heavy browser job
120187108575 failed waiting for Record enablement after selecting Z80 and
immediately injecting assembled media. The original screenshot shows Z80 idle,
Run enabled, Record disabled; no console/page error or recording refusal was
reported. It does not prove which later invalidation removed the runner.

The script does not await `setDevice`'s asynchronous compile/project-load
completion. The product publishes `bw-settings-change` with key `bw-device-id`
only after applying the committed device; a late device/project transition can
invalidate a runner created before that acknowledgement. Relevant browser/UI/
runner bytes match merged #1226; this is an existing setup race, not a proven
coverage-source regression. No existing claim owns this script.

Own only `scripts/verify-debug-history-browser.mjs`, focused source/protocol
ordering controls and this claim. Register a real applied-device observer before
selection; await the matching Z80 acknowledgement and visible Circuit commit
before sending media. Preserve Record/running, checkpoint/reverse/fork and
negative assertions, all existing bounds and actual runner behavior. Add bounded
setup evidence as useful. No product debugger/importer/board source or pins,
installed source, native lifecycle, other owners or qualification changes.

Require meaningful absent/wrong/late acknowledgement controls and final hosted
actual browser qualification; retain the official original once. Merge this
claim before implementation and require all enabled exact-head checks before
matched-head source merge.

The browser gate now observes the latest applied-device event before media,
awaits the Circuit tab’s selected state and shares the original 30-second setup
budget. The debugger panel mounts after media delivery and is awaited only then.
Five page-protocol source controls pass; omitted ACK wait, late observer, wrong
ACK admission, renewed timeout, latched readiness and omitted selected-tab
commit mutants are assertion-detected. A lazy-panel control rejects waiting for
the debugger panel before media delivery. Existing recording/running/checkpoint/reverse/fork checks remain.
Final hosted browser proof passed at qualified head
`64949a78117a3937ad5241e8ec41d1b8fffca3b2`: all nine recording/checkpoint/
reverse/fork checks passed with no browser diagnostics. The CI tree equals the
reviewed source tree; source landed in #1239 at 6da92497d2e8f51b2a75e137fab9e6946d3a3457. The
explanatory comment precedes the wait so its immediate media use remains visible
to the unchanged gate-shape scanner. All 44 focused controls pass.
