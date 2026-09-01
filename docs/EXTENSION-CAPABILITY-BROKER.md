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

Result: schema v2 classifies exactly 120/120 URL pins at immutable gallery
commit `fc94e19`: 27 zero-static-requirement worker candidates and 93 explicit
deferrals. The ten-class census measured DOM 49, runtime 79, fetch/import 25,
WebSocket 8, Web Bluetooth 4, Web Serial 4, Web USB/HID 0, direct native bridge
0 and nested worker 1. This is deliberately a static candidate census, not a
claim of runtime compatibility. Fourteen focused assertions pass; deleting the
unknown-capability validator makes its named mutation assertion red. Schema v2
separates measured ambient `capabilities` from semantic `brokerCapabilities`:
all 120 grants default to `[]`, and an invented grant fails by pin name. This
prevents a source requirement such as `fetch-import` from becoming authority.

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

Result: 21 immutable zero-requirement pins are runtime-proven and promoted; the
remaining denominator is 99 explicit deferrals and zero unmeasured candidates.
The host verifies bytes before worker creation, binds
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

Replay accounting is constant-space: each session retains only its last
accepted request ID; duplicate, lower and skipped IDs fail without advancing
the sequence. Revocation leaves a WeakMap tombstone, so the same worker object
cannot be rebound to fresh authority and stale refusals retain host attribution.
A 256-entry broker
audit ring records host-derived worker identity, declarations, approvals,
refusal codes and revocation without retaining arguments, source, digest or
results. Each session reuses one frozen canonical declaration snapshot across
its audit entries. The frozen ring snapshot is the trustworthy input for a later product
diagnostics renderer rather than another ad-hoc console transcript.

## CP3 — native boundary and one real vertical slice (60–90 minutes)

### 2026-09-01 continuation tasklist (4–6 hours)

This progression replaces the original CP3 estimate after the isolated-realm
finding. Each item is a separately pushed checkpoint; later wiring cannot make
an earlier pure core look complete retroactively.

- [x] **CP3-C3 — typed relay envelopes (45–75 minutes).** Replace the Rust
  relay's deliberately byte-opaque payload with exact bounded
  load/call/terminate and matching reply variants. DoD: request/reply
  reflection, response-kind swaps, extra fields, deep/large data, duplicate,
  late and cross-session frames all fail by named mutation; focused Rust tests
  and production-library clippy pass.
- [ ] **CP3-C4 — caller-bound Tauri adapter (60–90 minutes).** Add separate
  main-request and broker-reply commands with disjoint exact-label ACLs and
  runtime checks of Tauri's injected sender before payload parsing. DoD:
  bounded origin-owned sinks, deadlines and teardown; fixed escaped delivery
  into only the local hidden broker; mutations of either label check, ACL,
  destination, session, correlation or serialization make a gate red. The
  semantic native command remains absent at this checkpoint.
- [ ] **CP3-C5 — isolated broker bootstrap (45–75 minutes).** Give the local
  broker asset a narrowly scoped bundle and one-shot host bootstrap, then bind
  the private JS protocol owner to the relay. DoD: owner/session/source/worker
  handles never enter the editor realm; wrong, duplicate and stale bootstrap,
  navigation, delivery and reply failures dispose exactly once; CSP permits
  only the audited local asset; mobile remains fail-closed.
- [ ] **CP3-D1 — real native vertical slice (60–90 minutes).** Register only
  `platform.kind.read` through the broker label, semantic Rust policy and exact
  empty arguments. DoD: editor direct/reflected/raw-command attempts are red;
  broker lease, sequence, expiry and revocation mutations are red; JavaScript
  and Rust return the same platform result without exposing a reusable invoke
  handle.
- [ ] **CP3-D2 — diagnostics and lifecycle closure (45–75 minutes).** Render
  declared, allowed, refused and revoked capability state from bounded redacted
  audit data. DoD: no pin source, digest, lease, correlation, raw args/results
  or dependency errors appear; destroy, navigation, reload and timeout leave
  zero stale authority and update diagnostics deterministically.
- [ ] **CP3-E — production evidence (60–120 minutes).** Reconcile current
  remote main and run the full Node, Rust, Tauri, build, browser and packaged
  desktop gates. DoD: focused mutation denominators remain exact, applicable
  GitHub workflows are green, artifacts show the real vertical slice with zero
  page errors, and every mobile/native limitation is either closed or an
  explicit fail-closed verdict rather than an implied compatibility claim.

- [ ] Carry broker identity and semantic operation to the native boundary
  without exposing a reusable raw invoke handle to the worker.
- [ ] Add Rust-side validation for the chosen vertical slice and keep web/native
  behavior aligned. Browser-only tests are not accepted as proof of the Rust
  command boundary.
- [ ] Show declared capabilities and explicit refusals in product diagnostics
  before/after extension load.
- [x] Add an executable topology contract for the native checkpoint. It keeps
  the current fail-closed state (no native capability command is registered)
  green, but makes any future registration fail unless Rust checks the exact
  `capability-broker` caller label before dispatch, constructs that webview
  hidden and unfocused from bundled local content, and grants the command only
  through a capability targeting that exact webview label (never its containing
  window, which would include sibling webviews). Tauri's build-time application
  manifest generates an ACL for custom commands; the broker receives only its
  generated permission, while the exact Rust caller-label check remains defense
  in depth. Because
  `core:default` lets `main` open another label's inspector, the future topology
  must also add `core:webview:deny-internal-toggle-devtools` to `main`. The
  contract includes mutations
  for an inverted label check, external content, a visible broker, a main-window
  grant, window-level broker scope, ambient broker permission, restored
  cross-label devtools authority and wildcard window scope.

DoD: Rust unit/integration tests prove allowed, undeclared, malformed, replayed
and revoked calls; JavaScript protocol tests prove the same identity. Removing
either host or Rust validation makes an oracle red. Push native and UI pieces as
reviewable checkpoints; do not broaden permissions merely for compatibility.

Architecture finding: CP3 cannot be completed securely inside the existing
editor webview while 99 deferred adapters share that privileged realm. They can
retain or monkey-patch Tauri invocation and observe any lease delivered there.
A Rust policy prototype was therefore rejected rather than shipped with an
unreachable or interceptable allow path. The smallest independent solution is
a hidden privileged broker webview/process which owns verification, workers and
leases; Rust rejects callers whose webview label is not that broker, and the
editor loses the corresponding native permission. Desktop implementation plus
iOS/Android lifecycle proof is estimated at 5–8 engineering days. Until that
privileged broker boundary is delivered, no native capability command is
registered and CP3 remains honestly open. `node --test
test/tauri-broker-topology.test.mjs` is the executable checkpoint: absence is
the only accepted pre-implementation state; partial topology is rejected rather
than treated as progress. Runtime completion still requires mock-IPC tests for
both labels plus packaged Linux and iOS/Android lifecycle evidence, because a
static contract cannot prove platform webview routing.

The native policy core is now implemented independently of Tauri registration.
It accepts only the exact `capability-broker` caller for lease issue, semantic
authorization and revocation; binds a host-created identity to a 256-bit opaque
lease; validates the closed `platform.kind.read` / `platform/default` pair and
an exactly empty argument object; enforces exact sequencing, TTL, request and
live-lease bounds; and retains only a bounded redacted audit. Twelve Rust tests
cover the allow path and every boundary above, including editor-originated
issue/revoke attempts that must leave a valid session unchanged. The module is
deliberately not registered as a command: a tested policy engine is not caller
isolation, and the topology gate continues to require the isolated webview
before registration.

The existing 17 native application commands now use Tauri's generated
application-command ACL instead of ambient registration. `main` receives the
exact 17 compatibility grants, the additive mobile capability receives none,
and a structural gate keeps the build manifest, invoke handler and capability
grants in exact lockstep. `main` also explicitly denies cross-label devtools,
closing the inherited `core:default` route that could otherwise open a future
hidden broker's inspector by label. This does not create the broker or register
a capability command; it establishes the least-privilege substrate first.

Desktop now constructs an inert broker shell from the bundled
`capability-broker.html`: it is hidden, unfocusable, undecorated,
non-resizable/non-closable, absent from the taskbar, incognito, and has
devtools disabled. Its navigation predicate accepts only the exact platform
local origin and document path with no URL variants; new windows are denied;
the document is scriptless under `default-src 'none'`. Three Rust URL tests and
a 20-mutation structural/asset gate cover this shell. It still owns no workers,
commands, leases or native results, so this is safe scaffolding rather than a
claim that CP3-C is complete. Installed Tauri has no supported registered child
webview API on iOS/Android; mobile remains explicitly open pending a native
broker process/plugin or an upstream-supported isolated webview primitive.

The desktop shell now owns a bounded managed policy state with a monotonic
clock. Any denied navigation revokes all leases before the navigation is
rejected, and `WindowEvent::Destroyed` revokes every principal; an allowed
local reload and unrelated window events do not. Bulk revocation retains the
same exact broker-label guard as issue/request/single-principal revocation, is
idempotent, and maps a poisoned lock to a sanitized unavailable result. No
broker command is registered, so lifecycle wiring still creates no reachable
native authority.

The broker-realm protocol core is also present as an unregistered, pure module.
It accepts calls only with a host-held owner object, snapshots exact sequenced
envelopes before mutation or asynchronous work, maps provider identities to
broker identities, and exposes only methods from the worker's bounded
registration. Arguments and results cross a bounded plain-data clone which
rejects accessors, symbols, exotic prototypes, cycles and oversized graphs.
Worker creation is transactional: the adapter must synchronously return an
owned cleanup target before its registration promise is observed. Failed
registration, termination, disposal and creation/disposal races revoke before
termination and cannot return a late result. Injected monotonic timers bound
resolve, registration, calls and both cleanup stages; timeout/disposal clears
public pending state immediately, consumes late settlements safely, and cannot
restore worker authority. Thirty-one focused tests cover replay/gaps, forged
ownership, cross-worker routing, stale replies, redacted dependency failures,
data-shape mutations, capacity, rollback, hung dependencies, timer failure and
lifecycle races. The module is deliberately not wired to Tauri or the editor
yet. The future adapter must honor AbortSignal to release foreign promises; JS
cannot forcibly detach a dependency which ignores cancellation even though the
broker's own maps remain bounded. Authenticated transport ownership therefore
remains an explicit blocker, and this checkpoint does not complete CP3-C.

Local Tauri 2.11 source inspection identified the desktop transport without
assuming transferable ports: separate main-request and broker-reply commands,
each ACL-scoped to its exact webview and each checking Tauri's injected sender
label again before parsing. Rust can target the exact hidden broker with a
bounded serialized frame; events and custom protocols carry no equivalent
sender authority. The semantic native command remains broker-only. This route
still needs executable IPC/session/serialization mutations before registration,
and mobile stays fail-closed because it has no isolated broker realm.

An unregistered Rust relay core now stages the state which that adapter will
own. Exact main/broker labels are checked before parsing; host-random session
and per-request correlation IDs are independently bounded and never reused;
editor sequence IDs cannot route broker replies; reply, session and serialized
delivery bytes have separate caps and monotonic deadlines. Expiry preserves
pending work until an exactly-once cancellation is emitted, and main/broker
teardown drains the correct authority. The relay now decodes exact typed
load/call/terminate operations and kind-bound success/failure replies. It
enforces JavaScript-safe IDs, object-only call arguments, restricted method
names, duplicate-key rejection, recursive data bounds, exact fields, unique
bounded load identities and literal termination success. Wrong request IDs,
reflected/wrong reply kinds and malformed replies leave the pending request
live only until its bounded valid retry or deadline. Twenty-two active Rust
mutations cover these typed boundaries plus correlation/session ABA,
cross-session swaps, duplicate/expired replies, global capacity, clock
regression and hostile JS serialization.

The emitted delivery intentionally targets a receiver which does not exist yet;
CP3-C3 is the typed relay core, not transport completion. CP3-C4/C5 must prove
the actual snake-case-to-JavaScript envelope mapping, one private protocol owner
per relay session, code-only error normalization, origin-bound result sinks,
injected Tauri caller objects and exact local delivery. Merely compiling this
module does not register a command or grant either webview new authority.

CP3-C4a stages the desktop Tauri adapter behind the same registration gate. Its
five command functions accept Tauri's injected `WebviewWindow`, perform the
exact main/broker label check first, use OS CSPRNG identifiers and monotonic
time, and keep the bounded relay plus origin-owned oneshot senders under one
short-held mutex. A request installs both relay and origin state before fixed
delivery to the exact broker label. Missing-window/eval failure closes the
whole affected session and resolves every sibling origin; denied navigation or
broker destruction drains every session alongside policy revocation. Four Rust
tests include two simultaneous origins and a dropped receiver, while a
structural mutation gate covers label, CSPRNG, insertion-before-delivery and
rollback ordering. The commands remain absent from `generate_handler!`, the
application manifest and every capability. This is a compile-tested adapter
core, not CP3-C4 completion: no receiver acknowledges delivery, request timeout
is not yet owned by the adapter, and no command is reachable until C4b/C5 add
the executable bootstrap, deadline race and disjoint ACL proof together.

CP3-C4b closes the adapter's in-memory cancellation and lifecycle races while
keeping that registration gate shut. Every request now has a fixed 30-second
deadline and a drop guard installed immediately after successful delivery;
timeout or caller-future cancellation removes the exact relay delivery before
discarding its origin sink. A mismatch drains the broker fail-closed. Reply and
timeout serialize through the same mutex, so exactly one wins, late replies are
refused, and a wrong reply cannot consume the pending origin. Broker teardown,
the prepared main-window revocation path, orphan origins and poisoned state all
drain without leaving reusable authority. Eleven adapter tests cover these
races and cleanup paths, alongside the twenty-two relay tests and the existing
structural registration/ACL gates. The main-window destruction hook, receiver,
command registration and capabilities are still deliberately absent; those
executable topology and caller-ACL proofs remain CP3-C5/C4 completion work.

CP3-C5a stages the document-start bootstrap without opening that gate. Tauri
now embeds the reviewed protocol and receiver sources into an initialization
script guarded to the platform's exact top-level local broker URL. A one-shot
host-factory entrypoint can install one immutable receiver; it is deliberately
not invoked because the isolated realm does not yet have a production pin
resolver or worker host. The receiver maps the three typed Rust envelopes to
the exact camel-case protocol calls, owns one protocol and opaque owner per
session, bounds live and retired sessions, emits one caught reply attempt, and
normalizes only genuine protocol errors to the shared code vocabulary. Generic
or forged errors become `operation-failed`, reply failure retires and disposes
the affected session, and page hide disposes every live protocol. Ten new
executable bootstrap tests use the real protocol core for success, replay,
cross-session, malformed-data, capacity, immutable-realm, transport-failure and
unhandled-rejection paths. The HTML remains scriptless under `default-src
'none'`; commands, ACLs, the host factory invocation and native session-dispose
wiring remain absent, so this is a C5 bootstrap checkpoint rather than C5 or
CP3 completion.

## CP4 — migration closure and production browser acceptance (1–2 hours)

- [x] Resolve every deferred pin: migrate it through an implemented broker
  capability or retain an explicit reviewed deferral with exact blocker. The
  report must state migrated/deferred counts summing to 120.
- [x] Add a production-browser gate that loads one no-capability pin and one
  declared mocked capability fixture, executes real opcodes, proves the allowed
  operation succeeds, and proves undeclared requests fail. Cross-worker and
  replay frames remain adversarial transport tests because the safe worker API
  exposes neither worker identity nor request IDs.
- [x] Assert exact scenario denominator, zero page errors and no skipped cases;
  use condition waits only and upload success screenshot plus failure JSON.

DoD: all 120 entries classified, no migrated pinned source runs in the page
realm, browser and protocol mutations removing the broker check go red, and the
workflow executes the gate rather than merely naming it.

Progress: the first production-browser gate now loads the immutable served
`Clay/htmlEncode` pin through the real built VM, executes its reporter, proves
the host-derived `extension.0.0` namespace and closed pending-load lifecycle,
and requires exactly 3/3 scenarios with zero page errors. CI uploads its success
screenshot or failure JSON. The local production build and browser journey are
green. Runtime corpus review now proves 25 worker pins, including four whose
measured HTTP use is the worker-supported `Scratch.fetch`; 95 remain deferred.
Every deferral is backed by a generator-owned, pin-specific reviewed reason,
with an exact 95-entry ledger and a mutation ratchet forbidding generic static
scan placeholders. The declared-capability production gate uses two exact
content-pinned proof identities outside the 120-entry gallery census. The same
restricted-worker opcode source receives `project.metadata.read` for one
identity and no broker capabilities for the other, proving allowed and
default-deny results, monotonic sequential requests, closed pending loads,
teardown/reload and zero page errors. The safe worker API deliberately owns
request IDs, so replay refusal remains at the adversarial transport boundary;
the browser gate does not add a replay or raw-frame escape hatch merely to
attack itself. Together with the exact 25/95 disposition, this closes CP4;
the separate multi-day native boundary remains tracked by CP3.

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
