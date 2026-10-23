# Preserve coherent firmware observations at lockstep boundaries

DONE — Codex hub-coverage owner. This extends #1234/#1239’s WP6 envelope.
Runtime #60 landed at `0ff9e15d5fdd0ba755e4cb1773ebc3d3e79e3b3f` after its
two enabled exact-head checks and real own-firmware qualification passed. Lite
#1239 landed at `6da92497d2e8f51b2a75e137fab9e6946d3a3457` from qualified
head `64949a78117a3937ad5241e8ec41d1b8fffca3b2` after all 32 enabled checks
succeeded. Reviewed, CI and landed trees and merge parents were verified.

Original run 39878970104 passed timed/degrees acceptance, then encountered a
publication unavailable at a paused lockstep boundary. That failed original
remains retained; it did not qualify Python. Runtime now distinguishes typed
transient unavailability from malformed data. Only paused lockstep/deferred-
control observations may be absent; ordinary upload/packet sampling stays
strict. Status, output, storage and real matched ACKs remain independent.

Lite separates real control ACK handling from status freshness. Queued Stop
submits immediately after the preceding ACK. An ACK frame or non-advancing
status cannot complete retained START; COMMIT READY survives prior COMPLETE.
Reset/wrap refuses. Fixed physical checkpoint windows retain every original
quantum and identify the actual observation time. A missing final sample is
never replaced by retained bytes. Available output remains checked independently
for forbidden late output, including when status is unavailable.

The explicitly selected qualification graph uses Runtime’s verified merge;
paired Infrastructure, firmware and support inputs remain fixed. No CPU-time,
clock-quantum, native model, product/package pin or timeout substitution occurred.
Malformed packets, permanent publication loss, missing output and wrong ACKs
remain refusals within unchanged virtual/wall bounds and motion thresholds.

Official run 39892243464 passed both motor comparisons and all six real Python
cases through the actual Lab consumer. Independent original reading verified
the fixed graph and source/input/output hashes. The matrix’s own-firmware cells
are green for this boundary. Source/protocol controls and meaningful mutations
remain distinct from the actual guest proof. No standalone raw-REPL, native-app,
reference-firmware or hardware accuracy claim follows.
