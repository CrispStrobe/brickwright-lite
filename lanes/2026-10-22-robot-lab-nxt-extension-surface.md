# Complete the missing NXT extension surface through standard protocols

DONE — Codex hub-coverage owner, isolated NXT API lane, base `f925c08c9`.
Continuation of coverage closure #1230; the sync/buttons/listen cell still
now has actual legonxt blocks. The motor-power supplier adoption #1226 landed
first under its existing owner; its methods and pin chain are preserved.

Own upstream boundary in CrispStrobe/extensions: new legonxt sync, read-only
button state/counter and ultrasonic-mode/raw-event blocks, with strict reply
validation and complete byte/error controls. No edits to motorOn, regulated or
unregulated power methods, and no counterfeit physical protocol. Research
stock firmware as facts only; retain all notices and copy no GPL source.

Own Lite boundary after the supplier is reviewed/qualified: NXT system command
reader and virtual button IOMap in `bw-sim/hubs/nxt/nxt-direct-commands.js` and
`nxt-virtual-hub.js`; actual-extension Lab tests; generated extension wrappers,
menu tables/surface classifications and mandatory pin/evidence consumers from
normal reviewed adoption; NXT learner exclusions if no word exists; coverage
matrix/handoff and this claim. No changes to existing motor-power semantics,
pane Run, physics solver, native or firmware source. Do not edit another
owner's pending pin candidate; compose after its normal merge.

Qualify actual SETOUTPUTSTATE sync in Lab physics, stock IOMAPREAD button
layout/count/status/bounds, sensor I2C mode writes and raw event reads, positive
and wrong-input/program controls, malformed/truncated/wrong-module replies,
and normal existing NXT routes. IOMap is a closed Button-module slice, not
arbitrary module access. The ultrasonic event byte remains an explicit model
estimate; no hardware accuracy claim. No reset-counter API (read/reset race).
Require all enabled final-head checks and affected clean real-extension guest
qualification before normal matched-head merges and predicted-tree proof.

Supplier CrispStrobe/extensions#63 merged at
`428d440353120856620dac86a257e8e1b91d7348` after all seven enabled checks passed.
The five live blocks pass 18 byte/error controls and eight real-extension Lab
guests through the canonical adapter, including actual VM button/ultrasonic
dispatch, zero-power and reversed-emitter controls. Existing motor
method bodies are unchanged. Named NXC refusal preserves the prior compile
subset without silently dropping a live block or uploading stale bytecode.

The Button IOMap projection exposes held bit `0x80` at `32 + index` and the
combined release byte at `8 * index + 4`. Other counter/event-phase slices are
explicitly refused: this does not model the stock firmware's sampling phases.
IOMAP reads never clear release counts. Existing 2000 ms button duration and
ultrasonic event interpretation remain estimates.

Lite adopts only the scoped `legonxt` pin, canonical wrapper and generated menu
entries; other supplier pins and the global bundle baseline remain unchanged.
The five live APIs are explicit learner exclusions; no new DSL words are claimed.
Affected clean Lab guests and surface/pin controls must pass, along with every
enabled final-head hosted check, before normal matched-head source merge.
Preserve the independently retained supplier/model mutation proofs and originals.
