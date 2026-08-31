# D38 AVR scheduler-timebase closure

Owner: `fab-avr-timebase` (Codex coordinator; audit agents are advisory)

Budget: 4–6 hours across five independently pushed checkpoints. The work starts
in `sb3-creator`, then crosses the pinned vendor/image boundary into Lite. The
coordinator reviews every change, runs the native compiler and production
browser proofs, resolves concurrent `main` movement, and pushes each accepted
checkpoint directly to the owning repository's default branch.

The defect is narrower than “AVR does not work”: a cooperative AVR build with
tasks but no `wait` emits an idle scheduler that calls `bw_now()`, while the
preamble only defines `bw_now()` when another feature happened to set
`_cUses.now`. Five of eighty AVR examples reproduce; `debug-timing-bugs` uses
one of them and is the sole lesson image that D2 could not ship.

Heavy commands must obey the repository load guard. Prefer the pinned SDKs in
`/mnt/volume1/toolchain` and consolidated GitHub CI over competing local builds.

## Checkpoint 1 — pin the dependency contract (35–50 minutes)

- Add an AVR-specific generator sentinel using two cooperative scripts and no
  wait/timer feature that incidentally requests the clock helper.
- Prove the generated scheduler calls `bw_now`, the helper is defined exactly
  once, and removing the dependency promotion makes the test red.
- Distinguish AVR, 8051, ARM, and single-main programs so a broad “always emit
  the helper” patch cannot pass unnoticed.

Definition of done: focused tests fail on current `origin/main`, pass only when
the AVR task/idle dependency is explicit, and include negative controls for a
single-main AVR program and other cores. Push the failing contract or the
minimal contract+repair checkpoint to `sb3-creator/main`.

## Checkpoint 2 — repair and compile the AVR corpus (55–85 minutes)

- Repair the producer-side dependency before helper emission; do not patch a
  vendored Lite copy or special-case the five examples.
- Generate C for every AVR-family gallery program and compile it with the real
  pinned avr-gcc toolchain, recording exact numerator/denominator and failures.
- Pin the five known D38 reproducers and at least one ordinary wait program as
  named mutation controls.

Definition of done: all eligible AVR examples compile natively; the five D38
programs move from link failure to valid Intel HEX; no generated program gains
duplicate helpers or cross-core register vocabulary; focused and relevant
upstream suites pass; mutation of the dependency line fails by name. Push the
repair and census evidence to `sb3-creator/main`.

## Checkpoint 3 — re-vendor and complete the shipped-image set (45–70 minutes)

- Advance Lite's `sb3-creator` pin through the normal sync scripts and refresh
  tracked overlay/package twins without touching unrelated generated files.
- Rebuild the lesson-image manifest from the pinned source and real toolchain.
- Replace D38's named refusal with the exact `debug-timing-bugs` AVR image while
  preserving source hash, target, format, compiler provenance, and freshness.

Definition of done: the pin is a full 40-hex commit and an ancestor of the
source repair; every lesson bench needing a prebuilt image has one; manifest
and directory are set-equal; changed source misses the image; regeneration is
byte-identical; vendor freshness and mirror gates pass. Push to Lite `main`.

## Checkpoint 4 — production offline debugger proof (50–75 minutes)

- Drive the actual `debug-timing-bugs` lesson/example in a production build.
- Abort all cross-origin traffic, start its AVR debugger from the shipped image,
  and prove the panel identifies the image provenance rather than compiling.
- Exercise run, pause, and at least one meaningful scheduler/time observation
  belonging to this program; retain screenshots and structured failure data.

Definition of done: watched production Chromium is green with zero external
requests and zero page errors; the expected AVR image is selected; the runner
advances program time and exposes the repaired task state; an edited source
misses/refuses rather than reusing stale firmware. Wire the gate only after its
first watched green run, then push it to Lite `main`.

## Checkpoint 5 — close D38 without erasing boundaries (30–45 minutes)

- Update D38 in PLAN and the wave-defect ledger with measured counts and shas.
- Restore the affected lesson copy/version only if its present refusal text is
  now stale; keep the general edited-AVR/ARM hosted-compiler boundary explicit.
- Move the lane to DONE and reconcile totals against the current remote ledger.

Definition of done: generator, native-corpus, shipped-image, lesson, l10n,
vendor, gate-coverage, and production-browser suites pass; all accepted commits
are ancestors of the relevant GitHub default branches; Lite local HEAD equals
`origin/main`; unrelated lockfile/translation edits remain untouched.
