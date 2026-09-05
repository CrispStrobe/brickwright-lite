# Debugger next roadmap

Started 2026-09-05 after the full-system debugger roadmap reached its browser
acceptance gate. This document owns the next twelve deliverables. They land in
order; a later feature cannot weaken an earlier fidelity or replay guarantee.

Heavy compiler, corpus, browser and waveform qualification belongs in GitHub
Actions. The small development VPS runs only focused unit/live-core tests,
overlay/package parity, static workflow contracts and short smoke tests.

## Delivery ledger

| step | deliverable | acceptance evidence | state |
| --- | --- | --- | --- |
| 1 | CI-only qualification harnesses for candidate Z80 and W65C02 cycle cores | pinned-source provenance; retire corpus; non-empty bus traces; reset/IRQ/NMI/HALT or WAI/STP vectors; snapshot-at-every-microstep replay hashes; bounded transfer receipts | complete — hosted run 33981645691: Z80 32/32 retire/timing, 51,311-byte WASM, 3 ms compile, 0.10 ms instantiate and 16.26 M ticks/s in one 200k-tick batch; JSMoo rejection reproduced across snapshot, BBR-bus and WAI-wake gates |
| 2 | opt-in floooh/chips Z80 provider | explicit provider selection; fast core remains default; recorded pin cycles; resumable versioned snapshots; unavailable module fails closed; browser cost receipt | complete — opt-in lazy seam, pinned identity, explicit snapshots and immutable recorded cycles; bounded batch transport; fast default; module/load/ABI/cost failures refuse without fallback |
| 3 | qualified JSMoo W65C02 provider | CMOS corpus and bus/snapshot gates pass before vendoring; opt-in selection; fast core remains default; rejected candidate leaves cycle controls unavailable | complete as a rejected candidate — conditional boundary publishes pinned reasons, loads no JSMoo code, retains the fast target and cannot advertise cycle/reverse-cycle; promotion requires a future corrected candidate |
| 4 | waveform and timing views | bounded address/data/control/pin lanes aligned to the canonical cursor; trigger navigation; zoom/range controls; VCD/JSON export; recorded/reconstructed provenance visible | complete — bounded 4096-event/64-lane model, canonical cursor synchronization, trigger/zoom/pan controls, fidelity labels, 128-column render bound, deterministic JSON and fail-closed single-domain VCD export |
| 5 | timed-input replay through HALT/WAI and output resynchronization | replay advances only to the next recorded input boundary; wake inputs retire deterministically; historical replay suppresses external effects; restore/resume performs one complete output-state sync | complete — exact input-cursor/timestamp interleave, W65 WAI/NMI live wake, fail-closed STP/overshoot, replay-era output suppression and exactly one complete success/rollback resync |
| 6 | cycle-granular reverse execution | enabled only for recorded, resumable cycle providers; reverse step/continue restores a mid-instruction checkpoint and verifies every replayed cycle event | in progress — verified transactional cycle replay model landed; runner controls and live provider integration remain |
| 7 | portable debugger sessions | versioned import/export with firmware/source hashes, bounded trace, branches, checkpoints, bookmarks and annotations; checkpoint comparison does not expose opaque snapshots | planned |
| 8 | deterministic divergence bisection | find the first mismatching event between a known-good checkpoint and bad boundary in logarithmic replay probes; preserve the source state on every failed probe | blocked by step 7 |
| 9 | multi-CPU correlated debugging | one branch-qualified timeline across named clock domains; cross-core triggers; interrupt/message causality; no numeric timestamp comparison across uncorrelated domains | planned |
| 10 | production browser CI optimization | preserve deploy-order and fail-closed guarantees; front-load relevant gates; shard only with one authoritative build artifact; measure runner minutes and time-to-first-debugger-verdict | in progress — debugger gates front-loaded |
| 11 | reconcile and archive remaining worktrees | inventory dirt, reachability and unique commits; integrate reviewed work only; tag/archive superseded branches without deleting unowned changes | planned |
| 12 | restore a fully green remote `main` baseline | classify every terminal failure as product, gate or infrastructure; repair in-scope failures; rerun authoritative workflows; record exact green run IDs | planned |

## Non-negotiable contracts

- A cycle is executable evidence, not a timing-table estimate or countdown.
- An advertised replay boundary must serialize all state that can change the
  future, including decoder temporaries, pending pins, clocks and peripherals.
- Candidate code stays CI-only until its license, provenance, conformance,
  browser cost and failure behavior are proven at a fixed commit.
- Qualification reports fidelity gaps as evidence. In particular, floooh's Z80
  holds its internal M1 microstep and architectural state under `WAIT`, but its
  tick API does not re-emit the prior bus-control pins during held ticks. Any
  eventual provider must preserve that visible bus state in its adapter.
- Replay never repeats terminal, audio, video, board or host callbacks. After a
  successful historical move, consumers receive one explicit state resync.
- Trace/session readers validate schema, sizes, hashes, ordering and topology
  before mutating live state. Imported text is data, never executable code.
- Every UI pane reads the same immutable selected cursor and labels evidence
  fidelity. Missing evidence remains visibly unavailable.
- CI optimization may reduce duplicated work or feedback latency, but cannot
  discard per-push verdicts, publish an older tree, or make a gate soft.
- Worktree reconciliation is read-only until ownership, unique commits and
  remote reachability are known. User or agent work is never destroyed merely
  because a branch looks stale.

## Checkpoint discipline

Each numbered step receives its own reviewed commit or small commit series and
is pushed to remote `main` after focused tests. The ledger changes to complete
only when its acceptance evidence exists. Hosted CI run IDs and measured
receipts are added as they become authoritative; intentions and skipped jobs do
not count as evidence.
