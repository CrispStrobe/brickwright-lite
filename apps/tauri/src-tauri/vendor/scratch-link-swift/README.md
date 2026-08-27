# scratch-link (Swift) — vendored, unmodified

The **original** Scratch Link BLE/BT session implementation, vendored so that
Brickwright can offer it as a connection path on iOS and macOS beside its own.

## Why it is here

The LEGO extensions offer several connection paths on purpose: if one transport
fails on some platform, the hardware is still reachable by another. This adds
the path that is not our reading of the protocol but the reference itself —
where our Rust server and this disagree, this one is right by definition.

That is not hypothetical. Auditing our Rust against these files on 2026-08-28
found three methods we did not answer at all: `stopNotifications` on the BLE
session, and `getVersion` and `pingMe` on the base session that BOTH session
types inherit. Ours has them now; the audit is what found them.

## Provenance and licence

| | |
|---|---|
| Upstream | <https://github.com/bricklife/scratch-link> (fork of LLK/scratch-link) |
| Commit | `f78273b9003bc0272dbcfb8a39a5a1358de89007` (2022-02-18) |
| Licence | **BSD-3-Clause**, Copyright © 2019 Scratch Foundation — see `LICENSE` |
| Path upstream | `macOS/Sources/scratch-link/` |

The commit date matters: Scratch relicensed much of its stack from BSD-3 to
AGPL-3.0 on 2024-11-25, and this snapshot predates that by two years. Lite
exists to be shippable on any app store, so a later snapshot would be
unusable here. Do not "update" these files without re-checking the licence of
whatever you are updating them to.

`TRADEMARK` is vendored alongside because clause 3 and the trademark file are
the obligations that come with the code: the Scratch name, logo and characters
may not be used to endorse or promote a derived product. We vendor the code and
none of the branding — Brickwright ships its own robot, not the cat.

## Modifications

**None.** These files are byte-identical to upstream, which is the point: a
divergence would make "the reference implementation" a claim rather than a
fact. `test/scratchlink-vendor-integrity.test.mjs` gates that.

The sources `import PerfectWebSockets` for one small type. Rather than pull in a
web-server dependency we never use, `../scratch-link-shim/WebSocket.swift`
supplies that surface — the same approach Scrub takes (BSD-3, © 2021
Shinichiro Oba), and the reason its 28 lines are worth copying rather than
inventing.
