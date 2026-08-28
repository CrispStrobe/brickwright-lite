# What an extension can reach, and what it should have to ask for

Security work and its rationale. The status under each task is authoritative;
the remaining tasks are deliberately independent checkpoints.

## What is true today (verified 2026-08-28, not remembered)

`extension-manager.js` now has two deliberately different remote paths:

- An exact URL in the shipped gallery pin map is fetched, hashed and compared
  with the reviewed snapshot before the compatibility adapter evaluates it
  in-process. A changed known URL is refused.
- Every other HTTP(S), relative, `data:` or `blob:` URL runs in the Scratch VM
  extension worker. HTTP(S) entry points still ask first and explain that the
  worker retains HTTP(S) fetch/import, but no DOM, editor runtime or Tauri
  native bridge. Direct WebSockets are blocked: otherwise code could dial the
  app's loopback Scratch-Link server and regain native Bluetooth. Nested worker
  constructors are blocked as well, so code cannot create a fresh socket-capable
  realm.
  Extensions which demand `Scratch.extensions.unsandboxed` fail explicitly.

Worker isolation alone was insufficient: downloaded code still owns
`postMessage` and could forge Scratch dispatch frames. The central broker now
accepts only the allocation/registration lifecycle, confines service names to
that worker's `extension.<worker>.<id>` namespace, and binds replies to the
worker which received the corresponding call. Calls into `runtime`, `gui`, or
another worker are refused. A runtime test exercises both the permitted
lifecycle and the forged-call/forged-reply cases.

The remaining in-process surface is therefore the content-pinned compatibility
set, not arbitrary confirmed code. Those reviewed bytes can still invoke Tauri
commands — Bluetooth, file writes and serial flashing — which is the remaining
least-privilege question.

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

**Status: narrowed, but not implemented as a declaration system.** Unpinned
extensions have no native bridge at all after Task 4. Content-pinned gallery
extensions still share the page realm and can call any Tauri command exposed to
the main window.

A wrapper around `window.__TAURI__` is not an enforcement boundary: trusted and
extension code occupy the same JavaScript global, and Rust sees only the main
Tauri window, not which script initiated an invocation. Genuine per-extension
capabilities would require native calls to cross an identity-bearing broker or
use unforgeable session tokens checked in Rust. Do not claim this is enforced
until that attribution exists.

The sandbox changes the priority: this work would now provide least privilege
between already reviewed, hash-pinned extensions, rather than protecting the
app from an arbitrary URL. If implemented, refusals still belong in diagnostics;
a capability that silently does nothing is indistinguishable from a bug.

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
