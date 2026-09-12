# Pinned package migration takeover

2026-09-12. User authorized continuing the stalled migration without waiting
for the previous session's usage limit to reset.

## Preservation and ownership

The prior worktree `/mnt/volume1/code/lego/wt-lite-packages` remains unchanged.
Its tracked diff from `411828a304dd84759cd4c1fb82444e72944ffbdc` plus the two new
pin-script/test files was captured using a separate temporary Git index in
checkpoint `44872243ae64a6bb1a3cad62dd05c54c51b00e69`. Its tree is
`8b4b7a3caf21854d0dc165141ae13c25bfe77285`. The original tracked diff SHA-256 was
`68735a195840726669a0035ac56f9d8849556242ddb115a4a70a6eae2b6e252b` before and
after capture. No stash, reset, original-index mutation or untracked-file removal
was used. The checkpoint is preserved work, **not a qualified migration**.

Root owns `feat/package-migration-takeover` in an isolated worktree. The previous
screen session was notified not to resume conflicting writes without coordination.

## Acceptance work

- Verify removed copied roots do not discard local behavior or required assets.
- Verify exact package URL/repository/SHA consistency and installed source
  identity; a lockfile containing a SHA is not proof of installed bytes.
- Reconcile the restart-only execution-policy GUI candidate, using an actual
  installed engine package that exports the policy contract.
- Regenerate pin-derived census, notices and capability/provenance reports.
- Build from the pinned dependencies and run focused plus full app tests.
- Reproduce circuit-UI `sweep-canvas-live` failure without weakening its drag
  assertion; preserve default full interaction coverage and diagnostic artifacts.
- Run actual app browser selection/persistence/refusal/reconstruction journeys.
- Keep native experiments gated. Package migration does not establish native
  CPU/peripheral support, a wired GUI backend, or 4.77 MHz capacity.

## Initial facts

Snapshot dependencies: bw-board `d7436dc782dd1c499f0fb29ae5cfaa8ab78ec2d6`,
bw-circuit-ui `657e0217fa14fe345ad2781ae87d7f1e9b1e42fe`; sb3-creator remains
copied and pinned separately. Engine policy implementation is on the reviewed
engine feature branch, not the snapshot's engine pin. Circuit UI PR20 has a
33/34 interaction result, with only live-sweep dragging failing; cause still
requires reproduction. Its package metadata says MIT but its LICENSE is MPL-2.0;
do not label both imported packages MIT or erase the actual license notice.

No merge or deployment is established by this document.
