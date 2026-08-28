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

**None in `Sources/`** — those files stay byte-identical to upstream, gated by
`test/scratchlink-vendor-integrity.test.mjs`, because a silent divergence would
make "the reference implementation" a claim rather than a fact.

But **byte-identical and "it builds" are not both achievable**, and pretending
otherwise was the first thing that had to go. Compiled against Swift 6.2 and the
macOS 26 SDK, exactly one line fails:

    BLESession.swift:431
    endpoint.service.peripheral.setNotifyValue(false, for: endpoint)

Apple made `CBCharacteristic.service` and `CBService.peripheral` weak OPTIONALS
in iOS 15 / macOS 12 (2021); this snapshot is from 2022 but was built against an
older SDK. So `patches/` holds the one-line optional-chaining fix, applied to a
build copy rather than to `Sources/`. The pristine tree stays the reference for
auditing our Rust against; the patched copy is what compiles.

Verified, not assumed: with the two stub modules below plus that patch, all nine
files build clean — `Build complete`.

## Building it needs two stub modules

`Session.swift` and `BLESession.swift` `import PerfectWebSockets` / `PerfectHTTP`
for exactly ONE type: `SerializationError`. Rather than take the Perfect web
server as a dependency for an error enum, declare two EMPTY targets with that
name and put the enum in them — which is what Scrub does (BSD-3, © 2021
Shinichiro Oba), and why its approach was worth copying rather than inventing.

## What cannot be used from here on iOS

`BTSession.swift` is macOS-only: it uses IOBluetooth, which iOS does not have.
Scrub excludes it and writes its own. Bluetooth Classic on iOS goes through MFi
ExternalAccessory instead — which is what `bt_ios.rs` already implements, so the
vendored BT session is reference material here, not shippable code.

The sources `import PerfectWebSockets` for one small type. Rather than pull in a
web-server dependency we never use, `../scratch-link-shim/WebSocket.swift`
supplies that surface — the same approach Scrub takes (BSD-3, © 2021
Shinichiro Oba), and the reason its 28 lines are worth copying rather than
inventing.


## How to build it into the app (verified locally, not guessed)

Every claim below was established with `swift build` against Swift 6.2.3 and the
macOS 26 SDK, in seconds. None of it needs a CI round trip to re-derive.

**SwiftPM follows a symlinked source directory.** A target whose `path` is a
symlink to `vendor/scratch-link-swift/Sources` compiles — SwiftPM's "sources
must live inside the package" rule is about the manifest's view, and a symlink
satisfies it. So the plugin does not need its own copy of the tree.

**The Perfect imports need one stub module, and the shim belongs in it.**
Declare an empty target named `PerfectWebSockets` containing `SerializationError`
AND the `WebSocket` shim. The vendored `Session.swift` already says
`import PerfectWebSockets`, so both types resolve with no change to it. Put the
shim anywhere else and the pristine sources stop compiling.

**Exclude `BTSession.swift`.** It is macOS-only (IOBluetooth). Excluding just
that one file leaves BLESession, Session, GATTHelpers, JSONRPCError,
EncodingHelpers, RSSI, DispatchSemaphore and both CoreBluetooth delegate helpers
building clean.

**One line still needs `patches/0001`.** With all of the above, `BLESession.swift:431`
is the ONLY remaining error. Which forces the one real design decision here: a
symlink cannot be patched without editing the pristine tree, so the plugin must
compile from a COPY with the patch applied — generated, never hand-edited, with
`Sources/` remaining the hash-gated reference.

**Tauri's plugin system is the integration, not `build.rs`.**
`vendor/tauri-plugin-share` is a working template in this repo:
`ios/Package.swift`, a `Plugin` subclass with `@objc public func name(_ invoke: Invoke)`,
`@_cdecl("init_plugin_<name>")`, and `build.rs` declaring `COMMANDS` +
`.ios_path("ios")`. No hand-rolled swiftc invocation is needed.

**The two seams to drive it** are `Session.init(withSocket:)` and
`didReceiveText(_:)` for inbound frames, with outbound arriving through the
shim's `onSend` callback. The JSON-RPC never gets reimplemented — which is the
entire point of using the reference rather than another translation of it.
