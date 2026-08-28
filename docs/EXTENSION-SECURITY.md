# What an extension can reach, and what it should have to ask for

Security work and its rationale. The status under each task is authoritative;
the remaining tasks are deliberately independent checkpoints.

## What is true today (verified 2026-08-28, not remembered)

`extension-manager.js` still runs every remote extension in-process. For an
exact URL in the shipped gallery pin map it now does `fetch(url)` → hash the
response bytes → compare with the pin → `makeCrispExtension(source)` →
`_registerInternalExtension`. For other URLs the UI confirmation remains. That
means:

- **Every extension which is allowed to run is still UNSANDBOXED, in-process,
  with full page access** — our gallery and a user-entered URL alike. A pinned
  gallery URL skips the confirmation only when its fetched bytes match the
  reviewed snapshot; an unknown URL prompts; a changed known URL is refused.
- **There is no sandbox path for remote extensions.** The vanilla
  `extension-worker.js` fallback below that branch only ever resolves built-in
  IDs. The comment at the top of the file said "anything else falls through to
  the vanilla sandbox worker", which reads as though unknown URLs are contained.
  They are not, and that line is corrected in the same commit as this file.
- **Task 1 now integrity-checks the silent gallery path.** Arbitrary confirmed
  URLs are intentionally not content-pinned because the user supplied the URL.

So we have TurboWarp's *unsandboxed mode* without its *sandbox*, and the thing
that makes our situation different from TurboWarp's is not the DOM: it is the
**native bridge**. An in-process extension can invoke Tauri commands —
Bluetooth, file writes, serial flashing. That is the exposure worth spending on.

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

Today an in-process extension can call any Tauri command that exists. It should
declare what it needs — Bluetooth, serial/flashing, file writes, downloads —
and get nothing else.

- Same shape as Task 2, one layer out: declaration, then refusal with a reason.
- Cheaper than a JS sandbox and aimed at where our real exposure is. A sandbox
  that still hands out the native bridge has solved the smaller half.
- Refusals belong in the diagnostics panel, for the same reason the Bluetooth
  ones do: a capability that silently does nothing is indistinguishable from a
  bug, and we have already spent a day on exactly that confusion.

## Task 4 — A real sandbox, only if something still demands it

TurboWarp sandboxes because its risk is DOM, network and page access in a
browser. After Tasks 2 and 3 the native bridge is gated, which is the part
TurboWarp does not have to worry about.

A genuine sandbox is a large change — every extension relying on the in-process
`Scratch` shim would need a different contract — and it should not be started
on the theory that it sounds safer. **Write down what it would buy that Tasks
1–3 do not, and if that list is short, do not build it.**

---

## Ordering, and why

1. **Gallery integrity** — the quiet path, the biggest blast radius, and the
   doctrine already exists in this repo.
2. **`allowedServices` — shipped** — matches the reference and scales with each
   extension; the shipped corpus was audited before enforcement.
3. **Native capability declarations** — where our exposure actually differs
   from a browser's.
4. **Sandbox** — only against a written case that 1–3 left something open.

Each is independently shippable. Do them one at a time; none depends on the
next being finished.
