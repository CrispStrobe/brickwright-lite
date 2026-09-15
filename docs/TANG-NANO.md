# Tang Nano 20K (Gowin GW2AR-18) — decisions and implementation plan

Scoped 2026-09-15. Supersedes two earlier drafts of this file: one that assumed
the 9K, one that left the architecture open. The architecture is now decided and
recorded below. **Nothing is built. No lane is claimed.**

Hardware in hand: `GW2AR-LV18QN88C8/I7`, QN88, **20736 LUT4 / 15552 FF**,
64 Mbit SDRAM in package, HDMI, microSD, RGB LED, 27 MHz input, onboard
USB-JTAG. Generous for any soft CPU we would ship; **8 MB of SDRAM rules out
Linux** — do not plan for it.

Implementation note that otherwise costs an afternoon: **C-grade devices require
`--vopt family` passed to nextpnr and gowin_pack.** apicula's readme says so.

---

## 1. Decisions

| # | question | decision |
|---|---|---|
| 1 | which product | both teaching sim and real bitstream, under one mental model |
| 2 | unifying concept | execution tiers, modelled on the x86 wired/functional split |
| 3 | semantics | add a fourth `MACHINE_SEMANTICS` value: **`gate-level`** |
| 4 | real silicon | **not** a tier — a separate "Flash to board" action |
| 5 | synthesis | hosted by default; optional local WASM, probe + explicit setting |
| 6 | gate-level tier | vendor **digitaljs** (BSD-2-Clause, npm, 14.6 MB) |
| 7 | functional tier | **Renode** (MIT), bundled in the Tauri app |
| 8 | web simulation | hosted Renode -> trace -> replay in `bw-debug` |
| 9 | first SoC | **VexRiscv**, the LiteX default |
| 10 | RISC-V debug | delegate to Renode; no new `bw-board` adapter |
| 11 | device identity | board id `tangnano20k` + a separate SoC field |
| 12 | HDL entry point | its own surface, **not** the Code tab |
| 13 | Verilator | **dev-side oracle only**; not a shipped dependency |
| 14 | slice one | board part + 3.3 V DRC rule, nothing else |
| 15 | delivery | own `lane/…` branch; surface hidden behind a build-time flag |
| 16 | retro cores | pursued as **TN5b, in parallel with TN5a** — not instead of it |
| 17 | retro scope | a **6502/Z80 SBC**, not a home computer |
| 18 | pin bridge | its own phase (**TN2b**) — netlist ports into the MNA engine |
| 19 | GPL cores | **local WASM tier only**; hosted synthesis refuses them **by name** |

## 2. The licence position, verified

Checked 2026-09-15 against the GitHub licence API and upstream LICENSE files —
not from memory:

| project | role | SPDX | disposition |
|---|---|---|---|
| Yosys | synthesis | ISC | shippable |
| nextpnr (himbaechel-gowin) | place & route | ISC | shippable |
| Project Apicula | GW2A bitstream | MIT | shippable |
| openFPGALoader | flashing | Apache-2.0 | shippable |
| LiteX | SoC builder | BSD-2-Clause | shippable |
| litex-renode | LiteX -> Renode platform | Apache-2.0 | shippable |
| Renode | full-SoC simulation | MIT | shippable |
| digitaljs | gate-level browser sim | BSD-2-Clause | shippable |
| Verilator | RTL simulation | `LGPL-3.0-only OR Artistic-2.0` | **dev-side oracle only** |
| hneemann/Digital | gate-level GUI sim | GPL-3.0 | excluded |

**The GPL problem that shaped the rest of this project does not recur here.**
SDCC, avr-gcc, ca65 and sdasz80 are why `stc-compiler.vercel.app` exists at all
(see [CHOOSING-HARDWARE.md](CHOOSING-HARDWARE.md)); none of that applies to the
Gowin flow. Where these tools run is a question about weight, not contamination.

**Renode's MIT status is already established here — do not re-announce it.**
the STM32 path lane in `LANES.md` (search `legitimacy verified: Renode is MIT`; line 701 as of 2026-09-15) records it: *"port Renode's MIT peripheral
models … legitimacy verified: Renode is MIT"*, and its **Phase 3 is already a
scoped Renode differential oracle** — *"VPS-shaped, Mono installs there — the
ucsim pattern without the GPL wall"*. That lane is **UNCLAIMED**.

**TN5 therefore overlaps existing unclaimed work and must be reconciled with
that lane, not started beside it.** This is exactly the collision LANES.md was
created to prevent. There is also substantial Renode work already on this box —
~40 `wt-renode-*` worktrees plus `renode-spike-prime` and
`wt-renode-current-gate` (Renode source at v1.16.1 / v1.17.0). **Renode is not
greenfield in this project.** Survey that work before TN5 is planned in detail.

What remains genuinely new is narrower: *bundling* Renode in the shipped Tauri
app, as opposed to using it as a dev-side oracle. Claim only that.

### 2.1 Why Verilator is dev-side, and what that does and does not mean

Running a tool does not licence its output, which is why GPL `ucsim-stc` can be
an oracle at all. **Verilator used as a build or test tool triggers nothing**,
and needs no policy change — it occupies the same slot as `simavr` and
`ucsim-stc`, minus their GPL constraint.

The Artistic-2.0 question arises *only* if Verilator's runtime
(`verilated*.cpp/h`) were shipped inside the product. For the record, what that
would cost, since the analysis is done:

- Artistic-2.0 attaches obligations to **what you did**, not to a file.
  §4: distributing a *modified* version means documenting the differences and
  either offering changes back, **renaming**, or granting share-alike source
  rights. Our entire `overlay/` + `apply-*-overlay.mjs` regime is §4
  modification by construction.
- §5 creates an **ongoing** duty: compiled distribution without source requires
  instructions for obtaining source that must *stay valid*, on pain of ceasing
  distribution. Nothing in MIT/BSD/Apache/MPL can lapse like that, and we ship
  signed binaries to App Store Connect and TestFlight.
- It is **not** more copyleft than what we already allow. §13 grants patents with
  retaliation (comparable to Apache-2.0 §3, stronger than MIT/BSD-3 silence);
  §9 excludes mere extension; MPL-2.0's file-level rule is arguably stricter
  than Artistic's rename escape hatch.
- The real cost is auditability: the README's licence table is re-runnable
  because MIT/BSD/Apache obligations are properties of files. Artistic-2.0's are
  properties of conduct, which no gate can check.

Revisit only if signal-level waveforms are actually wanted as a *shipped*
feature.

## 2.3 GPL cores build locally, never on our server — DECIDED 2026-09-15

The trigger is narrow, and it is worth stating precisely so nobody widens it by
accident. *Using* GPL tools is not it: running a compiler never licences its
output, and our toolchain is permissive anyway. The trigger is **our server
taking GPL HDL, compiling it, and handing the bitstream to a user** — conveying
a derivative work, which obliges us to offer corresponding source to that
recipient. The app stays clean either way; the obligation would land on the
*service*.

Three options were weighed. **The decision is: GPL cores compile on the user's
own machine, through the local WASM tier (TN6), and never on ours.** The user
builds it for themselves, so nothing is conveyed and no obligation arises.

Why not the alternatives:

- **Refusing GPL cores entirely** is clean but forecloses every existing retro
  core, and "why can I not build the C64 core that runs on this exact board?"
  becomes a permanent question with an unsatisfying answer.
- **Serving them and pointing at upstream for source** is defensible — the
  source is public, and `vendor-pins.json`, the sha256-gated fetches and
  `test/notices-drift.test.mjs` are exactly the machinery for it. It was
  rejected because it converts a bounded decision into a **standing compliance
  duty**, whose failure mode is an ordinary engineering act: the first time a
  build patches a core — a pin constraint, a clock tweak, a bug fix — the
  "unmodified upstream" story breaks and we owe *our* modified source, and
  nobody would flag that at the time.

**This costs nothing architecturally**, because the local tier exists anyway for
weight reasons. What it changes is the local tier's meaning: it is no longer
merely *the same thing, offline* — it is **strictly more capable**, and that is
a difference the policy layer already requires us to surface rather than hide
(§3, "never silently lower fidelity", named refusals).

**Consequences to implement, not to remember:**

- **TN3 owes a licence check at submission**, refusing by name with the reason
  and a pointer to the local route. That is an acceptance criterion, not later
  hardening — the failure mode otherwise is deciding this implicitly by letting
  the hosted path accept whatever HDL it is handed.
- **TN6 is no longer optional-nice.** It is the only route for a whole class of
  designs, which changes how its 261 MB download is presented: not "a speed-up
  you may want" but "the way these cores build".
- **Unlicensed cores are refused on BOTH tiers.** No licence is no permission,
  and a local build does not manufacture one.

## 2.2 The cores are a separate licence question, and it goes the other way

§2 is about the **toolchain**, and it is uniformly permissive. The **cores** —
the HDL you would actually put on the board — are not. Checked 2026-09-15
against the GitHub licence API:

| core | licence |
|---|---|
| C64 for Tang Nano 20K (`vossstef/tang_nano_20k_c64` -> `MiSTle-Dev/C64Nano`) | **GPL-3.0** |
| NESTang / SNESTang (nand2mario; both target the 20K) | **GPL-3.0** |
| `NES_MiSTer` | **GPL-3.0** |
| `fx68k` (68000) | **GPL-3.0** |
| `C64_MiSTer`, `BBCMicro_MiSTer`, `Minimig-AGA_MiSTer` | **no licence declared** |
| Arlet's `verilog-6502` | **no licence declared** |

**The retro FPGA core ecosystem is almost entirely GPL-3.0 or unlicensed**, and
**unlicensed is worse than GPL here** — no licence means no permission at all,
not "probably fine". Three buckets, and they are not equal:

- **Own or permissive HDL** — shippable. Includes anything we write.
- **GPL cores** — the existing escape hatch applies: *fetched at runtime from a
  URL, never bundled*, exactly as the GPL gallery extensions are. **Decided
  2026-09-15: they build on the LOCAL tier only.** See §2.3.
- **Unlicensed** — unusable. Full stop.

### ROMs are a second wall

A complete home computer needs its ROMs, and they are copyrighted: C64
KERNAL/BASIC/CHARGEN (Cloanto claims them), Acorn/BBC ROMs their own situation.
**Never bundled** — user-supplied or licensed only. The practice already exists
here (`bw-board/roms/`, BIOS provenance recorded by sha256), so this is a known
shape rather than a new problem. It does mean "C64 on the Tang Nano" can never
be one click.

### Which is why the retro route is an SBC, not a home computer

The 6502 and Z80 are the sweet spot: small (roughly 1–3k LUT4 each — **estimates
to be measured, not facts**), well understood, and **we already own the
emulators** that become their functional tier. A clean or permissively-licensed
core is tractable in a way a C64 never will be.

This mirrors how [ROADMAP.md](../ROADMAP.md)'s M68K entry scopes its own trap:
*"The first machine is not an Amiga, Macintosh, or Mega Drive. It is a small
serial SBC."* Same discipline, same reason.

### What fits at all

20736 LUT4 / 15552 FF / 8 MB SDRAM. **LUT figures below are estimates and must
be measured before anything is promised:**

| core | ~LUT4 | verdict |
|---|---|---|
| 6502 | 1–2k | fits easily |
| Z80 (T80) | 2–3k | fits easily |
| AVR | 2–3k | fits easily |
| 68000 | 5–8k | fits |
| Acorn Electron (6502 + ULA) | small | would fit; **no known 20K port**, MiSTer version unlicensed |
| C64 | — | **proven** on this exact board (C64Nano) |
| NES / SNES | — | **proven** (NESTang / SNESTang); SNES reportedly tight |
| 8086/80186 (Next186 class) | ~10k+ | plausible but tight |
| Amiga (Minimig-AGA) | — | too big, and unlicensed |

## 3. The tier model

The unifying concept is the one the 8086 work already uses. `bw-board`'s
`execution-policy.js` freezes:

    MACHINE_SEMANTICS = ['dos-services', 'functional-hardware', 'wired-digital']

and [EXECUTION-POLICY-AND-OPTIMIZATION.md](EXECUTION-POLICY-AND-OPTIMIZATION.md)
separates two axes that are easy to conflate: **semantics** (what is modelled) is
independent of **implementation** (reference JS, indexed/compiled JS,
native/Wasm). Auto may pick a faster implementation but must **never silently
lower fidelity**, and an unavailable request returns a **named refusal** rather
than degrading.

The FPGA adds one semantics value and reuses the rest:

| semantics | what it models | implementation here |
|---|---|---|
| `functional-hardware` | instructions through software interfaces | Renode (Tauri); hosted + replay (web) |
| `wired-digital` | bus phases, contention, chip selects, READY | existing `bw-board` machines |
| **`gate-level`** *(new)* | logic gates and nets, below bus protocol | digitaljs over a Yosys netlist |

`gate-level` is a new value rather than a stretch of `wired-digital`, because
`wired-digital` is defined in bus-protocol terms a gate netlist does not have.
Blurring it would damage a definition the 8086 path depends on.

**This is a cross-repo change, not an edit.** `MACHINE_SEMANTICS` is a frozen
constant in `bw-board`, an npm-pinned package here, so it lands upstream first
and arrives through the pin-move chain and its sync gates
(`test/pin-move-chain.test.mjs`). It cannot be validated locally until the pin
moves. **Longest-lead item in the plan — start it first.**

### 3.1 Real silicon is deliberately outside the model

Flashing is a separate **"Flash to board"** action, not an entry in the fidelity
picker. A dropdown item that takes seconds, needs a cable and can fail
physically is a different category from three reversible simulation tiers.

So the single mental model covers the *simulated* granularities, with hardware
beside it rather than on top of it. **That boundary is chosen, not accidental** —
recorded here so nobody later "fixes" it by merging them.

## 4. LiteX as the single source

`litex_boards/targets/sipeed_tang_nano_20k.py` exists upstream and is not a stub:
27 MHz in, 48 MHz default sys clock, `GENSDRPHY` against the in-package SDRAM,
and flags for `--with-video-terminal` (HDMI), `--with-spi-sdcard`,
`--with-rgb-led`, `--flash`.

The loop closes:

    LiteX SoC description
      |-- --csr-json csr.json --> generate-renode-scripts.py --> .repl + .resc --> Renode
      `-- yosys + nextpnr + apicula --------------------------> bitstream -----> real board

**One description produces both the simulation and the silicon**, so they cannot
drift. That is why this route was chosen over hand-composing existing `bw-board`
cores into something merely *called* a Tang Nano.

### 4.1 What VexRiscv costs, accepted knowingly

Renode is the functional tier, and **Renode knows RISC-V and ARM, not Z80.**
Choosing VexRiscv buys the single-source loop and **gives up the retro-core
story** the README leads with: `z80.js` and `w65c02.js` are not reused, and
nothing in TN0–TN5 serves the retro-builder audience. That trade was made
deliberately. It is not a gap to be discovered later and repaired in a hurry.

Debugging delegates to Renode, traces replaying through the existing `bw-debug`
recording/inspection/replay layer — so no RISC-V core, disassembler or
`bw-board` adapter has to be written. Debug capability is bounded by what Renode
exposes and what the trace format carries.

## 5. Why the heavy tier is hosted

Measured from the npm registry, 2026-09-15, `release` dist-tag:

| package | version | unpacked |
|---|---|---|
| `@yowasp/yosys` | 0.68.1207 | **78.3 MB** |
| `@yowasp/nextpnr-himbaechel-gowin` | 0.11.825 | **183.3 MB** |
| `digitaljs` | 0.14.2 | 14.6 MB |

(Naming trap: `@yowasp/nextpnr-himbaechel` alone does not exist on npm; the Gowin
flow is the `-gowin` package. Both ISC, zero dependencies.)

261 MB is **13x labwired's 20 MB**, and labwired was already heavy enough to be
fetched at deploy rather than committed, kept out of `getTargetKinds()` until
probed, and gated on a sha256 match (`scripts/sync-labwired-wasm.mjs` explains
why). Right shape, wrong scale for a school Chromebook — the audience the README
names first.

So: **hosted by default**, next to the compile route that already exists, with
local WASM as an explicit opt-in on the labwired probe pattern. Because a silent
backend switch would violate "never silently lower fidelity" in spirit, the
selected backend must be visible, and the two backends owe a **differential
gate** — the same bitstream from either, or bug reports become unfalsifiable.

Note while doing this that the 250 MB function limit quoted in
[device-matrix.md](device-matrix.md) is stale: Fluid Compute now allows 5 GB
packages, which changes that arithmetic entirely.

## 6. Device identity and surfaces

`DEVICE` names the **board** (`tangnano20k`); the SoC/personality is a separate
recorded field. The board id is stable because the hardware is, and adding a
personality never mints a new permanent id — the `stc12` lesson in
[device-matrix.md](device-matrix.md) is that an id in a saved `.sb3` is forever.

Cost: two fields must be read together — pin menus, debugger, compile route —
and code reading only `DEVICE` will be subtly wrong. **That deserves a test, not
a comment.**

If the Tang Nano becomes a device rather than only a part, the three-file
contract from [CHOOSING-HARDWARE.md](CHOOSING-HARDWARE.md) applies:
`DEVICE_GROUPS` in `pseudocode-importer.jsx`, the console button in
`stage-header.jsx`, and the pane in `gui.jsx` must agree, or the device "shows
up, gets selected, and does nothing". `test/device-choice-contract.test.mjs` is
the gate.

**HDL gets its own surface, not a Code-tab language.** The Code tab's premise is
blocks <-> pseudocode <-> Python/JS as representations of *one* program; Verilog
is not a representation of a Scratch script, and putting it there implies a
conversion that will never exist. That surface is the thing behind the flag.

## 7. Delivery: a lane, a flag, and a tab nobody sees yet

- **Branch:** a `lane/…` branch, claimed in LANES.md **in the same push as the
  first commit**, per the protocol at the top of that file. LANES.md is
  currently conflicted (`UU`) from the in-flight merge — **resolve that before
  claiming**, or the claim lands inside a conflict and is invisible to the next
  person, which is the exact failure LANES.md exists to prevent.
- **The HDL surface ships hidden**, on `main` as well as on the lane. Enabling
  it by default is a **separate, later decision that may never be taken** — an
  acceptable outcome, not a failure of the lane.
- **Merging early is fine; enabling early is not.** A hidden surface on `main`
  is reviewable and testable without promising users anything, and beats a
  long-lived branch rotting against a moving `main`. LANES.md's
  worktree-is-a-photograph warning applies with force.

### 7.1 How it is hidden

There is **no general feature-flag mechanism in the GUI overlay today** — the
only `process.env` reads are `BW_VERSION` and `BW_BUILD_TIME`. So this is chosen,
not reused:

- **Build-time flag `BW_ENABLE_FPGA`.** Webpack dead-code-eliminates the branch,
  so an off build pays **nothing** — no tab, no chunk, no digitaljs. That matters:
  `target-kinds.js` records that lite "measured 5.53 MB and ratchets against 7",
  and digitaljs alone is 14.6 MB unpacked. A runtime toggle cannot make that
  promise.
- **Plus the probe rule for tiers.** Which *tiers* appear inside the surface
  follows `LABWIRED_KIND`, not the flag: hosted synthesis always present, local
  WASM only once downloaded and probed, Renode only under Tauri. A tier nobody
  can select must not be listed.

The two mechanisms answer different questions and both are needed: the flag says
*does this feature exist in this build*; the probe says *is this tier reachable
right now*.

---

## 7.2 Working directories and work that already exists

Checked 2026-09-15. **None of this is greenfield in the way a first reading of
this document suggests**, and a fresh session will not find it unaided:

| what | where | state |
|---|---|---|
| `bw-board` (TN1) | `/mnt/volume1/code/lego/wt-bwb-master` | clean, `CrispStrobe/bw-board` |
| `bw-circuit-ui` (TN0) | `wt-pin-bw-circuit-ui`, `wt-cui-standard-parts` | clean; the latter on `lane/standard-parts-sidecars` |
| Renode source | `renode-spike-prime` (v1.16.1), `wt-renode-current-gate` (v1.17.0) | upstream trees |
| Renode integration | ~40 `wt-renode-*` worktrees | in-flight LEGO/SPIKE work |
| Renode as oracle | `LANES.md`, STM32 path lane, STM32 lane Phase 3 | **scoped, UNCLAIMED** |

Both TN0 and TN1 are **upstream changes plus a pin move**, not local edits —
`bw-circuit-ui` and `bw-board` are pinned packages here. Plan each as a lane in
its own repo, with the pin move as the delivery step into lite.

**Blocking everything:** `LANES.md` and `vendor-pins.json` carry conflict
markers with no `MERGE_HEAD` — stale leftover state, not an active merge.
Nothing can be claimed until that is resolved, and resolving `vendor-pins.json`
means deciding which `bw-board`/`bw-circuit-ui` shas are correct. Owner call.

## 8. Implementation plan — TN0 to TN6, two routes from TN5

Each phase is independently reviewable and names its own acceptance. Phases are
ordered by dependency, not by appeal.

### TN0 — Board part and the 3.3 V rule
**Where.** `bw-circuit-ui`, **upstream** — `parts-data/` lives in the pinned
package, so this is a lane there plus a pin move here, not a local edit.
Worktrees on this box: `wt-pin-bw-circuit-ui`, and `wt-cui-standard-parts`
(already on `lane/standard-parts-sidecars`, the parts-shaped lane).

**Deliver.** `parts-data/tang_nano_20k.json` + `.svg` following
`pi_pico.json`'s shape (`kind`, `w`/`h`, `terminals[]` with
`name`/`x`/`y`/`functions`), **plus its registry entries**. A new board part is
**not a drop-in JSON** — `pi_pico` is referenced from ~10 modules outside
`parts-data/`. Most are additive lookups keyed by `kind`:

| file | what it needs |
|---|---|
| `components/PartPalette.jsx` | the palette entry (label, colour) |
| `model/board-geometry.js` | `mmW`/`mmH`/`transpose`; plus the board list at ~line 168 |
| `data/land-patterns.js` | pad terminals / header order |
| `model/board-pairing.js`, `model/schematic-symbols.js`, `data/easyeda-symbols.js`, `importers/*` | check each; several are optional |

Then the DRC rule for **Gowin I/O not being 5 V tolerant**.

**Accept.** The part places and wires; the DRC fires when a bank pin meets a 5 V
rail and stays silent at 3.3 V; no new dependency; **not** behind the flag — a
part is useful alone.

**Gotcha that will otherwise cost you a green run.** `docs/TEST-REGISTRATION.md`
in that repo: `npm test` is *one long literal list of paths*, and a test file
not in it "does not run, does not fail, and does not show up anywhere as
missing." The 2026-08-25 census found 17 orphaned files holding 87 tests, 5 of
them failing. **Register the DRC test explicitly.**

**Why first.** Needs none of the decisions above to be right, and a learner who
wires a 5 V sensor into this board destroys it. Same class as the README's
"unsafe GPIO voltage".

### TN1 — `gate-level` semantics, upstream in `bw-board`
**Where.** `bw-board`, **upstream**. A clean checkout is already on this box at
`/mnt/volume1/code/lego/wt-bwb-master` (`github.com/CrispStrobe/bw-board`) — no
clone needed.
**Deliver.** A fourth `MACHINE_SEMANTICS` value and its policy/refusal path,
landed **upstream first**, then brought over by a pin move.
**Accept.** The pin moves through `test/pin-move-chain.test.mjs` and the sync
gates; requesting `gate-level` where it is unavailable produces a **named
refusal**, never a silent downgrade; the 8086 paths are unchanged.
**Why second.** Longest lead in the plan and it cannot be validated locally
until the pin moves. TN3 and TN5 both wait on it. Start it in parallel with TN0.

### TN2 — HDL surface behind the flag, gate-level tier on canned designs
**Deliver.** The new surface gated on `BW_ENABLE_FPGA`; digitaljs vendored under
the existing pin/sync regime (a `scripts/sync-*.mjs` with its `NOTICE`
declaration, per `test/notices-drift.test.mjs`); a fixed set of example netlists.
**Accept.** A flag-off build is **byte-identical to today's**, held by a test;
one canned netlist simulates and its signals are observable; the notices carry
digitaljs by name, licence and holder.
**Note.** No user HDL authoring yet, and the UI must be careful not to imply it.

### TN2b — The pin bridge into the circuit engine
**Deliver.** Top-level ports of a synthesised netlist exposed as pins the **MNA
circuit engine** can drive and read, so an FPGA design lights an LED on the
virtual breadboard beside it. The seam exists in `bw-board` — `pin-model.js`,
`pin-functions.js`, `infer-netlist.js` — but nothing today connects a Yosys
netlist's ports to circuit nodes.
**Accept.** A design with one input and one output drives a real part on the
breadboard, and the DRC still applies to the pin it drives.
**Why this is called out separately.** It was implied by TN2 and should not have
been. **This is plausibly the highest-value item in the whole plan** — "write
Verilog, watch it light an LED on the breadboard beside it" is something nothing
else does, and it is the point where the FPGA stops being a separate app and
becomes part of this one. It is also independent of every SoC decision.

### TN3 — Hosted synthesis
**Deliver.** Verilog in, **bitstream + Yosys netlist JSON out**, from a hosted
yosys/nextpnr/apicula route beside the existing compile route.
**Accept.** A blinky builds end to end for `GW2AR-LV18QN88C8/I7` with
`--vopt family` handled; outputs are reproducible and sha-recorded; failures
surface synthesis errors rather than a generic failure. **A GPL-licensed source
is refused BY NAME**, with the reason and a pointer to the local tier (§2.3);
an unlicensed source is refused outright. This is an acceptance criterion, not
later hardening.
**Note.** This is where the unknown-unknowns live. Budget accordingly.

### TN4 — Flashing, in Tauri
**Deliver.** openFPGALoader driven from the native app, beside the existing
serial and ScratchLink transports; browsers get a bitstream **file download**.
**Accept.** The board in hand blinks from a bitstream this project produced.
**Blocked on.** Identifying the USB-JTAG bridge on our revision — see §9.

### TN5a — LiteX + VexRiscv + Renode, the functional tier
**Reconcile before planning.** Overlaps the UNCLAIMED Renode phases of the STM32
lane (`LANES.md`, STM32 path lane) and the existing `wt-renode-*` worktrees. Talk to that
lane's owner; do not open a parallel Renode track.
**Deliver.** LiteX build producing bitstream and `csr.json`; litex-renode turning
that into `.repl`/`.resc`; Renode bundled in Tauri; hosted Renode emitting traces
that `bw-debug` replays for web users.
**Accept.** The same SoC description drives both the simulation and a bitstream
that runs on the board; a trace replays in the existing inspection UI; the
desktop/web difference (live vs replay) is **stated in the UI**, not discovered.

### TN5b — A retro SBC, in parallel with TN5a and not instead of it
**The two routes are additive, not exclusive.** Six of the seven phases —
TN0, TN1, TN2, TN2b, TN3, TN4, TN6 — are SoC-agnostic: Yosys, nextpnr and
apicula do not care what the HDL describes. **Only the functional tier forks.**

**Deliver.** A small 6502 or Z80 SBC in HDL — CPU, RAM, ROM, a UART, and GPIO
into the breadboard — with **our own `z80.js` / `w65c02.js` as the functional
tier** rather than Renode.

**What differs from TN5a, and it is one thing.** A LiteX SoC's `csr.json`
*generates* the Renode platform, so simulation and bitstream provably share one
description. A hand-written SBC has no such generator, so the correspondence
between our emulator and the HDL is **asserted, not generated**. That is not a
blocker — it is a claim needing different evidence, and this project already
has the culture for it: a **differential gate**, the same program on `z80.js`
and on real silicon, compared. `ucsim-stc`, `simavr` and the `emu8051-stc`
differential runner are the precedent.

**Where TN5b is strictly better than TN5a.** Renode is .NET and desktop-only, so
VexRiscv debugging is live in Tauri and replay-only on the web. `z80.js` is ours
and **already runs in the browser**, wired into `bw-debug` — so a retro
personality is **live-debuggable on a Chromebook**, which the RISC-V one cannot
be. The retro route is not the poor relation.

**Accept.** A program runs on the SBC in the browser and on the real board, and
a differential gate holds the two to the same observable behaviour.

**Why second, and it is only ordering.** TN5a first because LiteX hands over the
most working infrastructure for the least effort — a known-good board target, an
SoC that builds, a generated simulator. TN5b reuses the synthesis and flashing
that TN3/TN4 prove out. Both ship.

### TN6 — Local WASM synthesis, opt-in — and the only route for GPL cores
**Deliver.** `@yowasp/yosys` + `@yowasp/nextpnr-himbaechel-gowin` fetched on the
labwired pattern — deploy-time fetch, sha256 gate, absent until probed — with an
explicit user setting.
**Accept.** A **differential gate** proves hosted and local produce the same
bitstream for a fixed design; the active backend is visible in the UI; declining
the download leaves every other tier working.

### Dependencies

    TN0 ──────────────────────────────► (ships alone)
    TN1 ──┬──► TN3 ──┬──► TN4
          │          └──► TN6
          └──► TN2 ──► TN2b
    TN3 ──┬──► TN5a   (LiteX + VexRiscv + Renode)
          └──► TN5b   (retro SBC + our own emulator)
    both TN5a and TN5b also need TN4 for the silicon half.

TN0, TN1, TN2, TN2b, TN3, TN4 and TN6 are SoC-agnostic and serve both routes.
Only TN5a/TN5b fork.

### Explicit non-goals for the whole plan

Linux on the soft CPU (8 MB SDRAM); **complete home computers** (C64, Electron,
Amiga — licence and ROM walls, see §2.2); shipping any GPL or unlicensed core;
Verilator as a shipped dependency; DSP or SERDES primitives; HDMI beyond a test
pattern; a `gate-level` tier that claims to model timing; and **the tab on by
default**.
These are follow-ons or separate decisions, not acceptance shortcuts.

## 9. Still open, deliberately

- **Which USB-JTAG bridge is on our 20K revision** (FTDI vs Bouffalo
  BL702/BL616). Browser flashing is per-bridge WebUSB work plus the Windows
  WinUSB/Zadig driver-claim problem Web Serial does not have. **Blocks any
  flashing promise in the UI.** Answer before TN4.
- **How digitaljs's rendering reconciles with the circuit surface.** It brings
  its own visualisation; two visual languages for "wires and parts" in one app is
  a design problem, not a packaging one.
- **apicula's primitive coverage beyond BSRAM.** The examples tree demonstrates
  `DPB`/`SDPB`/`SP`, a `DVI` example and an `attosoc`, so block RAM, video and a
  small SoC are proven. DSP and SERDES are unverified; the readme is silent.
- **Whether the in-browser Yosys download shrinks usefully** when only the
  Gowin-relevant chunks load. Measure before ruling TN6's local route in or out.
