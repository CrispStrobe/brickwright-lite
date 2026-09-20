# The five SPIKE extensions became one

*Internal technical doc, English-only per the bilingual rule. Written 2026-09-20.*

## What changed

`spikeprimeBTC`, `spikeprimeBridge`, `spikeprimeble` and `legospikeprimeBLE` no longer
exist as extensions. Everything they did is in `spikeprime`, which is the single entry in
the picker: **LEGO SPIKE Prime / Robot Inventor**.

Projects saved against the old ids keep working. They are rewritten as they load.

## Why they were never five capabilities

Measured before the merge, from the five extensions' real `getInfo()`:

| Extension | Blocks | Protocol | Transport |
|---|---|---|---|
| `spikeprime` | 84 | REPL / JSON lines (firmware 2.x) | Scratch Link BT (RFCOMM) |
| `spikeprimeBTC` | 74 | same | Scratch Link BT |
| `spikeprimeBridge` | 29 | same | local WebSocket bridge |
| `spikeprimeble` | 15 | SPIKE 3 binary, GATT `FD02` | Web Bluetooth |
| `legospikeprimeBLE` | 34 | same | Scratch Link BLE |

236 blocks, of which exactly **one** (`isForceSensorPressed`) appeared in all five. That
number makes the family look diverse; the structure underneath does not:

- `spikeprimeBTC`'s 74 opcodes are a **strict subset** of `spikeprime`'s, with identical
  signatures. It was the same extension without the code-generation and file-management
  blocks. ~2 800 of their lines were identical after whitespace normalisation.
- `spikeprimeBridge` is `spikeprime`'s vocabulary over a different pipe.
- `spikeprimeble` and `legospikeprimeBLE` speak the **same protocol to the same UUIDs**
  and differ only in naming — `startMotor`/`motorRun`, `setLightMatrixPixel`/
  `displaySetPixel`, `getForceSensorValue`/`getForceSensor`.

One hub, one vocabulary, **two protocols, four transports**. The extension is now shaped
like that instead of like its history.

So the user no longer has to know which firmware their hub runs or which Bluetooth
plumbing their machine has before they can pick a block. And SPIKE Prime (45678) and
Robot Inventor (51515) never needed separate handling: same hardware, same firmware line,
same two protocols — told apart by the hardware variant the hub reports, not by the
advertised name, which the user can change.

## What is detected, and what is not

`connection mode` defaults to `auto`. Being precise about what that buys, because a
browser cannot silently scan for Bluetooth devices and claiming otherwise would be a lie
a learner discovers the hard way:

**Detected**

1. **Transport.** Which routes exist on this machine — Scratch Link probed, Web
   Bluetooth a capability check, the bridge a connect attempt. Tried in that order, and
   a route that finds nothing **advances to the next**. That fallback is the point:
   Scratch Link reaches both firmware generations through two different transports, and
   which one finds a hub depends on the hub. Picking BLE because Scratch Link exists and
   stopping there would leave every 2.x hub undiscoverable on a machine that can reach it.
2. **Protocol and firmware.** Follows from the route, then **confirmed by the hub** —
   SPIKE 3 in its `InfoResponse` (whose version bytes both BLE extensions parsed and
   threw away), 2.x through a tagged `hub.info()` line. `hub type` and
   `hub firmware version` report that measurement, and stay empty until the hub has
   actually said something.
3. **Devices.** Which sensor is on which port, reported by the hub in both protocols.

**Not detected**

- Web Bluetooth needs a user gesture and shows the browser's own chooser. "Auto" means
  one chooser offering every SPIKE hub, not silent background discovery.
- Bluetooth Classic RFCOMM is not reachable from a page at all; it is Scratch Link's
  chooser or nothing.

Naming a mode explicitly (`set connection mode to …`) skips all probing.

## How 84 REPL-era blocks reach a 3.x hub

They were always implemented as a JSON-RPC verb with a MicroPython fallback —
`sendCommand(...).catch(() => sendPythonCommand(...))` — because the 2.x firmware was
itself inconsistent about which verbs it knew. SPIKE 3 accepts tunnelled MicroPython
(message `0x32`), so that existing chain carries them across unchanged.

`Spike3Hub.sendCommand` answers the verbs 3.x has natively (motor start/stop become the
JSON tunnel command both BLE extensions sent) and **rejects** the rest, which is not a
failure but how the Python path is selected. Motor control does not go through generated
Python on a hub that has a real command for it.

## What is not supported where

The palette does not reshuffle on connect. A block set that changes shape under a learner
is worse than one that explains itself, so every block stays visible and a block whose
firmware cannot do the thing says so rather than returning a plausible zero.

| Only on firmware 2.x (REPL) | Only on firmware 3.x |
|---|---|
| reflected light, ambient light | streaming on/off |
| hub voltage / current / temperature | built-in image display |
| hub sound files, waveform beeps | face-up reporter |
| button state and button hats | |
| log files on the hub | |
| distance-sensor lights | |

A reporter whose firmware has no such reading returns **blank**, not zero. That is the
whole of "explains itself" for a reporter, and it is a real change: `getBatteryTemperature`
used to answer a flat `25` for a hub that had never sent a temperature, and
`getReflection` a flat `0`. A fabricated reading is worse than a blank because it looks
like a measurement. Boolean blocks have no room for a third answer and report false.

This is not a loss: those blocks never existed in the BLE extensions. The difference is
that they are now visible and explain themselves instead of being absent.

## Units are not silently merged

Firmware 2.x reports the distance sensor in **centimetres** (device type 62, `-1` for out
of range). Firmware 3.x reports **millimetres** (device type `0x0d`, int16).

- `[PORT] distance` keeps the centimetre meaning it inherited, on both firmwares. The
  driver converts.
- `[PORT] distance in [UNIT]` is explicit, and is where every old millimetre reader is
  migrated — with `UNIT` already set to `mm`, and reading the hub's own millimetre figure
  rather than `cm × 10`, so it keeps the sensor's resolution.

A project that read cm still reads cm. A project that read mm still reads mm.

## Two bugs this found

Merging two implementations of the same thing makes their disagreements visible. Both of
these were live:

- **`spikeprime` sent RFCOMM as raw text with no `encoding` field.** That is not Scratch
  Link's protocol; `spikeprimeBTC`, which shared a hub and a vocabulary with it, had
  always sent base64 correctly. The virtual Classic transport refuses anything else,
  which is how it surfaced.
- **`legospike_ble.js` read the SPIKE 3 motor record as 11 bytes while taking a 32-bit
  position from offset 8**, which needs a twelfth — so it both over-read the record and
  mis-strode to the next one. `legospikeprime_ble.js` had the 12-byte layout right.

A third, smaller: device streaming was requested on a 500 ms timer after connect. It is
now requested when the hub answers, since the `InfoResponse` carries the packet size and
asking before it arrives means sending at the wrong MTU.

## Where the pieces are

| Thing | Where |
|---|---|
| The extension, readable | `CrispStrobe/extensions`, `extensions/CrispStrobe/legospike_turbowarp_transpile.js` |
| The bundle the VM loads | `…/spikeprime/index.js`, vendored by `scripts/spike/vendor-bundles.mjs` |
| The rename table | `overlay/scratch-gui/src/lib/spike-legacy-migration.js` |
| Applied at load | `overlay/scratch-gui/src/lib/spike-project-migration.js`, hooked in `vm-manager-hoc.jsx` |
| Legacy id resolution | `extension-manager.js` (`resolveExtensionId`) |
| Code-tab round trip | `overlay/scratch-gui/src/lib/spike-runtime-ops.js`, merged at `sb3-creator-register-art.js` |
| What must not be lost | `test/fixtures/spike-legacy-ledger.json` — the frozen 236 |

### Why there is no local source file

For a while there was one: `spikeprime/source.js`, readable and linted, with the
bundle generated from it. That is the reverse of the rule — it made Lite the place
SPIKE changes were written — and it is the shape that produced eight forks in the
first place.

The extension is vendored now. A change to a SPIKE block is made in
`CrispStrobe/extensions`, and arrives here by moving `UPSTREAM_COMMIT` in
`scripts/spike/bundled-upstream.mjs` and running `scripts/spike/vendor-bundles.mjs`,
which fetches every mapped file at that commit, writes each bundle, and records the
sha256 **from the same fetch**. Vendoring and pinning in one step closes a gap the
two-step arrangement had: a bundle could be rebuilt locally without the pin moving,
which is a fork that passes its own check.

`test/bundled-extensions-match-upstream.test.mjs` then judges the whole tree offline
against those hashes.

### Why the sb3-creator registry is merged rather than regenerated

`SB3Creator.runtimeOp()` returns null for an opcode with no registry entry, and the block
is then simply not emitted. sb3-creator's generated registry is vendored under a
byte-identity pin (`test/sb3-creator-vendor-identity.test.mjs`) and still describes the
pre-merge world — so left alone, every migrated block would quietly stop round-tripping
through the Code tab.

The unified entry is therefore derived from the shipping extension and merged at
`sb3-creator-register-art.js`, the module that exists so registration is a property rather
than a habit. The vendored file stays byte-identical to its pin. **When sb3-creator
regenerates its registry against the unified extension, this merge becomes a no-op and
should be deleted.**

## The tests that hold this

| File | Holds |
|---|---|
| `spike-unified-coverage.test.mjs` | all 236 legacy blocks resolve; no argument, menu choice or injected value is lost |
| `spike-legacy-migration.test.mjs` | the rewrite works on real sb3 structures; idempotent; survives malformed input |
| `spike-unified-protocol.test.mjs` | the wire format, the record parser, transport selection, capability answers |
| `spike-runtime-registry.test.mjs` | the Code tab still round-trips every opcode the migration can produce |
| `spike-legacy-ids-resolve.test.mjs` | the retired ids still lead somewhere; the picker lists one |
| `bundled-extensions-match-upstream.test.mjs` | no bundled extension differs from the upstream file it claims |
| `virtual-spike-*-e2e.test.mjs` | the shipping extension driven against the virtual hub, on both protocols |

`spike-legacy-ledger.json` is the frozen surface of the five, captured from the pinned
sources before the merge. It is the record of the obligation, and editing it to make a
test pass is exactly the mistake it exists to catch.

## Still open

- **Upstream.** `CrispStrobe/extensions` still ships the five separately, and the gallery
  still serves them. Nothing here depends on that, but the two will drift until the
  unified extension is upstreamed or the five are retired there.
- **sb3-creator.** See the registry note above.
- **`getReflection` / `getAmbientLight` on 3.x.** The 3.x colour record carries red, green
  and blue but no reflection or ambient channel. Deriving them from RGB would be
  invention, so they report unsupported. Whether the hub can be asked for those modes
  directly over the tunnel has not been measured.
