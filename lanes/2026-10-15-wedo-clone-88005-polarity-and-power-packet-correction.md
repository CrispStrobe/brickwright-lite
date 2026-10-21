## WeDo clone 88005 polarity and power packet correction — 2026-10-15

DONE — Codex, isolated existing adoption branch
`lane/wedo-lights-adoption-20261015`, worktree `wt-wedo-adoption-sparse`.
Follow-up to the published WeDo adoption claim and draft PR980. Human-observed
CoreBluetooth testing on the user's unbranded clone: physical port A responds
to protocol port 2; `[2,1,1,156]` lights the 88005 at full power and
`[2,1,1,206]` visibly dims it. Positive power and the previous payload-length
2 command did not light it. Internal RGB works. Standard 440/1000/1500 Hz
piezo commands were acknowledged but produced no audible sound; do not claim
this clone's advertised buzzer works or silently substitute host audio.

Envelope: this ledger; existing dedicated `wedo2unified` pin and generated
bundle/provenance table; focused `test/wedo2-lights-and-tones.test.mjs`.
Source changes belong upstream in extensions PR49: one-byte signed power,
explicit normal/reversed polarity with translated labels, and replaceable
inferred motor/light types while preserving real attachment announcements.
No global automatic clone detection, motor port remapping or other pin moves.
Publish upstream first, then adopt the immutable commit with the canonical
vendor script. Verify the measured packets, default positive polarity,
Stop All/off, known-device protection, immutable bundle identity and local
production build. Claim landed on remote main as `669107598` before Lite implementation.
Upstream `5fe7033f` is published; 28 focused adoption tests and immutable
targeted vendoring pass. Physical LED full power and dimming are user-confirmed;
local production compilation is qualified separately.
