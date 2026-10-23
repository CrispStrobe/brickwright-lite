# Wait for applied device before debugger browser media delivery

CLAIMED — Codex hub-coverage owner, base `9a8d5df3f`, prerequisite for #1233
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
