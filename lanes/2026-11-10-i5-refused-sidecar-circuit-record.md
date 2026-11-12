# I5: a refused project sidecar must not rewrite the known circuit record

Status: claim and change in one PR. Owner: browser-shard I-task lane (I5).
Base: main `d318ed6e22fb`.

Scope: the Circuit tab's hide flush in
`overlay/scratch-gui/src/components/tw-pseudocode/circuit-tab.jsx` (and its
integrated copy), new `overlay/scratch-gui/src/lib/circuit-autosave-record.js`
(and its integrated copy), new
`test/refused-sidecar-keeps-circuit-record.test.mjs`, the I5 row of
`docs/OPEN-TASKS-2026-09-29.md`. No verifier, threshold, pin or workflow change.

Defect: bw-circuit-ui `9d7a9a26` (adopted at `eb7e1c91`) changed its own
debounced autosave to write a file-owned circuit WITH its resolved nets. The
host's hide flush still wrote plain `toJSON()` for the same circuit. Opening a
project switches the active tab, which hides the Circuit tab and runs that
flush, so opening a project whose sidecar is refused (future version or invalid
JSON) rewrote the known circuit record into the other shape. Which writer ran
last decided the bytes, hence the future-vs-invalid timing dependency.

Fix: one record builder that equals bw-circuit-ui's rule byte for byte (nets and
empty-canvas writes while a file owns the canvas), used by the host flush. The
new test replays the actual bundle listener and actual hide flush for both the
future and the invalid sidecar and requires every known record byte-identical.
