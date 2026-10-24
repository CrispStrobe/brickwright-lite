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

## Continuation — 2026-10-24 (closure pass)

Branch `lane/spike-g05-closure-20261024`. Envelope adds
`scripts/gen-spike-linux-crate-inventory.mjs`, `scripts/lib/spike-linux-notices.mjs`,
`scripts/verify-spike-linux-installed-layout.sh`,
`docs/generated/spike-linux-crate-inventory.json`, `docs/spike-linux-licence-review.json`,
`test/spike-linux-notices.test.mjs` and the G05 paragraph in
`docs/SPIKE-STATUS-AND-LANES.md`. No pins, workflows, firmware, Runtime or native source.

Closed:
- Linked crate set for the Linux binary (`custom-protocol`, `x86_64-unknown-linux-gnu`)
  is generated from `cargo metadata --locked --offline`: 365 linked, 92 build-time
  only, 161 not linked on this target. It is bound to the Cargo.lock SHA-256. A test
  partitions every locked crate and fails on any lock change without regeneration.
- The flagged licences are reviewed with per-licence obligations. All of them are
  notice-retention or file-level obligations that fit the policy. The five linked
  MPL-2.0 crates are unmodified crates.io releases, and their source URL and
  checksum are recorded.
- Notice gates in the builder. It refuses a runtime that lacks any of the seven
  required Renode/.NET/LLVM notices, and it refuses an inventory that does not
  match Cargo.lock. In the full build it refuses a linked set that differs from the
  inventory, installs crate licence files plus LICENSE, THIRD-PARTY-NOTICES, the
  inventory and the review under `usr/share/doc/brickwright/`, and refuses any
  crate licence-file gap that is not on the reviewed list.
- Installed-layout check script. One read-only run against the existing installed
  image: 32 checks PASS (files, modes, ownership, links, runtime notices). The 5 doc
  checks FAIL, as expected, because that image predates this builder.

Open, and why:
- 13 linked crates ship no licence file (listed in the review); upstream licence
  texts are needed. `selectors` (MPL-2.0) is among them.
- LGPL `tlib`, the Gtk#/NetMQ/Packet.Net notices and the mixed `mcs` notice in the
  Renode distribution are flagged, not cleared. It is not verified which of them
  the renode bundle embeds, and no corresponding-source pointer is recorded.
- A package built with the new builder has not been compiled or installed yet
  (no local cargo build). It needs a hosted build plus the layout check.
- Non-Unix staging and signed installers need other runners and signing
  credentials. Firmware L11/Runtime must supply the inputs named in the G05
  contract. None of this is claimed.
- No redistribution or licence clearance claim; `redistributionValidated` stays false.

## Continuation — 2026-10-24 (second closure pass)

Branch `lane/spike-g05-closure2-20261024`. Envelope adds
`docs/notices/rust-crates-supplemental/`.

Closed:
- 13 crates without licence files now have reviewed texts with per-file digests and
  origins. Upstream repository files are used where they exist; `custom_debug` and
  `selectors` have none upstream, so they get the standard Apache-2.0 and MPL-2.0 texts
  plus attribution notes. The builder copies them after a digest check and still
  refuses any other gap or a stale entry. An offline run of the collection step: 651
  files for all 365 linked crates.
- Renode composition reviewed read-only. tlib, NetMQ, Packet.Net and a vendored pip
  LGPL notice ship, and all their notices are present. Gtk# and mcs are not shipped
  (not applicable).
- Signed delivery recorded. macOS general app: release run 39680422030 (v0.1.26), App
  Store identity, `productbuild` pkg, no notarization; it does not stage SPIKE Renode.

Open, and why:
- Corresponding-source binding for tlib, NetMQ and Packet.Net: the Renode runtime's
  source commit and NuGet versions are not recorded in the runtime provenance. The
  runtime producer must record them.
- Full-build exercise: no hosted workflow runs `scripts/build-spike-linux-desktop.mjs`.
  It needs a hosted packaging job, which is outside this envelope (no workflow added, no
  local cargo build).
- Windows signing is blocked: no Authenticode certificate. SPIKE on macOS needs
  JIT/child-process entitlements and signed nested executables (contract only). There is
  no Debian signing key.
