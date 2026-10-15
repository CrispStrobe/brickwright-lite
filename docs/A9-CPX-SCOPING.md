# A9 scoping — Circuit Playground Express device world, then translator

Read-only research, 2026-10-13. Heads read: Lite origin/main `28c1f26f`, sb3-creator origin/main `c47b9680`
(Lite vendors `504abe93`, vendor-pins.json:4), bw-board origin/master `4db35f1c` (Lite pins `7254f240`),
bw-circuit-ui `5f336b24` (= Lite's pin, package.json:149), labwired-core origin/main `709eb97f`.
**[R]** = read/measured here; **[I]** = inference, not verified.

## Q1 — what a CPX MakeCode project uses
- [R] Lite serves pxt-adafruit **1.6.8** on pxt-core 6.2.6 (scripts/sync-makecode-runtime.mjs:97-100, 199-210). The `circuit-playground`
  package depends on base, core---samd, buttons, accelerometer, lightsensor, thermometer, mixer---samd, color, light,
  switch, pulse, infrared, microphone, touch (target.json bundledpkgs `circuit-playground/pxt.json`). Also bundled:
  servo, cable, mouse, keyboard, gamepad, storage, datalogger, serial, settings.
- [R] Block functions per namespace (parsed from the served target.json): `light` 83 (strips, setAll, setPixelColor,
  graph, brightness, photon, animations), `input` buttons A/B/AB, touchA1–A7, pinA1–A7, onGesture/acceleration/rotation,
  lightLevel, temperature, soundLevel/onLoudSound, switchRight/onSwitchMoved; `music` 29 (playTone, ringTone, rest,
  tempo, setVolume, built-in sounds baDing/magicWand/siren/…), `pins` 20 (digital/analog/servo/pulse/i2c/spi),
  `network` IR + cable send/receive number, `control`, `servos`, `keyboard/mouse/gamepad` (USB HID), `storage`, `datalogger`.
- [R] Hardware map (target.json `circuit-playground/config.ts`): 10 NeoPixels on PB23; buttons PA28/PA14; slide PA15;
  LIS3DH on PA00/PA01 (I²C) + INT PA13; light PA11 (A8); thermistor PA09 (A9); mic PDM PA08/PA10; speaker amp PA30,
  A0 = PA02 (DAC); IR out PA23 / in PA12; red LED D13 = PA17; A1–A7 = PA05,PA06,PA07,PB03,PB02,PB09,PB08.
- [R] Usage in the 1.6.8 docs projects+tutorials (149 code blocks; count = blocks using the API):
  light.setAll 31, light.showRing 26, input.onGesture 25, input.buttonA 24, light.createStrip 22, setBrightness 21,
  showAnimation 20, rainbowAnimation 14, music.playTone 12, photonForward 11, graph 9, setVolume 9, onLoudSound 8,
  buttonB 7, lightLevel 6, soundLevel 6, clear 6, acceleration 5, switchRight 5, IR send 5, pinA1/A2 touch 2 each.
  So a beginner CPX program = ring colours/animations + buttons + shake/tilt + tones; sensors are second; pins/IR/HID rare.
- [R] GitHub shows a tag `v10.10.10` above v1.6.8 (repo pushed 2022-10-18); the live editor's version vs 1.6.8 was
  not checked — projects from makecode.adafruit.com today may use newer APIs [unknown].

## Q2 — the pattern to follow (micro:bit / EV3 importers)
- [R] Entry: `importArtefact` → `importProjectFiles(files,{target})` in lib/bw-makecode/index.js; per-target branches at
  :101 (microbit/calliopemini → `microbitToPseudocode`), :138 (ev3 → `ev3ToPseudocode`); anything else (incl. `adafruit`)
  falls to `note: 'other'` and opens as raw JS/Python (:152-162) — the A9 symptom.
- [R] Translator = `parseMakeCodeTs` (ts-import.js) + a `BaseTranslator` subclass (translate-base.js:190) holding the
  table; output starts with a `DEVICE X` line (microbit-translate.js:1235) and returns `{code, unsupported, scripts}`
  (:1103, :1298). Rules (microbit-translate.js:1-26): emit only spellings sb3-creator's generator round-trips; every
  unmapped call becomes a `# unsupported:` line AND a list entry; handlers become polling scripts.
- [R] Refusal by name: per-API reason tables — `NO_MICROPYTHON` :917, `CALLIOPE_ONLY` :930, `UNPOLLABLE_HANDLERS` :1093;
  EV3's `MOTOR_REFUSED`/`REFUSED` (ev3-translate.js header) is the closest small template (38 KB vs micro:bit 67 KB).
- [R] EV3 (task B4, OPEN-TASKS:59) is the precedent for "no runtime in Lite": proof was round trip back to MakeCode +
  pxt's compiler in scripts/makecode-census.mjs.
- [R/I] `inferTarget` (index.js:66) has no `adafruit` branch, and its micro:bit sniff `/\binput\.on|pins\.digital/`
  would match CPX code such as `input.onGesture` [I: a CPX share link without a target would be translated as micro:bit;
  untested]. Phase 2 must add an adafruit sniff (e.g. `light.`, `input.buttonA`, `CPlayPinName`) ahead of micro:bit.

## Q3 — what exists for CPX today
- [R] Dialect: no CPX device. sb3-creator `STC_PARTS` (sb3Creator.js:20785-20898) has microbit/calliopemini
  (`core: micropython`), ev3, arcade/pybadge/pybadge-lc/samd51 (`core: samd51`; pybadge declares `neopixels: 5,
  accelerometer: 'lis3dh'`, :20842); unknown DEVICE is refused (:4444). B3's test therefore passes CPX declarations
  directly (Lite test/makecode-board-seated-inference.test.mjs:16-18, 39-42).
- [R] Board part (B3, OPEN-TASKS:58): bw-board `circuit_playground_express` = 14 pads a0–a7, 3v3×2, gnd×3, vout, pads
  only — "Onboard NeoPixels, buttons, slide switch and sensors belong to the board, not to pads" (board-kinds.js:363-372,
  399). bw-circuit-ui: seated inference `makeCodeBoardFor` with aliases cpx/adafruit (infer-seated.js:41-45), face = the
  pxt-adafruit sim SVG as a static image (BoardCanvas.jsx:721-740, board-geometry.js:74) — no live NeoPixel/button state.
  B3 also notes circuit → declarations (`BOARD_TO_DEVICE`) omits CPX.
- [R] Run: Code tab compiles with pxt and runs in MakeCode's own sim (pxt-runtime.js:77 `adafruit` firmware uf2;
  importer MAKECODE_RUNNABLE/FIRMWARE pseudocode-importer.jsx:844-845); the sim pane bridges CPlayPinName a0–a7 to
  the board part's pads, digital + PWM (makecode-sim-pane.jsx:16-26; test/makecode-pin-bridge.test.mjs).
- [R] .uf2: built on the pinned CDN base `1a8dde8a…` (sync-makecode-runtime.mjs:132); classified **chip-restricted,
  ASF4** (base-licences.js:77-79, ASF4 licence :47) — never run in Lite, only downloaded.

## Q4 — device world: have vs missing
| CPX feature | Dialect/VM today | Circuit (bw-board/bw-circuit-ui) | Missing |
|---|---|---|---|
| 10-pixel ring | `devices` words `set neopixel I to R G B on STRIP` (sb3-creator.js:6842, Lite overlay `devices` ext); Arcade VM `neopixels[]` state + pane (arcade/index.js:840, arcade-device-pane.jsx:97,187) | `neopixel` part w/ `control('neopixel')` (display.js:38-70) | CPX words (setAll, setPixelColor, brightness, graph); a live ring on the CPX face or pane; animations |
| Buttons A/B, slide switch | micro:bit+ button words; Arcade buttons state | `button`, `switch`, `slide_switch` | CPX state + face controls |
| Accel / gestures | micro:bit+ `whengesture/accel/pitch/roll` | `adxl335`, `mpu6050` (not LIS3DH) | CPX sensor state (could reuse micro:bit gesture vocabulary) |
| Light, temperature, sound level | micro:bit+ `light/temp/sound` | `ldr`, `ntc`, `ambient_light`, `sound_module` | CPX state + sliders |
| Tones / sounds | micro:bit+ `playtone/playnote/rest/beat/tempo/playmelody` | `buzzer`, `piezo` | CPX sound names (magicWand, siren…) |
| Touch A1–A7 | micro:bit+ `whentouch/istouch` | `touch_ttp223` (separate part) | capacitive-touch state on pads |
| Pins A0–A7 | generic PIN declarations work against the seated pads (B3) | pads exist | dialect DEVICE accepting A0–A7 |
| IR, cable, HID, storage, datalogger, servos | none for CPX | `ir_transmitter`, `ir_remote`, `servo` | refuse (phase 1) |
- [R] micro:bit's device world runs as generated MicroPython in a self-hosted MicroPython sim iframe
  (microbit-sim-pane.jsx:42-43); `microbitplus` blocks come from the extensions repo (MPL-2.0 header), Lite's overlay copy.
- [I] No CircuitPython/CPX MicroPython sim is in Lite, so the CPX world should be VM-state-backed like Arcade/PyBadge
  (`core: samd51`-style), not the micro:bit MicroPython route.

## Q5 — can LabWired's atsamd21 back a CPX (run the real .uf2)?
- [R] labwired `atsamd21g18a` (configs/chips/atsamd21g18a.yaml; docs/boards/atsamd21g18a.md): Cortex-M0+, 256 KB flash, 32 KB
  RAM, PORT ✅, SERCOM **USART only**, NVIC, SysTick, declarative PM/SYSCTRL/GCLK/WDT/NVMCTRL. Not modelled (doc :92-96):
  SERCOM SPI/I²C, EIC, USB, TCC0–2, TC3–5, ADC, DAC, AC, I²S, DMAC, EVSYS, RTC. Tier "sim-validated, no silicon diff".
  No CPX board/system yaml exists.
- [R] UF2→ELF exists: bw-board src/uf2-to-elf.js (generic; entry = reset vector of first segment; RP2040 special-cased),
  used by labwired-adapter.js:171-177 for firmware-only runs.
- [I] CODAL-CPX needs at least I²C (LIS3DH), ADC (light/temp/mic level), DAC/TC (speaker), EIC (buttons), a TC-based
  system timer, USB (HF2 enabled in pxt.json yotta config), and timing-exact GPIO for the bit-banged NeoPixels on PB23.
  Whether CODAL boots without USB/TC, and whether a 0x2000-based app image without the UF2 bootloader gets a usable
  VTOR/SP from the ELF path: **unknown**. Verdict: not a near-term backend; a separate labwired lane if wanted.
- [R] Running the CDN base is additionally licence-gated: chip-restricted ASF4 (base-licences.js:77-79) — like the
  Nordic SoftDevice cases, lawful only "in connection with an Atmel microcontroller"; emulation status is an owner call.

## Q6 — licensing
- [R] pxt-adafruit LICENSE: MIT, Microsoft (static/makecode/adafruit/LICENSE-pxt-adafruit.txt); GitHub API reports
  NOASSERTION (detector; the file is MIT text with a "PXT-Adafruit" header). Board art already vendored MIT with notice
  (bw-circuit-ui src/parts-data/THIRD-PARTY.md:28-40). New CPX blocks in the extensions repo would be MPL-2.0 like
  microbitplus. Copying pxt enum tables (note Hz, sound names) is MIT with attribution, as microbit-translate does.
- [R] Firmware base: chip-restricted ASF4 — never vendor; serve only by pinned hash as today.

## Proposed plan (owner to approve)
**Phase 1 — device world, smallest useful slice (P1a–P1d, one PR set, upstream first):**
- P1a sb3-creator: `DEVICE CPX` (aliases `CIRCUITPLAYGROUND`, `ADAFRUIT`) in STC_PARTS, `core` without a C/MicroPython
  backend (refused by name like samd51), pins A0–A7 (+ D13 LED); words + generator cases for: ring (`set all pixels to`,
  `set pixel I to`, `set pixel brightness`, `clear pixels`, `graph V up to H`), buttons A/B (+ AB), slide switch,
  shake/tilt gestures + acceleration x/y/z, light level, temperature °C, sound level, play tone/rest/beat, touch A1–A7.
  Reuse micro:bit word spellings where the meaning is identical.
- P1b extensions repo: a `circuitplayground` extension (VM state: pixels[10], brightness, buttons, switch, accel, light,
  temp, sound, touch) — Arcade-style `runtime.bwCpxState`; sounds through the VM like microbitplus tones.
- P1c Lite: overlay the extension; a CPX device pane (ring + A/B + switch + sensor sliders) or live state on the
  bw-circuit-ui face; seated CPX board drives pads A0–A7 from PIN declarations (B3 path); add CPX to `BOARD_TO_DEVICE`.
- P1d Proof: dialect round-trip tests; a VM run test per word against pxt-adafruit's own sim for the same program
  (the sim is served; makecode-census already runs real sims) — measured readings, not just parse.
**Phase 2 — translator `adafruit-translate.js`** on the EV3 template: `inferTarget` adafruit sniff + `importProjectFiles`
  branch; handlers (`input.buttonA.onEvent`, `onGesture`, `onSwitchMoved`, `onLoudSound`) → polling scripts; census
  section over the 149 pxt-adafruit 1.6.8 docs blocks (full/partial/refused-by-name, 0 silent-loss) + export/recompile.
**Phase 3 (optional, separate lanes):** animations/photon; IR between two CPX; labwired SAMD21 peripherals for the real .uf2.

## Explicit refusal list (Phase 2, each with its reason)
light: `showAnimation`/`showAnimationFrame`/`stopAllAnimations` and the `*Animation` values, photon (`photonForward/Flip`,
`setPhotonPosition/PenHue/Mode`), `createStrip` on external pins / `createAPA102Strip` / `range` / `move` / `setMode` /
`setBuffered` (unless P1 adds external strips via the `devices` neopixel part); music: `playSound` of built-in sound
effects and melodies (unless P1 includes them), `setVolume` (if no volume model); input: `rotation`, `setAccelerometerRange`,
`onLightConditionChanged`/`onTemperatureConditionChanged` thresholds (or poll them), `ambientColor`, `touch calibrate/
setThreshold`; network: IR and cable send/receive; `keyboard`, `mouse`, `gamepad` (USB HID); `storage`, `datalogger`,
`settings`; `pins` i2c/spi/pulse/`onPulsed`/`setPull`; `control.raiseEvent/onEvent/waitForEvent`, `timer1–8`,
`runInBackground` mid-script; `servos` (unless mapped onto the existing servo word on A1/A2).

## Risks / unknowns
- Version gap: 1.6.8 served vs the live editor (tag v10.10.10 exists) — newer projects may use APIs not in 1.6.8 [unknown].
- Event semantics: MakeCode handlers become polled scripts (micro:bit precedent) — edge/timing differences must be named.
- Five repos move (sb3-creator, extensions, bw-circuit-ui if the face goes live, Lite; bw-board only if new parts) —
  Lite pin bump ripples ~8 surfaces (memory: lite-pin-bump-ripple-surfaces).
- The CPX MakeCode sim pane already runs CPX faithfully; the device world must not regress it (keep both paths).
- LabWired route: large peripheral gap + ASF4 licence; nothing measured.

## Open decisions for the owner
1. DEVICE name and aliases (`CPX` vs `CIRCUITPLAYGROUND`); Express only, or also Bluefruit (nRF52840) — recommend Express only.
2. Where the live ring/buttons render: a CPX pane (Arcade-pane style) or live state on the circuit face (bw-circuit-ui).
3. P1 scope: include animations/built-in sounds now, or refuse them by name in the first slice (recommend refuse).
4. Is a LabWired SAMD21 lane (I²C/ADC/TC/EIC/USB) wanted at all, given the ASF4 chip restriction on the base?
5. Is MakeCode's own CPX simulator an acceptable proof oracle for P1d (as for the micro:bit census)?

## Owner decisions (2026-10-13)
- **Surface:** own CPX device pane (ring, A/B, slide switch, sensor sliders), Arcade/PyBadge-style; bw-circuit-ui's face stays static in phase 1.
- **First slice:** the core beginner set **plus** ring animations and built-in sound effects (so `showAnimation`/animation values and `playSound` move from the refusal list into phase 1; photon stays refused).
- **Proof:** the same program in Lite's VM and in pxt-adafruit's own simulator (already served in Lite), compared word by word on measured readings.
- **LabWired:** running the real CPX `.uf2` on the SAMD21 model is out of A9; a separate scoping note covers that route (peripheral gap, ASF4 licence question). No code.
- **Found while scoping, verified by reading:** `inferTarget` (overlay/scratch-gui/src/lib/bw-makecode/index.js:66) has no adafruit branch and its micro:bit sniff `/\binput\.on/` matches CPX's `input.onGesture(`, so a hint-less CPX share is sent to the micro:bit translator today. Phase 2 fixes it (adafruit sniff ahead of micro:bit) with a test; not yet reproduced by running.

## Phase 1 delivered (2026-10-14)
- **Extensions** #41 + #45: `CrispStrobe/circuitplayground.js`, 45 blocks. Menus carry MakeCode's identifiers as
  values. VM state is `runtime.bwCpxState` and inputs go through `runtime.bwCpx`.
- **sb3-creator** #136: `DEVICE CPX`, with aliases `circuitplayground`, `adafruit` and `circuit_playground_express`.
  `src/utils/cpxDialect.js` has 45 words: commands and hats only under `DEVICE CPX`, reporters prefixed `cpx`.
  Pins are A0–A7, I²C is A4/A5, and the device has no C/MicroPython core. `test/cpx-dialect.test.mjs` has 55 tests.
- **Lite** #917:
  - the bundled extension on its own scoped `circuitplayground` pin, plus notices;
  - the CPX dock and pane;
  - `scripts/lib/makecode-adafruit-sim.mjs`, which runs pxt-adafruit 1.6.8's own simulator headless on a virtual
    clock (Bluebird first; tones decoded from the mixer's 12-byte instructions);
  - `scripts/lib/cpx-extension-run.mjs`.
- **Proof:** `test/cpx-device-world.test.mjs` runs 23 scenarios: ring operations, five animations frame by frame,
  tones and six melodies note by note, click and long click, the switch, and light and loud-sound events. Each
  scenario reads the same in Lite's extension and in MakeCode's simulator. Also `test/cpx-dock-wiring.test.mjs`.
- **Found by the comparison** and fixed in #45:
  - at brightness 255 MakeCode keeps the buffer unscaled;
  - the slide switch starts on the right.
- **Process lesson:** a merge that changes the extensions gallery reddens Lite main's vendor-freshness gate until
  `sync-gallery-pins` is re-run after the Pages deploy. Re-pin in the same session.

**Next:** OPEN-TASKS A12 (the translator: the plan's phase 2, with the refusal list above minus animations and
built-in sounds, which are now words) and A13 (live state on the circuit face). The LabWired lane is B19–B22 (see
`A9-CPX-LABWIRED-SCOPING.md`).
