# Tang Nano 20K (Gowin GW2AR-18) — decisions and implementation plan

Scoped 2026-09-15, and **partly built the same day** — this file is no longer a
plan alone. Supersedes two earlier drafts: one that assumed the 9K, one that
left the architecture open.

## Status, as of 2026-09-15

| phase | state |
|---|---|
| **TN0** board part + 3.3 V DRC | **landed** — `bw-circuit-ui` PR #24, in lite via the pin move |
| **TN1** `gate-level` semantics | **landed** — `bw-board` PR #6, in lite via the pin move |
| pins moved into lite | **landed** — lite PR #112 (`bw-board` 76877a2, `bw-circuit-ui` 1c8e827) |
| **TN2** HDL surface behind `BW_ENABLE_FPGA` | **landed** — lite PR #113 |
| **TN2b** the pin bridge | **in review** — lite PR #114 |
| inert-rail DRC rule (a TN0 follow-up) | **in review** — `bw-circuit-ui` PR #25 |
| **TN3** client half | **landed** — lite PRs #124, #125 |
| **TN3** service | **runs on a real host** — hardened container, differential proven; TLS/DNS pending — [`CrispStrobe/bw-synth`](https://github.com/CrispStrobe/bw-synth), §5.2 |
| **TN6a** capability gate | **landed** — lite PR #127 |
| **TN6b** bitstream packer | **works** — byte-identical to native, in Chromium 151 (§8d) |
| **TN6b** whole chain in a browser | **works** — Verilog → bitstream, byte-identical, ~280 MB (§8e) |
| **TN6a** fetch + worker | **landed** — local synthesis to a netlist, behind the flag |
| **the flag-on surface, assembled** | **driven in a real browser, all 4 paths pass** — staging, §7.4 |
| TN6b place & route in the app · TN4 flashing · TN5a/TN5b | not started |

**What works today:** the Tang Nano 20K places and wires on a breadboard with a
real pinout, the 3.3 V rule catches 5 V fed back into a bank pin, and — behind
the flag — a Gowin `.cst` is read against the real part to say which ports reach
the board, with an output port driving a real LED through the real solver.

**What does not exist:** synthesis, any model of the fabric, flashing, and every
SoC. The surface says so, and a test refuses text that would claim otherwise.

Hardware in hand: `GW2AR-LV18QN88C8/I7`, QN88, **20736 LUT4 / 15552 FF**,
64 Mbit SDRAM in package, HDMI, microSD, RGB LED, 27 MHz input, onboard
USB-JTAG. Generous for any soft CPU we would ship; **8 MB of SDRAM rules out
Linux** — do not plan for it.

Implementation note that otherwise costs an afternoon, now with the part the
readme leaves out: **C-grade devices require `--vopt family`**, and the value is
the **chipdb name, not the part number**.

    device  GW2AR-LV18QN88C8/I7   the ordering code — what you buy
    family  GW2A-18C              the chipdb — what nextpnr loads and
                                  gowin_pack takes as -d

The Tang Nano 20K's part is a C-grade GW2A-18 — that is what the `C8` means — so
its database is `GW2A-18C`. nextpnr ships `GW1N-1`, `GW1N-4`, `GW1N-9`,
`GW1N-9C`, `GW1NS-4`, `GW1NZ-1`, `GW2A-18`, `GW2A-18C`, `GW5A-25A`,
`GW5AST-138C` — and **no `GW2A` at all**, which is the string a reader infers
from the part number and the one that cost three CI rounds in `bw-synth`.

Apicula's line about C devices is distinguishing the C-grade database from the
plain one. This document repeated that rule four times before anyone understood
what it was distinguishing.

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
  2026-09-15: they build on the LOCAL tier only** (§2.3) — but see **§8c**: the
  local tier cannot currently produce a bitstream at all, because the packer is
  Python and has no browser build. GPL cores can be simulated locally; they
  cannot reach silicon through this app today.
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

### 5.1 The limit this section checked was the wrong limit

The paragraph that used to stand here said the 250 MB function limit quoted in
[device-matrix.md](device-matrix.md) was stale, because Fluid Compute now allows
5 GB packages, and that this changed the arithmetic entirely. **That is true and
it does not help.** The service was built and deployed — `CrispStrobe/bw-synth`,
live at `https://bw-synth.vercel.app` — and the package ceiling was never what
stopped it. The deployment builds fine at 333 MB.

Measured from inside the running function on 2026-09-16, not inferred:

    /tmp         525 MB total,   0 MB free
    dependencies             333 MB   (installed into /tmp by the runtime)
    /var/task     31 MB total,   0 MB free

The dependencies are installed into `/tmp`, and the YoWASP packages then want to
unpack their WebAssembly into that same filesystem on first run. There is nothing
left, and the tool dies with `OSError: [Errno 28] No space left on device`.

**The binding constraint is writable ephemeral storage at runtime, not package
size.** A ~330 MB toolchain that unpacks another ~100 MB does not fit in 525 MB,
and no amount of headroom in the 5 GB package ceiling changes that number.

What this does not invalidate: §5's conclusion that the heavy tier belongs off
the Chromebook. 261 MB of WASM is still the wrong thing to ship to the audience
the README names first. What it invalidates is the assumption that *hosted*
meant *the same serverless platform the compile route already uses* — that
followed from a limit nobody had measured against this workload.

What is proven in production today: the contract, the routing, and **the licence
rule** — a GPL-3.0 source POSTed to `/api/synth` is refused by name, with
evidence, pointing at the local tier, without ever reaching synthesis. `gowin_pack`
resolves and runs. `/api/health` reports 503 with the per-tool reasons and those
byte counts, because the client's backend selector is fail-closed and a backend
that cannot do the work must not be offered.

So TN3's remaining work is **a host with a real disk** — a container (Fly,
Railway, Render) or Vercel Sandbox — and that is a platform decision, not a code
one. The flow itself is not in doubt: bw-synth's CI builds a blinky to a
**6.16 MB bitstream** for `GW2AR-LV18QN88C8/I7` on every push.

### 5.2 It runs on a real host — measured 2026-09-17

The platform decision was taken: bw-synth runs in a **hardened Docker container**
on the project's own VPS, and it does everything Vercel could not. Measured on
that host: **368 MB installed, ~200 MB peak RSS, ~8 s per build** — the toolchain
fits with room to spare the moment the disk is real.

Proven against the running service, not asserted (`scripts/probe-hosted-synth.mjs`):

- a blinky comes back as `586e54ac…64e257d` — **byte-identical to the native and
  browser chains** (§8d, §8e). All three tiers are now pinned to one bitstream,
  which is the differential §5 demanded: *the same bitstream from either, or bug
  reports become unfalsifiable.*
- a GPL-3.0 source is refused **by name**, `alternative: local-tier`, synthesis
  never reached — the licence rule, enforced in production.

The container is confined because it runs a toolchain over arbitrary Verilog from
the internet: non-root, read-only root filesystem, all Linux capabilities
dropped, `no-new-privileges`, published only on loopback behind nginx, and
**egress blocked at the host firewall** — a synthesiser has no reason to make an
outbound connection, and a blocked one cannot exfiltrate if the toolchain is ever
exploited. `deploy/` in `bw-synth` carries the run command, the egress block, its
systemd unit, and the nginx vhost, so it is reproducible rather than living on one
box; `DEPLOY.md` records the three bugs that cost the deploy (the YoWASP cache
path, the `--internal`-network trap, and that neither shows up outside a real WSGI
server).

**It is public.** `https://synth.crispstro.be/api` — real Let's Encrypt TLS,
HTTP redirected to HTTPS, `scripts/probe-hosted-synth.mjs` green against it over
the open internet: the byte-identical blinky and the licence refusal, both from
the deployed service rather than a tunnel.

That is the canonical hosted endpoint. It is **not** wired into the default site,
and should not be: the FPGA surface is off in every build here (`BW_ENABLE_FPGA`
unset), so a hosted endpoint in that build would point at a tab nobody can open.
A flag-on build is where it belongs, and it is one pairing:

```
BW_ENABLE_FPGA=1 BW_SYNTHESIS_ENDPOINT=https://synth.crispstro.be/api npm run build
```

Then the hosted backend appears in the selector beside local. Nothing about §8c's
UI rule changes: hosted still cannot build copyleft, and the selector stays
fail-closed — a service that answered 503 would simply not be offered.

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
**Status, 2026-09-16.** Built as `CrispStrobe/bw-synth` and deployed. The
licence refusal is enforced in production; the flow builds a blinky to a
6.16 MB bitstream in CI. It **cannot run on the deployed host**: 525 MB of
writable `/tmp`, 0 MB free after a 333 MB install (§5.1). Remaining work is
re-homing to a host with a real disk, which is a platform decision.

### TN4 — Flashing, in Tauri
**Deliver.** openFPGALoader driven from the native app, beside the existing
serial and ScratchLink transports; browsers get a bitstream **file download**.
**Accept.** The board in hand blinks from a bitstream this project produced.
**Blocked on.** Capturing the USB descriptors and exercising the programmer on
the board in hand — see §9. The protocol family can now be identified without
claiming the device, but descriptors cannot identify the physical bridge chip.

**Status, 2026-09-17 — the JS half is wired, the rest is off this box.** The
browser path is done: a hosted build's `.fs` downloads, and the tab shows the
`openFPGALoader -b tangnano20k design.fs` command for a user with the board. The
native path is `lib/bw-fpga/fpga-tauri-transport.js`, the same `invoke()` shape
as `pico-tauri-transport.js`, and it is **fail-closed by probe**: it asks the
native app for an `fpga_flash_available` command and a "Flash to board" button
appears only if that answers — so the button never shows in a browser or in an
app that does not implement flashing. Six unit tests cover it with an injected
`invoke`.

What is NOT done here, and cannot be: the Rust `fpga_flash_available` /
`fpga_flash_bitstream` commands live in the Tauri app (another repo), and
flashing needs a board on USB — which this VM has no passthrough for. So the
acceptance criterion (a board blinks from our bitstream) is unmet until those
commands exist and someone runs it on hardware. The JS half is ready for them.

**And what DOES flash today, without the native app:** the `bw-fpga` CLI
(`scripts/bw-fpga.mjs`) — `bw-fpga flash ./design.fs` shells to openFPGALoader —
and openFPGALoader run directly. The tab's browser path names both.

#### TN4b — Flashing from the browser over WebUSB (scaffold in, flasher not)

**Why a scaffold and not a flasher.** Direct browser flashing means reimplementing,
over WebUSB, what openFPGALoader does against the board's on-board USB→JTAG bridge:
claim the bridge, drive JTAG through its FT2232-compatible protocol,
read IDCODE and check it is a GW2AR-18, then run the Gowin programming sequence
(SRAM vs embedded flash: erase, stream the `.fs`, read back and verify) — bounded,
cancellable, honest about a half-written flash. **Every step of that can only be
validated against a real board** (exact descriptors, the bridge command set, JTAG
timing), and this VM has no USB passthrough. Shipping an *untested* flasher would
be exactly the "implies flashing works when it does not" that
`fpga-surface-flag`'s honesty gate forbids.

**What landed (`lib/bw-fpga/webusb-flash.js`):** the foundation that needs no
hardware to be correct — `webUsbSupported()`, `requestBoard()` (the picker, scoped
to `TANG_NANO_USB_FILTERS`), and `flashOverWebUsb()`, which returns a NAMED
`not-implemented` refusal and **never a false success** (a unit test pins that
invariant). The tab, when the browser has WebUSB, says direct flashing is planned
here but not built — no button that pretends. The plan above is the whole of what
is left; it wants a board on someone's desk, not more design.

**Read-only USB identification, 2026-09-19.** Sipeed documents the Nano 20K's
onboard debugger as a [Bouffalo BL616](https://wiki.sipeed.com/hardware/en/tang/tang-nano-20k/nano-20k.html),
while openFPGALoader's [board table](https://github.com/trabucayre/openFPGALoader/blob/master/src/board.hpp)
selects its `ft2232` transport for `tangnano20k`. Those facts are compatible:
the BL616 firmware has been reported upstream to
[emulate an FT2232 and reuse its USB vendor ID](https://github.com/trabucayre/openFPGALoader/issues/418).
Consequently a `0403:6010` descriptor identifies an **FT2232-compatible USB
protocol**, not an FTDI chip. Manufacturer and product strings are useful
evidence, but do not prove the silicon either.

`lib/bw-fpga/usb-identification.js` records those descriptor fields and
classifies the presented protocol. Its granted-device inventory calls only
`navigator.usb.getDevices()`; it does not prompt, open a device, choose a
configuration, claim an interface, or transfer bytes. WebUSB permission belongs
to an origin, so a grant made to the deployed site does not carry over to a
local server. Run `python3 -m http.server 8000` at the repository root, open
`http://localhost:8000/`, and exercise that module from that page's browser
console:

```js
const usbId = await import(
    'http://localhost:8000/overlay/scratch-gui/src/lib/bw-fpga/usb-identification.js'
);
await usbId.inspectGrantedUsbDevices(navigator.usb);
```

An `{ok: true, devices: []}` result means this origin has no already-granted
device. To grant this localhost origin access deliberately, import the existing
picker and invoke it separately; it prompts but still does not open, claim, or
program the selected device:

```js
const picker = await import(
    'http://localhost:8000/overlay/scratch-gui/src/lib/bw-fpga/webusb-flash.js'
);
await picker.requestBoard(navigator.usb); // deliberate permission prompt
await usbId.inspectGrantedUsbDevices(navigator.usb); // read-only inventory
```

This VM has no Tang Nano USB passthrough:
its only non-root-hub device is a QEMU tablet (`0627:0001`), and
openFPGALoader is not installed. No real-board descriptor or flash result is
claimed here.

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

## 7.3 The synthesis service exists — `CrispStrobe/bw-synth`

Created 2026-09-16, per the decision to give it its own repository rather than
bolt it onto lite's Vercel project or onto `stc-compiler`. lite's project builds
the editor; coupling that deploy to a ~300 MB toolchain would inflate a build
that already ratchets on payload.

**It is Python, not Node, and the reason is not preference.** `gowin_pack` *is*
Apicula, which is Python. All three tools are on PyPI — `yowasp-yosys`,
`yowasp-nextpnr-himbaechel-gowin`, `apycula` — so one runtime installs the whole
flow. A Node service would have needed a second runtime for the packer alone.

**What is proven, and what is not:**

| claim | state |
|---|---|
| synthesis runs end to end | **proven** — a blinky reaches a 6.16 MB bitstream in CI |
| the request path is correct | **proven** — 11 cases, no socket, no toolchain |
| the licence screen refuses copyleft | **proven** — 7 cases, both repos, tested independently |
| the service has ever served a request | **yes** — in production, and it refused a GPL-3.0 source by name |
| it is deployed | **yes** — `https://bw-synth.vercel.app` |
| **synthesis runs ON THE DEPLOYED HOST** | **no** — 525 MB of writable `/tmp`, 0 MB free (§5.1) |

The last row is the one that matters, and it is kept separate from the first
deliberately: everything above it works in production, and the thing the service
exists to do does not, because of where it is running rather than what it is.
`/api/health` reports that in those words with the byte counts, so the client's
fail-closed selector does not offer a backend that cannot build.

The licence screen is duplicated there on purpose. lite screens before upload,
which is right for the user — a refusal after the source has left the machine has
already lost — but that is a client, a client can be bypassed, and the rule it
enforces is what keeps the service from being a GPL distributor. A policy that
depends on a browser is not a policy.

**Four CI rounds, and three were the same mistake:** guessing a plausible string
against a toolchain nobody had run — a dependency version that belonged to
another package, a binary named after its package rather than its tool, and a
chipdb that does not exist. The fourth asked the toolchain what it had and got an
answer in one round. That is recorded in `bw-synth`'s README for whoever repeats
it.

## 7.4 The surface was assembled and driven — staging, 2026-09-17

Every part of the FPGA surface had been proven in isolation — unit tests, the
packer probe, the browser-chain probe, the request-path tests. None of it had
ever been **compiled into a real editor build and clicked**, because
`BW_ENABLE_FPGA` is off in every build here and `check-flagged-jsx` only *parses*
the flagged files. So a flag-on staging build was made — CI `workflow_dispatch`
on a throwaway branch, `BW_ENABLE_FPGA=1` and `BW_SYNTHESIS_ENDPOINT` pointed at
the deployed `https://synth.crispstro.be/api` — served at `fpga.crispstro.be` and
driven in headless Chromium 151. All four paths pass:

| path | result |
|---|---|
| the tab scrolls | client 628 / content 2119, `overflow:auto` |
| hosted synth | `ok`, 4.6 MB bitstream, a **Download .fs** blob link |
| local toolchain | 77 MB Yosys fetched in-browser, WasmGC compiled, worker ready |
| local synth | netlist produced, a **Download netlist** link |

**It found four real bugs that every isolated test had missed** — which is the
whole reason to assemble it:

1. **The tab did not scroll.** Its root is a flex item in a `display:flex` panel,
   and a flex item's default `min-height:auto` refuses to shrink below its
   content, so the tall content overflowed and everything below the fold was
   unreachable. Fixed with the absolute-inset pattern `circuit-tab.jsx` uses in
   the same panel.
2. **A successful build was invisible.** The result was rendered only when NOT
   ok, so a working synthesis stranded its bitstream/netlist in state. Now a
   Blob download.
3. **`/api/health` raced the client's 3 s probe.** It re-ran all three WASM tools
   (~2.5 s) on every call, so the hosted backend flickered in and out of
   "available". Fixed in bw-synth by memoizing the healthy result (immutable
   container) and warming it at worker boot — 2.5 s → 0.1 s.
4. **The local tier forced `-top top`.** It defaulted the top module to the
   literal `top`, so `synth_gowin` found no such module and produced nothing for
   any design not named `top`. Now it lets `synth_gowin` auto-select, as the
   hosted route does.

**The lesson, recorded because it will recur:** the source-text gates on the
flagged surface (`fpga-surface-flag`) are *necessary but not sufficient*. The
first scroll fix passed its gate and did not fix the browser; the gate was a
proxy that matched the source while the layout stayed broken. Anything that is
layout, wiring, or runtime behaviour needs a flag-on build and a real browser to
confirm — the gates catch a deleted property, not a wrong one. Budget a staging
drive when the surface changes, not just a green gate.

**Known remaining polish (not a bug):** the local netlist is offered as a
download but not yet auto-loaded into the gate-level simulator above it, though
the tab's own text implies it would be. Wiring `synth.netlist` into the
simulator's input is a small change, deferred because it is UI behaviour that
wants the same flag-on browser confirmation and the box was under load.

## 7.5 Driving the on-screen board (#1) — the lite side is ready, the seam is upstream

The honest gap behind "the tab doesn't do much": it produces a bitstream/netlist
file and DISPLAYS, as text, "what the circuit engine would be told" — it never
drives the visible breadboard, so you can't watch your design light an LED. That
is the payoff, and it was set aside for the examples/flashing work. Here is where
it actually stands, measured 2026-09-17, so whoever picks it up does not re-derive
it.

**The lite side is already built.** `lib/bw-fpga/drive.js`'s `applyPortValues(
circuit, bindings, values)` takes any `{setPin(terminal, mode, driveHigh)}` and
drives the design's simulated output values onto the bound terminals. The pin
bridge (`port-bridge.js`) already maps ports → the Tang Nano's header terminals,
and the Tang Nano is a placed part whose pins ARE driveable terminals
(`PASSTHROUGH_KINDS`). The tab computes exactly this today — it just applies it to
a throwaway recorder (`{setPin: (...a) => ops.push(a)}`) instead of a real
circuit, because it has nothing else to hand it.

**The seam that is missing is upstream, in `bw-circuit-ui`.** The live `Circuit`
(the one with `setPin`) lives inside the lazily-mounted `CircuitDesigner`, and
lite reaches it only through the `bw-circuit-file` window-message channel — which
carries file load/save and `m.toJSON()` snapshots, NOT a live "drive these
terminals" call. The package exposes no drive API and no channel for one (checked:
no `setPin`/`externalDrive`/drive-message export in the vendored tree). So the FPGA
tab has the values and the bindings and the code to apply them, and no handle to
the real circuit to apply them TO.

**What unblocks it, precisely.** bw-circuit-ui needs to expose one of:
  1. the live `Circuit`'s `setPin` (or the `Circuit` itself) on a known handle —
     e.g. `window.__bwCircuit` published by `CircuitDesigner` while mounted, the
     same shape `pico-sim-run.js` uses for `window.__bwPicoSim`; or
  2. a `bw-circuit-drive` message: `{terminal, mode, driveHigh}` that
     `CircuitDesigner` applies to its `Circuit` and repaints.
Either is small in bw-circuit-ui and turns the lite side into three lines: on a
settled sim, `applyPortValues(theExposedCircuit, bindings, sim.values)`. It is an
upstream lane (its repo, its owner), with lite as the ready consumer — the same
posture as the TN0/TN1 pin work.

**And a clock (#2), which is lite-only and independent.** A combinational design
(Button → LED) would light the moment #1 lands, because its output follows its
input with no time involved. A sequential one (the Counter) needs clock edges to
move: `GateLevelSim` settles once, and nothing toggles `clk`. A "Run" control that
pulses the clock input and re-settles on a timer — `setInput(clk, 0)` → settle →
`setInput(clk, 1)` → settle, repeatedly — makes counters advance and their LEDs
animate. That is self-contained in `sim.js` + the tab and does not wait on
bw-circuit-ui; it just has no VISIBLE effect until #1 gives the values somewhere
to go, so the two are best done together.

## 7.6 #1 and #2 landed — and feeding the sim a REAL netlist found the next wall

Both shipped. The upstream seam (#1) is live: `bw-circuit-ui` at the pinned
`6997596` publishes `window.__bwCircuit = {setPin, advanceBy, advanceTo}` from
`CircuitDesigner`'s mount effect (I made that upstream change), and the pin bump
that activates it merged as #158. The consumer half was already in the tab.

The clock (#2) shipped as #159 — but NOT as the timer-"Run" sketched above. A
timer would have animated nothing useful: `GateLevelSim.tickClock(clockPort,
cycles)` drives the clock low→high and settles each edge, bounded like `settle`;
the tab drives it from a **single-step** "Clock" panel (Step / +8 / Reset). The
reason is arithmetic, and it is the first thing to know here: **the `counter`
example divides its clock by 2²⁰, so it needs ~a million steps to move an LED in
the gate-level sim** — a timer would spin forever and show nothing. A new
`sequence` example (a 4-bit counter, no divider) is the one built to step. A
divided clock is right for real silicon and wrong for tick-by-tick simulation;
that tension is inherent, not a bug.

**The contract verifies end to end at the source level.** `setPin(pin, mode,
driveHigh)` (upstream) ← `useCircuit` ← `circuit.setPin`, and `applyPortValues`
calls `setPin(b.terminal, mode, value)` with that exact shape; the deps are
`useCallback`-stable, so the handle publishes once on mount. `fpga-gate-level-sim`'s
"THE LOOP" already proves `applyPortValues` lights a real `bw-circuit-ui` board.

**What only a REAL netlist could show — and it is a wall.** Every test and the
§7.4 staging drive used hand-written GENERIC netlists or only *downloaded* the
synth output; nobody had fed a real `synth_gowin` netlist to the gate-level sim,
because §7.5 deferred the drive. Doing so (blink, from `synth.crispstro.be`)
found two things the fixtures hid:

1. **Real Yosys marks the top module `"00000000000000000000000000000001"`** — a
   32-bit binary string, not the integer `1` the fixtures used — so `topModule`
   read every real netlist as "no top module", breaking the pin checker on real
   output. **Fixed** (`topAttrSet` decodes the binary form; a test now uses the
   real format). The pin checker now places `led` from the real blink netlist.
2. **`synth_gowin` output is not simulatable as-is.** It carries `$specify2`
   timing cells and Gowin primitives (`OBUF`, `VCC`, `LUT*`), and
   `yosys2digitaljs` rejects them (`Invalid cell type: $specify2`). So the sim —
   fed the tab's own synthesis output — produces no values, and the seam has
   nothing to drive. The tab reports this honestly (a named `conversion-failed`),
   but a synthesised design cannot yet animate the board.

**What unblocks #2's payoff (the next lane).** The sim needs a **generic**
netlist, not the bitstream one: a second Yosys pass (`read_verilog; proc; opt;
… write_json` — the technology-independent shape `yosys2digitaljs` is built for),
produced alongside the Gowin-mapped netlist that `gowin_pack` needs. That is a
change in the synthesis producers — `bw-synth` (hosted) and `local-toolchain.js`
(the in-browser worker) — to return `{bitstreamNetlist, simNetlist}`, with the
tab feeding `simNetlist` to `GateLevelSim`. Until then the seam is proven by
contract and by the hand-written LOOP, and drives correctly for any generic
netlist; it simply has no real synthesised design to carry, because the synthesis
tier hands it a netlist its simulator was never meant to read.

## 7.7 The wall is down — a synthesised design drives the board, end to end

Built. The generic sim netlist now exists on BOTH producers, and a second,
smaller wall behind it was found and fixed too.

- **bw-synth** (hosted, PR #1): `synthesise()` runs a second, technology-independent
  pass — extracted as `sim_netlist()`, the same coarse flow `yosys2digitaljs`
  uses (`proc; opt; memory -nomap; wreduce -memx; opt -full; write_json`) — and
  returns it as `simNetlist` beside the Gowin `netlist`. It degrades to null
  rather than failing the bitstream.
- **local-toolchain.js** (in-browser worker): the same second pass, so the local
  tier drives the board too, not just the hosted one.
- **synthesis.js / the tab**: `simNetlist` is carried through the contract, and
  BOTH synth routes now feed it into `netlistText` — which closes the §7.4 "known
  polish" (the hosted route used to only offer a download and never drove).

**The second wall: `GateLevelSim` addressed ports by NAME.** With a real
`simNetlist` in hand, `setInput('clk')` still threw — because `yosys2digitaljs`
names its devices `dev0/dev1/…` and carries the port in a `net` property, while
the hand-written fixtures used net-as-id. So `GateLevelSim` now builds a
port-name → device-id map from the netlist's Input/Output devices (identity for
the fixtures, a real translation for synthesised output). Only after THIS does a
real netlist drive.

**Proven end to end** (`fpga-sim-real-netlist`, on fixtures that are real `yosys`
output, not hand-written): blink settles `led` HIGH, and the 4-bit `sequence`
counter — held at 0 in reset, then stepped — reads `1,2,3,4,5,6` on the board.
That is a synthesised design lighting the on-screen breadboard through the whole
chain: Verilog → generic netlist → `yosys2digitaljs` → `GateLevelSim` → the #2
clock → `applyPortValues` → the circuit. The payoff #1 and #2 were built for is
real — but two more walls stood between §7.7 (proven in Node) and it working in a
real browser, and §7.8 is where they fell.

## 7.8 It works in a real browser — and the last two walls only a browser could show

§7.7 proved the chain in Node. Assembling it into a flag-on build and DRIVING it
in headless Chromium — the §7.4 discipline — found two more faults that every Node
test and every source gate passed straight through. Both are now fixed, and the
loop is **verified end to end in a real browser**.

**Wall 1 — the example did not count in the TAB.** The `sequence` counter used an
async reset. But the tab rebuilds `GateLevelSim` from scratch on every step and
only ever `tickClock`s; it can never assert-then-release a reset across steps. So
the counter sat at `x` (reset released) or `0` (reset held) and never moved — the
one example built to be watched moving, didn't. Fixed (#162) with a reset-FREE
counter whose register is INITIALISED (`reg [3:0] cnt = 0`): Yosys carries the
init, `yosys2digitaljs` honours it as the flop's `initial`, and it counts on the
clock alone — exactly what the tab's step model drives.

**Wall 2 — the drive handle vanished under the FPGA tab.** The drive reached
`window.__bwCircuit`, published by `CircuitDesigner`'s mount effect (#158) and
DELETED when the designer unmounts — which it does whenever a non-Circuit tab is
active under the default debugger dock, i.e. exactly when the FPGA tab is showing.
Measured in the browser: present on the Circuit tab, `false` on the FPGA tab. So
`setPin` was never called, though the source gate for the handle passed. The fix
(#163): lite ALREADY published the right handle — `window.__circuit`, the live
`Circuit` model from `circuit-tab.jsx`'s `onCircuitReady` (also on
`vm.runtime.circuitModel`), which OUTLIVES the designer and survives the tab
switch. The drive now prefers it; `window.__bwCircuit` is a fallback only. (§7.5's
search for a handle looked at the vendored `bw-circuit-ui` tree and missed lite's
own `onCircuitReady` — which is why the redundant upstream handle was added at
all.)

**The proof.** A flag-on build (`BW_ENABLE_FPGA=1`), driven in headless Chromium:
load the reset-free counter's netlist, expand the pin-checker panel, step the
Clock button — and `p15..p18` are driven through `window.__circuit`, the LSB `p15`
toggling `true,false,true,false` as the counter counts `1,2,3,4`. Every earlier
tier was already green; only the assembled, clicked build showed these two, which
is the whole reason §7.4 says to budget a browser drive whenever the surface
changes.

**One piece is deployment, not code.** The hosted `synth.crispstro.be` must be
redeployed to return `simNetlist` (`cd /opt/bwsynth && git pull && docker build -t
bwsynth:latest . && sudo IMAGE=bwsynth:latest deploy/run.sh`); it needs root on
the VPS. The LOCAL in-browser tier drives the board today with no deploy.

## 7.9 The FPGA tab got a VISUAL analog, and the surface reaches users (2026-09-18)

The tab was the app's one non-visual surface — a Verilog textbox in an app whose
whole premise is seeing and manipulating. HDL is not a Scratch script
(concurrent, structural), so the honest analog is **not** blocks: it is a
**schematic**. Every library needed was already installed (`yosys2digitaljs`,
`elkjs`, `digitaljs`), so it was built without new dependencies and without
`@joint/core` (MPL-2.0) — layout is elkjs, drawing is our own SVG.

A three-rung learning ladder, each rung a pure tested core + a lazy UI chunk:

- **Rung 1 — gate schematic** (`schematic.js`, `fpga-schematic.jsx`): the
  synthesised design drawn as gates. Wires light by value — I/O first, then
  every INTERNAL net (read defensively from the digitaljs engine graph, so a
  read failure degrades to I/O-only, never a regression). *Browser-verified: a
  blink wire lit green; a counter drew a multi-cell schematic.*
- **Rung 2 — waveforms** (`waveform.js`, `sim.js` `traceClock`,
  `fpga-waveform.jsx`): each output bit as a square wave over cycles. *Verified:
  a 4-bit counter reads led[0] `0101…`, led[3] `0000…1111` — each bit half the
  frequency below it.* (This is the §2.3 "signal-level waveforms" that were
  deferred; they turned out cheap once a real netlist and sim existed.)
- **Rung 3 — gate builder** (`gate-builder.js`, `gate-eval.js`,
  `fpga-gate-builder.jsx`): place gates, wire them, and it generates matching
  Verilog + a `.cst` and runs it — *no HDL typed*. It also RUNS live in-browser
  (toggle an input, step the clock, watch wires light) so synthesis becomes "put
  it on real hardware", not the only way to see logic work. *Verified: a built
  D-flip-flop generated valid Verilog and returned a bitstream from the hosted
  service; a T flip-flop halves the clock in the live evaluator.* The Verilog
  and the evaluator both tie an unconnected input low, so the live view predicts
  the hardware. The FPGA tab now mirrors the Code tab's blocks↔text duality, as
  **gates↔HDL**.

**And the surface reaches users, not just exists.** A runtime opt-in
(`bw-fpga-preferences`, default OFF) + a Settings toggle ship the ⬢ tab; the
`bw-fpga` CLI drives synth/flash/check; starter examples fill the box in one
click; a one-click demo board wires a Tang Nano + LEDs on **the pins the loaded
design drives** and works OUT OF THE BOX (it shows the Circuit tab, which mounts
the designer and publishes the live handle); a synthesised design's LEDs mirror
into the Controller/**Widgets** view (a free-running clock makes them watchable
there); and a first-run guide walks the whole journey and points to all three
visual views. The board-native pin→widget path (bw-board #12) lands with the
d4cb508 pin move.

## 8a. Decision 6 had a dependency problem — found, and resolved by taking a different subpath

**Resolved. Kept because the reasoning is reusable, not because it is pending.**

digitaljs itself is BSD-2-Clause, as the interview recorded. Its dependency tree
is not uniformly so — and the way out was not any of the three options this
section first proposed. It was a fourth: **the package has a headless entry that
does not reach the problem at all.** That is what shipped.

**The full transitive tree, installed and read from each package's own
`package.json` — 12 packages, exactly one problem:**

| dependency | licence | verdict |
|---|---|---|
| `digitaljs` 0.14.2, `3vl`, `wavecanvas` | BSD-2-Clause | allowed |
| `@joint/core` 4.1.3, `@joint/layout-directed-graph` 4.1.4 | MPL-2.0 | allowed |
| `@dagrejs/dagre` 1.0.4, `@dagrejs/graphlib` 2.1.13 | MIT | allowed |
| `jquery` 3.7.1, `jquery-ui` 1.14.2 | MIT | allowed |
| `fastpriorityqueue` 0.7.5, `web-worker` 1.5.0 | Apache-2.0 | allowed |
| **`elkjs` 0.11.1** | **EPL-2.0** | **not in our set** |

Two corrections to this section's first draft, both from installing the tree
rather than reading registry metadata for `latest`:

- **The version that actually resolves is `elkjs@0.11.1`, not 0.12.0** —
  digitaljs pins `^0.11.0`. Its own `package.json` and `LICENSE.md` declare
  **EPL-2.0 alone**, not the `EPL-2.0 OR GPL-3.0-or-later` dual that npm reports
  for 0.12.0. There is no GPL half to worry about, and no choice of licence to
  elect. The lesson is narrow and repeatable: **audit the resolved tree, not the
  registry's `latest`.**
- **The MIT dagre packages are already installed**, because
  `@joint/layout-directed-graph` depends on them. The alternative layout engine
  needs nothing added.

### It is a layout engine, and digitaljs already has another one

`src/index.mjs` takes `layoutEngine` as a constructor option with two values:
`"dagre"`, which uses the **MPL-2.0** `@joint/layout-directed-graph`, and
`"elkjs"`, which is the default. So elkjs is optional AT RUNTIME.

It is not optional at BUILD time: line 16 is a static
`import { elk_layout } from './elkjs.mjs';`, so it is bundled whichever engine
is selected.

### What shipped, and why not the three options first considered

**SHIPPED: the headless core, via a webpack alias.** `digitaljs`'s `package.json`
declares `main: ./lib/circuit.js` — the headless simulator — and reaches the
visual editor only through its `browser` export condition. The headless import
graph is `@joint/core` (MPL-2.0), `3vl` (BSD-2) and `jquery` (MIT): **no elkjs,
no jquery-ui.** So the licence problem disappears rather than being negotiated
with, and 4.6 MB of jquery-ui goes with it.

An alias is also the only available mechanism: the package declares no subpath
exports, so `digitaljs/lib/circuit.js` cannot be imported directly
(`ERR_PACKAGE_PATH_NOT_EXPORTED`). Webpack's alias bypasses the exports map,
which is wanted here and nowhere else.

The same shape applied to the converter: `yosys2digitaljs` exposes `core` (pure
JSON-to-JSON, requiring exactly `3vl`, `big-integer`, `hashmap`) and `node`
(shells out to Yosys, pulls a WTFPL-only dependency). We take `core`.

`test/fpga-third-party-surface.test.mjs` holds both boundaries: it fails if the
alias is removed, if any source imports a full entry, if the converter's core
grows a dependency, or if either package stops being pinned exactly.

The three options this section originally listed, and why none was needed:

1. **Patch the static import out and select `dagre`.** Would have worked, and
   costs a maintained patch against a third-party package plus the whole
   jQuery/JointJS UI stack we do not want in a React app.
2. **Add EPL-2.0 to the allowed set.** Unnecessary once nothing reaches elkjs.
   The analysis is kept below because the question will recur.
3. **Write the gate-level simulator ourselves.** Rejected by the interview, and
   the headless core made the question moot.

**The audit above IS the full transitive tree** (installed with
`npm install --ignore-scripts digitaljs@0.14.2` and walked, reading each
package's own declaration). Twelve packages, one blocker, and the blocker is a
layout engine whose MIT replacement is already in the tree. THIRD-PARTY-NOTICES.md
still needs its per-file entries written when this lands.

## 8b. Two things only building it revealed

Both cost a debugging detour and are recorded so the next person does not repeat
them.

### The board's own power pins are inert, and that looks like a broken part

`tang_nano_20k` is a `PASSTHROUGH` kind: the engine models it as driveable
terminals and **nothing else**. Its GND, 3V3 and 5V pins are places to wire, not
sources. A bench returning an LED's cathode to the board's own `gnd_1` reads
**1.3e-10 A** — indistinguishable from a broken part, and the available
conclusion is "the simulator is lying".

It is not; the loop is open. On real hardware that circuit works, which is
exactly why nobody suspects the bench. Wiring the return leg to the board's
ground pin is the obvious first move, so the trap sits on the most likely first
circuit anyone builds with this part.

A `board-rail-not-simulated` **warning** now names it (bw-circuit-ui PR #25) —
warning and not danger, because the bench is wrong and the circuit is not, and
firing only when something is actually wired to the pin. **The real fix is an
engine device for the board so its rails carry current like the hardware does.**
That is unbuilt and worth doing.

### The engine's current sign convention changed under us

The pin move adopted bw-circuit-ui `4aea457`, *"Align CUI raw currents with
positive-OUT contract"*: raw current is signed **positive OUT of the probed
terminal**, so a forward LED current, which ENTERS the anode, reads negative.
Four lite benches encoded the old convention and were the stale party; their
assertions moved to the contract, with no expected magnitude changed — which is
the check that distinguishes a convention from a drift.

Anything reading a current from this engine needs to know this. It is not
specific to the FPGA work; it just surfaced here first.

## 8c. TN6 cannot produce a bitstream in a browser — WRONG, corrected 2026-09-17

> **Read §8d first.** This section was written on 2026-09-16 and its central
> claim is false. `gowin_pack` runs in Pyodide and produces a **byte-identical**
> bitstream to the native packer. The section is kept unedited below because the
> reasoning that led to the wrong conclusion is worth seeing, and because §8d is
> a correction to it rather than a replacement.

**This qualifies decision 19 and should be read before planning the local tier.**

Decision 19 sends GPL-licensed cores to the local tier because building them on
our server would convey a derivative work. That reasoning is sound and unchanged.
What was not checked at the time is whether the local tier can actually *finish
the job*.

It cannot, today. The Gowin flow has three stages and only two of them can run
in a browser:

| stage | tool | browser? |
|---|---|---|
| synthesis | Yosys | **yes** — `@yowasp/yosys`, 78.3 MB |
| place & route | nextpnr-himbaechel-gowin | **yes** — 183.3 MB |
| **bitstream packing** | **Apicula `gowin_pack`** | **NO** |

`gowin_pack` is Python. There is no `@yowasp/apicula`, no equivalent on npm, and
nothing published that packs a Gowin bitstream in JavaScript or WebAssembly.

### What that means, stated plainly

**A GPL core can be SIMULATED locally but cannot reach real silicon through this
app at all.** Not "slowly" or "with a download" — there is no path. The hosted
route refuses it by policy and the local route cannot finish it by capability.

That is a real gap in decision 19, and it is better to know now than after
someone downloads 261 MB expecting a bitstream.

### The only route around it, and it is unproven

Pyodide (MPL-2.0, in the allowed set) could in principle run `apycula` in the
browser. Apicula declares a `pure` extra (`msgpack`, `cattrs`) alongside its
default compiled dependencies (`msgspec`, `fastcrc`), which suggests a
pure-Python path exists for exactly this kind of environment. With numpy, the
wheel and the device database that is roughly another 40 MB on top of 261 MB,
and **none of it has been tried.**

### So TN6 splits, and only one half is worth building now

**TN6a — local synthesis to a NETLIST.** Yosys alone, 78.3 MB. Turns Verilog
into something the gate-level tier can simulate, with no service and no licence
question. Useful, decision-free, and a quarter of the download.

**TN6b — local place & route and bitstream.** Needs nextpnr (183.3 MB) *and* a
browser-runnable packer that does not exist. Research, not implementation.

**The recommendation is TN6a now, TN6b as a spike later** — and, separately,
that the UI must not offer a local *bitstream* until TN6b exists, because a
button that cannot finish is the lie `target-kinds.js` describes.

## 8d. The spike was run, and the packer works — measured 2026-09-17

**§8c's central claim is false.** `gowin_pack` runs in Pyodide and produces a
bitstream **byte-identical** to the one the native packer produces, in headless
Chromium 151 and in Node 20. Two designs, both matching:

| design | | native `gowin_pack` | in the browser |
|---|---|---|---|
| `blink` | one output tied high | `586e54ac…64e257d` | same |
| `counter` | 26-bit counter, 36 LUT4, 26 DFF | `21502783…8b69704` | same |

Both pack to 4,618,782 bytes, because a Gowin bitstream is a fixed-size frame
image for the part — **length proves nothing here**, which is why the hashes are
the assertion and why `test/fpga-pyodide-packer.test.mjs` separately requires the
two designs to differ from each other. A packer that ignored its input would
otherwise pass.

Cost, measured rather than guessed: Pyodide core **13 MB**, its wheels (numpy,
msgspec and micropip's own) **3.4 MB**, Apicula **3.5 MB** — about **20 MB**, of
which the GW2A-18C chip database is 0.38 MB. §8c guessed "roughly another 40 MB".
Toolchain ready in ~8 s; each pack takes ~6 s.

### Two things §8c had wrong, and the second is the interesting one

**Apicula's `[pure]` extra is not the pure-Python path.** §8c read the extra as
suggesting one existed. It ADDS `msgpack` and `cattrs`; it never removes
`fastcrc`, a compiled Rust extension with no pure wheel. `micropip.install(
'apycula[pure]')` fails in exactly the same place the bare install does, and
`fastcrc` is the *only* thing that fails — numpy, msgspec, msgpack and cattrs all
install.

**Apicula does not need `fastcrc`, and already says so in its own source.**
`apycula/crc16.py` guards the import with `try/except ImportError` and falls back
to a 256-entry CRC-16/ARC table, warning about performance. `setup.py` lists as a
hard dependency something the code treats as optional. Installing with
`deps=False` and supplying numpy and msgspec by hand yields the whole packer.
The fallback was verified against the standard CRC-16/ARC check vector
(`"123456789"` → `0xBB3D`) rather than trusted.

So the blocker was never a missing capability. It was **one line of packaging
metadata**, and the route around it is three lines of install code.

### The fix belongs upstream, and it is written

`deps=False` is a workaround for someone else's packaging bug, and a workaround
in our install path is a thing we own forever. So the fix exists on a fork —
[`CrispStrobe/apicula`](https://github.com/CrispStrobe/apicula), branch
`fastcrc-optional-on-wasm` — as an environment marker:

```python
'fastcrc; sys_platform != "emscripten"',
```

That changes nothing for anyone: fastcrc is still installed everywhere it can
build, and simply not asked for where no wheel can exist.

**Proven by a controlled experiment, not by reasoning.** The released 0.32 wheel
was repacked with exactly one line of its METADATA rewritten and every other
member copied byte for byte, so the dependency declaration is the only variable:

| wheel | `micropip.install`, deps ON |
|---|---|
| released | `ValueError: Can't find a pure Python 3 wheel for 'fastcrc'` |
| one METADATA line changed | **OK** |

and the patched install then packs `counter` to the same
`21502783…8b69704` the native packer produces. The change is necessary *and*
sufficient.

No pull request is open yet — that is a decision, not an oversight. Until one is
merged and released, `scripts/probe-pyodide-packer.mjs` keeps `deps=False`,
which is why that flag carries a comment saying it is load-bearing rather than a
shortcut.

### Why this was testable here when the synthesis half is not

Pyodide is ordinary Emscripten WebAssembly. It needs neither WasmGC nor
`try_table`, which is what keeps the YoWASP tools off this Node 20 box
(`lib/bw-fpga/wasm-capabilities.js`). The packer half of TN6b is therefore
testable on runtimes where the synthesis half is not.

That asymmetry is asserted — but only where it can be. Showing the packer does
not *need* WasmGC means packing somewhere WasmGC is absent; on a runtime that has
it, a successful pack proves nothing about independence from it. CI runs Node 22
and has it, this box runs Node 20 and does not, so the test carries the absence
as a **precondition** rather than an assertion and skips by name elsewhere, with
a pointer at the Node 20 box under LANES.md's "Skips that execute elsewhere".
The first version asserted "this runtime lacks WasmGC" and reddened CI — a claim
about the environment wearing the costume of a claim about the packer.

### What this changes, and what it does not

**Decision 19 now has a route to silicon.** A GPL core sent to the local tier
can reach a bitstream. §8c's "there is no path" was the strongest objection to
decision 19 and it is withdrawn.

**TN6b is no longer research.** What remains is nextpnr at 183.3 MB, which needs
WasmGC (Chromium 151 has it, that Node 20 box does not) — a **size and capability
question, not an existence one**. The packer is 20 MB of the ~203 MB total, and
it is done.

**The UI rule in §8c stands unchanged.** A local bitstream must not be offered
until the whole chain can finish, because the packer working does not mean place
and route does. `backends.js` is fail-closed for this, and nothing here makes the
local backend offerable.

**The fixtures are nextpnr output, not a substitute for it.** `blink-pnr.json`
and `counter-pnr.json` were produced by the real flow and committed so the packer
can be gated without 261 MB of toolchain. They prove the packer, not the chain.

## 8e. The whole chain runs in a browser — measured 2026-09-17

§8d closed the packer. This closes nextpnr, the 183 MB stage nobody had tried,
and with it TN6b's existence question. **Verilog to bitstream, entirely in
Chromium 151, byte-identical to the fully native chain.**

| stage | | time | fetched |
|---|---|---|---|
| synthesis | `@yowasp/yosys` | 3.9 s | 77.4 MB |
| place & route | `@yowasp/nextpnr-himbaechel-gowin` | 2.8 s | 182.9 MB |
| bitstream | Apicula under Pyodide | 5.5 s | ~20 MB |

```
bitstream   586e54ac…64e257d
native was  586e54ac…64e257d
```

Repeatable: `node scripts/probe-browser-fpga-chain.mjs --install`, then run it.

### The version skew is the interesting part of the result

The npm nextpnr and the PyPI one are different builds, and their `--write` JSON
differs — `c8ef337d…` from the browser against a differently-sized file from the
native run. **The bitstream does not differ.** The differential holds at the
artefact that reaches hardware and not at the intermediate, which is the outcome
you want and not the one you would have predicted by hashing the middle of the
pipeline. Anyone tempted to gate on the nextpnr JSON should read that twice.

### Where the 183 MB actually is

The nextpnr wasm is **2.5 MB**. The other 180 MB is four chipdb resource
tarballs, and the package fetches **all four regardless of the target family** —
this flow needs GW2A-18C alone, and Apicula's own database for that part is
0.38 MB. So the size problem is not the tool, it is that the resource bundle is
not selective. That is the lever for anyone shrinking this, and it is now a
measured number rather than a guess.

### Node 20 refuses it, from the engine rather than from our probe

```
invalid value type 'noexternref', enable with --experimental-wasm-gc
```

That is `lib/bw-fpga/wasm-capabilities.js`'s refusal arriving independently, from
the WebAssembly engine, on a runtime the probe already declines. Two instruments
agreeing is worth more than either alone — and it is why the capability gate has
to come *before* the 78 MB rather than after.

### There is no gate behind this, deliberately

~280 MB per run buys a re-proof of an **existence** claim, and existence does not
regress the way behaviour does. `test/fpga-pyodide-packer.test.mjs` gates the
packer because that is 20 MB and it is the half that can silently break: an
upstream Apicula release can change a bitstream. A browser cannot stop having
WebAssembly.

### What is now true about TN6b, and what it still does not license

The chain exists and produces the right artefact. What remains is **entirely
size and UX** — 280 MB is not a download you hand a school Chromebook without
asking, which is what §5 said about 261 MB and still says.

**The UI rule from §8c is unchanged and this does not relax it.** A local
bitstream may be offered when the app can actually run this chain, on a probe,
with the download consented to — not because a probe script on a workstation
proved it possible. `backends.js` stays fail-closed, and `local` stays
`not-downloaded`.

## 9. Still open, deliberately

- **Capture and exercise the debugger on the 20K revision in hand.** Its
  `0403:6010` descriptor can establish an FT2232-compatible protocol, but cannot
  distinguish an FTDI chip from BL616 firmware emulating one. Record the exact
  descriptors, then validate open/claim, JTAG IDCODE and programming on the real
  board. Windows still has the WinUSB/Zadig driver-claim problem Web Serial does
  not have. **Blocks any flashing promise in the UI.**
- **How digitaljs's rendering reconciles with the circuit surface.** It brings
  its own visualisation; two visual languages for "wires and parts" in one app is
  a design problem, not a packaging one.
- **apicula's primitive coverage beyond BSRAM.** The examples tree demonstrates
  `DPB`/`SDPB`/`SP`, a `DVI` example and an `attosoc`, so block RAM, video and a
  small SoC are proven. DSP and SERDES are unverified; the readme is silent.
- **Whether the in-browser Yosys download shrinks usefully** when only the
  Gowin-relevant chunks load. Measure before ruling TN6's local route in or out.
