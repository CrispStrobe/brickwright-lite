# 74C922 physical keypad encoder campaign

Started 2026-08-30. Estimated hands-on work: **3–5 hours**. The sidecar and
renderer already exist, but the richer `m74c922.js` model is unreachable and
the registered shortcut does not scan a separately wired matrix keypad. This
lane closes the electrical path rather than merely importing a dead module.

## Shared definition of done

1. Production behavior follows actual nets; no part-name or hidden parameter
   bridge may bypass the keypad's row/column wiring.
2. Tests distinguish the feature from the old shortcut and demonstrate that
   every claimed detector can fail under a targeted mutation.
3. Source-of-truth engine work lands in bw-board first, then Lite updates its
   pin and complete vendor tree. Overlay/package mirrors remain byte-equal.
4. Browser evidence uses a production build, asserts exact scenario counts,
   captures artifacts, and fails on page errors or skipped cases.
5. GitHub unit/build/browser/deploy/deployed-GUI jobs and vendor freshness are
   green at the final `main` tip.

## Wave A — contract and engine integration (75–120 minutes)

- [ ] Reconcile CD74C922 pin names, active levels, code order, oscillator/scan
  timing, rollover and release behavior against the sidecar and model.
- [ ] Replace the inline shortcut with a wrapper around `m74c922.js` that
  drives X1–X4, senses Y1–Y4, publishes A–D plus DA, and tri-states outputs
  when active-low OEB is deasserted.
- [ ] Unit-test all 16 row-major codes, release, two-key rollover, OEB, reset,
  and deterministic scan timing. Mutation DoD: address-bit, DA, OEB and scan
  polarity changes each make a named assertion red.

## Wave B — physical circuit and product surface (60–90 minutes)

- [ ] Add the 74C922 to the designer palette without duplicating its existing
  sidecar or renderer; confirm placement/export/import round trips.
- [ ] Build one small shipped bench/example with a separate `keypad_4x4`,
  pull network, 74C922 and visible A–D/DA consumers.
- [ ] Prove key presses cross real row/column nets into the encoder. Mutation
  DoD: sever one matrix wire and show the corresponding key no longer encodes.
- [ ] Preserve ordinary clickable keypad behavior and corpus invariants.

## Wave C — browser acceptance and release (45–75 minutes plus CI)

- [ ] Add a browser gate that places/loads the real bench, enters Simulate,
  presses at least keys `1`, `6`, and `D`, and observes three distinct exact
  codes with DA asserted; release clears DA and OEB floats the outputs.
- [ ] Capture success/failure artifacts, assert the scenario denominator, use
  condition waits only, and wire the gate into an executable workflow command.
- [ ] Remove only `lib/bw-board/m74c922.js` from the dead-module exclusion and
  update ROADMAP §4.4 with measured evidence; the ratchet must prove the count
  shrank for a real consumer, not a cosmetic import.
- [ ] Run focused/full upstream tests, vendor checks, Lite focused/full tests,
  production browser proof, mutation proofs, GitHub CI/deploy, and a deployed
  rerun. Move the LANES claim to DONE with commits, counts and run IDs.
