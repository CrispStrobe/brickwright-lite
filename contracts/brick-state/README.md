# Neutral brick-state contract

Brickwright consumes version 1 of the Renode-side NDJSON contract through
`renode-state-adapter.js`. `v1/schema.json` and both NDJSON fixtures are exact
copies from `CrispStrobe/renode-spike-prime` commit `9c91ed9c` on
`feat/neutral-brick-state`.

Each snapshot is immutable before it reaches `VirtualSpikeHubState`. The
adapter rejects unsupported versions, malformed required fields, replays, and
unannounced sequence gaps. Unknown version-1 fields remain available but do
not affect the compatibility mapping. Lines and pending batches are bounded.
Commands use canonical key order, unique request IDs, and optional expected
sequence numbers. Renode and its runtime types never enter React, Scratch VM,
or transport adapters.

Version 1 accepts only these board/firmware pairs: `spike-prime` with
`lego-prime-v2`, `lego-prime-v3`, `pybricks-prime`, `spike-nx`, or
`brickwright-nuttx`; and `spike-essential` with `lego-essential` or
`pybricks-essential`. The board-qualified identity remains authoritative in
neutral state and each firmware has a distinct selector profile.

`BrickStateRuntimeConnector` owns transport lifecycle and constructs its
adapter and virtual hub state internally. UI code receives only neutral state
snapshots. Commands use generation-qualified request IDs and a bounded pending
map. Disconnect rejects outstanding work; reconnect starts a fresh adapter and
stale transport callbacks cannot mutate the current state.
