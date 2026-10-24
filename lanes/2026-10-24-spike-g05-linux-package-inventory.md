## SPIKE G05 Linux package inventory and refusals — 2026-10-24

CLAIMED — Lite packaging (G05 first pass), isolated branch
`lane/spike-g05-linux-inventory-20261024`, base current `main`.
Envelope: this ledger, `scripts/build-spike-linux-desktop.mjs`,
`test/spike-linux-package.test.mjs`, new
`test/spike-linux-package-refusals.test.mjs`, `docs/SPIKE-LINUX-DESKTOP.md`
and `docs/spike-micropython-installed-resources.md`. Inventory the components
and notices the Linux package distributes from source, flagging unverified
items and licences outside the accepted set. Fix only demonstrated
relocation/missing/tampered-input refusal gaps with fail-before/pass-after
tests. No dependency pins, workflows, firmware, Runtime or native source change;
no redistribution, signed-installer or non-Unix claim.
