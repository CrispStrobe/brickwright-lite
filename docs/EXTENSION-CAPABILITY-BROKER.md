# Pinned extension isolation and native capability broker

Started 2026-08-30. Estimated engineering time: **7–11 hours**, excluding
runner queues. This is Task 3 of `docs/EXTENSION-SECURITY.md`, expanded into
independently releasable checkpoints.

## Threat model and shared definition of done

The gallery currently contains exactly 120 content-pinned entries. Their bytes
are verified, but the compatibility adapter evaluates them with `new Function`
in the main page realm. In the native app that realm owns the Tauri window, so
reviewed extension code has ambient access to every command granted to that
window. Hiding `window.__TAURI__` is not enforcement: same-realm code can retain
an invoke closure, reach `__TAURI_INTERNALS__`, monkey-patch a wrapper, or use a
confused deputy.

The completed system must instead bind every migrated extension to an immutable
host-created identity: exact URL -> verified digest -> pin entry -> worker ->
declared semantic capabilities. Extension-supplied slugs, command strings,
tokens and reply routing are never authority. Forged registrations, calls,
replies, cross-worker replay/reflection and stale sessions must fail closed with
named diagnostics.

Every checkpoint is pushed to `main` after coordinator review, focused tests and
mutation proof. The final claim is only complete when all 120 entries have an
explicit migrated or honestly deferred verdict, every migrated entry executes
outside the page realm, native operations cross the identity-bearing broker,
full CI/Pages is green, and the deployed browser proof passes with zero page
errors.

## CP0 — claim, census and executable contract (30–45 minutes)

- [x] Record the LANES claim and reconcile it by name against current remote
  `main`; publish this tasklist as the first checkpoint.
- [x] Build a deterministic 120/120 compatibility and capability census from
  the pinned snapshot, not mutable gallery URLs. Classify DOM/runtime access,
  fetch/import, WebSocket, Web Bluetooth, Web Serial/USB/HID, native bridge and
  nested-worker use; distinguish bundled built-ins from URL-loaded pins.
- [x] Add a fail-closed schema/version contract to generated gallery pins.
  Every entry declares capabilities (default `[]`) and migration status with a
  reason for every deferral. Unknown capabilities, missing entries, duplicate
  identities and new unclassified pins are errors.

DoD: census denominator is exactly 120; generated output is deterministic;
delete-one-entry, invent-one-capability and widen-one-declaration mutations each
make a named assertion red. Push checkpoint and require vendor freshness green.

Result: schema v1 classifies exactly 120/120 URL pins at immutable gallery
commit `fc94e19`: 27 zero-static-requirement worker candidates and 93 explicit
deferrals. The ten-class census measured DOM 49, runtime 79, fetch/import 25,
WebSocket 8, Web Bluetooth 4, Web Serial 4, Web USB/HID 0, direct native bridge
0 and nested worker 1. This is deliberately a static candidate census, not a
claim of runtime compatibility. Fourteen focused assertions pass; deleting the
unknown-capability validator makes its named mutation assertion red.

## CP1 — identity-bound verified worker path (2–3 hours)

- [x] Refactor the remote loader so the main realm fetches and hashes exact
  bytes before allocating a worker and posting source. No migrated pinned source
  reaches `new Function` in the page realm.
- [x] Bind a non-user-controlled worker identity to the verified pin at
  allocation. Preserve registration, `getInfo`, opcode calls, async replies,
  errors, locale and teardown through central dispatch.
- [x] Keep bundled BrickWright extensions on their existing internal path;
  migrate the zero-capability compatible cohort first and publish measured
  migrated/deferred counts rather than claiming all-gallery isolation early.

DoD: compatibility corpus proves every migrated extension registers and its
representative opcode agrees with the old adapter; its worker cannot see DOM,
runtime, Tauri globals, WebSocket, hardware navigator APIs or nested workers.
Mutations restoring main-realm evaluation, posting before digest verification,
trusting the extension slug, or accepting forged registration/call/reply frames
must fail by name. Push as an independently green product checkpoint.

Result: two immutable zero-requirement pins (`Clay/htmlEncode` and
`Lily/Cast`) are runtime-proven and promoted; 25 remain candidates and 93 are
honestly deferred. The host verifies bytes before worker creation, binds
identity before handshake, and retains raw messaging only in a trusted closure.
Concurrent loads deduplicate, registration is awaited, teardown rejects pending
work and terminates the worker, and the legacy unpinned FIFO remains distinct.
The frozen focused security matrix passes 49/49 with adversarial mutations.

## CP2 — default-deny semantic capability broker (2–3 hours)

- [x] Define a narrow, versioned vocabulary based on the census. Declarations
  carry semantic operations and resource constraints (for example BLE service
  UUIDs), never raw Tauri command names or wildcards.
- [x] Route worker requests through a broker keyed only by immutable host worker
  identity. Validate operation and arguments against the verified pin before
  calling any browser/native transport; default is refusal plus diagnostics.
- [x] Make lifecycle ownership explicit: worker termination revokes its broker
  sessions, replies cannot cross identities, and BLE rediscovery replaces rather
  than unions service allowances.

DoD: an undeclared request, invented command, cross-worker replay/reflection,
stale reply and forged slug all refuse; one declared vertical slice succeeds;
termination revokes it. Mutations skipping the declaration check, keying by
slug, accepting a wildcard, or unioning rediscovery allowances make named tests
red. Push broker core before broadening the migrated cohort.

Result: protocol v1 exposes only `Scratch.capabilities.request(operation,
args)` over the captured worker transport. Its closed semantic vocabulary,
strict envelopes and arguments, host-record declarations, per-worker replay
state and lifecycle revocation fail closed; caller identity fields and
wildcards are rejected. The initial transport-backed operation is read-only
project metadata, deliberately not a raw native command. Declaration and
WeakMap-identity mutations make named tests red.

## CP3 — native boundary and one real vertical slice (60–90 minutes)

- [ ] Carry broker identity and semantic operation to the native boundary
  without exposing a reusable raw invoke handle to the worker.
- [ ] Add Rust-side validation for the chosen vertical slice and keep web/native
  behavior aligned. Browser-only tests are not accepted as proof of the Rust
  command boundary.
- [ ] Show declared capabilities and explicit refusals in product diagnostics
  before/after extension load.

DoD: Rust unit/integration tests prove allowed, undeclared, malformed, replayed
and revoked calls; JavaScript protocol tests prove the same identity. Removing
either host or Rust validation makes an oracle red. Push native and UI pieces as
reviewable checkpoints; do not broaden permissions merely for compatibility.

## CP4 — migration closure and production browser acceptance (1–2 hours)

- [ ] Resolve every deferred pin: migrate it through an implemented broker
  capability or retain an explicit reviewed deferral with exact blocker. The
  report must state migrated/deferred counts summing to 120.
- [ ] Add a production-browser gate that loads one no-capability pin and one
  declared mocked capability fixture, executes real opcodes, proves the allowed
  operation succeeds, and proves undeclared plus cross-worker requests fail.
- [ ] Assert exact scenario denominator, zero page errors and no skipped cases;
  use condition waits only and upload success screenshot plus failure JSON.

DoD: all 120 entries classified, no migrated pinned source runs in the page
realm, browser and protocol mutations removing the broker check go red, and the
workflow executes the gate rather than merely naming it.

Progress: the first production-browser gate now loads the immutable served
`Clay/htmlEncode` pin through the real built VM, executes its reporter, proves
the host-derived `extension.0.0` namespace and closed pending-load lifecycle,
and requires exactly 3/3 scenarios with zero page errors. CI uploads its success
screenshot or failure JSON. The local production build and browser journey are
green; the declared-capability browser fixture and 120-pin migration closure
remain open, so CP4 is not marked complete.

## CP5 — release, adversarial review and closure (45–90 minutes plus CI)

- [ ] Run focused and full Node suites, gallery pin regeneration/check,
  overlay/package equality, production build/browser gates, Rust tests/checks
  for desktop and cfg-sensitive mobile surfaces where supported, and mutation
  proofs for every enforcement layer.
- [ ] Independently audit direct invoke, saved invoke closure, monkey-patching,
  forged worker frames, extension-id collision, cross-worker confused deputy,
  teardown/reload and diagnostic honesty. Record residual risks explicitly.
- [ ] Push each repair immediately; re-fetch/rebase before every checkpoint.
  Require final-tip vendor freshness, full build, all browser jobs, Pages deploy
  and deployed-GUI verification green, then rerun the exact broker journey
  against deployed Pages.
- [ ] Update `docs/EXTENSION-SECURITY.md`, move the LANES row to DONE with SHAs,
  counts, mutations and run IDs, and leave the worktree clean and synchronized.

DoD: the final remote tip is green on every required surface; the deployed
journey repeats the exact local/CI denominator with zero page errors; the docs
never claim isolation for a deferred entry or native enforcement that exists
only in JavaScript.
