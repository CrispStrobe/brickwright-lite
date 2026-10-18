# Robot Lab × SPIKE emulators — integration plan (R13, L3 lockstep)

Status: **plan, not built.** Written 2026-10-17 on `lane/simlab-r13-plan-20261017` (docs
only). Base: `docs/ROBOT-LAB-ARCHITECTURE.md` (§3.2 levels, §3.3 time, §3.4 worker protocol,
§3.5 R13, §5.1 `VirtualHub`, owner decisions D2/D4/D5/D7, D3 open) and the R1 boundary as
built on `origin/lane/simlab-r1-20261017` (`757fbd5e9`). Owner of record for the Robot Lab
side: unclaimed — §6 has the claim text.

Conventions. Lite paths are relative to the repository root; `G` = `overlay/scratch-gui/src/lib`,
`T` = `apps/tauri/src-tauri/src`. Out-of-repo code is cited at an exact commit:

| Short name | Repository | Commit read |
|---|---|---|
| **Infra** (model fork) | `CrispStrobe/renode-infrastructure-spike-prime` | `7d377613a` (main, 2026-10-08) |
| **Runtime** | `CrispStrobe/renode-spike-prime` | `b1fc66cd2` (main) |
| **Firmware** | `CrispStrobe/brickwright-spike-prime-fw` | `68735cd` (Mac checkout, read-only) |

Everything marked **measured** was run by this lane (§1.7); everything else is read from code.
Nothing outside this file was modified, built or deleted.

Contents: 0 Summary · 1 Facts · 2 L3 design · 3 The browser question · 4 Slices ·
5 Risks and owner questions · 6 Coordination

---

## 0. Summary

1. **There is no external-shaft mode today.** The emulated SPIKE motor
   (`Lpf2ElectricalMotor`, Infra `LegoLpf2ElectricalPort.cs:120–163`) integrates its own
   speed and position from the sampled H-bridge duty and a `LoadPercent` (0–100), 1 ms per
   tick. The only physics→motor feedback the GUI has is that load percent (the arena sends
   100 % when the rover is blocked, `G/spike-arena/renode-arena-bridge.js:115–118`). What is
   *already* there is the half we need on the other side: `BridgeDrive` (−10000…10000, read
   straight from the STM32 timer/GPIO registers) and `BridgeBraking` are public properties
   (`LegoLpf2ElectricalPort.cs:71–90`). The firmware closes its speed loop on the motor's LPF2
   `POS` reports (Firmware `apps/hubprogram/motor.c:15–38`, `device.c`), so overriding the
   model's position/speed **is** the external shaft — the firmware needs no change.
2. **Today Renode free-runs** (`renode.spike.run` = GDB continue, `T/renode_debugger.rs:536–568`)
   and the GUI polls `state.read` every 50 ms (`G/spike-arena/renode-arena-session.js:292–302`).
   No op advances guest time by a quantum after boot. **Measured** on the VPS (stock Renode
   1.16.1 + the own NuttX package pinned to it, booted as the supervisor does):
   `emulation RunFor "0.005"` costs **≈120 ms wall** (median of 400) — a real-time factor
   of **≈0.04**, and it is the *emulation itself*, not the per-quantum overhead: 100 ms quanta
   give the same ≈0.04, and the 1 s boot quantum took 23.5 s. A monitor round trip costs
   ≈6 ms. So lockstep is feasible and exact (virtual time advanced by exactly the requested
   amount every time), but on this host the full NuttX machine runs at ~1/25 real time
   whether or not it is locked to physics. The Mac/desktop rate is unmeasured (no Renode on
   the Mac). Speeding up the emulated machine (Infra/Runtime) is a prerequisite for a usable
   Robot Lab route, independent of lockstep; a lockstep step must in any case be **one**
   request (apply inputs → `RunFor` → observe) so round trips add little (§1.7).
3. **Design**: physics owns time; one exchange per 5 ms step — shaft angle/speed and sensor
   values in, `RunFor 5 ms`, mean H-bridge duty + brake flag out — into R1's `VirtualHub` as
   `pwm` drives (D5's DC model, R3). **D3 recommendation: option (c)** — a scene with an L3 hub
   runs physics *in-thread, one step per exchange*, so nothing is ever speculated and nothing
   needs rewinding; Renode snapshots are not needed and L1 hubs may share the scene.
4. **Browser**: no SPIKE emulator route can run in the browser (Renode is a native .NET +
   dynamic-translation application; no WASM build exists anywhere we pin). L3 is desktop-only.
   The web build keeps L1 (Scratch, pseudocode, converted SPIKE 3 Python); a real-Python
   L2 route (MicroPython compiled to WASM with a SPIKE 3 API shim over the `VirtualHub`) is
   proposed as a separate lane and needs an owner decision (§3).
5. **Other owners**: Infra (external shaft + mean duty), Runtime (`lockstep.step` command,
   drive in the snapshot, non-blocking START), Lite SPIKE native/session lanes (new Tauri
   ops, session-time limit). The firmware needs nothing for NuttX. Messages in §6.

---

## 1. Facts

### 1.1 The SPIKE emulator routes (what runs in Renode)

`docs/SPIKE-STATUS-AND-LANES.md` ("What works") lists five SPIKE routes; four involve Renode.

| Route | Guest | Motor path in the emulator | Encoder authority | Robot Lab candidate? |
|---|---|---|---|---|
| Small ARM guest `brickwright-arena-demo` ("Firmware program" on the small guest) | Firmware `simulation/arena-demo/main.c` (BSD-3), a 1 ms SysTick interpreter of the closed four-integer ABI (`T/arena_inputs.rs:121–160`) | **none** — guest code sets a *target speed* (300 °/s demo, ≤1110 °/s ABI) and integrates `position += speed` in RAM (`main.c:52–78`); loads arrive through a RAM mailbox (Runtime `tools/spike_arena_mailbox.py:33–47`) | the guest's RAM | **No** for R13: speed-level, not an H-bridge; an external shaft would need a guest ABI change. Note only. |
| Full NuttX (own firmware): native program runner + embedded MicroPython `brickwright` module | Firmware `nuttx`, `apps/hubprogram` (`SPIKE-NUTTX.md`) | firmware PI speed loop (`motor.c:15–38`: reference ramp 2000/4000 °/s², `duty = ref·10000/1110 + 3·err + ∫/1000`) → STM32 timer PWM → `LegoLpf2ElectricalPort.BridgeDrive` → `Lpf2ElectricalMotor` | the **model** (`Lpf2ElectricalMotor.position`), reported to the firmware as LPF2 mode 2 `POS` every 10 ms (`ReportIntervalMicroseconds => 10000`, `:129`) | **Yes — the R13 target.** |
| Upstream MicroPython `LEGO_HUB_NO6` (user-supplied image) + Runtime `bwspike`/`bwhub` | operator-chosen image, raw REPL over a modelled UART (`T/spike_micropython_uart.rs`, `G/spike-micropython/raw-repl.js`) | electrical ports as above (the `micropython-six-motors/v1` capability "describe[s] observed electrical-model state", Runtime `scripts/spike-state-server.py:355–370`) | the model | **Yes, second** (same port model; image is not ours to ship). |
| Unchanged stock LEGO image | operator-supplied | — | — | **No**: "not a working interchangeable editor backend" (`docs/SPIKE-STATUS-AND-LANES.md`, route table). |

### 1.2 How the desktop app starts and drives Renode today

- **Process.** `RenodeSupervisor::start_spike_profile` (`T/renode_supervisor.rs:512–633`)
  resolves a build-time-pinned package (`BW_RENODE_NUTTX_*` / `BW_RENODE_SPIKE_*` env at
  compile time, `:519–530`), verifies every file's SHA-256 against its manifest, and launches
  Renode with fixed `-e` monitor commands (`spike_arguments`, `:1182–1209`): `include` the
  scenario, `sysbus LoadELF`, `machine StartGdbServer`, `include spike-state-server.py`,
  `spike_state_start 127.0.0.1 {BW_STATE_PORT} state-config.json`. For NuttX it also loads
  the kernel ELF, sets `VectorTableOffset`/`SP`/`PC` and runs `emulation RunFor "1.0"` to boot
  (`:604–620`); the small guest gets `RunFor "0.002"` (`:582–593`). Three loopback ports are
  reserved: monitor, GDB, state (`:774–814`). **Wall-clock limit: 120 s per process**
  (`MAX_SESSION_TIME`, `:24`, used at `:463, 486, 497`). Caller arguments are a closed DTO:
  `backend ∈ {guest, nuttx, micropython}` and `topology ∈ {default, six-motors,
  dual-ultrasonic}` (`T/arena_inputs.rs:13–19`).
- **Topology.** The scenario (`nuttx.resc`, in the package) calls
  `emulation CreatePrimeElectricalPorts "machine-0"`; Infra `PrimeElectricalPorts.cs:23–30`
  fixes the default attachments: **A, B motor; C colour; D ultrasonic; E force; F none**.
  `six-motors` attaches motors on A–F before the ELF loads (`T/renode_supervisor.rs:106–131`).
- **Run/pause.** `renode.spike.run` resumes through GDB RSP (`T/renode_debugger.rs:536–568`),
  `pause` interrupts it (`:570–591`); `step` is a single *instruction* step (`:528–534`).
  Between those the emulation **free-runs**; nothing in Lite advances it by a time quantum.
- **State service.** `spike-state-server.py` runs *inside* Renode (IronPython), one TCP client,
  newline-delimited JSON; every observation and input is taken under
  `monitor.Machine.ObtainPausedState(True)` (Runtime `scripts/spike-state-server.py:516–530`),
  i.e. it briefly pauses the free-running machine. Tauri's client is
  `BrickStateFeed` (`T/renode_brick_state.rs`): a closed command allowlist (`:505–520`), a
  per-target admission check (`:534–566`), then it writes `{schemaVersion, type:"command",
  requestId, expectedSeq, command, arguments}` and **polls for the reply with 5 ms sleeps**
  up to 2 s (`:580–603`); a timeout or rejection kills the feed (`:604–611`).

### 1.3 Ops and frame formats

Broker operations (`T/native_policy.rs:235–253`; JS names in
`overlay/scratch-vm/src/extension-support/native-renode-capability.js:3–35`):
`renode.spike.session.start|close`, `run`, `pause`, `reset`, `step`, `registers.read`,
`memory.read`, `state.read`, `arena.inputs.write`, `arena.program.load`, `program.packet`,
`program.storage.submit`, `micropython.uart.read|write|close`, `breakpoint.set|clear`,
`micropython.image.choose`. Timeouts are host-chosen (`T/native_broker_transport.rs:171–179`).

| Format | Shape (source) | Notes for the Robot Lab |
|---|---|---|
| `brick-state/v1` snapshot | `{schemaVersion:1, type:"snapshot", seq, clockNs, target{board, firmware, transport, imageSha256, capabilities[], limitations[]}, lifecycle, ports[], motors[], sensors[], display, buttons, battery, power, imu, audio, storage, bluetooth}` (`T/renode_brick_state.rs:21–52`; Runtime `contracts/brick-state/v1/schema.json`) | `clockNs` = Renode `MasterTimeSource.ElapsedVirtualTime` for NuttX/MicroPython (`spike-state-server.py:278, 372`), the guest's ms counter for the small guest. Motors: `{port, speed, position (deg, float), speedDps, stalled, demandDirection ∈ {−1,0,1}}` (`:288–292`) — **direction only, no duty value**, although the model has it. |
| `arena.inputs` | `{sensors:[{port, kind: distance|color|force, values}], loads:[{port, percent 0–100}], hub?}` (`T/arena_inputs.rs:37–83`; Runtime `docs/SPIKE-ARENA-INPUTS.md`) | Applied through the models' public setters (`tools/spike_arena_inputs.py:119–156`): `SetDistance` (−1 → 65535), colour `SetReading(colorId, reflection, ambient)`, force `SetReading(percent, pressed)`, motor `SetLoad(percent)`. No position, no speed. |
| `prime-hub-io/v1` | `hub: {buttons{left,center,right,bluetooth}, imuRaw{temperature, angularRate[3], acceleration[3]}}`, signed 16-bit raw (`G/spike-arena/prime-hub-io.js:3–12`) | Admitted **only** for `micropython-prime` (`T/renode_brick_state.rs:553–557`); fed with `imu.FeedSample(...)` (`spike_arena_inputs.py:149–153`). NuttX has no IMU input path. Raw↔physical scale is not published ("keep unknown modern IMU mapping false", `docs/SPIKE-STATUS-AND-LANES.md` G06). |
| Firmware program ABI v1 | `{version:1, instructions:[[op,a,b,c]…≤256]}`, ops 0 end, 1 motor speed (±1110), 2 wait ms, 3/5 sensor wait/branch, 4 jump, 6 run-for-degrees (`T/arena_inputs.rs:121–160`); compiled by `G/spike-arena/firmware-program.js` | Runs on the small guest *and* on full NuttX ("the same program ABI", `SPIKE-NUTTX.md`). Uploaded to NuttX as `program.packet` BEGIN/CHUNK/COMMIT/START (`G/spike-nuttx/upload-protocol.js`). The state service **waits up to 1.5 s wall for the firmware's reply while the machine runs** (`spike-state-server.py:425–432`) — that wait cannot complete if guest time is not advancing (§2.6). |

### 1.4 The GUI side: session, bridge, telemetry

- `RenodeArenaSession` (`G/spike-arena/renode-arena-session.js`): `start()` → `session.start`
  → first `state.read` → optional program load → `arena.inputs.write` → `run` (`:60–163`);
  then `schedule()` polls every **50 ms** (`:292–302`): `state.read` → `acceptFrame` →
  `arena.inputs.write` (`:303–344`).
- `RenodeArenaBridge.accept` (`G/spike-arena/renode-arena-bridge.js`): requires
  `arena-inputs/v1, arena-clock/v1, guest-motor-output/v1, state-sample/v1` (`:8`), checks
  identity/seq/clock continuity (gaps ≤ 2 s, `:73–77`), takes the hub clock
  (`hub.clockOwner = 'renode'`, `:81`) and then **moves the arena's wheels kinematically to
  follow the guest's encoders**, interpolated into ≤ 5 ms steps (`:89–95`). Inputs back:
  sensors from the arena's probes, and `loads` = 100 % on a drive port when the stall contact
  model says the wheels are blocked (`:106–131`).
- `writeObservedMotor` (`G/virtual-hub/motor-telemetry.js:7–16`) copies guest
  `{position, speedDps, stalled}` into `VirtualSpikeHubState` without running a controller.

So today **the guest's motor model is authoritative and the world follows it** — the
direction the architecture (§3.1, last paragraph) says is wrong for the Robot Lab.

### 1.5 The out-of-repo port model (Infra)

`LegoLpf2ElectricalPort : LegoLpf2Port` (`LegoLpf2ElectricalPort.cs`, BSD-3, Brickwright
contributors):

- **Electrical identity.** Drives the ID1/ID2 GPIO lines like a UART device (`:45–56`); LPF2
  discovery, mode negotiation and data reports are the base `LegoLpf2Port`
  (`LegoLpf2Port.cs`, 115200 Bd, `AdvanceEmulatedTime` with per-device report intervals and a
  coalescing cap, `:196–231`). Device types: `Lpf2ElectricalMotor` (type 48, modes POWER,
  SPEED, POS), `Lpf2ArenaColorSensor` (61), `Lpf2UltrasonicSensor` (62),
  `Lpf2ArenaForceSensor` (63) (`Lpf2ArenaSensors.cs`, `Lpf2Devices.cs`). Sensor reports every
  **100 ms**; the motor every **10 ms**.
- **H-bridge sampling.** `BridgeDrive` reads TIMx `CR1`, `BDTR.MOE`, `ARR`, `CCRn`, the GPIO
  mode/AF/level of both bridge pins, and accepts exactly the "active-low PWM on one leg, other
  leg driven high" waveform of the board driver (`:71–109`); result −10000…10000.
  `BridgeBraking` = both legs GPIO-output high (`:89–90`). Both are public and side-effect
  free ("Sample on a paused machine for a coherent multi-register observation", `:68–70`).
- **Clock.** A managed thread at **1000 Hz** of virtual time (`ObtainManagedThread(Tick,1000)`,
  `:40`); each `Tick` pushes the sampled drive into the motor (`:57–61`) and advances it 1 ms
  (`:62–66`).
- **Its own motor model** ("Deterministic mechanical policy, not a calibrated model of a real
  motor", `:119`): target speed `duty·1110/10000·(100−load)/100`, slew 2000 °/s² driving,
  4000 °/s² braking, 200 °/s² coasting, trapezoidal position integration; `Stalled` iff
  driven and load = 100 (`:131–147`).
- **External shaft / injected encoder: does not exist.** `SetLoad` is the only input
  (`:137`). `PositionDegrees`, `EncoderDegrees`, `AngularVelocityDegreesPerSecond` are
  read-only views of the internal integrator; `ReadMode(2)` reports `round(position)` as the
  POS frame (`:148–157`). **What it would take** (≈40 lines + tests, Infra only):
  1. `Lpf2ElectricalMotor.SetShaft(double positionDeg, double speedDps)` and a
     `ShaftSource {Internal, External}` switch (`EnableExternalShaft()`; never switched back
     in a session). In External mode `Advance(ms)` does **not** integrate the mechanics; it
     extrapolates `position += speed·ms/1000` from the last injected anchor (so the firmware's
     10 ms POS reports inside a 5 ms quantum see a continuous shaft) and keeps `speed` as
     injected. `Stalled` = false, `LoadPercent` ignored (`SetLoad` refused in External mode).
  2. A duty integrator: `Tick` adds the sampled `BridgeDrive` and counts braking ticks;
     `TakeDriveAverage()` returns `{meanDrive, lastDrive, brakingTicks, ticks}` and resets —
     the mean over the quantum is the zero-order-hold value the physics needs (a firmware may
     change the duty mid-quantum; the sample at the end alone aliases).
  3. Internal mode stays bit-identical (existing `LegoLpf2PortTests.cs` unchanged).
- Licensing: our model files are BSD-3; Renode itself MIT (Runtime `LICENSE`).

### 1.6 Time: free-run vs `RunFor` quanta

- Desktop sessions never set Renode's pacing (`grep AdvanceImmediately|Quantum` over
  `T/` and the packages finds nothing): after boot the machine free-runs under GDB continue,
  observed at ~20 Hz by the 50 ms poll; the observation's `clockNs` is whatever virtual time
  had elapsed. Inputs land at arbitrary guest times; nothing is reproducible run to run.
- `emulation RunFor "<s>"` is used by the supervisor only for boot. It advances virtual time
  by exactly the requested amount and returns paused (**measured**: 4.2 s of quanta moved
  `ElapsedVirtualTime` from 1000.0 to 5200.0 ms exactly, §1.7).
- The Runtime throughput benchmark (`tests/platforms/SPIKE_Prime/stm32f413-throughput-test.sh`)
  requires ≥ 1.0× real time at 96 MHz for an active loop with **1 s** quanta and
  `SetGlobalAdvanceImmediately true` — i.e. the CPU itself is fast enough; per-quantum
  overhead is the question for 5 ms lockstep.

### 1.7 Measurements (this lane, VPS, 2026-10-17)

Setup: Renode **1.16.1.17033** linux-portable-dotnet (the pin of the 2026-10-02 desktop
packages, `/mnt/volume1/code/lego/brickwright-spike-prime-fw/.local/tools/renode-1.16.1/renode`),
own NuttX package (models compiled from its `models.cs`), booted exactly as the supervisor
does (kernel + user ELF, `VectorTableOffset/SP/PC`, `RunFor "1.0"`), driven by a Python client
over the **monitor socket** (`-P`), `nice -n 10`, copies only in `/tmp/simlab-r13-measure`.
Host: 4 vCPUs, shared; load average 2–5 during the valid run (19–27 during the discarded
one). Script: §A at the end. Startup with the C# model compile took 13–121 s depending on
load.

| Series (NuttX package of 2026-10-02, Renode 1.16.1, load avg 2–5) | n | median wall per call | p90 | virtual s per wall s |
|---|---|---|---|---|
| boot `RunFor "1.0"` | 1 | 23 527 ms | — | 0.043 |
| `RunFor "0.005"` | 400 | 124.8 ms | 145.6 ms | **0.040** |
| `RunFor "0.005"` + one monitor `python` read | 200 | 130.6 ms | 152.7 ms | 0.038 |
| `RunFor "0.001"` | 200 | 28.2 ms | 37.4 ms | 0.035 |
| `RunFor "0.1"` | 10 | 2 428 ms | 2 495 ms | 0.041 |
| same four series with `emulation SetGlobalAdvanceImmediately true` | — | 119.5 / 130.4 / 29.5 / 2 377 ms | — | 0.041 / 0.022 / 0.033 / 0.042 |
| a failing monitor `python` command (pure round trip) | 1 | 6.3 ms | — | — |

Validity checks in the same run: virtual time moved 1000.0 → 5200.0 → 9400.0 ms, exactly the
sum of the requested quanta; the CPU executed instructions throughout (PC `0x801e802` after
boot; 47.8 M → 87.7 M → 127.6 M executed instructions, i.e. ≈9.5 M instructions per virtual
second — the guest is mostly idle, so the wall time is **not** spent executing guest code).
Hypothesis for the owners, not verified: the cost is in the peripheral models' virtual-time
work (six LPF2 ports each with a 1 kHz managed thread, `LegoLpf2ElectricalPort.cs:40`, plus
timers/DMA); a profile belongs in R13-M. The probe's attempt to read `BridgeDrive` through
`ExternalsManager.GetByName` failed (no such method in 1.16.1), so per-port reads are not in
the table; the state service resolves ports its own way (`_resolve`, Runtime
`spike-state-server.py`). An earlier run with the 2026-10-13 package (whose `models.cs`
targets a newer, custom-built Renode) showed RunFor at ≈1× real time, but its ports did not
exist (`portA` unknown), so that machine was not the real one and the numbers are discarded.

Reading: the rate is bounded by how fast Renode emulates this machine (≈0.04× real time
here), not by the 5 ms quantum; round trips (≈6 ms each through the monitor) matter only
once the machine is fast. The desktop path has more hops
(webview → broker → `BrickStateFeed` with its 5 ms sleep-poll → state service) whose cost is
not measured here (no desktop build on this host). Therefore the lockstep op must be a single
request per step that the state service executes in-process (apply inputs → `RunFor` →
observe), and the Tauri wait must not sleep-poll. **A Renode on the Mac was not available**
(`which renode` → not found); the Mac has Mono but no Renode.

### 1.8 Images and licensing

| Artefact | Source | Licence / constraint |
|---|---|---|
| Renode | portable build pinned per package (`BW_RENODE_SHA256` in the package `pins.json`) | MIT (Antmicro); .NET runtime MIT |
| Port/sensor models | Infra (`src/Emulator/Peripherals/Peripherals/UART/*Lpf2*.cs`, `PrimeElectricalPorts.cs`), shipped as `models.cs` in the package | BSD-3 (ours) on MIT Renode |
| State service + helpers | Runtime `scripts/spike-state-server.py`, `tools/*.py` | per file; arena adapters BSD-3 (`docs/SPIKE-ARENA-INPUTS.md`) |
| NuttX firmware | source-built from Firmware (`scripts/prepare-spike-nuttx-package.mjs`, `SPIKE-NUTTX.md`) | NuttX Apache-2.0 + notices listed in the package manifest; **G05 distribution/licence closure still open** (`docs/SPIKE-STATUS-AND-LANES.md` G05) |
| Small guest | Firmware `simulation/arena-demo` | BSD-3 |
| Upstream MicroPython `LEGO_HUB_NO6` | **user-chosen file**; "No external firmware image is bundled or downloaded by the image chooser" | MIT upstream, but the binary is the user's; we never ship it |
| Stock LEGO firmware | operator-supplied, bounded experiments only | proprietary; never bundled, never a Robot Lab route |

So the only L3 route the Robot Lab can *ship* is the own NuttX package; the MicroPython route
works with a user-supplied image, exactly as in the arena.

---

## 2. Design: L3 in the Robot Lab

### 2.1 What crosses, per 5 ms physics step

```
physics step k covers [t_k, t_k+5 ms]; readings R_k are the state at t_k

  Lab ──► lockstep.step { quantumUs: 5000, expectClockNs: t_k,
            shafts:  [{port, positionMdeg, speedMdps}]        // from R_k encoders (physics)
            sensors: [{port, kind, values}]                   // from R_k probes, SPIKE units
            hub?:    {buttons, imuRaw} }                      // MicroPython route only
  Renode: (paused) apply shafts + sensors (+ hub) → RunFor 5 ms → observe
  Lab ◄── snapshot { clockNs: t_k + 5e6, motors: [{port, position, speedDps,
                     drive: {mean, last, brakingTicks, ticks}}], lifecycle, display, … }
  Lab:   drives D_k = [{port, mode:'pwm', duty: mean/10000, decay}] → physics.step(5 ms)
```

- **Out of the emulator, per motor port:** the *mean* bridge drive over the quantum
  (−1…1 duty), and the decay: `'brake'` while the board's waveform holds the inactive leg high
  (that is what the accepted PWM contract is, `LegoLpf2ElectricalPort.cs:82–85, 103–108`) or
  when `BridgeBraking` is set; `'coast'` when neither leg drives. (Owner check for Infra:
  §6.2 question 2.)
- **Into the emulator, per motor port:** the physics hinge's unwrapped angle and speed
  (R1 `PortReading` `{angleRad, deltaRad, radPerSec}` → the hub keeps its own base and
  sends `positionMdeg`, integers so the wire is exact). The model extrapolates linearly
  inside the quantum (§1.5 item 1).
- **Into the emulator, per sensor port:** the same SPIKE-unit values the arena sends today
  (`renode-arena-bridge.js:106–113` mapping; R1 probes already deliver SPIKE units). They
  land in the LPF2 sensor models and reach the firmware at the sensors' own 100 ms report
  period — that sampling is the model's, not latency we add.
- **Into the emulator, IMU:** MicroPython route only, `imuRaw` through `prime-hub-io/v1`,
  once the Runtime owner publishes the raw scale (§5 Q3). NuttX: none until Firmware/Runtime
  add an IMU input — gyro-based programs are refused on the NuttX L3 route with a diagnostic.
- **Nothing else crosses.** No monitor text, paths, addresses or images from the Lab; the op
  is a closed DTO like `arena.inputs`.

### 2.2 Who owns time

Physics (architecture §3.3). Renode advances **only** by the lockstep quantum; free-run is
forbidden while a lockstep session exists (`renode.spike.run` refused; the state service
refuses `lockstep.step` when it did not pause the machine itself). Every reply's `clockNs`
must equal `expectClockNs + quantum` exactly, else the session fails closed. The R1 convention
holds unchanged: `advanceTo(t)` names the **end** of the step about to be simulated, the route
"runs over the step and decides the held drive" (R1 as built, §7 of the architecture doc);
here that is literally `RunFor` over the step with the shaft anchored at its start.

Rate: one exchange per step is the faithful setting. A `quantumSteps: 2` (10 ms) mode is
allowed as a measured fallback: the motor's own POS report period is 10 ms and the firmware's
control loop assumes 10 ms (`motor.c:17`, `dt … : 10`), so the guest cannot observe a
5 ms-resolved shaft anyway; physics then holds the mean duty over two steps and feedback
(e.g. a wall contact) reaches the guest up to 5 ms later. Default 5 ms; the pane offers 10 ms
only if R13a's measurements show it is needed for a usable real-time factor. Note that at the
measured ≈0.04× the quantum size barely matters (§1.7: 1 ms, 5 ms and 100 ms quanta all give
0.035–0.041); the emulated machine's speed dominates.

### 2.3 Batch/rewind vs. a non-rewindable emulator (D3)

Why rewind exists: the worker runs physics in batches of ≤ 20 steps (`MAX_BATCH_STEPS`,
R1 `sim-session.js:109`) against a mirror of the main-thread hubs; if the Scratch VM changes a
main-resident hub while a batch is in flight, the batch is **redone** from a Jolt checkpoint
(architecture §3.4). Renode cannot be rolled back by Jolt's `SaveState`.

| Option | How | Cost | Verdict |
|---|---|---|---|
| (a) Renode snapshots per batch | `Save`/`Load` of the emulation around each batch | Unmeasured. The machine includes a 32 MiB SPI-flash backing memory (`primeStorageMemory size: 0x2000000`, package `spike-prime.repl`), so each save moves ≥ 32 MiB; the in-emulator state service holds a TCP listener and threads that are not obviously serialisable. Untested, likely 10²–10³ ms per save. | No. |
| (b) "An L3 hub is alone in its scene" (architecture's assumption) | refuse any main-resident hub beside an L3 hub; batches of 1, never redone | Forbids e.g. a Scratch-driven second hub; still needs (c)'s loop | Subsumed by (c). |
| **(c) Conservative lockstep, in-thread** | a scene containing an L3 hub runs physics **on the main thread** (the existing non-worker path, "both give the same numbers", R1 `sim-session.js:17–21`), exactly one step per exchange, no speculation | Physics on the main thread: ≈ 0.25 ms per step for S1 (42 bodies ≈ 50 ms per simulated second, architecture §8 risks) — negligible beside the ≥ 4 ms exchange. L1 hubs' VM commands land between steps synchronously, as today without the worker. | **Recommended.** Nothing is ever computed that might have to be undone, so D3 needs no snapshots and L1 + L3 hubs may share a scene (once R2/R16 allow several hubs). |

Consequences: `SpikeFirmwareVirtualHub.exportState()` returns
`{nonRewindable: true, timeMs}`; `SimSession` refuses to hand such a hub to the worker
(diagnostic `l3-hub-needs-lockstep`) and selects the in-thread lockstep runner. "Reset scene"
restarts the Renode session (cold boot ≈ the supervisor's boot path); a single Renode
snapshot taken after boot and program upload, to make reset cheap, is a possible later
optimisation, not part of R13.

### 2.4 `SpikeFirmwareVirtualHub` against the R1 `VirtualHub`

R1's interface is synchronous ("a route with async work runs it between batches",
R1 `hubs/hub-profile.js`). With batches of one step the async exchange sits *between* steps:

```js
// bw-sim/routes/renode-lockstep/driver.js  — the only module that talks to Tauri
class RenodeLockstepDriver {
  constructor ({capabilities, backend: 'nuttx'|'micropython', topology}) {}
  async begin ()                     // session.start (existing) → boot → upload (free-run, §2.6)
                                     //  → lockstep.begin: pause; t0 := snapshot.clockNs
  async step ({shafts, sensors, hub}) // ONE renode.spike.lockstep.step; validates clockNs
  async end ()                       // lockstep.end → session.close (existing)
  frame                              // last accepted snapshot
}

// bw-sim/hubs/spike/spike-firmware-hub.js — implements VirtualHub (R1)
class SpikeFirmwareVirtualHub {
  profile = SPIKE_PRIME_PROFILE      // same hardware; route ids gain 'spike-renode-nuttx',
                                     //   'spike-renode-micropython'
  constructor ({id, driver, hubState})   // hubState: the shared VirtualSpikeHubState, for the UI
  plug (bindings)       // compares bindings with the frame's ports[] (attached + kind);
                        //   refuses a motor on C/D/E in the default topology, a sensor kind the
                        //   topology lacks, an IMU-dependent route on NuttX;
                        //   hubState.clockOwner = 'renode-lockstep'
  acceptFrame (frame)   // called by the runner after driver.step(); caches drives D_k
  advanceTo (tMs)       // asserts frame.clockNs === tMs·1e6 + t0; no work (already run)
  readDrives ()         // [{port, mode:'pwm', duty: mean/10000, decay}] for bound motor ports
  writeReadings (r, pose) // encoders → shafts (own base + Σ deltaRad), probes → sensors,
                          //   pose → imuRaw (MicroPython only): the NEXT step's inputs
  publish ()            // writeObservedMotor() per port with the PHYSICS position, display
                        //   pixels / program output from the frame; one hubState.changed()
  exportState ()        // {nonRewindable: true, timeMs}
  importState ()        // throws: never called in-thread
  stateKey ()           // timeMs (no redo exists)
  dispose ()            // driver.end(); clockOwner restored
}
```

The runner (`bw-sim/routes/renode-lockstep/runner.js`) replaces the worker batch loop for
such a scene:

```
on animation frame (wall dt, clamped as today by MAX_FRAME_MS = 50):
  budget := steps due at real time
  while budget > 0 and wallSpentThisFrame < 12 ms:   // at ≈120 ms per exchange (§1.7): one step per frame
      frame := await driver.step(hub.pendingInputs())   // Renode runs [t_k, t_k+5]
      hub.acceptFrame(frame)
      session.bridge.tick(5)        // R1: advanceTo → readDrives → physics → writeReadings
  if budget left: drop wall time (not simulated time); show real-time factor < 0.9
```

Drives come from **D5's DC-motor actuator** (R3). Until R3 lands, R1's `pwm` stand-in
(`physics/actuators.js`: velocity target `u·ω0` under the stall torque) is enough to build and
test R13c; the firmware's PI loop then closes around it.

### 2.5 Sensors from physics

| SPIKE device (port in default topology) | Lab probe (R1: `sensors.js`, SPIKE units) | Into the model |
|---|---|---|
| Colour 61 (C) | ray to the mat → colour id 0–10 / none, reflection % | `Lpf2ArenaColorSensor.SetReading(colorId \| 255, reflection, ambient 0)` |
| Distance 62 (D) | ray, mm, −1 outside 50–2000 mm | `Lpf2UltrasonicSensor.SetDistance(mm \| 65535)` |
| Force 63 (E) | today: ray stand-in (`sensors.js`); later contact probe (architecture M14) | `Lpf2ArenaForceSensor.SetReading(percent, pressed)` |

Same mapping as `renode-arena-bridge.js:106–113`, so the arena and the Lab feed the models
identically. Topologies other than default/six-motors/dual-ultrasonic are not offered; a
Lab model whose devices do not match the selected topology gets `port-topology-mismatch`
before the session starts. (The state service has `lpf2.attach/detach`, Runtime
`spike-state-server.py:461–482`, but Tauri does not admit them; attaching per model is a later
slice, done before boot like `insert_topology_commands`.)

### 2.6 Program upload and other guest-time-dependent exchanges

In lockstep the guest only runs inside `lockstep.step`. Two existing exchanges assume a
free-running guest:

- NuttX `program.packet` waits up to 1.5 s *wall* for the firmware's mailbox reply
  (`spike-state-server.py:425–432`). Plan: BEGIN/CHUNK/COMMIT are sent **before**
  `lockstep.begin` while the machine still free-runs (robot not yet in the world's clock);
  START is sent as a **deferred submission** inside lockstep (a Runtime change modelled on
  the existing deferred storage submit, `nuttx-program-storage-deferred/v1`); its reply is
  observed in later step snapshots. Physics steps with zero duty until the program starts —
  the robot stands still, as on a real hub between "run" and the first motor command.
- MicroPython raw REPL: `micropython.uart.read/write` are dispatched without pausing
  (`spike-state-server.py:552–553`); bytes written are consumed by the guest during later
  steps. The REPL client keeps working as long as the runner keeps stepping; source
  transfer then costs simulated time with the robot at rest, which is acceptable and visible.

### 2.7 Failure modes

| Failure | Behaviour |
|---|---|
| Emulator slower than real time | The runner awaits every exchange; simulated time slows, the pane shows the real-time factor; never a skipped exchange, never a physics step without a fresh drive. |
| Reply `clockNs ≠ expected` or `seq` not increasing | Desynchronised: stop the session, error to the user, no retry with the same Renode. |
| Exchange timeout (`BrickStateFeed` 2 s, `T/renode_brick_state.rs:582`) or a rejected command | The feed is already torn down by Tauri (`:604–611`); the runner stops; physics freezes at the last completed step. |
| 120 s wall limit (`MAX_SESSION_TIME`) | At the measured RTF 0.04 that is ≈ 5 s simulated (and the 1 s boot already costs ≈ 23 s). R13a must give lockstep sessions their own bound (Lite native change, §6.4); until then the pane shows the remaining wall budget. |
| Guest fault / program FAULT (`lifecycle.nuttxProgram.state === 5`) | Program stops; physics may keep running with zero drives (the firmware brakes or floats per its own end action); the error shows like the arena's. |
| Another owner of the hub/emulator | The supervisor holds one Renode session per app; the arena pane and the Robot Lab cannot both own it — the second start is refused with a diagnostic (existing `configurationOwner` pattern, `renode-arena-session.js:62–66`). |

---

## 3. The browser question

- **Can a SPIKE emulator route run in the browser? No.** Renode is a .NET application whose
  CPU cores are a native dynamic-translation library (tlib) plus an IronPython monitor; the
  only builds in use here are the linux-portable .NET ones (§1.7). No WASM build exists in any
  repository or pin we have, and porting a DBT engine to WASM is not a slice. The in-repo
  WASM-capable MCU engine, LabWired (`G/labwired-engine.js`), "has no qualified SPIKE
  peripheral/firmware integration and is not a substitute for these Renode gates"
  (`docs/SPIKE-STATUS-AND-LANES.md`, "Reproducible starting checks"); bringing STM32F413 +
  LPF2 port models + the NuttX image to it would be a multi-lane programme, not a plan step.
  Pybricks' `virtualhub` (in local checkouts) is excluded: the owner retired the Pybricks
  runtime on 2026-10-01 (`docs/OPEN-TASKS-2026-09-29.md`).
- **So L3 is desktop-only**, behind a capability flag, disabled in the web pane with the
  arena's wording ("no managed Renode runtime", `docs/SPIKE-ARENA.md:540`).
- **What the web build gets:** L1 as today — Scratch `spikeprime`, `DEVICE SPIKE`
  pseudocode, SPIKE 3 Python *converted* to blocks (`G/spike3-python-run.js`), all through
  `SpikeVirtualHub` (servo now, pwm after D5).
- **Proposed (owner decision, separate lane): an L2 "SPIKE Python" VM in the browser.**
  Upstream MicroPython's `ports/webassembly` (MIT) runs real Python in the page; a JS module
  set implementing the SPIKE 3 API surface the converter already knows (`motor`,
  `motor_pair`, `color_sensor`, `distance_sensor`, `force_sensor`, `hub`, `runloop`) over the
  `VirtualHub` would run programs the block converter cannot (functions, data structures,
  arbitrary loops). The repo has precedent for a MicroPython interpreter in the browser
  (`docs/PICO-MICROPYTHON-BOOT.md`: MicroPython in rp2040js), but none for the webassembly
  port; the API shim must be written from the public SPIKE 3 documentation, clean-room
  (D4's stance). It is worker-residentable and deterministic (stepped from the physics loop,
  §3.3 L2 row), so it also works on the desktop without Renode. Recommendation: do it after
  R13 only if the owner wants Python beyond the converter in the web build; it is not needed
  for L3.

---

## 4. Slices

Each slice is independently testable; out-of-repo slices land in their repository first and
are consumed by exact pins, as the Runtime rules require ("Land model changes in the model
fork first, then consume exact reviewed revisions", Runtime `docs/SPIKE-STATUS-AND-LANES.md`).

**R13-M (measurement, Lite, first).** Before any contract freezes, measure the desktop
round trip: a throw-away Tauri test that sends 1000 `state.read` and 1000
`arena.inputs.write` through the real broker path against a running NuttX package, plus the
§A probe on the Mac (needs a Renode there), plus a profile of where Renode's wall time goes
for the NuttX machine (with the Runtime/Infra owners: the VPS run is ≈0.04× real time with an
idle CPU, §1.7). *Accept:* a table of median/p90 per hop and the real-time factor on the Mac
recorded in this file; decision on default quantum (5 vs 10 ms); a named owner and slice for
emulation-speed work if the Mac factor is below 0.25.

**R13a (Lite native + JS, behind capability `lockstep/v1`).** New broker ops
`renode.spike.lockstep.begin`, `renode.spike.lockstep.step`, `renode.spike.lockstep.end`
(`T/native_policy.rs`, `T/native_capability.rs`, `native-renode-capability.js` OPERATIONS),
closed validator `valid_lockstep_step` in `T/arena_inputs.rs` (`quantumUs ∈ {5000, 10000}`,
`expectClockNs` u64, `shafts` ≤ 6 unique ports A–F with integer `positionMdeg`
∈ ±2³¹, `speedMdps` ∈ ±2·10⁶, sensors as `arena.inputs`, optional `hub` as today), forwarded
as one state-service command `lockstep.step`; admitted only if the target advertises
`lockstep/v1`. `BrickStateFeed` waits on a condition variable instead of the 5 ms sleep
(`T/renode_brick_state.rs:580–603`) for this command. `renode.spike.run` is refused while
lockstep is active. Lockstep sessions get their own wall bound (configurable at build time,
default 600 s). JS `RenodeLockstepDriver` with clock/seq checks.
*Accept:* Rust tests against a fake state service (the pattern of
`renode_brick_state.rs` tests at `:978`, `:1004`): 1000 steps return `clockNs = t0 + k·5e6`
exactly; malformed DTOs (port G, duplicate port, float position, quantum 7000, extra key)
are rejected **before** any byte is written; `lockstep.step` without `lockstep/v1` →
refused; `run` during lockstep → refused; fake round trip median < 1 ms. JS: driver rejects a
reply whose `clockNs` is off by 1 ns, a stale `seq`, a changed `imageSha256`.

**R13b (Runtime — other owner).** In `spike-state-server.py`: `lockstep.begin` (pause the
machine, record t0, refuse free-running dispatch thereafter), `lockstep.step` (under one
paused state: apply shafts via the new Infra setter, sensors/hub via `apply_arena_inputs`,
run the quantum with Renode's `RunFor`, observe), `lockstep.end`; snapshot motors gain
`drive: {mean, last, brakingTicks, ticks}` and `positionSource: "external"|"internal"`
behind capabilities `lockstep/v1`, `motor-bridge-drive/v1`, `external-shaft/v1`; deferred
START/STOP submission (`nuttx-program-deferred-start/v1`); `spike_state_monitor_protocol.py`
validation; `contracts/brick-state/v1` additions (additive fields). *Accept:*
`tests/platforms/SPIKE_State_Server.robot` + `tests/tools/*` cases: 400 steps of 5 ms on the
NuttX package end at exactly +2.000 s; with shafts held at 0 and a program commanding
300 °/s, `drive.mean` saturates positive (the PI loop's integral winds up: proof the
firmware sees the injected encoder, not its own model); with shafts fed from a scripted
"ideal motor" (position += 300 °/s) the mean settles within ±10 % of `300·10000/1110`
(feed-forward of `motor.c:37`); existing arena/NuttX/MicroPython regressions unchanged.

**R13c (Infra — other owner).** External shaft + duty integrator in
`Lpf2ElectricalMotor`/`LegoLpf2ElectricalPort` (§1.5). *Accept:* new cases in
`LegoLpf2PortTests.cs`: after `EnableExternalShaft(); SetShaft(1000.0, 360.0)`, ten 1 ms
ticks give POS reports `round(1000 + 360·t)` at the 10 ms report and `Advance` does not move
the shaft without a new anchor beyond extrapolation; `SetLoad` throws in external mode;
`TakeDriveAverage` over a scripted CCR sequence (0, 5000, 10000, 5000 for 1 ms each) returns
mean 5000 ± 1 and resets; internal mode: every existing test unchanged, plus a byte-identical
POS trace for a 1 s scripted drive before/after the change.

**R13d (Lite — Robot Lab).** `SpikeFirmwareVirtualHub`, `RenodeLockstepDriver` (from
R13a), the in-thread lockstep runner, route ids, `plug` diagnostics, pane wiring (route picker
offers "SPIKE firmware (desktop)" when the capability exists). Needs R1 (merged) and
R3's `pwm` DC actuator (R1's stand-in suffices for the tests). *Accept (node, fake driver):*
a fake driver that runs the published PI law of `bw_motor_step` (`motor.c:15–38`; the
package lists `apps/hubprogram` as BSD-3, `licenses/hubprogram-BSD-3-Clause.txt`, so a
re-implementation with attribution is fine) at 10 ms on the shafts it receives: (1) the S1 base commanded to 300 °/s reaches 300 ± 10 °/s wheel speed in
physics; (2) the shaft positions sent at step k equal the physics hinge angles of R_k to
1e-9 rad (the hub never integrates); (3) the drive used in physics step k is the one from
exchange k (sequence check); (4) `SimSession` refuses the worker for this hub and runs
in-thread; (5) `exportState().nonRewindable === true`; (6) a reply with a wrong `clockNs`
stops the session and leaves physics at the last completed step; (7) the import-graph test
still proves `physics/` imports no route module.

**R13e (end-to-end, desktop, gated like the existing Renode checks).** With a NuttX package
pinned (R13b/c consumed): the firmware-program ABI program
`[[1,0,300,0],[1,1,-300,0],[2,2000,0,0],[1,0,0,0],[1,1,0,0],[0,0,0,0]]` (A forward, B mirrored,
2 s; signs per the S1 base's motor orientation) drives the S1 driving base on the empty mat in
the desktop Robot Lab. *Accept:* (1) every step's guest `motors[].position` equals the
physics hinge angle (degrees, same sign convention) within **1°**; (2) distance travelled is
within **5 %** of the same program through the Scratch route (`DEVICE SPIKE` / spikeprime
blocks, `move … at 300 °/s for 2 s`) under the same D5 DC model — the controllers differ
(firmware PI vs `IndependentSpikeBackend`), so 5 % and a heading difference ≤ 3° are the
bounds, re-derived once D5's numbers exist and never loosened silently (at the VPS rate this
2 s run needs ≈50 s wall plus ≈23 s boot, so it depends on R13a's lockstep wall bound); (3) simulated time at
the end equals 2.000 s + upload/START latency recorded in the frame; (4) a wall pushed in front
of the robot stalls the wheels in physics and the firmware's duty saturates (the stall is now
physical, not a 100 % load flag). Then the architecture's original R13 acceptance: the
line-follower lap with the colour sensor on C through the firmware-program ABI gives the same
checkpoint sequence as the Scratch route.

**R13f (optional, MicroPython route).** Same as R13e with a user-supplied
`LEGO_HUB_NO6` image and `bwspike`; IMU fed once §5 Q3 is answered. Acceptance as R13e (1)–(2)
plus a 90° gyro turn within 3° of the physics heading.

Order: R13-M → {R13a, R13c} → R13b → R13d (can start on the fake driver right after R13a) →
R13e → R13f. R3/D5 must land before R13e's comparison is meaningful.

---

## 5. Risks and questions for the owner

| Risk | Tripwire |
|---|---|
| Desktop round trip makes RTF ≪ 1 (busy hosts) | R13-M table; 10 ms quantum fallback; RTF shown in the pane |
| The firmware's PI gains assume its own synthetic motor (`motor.c:24–26`: "tuning belongs to this firmware, … distinct from the arena's mechanical model"); against a DC model with real inertia it may oscillate | R13e (1)–(2) on the driving base and a 0.05 N·m loaded arm; if it oscillates the fix belongs to Firmware, not to physics |
| G05 licence closure for the NuttX package is open | the Lab does not ship a new package; it uses whatever package the desktop build pins |
| Emulation speed: full NuttX machine at ≈0.04× real time on the VPS (§1.7) | R13-M measures the Mac and profiles; if < 0.25× there, the route is a "slow but exact" mode and Infra/Runtime performance work is a prerequisite slice |
| Long boot (≈23 s wall for 1 s virtual on the VPS, plus model compile) | reuse the arena's session start; boot once per scene, not per run |

Questions:

- **Q1 (D3)**: accept option (c) — L3 scenes run physics in-thread, no snapshots?
- **Q2**: may the Lab pane offer the 10 ms quantum if R13-M shows 5 ms is too slow?
- **Q3 (Runtime/Firmware)**: the raw↔physical scale of `imuRaw` the MicroPython `bwhub`
  route assumes; and whether NuttX should get an IMU input (firmware lane).
- **Q4**: the browser L2 MicroPython-WASM SPIKE API route (§3): wanted, and when?

**Owner answers (2026-10-17):** Q1/D3 — yes: scenes with an emulated hub run physics on the
main thread, one step per exchange, no snapshots. Slow emulator — ship the L3 route as an
"exact, slow-motion" mode with the real-time factor shown; speed-up work follows with the
Infra/Runtime owners. Q4 — yes, the browser MicroPython-WASM SPIKE 3 API route comes next
after R13. Coordination — post the LANES.md claim and deliver the per-owner messages (§6) as
GitHub issues on the owners' repositories.

---

## 6. Coordination

### 6.1 Proposed `LANES.md` claim (Robot Lab side)

```
## Robot Lab R13 — SPIKE firmware in Renode, lockstep (desktop) — 2026-10-17

PROPOSED — Robot Lab lane. Plan: docs/ROBOT-LAB-SPIKE-EMULATION.md. Owns new code only:
`overlay/scratch-gui/src/lib/bw-sim/hubs/spike/spike-firmware-hub.js`,
`overlay/scratch-gui/src/lib/bw-sim/routes/renode-lockstep/**`, `test/bw-sim-renode-lockstep*`,
and, coordinated with the SPIKE native owners below, ADDITIVE native operations
`renode.spike.lockstep.{begin,step,end}` (validator in `apps/tauri/src-tauri/src/arena_inputs.rs`,
policy/capability entries, the lockstep wait in `renode_brick_state.rs`, the OPERATIONS map in
`native-renode-capability.js`) behind the target capability `lockstep/v1`. Does not change the
arena session/bridge, existing ops, frame formats, firmware, Runtime/model pins or packages.
Consumes Runtime `lockstep/v1`, `motor-bridge-drive/v1`, `external-shaft/v1`,
`nuttx-program-deferred-start/v1` only at reviewed exact pins. Desktop-only; the web build
keeps the route disabled. First slice R13-M (measurement), then R13a.
```

### 6.2 Message to the Infra model owner (`renode-infrastructure-spike-prime`)

> The Robot Lab wants to drive the emulated SPIKE motors from its physics engine instead of
> from `Lpf2ElectricalMotor`'s own integrator. Proposed change, in `LegoLpf2ElectricalPort.cs`
> only, internal mode bit-identical: (1) `EnableExternalShaft()` + `SetShaft(positionDeg,
> speedDps)`; in external mode `Advance` extrapolates from the last anchor instead of
> integrating, `Stalled` is false and `SetLoad` throws; (2) a per-tick duty integrator with
> `TakeDriveAverage()` → `{meanDrive, lastDrive, brakingTicks, ticks}`. Tests as in
> docs/ROBOT-LAB-SPIKE-EMULATION.md §4 R13c (Lite repo). Questions: is "active-low PWM on one
> leg, other leg high" correctly read as slow decay (brake) in the off phase? Any objection to
> extrapolating inside a quantum rather than holding? Would you take this as a model PR, or
> should we open it for your review?

### 6.3 Message to the Runtime owner (`renode-spike-prime`)

> For Robot Lab lockstep we need one closed state-service command per 5 ms physics step:
> `lockstep.step {quantumUs, expectClockNs, shafts, sensors, hub?}` executed in-process under
> one paused state (apply → `RunFor` → snapshot), plus `lockstep.begin/end` that pause the
> machine and forbid free-run dispatch while active; motor snapshots gain `drive` and
> `positionSource`; capabilities `lockstep/v1`, `motor-bridge-drive/v1`, `external-shaft/v1`;
> and a deferred START/STOP program submission like the existing deferred storage submit,
> because `nuttx.program.packet` waits 1.5 s wall for a guest that only runs inside steps.
> Measured on the VPS with stock 1.16.1 + our 2026-10-02 NuttX package: `RunFor "0.005"`
> ≈ 120 ms wall (RTF ≈ 0.04, the same for 100 ms quanta, CPU mostly idle at ≈9.5 M
> instructions per virtual second), monitor round trip ≈ 6 ms. Lockstep is exact; speed is
> the emulated machine's. Could you profile where the wall time goes (our guess: the 1 kHz
> managed threads of the six electrical ports) — is that your lane or Infra's?
> Please confirm `RunFor` can be invoked from the state service thread (or say which call
> you prefer), and the raw IMU scale for `prime-hub-io/v1`. Acceptance proposal in
> docs/ROBOT-LAB-SPIKE-EMULATION.md §4 R13b.

### 6.4 Message to the Lite SPIKE native/session owners (G02 lanes)

> Robot Lab R13 adds new broker ops `renode.spike.lockstep.{begin,step,end}` (additive, closed
> validator, capability-gated) and a condition-variable wait for that one command in
> `BrickStateFeed`; it does not touch `RenodeArenaSession`, `RenodeArenaBridge`, existing ops
> or frame validation. Two shared points: (1) lockstep sessions need a wall bound above the
> 120 s `MAX_SESSION_TIME` (proposal: a separate build-time bound, default 600 s, applying only
> while lockstep is active); (2) one Renode session per app — the arena pane and the Robot Lab
> must refuse to start while the other owns it, via the existing `configurationOwner` pattern.
> Please say whether you want to own the native part (we write the JS side and tests) or
> review ours; claim text in docs/ROBOT-LAB-SPIKE-EMULATION.md §6.1.

### 6.5 Message to the Firmware owner (`brickwright-spike-prime-fw`)

> FYI, no change requested for NuttX: the Robot Lab will feed the motor POS reports from its
> physics through the Infra model and read the H-bridge duty your `bw_motor_step` writes. Two
> questions: is 10 ms the intended control period of `apps/hubprogram` (`motor.c:17`), and
> would you accept an IMU input path for NuttX later (gyro programs)? The small arena-demo
> guest is not targeted.

### 6.6 Message to the R1 / R3 owners (Robot Lab)

> R13 needs from R1: nothing new in the interface; it relies on `advanceTo` = end of step, on
> the in-thread `SimSession` path, and adds `exportState().nonRewindable` with a worker
> refusal. From R3/D5: the `pwm` DC-motor actuator; R13d tests run on R1's stand-in meanwhile.

---

## 7. R13e measured (Mac, 2026-10-18)

Host: Apple M1, 8 cores, load ≈ 2. Stock Renode **1.16.1** (`tools/renode-1.16.1/Renode.app`,
self-contained arm64). Branch `lane/simlab-r13e-20261018`.

### 7.1 How the runtime and package were obtained — no Renode build

- **No fork build is needed.** The desktop package loads the Infra models as C# source
  (`include @models.cs`, compiled by Renode at startup: ≈ 1.2 s here) and the Runtime's state
  service as IronPython. Both merged sides (Infra #38 at `181d9d45`, the Runtime's submodule
  pin; Runtime #59, main `7d4a79a2`) therefore load into the stock 1.16.1 unchanged, through
  the Runtime's own `tools/stage_prime_runtime.py` (source mode, `Brickwright*` type aliases).
  The Runtime's CI publishes receipts only, no package.
- **Firmware:** no NuttX build exists on the Mac and the firmware CI publishes no artefacts.
  The NuttX ELFs (user `1935e06d…`, kernel `dcb7ed87…`), flash seed and notices were copied
  read-only from the newest assembled desktop package on the VPS
  (`spike-g02-pending-stop-f7b3-package-20261016/assembled/resources/nuttx`).
- **`scripts/restage-spike-nuttx-package.mjs BASE RUNTIME INFRA RENODE OUT`** combines the two:
  firmware side byte for byte from BASE, models/platforms/state service/helpers from the merged
  sources, new manifest and `pins.json`/`alongside-pins.json`. Result (35 files):
  `renode-lockstep-work/nuttx-pkg-lockstep`; the running target advertises `lockstep/v1`,
  `motor-bridge-drive/v1`, `external-shaft/v1`, `nuttx-program-deferred-start/v1`.
- **Gap found and fixed:** the #59 state service imports `spike_lockstep` unconditionally, but
  the Lite staging scripts never copied `tools/spike_lockstep.py` and the supervisor refused it
  (unsupported file; the NuttX manifest cap was 34). Fixed in the staging scripts, the
  resource-profile freezer and `verify_*_manifest` (helper required when imported, caps +1).
  The MicroPython support profile's closed file list does not carry it yet (R13f).

### 7.2 Headless proof — `npm run verify:sim-lab-renode`

`scripts/verify-sim-lab-renode-lockstep.mjs` (opt-in; skips without `BW_RENODE` /
`BW_SIMLAB_NUTTX_PACKAGE`) launches Renode with the supervisor's NuttX monitor commands,
talks to the state service as `BrickStateFeed` does, uploads the program with NuttX program
packets while the guest runs, then runs the unchanged `RenodeLockstepDriver` +
`SpikeFirmwareVirtualHub` + in-thread `SimSession` (S1 driving base, empty mat) and STARTs
the program inside lockstep (`nuttx.program.control.submit`). Program: §4 R13e's — tank 27 %
(300 °/s) for 2 s, stop — compiled from the same Scratch source by `compileFirmwareProgram`:
`[[1,0,-300,0],[1,1,300,0],[2,2000,0,0],[1,0,0,0],[1,1,0,0],[0,0,0,0]]`.

| Measure | Value |
|---|---|
| Renode start → state service up (C# compile + 1.0 s virtual boot) | 10.4–12.0 s wall (boot `RunFor "1.0"` alone ≈ 7.3 s) |
| Program upload (8 packets, free-running guest) | ≈ 0.9 s wall |
| Lockstep: 486 steps of 5 ms (2.43 s simulated) | 18.4–18.6 s wall, **RTF 0.131**; per step median 37.4 ms, p90 41 ms, max 64 ms |
| Shafts sent vs physics hinge | ≤ 0.0005° (the wire's milli-degree) |
| **Emulator encoder (`motors[].position`) vs physics, every step** | **≤ 0.16°** ✓ (≤ 1°) |
| Firmware's own LPF2 POS reading vs physics (integer °, 10 ms reports) | ≤ 9.4° — report latency at 290 °/s, not error |
| Firmware clock vs virtual time | 0.998 ms/ms |
| Firmware program | RUNNING within the first step, COMPLETE at ≈ 2.05 s; peak duty 3148/10000; no oscillation |
| Wheels A/B | −563.5° / +563.5°; heading change 0.01° (Scratch 0.01°) ✓ |
| Distance per wheel degree, firmware vs Scratch route | 0.4884 vs 0.4890 mm/° (0.1 %) — one physics ✓ |
| **Distance, firmware vs Scratch route** | **275.2 vs 298.6 mm, ratio 0.922 — misses 5 %** ✗ |

**Why the distance misses — the firmware's controller, as §5 feared (not oscillation):**
(a) steady speed **290.3 °/s against 300 commanded**: `motor.c` feeds forward
`ref·10000/1110` and integrates `error·dt[ms]` but divides the integral by 1000, so the I-term
gains ≈ 10 duty units per (°/s·s) — effectively P-only (Kp = 3); the DC model needs ≈ 3.4 %
more duty than the 1110 °/s feed-forward assumes, and 3·10 °/s of error is the equilibrium.
That is ≈ 19° of the 47° wheel gap. (b) the 2000 °/s² reference ramp plus START/first-report
latency cost ≈ 28° at the start (the virtual hub's controller reaches speed faster). The fix
belongs to the Firmware (a real integral gain, or a feed-forward calibrated against the
model), not to the physics — the per-degree distance shows the physics agrees. The fake's
R13d pass (ratio 0.995) used a fake firmware with an ideal speed loop.

Second, exploratory program (A at speed, B a 360° position move, op 6): B ended 365° and
A 656° (the robot curved; op 6 blocks and moves one motor), so a two-wheel "run 360 degrees"
has no firmware form — `compileFirmwareProgram` refuses it, and it also cannot compile the
DSL's `move forward … seconds` (its DIRECTION field is the text `forward`, the compiler
expects −1/1).

### 7.3 Desktop app

- `npm run build:gui` and `cargo build` (pins: the package's `alongside-pins.json`,
  `CARGO_TARGET_DIR=/Volumes/backups/code/cargo-target/brickwright-lite`) build the app.
- The repo's live-app gates (`verify-native-*-e2e.mjs`) use tauri-driver/WebKitWebDriver,
  Linux only; macOS has no WebDriver for WKWebView, so the GUI cannot be driven here without a
  human.
- **Native proof instead:** `native_capability::packaged_lockstep_tests` (ignored; needs the
  pins) dispatches the route's broker operations as `native_broker_invoke` does after
  admission (`Operation::parse` → `valid_args` → `execute`) on a real Renode:
  `session.start {backend:nuttx}` (boot 20.2 s incl. GDB attach) → `run` → 8× `program.packet`
  → `lockstep.begin` → `program.control.submit` START → 244 × `lockstep.step` (RTF 0.127) →
  `lockstep.end` → `session.close`; program COMPLETE, encoder = injected shaft ≤ 0.0005°,
  wheels ±336.5° on a first-order wheel. Run it with
  `eval "$(jq -r 'to_entries[]|"export \(.key)=\(.value)"' PKG/alongside-pins.json)"; TMPDIR=<a non-symlinked dir> cargo test --lib packaged_nuttx_firmware -- --ignored --nocapture`
  (macOS's `/var` → `/private/var` symlink breaks the existing manifest fixtures otherwise).
- **Missing in the GUI route: program upload.** The pane's firmware route starts the session,
  enters lockstep and runs the clock, but never sends a program (`sim-lab-pane.jsx` `run()`:
  "the clock is all Run starts"), and `program.packet` is refused during lockstep. On the
  desktop the S1 base would therefore stand still on a blank flash. Needed: compile the VM's
  blocks with `compileFirmwareProgram` when the route opens, upload BEGIN/CHUNK/COMMIT after
  `run` and before `lockstep.begin` (as the headless script does), START via
  `program.control.submit` on Run. Until then a manual desktop run can only show the route
  opening and lockstep stepping.
  **Done in §7.4.**

### 7.4 The GUI route runs the user's program (branch `lane/simlab-fwroute-20261018`)

**The route as built** (`routes/renode-lockstep/route.js`, `program.js`; the pane in
`sim-lab-pane.jsx`):

| Pane | Broker operations |
|---|---|
| route opens (model loads, or route chosen) | compile the Code tab's blocks (`compileRouteProgram` → the SPIKE arena's `compileFirmwareProgram`) → `session.start` → `state.read` (lockstep/v1?) → `run` → `program.packet` BEGIN, CHUNK…, COMMIT (the arena's `NuttXProgramClient`, `start: false`, guest free-running) → `lockstep.begin` |
| Run | compile again; same instructions → `program.control.submit` START; changed → the route reopens with the new program (packets cannot cross during lockstep), then START |
| (clock) | `lockstep.step` per 5 ms; every snapshot's `lifecycle.nuttxProgram` / `nuttxProgramReply` updates the route's program state |
| Pause | STOP; the clock keeps running until the firmware has taken it (status "Stopping…"), so the robot brakes in the physics; then paused |
| Run again | START from the beginning; after a START (program completed) it goes out as STOP + START: the mailbox takes one request at a time and a reply carries only its operation |
| Reset / route change / close | STOP (if running or a START is in line) → `lockstep.end` → `session.close` |

**Unsupported blocks**: the compiler's refusals are `FirmwareProgramError`s with a `code`, the
block as the pseudocode line it reads as (`move forward 10 cm`), its id and opcode. The route
still opens without a program (the robot stands; nothing is uploaded) and the pane says which
block and why, in English or German (`sim-lab-firmware-text.js`, one sentence per code; the
unit test fails on a code without both). Run re-compiles and says it again — never a silent
stand-still. Refused controls (`the firmware refused START (−22)`) and a program FAULT are shown too.

**Compiler / ABI findings.**

- `move forward/backward N seconds`: refused only because the movement block's `DIRECTION`
  is the menu word (`forward`/`backward`) and the compiler read it as the motor blocks' ±1.
  Fixed in the compiler; the form is ops 1 + 1 + 2 + stop, byte-identical to
  `start tank` + `wait` + `stop movement`. No ABI change.
- **Two motors by an amount (`move forward 360 degrees`, `… cm`, `… rotations`, a block's
  `run motor AB … degrees`) has no form in ABI v1, and the compiler keeps refusing it.**
  Issue-ready (Firmware, `CrispStrobe/brickwright-spike-prime-fw`, `apps/hubprogram`):
  *ABI v1 has one position instruction, op 6 `{port, degrees, speed}`, and `program.c`
  (`bw_program_tick`, case 6, l. 152–156) makes it blocking: it sets `p->moving` and the
  interpreter returns until `io.done(port)`, so two op-6 rows move the wheels one after the
  other (measured in §7.2: B 365°, A 656°, the base curved). The device layer is already
  non-blocking (`device.c position()`, l. 112–123, only arms `bw_motor_position`), and no
  predicate can wait on a motor (ops 3/5 read sensor selectors only), so the form cannot be
  composed from v1 either; a time-based approximation (speed × seconds) would not stop at
  the angle the program asked for. Proposal (ABI v2, additive): op 7 = op 6 without waiting
  (same `a, b, c` bounds), op 8 `{mask}` = wait until every motor in the port bitmask is done
  (`io.done`, as `ending` already loops over `p->owned`). Validators to extend together:
  `program.c bw_program_validate`, `upload-protocol.js encodeInstructions`,
  `arena_inputs.rs valid_program`, `arena-inputs.js validArenaProgram`; then the compiler
  emits `[7, A, −deg, v], [7, B, +deg, v], [8, 0b11, 0, 0]` for a movement pair. (The fake
  emulator's op 7 in `test/bw-sim-renode-lockstep-fake.mjs` is exactly that op, fake-only.)*

**Real Renode, through the route's own code path** (`npm run verify:sim-lab-renode`, Mac,
stock Renode 1.16.1, restaged package of §7.1). The headless script now opens
`openLockstepRoute` with its state-service transport (`manageSession: false`: it launched
Renode itself — the only difference from the pane), with the program compiled by
`compileRouteProgram` from a VM block tree built by the converter (SB3Creator), and drives
START/STOP through the route's `LockstepProgram`:

Two programs, the same compiled instructions `[[1,0,−300,0],[1,1,300,0],[2,2000,0,0],[1,0,0,0],[1,1,0,0],[0,0,0,0]]`
(default: `start tank 27 27` / `wait 2 seconds` / `stop movement`; `BW_SIMLAB_FORM=move`:
`set movement speed 27` / `move forward 2 seconds`, newly compilable):

| Measure | tank + wait | move forward … seconds |
|---|---|---|
| Route sequence (both) | `state.read → program.packet ×12 → lockstep.begin → program.control.submit (START) → lockstep.step ×486 → STOP → step → START → step ×62 → STOP → step ×62 → lockstep.end` | same |
| Upload (12 packets: BEGIN, 10 CHUNK, COMMIT) + lockstep.begin | 0.80–0.89 s wall; program READY | same |
| Lockstep, 486 steps (2.43 s simulated) | 17.2 s wall, RTF 0.141; per step median 34.9 ms, p90 38 ms | 18.8 s, RTF 0.129 |
| **Emulator encoder vs physics, every step** | **≤ 0.160°** ✓ (≤ 1°) | ≤ 0.160° ✓ |
| START answered in a step snapshot; program | RUNNING in the first step, COMPLETE at ≈ 2.05 s | same |
| Run again + Pause (STOP+START, then STOP) | RUNNING after 3 steps, STOPPED 1 step after Pause; both bridges braking (mean drive 0, 5/5 braking ticks) | same |
| Wheels A/B; steady speed | −563.4° / +563.4°; 290.2 °/s against 300 commanded | −563.3° / +563.3°; 290.1 °/s |
| mm per wheel degree, firmware vs Scratch | 0.4884 vs 0.4890 ✓ (one physics) | same |
| Scratch route (same text, virtual hub) | wheels ±610.7°, 299.1 °/s | wheels ±540.3°, 299.1 °/s |
| **Distance firmware vs Scratch route** | **275.1 vs 298.6 mm, ratio 0.922 ✗** (check stays at 5 %) | 275.1 vs 264.2 mm, ratio 1.041 ✓ |

The tank program's 7.8 % shortfall is the firmware's speed loop of §7.2 (effectively P-only,
plus the 2000 °/s² ramp), unchanged by this lane and expected until the firmware fix lands;
the script keeps failing on it rather than widening its tolerance. **The `move` form's pass is
not a fixed firmware**: the firmware runs the identical instructions (275.1 mm both times);
the Scratch route's own `move forward 2 seconds` drives ≈ 0.24 s shorter than its
`start tank` + `wait 2` + `stop movement` (540° vs 611° at the same 299 °/s), so two
discrepancies of opposite sign meet. That Scratch-route difference (the virtual hub's
motor-pair `move … seconds` against `wait`) is outside this lane and not investigated here.

---

## A. Measurement script

The probe used for §1.7 (run with `nice`, in a private temp dir, against copies/read-only
package paths; it starts its own Renode on a private monitor port and quits it):

```python
#!/usr/bin/env python3
# Measure Renode lockstep cost over the monitor socket: RunFor quanta + port-model reads.
# Usage: lockstep_probe.py RENODE PKGDIR PORT [advance_immediately 0|1]
import socket, subprocess, sys, time, json, os, re, statistics

renode, pkg, port = sys.argv[1], sys.argv[2], int(sys.argv[3])
adv = len(sys.argv) > 4 and sys.argv[4] == "1"
cfg = json.load(open(os.path.join(pkg, "state-config.json")))
sp, pc = cfg["boot"]["stack"], cfg["boot"]["reset"]
args = [renode, "--disable-gui", "--hide-log", "-P", str(port),
        "-e", f"include @{pkg}/nuttx.resc",
        "-e", f"sysbus LoadELF @{pkg}/nuttx-user.elf",
        "-e", f"sysbus LoadELF @{pkg}/nuttx-kernel.elf",
        "-e", "cpu VectorTableOffset 0x08008000",
        "-e", f"cpu SP {sp}", "-e", f"cpu PC {pc}"]
if adv:
    args += ["-e", "emulation SetGlobalAdvanceImmediately true"]
t0 = time.time()
args = [a for a in args if a != "--hide-log"]
log = open("/tmp/simlab-r13-measure/renode.log", "w")
proc = subprocess.Popen(["nice", "-n", "10"] + args, stdout=log, stderr=subprocess.STDOUT)
try:
    for _ in range(2000):
        try:
            s = socket.create_connection(("127.0.0.1", port), timeout=120)
            break
        except OSError:
            time.sleep(0.2)
    else:
        raise SystemExit("monitor never came up")
    s.settimeout(300)
    buf = b""
    ansi = re.compile(rb"\x1b\[[0-9;]*[A-Za-z]|\xff[\xfb-\xfe].|\xff\xfa.*?\xff\xf0", re.S)
    def cmd(text):
        global buf
        s.sendall(text.encode() + b"\n")
        echo = text.encode()
        while True:
            clean = ansi.sub(b"", buf)
            i = clean.find(echo) if echo else 0
            if i >= 0:
                m = re.search(rb"\(machine-0\) ", clean[i + len(echo):])
                if m:
                    out = clean[i + len(echo): i + len(echo) + m.start()]
                    buf = b""
                    return out
            chunk = s.recv(65536)
            if not chunk:
                raise SystemExit("monitor closed")
            buf += chunk
    def vtime():
        return cmd('python "print(emulationManager.CurrentEmulation.MasterTimeSource.ElapsedVirtualTime.TotalMilliseconds)"').decode(errors="replace").strip()
    # The resc/ELF commands were passed with -e; wait for the prompt to settle.
    time.sleep(2.0)
    print("vtime_ms_before_boot", vtime(), flush=True)
    print("startup_wall_s", round(time.time() - t0, 2), flush=True)
    w = time.time(); cmd('emulation RunFor "1.0"'); print("boot_runfor_1s_wall_s", round(time.time() - w, 3), "vtime_ms", vtime(), flush=True)
    def pyq(expr):
        return cmd('python "print(' + expr + ')"').decode(errors="replace").strip()
    INS = "self.Machine['sysbus.cpu'].ExecutedInstructions"
    print("cpu_pc", cmd("cpu PC").decode(errors="replace").strip()[-30:], "instr", pyq(INS), flush=True)
    print("portA_drive_py", pyq("emulationManager.CurrentEmulation.ExternalsManager.GetByName('portA').BridgeDrive"), flush=True)
    def series(quantum, n, read_ports):
        walls = []
        for _ in range(n):
            a = time.perf_counter()
            cmd(f'emulation RunFor "{quantum}"')
            if read_ports:
                pyq("emulationManager.CurrentEmulation.ExternalsManager.GetByName('portA').BridgeDrive")
            walls.append(time.perf_counter() - a)
        return walls
    res = {}
    for mode in ("default", "advance_immediately"):
      if mode == "advance_immediately":
        cmd("emulation SetGlobalAdvanceImmediately true")
      v0 = vtime(); i0 = pyq(INS)
      for q, n, rp in [("0.005", 400, False), ("0.005", 200, True), ("0.001", 200, False), ("0.1", 10, False)]:
        walls = series(q, n, rp)
        key = f"{mode}_q{q}{'_with2reads' if rp else ''}"
        res[key] = {"n": n, "median_ms": round(statistics.median(walls) * 1000, 3),
                    "p90_ms": round(sorted(walls)[int(0.9 * n) - 1] * 1000, 3),
                    "virtual_per_wall": round(float(q) * n / sum(walls), 3)}
        print(key, res[key], flush=True)
      print(mode, "vtime_ms", v0, "->", vtime(), "instr", i0, "->", pyq(INS), flush=True)
    a = time.perf_counter(); out = pyq("emulationManager.CurrentEmulation.ExternalsManager.GetByName('portA').Device.PositionDegrees"); one_read = time.perf_counter() - a
    print("single_monitor_python_read_ms", round(one_read * 1000, 3), "portA_position", out[-40:], flush=True)
    print(json.dumps({"advance_immediately": adv, **res}))
    s.sendall(b"quit\n")
finally:
    try:
        proc.terminate(); proc.wait(timeout=20)
    except Exception:
        proc.kill()
```

Run as `HOME=<private dir> python3 lockstep_probe.py <renode> <package dir> <port> 0`.
