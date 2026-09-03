# What an extension can reach, and what it should have to ask for

Security work and its rationale. The status under each task is authoritative;
the remaining tasks are deliberately independent checkpoints.

## What is true today (verified 2026-08-28, not remembered)

`extension-manager.js` now has two deliberately different remote paths:

- Every exact URL in the shipped gallery pin map is fetched, hashed and compared
  with the reviewed snapshot. Twenty-one runtime-proven, zero-authority pins
  then execute in identity-bound workers; 99 explicitly deferred pins retain
  the compatibility adapter. A changed known URL is refused and there is no
  worker-to-adapter fallback.
- Every other HTTP(S), relative, `data:` or `blob:` URL runs in the Scratch VM
  extension worker. HTTP(S) entry points still ask first and explain that the
  worker retains HTTP(S) fetch/import, but no DOM, editor runtime or Tauri
  native bridge. Direct WebSockets are blocked: otherwise code could dial the
  app's loopback Scratch-Link server and regain native Bluetooth. Nested worker
  constructors are blocked as well, so code cannot create a fresh socket-capable
  realm. WorkerNavigator hardware entry points (Bluetooth, serial, USB and HID)
  are removed when the host browser exposes them.
  Extensions which demand `Scratch.extensions.unsandboxed` fail explicitly.

Worker isolation alone was insufficient: downloaded code still owns
`postMessage` and could forge Scratch dispatch frames. The central broker now
accepts only the allocation/registration lifecycle, confines service names to
that worker's `extension.<worker>.<id>` namespace, and binds replies to the
worker which received the corresponding call. Calls into `runtime`, `gui`, or
another worker are refused. A runtime test exercises both the permitted
lifecycle and the forged-call/forged-reply cases.

The remaining in-process surface is therefore 99 explicitly deferred
content-pinned entries, not arbitrary confirmed code. Those reviewed bytes can
still invoke Tauri commands — Bluetooth, file writes and serial flashing —
which is the remaining least-privilege question.

None of this is an App Store problem, and the earlier worry that it might be was
overstated: Guideline 2.5.2 explicitly permits code run by WebKit/JavaScriptCore,
and Scrub — a Scratch *web browser* that also bridges arbitrary pages to
Bluetooth — has been on the App Store since 2021 (id1569777095). The reason to
do the work below is that it is right, not that review demands it.

---

## Task 1 — Pin the gallery by CONTENT, not by host

**Status: implemented 2026-08-28.**

**Why this is first.** The gallery is the *trusted* path: ~117 extensions load
with no prompt at all. A compromise of that GitHub Pages host is arbitrary,
native-capable code on every device, silently. The arbitrary-URL tile at least
asks. Fixing the loud path while the quiet one stays unverified would be
backwards.

We already have the answer in-house. `docs/FETCH-PINNING.md` established the
doctrine after a CDN served a stale commit and the run cheerfully reported
success: **a fetch by mutable name quotes a freshness it does not have.** That
doctrine is applied to every build-time fetch and is gated by
`test/fetch-pinning.test.mjs`. Runtime extension loads are the one place it was
never extended to, purely because they happen later.

- `gallery-pins.json` ships with the app and names an immutable upstream commit
  plus the SHA-256 of both reviewed repository source and exact served bytes
  for all 120 current entries. A gallery change therefore requires a reviewed
  BrickWright update; this explicitly chooses release-bound trust over a
  mutable or unsigned runtime index.
- Only canonical, exact URLs in that map skip the warning. Query strings,
  fragments, sibling paths and new entries take the arbitrary-URL confirmation
  path.
- `_loadRemoteExtension` hashes response bytes before decoding, adapting or
  registering the extension. A changed known entry is refused with its slug and
  expected/received digest prefixes.
- `sync-gallery-pins.mjs` resolves the gallery repository to a full commit SHA,
  refuses partial/unreachable snapshots, and audits known build transforms.
  Translation JSON, snippet wrappers and dependency replacement markers are
  structurally checked; known appended snippets are rebuilt from SHA-addressed
  sources. Generated dependency bodies are not independently reconstructed,
  so the generator attests their structure and pins their exact deployed bytes.
- Focused tests enforce URL canonicalization, snapshot completeness, hash-before-
  evaluation ordering, mismatch refusal, transform boundaries and immutable
  fetches. Vendor freshness reports legitimate gallery drift without silently
  updating the trusted snapshot.

## Task 2 — `allowedServices`: an extension may only touch GATT services it declared

**Status: implemented 2026-08-28.** `BLESession.swift` already built
`allowedServices` from the discover request's filters ∪ `optionalServices` and
refused anything else before the blocklist. BrickWright's Rust Scratch-Link
server now matches it.

This is the whitelist, and it is the one that scales: the blocklist can only
ever name endpoints that are dangerous for everyone, while this one is exactly
as wide as each extension asked for.

- The allowance is per WebSocket or native-bridge client; one extension cannot
  inherit another client's declaration. A new discovery replaces rather than
  expands the old set.
- The Web Bluetooth shim now forwards canonical `optionalServices` instead of
  dropping them. Required and optional services form the exact allowance.
- Read, write, start-notifications and stop-notifications check the allowance
  before the universal Web Bluetooth blocklist. Service enumeration is filtered
  to the same set.
- The four bundled Web-Bluetooth extensions were audited before enforcement:
  Boost and Powered Up use their filtered service; SPIKE declares its one
  service; WeDo declares its advertised, I/O and battery services. No exception
  or global override was required.
- Node protocol tests exercise the forwarding and the four enforcement sites;
  Rust unit tests cover union, replacement, refusal and filtered enumeration.

## Task 3 — Native capabilities are declared, not ambient

**Status: JavaScript broker core shipped; native attribution deliberately not
enabled.** Schema v2 separates measured ambient requirements from reviewed
semantic grants, which default to none for 120/120 pins. Promoted workers can
reach only the closed `Scratch.capabilities.request(operation, args)` protocol;
host WeakMap identity, exact declarations, strict arguments, replay state and
revocation are enforced before a handler can run. No raw invoke operation or
native handler is registered.

The 99 deferred gallery entries still share the page realm and can call any
Tauri command exposed to the main window. That fact blocks an honest native
lease implementation in the same webview: one of those entries could retain or
monkey-patch the invoke closure and observe any lease delivered through it.

A wrapper around `window.__TAURI__` is not an enforcement boundary: trusted and
extension code occupy the same JavaScript global, and Rust sees only the main
Tauri window, not which script initiated an invocation. Genuine per-extension
capabilities would require native calls to cross an identity-bearing broker or
use unforgeable session tokens checked in Rust. Do not claim this is enforced
until that attribution exists.

The two defensible continuations are (a) finish removing every deferred entry
from the privileged realm before issuing leases, or (b) create a separately
privileged hidden broker webview/process which owns verification, workers and
leases while the editor webview loses native permission. The latter requires
desktop plus iOS/Android lifecycle proof and is tracked as a separate
multi-platform campaign. Refusals still belong in diagnostics; a capability
that silently does nothing is indistinguishable from a bug.

### Update 2026-09-03: continuation (b) is BUILT, at realm granularity

The hidden broker webview exists on desktop and is proven end to end against the
real Tauri ACL, in the packaged app, under tauri-driver:

- `native_broker_lease` and `native_broker_invoke` are bound to the BROKER label.
  The editor is refused both — measured, not asserted.
- `native_broker_audit` is bound to the MAIN label and returns structurally
  redacted rows: the row type has no field for a lease, digest, correlation,
  raw arguments or result, so there is nothing to strip.
- One semantic operation exists, `platform.kind.read`, whose executor is a
  side-effect-free read of a build constant.
- A lease is minted per call, spent at sequence 0 and abandoned. A replayed
  sequence is refused; a lease aged past its 60s TTL is refused against the REAL
  clock; a refused navigation and a reload each revoke outstanding leases, and
  the revocation is visible in the audit.
- The JavaScript and native paths return the same platform result, and the
  editor names only an OPERATION — never the resource, never a lease.

**What this does NOT establish, and must not be read as establishing.** The
attribution is at REALM granularity, not per extension. The capability path is
reached through main-label transport commands, so any code in the editor realm —
including the 99 deferred gallery entries that still share it — can drive it.
Rust sees "the main webview asked", exactly as this section warned; it does not
see which extension. That is survivable only because the vocabulary is CLOSED and
every operation in it must be safe for an arbitrary main-realm caller.
`platform.kind.read` was chosen for precisely that property. Adding an operation
with any authority, side effect or secret in its result would require finishing
continuation (a) first, or per-extension tokens checked in Rust.

Per-extension identity IS enforced on the worker path, by the JavaScript broker:
host WeakMap identity, exact declarations, strict arguments, replay state and
revocation. The two granularities are different and the difference is the point.
Do not merge these claims when summarising them.

## Task 4 — Sandbox unpinned extensions

**Status: implemented 2026-08-28 for every unpinned URL.** This directly buys
the boundary Tasks 1–3 did not: code chosen by URL cannot reach the DOM, editor
runtime or native bridge. HTTP(S) access remains and is stated in the prompt;
WebSockets are unavailable because Scratch Link itself is a native-capable
loopback WebSocket service.

The content-pinned gallery remains on the in-process adapter for compatibility.
Moving that reviewed set into the worker is a separate compatibility project,
not a prerequisite for containing arbitrary URLs.

---

## Ordering, and why

1. **Gallery integrity** — the quiet path, the biggest blast radius, and the
   doctrine already exists in this repo.
2. **`allowedServices` — shipped** — matches the reference and scales with each
   extension; the shipped corpus was audited before enforcement.
3. **Native capability declarations** — remaining least privilege for reviewed,
   pinned in-process code; requires real caller attribution.
4. **Unpinned-extension sandbox — shipped** — isolates arbitrary URL code and
   guards the dispatch channel as well as the worker globals.

Each is independently shippable. Do them one at a time; none depends on the
next being finished.
