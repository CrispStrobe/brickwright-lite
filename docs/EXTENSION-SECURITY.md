# What an extension can reach, and what it should have to ask for

Planned work, written down before any of it is built, so the order and the
reasoning survive being interrupted. Nothing here is implemented yet except
where it says so.

## What is true today (verified 2026-08-28, not remembered)

`extension-manager.js` `_loadRemoteExtension` does `fetch(url)` →
`makeCrispExtension(source)` → `_registerInternalExtension`. That is:

- **Every remote extension runs UNSANDBOXED, in-process, with full page
  access** — our gallery and a user-entered URL alike. The only difference
  between them is a `confirm()` for the non-gallery case.
- **There is no sandbox path for remote extensions.** The vanilla
  `extension-worker.js` fallback below that branch only ever resolves built-in
  IDs. The comment at the top of the file said "anything else falls through to
  the vanilla sandbox worker", which reads as though unknown URLs are contained.
  They are not, and that line is corrected in the same commit as this file.
- **There is no integrity check on the fetched source.** No hash, no signature,
  for either host.

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

- Gallery index (`extensions-v0.json`) carries a sha256 per extension.
- `_loadRemoteExtension` verifies before `makeCrispExtension`, and refuses with
  a sentence naming the mismatch rather than running it.
- A mismatch must be legible: "this extension has changed since the index was
  published" is actionable; a blank screen is not.
- Open question to settle when building: the index itself is fetched by mutable
  name. Pinning the index in the app turns every gallery update into an app
  release, which is probably the wrong trade for a teaching tool. Signing it is
  the alternative and needs a key story. **Decide explicitly; do not drift into
  whichever is easier.**

## Task 2 — `allowedServices`: an extension may only touch GATT services it declared

**Status: the reference already does this and we do not.** `BLESession.swift`
builds `allowedServices` from the discover request's filters ∪ `optionalServices`
and refuses anything else with "attempt to access unexpected service" — checked
BEFORE the blocklist. We implemented only the blocklist (the narrower, second
check) and none of this.

This is the whitelist, and it is the one that scales: the blocklist can only
ever name endpoints that are dangerous for everyone, while this one is exactly
as wide as each extension asked for.

- **Observe-only first.** Log what *would* be refused, run the whole extension
  corpus, read the log. The alternative is finding out which gallery extension
  reaches for an undeclared service by breaking it in front of a child.
- Then default-on, with an override in Settings behind an explicit warning the
  user confirms — same pattern as the transport chooser, which greys out what
  cannot run and says why.
- The override should be as narrow as it can be. "Allow this extension, this
  session" beats a global switch that stays on for a year because someone
  flipped it once.

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
2. **`allowedServices`** — matches the reference, scales with each extension,
   observe-only before enforcing.
3. **Native capability declarations** — where our exposure actually differs
   from a browser's.
4. **Sandbox** — only against a written case that 1–3 left something open.

Each is independently shippable. Do them one at a time; none depends on the
next being finished.
