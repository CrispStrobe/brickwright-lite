# Separate lane: running the REAL CPX .uf2 on LabWired's SAMD21 model — scoping

Read-only, 2026-10-13. **[R]** = read in source, **[I]** = inference, not verified. Pins read: pxt-adafruit 1.6.8 (Lite
sync-makecode-runtime.mjs:97-100) → codal-circuit-playground **v2.0.4** → codal-samd **5bd6b93**, asf4 **6664673f**,
samd-peripherals **96563308**, codal-core **312ae57e** (circuit-playground target-locked.json:50-59; same codal-samd/asf4/
samd-peripherals pins as the PyBadge lane, labwired docs/boards/pybadge-native.md:136-140). labwired-core origin/main `c8b0fc55`
(I ran a normal `git fetch` on that checkout's remote-tracking refs; no source touched). "cp/" = codal-circuit-playground@v2.0.4,
"cs/" = codal-samd@5bd6b93, "pxt/" = the C++ in Lite's served adafruit target.json bundledpkgs.

## 1. What the CPX firmware touches
**Boot (always runs)** [R]
- cp/source/startup_samd21.c:208-251 `Reset_Handler`: copy .data and clear .bss; set `SCB->VTOR` to `_sfixed` (the app sets
  VTOR itself); write `SBMATRIX->SFR[HMCRAMC0]`, `USB->DEVICE.QOSCTRL` and `DMAC->QOSCTRL`; set NVMCTRL CTRLB MANW/RWS; `clock_init()`.
- samd-peripherals samd/samd21/clocks.c:98-141,173-200: OSC8M; XOSC32K or OSC32K (calibration read from FUSES); DFLL48M. It
  spins on `SYSCTRL->PCLKSR` OSC8MRDY/XOSC32KRDY/OSC32KRDY/DFLLRDY and DFLLLCKC/LCKF, sets up GCLK GENCTRL/GENDIV/CLKCTRL and
  spins on `GCLK->STATUS.SYNCBUSY`. It reads the DFLL coarse calibration from the FUSES/NVM software-calibration row (0x806020…).
- pxt/core---samd__codal.cpp:178-182 `initRuntime` → `initSystemTimer` (:264) → `allocateTimer` (pxt/core---samd__platform.cpp:76-115).
  With `DEF_TIMERS 0x15222021` (:67) the first candidate is **TC5**, driven by cs/src/SAMDTCTimer.cpp: COUNT16/32,
  `STATUS.SYNCBUSY` spins (:5-7, the D21 form), CTRLBSET READSYNC, INTENSET MC0/MC1, and the TC5 NVIC line.
  `allocateTimer` first reads `CTRLA.ENABLE` on each TC/TCC.
- `initCodal` (codal.cpp:80-98): scheduler, component `init()`, **`usb_init()`**. pxt.json's yotta config sets `DEVICE_USB:1,
  HF2_HID:1`, overriding the target's `DEVICE_USB:0` (cp/target.json). `usb_init` (pxt/core---samd__usb.cpp:85-118) calls
  `set_usb_strings(UF2_INFO_TXT)`. That dereferences **UF2_BInfo inside the bootloader region** (`0x2000 - sizeof`,
  uf2format.h:13-22) and `target_get_serial()` at **0x0080A00C** (cp/source/codal_target_hal.cpp). After `fiber_sleep(500)`,
  `usb.start()` runs cs/src/SAMDUSB.cpp, which spins on GCLK SYNCBUSY (:81) and `USB->HOST.SYNCBUSY.SWRST` (:95).
- `platform_init` (platform.cpp:150-159): PINCFG writes for the SWD-pin remap, then `light::clear()`, which bit-bangs the ring
  at boot. Then LED D13 (PA17) is driven low (codal.cpp:95-98).

**Per beginner feature** [R unless marked]
| Feature | Driver → peripheral |
|---|---|
| Ring PB23 | cp/inc/neopixel.h (same in cs/inc): IRQs off (`cpsid`), raw stores to `PORT->Group[1].OUTSET/OUTCLR`, timing by **cycle-counted delay loops** (delays 3/6/2) at 48 MHz. PORT only, but correct decoding needs per-store CPU-cycle timestamps |
| Buttons A/B, slide | pxt/buttons__buttons.cpp:31-51 `Button` with pull mode. codal-core Button is **polled on the system tick** (Button.cpp:57, :95 `periodicCallback`), so PORT IN/PINCFG plus a working TC5 tick are enough. EIC only for pin events/pulse (cs/src/ZPin.cpp EIC uses) |
| Touch A1–A7 | cs/src/CapTouchButton.cpp:66-73 + cs/src/adafruit_ptc.cpp: the **PTC** block (0x42004C00), GCLK channel, APBC mask. The PTC register map is not in the public datasheet [I: adafruit_ptc.cpp:74 comment `MEMORY[0x42004C00] \|= 4u` suggests it was derived from a binary] |
| Accelerometer | pxt/accelerometer__accelhw.cpp (LIS3DH, `PXT_SUPPORT_LIS3DH`) → cs ZI2C → **ASF4 hal_i2c_m_sync + hpl_sercom**, SERCOM1 (`PROTOTYPE_SERCOM_I2CM_SYNC`, cp/target.json) on PA00/PA01. INT on PA13 |
| Light, temperature | AnalogSensor / NonLinearAnalogSensor → ZPin analog → **ASF4 hal_adc_sync + hpl_adc** (ADC), plus ADC linearity/bias FUSES reads (ZPin.cpp, `ADC_FUSES_LINEARITY_*`) |
| Mic level | pxt/microphone__microphonehw.cpp → cs SAMDPDM: **I2S** in PDM mode (`I2S->SERCTRL/DATAREG`) + **DMAC** (`DmaFactory::allocate`, :88) |
| Speaker / tones | pxt mixer---samd SoundOutput.h:1-11 → cs SAMDDAC: **DAC** + **TC3** (MFRQ, `EVCTRL.OVFEO`) + **DMAC** triggered by `TC3_DMAC_ID_OVF` (SAMDDAC.cpp:126,167,248), plus the speaker-amp enable GPIO. DAC `EVCTRL.STARTEI` is written. Whether EVSYS routing is required [I: unverified] |
| IR | pxt/infrared__ir.cpp:12 TC4; platform.cpp:63 "TCC0 and TC4 is used by IR" |
| analogWrite/servo | TCC0/TCC1/TC4 (platform.cpp:64) |
| USB HF2 | cs/src/SAMDUSB.cpp `USB->DEVICE` endpoints |

## 2. LabWired today vs needed
- [R] atsamd21g18a (configs/chips/atsamd21g18a.yaml; docs/boards/atsamd21g18a.md:86-96) has:
  - ✅ Cortex-M0+, NVIC, SysTick.
  - ✅ PORT behavioural, including OUTSET/OUTCLR aliases.
  - ✅ SERCOM0–5 in **USART mode only**.
  - ⚠️ SYSCTRL/GCLK/PM/WDT/NVMCTRL as declarative banks. PCLKSR resets to 101087 = all ready/lock bits set
    (sysctrl.yaml:250-278), so the clock_init spins should pass [I].
  - ❌ SERCOM SPI/I²C, EIC (unmapped), USB, TCC0–2, TC3–5, ADC, DAC, AC, I²S, DMAC, EVSYS, RTC, DSU. PTC is not listed at all.
  - Unmapped access → `MemoryViolation` (docs/simulation_protocol.md:180). So the boot's SBMATRIX/USB/DMAC QOS writes, the
    FUSES row and the 0x0080A00C serial read will fault without stubs [I].
- [R] Reusable SAM code in the fork:
  - sam/sercom_usart.rs (D21+D51).
  - sam_clock.rs: SAMD21 PM AHB/APB masks and GCLK CLKCTRL vs SAMD51 MCLK/PCHCTRL (:1-13). The CPX chip yaml still uses the
    declarative pm/gclk, not `sam_pm`/`sam_gclk` (atsamd21.yaml uses those).
  - sam/sercom_spi.rs (PR208/214, **SAMD51 only**, "split" IRQs = D51's four lines per SERCOM, :1-10). D21 has one IRQ
    per SERCOM.
  - sam/dmac_byte.rs (PR210/212, "opt-in SAMD51 … not full DMAC", :1-4).
  - components/declarative_i2c.rs + i2c_factory.rs (I²C device framework). LIS3DH appears only as a declarative **SPI**
    example (declarative_spi.rs:10).
- [R/I] D21 vs D51 register differences the reuse must respect:
  - TC sync is `COUNTx.STATUS.SYNCBUSY` on D21 vs a `SYNCBUSY` register on D51 (cs SAMDTCTimer.cpp:5-11 [R]).
  - D21 DMAC programs channels through `CHID` + `CHCTRLA/B` (cs DmaFactory.cpp:292-301 [R]). D51 has per-channel blocks [I].
  - GCLK CLKCTRL vs PCHCTRL [R sam_clock.rs].
  - SERCOM IRQ fan-in differs [R sercom_spi.rs:6-8].
  - No upstream (w1ne) SAMD21 TC/ADC/DAC/I²C code was found in the fork tree [R: crates/core/src/peripherals/sam/ holds
    only mod, sercom_usart, sercom_spi, dmac_byte].

## 3. Boot path
- [R] bw-board src/uf2-to-elf.js: generic UF2 → ELF. For non-RP2040 the entry is word 1 of the first segment's table
  (:152-164), which for CPX is the app reset vector at 0x2004. labwired-adapter.js:171-177 uses it for firmware-only runs.
  A UF2 carries no symbols.
- [R] cp/ld/samd21g18a.ld:8: app `rom` ORIGIN 0x2000. Precedent: atsamd51-pybadge.yaml:34 `reset_vector_offset: 0x4000`.
  `Machine::load_firmware` relocates the reset vector by it (bus/mod.rs:315-321). **Add a CPX chip/board yaml with
  `reset_vector_offset: 0x2000`.** Initial MSP then comes from 0x2000 and PC from 0x2004 [I: by analogy with PyBadge]. The app
  then sets VTOR itself (startup:229).
- [I] The bootloader region must not be empty. `UF2_INFO_TXT` reads `UF2_BInfo->info_uf2` at 0x2000-sizeof. With zeros,
  `strstr(NULL, …)` faults. Options: synthesize a minimal BInfo (owned bytes) in 0x0–0x1FFF, or run a real UF2 bootloader
  (separate licence review). Also map FUSES/serial NVM rows (owned calibration values, documented) and stub USB/SBMATRIX/DMAC-QOS.
- [I] Proving "reached main" needs symbols. Use an **own-built** CPX ELF (as the PyBadge lane does), not the CDN UF2.

## 4. Ordered, sized peripheral plan (engine-side; each step has its own guest)
| Step | Work (size) | Done when (observable) |
|---|---|---|
| C0 | CPX chip/system yaml: offset 0x2000, BInfo + FUSES/serial rows, inert USB/SBMATRIX/DMAC-QOS stubs (S) | Own-built image runs Reset_Handler → `main` (PC at the ELF symbol), no MemoryViolation |
| C1 | SAMD21 TC3–5 (COUNT16/32, MC0/MC1, INTFLAG, STATUS.SYNCBUSY, READSYNC) + IRQ (M) | TC5 MC0 IRQs at the programmed rate. A `forever { LED toggle; pause 500 }` program toggles PA17 every 500 ms **guest time** |
| C2 | USB as a correct "detached" device: SWRST/SYNCBUSY clear, no enumeration (S) | `usb.start()` returns, C1 blink still holds 10 s guest time |
| C3 | Ring: cycle-stamped PB23 OUTSET/OUTCLR edges exported to bw-board's `neopixel` decoder (display.js:38-) or an engine WS2812 decoder (M) | `light.setAll(red)` → 10 pixels 0xFF0000 decoded; a wrong-timing mutant fails |
| C4 | Buttons/slide via PORT IN + pulls (S, mostly board wiring) | `input.buttonA.onEvent(Click)` handler runs after a scripted press; switchRight reads PA15 |
| C5 | SERCOM I²C master (D21) + LIS3DH I²C component (M–L) | `input.acceleration(X)` returns the injected g. onGesture(Shake) fires on an injected shake |
| C6 | ADC (single-ended, gain, calibration FUSES) + light/thermistor sources (M) | lightLevel/temperature follow injected pad voltages within the documented curve |
| C7 | DAC + TC3 + D21 DMAC (CHID form) + EVSYS if needed (L) | `music.playTone(262, …)` → DAC sample stream at 262 Hz |
| C8 | Later/optional: PTC touch (L, register-map evidence problem), I²S PDM mic (L), TCC PWM/IR (M), EIC (S) | Each with its own guest |

## 5. Licence question (for the owner, neutral)
- [R] Lite classifies the CDN CPX base `a3fa24bb…` as **chip-restricted, ASF4**, "14 ASF4 samd21 files"
  (base-licences.js:77-79; licence string :47).
- [R] ASF4 HAL/HPL sources at asf4@6664673f (e.g. samd21/hal/src/hal_atomic.c header) are BSD-like. **Clause 4** reads:
  "This software may only be redistributed and used in connection with an Atmel microcontroller product."
- [R] The device headers are **Apache-2.0** (samd21/include/samd21g18a.h, component/sercom.h). codal-samd, codal-circuit-playground
  and samd-peripherals are MIT. pxt-adafruit is MIT.
- [R] Eight ASF4 compile inputs are linked into codal-samd (cs CMakeLists.txt:38-64): hal_atomic, hal_spi_m_sync,
  hal_usart_async, hal_adc_sync, hal_i2c_m_sync, hal_io, hpl_sercom, hpl_adc. They sit **inside the app image**, unlike the
  Nordic SoftDevice, which occupies a separate flash region.
- [R] Workspace precedents:
  - Nordic SoftDevice bases: "emulation must not execute it"; app-region-only with the SoftDevice HLE'd (memory
    makecode-bases-vendor-licences).
  - Lite builds its own Bluetooth-free V2 bases for emulation (scripts/build-makecode-emu-bases.mjs).
  - labwired's SAMD51/PyBadge lane: "Reproducing their build is not emulator clearance" (pybadge-native.md:122-128). It plans a
    permissive replacement at the CODAL class boundary for exactly these eight files (docs/engineering/samd-runtime-replacement-plan.md;
    R0–R3 in samd-permissive-runtime-lanes.md). That plan explicitly rejects "deleting eight C files while keeping their headers".
- Options:
  - (a) The owner rules on whether executing the CDN image in an emulator is "use in connection with an Atmel microcontroller
    product". No ruling exists in the workspace.
  - (b) Build a CPX base from source on the **shared** permissive codal-samd backend from the SAMD51 lane (same pins), then
    admit that image only. This is the existing workspace policy direction [I].
  - (c) Authored permissive guests only, with no CODAL image, until (b).
- Additional unknowns: the PTC driver's provenance and register map; the UF2 bootloader's licence if a real one is run instead of a stub.

## Status (2026-10-13)
Separate lane, scoping only — no code. Not part of A9's device world or translator. The licence question
above is the owner's to decide before any step that would execute the CDN firmware base; steps C0–C1 can
proceed on own-built test firmware regardless.
