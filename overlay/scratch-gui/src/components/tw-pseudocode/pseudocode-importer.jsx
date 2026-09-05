import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import {closeAlertWithId, showStandardAlert} from '../../reducers/alerts';
import {DEVICE_CHIP_LABELS} from '../../lib/device-labels.js';
import {normalizeDeviceId, resolveExampleBench} from '../../lib/example-bench.js';
import brickRobot from './brick-robot.svg';
import {IMPORT_ACCEPT, isImportableArtefact} from '../../lib/bw-makecode/accept.js';
// Static, not lazy: `_asmExamples()` is read during render, so it has to be
// synchronous — and the module is a few KB of strings, not a chunk worth
// splitting.
import {asmExamplesFor} from '../../lib/bw-asm/examples.js';
import {requestAssembly, asmRouteFor, asmTargetForDevice} from '../../lib/bw-asm/assemble-route.js';

// The example sources — upstream's and the locally-authored games, kept in
// separate files so the upstream one stays synchronizable — are 266 KiB raw
// (51 KiB compressed) that the entry bundle carried for a picker on one tab.
// They are fetched when the no-device Tools menu opens (or when restored game
// controls need to identify their source). `loadExample` awaits the load
// itself, so a click that races the fetch still works.
let examples = {};
let examplesPending = null;
let examplesReady = false;
const loadExamples = () => {
    if (!examplesPending) {
        const pending = Promise.all([
            import(/* webpackChunkName: "pseudocode-examples" */ '../../lib/sb3-creator-examples.js'),
            import(/* webpackChunkName: "pseudocode-examples" */ '../../lib/sb3-creator-game-examples.js')
        ]).then(([upstreamExamples, gameExamples]) => {
            // Keep locally-authored games outside the upstream-synchronized examples file.
            examples = {...upstreamExamples.default, ...gameExamples.default};
            examplesReady = true;
            return examples;
        }).catch(error => {
            // A transient offline/cache miss must not poison every later Tools
            // open. Only clear the promise that actually failed: a future
            // retry may already have installed a new one.
            if (examplesPending === pending) examplesPending = null;
            throw error;
        });
        examplesPending = pending;
    }
    return examplesPending;
};

// Device groups for the device selector. Mirrors STC_PARTS in sb3-creator.js; the parser
// validates the DEVICE line against STC_PARTS and warns on unknowns, so this list is a
// presentation concern. Each group maps to a `core` that determines pin naming, compile
// target, and emulator. Capability flags tell the UI what each target supports.
const DEVICE_GROUPS = [
    { label: 'STC12 (8051)', core: '8051', devices: [
        { id: 'stc12c5a60s2', label: 'STC12C5A60S2', compile: true, emulator: 'emu8051' },
        { id: 'stc12c5a16s2', label: 'STC12C5A16S2', compile: true, emulator: 'emu8051' },
        { id: 'stc15f2k60s2', label: 'STC15F2K60S2', compile: true, emulator: 'emu8051' },
        { id: 'stc15w408as', label: 'STC15W408AS', compile: true, emulator: 'emu8051' },
        { id: 'stc89c52rc', label: 'STC89C52RC', compile: true, emulator: 'emu8051' },
        { id: 'stc89c52', label: 'STC89C52', compile: true, emulator: 'emu8051' },
    ]},
    { label: 'Arduino (AVR)', core: 'arduino', devices: [
        { id: 'arduino-uno', label: 'Arduino Uno', compile: false, emulator: 'avr8js' },
        { id: 'arduino-nano', label: 'Arduino Nano', compile: false, emulator: 'avr8js' },
        { id: 'arduino-mega', label: 'Arduino Mega', compile: false, emulator: 'avr8js' },
        { id: 'atmega328p', label: 'ATmega328P (bare)', compile: false, emulator: 'avr8js' },
        { id: 'atmega168p', label: 'ATmega168P (bare)', compile: false, emulator: 'avr8js' },
        { id: 'attiny88', label: 'ATtiny88 (bare)', compile: false, emulator: 'attiny88' },
        { id: 'attiny85', label: 'ATtiny85', compile: false, emulator: 'attiny85' },
        // An ATmega32U4 console. `compile: false` is the important half:
        // there is no path from blocks to an Arduboy binary — that needs
        // avr-gcc, which is GPL and cannot ship here — so choosing this
        // offers to RUN a .hex, not to build one. Listing it as compilable
        // would promise something the licence forbids.
        { id: 'arduboy', label: 'Arduboy (run .hex)', compile: false, emulator: 'arduboy' },
    ]},
    { label: 'Raspberry Pi', core: 'rp2040', devices: [
        { id: 'pico', label: 'Raspberry Pi Pico', compile: true, emulator: 'rp2040js' },
    ]},
    { label: 'STM32 (ARM)', core: 'arm', devices: [
        { id: 'stm32f030', label: 'STM32F030', compile: true, emulator: 'stm32f0' },
    ]},
    { label: '6502', core: 'w65c02', devices: [
        { id: 'eater6502', label: 'Eater 6502', compile: false, emulator: null },
    ]},
    { label: 'Z80', core: 'z80', devices: [
        { id: 'z80', label: 'Z80 bench', compile: false, emulator: null },
    ]},
    // `compile: false` STILL MEANS WHAT IT SAYS, and it is not a leftover.
    // It is read as "the hosted C compiler can build this", and it cannot:
    // sb3-creator has no 8086 device profile and stc-compiler has no 8086
    // back end, so `generateC` + POST is a road that ends in "unknown
    // device: i8086" three clicks later. What changed is that there is now a
    // SECOND road — `lib/bw-asm/pseudocode-8086.js` lowers the blocks to
    // 8086 assembly in the browser and `requestAssembly` assembles them
    // here, with no network and no toolchain — and `runPseudocodeOn8086`
    // is the ▶ button for it. The two flags are about different roads, so
    // the device is offered as compilable-by-neither and runnable anyway.
    //
    // It is in the picker because it is the BOARDLESS way to reach the 8086 —
    // a DOS bench with no drawn circuit at all, which is what most 8086
    // coursework wants. It is no longer the ONLY way: this comment used to say
    // "the circuit palette has no 8086 part yet", which was true when written
    // and is now false. The DIP drawings (i8086, i8088, i8251, i8254, i8255,
    // i8259, i8284) and the device registrations both landed, so "seat one on
    // the board" — how the 6502 and Z80 benches are usually chosen — works.
    // circuit-tab.jsx detects the part and publishes bwDeviceCore = 'i8086',
    // and this entry keeps working unchanged, as it was written to.
    { label: '8086', core: 'i8086', devices: [
        { id: 'i8086', label: 'Intel 8086 (DOS bench)', compile: false, emulator: null },
    ]},
    { label: 'MicroPython', core: 'micropython', devices: [
        { id: 'microbit', label: 'micro:bit', compile: false, emulator: null },
        // The Calliope runs the micro:bit's API on different hardware, so it
        // shares the vocabulary, the simulator and the whole MicroPython
        // path. It is listed separately because a program written for one
        // says so — a Calliope import that claimed DEVICE MICROBIT told the
        // reader their board was a micro:bit.
        { id: 'calliopemini', label: 'Calliope mini', compile: false, emulator: null },
    ]},
    { label: 'Arcade & SAMD51', core: 'samd51', devices: [
        { id: 'arcade', label: 'MakeCode Arcade (160×120)', compile: false, emulator: 'arcade' },
        { id: 'pybadge', label: 'Adafruit PyBadge', compile: false, emulator: 'arcade' },
        { id: 'pybadge-lc', label: 'Adafruit PyBadge LC', compile: false, emulator: 'arcade' },
        { id: 'samd51', label: 'ATSAMD51J19 (generic)', compile: false, emulator: null },
    ]},
];
const DEVICE_BY_ID = {};
for (const g of DEVICE_GROUPS) for (const d of g.devices) DEVICE_BY_ID[d.id] = { ...d, core: g.core, group: g.label };

// i18n for the Code tab's own strings. The editor already exposes the current locale in redux
// (state.locales.locale); we pick en/de from this table (falling back to English). Values may be
// functions for interpolation. To add a language, add its column.
const L10N = {
    en: {
        loadExample: '📚 Load example…', loadExampleTitle: 'Load a built-in example',
        examplesLoading: 'Loading built-in examples…',
        examplesRetry: 'Built-in examples unavailable — retry',
        openFile: '📂 Open', openFileTitle: t => `Open a source file (${t})`,
        saveFile: '💾 Save', saveFileTitle: n => `Save this tab as ${n}`,
        exportMakeCode: '📦 MakeCode source',
        exportMakeCodeTitle: 'Download the original recovered MakeCode project files for the official editor or PXT CLI',
        openBad: e => `Don't know that file type (${e}).`,
        openDone: (f, t) => `Loaded ${f} into the ${t} tab`,
        mcReading: f => `Reading ${f}…`,
        downloadHex: '⬇ .hex for the board',
        microbitNeedFirmware: 'Pick a MicroPython .hex once (from python.microbit.org, or the one that came with the board) — it is kept for this session.',
        microbitFirmwareBad: f => `${f} is not an Intel HEX file.`,
        microbitHexReady: f => `${f} saved. Copy it onto the MICROBIT drive.`,
        arduboyRunning: f => `Running ${f} on the Arduboy console. Arrow keys move, Z is A, X is B.`,
        mcPython: (f, n) => `${f} carried a MicroPython program (${n}) — loaded, and the simulator can run it.`,
        mcMicrobit: (f, n) => `Imported "${n}" from ${f} — MakeCode micro:bit, translated to blocks.`,
        mcPartial: (f, n, k) => `Imported "${n}" from ${f}. ${k} thing(s) from MakeCode have no equivalent here; each is marked "# unsupported" in the code.`,
        mcArcade: (f, n, s, c, button) => `Imported the Arcade game "${n}" from ${f}: ${s} sprite(s), ${c} costume(s). Press ${button} to build it.`,
        mcNoSource: (f, k) => `${f} is a ${k} file with no project source embedded in it — nothing to import.`,
        mcFailed: (f, e) => `Could not read ${f}: ${e}`,
        mcShare: '🔗 MakeCode…',
        mcShareTitle: 'Import a project from a MakeCode share link (arcade.makecode.com or makecode.microbit.org)',
        mcSharePrompt: 'Paste a MakeCode share link:',
        mcShareLoading: 'Fetching the shared project…',
        mcExport: '⬆ To MakeCode',
        mcExportTitle: 'Save this project as a .hex that makecode.microbit.org can import',
        mcExportDone: (f, u) => (u ?
            `Saved ${f} — drop it on makecode.microbit.org to open it there. ${u} block(s) had no MakeCode equivalent.` :
            `Saved ${f} — drop it on makecode.microbit.org to open it there.`),
        mcExportEmpty: 'Nothing to export — write some blocks first.',
        saveEmpty: 'Nothing to save — this tab is empty.',
        restored: t => `Restored your unsaved ${t}.`,
        loadCatalogTitle: 'Load a catalog example for this device',
        noChips: 'no chips (Scratch stage)',
        searchExamples: 'Search examples…',
        catalogLoading: 'Loading example catalog…',
        catalogEmpty: 'No catalog examples for this device.',
        catalogNoMatch: 'No examples match that search.',
        catalogUnavailable: e => `Example catalog unavailable (${e})`,
        catalogNeeds: devs => `Needs: ${devs}`,
        infoTitle: 'Click for info', infoAria: 'About the Code tab',
        reference: 'reference', referenceTitle: l => `Reference for ${l}`,
        customArt: 'Custom sprite art', customArtTitle: 'Upload SVGs and bake them in as sprite costumes',
        toBlocks: '⇦ To blocks', toBlocksTitle: l => `Compile this ${l} into blocks`,
        fromBlocks: 'From blocks ⇨', fromBlocksTitle: 'Read the current blocks back into all languages',
        compactToBlocks: '⇦ Blocks', compactFromBlocks: 'Blocks ⇨',
        run: 'Run', runBasic: '▶ Run BASIC',
        basicBudget: ms => `Stopped after ${(ms / 1000).toFixed(0)}s simulated time (endless loop?).`,
        basicInputExhausted: 'Program asked for INPUT but no more answers were provided.',
        basicNoPrompt: 'BASIC did not reach its ready prompt — the ROM may not have loaded.',
        basicLoading: 'Loading BASIC machine…',
        apply: '✓ Apply art & convert to blocks', done: 'Done',
        applyTitle: n => `Assign a sprite to ${n} more file(s) first`,
        applyReady: 'Bake these costumes in and convert your code to blocks',
        doneTitle: 'Keep these costumes; they apply on the next ⇦ To blocks',
        needSprite: n => `${n} file(s) still need a sprite.`,
        svgFile: 'SVG file', sprite: 'Sprite', mode: 'Mode', chooseSprite: '— choose sprite —',
        notInCode: 'not in code', replaceCostume: 'replace costume', addFrame: 'add as frame',
        driverShim: 'driver: shim', driverRemote: 'driver: remote (bridge)', driverOnbrick: 'driver: on-brick',
        driverSim: 'driver: simulated board',
        driverTitle: 'Hardware-extension driver: shim (neutral) · remote (bridge over WebSocket) · on-brick (device transpiler). The program is driver-agnostic; this only swaps the driver.',
        asyncLabel: 'async', asyncTitle: 'await hardware calls (BLE is async) and make functions async',
        eventsLabel: 'events', eventsTitle: 'turn extension event hats (when button pressed …) into driver callbacks',
        stConverting: to => `Converting to ${to}…`, stCantShow: (to, e) => `Can't show as ${to}: ${e}`,
        stRegen: 'Regenerating…', stCompiling: 'Compiling…', stReading: 'Reading current project…',
        stLoadingPy: 'Loading Python (Skulpt)…', stError: e => `Error: ${e}`,
        deployPico: '🔌 Deploy to Pico',
        deployPicoTitle: 'Send this program to a real Raspberry Pi Pico over USB (MicroPython)',
        deployPicoDone: 'Deployed to the Pico — main.py is running (and survives reboot).',
        deployPicoSaved: 'This browser cannot talk to USB serial (Chrome or Edge can). Saved main.py instead — copy it to the Pico with Thonny, or `bw flash` from the sb3-creator CLI.',
        deployPicoFail: e => `Pico deploy failed: ${e}`,
        deployPicoNoPort: 'No Pico found on USB. Plug it in (a normal boot, not BOOTSEL) and try again.',
        deployPicoBootsel: 'The Pico is in BOOTSEL mode — it needs MicroPython first. Flash a MicroPython UF2 onto the RPI-RP2 volume, then deploy again.',
        flashBoard: '⚡ Flash to board',
        flashBoardTitle: 'Compile and write this program to a real board over USB serial',
        flashCompiling: 'compiling for the board…',
        flashing: 'flashing…',
        flashDone: n => `flashed ${n} bytes — the board is running it`,
        flashNoSerial: 'This browser cannot flash over USB (Chrome or Edge can). The compiled image was downloaded instead.',
        flashNoPort: 'No port chosen.',
        flashFail: e => `flashing failed: ${e}`,
        flashColdBoot: 'PULL THE POWER AND REAPPLY IT — a reset button will not do; the STC bootloader only answers after a cold power-on.',
        flashStm32Boot: 'Set BOOT0 HIGH and reset the board (the F030 breakout has a jumper), then pick the port — the ROM bootloader only listens then.',
        flashEepromHint: 'Pick the Ben Eater EEPROM programmer (running bweep.ino) — this burns the CHIP, not the 6502/Z80; move the chip to the board after.',
        flashIspHint: 'Pick the USBasp/USBISP programmer wired to the chip\'s 6-pin ICSP header (MOSI/MISO/SCK/RST/VCC/GND).',
        flashSwd: '⚡ Flash via SWD',
        flashSwdTitle: 'Flash over the debug port using a CMSIS-DAP probe (DAPLink, or a Pico running picoprobe) — no BOOT0, no reset',
        flashSwdHint: 'Pick the CMSIS-DAP probe wired to SWDIO/SWCLK/GND (a DAPLink board, or a Pico running picoprobe).',
        flashNoWebUsb: 'This browser cannot do WebUSB (Chrome or Edge can — they flash the USBasp directly, here, no extra software). The compiled .hex was downloaded so you can use any external programmer you already have.',
        flashNeedsProgrammer: d => `${d} has no serial bootloader — it needs an ISP/SPI programmer (or, for a 6502/Z80 breadboard, an EEPROM burner). Compiled image downloaded so you can use your own tool.`,
        stLoaded: 'Compiled to blocks and loaded. Switch to the Code tab to see them.',
        stWarn: w => `Loaded with warnings — ${w}`,
        foreverLoop: 'This project has a forever (game) loop, so it runs in the blocks — press the green flag to play it. For a text run, try an algorithmic example (quiz, operators, 2048, …).',
        cNote: 'C for the STC12 / 8051. Paste your own firmware and press ⇦ To blocks, or compile it to a .hex with stc-compiler.vercel.app.',
        basicNote: 'Runs BBC BASIC (R.T. Russell, zlib) or 6502 BASIC (derived from MIT-licensed source). Toggle profile and line numbers above. Multi-WHEN programs cannot be shown (BASIC is single-threaded).',
        asmNote: 'Write assembly or view the compiled listing. Source mode: write per-device assembly and assemble+run — the 6502/Z80/8086 benches boot the image directly. TWO ASSEMBLERS, and which one runs is always in the status line: 8086 assembly is built IN THIS BROWSER (no network, MASM syntax), while 8051/6502/Z80/AVR go to the hosted toolchain. Listing mode: generated read-only evidence, linked locally for bundled 8051 targets and explicitly hosted for unsupported targets. No ASM-to-blocks path — that asymmetry is deliberate.',
        stCOneWay: 'That language cannot be compiled back to blocks.',
        // BASIC / ASM mode bar
        profile: 'Profile:', lineNumbers: 'Line numbers', alwaysOn6502: '(always on for 6502)',
        asmModeLabel: 'Mode:', asmSource: 'Source (editable)', asmListing: 'Listing (from compiler)',
        asmExampleLabel: 'Example:', asmExamplePick: 'choose…',
        asmExampleReplace: 'Replace what is in the assembly editor?',
        asmExampleLoaded: n => `Loaded "${n}". Press Assemble & Run to build it.`,
        assembleAndRun: '🔩 Assemble & Run',
        // WHICH ROUTE RAN is part of the answer, not a detail. One tab has
        // two assemblers (see lib/bw-asm/assemble-route.js) and a user who
        // cannot tell which one refused their program cannot act on the
        // refusal — a ca65 diagnostic and an 8086 AsmError read nothing
        // alike, and only one of the two needs the network.
        asmRouteLocal: 'in this browser', asmRouteHosted: 'by the hosted assembler',
        asmAssembling: r => `Assembling ${r}…`,
        asmBuiltBench: (n, r, m) => `Assembled ${n} bytes ${r} — booting the ${m} bench…`,
        asmBuiltOnly: (n, r, t) => `Assembled OK (${n} bytes, ${r}). Auto-run from ASM is wired for the 6502/Z80/8086 benches; for ${t} use the compile path.`,
        asmSourceError: (r, m) => `Assembly errors (${r}): ${m}`,
        asmTransportError: (r, m) => `Assembler unreachable (${r}): ${m}`,
        asmWarnings: w => ` — ${w.length} warning(s): ${w.join('; ')}`,
        // The licence is the condition these examples ship under, so it is
        // rendered next to the picker and not buried in a notices file.
        asmCredit: a => `${a.author} · ${a.licence}`,
        asmCreditTitle: a => `Example programs by ${a.author}, ${a.licence}-licensed. Source: ${a.repo}`,
        basicInfoTitle: 'BASIC info', asmInfoTitle: 'ASM info',
        // micro:bit bar
        micropythonReadonly: 'Read-only — generated from your blocks for the micro:bit.',
        micropythonImported: 'Imported from a .hex — the simulator runs this as it is.',
        runOnSimulator: '▶ Run on Simulator',
        debugOnSimulator: '🐞 Debug',
        debugLevelBlock: 'Block',
        debugLevelLine: 'Line',
        debugBlockHint: 'Block-level: steps block-by-block on the standard firmware — no extra download.',
        debugLineHint: 'Line-level: steps by source line with real variables & call stack (loads the settrace debug firmware, +6KB).',
        // device selector / maximize
        devicePlaceholder: 'Device…', deviceTitle: 'Target device — sets pin names, compile target and emulator',
        maximizeTitle: 'Maximize editor', restoreTitle: 'Restore panels',
        asmWriteFirst: 'Write assembly source first.',
        // Pseudocode → 8086, the offline path. The status line says where the
        // program was built as well as that it was, because "built" and
        // "built here, without the network" are different sentences and this
        // button's whole claim is the second one.
        run8086: '▶ Run on 8086',
        run8086Title: 'Turn these blocks into 8086 assembly in this browser and run it on the DOS bench — no network, no toolchain.',
        run8086Building: 'Lowering the blocks to 8086 assembly…',
        run8086Built: (n, b) => `Built ${n} bytes from ${b} block(s) in this browser — booting the 8086 DOS bench…`,
        run8086Refused: m => `The 8086 back end refused this program: ${m}`,
        run8086Failed: m => `Could not build for the 8086: ${m}`,
        run8086Empty: 'Write some pseudocode first.',
        // reference section headers
        h: {
            Structure: 'Structure', EventsHats: 'Events (hats)', Control: 'Control',
            ClonesBroadcasts: 'Clones & broadcasts', MotionLooks: 'Motion & Looks',
            DataLists: 'Data & lists', Expressions: 'Expressions', Conditions: 'Conditions',
            CustomBlocks: 'Custom blocks', PlaneteMaths: 'Planète Maths (extension)',
            ArraysVectors: 'Arrays & Vectors (extension)', SensingMore: 'Sensing & more',
            Statements: 'Statements', Declare: 'Declare (pseudocode tab)', Pins: 'Pins',
            Notes: 'Notes', Profiles: 'Profiles', LineNumbers: 'Line numbers', IO: 'I/O',
            Overview: 'Overview', Verbs: 'Verbs',
            Registers: 'Registers', Workflow: 'Workflow', Addressing: 'Addressing',
            I8086: '8086 (MASM, assembled here)'
        }
    },
    de: {
        loadExample: '📚 Beispiel laden…', loadExampleTitle: 'Ein eingebautes Beispiel laden',
        examplesLoading: 'Eingebaute Beispiele werden geladen…',
        examplesRetry: 'Eingebaute Beispiele nicht verfügbar — erneut versuchen',
        openFile: '📂 Öffnen', openFileTitle: t => `Eine Quelldatei öffnen (${t})`,
        saveFile: '💾 Speichern', saveFileTitle: n => `Diesen Tab als ${n} speichern`,
        exportMakeCode: '📦 MakeCode-Quellcode',
        exportMakeCodeTitle: 'Die unveränderten, wiederhergestellten MakeCode-Projektdateien für den offiziellen Editor oder die PXT-CLI laden',
        openBad: e => `Unbekannter Dateityp (${e}).`,
        openDone: (f, t) => `${f} in den ${t}-Tab geladen`,
        mcReading: f => `${f} wird gelesen…`,
        downloadHex: '⬇ .hex für das Board',
        microbitNeedFirmware: 'Einmal eine MicroPython-.hex wählen (von python.microbit.org oder die vom Board) — sie bleibt für diese Sitzung gespeichert.',
        microbitFirmwareBad: f => `${f} ist keine Intel-HEX-Datei.`,
        microbitHexReady: f => `${f} gespeichert. Auf das MICROBIT-Laufwerk kopieren.`,
        arduboyRunning: f => `${f} läuft auf der Arduboy-Konsole. Pfeiltasten bewegen, Z ist A, X ist B.`,
        mcPython: (f, n) => `${f} enthielt ein MicroPython-Programm (${n}) — geladen, der Simulator kann es ausführen.`,
        mcMicrobit: (f, n) => `„${n}" aus ${f} importiert — MakeCode micro:bit, in Blöcke übersetzt.`,
        mcPartial: (f, n, k) => `„${n}" aus ${f} importiert. Für ${k} Element(e) aus MakeCode gibt es hier keine Entsprechung; jede ist im Code mit „# unsupported" markiert.`,
        mcArcade: (f, n, s, c, button) => `Arcade-Spiel „${n}" aus ${f} importiert: ${s} Sprite(s), ${c} Kostüm(e). Mit „${button}" bauen.`,
        mcNoSource: (f, k) => `${f} ist eine ${k}-Datei ohne eingebetteten Projekt-Quelltext — nichts zu importieren.`,
        mcFailed: (f, e) => `${f} konnte nicht gelesen werden: ${e}`,
        mcShare: '🔗 MakeCode…',
        mcShareTitle: 'Ein Projekt über einen MakeCode-Freigabelink importieren (arcade.makecode.com oder makecode.microbit.org)',
        mcSharePrompt: 'MakeCode-Freigabelink einfügen:',
        mcShareLoading: 'Geteiltes Projekt wird geladen…',
        mcExport: '⬆ Zu MakeCode',
        mcExportTitle: 'Dieses Projekt als .hex speichern, die makecode.microbit.org importieren kann',
        mcExportDone: (f, u) => (u ?
            `${f} gespeichert — auf makecode.microbit.org ablegen, um es dort zu öffnen. Für ${u} Block/Blöcke gibt es in MakeCode keine Entsprechung.` :
            `${f} gespeichert — auf makecode.microbit.org ablegen, um es dort zu öffnen.`),
        mcExportEmpty: 'Nichts zu exportieren — zuerst Blöcke schreiben.',
        saveEmpty: 'Nichts zu speichern — dieser Tab ist leer.',
        restored: t => `Nicht gespeicherter ${t} wiederhergestellt.`,
        loadCatalogTitle: 'Ein Katalog-Beispiel für dieses Gerät laden',
        noChips: 'ohne Chip (Scratch-Bühne)',
        searchExamples: 'Beispiele suchen…',
        catalogLoading: 'Beispiel-Katalog wird geladen…',
        catalogEmpty: 'Keine Katalog-Beispiele für dieses Gerät.',
        catalogNoMatch: 'Keine Beispiele passen zur Suche.',
        catalogUnavailable: e => `Beispiel-Katalog nicht verfügbar (${e})`,
        catalogNeeds: devs => `Benötigt: ${devs}`,
        infoTitle: 'Für Infos klicken', infoAria: 'Über den Code-Tab',
        reference: 'Referenz', referenceTitle: l => `Referenz für ${l}`,
        customArt: 'Eigene Sprite-Grafik', customArtTitle: 'SVGs hochladen und als Sprite-Kostüme einbacken',
        toBlocks: '⇦ Zu Blöcken', toBlocksTitle: l => `Diesen ${l}-Code zu Blöcken kompilieren`,
        fromBlocks: 'Von Blöcken ⇨', fromBlocksTitle: 'Das aktuelle Projekt in alle Sprachen einlesen',
        compactToBlocks: '⇦ Blöcke', compactFromBlocks: 'Blöcke ⇨',
        run: 'Ausführen', runBasic: '▶ BASIC ausführen',
        basicBudget: ms => `Nach ${(ms / 1000).toFixed(0)}s simulierter Zeit angehalten (Endlosschleife?).`,
        basicInputExhausted: 'Programm hat INPUT erwartet, aber es waren keine weiteren Antworten vorhanden.',
        basicNoPrompt: 'BASIC hat seine Bereit-Eingabeaufforderung nicht erreicht — das ROM wurde möglicherweise nicht geladen.',
        basicLoading: 'BASIC-Maschine wird geladen…',
        apply: '✓ Grafik übernehmen & zu Blöcken', done: 'Fertig',
        applyTitle: n => `Weise erst ${n} weiteren Datei(en) ein Sprite zu`,
        applyReady: 'Diese Kostüme einbacken und den Code zu Blöcken umwandeln',
        doneTitle: 'Kostüme behalten; sie werden beim nächsten „⇦ Zu Blöcken” angewendet',
        needSprite: n => `${n} Datei(en) brauchen noch ein Sprite.`,
        svgFile: 'SVG-Datei', sprite: 'Sprite', mode: 'Modus', chooseSprite: '— Sprite wählen —',
        notInCode: 'nicht im Code', replaceCostume: 'Kostüm ersetzen', addFrame: 'als Bild hinzufügen',
        driverShim: 'Treiber: Shim', driverRemote: 'Treiber: Remote (Bridge)', driverOnbrick: 'Treiber: auf dem Stein',
        driverSim: 'Treiber: simuliertes Board',
        driverTitle: 'Hardware-Extension-Treiber: Shim (neutral) · Remote (Bridge über WebSocket) · auf dem Stein (Geräte-Transpiler). Das Programm ist treiberunabhängig; dies wechselt nur den Treiber.',
        asyncLabel: 'async', asyncTitle: 'Hardware-Aufrufe awaiten (BLE ist async) und Funktionen async machen',
        eventsLabel: 'events', eventsTitle: 'Extension-Event-Hats (wenn Knopf gedrückt …) in Treiber-Callbacks umwandeln',
        stConverting: to => `Wird zu ${to} umgewandelt…`, stCantShow: (to, e) => `Kann nicht als ${to} angezeigt werden: ${e}`,
        stRegen: 'Wird neu erzeugt…', stCompiling: 'Wird kompiliert…', stReading: 'Aktuelles Projekt wird gelesen…',
        stLoadingPy: 'Python wird geladen (Skulpt)…', stError: e => `Fehler: ${e}`,
        deployPico: '🔌 Auf Pico übertragen',
        deployPicoTitle: 'Dieses Programm per USB auf einen echten Raspberry Pi Pico übertragen (MicroPython)',
        deployPicoDone: 'Auf den Pico übertragen — main.py läuft (auch nach Neustart).',
        deployPicoSaved: 'Dieser Browser kann kein USB-Serial (Chrome oder Edge können es). main.py wurde stattdessen gespeichert — mit Thonny auf den Pico kopieren, oder `bw flash` aus der sb3-creator-CLI.',
        deployPicoFail: e => `Pico-Übertragung fehlgeschlagen: ${e}`,
        deployPicoNoPort: 'Kein Pico am USB gefunden. Anstecken (normaler Start, nicht BOOTSEL) und erneut versuchen.',
        deployPicoBootsel: 'Der Pico ist im BOOTSEL-Modus — er braucht zuerst MicroPython. Ein MicroPython-UF2 auf das RPI-RP2-Laufwerk kopieren, dann erneut übertragen.',
        flashBoard: '⚡ Auf Platine flashen',
        flashBoardTitle: 'Dieses Programm kompilieren und per USB auf eine echte Platine schreiben',
        flashCompiling: 'wird für die Platine kompiliert…',
        flashing: 'wird geflasht…',
        flashDone: n => `${n} Bytes geflasht — die Platine führt es aus`,
        flashNoSerial: 'Dieser Browser kann nicht per USB flashen (Chrome oder Edge können es). Das kompilierte Abbild wurde stattdessen heruntergeladen.',
        flashNoPort: 'Kein Port gewählt.',
        flashFail: e => `Flashen fehlgeschlagen: ${e}`,
        flashColdBoot: 'STROM ZIEHEN UND WIEDER ANLEGEN — eine Reset-Taste genügt nicht; der STC-Bootloader antwortet nur nach einem Kaltstart.',
        flashStm32Boot: 'BOOT0 auf HIGH setzen und die Platine zurücksetzen (das F030-Board hat einen Jumper), dann den Port wählen — nur dann lauscht der ROM-Bootloader.',
        flashEepromHint: 'Den Ben-Eater-EEPROM-Programmer (mit bweep.ino) wählen — das brennt den CHIP, nicht den 6502/Z80; den Chip danach auf die Platine setzen.',
        flashIspHint: 'Den USBasp/USBISP-Programmer wählen, der am 6-poligen ICSP-Header des Chips hängt (MOSI/MISO/SCK/RST/VCC/GND).',
        flashSwd: '⚡ Über SWD flashen',
        flashSwdTitle: 'Über den Debug-Port mit einem CMSIS-DAP-Adapter flashen (DAPLink oder ein Pico mit picoprobe) — ohne BOOT0, ohne Reset',
        flashSwdHint: 'Den CMSIS-DAP-Adapter wählen, der an SWDIO/SWCLK/GND hängt (ein DAPLink-Board oder ein Pico mit picoprobe).',
        flashNoWebUsb: 'Dieser Browser kann kein WebUSB (Chrome oder Edge können es — sie flashen den USBasp direkt, hier, ohne Zusatzsoftware). Die kompilierte .hex wurde heruntergeladen, damit ein bereits vorhandenes externes Programmiergerät genutzt werden kann.',
        flashNeedsProgrammer: d => `${d} hat keinen seriellen Bootloader — es braucht einen ISP/SPI-Programmer (oder, für ein 6502/Z80-Steckbrett, ein EEPROM-Brenngerät). Kompiliertes Abbild heruntergeladen.`,
        stLoaded: 'Zu Blöcken kompiliert und geladen. Wechsle zum Blöcke-Tab, um sie zu sehen.',
        stWarn: w => `Mit Warnungen geladen — ${w}`,
        foreverLoop: 'Dieses Projekt hat eine Endlosschleife (Spiel), es läuft daher in den Blöcken — klicke die grüne Flagge zum Spielen. Für einen Text-Lauf nimm ein algorithmisches Beispiel (Quiz, Operatoren, 2048, …).',
        cNote: 'C für den STC12 / 8051. Eigene Firmware einfügen und „⇦ Zu Blöcken” drücken, oder auf stc-compiler.vercel.app zu .hex kompilieren.',
        basicNote: 'BBC BASIC (R.T. Russell, zlib) oder 6502 BASIC (abgeleitet von MIT-lizenzierter Quelle). Profil und Zeilennummern oben umschalten. Multi-WHEN-Programme werden nicht dargestellt (BASIC ist einzel-threaded).',
        asmNote: 'Assembler schreiben oder kompiliertes Listing ansehen. Source-Modus: gerätespezifischen Assembler schreiben und assemblieren+ausführen — die 6502-/Z80-/8086-Werkbänke booten das Image direkt. ZWEI ASSEMBLER, und welcher lief, steht immer in der Statuszeile: 8086-Assembler wird IN DIESEM BROWSER gebaut (ohne Netz, MASM-Syntax), 8051/6502/Z80/AVR gehen an den gehosteten Dienst. Listing-Modus: erzeugter, schreibgeschützter Beleg, für gebündelte 8051-Ziele lokal gelinkt und für nicht unterstützte Ziele ausdrücklich gehostet. Kein ASM-zu-Blöcke-Pfad — diese Asymmetrie ist beabsichtigt.',
        stCOneWay: 'Diese Sprache lässt sich nicht zu Blöcken zurückführen.',
        // BASIC / ASM mode bar
        profile: 'Profil:', lineNumbers: 'Zeilennummern', alwaysOn6502: '(immer an bei 6502)',
        asmModeLabel: 'Modus:', asmSource: 'Source (editierbar)', asmListing: 'Listing (vom Compiler)',
        asmExampleLabel: 'Beispiel:', asmExamplePick: 'wählen…',
        asmExampleReplace: 'Inhalt des Assembler-Editors ersetzen?',
        asmExampleLoaded: n => `„${n}" geladen. Mit Assemblieren & Ausführen bauen.`,
        assembleAndRun: '🔩 Assemblieren & Ausführen',
        asmRouteLocal: 'in diesem Browser', asmRouteHosted: 'vom gehosteten Assembler',
        asmAssembling: r => `Assembliere ${r}…`,
        asmBuiltBench: (n, r, m) => `${n} Bytes assembliert ${r} — starte die ${m}-Werkbank…`,
        asmBuiltOnly: (n, r, t) => `Assembliert (${n} Bytes, ${r}). Auto-Start aus ASM ist für die 6502-/Z80-/8086-Werkbänke verdrahtet; für ${t} den Compile-Pfad nutzen.`,
        asmSourceError: (r, m) => `Assembler-Fehler (${r}): ${m}`,
        asmTransportError: (r, m) => `Assembler nicht erreichbar (${r}): ${m}`,
        asmWarnings: w => ` — ${w.length} Warnung(en): ${w.join('; ')}`,
        asmCredit: a => `${a.author} · ${a.licence}`,
        asmCreditTitle: a => `Beispielprogramme von ${a.author}, Lizenz ${a.licence}. Quelle: ${a.repo}`,
        basicInfoTitle: 'BASIC-Info', asmInfoTitle: 'ASM-Info',
        // micro:bit bar
        micropythonReadonly: 'Nur-Lesen — aus deinen Blöcken für den micro:bit generiert.',
        micropythonImported: 'Aus einer .hex importiert — der Simulator führt das direkt aus.',
        runOnSimulator: '▶ Im Simulator ausführen',
        debugOnSimulator: '🐞 Debuggen',
        debugLevelBlock: 'Block',
        debugLevelLine: 'Zeile',
        debugBlockHint: 'Block-Ebene: Schritt für Block auf der Standard-Firmware — kein Extra-Download.',
        debugLineHint: 'Zeilen-Ebene: Schritt für Quellzeile mit echten Variablen & Aufrufstapel (lädt die settrace-Debug-Firmware, +6KB).',
        // device selector / maximize
        devicePlaceholder: 'Gerät…', deviceTitle: 'Zielgerät — bestimmt Pinbenennung, Compile-Ziel und Emulator',
        maximizeTitle: 'Editor maximieren', restoreTitle: 'Panels wiederherstellen',
        asmWriteFirst: 'Schreibe zuerst Assembler-Quellcode.',
        run8086: '▶ Auf 8086 ausführen',
        run8086Title: 'Diese Blöcke in diesem Browser in 8086-Assembler übersetzen und auf der DOS-Werkbank ausführen — ohne Netz, ohne Toolchain.',
        run8086Building: 'Übersetze die Blöcke in 8086-Assembler…',
        run8086Built: (n, b) => `${n} Bytes aus ${b} Block/Blöcken in diesem Browser erzeugt — starte die 8086-DOS-Werkbank…`,
        run8086Refused: m => `Das 8086-Backend hat dieses Programm abgelehnt: ${m}`,
        run8086Failed: m => `Build für den 8086 fehlgeschlagen: ${m}`,
        run8086Empty: 'Schreibe zuerst Pseudocode.',
        // reference section headers
        h: {
            Structure: 'Struktur', EventsHats: 'Events (Hats)', Control: 'Steuerung',
            ClonesBroadcasts: 'Klone & Nachrichten', MotionLooks: 'Bewegung & Aussehen',
            DataLists: 'Daten & Listen', Expressions: 'Ausdrücke', Conditions: 'Bedingungen',
            CustomBlocks: 'Eigene Blöcke', PlaneteMaths: 'Planète Maths (Extension)',
            ArraysVectors: 'Arrays & Vektoren (Extension)', SensingMore: 'Fühlen & mehr',
            Statements: 'Anweisungen', Declare: 'Deklarieren (Pseudocode-Tab)', Pins: 'Pins',
            Notes: 'Hinweise', Profiles: 'Profile', LineNumbers: 'Zeilennummern', IO: 'Ein/Ausgabe',
            Overview: 'Übersicht', Verbs: 'Verben',
            Registers: 'Register', Workflow: 'Arbeitsablauf', Addressing: 'Adressierung',
            I8086: '8086 (MASM, hier assembliert)'
        }
    }
};
const pickLocale = loc => (loc && L10N[String(loc).slice(0, 2)] ? String(loc).slice(0, 2) : 'en');

/**
 * "Pseudocode" editor tab: the full SB3 Creator tool inside the editor.
 *  - load a built-in example
 *  - a collapsible syntax reference
 *  - upload SVGs and bake them in as sprite costumes
 *  - compile pseudocode into blocks and load it into the running VM
 *  - "From blocks": decompile the running project back into pseudocode (two-way)
 */

// Grouped catalogue of built-in examples (mirrors the standalone app).
const GROUPS = [
    {label: 'Games', items: [
        // The old shape-only Snake/Pong/Tetris/etc. mechanics remain available
        // in sb3-creator-examples.js for compiler regression coverage, but they
        // are not finished games and therefore do not belong in this gallery.
        // A game enters here only after an authored-art, onboarding, objective,
        // feedback, touch-control and live-VM audit.
        ['g2048', '✨ Nova Grid — polished'],
        ['sigil_grid', '☀️ Sigil Grid — solo / duo'],
        ['vector_seven', '🏓 Vector Seven — first to 7'],
        ['reactor_ricochet', '⚡ Reactor Ricochet — clear 20 cells'],
        ['flux_vault', '🔷 Flux Vault — 3 puzzle chambers'],
        ['neon_circuit', '💡 Neon Circuit — darken 3 boards'],
        ['canal_command', '🚢 Canal Command — lift 4 boats'],
        ['sky_skim', '🪽 Skyline Swoop — polished'],
        ['missile_ballet', '✈️ Contrail Panic — polished'],
        ['orbit_ward', '🛡️ Aegis Arc — polished'],
        ['chroma_code', '💎 Prism Lock — polished'],
        ['fusion_foundry', '☄️ Core Cascade — polished'],
        ['rooftop_relay', '🏃 Neon Relay — polished'],
        ['twinwall', '🪩 Rift Rally — polished'],
        ['turbo_chicane', '🏁 Slipstream Circuit — polished'],
        ['abyss_rescue', '🤿 Abyss Lift — polished'],
        ['specter_sweep', '🔮 Wardlight — polished'],
        ['moonlight_heist', '🐭 Pantry Prowl — polished'],
        ['cloud_court', '🏐 Nimbus Volley — polished'],
        ['ember_dojo', '⚔️ Ember Parry — polished'],
        ['lockstep_lagoon', '🌊 Tidegate Rush — polished'],
        ['rink_riot', '🏒 Blue-Line Breaker — polished'],
        ['rim_reactor', '🏀 Orbit Hoops — polished'],
        ['comet_cup', '☄️ Comet Strikers — polished'],
        ['trench_signal', '🛸 Echo Trench — polished'],
        ['whisker_switch', '🐭 Whisker Relay — polished'],
        ['spiral_circuit', '🌀 Helix Rush — polished'],
        ['lilyway_rescue', '🐸 Moonbank Hop — polished'],
        ['rotor_rogue', '🏍️ Crosswind Courier — polished'],
        ['prism_spire', '🏗️ Lumen Stack — polished'],
        ['shard_sheriff', '🩸 Plasma Posse — polished'],
        ['halo_foundry', '🛡️ Halo Lockdown — polished'],
        ['corridor_kestrel', '🛸 Carrier Kestrel — polished'],
        ['thunder_volley', '⚡ Skycourt Surge — polished'],
        ['cascade_pair', '🌈 Chromafall Reactor — polished'],
        ['mooncoil_odyssey', '🌙 Cratercoil — polished'],
        ['cinder_thrust', '🚀 Magma Lift — polished'],
        ['triple_bingo', '🎲 Triple Bingo — 3 players, one screen']
    ]},
    {label: 'Demos', items: [
        ['game', '🎯 Complete Game'], ['art', '🎨 Digital Art'], ['physics', '⚡ Physics Demo'],
        ['animation', '🎞️ Animation & Sound'], ['educational', '📚 Educational Tool']
    ]},
    {label: 'Language basics', items: [
        ['motion', 'Motion'], ['looks', 'Looks'], ['sound', 'Sound'], ['pen', 'Pen'],
        ['sensing', 'Sensing'], ['control', 'Control'], ['operators', 'Operators']
    ]},
    {label: 'Extensions', items: [
        ['planetemaths', '🧮 Planète Maths'], ['arrays', '📐 Arrays & Vectors']
    ]},
    // The examples for the C target. Everything above is a Scratch program and compiles to
    // C only as "no equivalent" warnings; these declare real pins and build on SDCC.
    {label: 'Hardware (STC12 / 8051)', items: [
        ['stc_blink', '💡 Blink two LEDs'], ['stc_button', '🔘 Button'],
        ['stc_potentiometer', '🎛️ Potentiometer (ADC)'],
        ['stc_two_scripts', '⏱️ Two scripts at once'], ['stc_pwm_fade', '🌗 PWM fade']
    ]},
    // The 8086 examples compile to ASSEMBLY through our own assembler rather
    // than to C — there is no ia16 compiler in the service and this tier does
    // not need one. `i8086_blink` is deliberately the STC blink with its
    // DEVICE line changed and its two 8051-only lines removed, because that
    // is the claim the whole tier rests on.
    {label: 'Hardware (8086)', items: [
        ['i8086_blink', '💡 Blink, reseated from the 8051'],
        ['i8086_keypad', '⌨️ Keypad on an 8255'],
        ['i8086_events', '⏱️ Four scripts, preemptive'],
        ['i8086_analog', '🎛️ Analog in (ADC0809)'],
        ['i8086_counter', '🔢 Eight-digit display']
    ]}
];

// Section header keys map to L10N.h — the code snippet items stay English (they ARE code).
const SYNTAX = [
    ['Structure', ['SPRITE Name:', 'STAGE:', 'GLOBAL score / LOCAL hp', 'LIST inventory',
        'SHAPE rect 16 90 / circle 18', 'SHAPE art skyline-swoop/bird',
        'SHAPE polygon 20 0 40 40 0 40 #f53',
        'COSTUME walk2 / BACKDROP night', 'SOUND jump 660', '# comment']],
    ['EventsHats', ['WHEN flag clicked:', 'WHEN space key pressed:', 'WHEN sprite clicked:',
        'WHEN I receive "go":', 'WHEN I start as a clone:']],
    ['Control', ['FOREVER:', 'REPEAT 10:', 'REPEAT UNTIL x > 5:', 'IF cond THEN: / ELSE:',
        'wait until cond', 'stop all / stop this script']],
    ['ClonesBroadcasts', ['create clone of myself', 'create clone of Bullet', 'delete this clone',
        'broadcast "go"', 'broadcast "go" and wait']],
    ['MotionLooks', ['move 10 steps', 'go to x: 0 y: 0', 'glide 1 secs to x: 50 y: 0',
        'point towards mouse-pointer', 'set size to 80 / set ghost effect to 50']],
    ['DataLists', ['set score to 0', 'change score by 1', 'add 5 to nums',
        'delete all of nums', 'replace item 1 of nums with 9']],
    ['Expressions', ['(a + b) * c, 7 mod 3', 'pick random 1 to 10', 'round x, sqrt of x',
        '"Score: " join score', 'x position, size, timer, answer']],
    ['Conditions', ['a > b, a <= b, a = b', 'cond and cond / or / not cond',
        'touching Sprite / touching color #ff0000', 'key space pressed? / mouse down?', 'nums contains 3']],
    ['CustomBlocks', ['DEFINE draw box (col) (row):', 'DEFINE FAST render: (warp)',
        '<flag> = boolean parameter', 'call: draw box 3 4', 'params in body: go to x: col y: row']],
    ['PlaneteMaths', ['factorial of 5', 'sum of digits of 123', 'min of a and b / max of a and b',
        '2 to the power of 8', 'pi, euler', 'x is multiple of 3']],
    ['ArraysVectors', ['new array "v" = [1,2,3]  (0-based)', 'new array "v" = range 1 to 5',
        'push x to array "v" / set item i of array "v" to x', 'item i of array "v" / sum of array "v"',
        'largest / smallest / length / mean of array "v"', 'array "v" contains x / array "v" as text']],
    ['SensingMore', ['x position of Player', 'current year, day of week',
        'distance to mouse-pointer', 'set drag mode draggable', 'play note 60 for 0.5 beats, set tempo to 120']]
];

// What each tab is, as a FILE. Every tab can now be opened from and saved to
// disk, so each needs an extension, a MIME type and a default basename.
// `.py` is claimed by two tabs; openBwFile resolves that in favour of the tab
// you are already on, else the first match here (python).
const CODE_FILES = {
    pseudocode:  {ext: 'bw',  mime: 'text/plain',      base: 'program'},
    python:      {ext: 'py',  mime: 'text/x-python',   base: 'program'},
    javascript:  {ext: 'js',  mime: 'text/javascript', base: 'program'},
    c:           {ext: 'c',   mime: 'text/x-csrc',     base: 'program'},
    basic:       {ext: 'bas', mime: 'text/plain',      base: 'program'},
    asm:         {ext: 'asm', mime: 'text/plain',      base: 'program'},
    // main.py is not a preference: it is the name the Pico and the micro:bit
    // boot, and what deployToPico already hands over on non-Chromium.
    micropython: {ext: 'py',  mime: 'text/x-python',   base: 'main'}
};
const CODE_ACCEPT = [...new Set(Object.values(CODE_FILES).map(f => `.${f.ext}`)), '.s', '.lst'].join(',');

// The pseudocode buffer used to be the only thing kept across reloads, and it
// was kept wrong: the editor's onChange (setActiveCode) CLEARS every buffer
// except the one being typed in, so editing any other tab drove pseudocode to
// '' and wiped the save. Track the ACTIVE buffer instead — that is the one the
// user is actually working in, and it is never emptied by that rule.
const BW_AUTOSAVE_KEY = 'bw-code-autosave';
const BW_AUTOSAVE_MAX = 512 * 1024;   // localStorage is ~5MB total; don't hog it

const LANG_LABEL = {pseudocode: 'Pseudocode', python: 'Python', javascript: 'JavaScript', c: 'C', basic: 'BASIC', asm: 'ASM', micropython: 'micro:bit'};

const DEVICE_HELP = {
    microbit: 'Run MicroPython in the right-hand micro:bit simulator, use its A/B buttons and sensor sliders, or download a .hex for a real board.',
    calliopemini: 'Uses the micro:bit-compatible MicroPython editor and simulator. P0–P20 programs retarget directly; MakeCode Calliope imports keep the Calliope device identity.',
    arcade: 'Runs games on the 160×120 console in the right pane. Arrow keys and the on-screen pad move; Space/Z are A/B.',
    pybadge: 'Runs the Arcade game on a PyBadge-shaped 160×128 console with A/B, D-pad, NeoPixels, light and tilt controls.',
    'pybadge-lc': 'Runs the Arcade game on the compact PyBadge LC console. Its virtual GPIO keeps code runnable without inventing physical breakout pins.',
    samd51: 'Targets the generic ATSAMD51J19 pin vocabulary. It has no invented board peripherals; choose PyBadge for its screen, controls and sensors.',
    arduboy: 'Loads and runs an existing ATmega32U4 .hex in the Arduboy console. Brickwright does not claim to compile Arduboy firmware.',
    pico: 'Compiles bare-metal RP2040 code for the emulator, or deploys MicroPython main.py to a mounted Pico.',
    eater6502: 'Builds for the breadboard 6502 workstation: W65C22 VIA, ACIA serial, keyboard, OLED or VGA circuits and debugger.',
    z80: 'Builds for the Z80 bench with OUT0–OUT7 and IN0–IN7 latch/buffer pins and its machine debugger.',
    stm32f030: 'Compiles and emulates the light-tier STM32F030 target. Serial bootloader and SWD flashing actions appear for pseudocode.',
    default: 'Choose examples written for this exact board, edit code, convert supported constructs to Blocks, then run, emulate or flash using the actions shown for the target.'
};

const deviceHelp = id => DEVICE_HELP[id] || (/^(arduino|atmega|attiny)/.test(id || '') ?
    'Uses the AVR pin vocabulary and emulator. Open an example for this exact board; serial-bootloader targets also offer Flash to board.' :
    (/^stc/.test(id || '') ?
        'Compiles 8051/STC pseudocode, runs it in the chip emulator and offers the STC serial ISP flashing path.' : DEVICE_HELP.default));

// Languages you can compile back INTO blocks. C joined them once cToPseudocode landed:
// it reads both our own emitted C (which carries an `@bw` marker header, so the round-trip
// is exact) and hand-written firmware (pins from `#define LED1 P1_0`, polarity from the
// `LED_ON 0` idiom — every inference reported as a warning, never guessed silently).
// The one thing it will not do is invert the cooperative-scheduler form; it says so.
// DEVICE_CHIP_LABELS imported from ../../lib/device-labels.js
const TWO_WAY = new Set(['pseudocode', 'python', 'javascript', 'c', 'basic']);

const representationNotice = (lang, asmMode, locale) => {
    const de = /^de/i.test(locale || '');
    if (lang === 'micropython') return de ?
        'Generierte schreibgeschützte Vorschau • Blöcke → micro:bit Python • kein Rückweg' :
        'Generated read-only preview • Blocks → micro:bit Python • no reverse conversion';
    if (lang === 'asm') {
        if (asmMode === 'listing') return de ?
            'Generiertes schreibgeschütztes Listing • Compiler → ASM • kein Rückweg zu Blöcken' :
            'Generated read-only listing • compiler → ASM • no reverse conversion to Blocks';
        return de ?
            'Editierbarer ASM-Quelltext • assemblieren und ausführen • kein Rückweg zu Blöcken' :
            'Editable ASM source • assemble and run • no reverse conversion to Blocks';
    }
    const name = LANG_LABEL[lang] || lang;
    return de ?
        `Editierbarer ${name}-Quelltext • Umwandlung zu/von Blöcken nur für die unterstützte Teilmenge • Warnungen prüfen` :
        `Editable ${name} source • converts to/from Blocks only for the supported subset • review warnings`;
};

const classifyConversionWarnings = warnings => {
    const unsupported = [];
    const changed = [];
    for (const warning of warnings || []) {
        const text = String(warning);
        if (/unsupported|not represent|cannot|could not|no sprite named/i.test(text)) unsupported.push(text);
        else changed.push(text);
    }
    return {unsupported, changed};
};

// What the Python / JavaScript front-ends actually support (shown as the reference
// when those tabs are active, so you know what round-trips to blocks).
// Section header keys map to L10N.h — code snippets stay English (they ARE code).
const SUPPORTED = {
    python: [
        ['Structure', ['def when_flag_clicked():', 'def do_myblock(a, b):', 'x = 0 / xs = []  (module state)', 'when_flag_clicked()  (run)']],
        ['Control', ['if / elif / else:', 'while cond:  →  repeat until', 'while True:  →  forever', 'for _ in range(n):', 'return  →  stop this script']],
        ['Statements', ['x = expr  /  x += expr', 'print(x)  →  say', 'x = input(p)  →  ask', 'xs.append/insert/clear', 'del xs[i-1]  /  xs[i-1] = v']],
        ['Expressions', ['+ - * / %,  a == b → =', 'and / or / not', '_eq(a, b) (loose =)', 'random.randint(a, b)', 'len(x), math.floor(x), str()/int()']]
    ],
    javascript: [
        ['Structure', ['function when_flag_clicked() {}', 'function do_myblock(a, b) {}', 'let x = 0;  let xs = [];', 'when_flag_clicked();  // run']],
        ['Control', ['if / else', 'while (cond)  →  repeat until', 'while (true)  →  forever', 'for (let i=0; i<n; i++)', 'return;  →  stop this script']],
        ['Statements', ['x = expr;  /  x += expr;', 'console.log(x)  →  say', 'prompt(p)  →  ask', 'xs.push/splice, xs.length', 'xs[i-1] = v']],
        ['Expressions', ['+ - * / %,  === → =', '&& / || / !', '_eq(a, b), _rand(a, b)', 'String()/Number()', 'Math.floor(x), arr[i-1]']]
    ],
    c: [
        ['Declare', ['DEVICE STC12C5A60S2', 'CLOCK 11059200  /  CLOCK 12 MHz',
            'PIN led = P1.0 OUTPUT ACTIVE LOW', 'PIN pot = P1.3 ANALOG   (ADC n is on P1.n)', 'PIN btn = P3.2 INPUT']],
        ['Pins', ['turn on led / turn off led', 'set led high / set led low', 'toggle led', 'read pot   (reporter or condition)']],
        ['Control', ['WHEN flag clicked:  → one script, or', 'several → cooperative tasks',
            'FOREVER / REPEAT n / REPEAT UNTIL', 'IF … THEN / ELSE', 'wait n seconds, wait until, stop']],
        ['Notes', ['Timer 0 at FOSC/12 — never a cycle-counted delay',
            'ACTIVE LOW: “turn on” writes a 0', 'variables are 16-bit ints',
            'motion/looks/sound → /* comments */', 'chips: stc12c5a60s2 · stc12c5a16s2 · stc89c52(rc) · stc15f2k60s2']]
    ],
    basic: [
        ['Profiles', ['BBC BASIC (default): REPEAT/UNTIL, PROC, TIME',
            '6502 BASIC: GOTO, PEEK/POKE, two-char names']],
        ['LineNumbers', ['On (default): 10 REM … / 20 LET … / 30 GOTO',
            'Off (BBC structured): no numbers, IF/ENDIF, WHILE/ENDWHILE',
            '6502 BASIC always uses line numbers']],
        ['Control', ['FOR/NEXT, REPEAT/UNTIL (BBC), WHILE/WEND (6502)',
            'IF/THEN/ELSE/ENDIF (structured) or IF … GOTO (numbered)',
            'PROC/ENDPROC (BBC custom blocks)']],
        ['IO', ['PRINT, INPUT (ask)', 'REM (comments)',
            'Refusals: multi-WHEN, pen, clones → shown as reasons']]
    ],
    asm: [
        ['Workflow', ['Source mode: write, assemble, run',
            'Listing mode: view compiled disassembly',
            'Hosted: 8051 (sdas8051), 6502 (ca65), Z80 (sdasz80), AVR (avr-as)',
            'In this browser: 8086/8088 (MASM subset) — no network']],
        ['Registers', ['A, B, DPTR, SP, PSW (8051)',
            'R0–R7 (register bank), SFRs',
            'Carry (C), Overflow (OV), Parity (P)']],
        ['Addressing', ['MOV A, #imm / MOV A, addr',
            'MOV @R0, A (indirect)', 'MOVC A, @A+DPTR (code memory)',
            'SJMP / LJMP / AJMP, LCALL / ACALL']],
        // The 8086 is a different assembler, a different syntax and a
        // different machine underneath; folding it into the 8051 rows above
        // would have made a reference that is wrong for both.
        ['I8086', ['.MODEL SMALL / .STACK / .DATA / .CODE',
            'PROC … ENDP, MACRO … ENDM, END <entry>',
            'MOV AX, @DATA / MOV DS, AX  (an .EXE needs it)',
            'INT 21h: AH=02h char, 09h string ($-ended), 4Ch exit',
            'INT 10h: AH=0Eh teletype, 09h char+attribute, 02h cursor',
            'Output is the CGA text page — no serial console here',
            'No 80186+: SHL AX,4 is expanded and warns; no 8087',
            'No keyboard yet: a program that waits for one will sit there']]
    ],
    micropython: [
        ['Overview', ['MicroPython for micro:bit v2',
            'from microbit import * (auto-generated)',
            'Generators as cooperative scheduler (yield ms)']],
        ['Verbs', ['display.scroll() — show text on LEDs',
            'print() — serial output',
            'say/think → stage speech (degraded)']],
        ['Pins', ['PIN led = P0 OUTPUT → pin0.write_digital()',
            'ACTIVE LOW inverts on/off',
            'read pin → pin0.read_digital/read_analog()']],
        ['Control', ['Multi-WHEN → generator tasks + round-robin driver',
            'yield ms at every wait/loop back-edge',
            'button_a / button_b (key a/b → micro:bit buttons)']]
    ]
};

// Web Worker bodies for the sandboxed (non-interactive) runner. They run off the
// main thread so a runaway/`forever` loop can be `terminate()`d on a timeout instead
// of freezing the tab. Neither has a real `prompt`/`input` — interactive programs take
// the main-thread path instead. Kept as plain-ES5 strings so they need no transpile.
const JS_WORKER = [
    'self.onmessage = function (e) {',
    '  var log = function () {',
    '    var a = Array.prototype.slice.call(arguments);',
    '    self.postMessage({type: "out", text: a.map(function (x) {',
    '      return typeof x === "string" ? x : JSON.stringify(x);',
    '    }).join(" ") + "\\n"});',
    '  };',
    '  var console = {log: log, error: log, warn: log, info: log};',
    '  var prompt = function () { return ""; };',
    '  try {',
    '    (new Function("console", "prompt", e.data.code))(console, prompt);',
    '    self.postMessage({type: "done"});',
    '  } catch (err) { self.postMessage({type: "error", text: String(err && err.message || err)}); }',
    '};'
].join('\n');

// Appended after the injected Skulpt sources to form the Python worker.
const PY_WORKER = [
    'self.onmessage = function (e) {',
    '  Sk.configure({',
    '    output: function (t) { self.postMessage({type: "out", text: t}); },',
    '    read: function (f) {',
    '      if (Sk.builtinFiles && Sk.builtinFiles.files[f]) return Sk.builtinFiles.files[f];',
    '      throw new Error("module " + f + " not found");',
    '    },',
    '    inputfun: function () { return ""; },',
    '    inputfunTakesPrompt: true,',
    '    __future__: Sk.python3',
    '  });',
    '  Sk.misceval.asyncToPromise(function () {',
    '    return Sk.importMainWithBody("<brickwright>", false, e.data.code, true);',
    '  }).then(function () { self.postMessage({type: "done"}); })',
    '    .catch(function (err) { self.postMessage({type: "error", text: String(err && err.message || err)}); });',
    '};'
].join('\n');

// ── CodeMirror 6 editor (lazy-loaded) ──────────────────────────────
// The CM chunk (~600 KB) loads when this tab is first SHOWN — not when it
// mounts. gui.jsx force-renders every TabPanel, so this component mounts on
// every first paint; `isVisible` (the tab is selected) is what gates the
// editor and the example sources. Until then the FallbackEditor textarea
// stands in, so the tab's DOM exists for anything that looks for it.
// Blocks-only users never download either chunk.
const CMEditor = React.lazy(() =>
    import(/* webpackChunkName: "bw-codemirror" */ '../../lib/codemirror-editor.jsx')
);

// ── VDU terminal for BBC BASIC graphics (lazy-loaded) ──────────────
const VduTerminal = React.lazy(() =>
    import(/* webpackChunkName: "bw-vdu-terminal" */ './vdu-terminal.jsx')
);

// Fallback while the CM chunk loads — a plain textarea that matches the old editor
// closely enough to prevent layout jump. Also used if CM fails to load.
const FallbackEditor = ({value, onChange, readOnly}) => (
    <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        readOnly={readOnly}
        spellCheck={false}
        style={{
            flex: '1 1 0', minHeight: 0, width: '100%', resize: 'none',
            fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace',
            fontSize: 13, lineHeight: '1.5', padding: 12,
            border: '1px solid #cbd5e1', borderRadius: 8,
            boxSizing: 'border-box'
        }}
    />
);

class PseudocodeImporter extends React.Component {
    constructor (props) {
        super(props);
        // One buffer per language tab. Editing the active tab clears the others so
        // switching tabs always re-derives them from the latest edit — you can never
        // end up with (say) pseudocode sitting in the Python tab.
        this.state = {revealed: props.isVisible !== false, lang: 'pseudocode', importedPython: false,
            buffers: {pseudocode: '', python: '', javascript: '', c: '', basic: '', asm: '', micropython: ''},
            basicProfile: 'bbc', basicLineNumbers: true,
            uploads: [], status: '', conversionReport: null, reportExpanded: false, busy: false, showRef: false, showInfo: false,
            showRepresentation: true,
            showArt: false, output: null, running: false,
            // Hardware-extension codegen options (see reference/runtime-drivers.md): the emitted
            // driver (shim / remote / on-brick), plus async/await and event-hat switches.
            driverMode: 'shim', asyncMode: false, eventsMode: false,
            // Editor maximize: collapses reference/art panels and hides the right stage pane
            maximized: false,
            // micro:bit debug granularity: 'block' (marker debugger on stock firmware,
            // the lightweight default) or 'line' (settrace line-level on the debug firmware).
            debugLevel: (() => { try { return localStorage.getItem('bw-microbit-debug-level') === 'line' ? 'line' : 'block'; } catch { return 'block'; } })(),
            // ASM tab mode: 'source' = editable author buffer, 'listing' = read-only disassembly
            asmMode: 'source',
            // ASM listing line map from the compile service (addr/file/line triples).
            // Future current-PC highlight will drive setHighlightedLine via this.
            asmLineMap: null,
            // ASM listing buffer (separate from the editable asm buffer)
            asmListing: '',
            // Catalog examples (examples/index.json — same file the Circuit tab's
            // gallery loads). Fetched once, on demand, when a chip is selected:
            // the "Load example…" control then lists catalog programs for that
            // device instead of the built-in stage games.
            catalog: null, catalogError: null, showCatalog: false, exampleFilter: '', actionsOpen: false,
            bundledExamplesStatus: 'idle'};
        this._cmEditor = null;
        // Cache compiled ASM by source hash so tab switching doesn't recompile.
        this._asmCache = {hash: null, asm: '', lineMap: null};
        this.handleFiles = this.handleFiles.bind(this);
        this.openMakeCodeShare = this.openMakeCodeShare.bind(this);
        this.exportMakeCode = this.exportMakeCode.bind(this);
        this.compile = this.compile.bind(this);
        this.fromBlocks = this.fromBlocks.bind(this);
        this.loadExample = this.loadExample.bind(this);
        this._loadBundledExamples = this._loadBundledExamples.bind(this);
        this.run = this.run.bind(this);
        this.switchTab = this.switchTab.bind(this);
        this.flashMicrobitSim = this.flashMicrobitSim.bind(this);
        this.flashMicrobitSimDebug = this.flashMicrobitSimDebug.bind(this);
        this.deployToPico = this.deployToPico.bind(this);
        this.flashToBoard = this.flashToBoard.bind(this);
        this.flashStm32ViaSwd = this.flashStm32ViaSwd.bind(this);
        this.runPseudocodeOn8086 = this.runPseudocodeOn8086.bind(this);
        this.openCodeFile = this.openCodeFile.bind(this);
        this.saveCodeFile = this.saveCodeFile.bind(this);
        this._autosaveTimer = null;
    }

    componentDidMount () {
        this._unmounted = false;
        // CodeMirror arrives when the tab is first shown (_reveal), not now:
        // every TabPanel is force-rendered, so "mounted" is every first paint.
        // Bundled examples wait for the no-device Tools menu or a real source
        // consumer such as restored-game control discovery.
        if (this.state.revealed) this._reveal();
        // Pick up pseudocode from an example loaded via the Circuit tab.
        // loadExampleProgram stores the source on vm.runtime.bwPseudocodeSource
        // and emits PROJECT_CHANGED; we read it here so the Code tab fills.
        const vm = this.props.vm;
        if (vm && vm.runtime) {
            this._onProjectChanged = () => {
                const src = vm.runtime.bwPseudocodeSource;
                if (src && src !== this.state.buffers.pseudocode) {
                    this._publishControlsFor(src);
                    this.setState(s => ({
                        lang: 'pseudocode',
                        buffers: {...s.buffers, pseudocode: src}
                    }));
                    delete vm.runtime.bwPseudocodeSource;
                }
            };
            vm.runtime.on('PROJECT_CHANGED', this._onProjectChanged);
        }
        // Bring back whatever was in the editor when the tab was last closed.
        // Only when EVERY buffer is empty: an example loaded through the
        // Circuit tab (above) or a restored project must win over the autosave.
        if (!Object.values(this.state.buffers).some(b => b && b.trim())) {
            const saved = this.readAutosave();
            if (saved) {
                this._publishControlsFor(saved.code);
                this.setState(st => ({
                    lang: saved.lang,
                    buffers: {...st.buffers, [saved.lang]: saved.code},
                    status: this.L.restored(LANG_LABEL[saved.lang] || saved.lang)
                }));
            }
        }
        // If a device is already set (e.g. from a loaded project), fetch the
        // lightweight catalog metadata used to filter the device picker.
        const device = this.currentDevice();
        if (device) {
            this.loadCatalog();
        }
        // Project save/load (lib/bw-project-bundle.js). COLLECT: the autosave
        // is debounced 600 ms, so a save right after typing would carry the
        // buffer minus the last keystrokes — flush synchronously. LOADED: the
        // restored autosave is in localStorage but this mounted editor still
        // shows the old buffer; a loaded PROJECT wins over anything unsaved.
        this._onBundleCollect = () => {
            if (this._autosaveTimer) {
                clearTimeout(this._autosaveTimer);
                this._autosaveTimer = null;
            }
            this.writeAutosave();
        };
        window.addEventListener('bw-project-bundle-collect', this._onBundleCollect);
        this._onBundleLoaded = event => {
            // A REFUSED sidecar is the case that PRESERVES what was already
            // here, so readAutosave() succeeds precisely when the refusal
            // notice matters most. Computing it after `if (saved)` therefore
            // made the notice unreachable for every learner who had anything
            // to preserve: the buffers came back and nothing said the file had
            // not been applied. Refusal wins the status line; the restore
            // still happens.
            const outcome = event?.detail?.outcome;
            const refused = outcome === 'future' || outcome === 'invalid' ||
                outcome === 'storage-failed';
            // The status line below is the Code tab's own surface, and opening a
            // project changes the active tab — so on its own the notice is
            // written where the learner is no longer looking (measured: the text
            // was present and HIDDEN). Raise it on the app-level alert surface
            // too, which gui.jsx mounts outside the tab strip; the status line
            // stays for anyone who IS on this tab.
            const REFUSAL_ALERTS = ['bwBundleRefusedFuture', 'bwBundleRefusedInvalid',
                'bwBundleRefusedStorage'];
            if (refused && this.props.dispatch) {
                const alertId = outcome === 'future' ? 'bwBundleRefusedFuture' :
                    outcome === 'storage-failed' ? 'bwBundleRefusedStorage' : 'bwBundleRefusedInvalid';
                try { this.props.dispatch(showStandardAlert(alertId)); } catch (e) { /* never break the load */ }
            } else if (this.props.dispatch) {
                // A refusal notice must not outlive the refusal. Each alert's clearList retires
                // the OTHER two, so a second bad file replaces the first notice — but a good load
                // raises nothing and so cleared nothing, and the stale banner then said "what you
                // had is still here" over a project whose surfaces had just been replaced. Seen in
                // the CP6 vanilla-cleared screenshot: empty Code, no widgets, no chip, and a notice
                // claiming everything had been preserved.
                for (const alertId of REFUSAL_ALERTS) {
                    try { this.props.dispatch(closeAlertWithId(alertId)); } catch (e) { /* never break the load */ }
                }
            }
            const refusal = () => {
                const version = event.detail.version ? ` v${event.detail.version}` : '';
                const reason = event.detail.reason || event.detail.report?.action || outcome;
                return `Project blocks loaded; Brickwright state${version} was not applied: ${reason}`;
            };
            const saved = this.readAutosave();
            if (saved) {
                this._publishControlsFor(saved.code);
                this.setState(st => ({
                    lang: saved.lang,
                    buffers: {...st.buffers, [saved.lang]: saved.code},
                    status: refused
                        ? refusal()
                        : this.L.restored(LANG_LABEL[saved.lang] || saved.lang)
                }));
            } else if (outcome === 'legacy' || outcome === 'loaded') {
                this.publishGameControls(null);
                this.setState({
                    lang: 'pseudocode',
                    buffers: {pseudocode: '', python: '', javascript: '', c: '', basic: '',
                        asm: '', micropython: ''},
                    status: ''
                });
            } else if (refused) {
                this.setState({status: refusal()});
            }
        };
        window.addEventListener('bw-project-bundle-loaded', this._onBundleLoaded);
    }

    /**
     * Publish game controls for a source once the example sources it is matched
     * against exist. Publishes null for a non-game, as the synchronous version
     * did, so loading a plain program after a game still clears the controls.
     * @param {string} source - pseudocode
     */
    _publishControlsFor (source) {
        if (!source) return;
        loadExamples().then(() => {
            if (this._unmounted) return;
            this.publishGameControls(this.gameKeyForSource(source));
        }).catch(() => {
            if (!this._unmounted) this.publishGameControls(null);
        });
    }

    /** Load the no-device picker on demand, with retry and stale-request guards. */
    _loadBundledExamples () {
        if (examplesReady) {
            if (!this._unmounted && this.state.bundledExamplesStatus !== 'ready') {
                this.setState({bundledExamplesStatus: 'ready'});
            }
            return Promise.resolve(examples);
        }
        const request = loadExamples();
        this._examplesLoadRequest = request;
        if (this.state.bundledExamplesStatus !== 'loading') {
            this.setState({bundledExamplesStatus: 'loading'});
        }
        return request.then(loaded => {
            if (!this._unmounted && this._examplesLoadRequest === request) {
                this.setState({bundledExamplesStatus: 'ready'});
            }
            return loaded;
        }, () => {
            if (!this._unmounted && this._examplesLoadRequest === request) {
                this.setState({bundledExamplesStatus: 'error'});
            }
            return null;
        });
    }

    /** The tab is (or has been) shown: reveal the editor, not its Tools payload. */
    _reveal () {
        if (this._revealing) return;
        this._revealing = true;
        if (!this.state.revealed) this.setState({revealed: true});
    }

    componentDidUpdate (prevProps, prevState) {
        if (this.props.isVisible && !this.state.revealed) this._reveal();
        // Tools may have opened while a hardware device was selected. If the
        // user then chooses "none" without closing it, onToggle does not fire
        // again; this transition still has to wake the bundled picker.
        if (this.state.actionsOpen && !this.currentDevice() &&
            this.state.bundledExamplesStatus === 'idle') {
            this._loadBundledExamples();
        }
        // Debounced so a fast typist writes localStorage once per pause, not
        // once per keystroke. Watches the ACTIVE tab, both its language and
        // its text, so switching tabs re-saves under the new language.
        if (prevState.lang !== this.state.lang ||
            prevState.buffers[this.state.lang] !== this.state.buffers[this.state.lang]) {
            if (this._autosaveTimer) clearTimeout(this._autosaveTimer);
            this._autosaveTimer = setTimeout(() => {
                this._autosaveTimer = null;
                this.writeAutosave();
            }, 600);
        }
    }

    readAutosave () {
        try {
            const raw = localStorage.getItem(BW_AUTOSAVE_KEY);
            if (!raw) return null;
            const v = JSON.parse(raw);
            if (!v || !CODE_FILES[v.lang] || typeof v.code !== 'string' || !v.code.trim()) return null;
            return v;
        } catch { return null; }   // absent, unparseable, or a shape we no longer write
    }

    writeAutosave () {
        const lang = this.state.lang;
        const code = this.state.buffers[lang] || '';
        try {
            if (!code.trim()) {
                // Only drop the record if it is THIS tab's — emptying the C tab
                // must not throw away saved pseudocode.
                const cur = this.readAutosave();
                if (cur && cur.lang === lang) localStorage.removeItem(BW_AUTOSAVE_KEY);
            } else if (code.length <= BW_AUTOSAVE_MAX) {
                localStorage.setItem(BW_AUTOSAVE_KEY, JSON.stringify({lang, code}));
            }
        } catch { /* private mode, or the quota is full: autosave is a courtesy */ }
    }

    /** Which tab owns a filename, preferring the one already open (.py is shared). */
    langForFile (name) {
        const ext = (String(name).match(/\.([^.]+)$/) || [])[1];
        if (!ext) return null;
        const e = ext.toLowerCase();
        if (e === 's') return 'asm';           // gas-style suffix
        if (e === 'lst') return 'asm';
        if (CODE_FILES[this.state.lang] && CODE_FILES[this.state.lang].ext === e) return this.state.lang;
        return Object.keys(CODE_FILES).find(k => CODE_FILES[k].ext === e) || null;
    }

    // Open a source file from disk into the tab that owns its extension. A
    // plain file input rather than showOpenFilePicker: that API is
    // Chromium-only and this has to work in Safari too, which is the same
    // reason deployToPico falls back to downloading main.py.
    openCodeFile (e) {
        const file = (e.target.files || [])[0];
        e.target.value = '';           // so re-opening the same file fires again
        if (!file) return;
        this.publishGameControls(null);
        this._makeCodeProject = null;
        // A compiled artefact from ANOTHER editor — a MakeCode .hex/.uf2/.png
        // cartridge, or a MicroPython .hex — is not source we can read as
        // text, but it is not opaque either: both formats carry the project
        // inside them. That import is its own path.
        if (isImportableArtefact(file.name)) {
            this.openArtefactFile(file);
            return;
        }
        const lang = this.langForFile(file.name);
        if (!lang) {
            this.setState({status: this.L.openBad(file.name)});
            return;
        }
        const reader = new FileReader();
        reader.onload = () => this.setState(st => ({
            lang,
            // Same exclusivity the editor's own onChange uses: one authored
            // buffer at a time, so a stale translation of the PREVIOUS source
            // cannot sit in another tab pretending to match.
            buffers: {pseudocode: '', python: '', javascript: '', c: '', basic: '',
                asm: '', micropython: '', [lang]: String(reader.result)},
            asmMode: lang === 'asm' ? 'source' : st.asmMode,
            output: null,
            status: this.L.openDone(file.name, LANG_LABEL[lang] || lang)
        }));
        reader.readAsText(file);
    }

    /**
     * Import a compiled artefact from another editor.
     *
     * Three outcomes, and the status line tells the user which one they
     * got, because the difference matters to what they can do next:
     * a MicroPython hex is a program our simulator RUNS; a MakeCode
     * micro:bit project is source we can read and translate; a MakeCode
     * Arcade game is translated into sprites and opens on the 160x120
     * console surface; unsupported engine features remain explicitly listed.
     *
     * The importer is loaded on demand: it carries an LZMA decoder and a
     * PNG decoder that no other part of the app needs, and nobody should
     * pay for them until they open a .hex.
     */
    /**
     * Hand a compiled AVR program to the Arduboy pane and show it.
     *
     * The pane may not be mounted yet — switching the dock and loading the
     * program are one gesture — so the program is parked on the window for
     * the pane to collect on mount, as well as announced for a pane that
     * is already there.
     */
    runArduboyProgram (hex, label) {
        try {
            window.__bwArduboyPending = {hex, name: label};
            localStorage.setItem('bw-stage-circuit', '1');
            localStorage.setItem('bw-debug-dock', 'arduboy');
            // The right pane must be OPEN, not merely mounted, or the
            // console is in the DOM and invisible — the same trap the
            // controller dock documents.
            localStorage.setItem('bw-right-pane-hidden', '0');
            window.dispatchEvent(new CustomEvent('bw-settings-change', {
                detail: {key: 'bw-right-pane-hidden', value: '0'}
            }));
            window.dispatchEvent(new CustomEvent('bw-settings-change', {
                detail: {key: 'bw-debug-dock', value: 'arduboy'}
            }));
            window.dispatchEvent(new CustomEvent('bw-arduboy-load', {detail: {hex, name: label}}));
            this.setState({status: this.L.arduboyRunning(label)});
        } catch (e) {
            this.setState({status: this.L.mcFailed(label, (e && e.message) || String(e))});
        }
    }

    /**
     * Build a .hex a real micro:bit or Calliope will run, and download it.
     *
     * MicroPython is interpreted, so there is nothing to compile and no
     * server to ask: a flashable image is the RUNTIME with the script
     * appended at 0x3E000. The only thing we do not have is the runtime,
     * and it is 1.8 MB — too big to bundle into an app whose whole first
     * paint is 3.8 MB, and not ours to fetch by name at click time.
     *
     * So it is asked for once and kept for the session. Two ways to
     * supply it, and the second is why this is not a nuisance:
     *
     *   - pick a MicroPython .hex (python.microbit.org, uflash, or the
     *     one that came with the board), or
     *   - simply IMPORT one first — a downloaded MicroPython hex is
     *     runtime + script, so opening one to read its Python already
     *     hands us the runtime, and this button then needs nothing.
     */
    async downloadMicrobitHex () {
        const script = this.state.buffers.micropython || '';
        if (!script.trim()) {
            this.setState({status: this.L.mcExportEmpty});
            return;
        }
        let firmware = this._microbitFirmwareHex;
        if (!firmware) {
            firmware = await this._askForFirmware();
            if (!firmware) return;                 // cancelled; status already set
            this._microbitFirmwareHex = firmware;
        }
        try {
            const {appendScript} = await import(
                /* webpackChunkName: "bw-makecode" */ '../../lib/bw-makecode/micropython-hex.js');
            const hex = appendScript(firmware, script);
            const name = `${(this.currentStc()?.device || 'microbit').toLowerCase()}-program.hex`;
            this._download(name, hex, 'application/octet-stream');
            this.setState({status: this.L.microbitHexReady(name)});
        } catch (e) {
            this.setState({status: this.L.mcFailed('hex', (e && e.message) || String(e))});
        }
    }

    /** One file prompt for the MicroPython runtime. Resolves null if cancelled. */
    _askForFirmware () {
        return new Promise(resolve => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.hex';
            input.onchange = () => {
                const file = input.files && input.files[0];
                if (!file) { resolve(null); return; }
                const reader = new FileReader();
                reader.onload = () => {
                    const text = String(reader.result || '');
                    // Refuse anything that is not a hex here rather than
                    // letting appendScript emit a file the board rejects.
                    if (!/^\s*:[0-9A-Fa-f]{8}/.test(text)) {
                        this.setState({status: this.L.microbitFirmwareBad(file.name)});
                        resolve(null);
                        return;
                    }
                    resolve(text);
                };
                reader.onerror = () => resolve(null);
                reader.readAsText(file);
            };
            // A cancelled picker fires no event at all, so nothing is
            // pending afterwards — the promise simply never settles, which
            // is correct: no download, no status change, no error.
            input.click();
            this.setState({status: this.L.microbitNeedFirmware});
        });
    }

    /** Hand the browser a file. */
    _download (name, text, type) {
        const url = URL.createObjectURL(new Blob([text], {type: type || 'text/plain'}));
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    /**
     * WHICH DEVICE THE ASM TAB IS WRITING FOR.
     *
     * This used to read `currentStc().device` alone, and that is only ever
     * populated by a COMPILE — so a device the user had just chosen from the
     * picker did not reach this tab until they had also compiled something,
     * and for the 8086 (no blocks path, so nothing to compile) it would never
     * have arrived at all. The DEVICE line in the pseudocode buffer is what
     * `setDevice` writes immediately, so it is asked first; `stc.device` is
     * the fallback for a project that arrived without one (an imported .sb3,
     * a machine-class example), and the runtime's published id/core after
     * that, which is how a CPU seated on the circuit board reaches here.
     *
     * One resolution, used by BOTH the example list and the ▶ button: two
     * different answers in one tab is how a program gets assembled for a
     * device the examples were not written for.
     */
    _asmDevice () {
        const stc = this.currentStc();
        const rt = this.props.vm && this.props.vm.runtime;
        return this.currentDevice() ||
            (stc && stc.device) ||
            (rt && (rt.bwDeviceId || rt.bwDeviceCore)) || '';
    }

    /** Starter programs for the selected device, or none. */
    _asmExamples () {
        return asmExamplesFor(this._asmDevice());
    }

    /**
     * The attribution the shipped examples travel under, or null when the
     * current device's examples were written here.
     *
     * Rendered beside the picker rather than kept in a notices file: MIT asks
     * for the notice to accompany the code, and a learner who never opens
     * THIRD-PARTY-NOTICES.md has still been shown who wrote the program they
     * are reading.
     */
    _asmCredit () {
        const ex = this._asmExamples().find(e => e.attribution);
        return ex ? ex.attribution : null;
    }

    /**
     * Load a starter program into the ASM editor.
     *
     * It replaces the buffer rather than appending, and asks first when
     * there is work there — an example that silently eats what someone
     * typed is worse than no example.
     */
    loadAsmExample (id) {
        if (!id) return;
        const example = this._asmExamples().find(e => e.id === id);
        if (!example) return;
        const current = (this.state.buffers.asm || '').trim();
        if (current && !window.confirm(this.L.asmExampleReplace)) return;
        this.setState(state => ({
            buffers: {...state.buffers, asm: example.source},
            asmMode: 'source',
            status: this.L.asmExampleLoaded(
                pickLocale(this.props.locale) === 'de' ? example.labelDe : example.label)
        }));
    }

    openArtefactFile (file) {
        this.setState({status: this.L.mcReading(file.name)});
        const reader = new FileReader();
        reader.onload = async () => {
            let res;
            try {
                const {importArtefact} = await import(
                    /* webpackChunkName: "bw-makecode" */ '../../lib/bw-makecode/index.js');
                res = await importArtefact(new Uint8Array(reader.result), {name: file.name});
            } catch (err) {
                this.setState({status: err && err.code === 'NO_EMBEDDED_SOURCE' ?
                    this.L.mcNoSource(file.name, err.format) :
                    this.L.mcFailed(file.name, (err && err.message) || String(err))});
                return;
            }
            // A downloaded MicroPython hex is runtime + script, so importing
            // one to read its Python also hands us the runtime the flash
            // button needs. Keeping it here means that button never has to
            // ask.
            if (res && res.kind === 'micropython') {
                try {
                    this._microbitFirmwareHex = new TextDecoder().decode(
                        new Uint8Array(reader.result));
                } catch (e) { /* not text; the button will ask instead */ }
            }
            this.applyMakeCodeImport(res, file.name);
        };
        reader.onerror = () => this.setState({status: this.L.mcFailed(file.name, 'read error')});
        reader.readAsArrayBuffer(file);
    }

    /**
     * Land an imported MakeCode project in the editor.
     *
     * Shared by the file importer and the share-link importer, because a
     * project is a project however it arrived — and because the status
     * line has to say which of three things happened, which is exactly
     * the part worth having in one place.
     */
    applyMakeCodeImport (res, label) {
        // Whatever arrived, the previous project's touch controls are gone.
        this.publishGameControls(null);

        // An AVR hex is not a project to translate — it is a program to
        // RUN. Nothing in it can become blocks (it is compiled C++), so it
        // goes straight to the console pane rather than through any of the
        // machinery below.
        if (res.kind === 'avr-hex') {
            this.runArduboyProgram(res.hex, label);
            return;
        }

        // What the "MakeCode source" download hands back: the recovered
        // files themselves, untouched by any translation.
        this._makeCodeProject = res.kind === 'makecode' ? {
            files: res.files,
            name: res.project.name || String(label).replace(/\.[^.]+$/, ''),
            target: res.project.target
        } : null;
        const unsupported = (res.unsupported || []).length;
        const arcade = res.project.target === 'arcade';
        let status;
        if (res.kind === 'micropython') {
            status = this.L.mcPython(label, Object.keys(res.files).join(', '));
        } else if (arcade) {
            // The button's own label, not a copy of it: a glyph typed here
            // drifts the moment the button changes — and this call went out
            // one argument short, which is how "Press undefined to build"
            // reached a green build.
            status = this.L.mcArcade(label, res.project.name,
                (res.sprites || []).length, (res.costumes || []).length, this.L.toBlocks);
        } else {
            status = unsupported ?
                this.L.mcPartial(label, res.project.name, unsupported) :
                this.L.mcMicrobit(label, res.project.name);
        }
        this.setState({
            lang: res.lang,
            importedPython: res.kind === 'micropython',
            // Same exclusivity openCodeFile keeps: one authored buffer, so
            // no stale translation of a previous source can masquerade.
            buffers: {pseudocode: '', python: '', javascript: '', c: '', basic: '',
                asm: '', micropython: '', [res.lang]: res.code},
            // The game's artwork rides the same route as an SVG the user
            // drops in themselves: compile() applies `uploads` to the
            // sprites it just parsed, so the costumes land with the code.
            uploads: (res.costumes || []).map(costume => ({
                sprite: costume.sprite,
                filename: `${costume.name}.svg`,
                svg: costume.svg,
                mode: costume.mode || 'replace'
            })),
            output: null,
            status
        });
    }

    /**
     * Import from a MakeCode share link — the same project, without the
     * binary. Needs the network, which is why it sits BESIDE the file
     * importer rather than replacing it: the packaged app and a school
     * laptop with no internet still have the .hex.
     */
    async openMakeCodeShare () {
        let url;
        try {
            url = window.prompt(this.L.mcSharePrompt, '');
        } catch (e) {
            url = null;
        }
        if (!url || !url.trim()) return;
        this.setState({status: this.L.mcShareLoading});
        try {
            const {importShareLink} = await import(
                /* webpackChunkName: "bw-makecode" */ '../../lib/bw-makecode/index.js');
            const res = await importShareLink(url.trim());
            this.applyMakeCodeImport(res, res.project.name || url.trim());
        } catch (err) {
            this.setState({status: this.L.mcFailed(url.trim(), (err && err.message) || String(err))});
        }
    }

    /**
     * Save this project as a .hex makecode.microbit.org will import.
     *
     * MakeCode's importer does not read the machine code in a .hex — it
     * scans for the source-embedding header and opens the project inside.
     * So a hex carrying nothing but that embed is a valid MakeCode
     * project file, and this is the one export that lands as a PROJECT
     * over there rather than as text to paste.
     */
    async exportMakeCode () {
        const source = this.state.buffers.pseudocode || '';
        if (!source.trim()) { this.setState({status: this.L.mcExportEmpty}); return; }
        this.setState({busy: true});
        try {
            const SB3Creator = (await this.lib()).default;
            const creator = new SB3Creator();
            const project = creator.parse(source);
            const {exportToMakeCode} = await import(
                /* webpackChunkName: "bw-makecode" */ '../../lib/bw-makecode/index.js');
            const name = (source.match(/^#\s*(.+)$/m) || [])[1] || 'brickwright';
            const out = exportToMakeCode(project, {name: name.trim().slice(0, 40)});
            const url = URL.createObjectURL(new Blob([out.hex], {type: 'application/octet-stream'}));
            const a = document.createElement('a');
            a.href = url;
            a.download = out.filename;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 5000);
            this.setState({busy: false, status: this.L.mcExportDone(out.filename, out.unsupported.length)});
        } catch (err) {
            this.setState({busy: false, status: this.L.mcFailed('MakeCode export', (err && err.message) || String(err))});
        }
    }

    /** What `Save` would call this tab's file. */
    saveFileName () {
        const lang = this.state.lang;
        if (lang === 'asm' && this.state.asmMode === 'listing') return 'program.lst';
        const f = CODE_FILES[lang] || CODE_FILES.pseudocode;
        // The pseudocode names itself after its target, which is the one piece
        // of identity a .bw always carries.
        const dev = lang === 'pseudocode' &&
            (this.state.buffers.pseudocode || '').match(/^DEVICE\s+([\w-]+)/im);
        return `${(dev ? dev[1].toLowerCase() : f.base)}.${f.ext}`;
    }

    // Save the code ITSELF, comments and all. The .sb3 round-trip preserves a
    // program but not a single comment — blocks carry no file-level text — so
    // a documented source can only survive as its own file.
    saveCodeFile () {
        const code = this.activeCode() || '';
        if (!code.trim()) { this.setState({status: this.L.saveEmpty}); return; }
        const name = this.saveFileName();
        const mime = (CODE_FILES[this.state.lang] || CODE_FILES.pseudocode).mime;
        const url = URL.createObjectURL(new Blob([code], {type: mime}));
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    }

    // Export the exact source recovered from an imported MakeCode artefact.
    // This is deliberately not labelled as a BrickWright->UF2 compiler: edits
    // made after translation are not reverse-translated into these files.
    async exportMakeCodeSource () {
        const project = this._makeCodeProject;
        if (!project || !project.files) return;
        const imported = await import(/* webpackChunkName: "jszip" */ 'jszip');
        const JSZip = imported.default || imported;
        const zip = new JSZip();
        Object.entries(project.files).forEach(([name, source]) => zip.file(name, source));
        zip.file('BRICKWRIGHT-IMPORT.txt',
            `Recovered ${project.target} source from an imported MakeCode artefact.\n` +
            'These are the original files, not a reverse translation of later BrickWright edits.\n' +
            'Open the folder with the MakeCode Asset Explorer/PXT toolchain and compile for your exact board.\n');
        const blob = await zip.generateAsync({type: 'blob'});
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${String(project.name || 'makecode-project').replace(/[^a-z0-9_-]+/gi, '-')}.zip`;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    }

    componentWillUnmount () {
        this._unmounted = true;
        const vm = this.props.vm;
        if (vm && vm.runtime && this._onProjectChanged) {
            vm.runtime.removeListener('PROJECT_CHANGED', this._onProjectChanged);
        }
        window.removeEventListener('bw-project-bundle-collect', this._onBundleCollect);
        window.removeEventListener('bw-project-bundle-loaded', this._onBundleLoaded);
        // A pending debounce would otherwise lose the last edits on unmount.
        if (this._autosaveTimer) {
            clearTimeout(this._autosaveTimer);
            this._autosaveTimer = null;
            this.writeAutosave();
        }
    }

    // Current-locale string table for this tab's own UI (see L10N above).
    get L () { return L10N[pickLocale(this.props.locale)]; }

    activeCode () {
        if (this.state.lang === 'asm' && this.state.asmMode === 'listing') return this.state.asmListing;
        return this.state.buffers[this.state.lang];
    }
    setActiveCode (text) {
        if (this.state.lang === 'asm' && this.state.asmMode === 'listing') return; // listing is read-only
        this.setState(s => ({buffers: {pseudocode: '', python: '', javascript: '', c: '', basic: '', asm: '', micropython: '', [s.lang]: text}}));
    }

    // Lazily import the compiler through the registering door, which injects this
    // app's authored vector assets before handing the class over. The SHAPE art
    // dialect lives upstream; the artwork deliberately does not.
    async lib () {
        return await import(
            /* webpackChunkName: "sb3-creator" */ '../../lib/sb3-creator-register-art.js');
    }

    // Convert one language's source to another by going through blocks:
    // Two kinds of C arrive here and they need different readers. Host C is what
    // generateC now emits for a Scratch project — machine written, carrying its
    // own structure, and marked with @bw-program. Everything else is 8051 C,
    // possibly hand written, which sb3-creator-c.js infers pins from. Guessing
    // wrong means reading a sprite program as firmware, so the marker decides.
    async readC (text) {
        if (/@bw-program/.test(text)) {
            const host = (await import(/* webpackChunkName: "sb3-creator-chost" */ '../../lib/sb3-creator-chost.js')).default;
            return { pseudocode: host(text), warnings: [] };
        }
        const device = (await import(/* webpackChunkName: "sb3-creator-c" */ '../../lib/sb3-creator-c.js')).default;
        return device(text);
    }

    // source → pseudocode → parse() → project → generate(to). Returns {code} or {error}.
    async deriveBuffer (src, from, to) {
        try {
            const SB3 = (await this.lib()).default;
            let pseudo = src;
            if (from === 'c') pseudo = (await this.readC(src)).pseudocode;
            else if (from === 'python') pseudo = (await import(/* webpackChunkName: "sb3-creator-python" */ '../../lib/sb3-creator-python.js')).default(src).pseudocode;
            else if (from === 'javascript') pseudo = (await import(/* webpackChunkName: "sb3-creator-javascript" */ '../../lib/sb3-creator-javascript.js')).default(src).pseudocode;
            else if (from === 'basic') pseudo = (await import(/* webpackChunkName: "sb3-creator-basic" */ '../../lib/sb3-creator-basic.js')).default(src).pseudocode;
            const creator = new SB3();
            creator.parse(pseudo);
            const proj = creator.project;
            let code;
            if (to === 'pseudocode') code = new SB3().decompile(proj);
            else if (to === 'python') code = new SB3().generatePython(proj, this.genOpts());
            else if (to === 'c') code = new SB3().generateC(proj);
            else if (to === 'basic') {
                const r = new SB3().generateBASIC(proj, {profile: this.state.basicProfile, lineNumbers: this.state.basicLineNumbers});
                code = r.ok ? r.basic : `REM === Cannot show as BASIC ===\n${r.reasons.map(s => 'REM ' + s).join('\n')}`;
            } else if (to === 'micropython') {
                const r = new SB3().generateMicroPython(proj);
                code = r.ok ? r.py : `# === Cannot generate MicroPython ===\n${r.reasons.map(s => '# ' + s).join('\n')}`;
            } else code = new SB3().generateJavaScript(proj, this.genOpts());
            return {code};
        } catch (e) { return {error: e.message}; }
    }

    // Switch language tab. If the target buffer is empty, derive it from the active
    // buffer so the tab shows the same project in the new language.
    switchTab (to) {
        const from = this.state.lang;
        if (to === from || this.state.busy) return;
        // ASM tab: just switch — author mode by default, listing on demand
        if (to === 'asm') { this.setState({lang: 'asm', output: null, status: ''}); return; }
        const existing = this.state.buffers[to];
        const src = this.state.buffers[from];
        if ((existing && existing.trim()) || !src || !src.trim()) { this.setState({lang: to, output: null, status: ''}); return; }
        this.setState({busy: true, status: this.L.stConverting(to)});
        this.deriveBuffer(src, from, to).then(({code, error}) => {
            if (error) { this.setState({busy: false, status: this.L.stCantShow(to, error)}); return; }
            this.setState(s => ({lang: to, busy: false, output: null, status: '', buffers: {...s.buffers, [to]: code}}));
        });
    }

    /** Simple hash for cache key — FNV-1a 32-bit on the source string. */
    _hashSource (str) {
        let h = 0x811c9dc5;
        for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = (h * 0x01000193) >>> 0;
        }
        return h.toString(16);
    }

    /** Fetch the ASM listing (compile with disassemble=true) for the listing mode. */
    async fetchAsmListing () {
        // Need C source to compile. Derive it from whatever is active.
        let cSrc = this.state.buffers.c;
        if (!cSrc || !cSrc.trim()) {
            // Derive C from the current active buffer first
            const src = this.state.buffers[this.state.lang] || this.state.buffers.pseudocode;
            if (!src || !src.trim()) {
                this.setState({lang: 'asm', output: null, status: 'No source to compile — write code in another tab first.'});
                return;
            }
            this.setState({busy: true, status: this.L.stCompiling});
            const result = await this.deriveBuffer(src, this.state.lang === 'asm' ? 'pseudocode' : this.state.lang, 'c');
            if (result.error) {
                this.setState({busy: false, lang: 'asm', status: `Cannot derive C: ${result.error}`});
                return;
            }
            cSrc = result.code;
        }

        const stc = this.currentStc();
        const deviceId = (stc && stc.device || 'stc12c5a60s2').toLowerCase();
        const fosc = Number(stc && (stc.clock || stc.fosc)) || 11059200;
        // A listing belongs to a particular image, not merely to source text.
        // Include every option that can change code generation and the listing
        // schema version so another device/clock cannot borrow stale addresses.
        const hash = this._hashSource(JSON.stringify({cSrc, deviceId, fosc, listingVersion: 1}));
        if (this._asmCache.hash === hash && this._asmCache.asm) {
            this.setState({
                lang: 'asm', asmMode: 'listing', busy: false, output: null, status: '',
                asmListing: this._asmCache.asm,
                asmLineMap: this._asmCache.lineMap
            });
            return;
        }

        this.setState({busy: true, status: this.L.stCompiling, conversionReport: null});
        try {
            const {requestGeneratedListing} = await import(
                /* webpackChunkName: "sdcc-listing-route" */ '../../lib/sdcc-wasm/listing-route.js');
            const out = await requestGeneratedListing({code: cSrc, deviceId, fosc}, {
                compileLocal: async (...args) => {
                    const {compile} = await import(
                        /* webpackChunkName: "sdcc-wasm" */ '../../lib/sdcc-wasm/compiler.js');
                    return compile(...args);
                },
                hostedFetch: globalThis.fetch
            });
            // v1 listing shape: {asm, lineMap, format, v}
            // Fallback: old response.disassembly string
            let asmText = '';
            let lineMap = null;
            if (out.listing && out.listing.asm) {
                asmText = out.listing.asm;
                lineMap = out.listing.lineMap || null;
            } else if (out.disassembly) {
                asmText = out.disassembly;
            } else {
                asmText = '; (no disassembly returned by the compiler service)';
            }
            // Cache it
            this._asmCache = {hash, asm: asmText, lineMap};
            this.setState({
                lang: 'asm', asmMode: 'listing', busy: false, output: null,
                status: lineMap ? `${lineMap.length} source mapping(s)` : '',
                asmListing: asmText,
                asmLineMap: lineMap
            });
        } catch (e) {
            this.setState({busy: false, lang: 'asm', asmMode: 'listing',
                status: this.L.stError(e.message),
                asmListing: `; Compile error: ${e.message}`});
        }
    }

    /**
     * Assemble and run.
     *
     * ONE TAB, TWO ASSEMBLERS, AND THE CHOICE IS NOT MADE HERE. The 8086 is
     * assembled IN THE BROWSER by the vendored MASM-subset assembler;
     * everything else is posted to the hosted service (stc-compiler
     * /assemble — sdas8051, ca65+ld65, sdasz80, avr-gcc). That is a real
     * inconsistency and `lib/bw-asm/assemble-route.js` is where it is argued
     * for; the short version is that neither ca65 nor sdasz80 knows the 8086,
     * so the alternative was not one route, it was no 8086 ASM tab.
     *
     * What this method owes the user is that the choice is never silent.
     * `requestAssembly` returns the route it took and the status line says
     * so — "assembled 384 bytes in this browser" is a different sentence from
     * "assembled by the hosted assembler", and a refusal names which of the
     * two assemblers refused, because their diagnostics read nothing alike.
     *
     * The image then travels the SAME path a hosted build's does:
     * `bw-asm-rom-ready` → circuit-tab stashes it → debug-panel boots it.
     * The detail grew `slotId`/`profile` because a .COM is not a ROM — see
     * `lib/bw-debug/i8086-dos-bench.js`. Auto-run is wired for the 6502, Z80
     * and 8086 benches; other targets assemble (errors surface here) and say
     * so rather than pretending to have run.
     */
    async assembleAndRun () {
        const source = this.state.buffers.asm;
        if (!source || !source.trim()) {
            this.setState({status: this.L.asmWriteFirst});
            return;
        }
        const device = this._asmDevice();
        const target = asmTargetForDevice(device);
        const route = asmRouteFor(device);
        const routeName = route === 'local' ? this.L.asmRouteLocal : this.L.asmRouteHosted;
        const BENCHES = {eater6502: '6502', z80: 'Z80', i8086: '8086'};
        this.setState({busy: true, status: this.L.asmAssembling(routeName)});
        let out;
        try {
            out = await requestAssembly({source, device});
        } catch (e) {
            // 'source' is the user's program and the message names the line;
            // 'transport' is the network or a missing module and is not
            // something they can fix by editing. Conflating the two sent
            // people hunting for a syntax error in a working program.
            this.setState({busy: false, status: e.reason === 'source'
                ? this.L.asmSourceError(routeName, e.message)
                : this.L.asmTransportError(routeName, e.message)});
            return;
        }
        // Every give the local assembler made (an expanded 80186 shift, a
        // synthesised segment override) is recorded rather than silent, so a
        // program that assembled DIFFERENTLY from what was written says so.
        const warn = out.warnings.length ? this.L.asmWarnings(out.warnings) : '';
        const bench = BENCHES[out.target];
        if (bench) {
            // HARDWARE THE SOURCE ASKS FOR. A pseudocode program declares its
            // pins and the build returns the chips they need; an assembly
            // program has no declarations, so the EXAMPLE carries them. That
            // is how a program driving an NE2000's registers gets an NE2000
            // to drive -- without putting one on every learner's board.
            const chips = this.asmChipsForSource(this.state.buffers.asm);
            const detail = {rom: out.bytes, listing: out.listing, target: out.target,
                slotId: out.slotId, profile: out.profile, format: out.format,
                ...(chips.length ? {chips} : {})};
            // The default debugger dock is the optional right pane. A program
            // handed to a hidden pane is technically running but unusable, so
            // open the pane as part of the same user gesture (as the Arduboy
            // and controller runners already do).
            try { localStorage.setItem('bw-right-pane-hidden', '0'); } catch { /* private mode */ }
            window.dispatchEvent(new CustomEvent('bw-settings-change', {
                detail: {key: 'bw-right-pane-hidden', value: '0'}
            }));
            window.__bwPendingMedia = {type: 'asm', detail};
            window.dispatchEvent(new CustomEvent('bw-asm-rom-ready', {detail}));
            this.setState({busy: false,
                status: this.L.asmBuiltBench(out.bytes.length, routeName, bench) + warn});
        } else {
            this.setState({busy: false,
                status: this.L.asmBuiltOnly(out.bytes.length, routeName, target) + warn});
        }
    }

    /**
     * ▶ Run on 8086 — the OFFLINE path from blocks to a running machine.
     *
     * Every other device on this tab reaches silicon as C through the hosted
     * compiler: `generateC(project)` and a POST to stc-compiler. There is no
     * 8086 back end behind that URL and there is not going to be one, so
     * this button takes the other road: `lib/bw-asm/pseudocode-8086.js`
     * lowers the blocks to 8086 assembly, `requestAssembly` assembles them
     * in this browser (the same local route `assembleAndRun` uses, argued
     * for in `lib/bw-asm/assemble-route.js`), and the image travels the
     * SAME `bw-asm-rom-ready` → circuit-tab → debug-panel path a hand-written
     * assembly program does. No network is touched at any point, which is
     * the whole claim.
     *
     * THE SOURCE IS PASSED AS WELL AS THE PROJECT, and that is not
     * belt-and-braces. `SB3Creator.parse()` silently DROPS a hardware
     * statement on a DEVICE it does not recognise, so a program with PIN
     * declarations arrives here as an empty script. The back end refuses it
     * by reading the text — see `emitI8086Asm`.
     *
     * A REFUSAL IS DIFFERENT FROM A FAILURE, and the status line says which.
     * `Pseudocode8086Error` means this program uses something the back end
     * does not lower, and the message names the block and lists what does
     * work; anything else is the assembler or a broken module.
     *
     * The generated assembly is left in the ASM tab. A learner who wants to
     * know what their blocks became can go and read it, which is most of the
     * point of having a machine this small.
     */
    async runPseudocodeOn8086 () {
        const src = this.state.buffers.pseudocode || '';
        if (!src.trim()) {
            this.setState({status: this.L.run8086Empty});
            return;
        }
        this.setState({busy: true, status: this.L.run8086Building, output: null});
        let out;
        let blocks = 0;
        try {
            const SB3Creator = (await this.lib()).default;
            const creator = new SB3Creator();
            creator.parse(src);
            const stage = (creator.project.targets || []).find(t => t.isStage);
            blocks = stage ? Object.keys(stage.blocks || {}).length : 0;
            const mod = await import(
                /* webpackChunkName: "bw-pc8086" */ '../../lib/bw-asm/pseudocode-8086.js');
            out = await mod.buildPseudocode8086(
                {project: creator.project, source: src, parseWarnings: creator.warnings});
        } catch (e) {
            this.setState({busy: false, status: e && e.name === 'Pseudocode8086Error'
                ? this.L.run8086Refused(e.message)
                : this.L.run8086Failed(e && e.message ? e.message : String(e))});
            return;
        }
        // `chips` carries hardware requested by the program's declarations.
        const detail = {rom: out.bytes, listing: null, target: out.target,
            slotId: out.slotId, profile: out.profile, format: out.format,
            chips: out.chips};
        try { localStorage.setItem('bw-right-pane-hidden', '0'); } catch { /* private mode */ }
        window.dispatchEvent(new CustomEvent('bw-settings-change', {
            detail: {key: 'bw-right-pane-hidden', value: '0'}
        }));
        window.__bwPendingMedia = {type: 'asm', detail};
        window.dispatchEvent(new CustomEvent('bw-asm-rom-ready', {detail}));
        const warn = out.warnings.length ? this.L.asmWarnings(out.warnings) : '';
        this.setState(st => ({
            busy: false,
            buffers: {...st.buffers, asm: out.asm},
            status: this.L.run8086Built(out.bytes.length, blocks) + warn
        }));
    }

    /**
     * Which chips an assembly source needs, from a declaration IN the source.
     *
     * `; BW-CHIPS: ne2000@320` on any line asks the bench for that card. It is
     * a comment, so it assembles everywhere and means something only here --
     * the same trick a `#pragma` plays, and the reason an example can request
     * hardware without inventing an assembler directive that MASM would
     * reject.
     *
     * NOT INFERRED FROM THE CODE. A source that happens to `OUT 320h` gets
     * nothing: guessing hardware from port writes would give a learner a card
     * they did not ask for and hide the fact that a board needs one.
     */
    asmChipsForSource (src) {
        const out = [];
        const seen = new Set();
        for (const m of String(src || '').matchAll(/^\s*;\s*BW-CHIPS:\s*(.+)$/gim)) {
            for (const spec of m[1].split(',')) {
                const bits = spec.trim().match(/^([a-z0-9]+)(?:@([0-9a-f]+))?$/i);
                if (!bits) continue;
                const kind = bits[1].toLowerCase();
                const at = bits[2] ? parseInt(bits[2], 16) : undefined;
                // KEYED ON KIND AND ADDRESS, not kind alone. Two cards at two
                // ports on one board is the whole point of a hub, and the
                // first version deduplicated by kind -- silently dropping the
                // second card and leaving an example that talks to nobody.
                const key = `${kind}@${at === undefined ? '-' : at}`;
                if (seen.has(key)) continue;
                seen.add(key);
                const chip = {kind, name: `${kind}${out.filter(c => c.kind === kind).length}`};
                if (at !== undefined) chip.at = at;
                out.push(chip);
            }
        }
        // A card with no link hears nothing. ONE card gets a loopback, which
        // is what a real card's self-test uses; SEVERAL get a shared hub, so
        // they hear each other and the MAC filter becomes the visible thing.
        const cards = out.filter(c => c.kind === 'ne2000');
        if (cards.length === 1) cards[0].loopback = true;
        else if (cards.length > 1) for (const c of cards) c.hub = true;
        return out;
    }

    // Keil C51 gives itself away: keywords SDCC spells differently, and its register headers.
    looksLikeKeil (src) {
        return /\bsbit\s+\w+\s*=|\bsfr\s+\w+\s*=|\b_at_\b|#include\s*<\s*reg5\d|\bdata\s+\w+\s*;|\bcode\s+\w+\s*\[/.test(src);
    }

    async translateKeil (src) {
        try {
            const r = await fetch('https://stc-compiler.vercel.app/translate', {
                method: 'POST', headers: {'content-type': 'application/json'},
                body: JSON.stringify({code: src, target: 'stc12c5a60s2'})
            });
            if (!r.ok) return {ok: false, error: `HTTP ${r.status}`};
            const b = await r.json();
            // The SDCC source is in `c`; `translated` is a stats object ({include: 1, sbit: 2}).
            return b.c ? {ok: true, code: b.c, stats: b.translated} : {ok: false, error: 'no translation returned'};
        } catch (e) {
            return {ok: false, error: e.message};
        }
    }



    // Read the DEVICE id from the pseudocode buffer. Returns lowercase id or null.
    currentDevice () {
        const src = this.state.buffers.pseudocode || '';
        const m = src.match(/^DEVICE\s+([\w-]+)/im);
        return m ? m[1].toLowerCase() : null;
    }

    // Set the DEVICE in the pseudocode buffer. When the code has PIN declarations,
    // retargetPseudocode rewrites them to the target's conventional pins and reports
    // any hard blockers ("no ADC on this chip"). Code without pins just gets its
    // DEVICE line rewritten — there is nothing to refuse.
    async setDevice (deviceId) {
        if (!deviceId) {
            // "no chips" — pure Scratch stage mode. Drop the DEVICE line and the
            // runtime device hints; "Load example…" goes back to the stage games.
            this.setState(s => ({
                showCatalog: false, status: '',
                buffers: {...s.buffers, pseudocode: (s.buffers.pseudocode || '').replace(/^DEVICE\s+[\w-]+[^\n]*\n?/im, '')}
            }));
            if (this.props.vm && this.props.vm.runtime) {
                this.props.vm.runtime.bwDeviceCore = null;
                this.props.vm.runtime.bwDeviceId = null;
            }
            window.dispatchEvent(new CustomEvent('bw-settings-change', {
                detail: {key: 'bw-device-id', value: ''}
            }));
            return;
        }
        const info = DEVICE_BY_ID[deviceId];
        if (!info) return;
        this.loadCatalog();
        const src = this.state.buffers.pseudocode || '';
        // PIN or PART: a 74HC595 chaser declares no PIN lines yet claims
        // three pins through its PART binding. The PIN-only test meant
        // switching the device on such a program silently kept DEVICE
        // STC12 — 'we choose Nano, we get stc12' (owner, repeatedly).
        const hasPins = /^\s*(PIN|PART)\s/im.test(src);

        if (hasPins) {
            const SB3Creator = (await this.lib()).default;
            const result = SB3Creator.retargetPseudocode(src, deviceId);
            if (result.ok) {
                // Retargeting the text is only half of the operation. The
                // circuit tab must have the matching generated/reseated bench
                // before we commit the new DEVICE, or it would keep showing
                // the previous MCU with freshly retargeted firmware.
                const ex = this._lastCatalogExample;
                const sourceDevice = (src.match(/^DEVICE\s+([\w-]+)/im) || [])[1] || '';
                const resolvedBench = ex
                    ? resolveExampleBench(ex, deviceId, sourceDevice)
                    : null;
                if (resolvedBench && resolvedBench.error) {
                    this.setState({status: `Cannot retarget to ${info.label}: ${resolvedBench.error}`});
                    return;
                }
                this.setState({
                    buffers: {...this.state.buffers, pseudocode: result.pseudocode},
                    status: result.warnings.length
                        ? `Retargeted to ${info.label}: ${result.warnings.join('; ')}`
                        : `Retargeted to ${info.label}.`
                }, () => {
                    // The switch must produce a RUNNABLE project and a
                    // matching bench, exactly like loading an example does —
                    // retargeting only the text left the VM and the Circuit
                    // tab on the old device.
                    Promise.resolve(this.compile()).catch(() => {});
                    const bench = resolvedBench && resolvedBench.retargeted
                        ? resolvedBench.path
                        : null;
                    if (bench && typeof window !== 'undefined') {
                        const detail = {benchPath: bench, exampleId: ex.id, device: deviceId};
                        window.__bwExampleBench = detail;
                        window.dispatchEvent(new CustomEvent('bw-example-bench', {detail}));
                    }
                });
            } else {
                this.setState({status: `Cannot retarget to ${info.label}: ${result.reasons.join('; ')}`});
                return; // don't switch — the reasons explain why
            }
        } else {
            const line = `DEVICE ${deviceId.toUpperCase()}`;
            this.setState(s => {
                const buf = s.buffers.pseudocode || '';
                let next;
                if (/^DEVICE\s+[\w-]+/im.test(buf)) {
                    next = buf.replace(/^DEVICE\s+[\w-]+.*$/im, line);
                } else {
                    next = line + '\n' + buf;
                }
                return { buffers: { ...s.buffers, pseudocode: next } };
            });
        }
        // Publish core on the runtime so the debug panel can pick the right emulator
        if (this.props.vm && this.props.vm.runtime) {
            this.props.vm.runtime.bwDeviceCore = info.core;
            this.props.vm.runtime.bwDeviceId = deviceId;
        }
        // Broadcast device change so the stage-header can show/hide the micro:bit button
        window.dispatchEvent(new CustomEvent('bw-settings-change', {
            detail: {key: 'bw-device-id', value: deviceId}
        }));
    }

    // Real hardware, two minutes: generate MicroPython and push it to a
    // Pico over WebSerial (raw REPL, main.py — survives reboot). WebSerial
    // is Chromium-only, so everywhere else this degrades to downloading
    // main.py with a hint at Thonny / `bw flash`. The protocol core lives
    // in pico-repl.js (vendored from sb3-creator, tested against a mock).
    async deployToPico () {
        const src = this.state.buffers.pseudocode || '';
        if (!src.trim()) return;
        this.setState({busy: true, status: ''});
        try {
            const SB3Creator = (await this.lib()).default;
            const creator = new SB3Creator();
            creator.parse(src);
            const r = creator.generateMicroPython();
            if (!r.ok) {
                this.setState({busy: false,
                    status: this.L.deployPicoFail((r.reasons || []).join('; ') || 'not expressible in MicroPython')});
                return;
            }
            const tauri = await import(
                /* webpackChunkName: "pico-repl" */ '../../lib/pico-tauri-transport.js');
            if (tauri.available()) {
                // Desktop app: native serial through the Rust commands —
                // works in Safari-engine webviews and driverless on Windows.
                const ports = await tauri.listPorts();
                if (!ports.length) {
                    const inBootsel = await tauri.bootselVolume().catch(() => false);
                    this.setState({busy: false, status: inBootsel
                        ? this.L.deployPicoBootsel
                        : this.L.deployPicoNoPort});
                    return;
                }
                const path = ports.find(p => /usbmodem|ttyACM/i.test(p)) || ports[0];
                const {createPicoRepl} = await import(
                    /* webpackChunkName: "pico-repl" */ '../../lib/pico-repl.js');
                const transport = await tauri.openTransport(path);
                try {
                    await createPicoRepl(transport).deployMainPy(r.py);
                    this.setState({busy: false, status: this.L.deployPicoDone});
                } finally {
                    await transport.close().catch(() => {});
                }
            } else if (typeof navigator !== 'undefined' && navigator.serial) {
                // Chromium: straight onto the board. 0x2e8a = Raspberry Pi.
                const port = await navigator.serial.requestPort({filters: [{usbVendorId: 0x2e8a}]});
                await port.open({baudRate: 115200});
                const {webSerialTransport, createPicoRepl} = await import(
                    /* webpackChunkName: "pico-repl" */ '../../lib/pico-repl.js');
                const transport = webSerialTransport(port);
                try {
                    await createPicoRepl(transport).deployMainPy(r.py);
                    this.setState({busy: false, status: this.L.deployPicoDone});
                } finally {
                    await transport.close().catch(() => {});
                }
            } else {
                // Safari & friends: hand over main.py and say why.
                const url = URL.createObjectURL(new Blob([r.py], {type: 'text/x-python'}));
                const a = document.createElement('a');
                a.href = url;
                a.download = 'main.py';
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 5000);
                this.setState({busy: false, status: this.L.deployPicoSaved});
            }
        } catch (e) {
            // A cancelled port picker is a choice, not an error.
            const cancelled = e && (e.name === 'NotFoundError' || /No port selected/i.test(e.message));
            this.setState({busy: false, status: cancelled ? '' : this.L.deployPicoFail(e.message)});
        }
    }

    /** STM32 over SWD via a CMSIS-DAP probe (WebUSB) — the bootloader-free
     *  alternative to the AN3155 UART path. No BOOT0, no reset button. */
    async flashStm32ViaSwd () {
        const src = this.state.buffers.pseudocode || '';
        if (!src.trim()) return;
        if (typeof navigator === 'undefined' || !navigator.usb) {
            this.setState({status: this.L.flashNoWebUsb});
            return;
        }
        this.setState({busy: true, status: this.L.flashCompiling});
        try {
            const SB3Creator = (await this.lib()).default;
            const creator = new SB3Creator();
            creator.parse(src);
            const cSrc = creator.generateC(creator.project, {debug: false});
            const res = await fetch('https://stc-compiler.vercel.app/compile', {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({code: cSrc, language: 'c', target: 'stm32f030', format: 'bin'})
            });
            const out = await res.json();
            if (!out.success) throw new Error(out.error || 'the compiler refused this program');
            const raw = Uint8Array.from(atob(out.base64), c => c.charCodeAt(0));
            const flasher = await import(/* webpackChunkName: "bw-flasher" */ '../../lib/flasher.js');
            const lines = [];
            const log = (t) => { lines.push(t); this.setState({output: lines.join('\n')}); };
            this.setState({status: this.L.flashSwdHint});
            const device = await navigator.usb.requestDevice({filters: []});
            this.setState({status: this.L.flashing});
            const done = await flasher.flashSwdStm32(device, raw, {log});
            this.setState({busy: false, status: this.L.flashDone(done.bytes)});
        } catch (e) {
            const cancelled = e && (e.name === 'NotFoundError' || /No device selected/i.test(e.message));
            this.setState({busy: false, status: cancelled ? this.L.flashNoPort : this.L.flashFail(e.message)});
        }
    }

    /** Which serial-flash family a device belongs to, or null when it has
     *  no serial bootloader (needs an external programmer). One place, so
     *  the button's enablement and the flasher agree. */
    flashFamily (device) {
        const d = String(device || '').toLowerCase();
        if (d === 'pico') return 'micropython';        // handled by deployToPico
        if (d === 'stm32f030') return 'stm32';
        if (/^stc/.test(d)) return 'stc';
        // optiboot STK500v1 boards only: the ATtinys have no bootloader and
        // the Mega speaks STK500v2 (a different protocol flash.js does not
        // implement) — both fall through to the programmer message.
        if (['arduino-uno', 'arduino-nano', 'atmega328p', 'atmega168p'].includes(d)) return 'avr';
        if (['arduino-mega', 'atmega2560'].includes(d)) return 'avr-mega';  // STK500v2
        // ATtiny has no bootloader; a USBasp/USBISP dongle flashes it over
        // the ICSP header (WebUSB). The same path flashes any AVR too, but
        // those default to their bootloader above.
        if (['attiny85', 'attiny88'].includes(d)) return 'isp';
        // 6502/Z80 breadboards: no bootloader — the ROM is burned on a
        // Ben Eater EEPROM programmer running bweep.ino over serial.
        if (['eater6502', '6502', 'w65c02', 'z80'].includes(d)) return 'eeprom';
        return null;
    }

    /** Compile the current program for its device and write it to a real
     *  board over Web Serial, dispatching to the vendored flasher by
     *  family. Non-serial-bootloader devices get their image downloaded
     *  with a message naming the programmer they need. */
    async flashToBoard () {
        const device = this.currentDevice();
        const family = this.flashFamily(device);
        if (family === 'micropython') { return this.deployToPico(); }

        const src = this.state.buffers.pseudocode || '';
        if (!src.trim()) return;

        const noSerial = typeof navigator === 'undefined' || !navigator.serial;
        const downloadImage = (bytes, name) => {
            const url = URL.createObjectURL(new Blob([bytes], {type: 'application/octet-stream'}));
            const a = document.createElement('a');
            a.href = url; a.download = name; a.click();
            setTimeout(() => URL.revokeObjectURL(url), 5000);
        };

        this.setState({busy: true, status: this.L.flashCompiling});
        try {
            // Compile through the same hosted service and format the Run
            // path uses: hex for STC/AVR, a raw bin for STM32.
            const SB3Creator = (await this.lib()).default;
            const creator = new SB3Creator();
            creator.parse(src);
            const cSrc = creator.generateC(creator.project, {debug: false});
            const COMPILE_TARGET = {
                'arduino-nano': 'atmega328p', 'arduino-uno': 'atmega328p',
                'atmega328p': 'atmega328p', 'atmega168p': 'atmega168p',
                'stm32f030': 'stm32f030', 'arduino-mega': 'atmega2560', 'atmega2560': 'atmega2560',
                'attiny85': 'attiny85', 'attiny88': 'attiny88',
                'eater6502': 'eater6502', '6502': 'eater6502', 'w65c02': 'eater6502'
            };
            const target = COMPILE_TARGET[String(device).toLowerCase()] || String(device).toLowerCase();
            const format = (family === 'stm32' || family === 'eeprom') ? 'bin' : 'ihx';
            const res = await fetch('https://stc-compiler.vercel.app/compile', {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({code: cSrc, language: 'c', target, format})
            });
            const out = await res.json();
            if (!out.success) throw new Error(out.error || 'the compiler refused this program');
            const raw = Uint8Array.from(atob(out.base64), c => c.charCodeAt(0));

            if (family === null) {
                downloadImage(raw, out.filename || `firmware.${format === 'bin' ? 'bin' : 'hex'}`);
                this.setState({busy: false, status: this.L.flashNeedsProgrammer(device)});
                return;
            }
            if (noSerial) {
                downloadImage(raw, out.filename || `firmware.${format === 'bin' ? 'bin' : 'hex'}`);
                this.setState({busy: false, status: this.L.flashNoSerial});
                return;
            }

            const flasher = await import(/* webpackChunkName: "bw-flasher" */ '../../lib/flasher.js');
            const lines = [];
            const log = (t) => { lines.push(t); this.setState({output: lines.join('\n')}); };

            if (family === 'isp') {
                // WebUSB, not Web Serial: a USBasp is a raw USB device.
                if (typeof navigator === 'undefined' || !navigator.usb) {
                    downloadImage(raw, out.filename || 'firmware.hex');
                    this.setState({busy: false, status: this.L.flashNoWebUsb});
                    return;
                }
                this.setState({status: this.L.flashIspHint});
                const device = await navigator.usb.requestDevice({filters: [{vendorId: 0x16c0}]});
                this.setState({status: this.L.flashing});
                const done = await flasher.flashUsbasp(device, new TextDecoder().decode(raw), {log});
                this.setState({busy: false, status: this.L.flashDone(done.bytes)});
                return;
            }

            if (family === 'stm32') {
                this.setState({status: this.L.flashStm32Boot});
                const port = await navigator.serial.requestPort();
                await flasher.openStm32Port(port);
                this.setState({status: this.L.flashing});
                const done = await flasher.flashStm32(port, raw, {log});
                this.setState({busy: false, status: this.L.flashDone(done.bytes)});
            } else if (family === 'stc') {
                this.setState({status: this.L.flashColdBoot});
                const port = await navigator.serial.requestPort();
                await port.open({baudRate: 115200});
                const done = await flasher.flashStc(port, new TextDecoder().decode(raw), {
                    log, onPowerCycle: () => this.setState({status: this.L.flashColdBoot})
                });
                this.setState({busy: false, status: this.L.flashDone(done.bytes)});
            } else if (family === 'eeprom') {
                this.setState({status: this.L.flashEepromHint});
                const port = await navigator.serial.requestPort();
                await port.open({baudRate: 115200});
                this.setState({status: this.L.flashing});
                const done = await flasher.flashEeprom(port, raw, {log});
                this.setState({busy: false, status: this.L.flashDone(done.bytes)});
            } else if (family === 'avr-mega') {
                const port = await navigator.serial.requestPort();
                this.setState({status: this.L.flashing});
                const done = await flasher.flashAvrMega(port, new TextDecoder().decode(raw), {log});
                this.setState({busy: false, status: this.L.flashDone(done.bytes)});
            } else { // avr (optiboot v1)
                const port = await navigator.serial.requestPort();
                this.setState({status: this.L.flashing});
                const done = await flasher.flashAvr(port, new TextDecoder().decode(raw), {log});
                this.setState({busy: false, status: this.L.flashDone(done.bytes)});
            }
        } catch (e) {
            const cancelled = e && (e.name === 'NotFoundError' || /No port selected/i.test(e.message));
            this.setState({busy: false, status: cancelled ? this.L.flashNoPort : this.L.flashFail(e.message)});
        }
    }

    // The project's hardware declarations. `vm.runtime.stc` is where they live while
    // a project is loaded (see loadProject above for why toJSON cannot carry them);
    // the toJSON read stays as a fallback for the day the VM does.
    currentStc () {
        const vm = this.props.vm;
        if (!vm) return null;
        if (vm.runtime && vm.runtime.stc) return vm.runtime.stc;
        try { return JSON.parse(vm.toJSON()).stc || null; } catch { return null; }
    }

    // Hardware-extension codegen options passed to generatePython/generateJavaScript.
    genOpts () { return {driver: this.state.driverMode, async: this.state.asyncMode, events: this.state.eventsMode}; }

    // Apply a codegen-option change and regenerate the active code view.
    setGenOpt (patch) {
        this.setState(patch, () => {
            const src = this.state.buffers.pseudocode;
            if (this.state.lang === 'pseudocode' || !src || !src.trim()) return;
            this.setState({busy: true, status: this.L.stRegen});
            this.deriveBuffer(src, 'pseudocode', this.state.lang).then(({code, error}) => {
                if (error) { this.setState({busy: false, status: error}); return; }
                this.setState(s => ({busy: false, status: '', output: null, buffers: {...s.buffers, [s.lang]: code}}));
            });
        });
    }

    // Lazily fetch the prebuilt Skulpt sources (~1 MB, only on the first Python
    // run) and cache the raw strings so both the main-thread injector and the
    // Worker builder can reuse them.
    async skulptSource () {
        if (this._skSrc) return this._skSrc;
        const [core, stdlib] = await Promise.all([
            import(/* webpackChunkName: "skulpt" */ '!!raw-loader!skulpt/dist/skulpt.min.js'),
            import(/* webpackChunkName: "skulpt-stdlib" */ '!!raw-loader!skulpt/dist/skulpt-stdlib.js')
        ]);
        this._skSrc = {core: core.default || core, stdlib: stdlib.default || stdlib};
        return this._skSrc;
    }

    // Skulpt's dist assumes a global `Sk`, so on the main thread we inject it as a
    // <script> rather than importing it as a module.
    async loadSkulpt () {
        if (window.Sk && window.Sk.configure) return window.Sk;
        const {core, stdlib} = await this.skulptSource();
        const inject = (src) => { const s = document.createElement('script'); s.text = src; document.head.appendChild(s); };
        inject(core); inject(stdlib);
        if (!window.Sk || !window.Sk.configure) throw new Error('Skulpt failed to load');
        return window.Sk;
    }

    // Run `workerSrc` (a self-contained worker body) against `code` in a fresh Web
    // Worker, streaming its output into `buf`. Resolves {} on clean finish, {error}
    // on a thrown error, or {timeout:true} after `timeoutMs` — at which point the
    // worker (and any infinite loop inside it) is terminated. Never rejects.
    runViaWorker (workerSrc, code, buf, timeoutMs) {
        return new Promise((resolve) => {
            let url;
            let worker;
            try {
                url = URL.createObjectURL(new Blob([workerSrc], {type: 'application/javascript'}));
                worker = new Worker(url);
            } catch (e) {
                if (url) URL.revokeObjectURL(url);
                resolve({error: String((e && e.message) || e)});
                return;
            }
            let settled = false;
            const done = (result) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                worker.terminate();
                URL.revokeObjectURL(url);
                resolve(result);
            };
            // An uncaught error INSIDE the worker (e.g. Skulpt calling
            // importScripts('bitops') for a stdlib module the inline bundle
            // does not carry) otherwise bubbles to window as a page error and
            // reads like an app crash. It is a preview failure: report it in
            // the preview pane and stop the noise.
            worker.onerror = (e) => {
                if (e && e.preventDefault) e.preventDefault();
                done({error: `Python preview unavailable for this program: ${(e && e.message) || 'worker error'}`});
            };
            const timer = setTimeout(() => done({timeout: true}), timeoutMs);
            worker.onmessage = (e) => {
                const d = e.data || {};
                if (d.type === 'out') buf.push(d.text);
                else if (d.type === 'done') done({});
                else if (d.type === 'error') done({error: d.text});
            };
            worker.onerror = (e) => done({error: (e && e.message) || 'worker error'});
            worker.postMessage({code});
        });
    }

    async runJsMain (code, buf) {
        const log = (...a) => buf.push(a.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ') + '\n');
        // With the simulated-board driver the emitted program is the MCU side of the board
        // contract, so it needs an actual board to drive — otherwise `_board()` stays null and
        // the program runs neutrally, which looks like the feature is broken.
        // Use the Circuit tab's board if it exists (one board, one truth), otherwise build one.
        const sharedBoard = this.props.vm && this.props.vm.runtime && this.props.vm.runtime.circuitBoard;
        const board = this.state.driverMode === 'simulator'
            ? (sharedBoard || await this.makeSimBoard(buf))
            : undefined;
        if (sharedBoard && this.state.driverMode === 'simulator') {
            buf.push('simulated board: using the Circuit tab\'s board.\n');
        }
        // eslint-disable-next-line no-new-func
        const fn = new Function('console', 'prompt', 'bwBoard', code);
        fn({log, error: log, warn: log, info: log}, (q) => window.prompt(q) || '', board);
        if (board) this.reportSimBoard(board, buf);
    }

    // Build a board from the project's own PIN declarations (boundary C), so pressing Run on
    // an STC12 project simulates the circuit those declarations imply rather than nothing.
    async makeSimBoard (buf) {
        try {
            // Lazily imported, like skulpt and the compiler: the engine is only needed when
            // someone actually runs with the simulated-board driver, and the bundle is
            // already large enough that everything optional should stay out of the entry.
            const {BoardImpl, inferNetlist} =
                await import(/* webpackChunkName: "bw-board" */ '../../lib/bw-board/index.js');
            const stc = this.currentStc();
            if (!stc || !(stc.pins || []).length) {
                buf.push('simulated board: the project declares no PINs, so there is nothing to wire.\n');
                return undefined;
            }
            const {parts, nets, notes} = inferNetlist(stc);
            const board = new BoardImpl();
            board.setNetlist(parts, nets);
            board.setPower(true);
            for (const n of notes || []) buf.push(`board: ${n}\n`);
            this._simParts = parts;
            return board;
        } catch (e) {
            buf.push(`simulated board unavailable: ${e.message}\n`);
            return undefined;
        }
    }

    // Report what the circuit actually did. Without this the run is silent and the user has
    // no way to tell a working simulation from a no-op.
    reportSimBoard (board, buf) {
        try {
            for (const part of this._simParts || []) {
                if (part.kind === 'led') {
                    buf.push(`LED ${part.id}: ${(board.ledBrightness(part.id) * 100).toFixed(1)}% brightness\n`);
                } else if (part.kind === 'buzzer') {
                    const t = board.buzzerTone(part.id);
                    buf.push(`buzzer ${part.id}: ${t.on ? `${t.hz.toFixed(0)} Hz` : 'silent'}\n`);
                }
            }
        } catch (e) { buf.push(`board readout failed: ${e.message}\n`); }
    }

    async runPyMain (code, buf) {
        const Sk = await this.loadSkulpt();
        Sk.configure({
            output: (t) => buf.push(t),
            read: (f) => { if (Sk.builtinFiles && Sk.builtinFiles.files[f]) return Sk.builtinFiles.files[f]; throw new Error(`module ${f} not found`); },
            inputfun: (p) => window.prompt(p) || '',
            inputfunTakesPrompt: true,
            __future__: Sk.python3
        });
        await Sk.misceval.asyncToPromise(() => Sk.importMainWithBody('<brickwright>', false, code, true));
    }

    // Run the generated code in-page. Interactive programs (that read input) need
    // the synchronous main-thread `prompt()`, so they run inline with a forever-loop
    // guard. Everything else runs in a Web Worker with a hard timeout — a runaway
    // loop is killed cleanly instead of freezing the tab.
    async run () {
        const code = this.activeCode();
        const lang = this.state.lang;
        const buf = [];
        this.setState({output: '', running: true, status: ''});
        const TIMEOUT = 4000;
        const finish = (extra) => this.setState({
            output: (buf.join('').trimEnd() + (extra ? (buf.length ? '\n' : '') + extra : '')).trim() || '(no output)',
            running: false, status: ''
        });
        const forever = lang === 'python' ? /^\s*while\s+True\s*:/m : /while\s*\(\s*true\s*\)/;
        const usesInput = lang === 'python' ? /(^|[^.\w])input\s*\(/.test(code) : /(^|[^.\w])prompt\s*\(/.test(code);
        const canWorker = typeof Worker !== 'undefined' && typeof Blob !== 'undefined' &&
            typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function';
        try {
            // A `forever:` game loop is meant for the blocks/green flag, not a text console —
            // catch the obvious case up front with a friendly nudge (the Worker timeout below
            // is only a safety net for non-obvious runaway loops).
            if (forever.test(code)) throw new Error(this.L.foreverLoop);
            if (usesInput || !canWorker) {
                if (lang === 'python') { this.setState({status: this.L.stLoadingPy}); await this.runPyMain(code, buf); } else await this.runJsMain(code, buf);
                finish();
            } else {
                let result;
                if (lang === 'python') {
                    this.setState({status: this.L.stLoadingPy});
                    const {core, stdlib} = await this.skulptSource();
                    result = await this.runViaWorker(`${core}\n${stdlib}\n${PY_WORKER}`, code, buf, TIMEOUT);
                } else {
                    result = await this.runViaWorker(JS_WORKER, code, buf, TIMEOUT);
                }
                if (result.timeout) finish(`⏱ Stopped after ${TIMEOUT / 1000}s — still running (likely an infinite loop).`);
                else if (result.error) finish(result.error);
                else finish();
            }
        } catch (e) {
            finish(String(e.message || e));
        }
    }
    // Flash the micro:bit simulator with the current MicroPython code.
    // Activates the simulator pane (stage-header dock='microbit') and posts
    // the code via the CustomEvent bus; the MicrobitSimPane picks it up.
    flashMicrobitSim () {
        const code = this.state.buffers.micropython;
        if (!code || !code.trim() || /^# ===/.test(code)) return;
        // Switch the right pane to the micro:bit simulator view
        const values = {
            'bw-hide-stage': '1',
            'bw-right-pane-hidden': '0',
            'bw-debug-dock': 'microbit',
            'bw-stage-circuit': '1'
        };
        try { Object.entries(values).forEach(([k, v]) => localStorage.setItem(k, v)); } catch { /* noop */ }
        Object.entries(values).forEach(([k, v]) => {
            window.dispatchEvent(new CustomEvent('bw-settings-change', {detail: {key: k, value: v}}));
        });
        // Send the code to the simulator pane
        {
            // Park on a module latch too: opening the dock mounts the sim pane
            // in the same tick, so its window listener may not exist yet — the
            // pane reads this latch on mount (first-click fix).
            const detail = {code};
            try { window.__bwMicrobitPendingFlash = detail; } catch { /* noop */ }
            window.dispatchEvent(new CustomEvent('bw-microbit-flash', {detail}));
        }
    }

    // Debug on the simulator: regenerate the MicroPython as a LINE-LEVEL trace
    // build — `generateMicroPython(project, {trace:true, breakpoints})` installs
    // a sys.settrace hook that prints RS(0x1e)L line markers over serial and
    // HALTS at breakpoint lines, dumping real locals (\x1eV) and the call stack
    // (\x1eK). The sim pane loads the settrace-enabled debug firmware and gets
    // the `lineMap` (python line -> block id) to highlight the live block and
    // drive step/continue (microbit-sim-pane.jsx, microbit-debug.js).
    // Breakpoints are the block ids the user right-clicked (bw-debug/breakpoints.js,
    // reused unchanged); the codegen bakes them to a line set.
    _setDebugLevel (lv) {
        const level = lv === 'line' ? 'line' : 'block';
        this.setState({debugLevel: level});
        try { localStorage.setItem('bw-microbit-debug-level', level); } catch { /* noop */ }
    }

    async flashMicrobitSimDebug () {
        const line = this.state.debugLevel === 'line';
        let breakpoints = [];
        try {
            const bp = await import(/* webpackChunkName: "bw-debug" */ '../../lib/bw-debug/breakpoints.js');
            breakpoints = bp.listBreakpoints ? bp.listBreakpoints() : [];
        } catch { /* no breakpoints module — debug with none, still useful for stepping */ }
        let code;
        let lineMap;
        let positions;
        let procNames;
        try {
            const SB3Creator = (await this.lib()).default;
            const proj = JSON.parse(this.props.vm.toJSON());
            const r = new SB3Creator().generateMicroPython(proj,
                line ? {trace: true, breakpoints} : {debug: true, breakpoints});
            if (!r.ok) {
                this.setState({status: this.L.stError((r.reasons || []).join(' · '))});
                return;
            }
            code = r.py;
            if (line) { lineMap = r.lineMap || {}; }
            else { positions = r.positions || []; procNames = r.procNames || []; }
        } catch (e) {
            this.setState({status: this.L.stError(e.message)});
            return;
        }
        // Activate the micro:bit sim pane, same as the plain run.
        const values = {
            'bw-hide-stage': '1',
            'bw-right-pane-hidden': '0',
            'bw-debug-dock': 'microbit',
            'bw-stage-circuit': '1'
        };
        try { Object.entries(values).forEach(([k, v]) => localStorage.setItem(k, v)); } catch { /* noop */ }
        Object.entries(values).forEach(([k, v]) => {
            window.dispatchEvent(new CustomEvent('bw-settings-change', {detail: {key: k, value: v}}));
        });
        const detail = line
            ? {code, trace: true, lineMap}
            : {code, debug: true, positions, procNames};
        // Park on a module latch (first-click mount-race fix — see plain run).
        try { window.__bwMicrobitPendingFlash = detail; } catch { /* noop */ }
        window.dispatchEvent(new CustomEvent('bw-microbit-flash', {detail}));
    }

    // Run BASIC on the real emulated machine.
    // 6502 profile → BasicMachineRunner (pump ms), BBC profile → BbcZ80Runner (pump steps).
    async runBasic () {
        const code = this.activeCode();
        if (!code.trim()) return;
        this.setState({output: '', running: true, status: this.L.basicLoading, basicRawOutput: '', basicIsBbc: false});
        try {
            const isBbc = this.state.basicProfile === 'bbc';
            let runner;
            if (isBbc) {
                const {BbcZ80Runner} = await import(/* webpackChunkName: "bw-board" */ '../../lib/bw-board/bbc-z80-runner.js');
                const res = await fetch('static/roms/bbcbasic.com');
                if (!res.ok) throw new Error('Failed to load bbcbasic.com');
                const com = new Uint8Array(await res.arrayBuffer());
                runner = new BbcZ80Runner({com}).start(code, {maxSteps: 200_000_000, inputs: []});
            } else {
                const {BasicMachineRunner} = await import(/* webpackChunkName: "bw-board" */ '../../lib/bw-board/basic-machine-runner.js');
                const res = await fetch('static/roms/basic.rom');
                if (!res.ok) throw new Error('Failed to load basic.rom');
                const rom = new Uint8Array(await res.arrayBuffer());
                runner = new BasicMachineRunner({rom}).start(code, {maxMs: 30000, inputs: []});
            }
            this.setState({status: '', basicIsBbc: isBbc});
            const pumpSlice = isBbc ? 500_000 : 50;
            const tick = () => {
                const r = runner.pump(pumpSlice);
                this.setState({output: r.output || '…', basicRawOutput: isBbc ? runner.rawOutput : ''});
                if (!r.done) { requestAnimationFrame(tick); return; }
                let suffix = '';
                if (r.reason === 'budget') suffix = '\n' + this.L.basicBudget(isBbc ? 0 : 30000);
                else if (r.reason === 'input-exhausted') suffix = '\n' + this.L.basicInputExhausted;
                else if (r.reason === 'no-ready-prompt') suffix = '\n' + this.L.basicNoPrompt;
                this.setState({output: (r.output + suffix).trim() || '(no output)', running: false,
                    basicRawOutput: isBbc ? runner.rawOutput : ''});
            };
            requestAnimationFrame(tick);
        } catch (e) {
            this.setState({output: `Error: ${e.message}`, running: false, status: ''});
        }
    }

    // Fetch examples/index.json once — the same file the Circuit tab's gallery
    // loads (see circuit-tab.jsx loadExamples). Kept as a fetch, not an import:
    // the catalog is data for a control most users never open. Only entries that
    // are programs (kind 'program' or 'full') with an actual program.bw file are
    // kept; circuit-only entries have nothing to put in the editor.
    async loadCatalog () {
        if (this.state.catalog || this._catalogLoading) return;
        this._catalogLoading = true;
        try {
            const res = await fetch('examples/index.json');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const list = (Array.isArray(data) ? data : (data.examples || []))
                .filter(ex => (ex.kind === 'program' || ex.kind === 'full') && ex.files && ex.files.program);
            this.setState({catalog: list, catalogError: null});
        } catch (e) {
            this.setState({catalogError: e.message});
        }
        this._catalogLoading = false;
    }

    // Normalize a device id for matching the catalog's `devices` values against
    // the Device dropdown's ids. Both sides are lowercase-with-dashes today
    // ('arduino-uno', 'stc12c5a60s2', 'attiny88', 'pico', 'eater6502'); the
    // normalization keeps a case or underscore drift from silently emptying the list.
    _normDevice (id) {
        return normalizeDeviceId(id);
    }

    /** All catalog entries, with compatibility flag for the given device. */
    catalogForDevice (device) {
        const dev = this._normDevice(device);
        return (this.state.catalog || []).map(ex => {
            // Older catalog rows use singular `device`; treating its absence
            // from `devices` as "works everywhere" exposed Nano/Mega examples
            // under micro:bit and every other unrelated board.
            const devices = ex.devices || (ex.device ? [ex.device] : []);
            const compatible = devices.length === 0 || devices.some(d => this._normDevice(d) === dev);
            return { ...ex, devices, _compatible: compatible };
        }).filter(ex => ex._compatible);
    }

    // Load a catalog example's program.bw into the pseudocode editor. If the
    // program's DEVICE line differs from the selected device, retarget it via
    // SB3Creator.retargetPseudocode; a refusal shows its reasons in the status
    // line (the tab's existing warning surface) and loads nothing.
    async loadCatalogExample (ex, deviceOverride) {
        this.publishGameControls(null);
        this._lastCatalogExample = ex;
        // A row's device chip passes its device explicitly; a plain row
        // click keeps the buffer's DEVICE. Before the chips existed the
        // only way to pick was the separate device dropdown, which nobody
        // found — 'we click Nano and receive stc12 anyway' (owner).
        // kind:'full' examples (retro console, calculator) default to their
        // AUTHORED device — current-chip-first loaded a generated LED bench
        // where the curated build's matrices belonged (parity with cui's
        // ExamplesBrowser ca6d810).
        let device = (deviceOverride && this._normDevice(deviceOverride)) ||
            null;
        if (!device && ex.kind === 'full' && ex.authored) {
            device = this._normDevice(ex.authored);
        }
        if (!device) device = this.currentDevice();
        this.setState({showCatalog: false, busy: true, status: ''});
        try {
            const res = await fetch(`examples/${ex.files.program}`);
            if (!res.ok) throw new Error(`program: HTTP ${res.status}`);
            let src = await res.text();
            const exDevice = this._normDevice((src.match(/^DEVICE\s+([\w-]+)/im) || [])[1]);
            let warnings = [];
            if (device && exDevice && exDevice !== device) {
                const SB3Creator = (await this.lib()).default;
                if (SB3Creator.retargetPseudocode) {
                    const result = SB3Creator.retargetPseudocode(src, device);
                    if (!result.ok) {
                        this.setState({busy: false,
                            status: `Cannot load "${ex.id}" for ${device}: ${(result.reasons || []).join('; ')}`});
                        return;
                    }
                    src = result.pseudocode;
                    warnings = result.warnings || [];
                }
            }
            const resolvedBench = resolveExampleBench(ex, device, exDevice);
            if (resolvedBench.error) {
                this.setState({busy: false, status: resolvedBench.error});
                return;
            }
            // Loading an example must produce a RUNNABLE project, not just
            // editor text: without the compile the VM kept the previous
            // project's pins and device, the Circuit tab rendered the OLD
            // chip and the debugger said 'no pins declared' (owner report:
            // Nano + 8-LED chaser showed an stc12, 2026-08-17). setState is
            // async — compile in its callback, on the NEW buffer.
            this.setState({busy: false, lang: 'pseudocode', output: null,
                status: warnings.length ? warnings.join('; ') : '',
                buffers: {pseudocode: src, python: '', javascript: '', c: '', basic: '', asm: '', micropython: ''}},
            () => {
                Promise.resolve(this.compile()).catch(e => this.setState(
                    {status: `Loaded, but building the project failed: ${e.message}`}));
            });
            // A FACEPLATE example ships a controller layout beside its
            // program (files.controller): restore it into the live panel so
            // the widgets + variable bindings arrive ready-made. Same shape
            // gui.jsx restores from runtime.stc.controller on PROJECT_LOADED.
            if (ex.files && ex.files.controller) {
                try {
                    const cres = await fetch(`examples/${ex.files.controller}`);
                    if (cres.ok) {
                        const layout = await cres.json();
                        const rt = this.props.vm && this.props.vm.runtime;
                        const panel = rt && rt.controllerPanel;
                        if (panel && layout && Array.isArray(layout.widgets)) {
                            for (const name of panel.getWidgetNames()) panel.removeWidget(name);
                            // ONE BAD WIDGET MUST NOT EMPTY THE PANEL. This loop
                            // removes every existing widget before it adds any,
                            // and used to sit inside the outer bare `catch` — so
                            // a single `addWidget` throw (an unknown type, a
                            // duplicate name) left the panel with nothing at all
                            // and no message. `6502-terminal` declared a
                            // `terminal` widget the model did not have, and lost
                            // its keyboard along with its screen
                            // (docs/LESSON-REVIEW-WAVE-4.md defect 8). Skip the
                            // widget that fails, keep the rest, and say so.
                            const skipped = [];
                            for (const w of layout.widgets) {
                                try {
                                    const added = panel.addWidget(w.name, w.type, w.config || {}, w.layout || {});
                                    if (w.binding) added.binding = { ...w.binding };
                                } catch (err) {
                                    skipped.push(`${w && w.name} (${w && w.type})`);
                                }
                            }
                            if (skipped.length) {
                                this.setState(st => ({status: [st.status,
                                    `Controller layout: skipped ${skipped.join(', ')}`]
                                    .filter(Boolean).join('; ')}));
                            }
                            // A layout that names no mode opens in `edit`, where
                            // every input control renders disabled — so a
                            // faceplate of buttons comes up dead. Four shipped
                            // layouts were in that state; they now declare it,
                            // and the panel's own toJSON carries it through a
                            // save (Wave 4 defect 5b).
                            if (layout.mode) panel.setMode(layout.mode);
                            if (rt.stc) rt.stc.controller = layout;
                        }
                    }
                } catch { /* a faceplate without its layout still loads the program */ }
            }
            // The PROGRAM retargeted; the BENCH must follow or the runner
            // falls back to an inferred, unseated board. But the AUTHORED
            // circuit outranks any generated bench for the example's own
            // device: the calculator's authored board has the real 16-button
            // matrix and the OLED, while the generated bench is a generic
            // LED-per-pin approximation (owner screenshots, 2026-08-17).
            // Only a genuinely retargeted device gets its generated bench.
            const benchPath = resolvedBench.path;
            if (benchPath && typeof window !== 'undefined') {
                const detail = {benchPath, exampleId: ex.id, device: device || exDevice};
                // Stash before dispatch: the Circuit tab consumes the event,
                // but the debug RUNNER may boot later (or without that tab
                // ever mounting) and must find the example's real circuit
                // instead of inferring a phantom bench (owner report — the
                // multimeter showed 8 auto-LEDs where the LM358 build was).
                window.__bwExampleBench = detail;
                window.dispatchEvent(new CustomEvent('bw-example-bench', {detail}));
            }
        } catch (e) {
            this.setState({busy: false, status: this.L.stError(e.message)});
        }
    }

    async loadExample (key) {
        const loaded = key && (await this._loadBundledExamples());
        const src = loaded && loaded[key];
        if (!src) return;
        this.publishGameControls(GROUPS[0].items.some(([gameKey]) => gameKey === key) ? key : null);
        const device = this.currentDevice();
        const exampleDevice = (src.match(/^DEVICE\s+([\w-]+)/im) || [])[1];
        // Retarget hardware examples when the selected device differs.
        if (device && exampleDevice && device !== exampleDevice.toLowerCase()) {
            const SB3Creator = (await this.lib()).default;
            const result = SB3Creator.retargetPseudocode(src, device);
            if (result.ok) {
                this.setState({lang: 'pseudocode', output: null,
                    status: result.warnings.length ? result.warnings.join('; ') : '',
                    buffers: {pseudocode: result.pseudocode, python: '', javascript: '', c: '', basic: '', asm: '', micropython: ''}});
                return;
            }
            // Show what blocked the retarget — the example stays loaded in its original form.
            this.setState({lang: 'pseudocode', output: null,
                status: `Loaded for ${exampleDevice} (cannot retarget to ${device}: ${result.reasons.join('; ')})`,
                buffers: {pseudocode: src, python: '', javascript: '', c: '', basic: '', asm: '', micropython: ''}});
            return;
        }
        this.setState({lang: 'pseudocode', output: null, status: '',
            buffers: {pseudocode: src, python: '', javascript: '', c: '', basic: '', asm: '', micropython: ''}});
    }

    publishGameControls (gameKey) {
        const runtime = this.props.vm && this.props.vm.runtime;
        if (!runtime) return;
        runtime.bwGameControlKey = gameKey || null;
        runtime.emit('BW_GAME_CONTROLS_CHANGED', runtime.bwGameControlKey);
        if (gameKey && typeof window !== 'undefined') {
            try { localStorage.setItem('bw-right-pane-hidden', '0'); } catch { /* private mode */ }
            window.dispatchEvent(new CustomEvent('bw-settings-change', {
                detail: {key: 'bw-right-pane-hidden', value: '0'}
            }));
        }
    }

    gameKeyForSource (source) {
        if (!source) return null;
        const firstLine = String(source).split('\n', 1)[0].trim();
        const match = GROUPS[0].items.find(([key]) =>
            String(examples[key] || '').split('\n', 1)[0].trim() === firstLine);
        return match ? match[0] : null;
    }
    // Sprite names declared in the current pseudocode — used to populate the
    // "associate SVG → sprite" dropdowns so you pick a real sprite, not guess a name.
    spriteNames () {
        const src = this.state.lang === 'pseudocode' ? this.activeCode() : this.state.buffers.pseudocode;
        const names = [];
        const re = /^\s*SPRITE\s+([^\s:]+)/gm;
        let m;
        while ((m = re.exec(src || '')) !== null) names.push(m[1]);
        return names;
    }
    handleFiles (e) {
        const files = Array.from(e.target.files || []);
        files.forEach(f => {
            if (!/\.svg$/i.test(f.name) && !f.type.includes('svg')) return;
            const reader = new FileReader();
            reader.onload = () => this.setState(s => ({
                uploads: [...s.uploads, {sprite: '', filename: f.name, svg: String(reader.result), mode: 'replace'}]
            }));
            reader.readAsText(f);
        });
        e.target.value = '';
    }
    setUpload (i, patch) {
        this.setState(s => ({uploads: s.uploads.map((u, idx) => (idx === i ? {...u, ...patch} : u))}));
    }
    removeUpload (i) {
        this.setState(s => ({uploads: s.uploads.filter((_, idx) => idx !== i)}));
    }
    // Compile the active tab's code to blocks. Python/JavaScript go through their
    // parser to pseudocode first. After loading, the other two tabs are regenerated
    // from the compiled project so all three stay consistent.
    async compile () {
        const lang = this.state.lang;
        if (!TWO_WAY.has(lang)) { this.setState({status: this.L.stCOneWay}); return; }
        this.setState({busy: true, status: this.L.stCompiling});
        try {
            let source = this.activeCode();
            let parseWarnings = [];
            if (lang === 'python') {
                const res = (await import(/* webpackChunkName: "sb3-creator-python" */ '../../lib/sb3-creator-python.js')).default(source);
                source = res.pseudocode; parseWarnings = res.warnings || [];
            } else if (lang === 'javascript') {
                const res = (await import(/* webpackChunkName: "sb3-creator-javascript" */ '../../lib/sb3-creator-javascript.js')).default(source);
                source = res.pseudocode; parseWarnings = res.warnings || [];
            } else if (lang === 'basic') {
                const res = (await import(/* webpackChunkName: "sb3-creator-basic" */ '../../lib/sb3-creator-basic.js')).default(source);
                source = res.pseudocode; parseWarnings = res.warnings || [];
            } else if (lang === 'c') {
                // Keil C51 is a different dialect — sbit/sfr/_at_/reg5x headers that SDCC
                // does not accept and our front end does not model. stc-compiler already
                // solves that (546/597 of an 86-repo corpus), so normalise through it first
                // rather than teaching the front end a second dialect. Best effort: if the
                // service is unreachable we parse the original text and say so.
                let text = source;
                if (this.looksLikeKeil(source)) {
                    const t = await this.translateKeil(source);
                    if (t.ok) { text = t.code; parseWarnings.push('Keil C51 normalised to SDCC via stc-compiler'); }
                    else parseWarnings.push(`could not reach the Keil translator (${t.error}) — parsing the original`);
                }
                const res = await this.readC(text);
                source = res.pseudocode; parseWarnings = parseWarnings.concat(res.warnings || []);
            }
            const SB3Creator = (await this.lib()).default;
            const creator = new SB3Creator();
            creator.parse(source);
            const missing = [];
            this.state.uploads.forEach(u => {
                const name = (u.sprite || '').trim();
                if (!name || !u.svg) return;
                const ok = u.mode === 'add' ?
                    creator.addCustomSVGCostume(name, u.svg, u.filename.replace(/\.svg$/i, '')) :
                    creator.applyCustomSVG(name, u.svg);
                if (!ok) missing.push(name);
            });
            const blob = await creator.generateSB3();
            await this.props.vm.loadProject(await blob.arrayBuffer());
            // Auto-select the first sprite with scripts so the Blocks palette
            // shows meaningful blocks, not "Stage selected — no motion blocks".
            const vm = this.props.vm;
            if (vm.runtime && vm.runtime.targets) {
                const best = vm.runtime.targets.find(
                    t => !t.isStage && t.blocks.getScripts().length > 0
                ) || vm.runtime.targets.find(t => !t.isStage);
                if (best) {
                    vm.setEditingTarget(best.id);
                }
            }
            // The .sb3 carries the STC12 declarations as a top-level `stc` key, but
            // scratch-vm's serializer only knows targets/monitors/extensions/meta and
            // drops everything else — so vm.toJSON().stc has always come back
            // undefined, and every reader of it (the circuit designer, the simulator
            // driver's pin table) silently saw a project with no pins. Keep them on
            // the runtime, which survives for as long as the project is loaded.
            // Not a substitute for the VM carrying them: re-opening a saved .sb3
            // still loses the pins until it does.
            // Set stc on the runtime AND write the persistence comment so it
            // survives a save/reload cycle. readStc recovers from the comment if
            // the top-level key was stripped by a foreign round trip.
            const stc = creator.project.stc || null;
            if (stc) stc.pinsSource = 'program';
            { const stcTraceObj = stc; if (typeof window !== 'undefined') { (window.__bwStcTrace = window.__bwStcTrace || []).push({who: 'importerCompile', t: Date.now(), b4: JSON.stringify((stcTraceObj && stcTraceObj.pins || []).find(p => p.name === 'b4') || null)}); } }
            if (this.props.vm.setStc) {
                this.props.vm.setStc(stc);
            } else {
                this.props.vm.runtime.stc = stc;
            }
            // Re-call getInfo() on loaded extensions so device-dependent gating
            // (e.g. hiding PWM blocks on AVR, PCA blocks on STC89) takes effect.
            if (this.props.vm.extensionManager && this.props.vm.extensionManager.refreshBlocks) {
                this.props.vm.extensionManager.refreshBlocks();
            }
            // Write the persistence comment on the stage target
            if (stc) {
                const SB3Creator = (await this.lib()).default || (await this.lib());
                if (SB3Creator.writeStcComment) {
                    const proj = JSON.parse(this.props.vm.toJSON());
                    proj.stc = stc;
                    SB3Creator.writeStcComment(proj);
                    // Write the comment back onto the actual stage target's comments
                    const stage = this.props.vm.runtime.getTargetForStage();
                    if (stage && proj.targets) {
                        const serialStage = proj.targets.find(t => t.isStage);
                        if (serialStage && serialStage.comments) {
                            const comment = serialStage.comments[SB3Creator.STC_COMMENT_ID];
                            if (comment) {
                                stage.createComment(SB3Creator.STC_COMMENT_ID,
                                    null, comment.text, comment.x, comment.y,
                                    comment.width, comment.height, comment.minimized);
                            }
                        }
                    }
                }
            }
            // Show the target the blocks actually landed on. Every program this
            // dialect generates is Stage-only, so `find(!isStage)` returns
            // undefined and the old `if (first)` quietly did nothing: the editor
            // kept whichever target was selected before the import, and the new
            // blocks were real, correct, and on a Stage nobody was looking at.
            // That is what "to blocks does not draw the blocks" was.
            const first = this.props.vm.runtime.targets.find(target => !target.isStage) ||
                this.props.vm.runtime.getTargetForStage();
            if (first) this.props.vm.setEditingTarget(first.id);
            // regenerate the other tabs from the compiled project
            const proj = creator.project;
            const nb = {...this.state.buffers};
            if (lang !== 'pseudocode') nb.pseudocode = new SB3Creator().decompile(proj);
            if (lang !== 'python') nb.python = new SB3Creator().generatePython(proj, this.genOpts());
            if (lang !== 'javascript') nb.javascript = new SB3Creator().generateJavaScript(proj, this.genOpts());
            nb.c = new SB3Creator().generateC(proj);
            {
                const br = new SB3Creator().generateBASIC(proj, {profile: this.state.basicProfile, lineNumbers: this.state.basicLineNumbers});
                nb.basic = br.ok ? br.basic : `REM === Cannot show as BASIC ===\n${br.reasons.map(s => 'REM ' + s).join('\n')}`;
            }
            nb.asm = ''; // cleared — re-fetched on next ASM tab switch
            {
                const mp = new SB3Creator().generateMicroPython(proj);
                nb.micropython = mp.ok ? mp.py : `# === Cannot generate MicroPython ===\n${mp.reasons.map(s => '# ' + s).join('\n')}`;
                // Regenerated from blocks: whatever was imported is gone.
                this.setState({importedPython: false});
            }
            const warns = [...parseWarnings, ...creator.warnings];
            if (missing.length) warns.push(`no sprite named: ${missing.join(', ')}`);
            const classified = classifyConversionWarnings(warns);
            this.setState({
                buffers: nb,
                status: warns.length ? this.L.stWarn(warns.slice(0, 4).join(' · ')) : this.L.stLoaded,
                conversionReport: {direction: `${LANG_LABEL[lang] || lang} → Blocks`, preserved: true,
                    changed: classified.changed, unsupported: classified.unsupported}
            });
        } catch (e) {
            this.setState({status: this.L.stError(e.message), conversionReport: {
                direction: `${LANG_LABEL[lang] || lang} → Blocks`, preserved: false,
                changed: [], unsupported: [e.message]
            }});
        }
        this.setState({busy: false});
    }
    // Read the running project into all languages at once.
    async fromBlocks () {
        this.setState({busy: true, status: this.L.stReading, conversionReport: null});
        try {
            const SB3Creator = (await this.lib()).default;
            const project = JSON.parse(this.props.vm.toJSON());
            const basicResult = new SB3Creator().generateBASIC(project, {profile: this.state.basicProfile, lineNumbers: this.state.basicLineNumbers});
            const mpResult = new SB3Creator().generateMicroPython(project);
            const buffers = {
                pseudocode: new SB3Creator().decompile(project),
                python: new SB3Creator().generatePython(project, this.genOpts()),
                javascript: new SB3Creator().generateJavaScript(project, this.genOpts()),
                c: new SB3Creator().generateC(project),
                basic: basicResult.ok ? basicResult.basic : `REM === Cannot show as BASIC ===\n${basicResult.reasons.map(s => 'REM ' + s).join('\n')}`,
                asm: '', // cleared — re-fetched on next ASM tab switch
                micropython: mpResult.ok ? mpResult.py : `# === Cannot generate MicroPython ===\n${mpResult.reasons.map(s => '# ' + s).join('\n')}`
            };
            this.setState({importedPython: false});
            const unsupported = (buffers.pseudocode.match(/^# unsupported:/gm) || []).length;
            this.setState({
                buffers,
                output: null,
                status: unsupported ?
                    `Read into all languages — ${unsupported} block(s) not representable in pseudocode (left as comments).` :
                    'Read the current project into all languages. Edit any of them, then “To blocks”.',
                conversionReport: {direction: 'Blocks → Code', preserved: true, changed: [],
                    unsupported: unsupported ? [`${unsupported} block(s) left as unsupported comments`] : []}
            });
        } catch (e) {
            this.setState({status: this.L.stError(e.message), conversionReport: {
                direction: 'Blocks → Code', preserved: false, changed: [], unsupported: [e.message]
            }});
        }
        this.setState({busy: false});
    }

    /** Imperative API: highlight a source line (1-based) in the editor.
     *  Used by the debugger for BASIC TRACE glow and current-PC highlight. */
    setHighlightedLine (n) {
        if (this._cmEditor && this._cmEditor.setHighlightedLine) {
            this._cmEditor.setHighlightedLine(n);
        }
    }

    /** Toggle maximize: collapse reference/art/info panels and hide the right pane. */
    toggleMaximize () {
        const next = !this.state.maximized;
        this.setState({maximized: next, showRef: false, showArt: false, showInfo: false});
        try { localStorage.setItem('bw-editor-max', next ? '1' : '0'); } catch { /* noop */ }
        // Toggle the right pane via the existing mechanic
        window.dispatchEvent(new CustomEvent('bw-settings-change', {
            detail: {key: 'bw-right-pane-hidden', value: next ? '1' : '0'}
        }));
    }

    // The "Load example…" control when a chip is selected: a button opening a
    // searchable popover over the catalog (examples/index.json). A native
    // <select> cannot hold a search input, and the catalog is large enough
    // (100+ programs, up to ~90 per device) that scrolling unaided is not an
    // answer — hence the filter box the spec asks for.
    renderCatalogControl (csel) {
        const device = this.currentDevice();
        const unsorted = this.catalogForDevice(device);
        // Compatible examples first, then incompatible (greyed with "Needs:")
        const list = unsorted.sort((a, b) => (b._compatible ? 1 : 0) - (a._compatible ? 1 : 0));
        const q = this.state.exampleFilter.trim().toLowerCase();
        const locale = pickLocale(this.props.locale);
        const rows = q ? list.filter(ex => {
            const t = ex.title || {};
            return [t.en || '', t.de || '', ex.id].some(s => String(s).toLowerCase().includes(q));
        }) : list;
        const open = this.state.showCatalog;
        return (
            <span style={{position: 'relative', alignSelf: 'center'}}>
                <button type="button"
                    onClick={() => { this.loadCatalog(); this.setState(s => ({showCatalog: !s.showCatalog})); }}
                    style={{...csel, cursor: 'pointer', border: '1px solid #cbd5e1',
                        background: open ? '#e2e8f0' : '#f1f5f9'}}
                    title={this.L.loadCatalogTitle} data-testid="bw-catalog-toggle">
                    {this.L.loadExample}
                </button>
                {open && (
                    <div style={{position: 'absolute', top: '100%', right: 0, zIndex: 60, marginTop: 4,
                        width: 340, maxHeight: 380, display: 'flex', flexDirection: 'column',
                        background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8,
                        boxShadow: '0 8px 24px rgba(15,23,42,.18)', textAlign: 'left'}}
                        data-testid="bw-catalog-panel">
                        <input type="search" value={this.state.exampleFilter} autoFocus
                            onChange={e => this.setState({exampleFilter: e.target.value})}
                            placeholder={this.L.searchExamples}
                            style={{margin: 8, padding: '6px 10px', border: '1px solid #cbd5e1',
                                borderRadius: 6, font: 'inherit', fontSize: 13}}
                            data-testid="bw-catalog-search" />
                        <div style={{overflowY: 'auto', padding: '0 8px 8px', minHeight: 0}}>
                            {this.state.catalogError ? (
                                <div style={{padding: '6px 8px', fontSize: 12, color: '#b45309'}}>
                                    {this.L.catalogUnavailable(this.state.catalogError)}
                                </div>
                            ) : !this.state.catalog ? (
                                <div style={{padding: '6px 8px', fontSize: 12, color: '#64748b'}}>
                                    {this.L.catalogLoading}
                                </div>
                            ) : list.every(ex => ex._compatible === false) ? (
                                <div style={{padding: '6px 8px', fontSize: 12, color: '#64748b'}}>
                                    {this.L.catalogEmpty}
                                </div>
                            ) : rows.length === 0 ? (
                                <div style={{padding: '6px 8px', fontSize: 12, color: '#64748b'}}>
                                    {this.L.catalogNoMatch}
                                </div>
                            ) : rows.map(ex => {
                                const t = ex.title || {};
                                const title = (locale === 'de' ? t.de : t.en) || t.en || ex.id;
                                const compat = ex._compatible !== false;
                                const needsLabel = !compat && (ex.devices || []).length > 0
                                    ? this.L.catalogNeeds((ex.devices || []).map(d => DEVICE_CHIP_LABELS[d] || d).join(', '))
                                    : null;
                                return (
                                    <button key={ex.id} type="button"
                                        onClick={() => this.loadCatalogExample(ex)}
                                        style={{display: 'block', width: '100%', textAlign: 'left',
                                            padding: '5px 8px', border: 'none', borderRadius: 6,
                                            background: 'transparent', cursor: 'pointer',
                                            font: 'inherit', fontSize: 13,
                                            color: compat ? '#1e293b' : '#94a3b8',
                                            opacity: compat ? 1 : 0.7}}
                                        title={ex.id} data-testid="bw-catalog-item">
                                        {title}
                                        <span style={{marginLeft: 6, fontSize: 11, color: '#94a3b8'}}>{ex.id}</span>
                                        {needsLabel && (
                                            <span style={{display: 'block', fontSize: 10, fontStyle: 'italic',
                                                color: '#b45309', marginTop: 1}}>{needsLabel}</span>
                                        )}
                                        {(ex.devices || []).length > 1 ? (
                                            <span style={{display: 'block', marginTop: 2}}>
                                                {(ex.devices || []).map(d => {
                                                    const isActive = this._normDevice(d) === this._normDevice(device);
                                                    return (
                                                        <span key={d} role="button" tabIndex={0}
                                                            data-testid="bw-catalog-device"
                                                            onClick={e => { e.stopPropagation(); this.loadCatalogExample(ex, d); }}
                                                            onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); this.loadCatalogExample(ex, d); } }}
                                                            style={{display: 'inline-block', margin: '0 4px 2px 0',
                                                                padding: '0 6px', borderRadius: 8, fontSize: 10,
                                                                background: isActive ? '#3b82f6' : '#e2e8f0',
                                                                color: isActive ? '#fff' : '#334155',
                                                                cursor: 'pointer'}}>
                                                            {DEVICE_CHIP_LABELS[d] || d}
                                                        </span>
                                                    );
                                                })}
                                            </span>
                                        ) : null}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </span>
        );
    }

    renderActionMenu (csel) {
        const item = {...csel, display: 'block', width: '100%', boxSizing: 'border-box',
            textAlign: 'left', cursor: 'pointer', border: 'none', background: 'transparent'};
        return (
            <details style={{position: 'relative', alignSelf: 'center'}} data-testid="bw-code-actions"
                onToggle={event => {
                    this.setState({actionsOpen: event.currentTarget.open});
                }}>
                <summary style={{...csel, cursor: 'pointer', listStyle: 'none', border: '1px solid #cbd5e1',
                    background: '#f1f5f9', whiteSpace: 'nowrap'}} title="Open, save, import, examples and reference">
                    ⋯
                </summary>
                <div style={{position: 'absolute', top: '100%', right: 0, zIndex: 70, marginTop: 4,
                    width: 220, padding: 6, background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8,
                    boxShadow: '0 8px 24px rgba(15,23,42,.2)', display: 'flex', flexDirection: 'column', gap: 2}}>
                    <label style={item} title={this.L.openFileTitle(`${CODE_ACCEPT},${IMPORT_ACCEPT}`)}
                        data-testid="bw-open-file">
                        {this.L.openFile}
                        <input type="file" accept={`${CODE_ACCEPT},${IMPORT_ACCEPT}`} style={{display: 'none'}}
                            onChange={this.openCodeFile} />
                    </label>
                    <button type="button" onClick={this.saveCodeFile} style={item}
                        title={this.L.saveFileTitle(this.saveFileName())} data-testid="bw-save-file">
                        {this.L.saveFile}
                    </button>
                    <button type="button" onClick={this.openMakeCodeShare} style={item}
                        title={this.L.mcShareTitle} data-testid="bw-makecode-share">
                        {this.L.mcShare}
                    </button>
                    {['microbit', 'calliopemini'].includes(this.currentDevice()) ? (
                        <button type="button" onClick={this.exportMakeCode} style={item}
                            title={this.L.mcExportTitle} disabled={this.state.busy}
                            data-testid="bw-makecode-export">{this.L.mcExport}</button>
                    ) : null}
                    {this._makeCodeProject ? (
                        <button type="button" onClick={() => this.exportMakeCodeSource()} style={item}
                            title={this.L.exportMakeCodeTitle} data-testid="bw-export-makecode-source">
                            {this.L.exportMakeCode}
                        </button>
                    ) : null}
                    <div style={{borderTop: '1px solid #e2e8f0', margin: '3px 0'}} />
                    {this.currentDevice() ? this.renderCatalogControl(item) :
                        this.state.bundledExamplesStatus === 'error' ? (
                            <button type="button" onClick={this._loadBundledExamples} style={item}
                                title={this.L.loadExampleTitle} data-testid="bw-load-example-retry">
                                {this.L.examplesRetry}
                            </button>
                        ) : this.state.bundledExamplesStatus !== 'ready' ? (
                            <span style={{...item, cursor: 'wait', color: '#64748b'}} aria-live="polite"
                                data-testid="bw-load-example-loading">{this.L.examplesLoading}</span>
                        ) : (
                        <select defaultValue="" onChange={e => this.loadExample(e.target.value)}
                            style={{...item, border: 'none'}} title={this.L.loadExampleTitle}
                            data-testid="bw-load-example">
                            <option value="" disabled>{this.L.loadExample}</option>
                            {GROUPS.map(g => (
                                <optgroup key={g.label} label={g.label}>
                                    {g.items.filter(([k]) => examples[k]).map(([k, label]) =>
                                        <option key={k} value={k}>{label}</option>)}
                                </optgroup>
                            ))}
                        </select>
                    )}
                    <button type="button" onClick={() => this.setState(s => ({showRef: !s.showRef}))}
                        style={item} title={this.L.referenceTitle(this.state.lang)}>📝 {this.L.reference}</button>
                    <button type="button" onClick={() => this.setState(s => ({showArt: !s.showArt}))}
                        style={item} title={this.L.customArtTitle}>
                        🖼️ {this.L.customArt}{this.state.uploads.length ? ` (${this.state.uploads.length})` : ''}
                    </button>
                </div>
            </details>
        );
    }

    render () {
        // The selected .tab-panel is display:flex (row); like .blocks-wrapper we must
        // flex-grow to fill the column width, else we shrink to content (~660px) and
        // leave a big gap before the stage.
        // overflow:hidden so the Code tab container does NOT scroll — CM6's own
        // .cm-scroller handles scrolling inside the editor. minHeight:0 prevents
        // the flex min-height:auto trap that makes tall content overflow.
        const wrap = {height: '100%', flex: '1 1 auto', minWidth: 0, minHeight: 0, boxSizing: 'border-box', padding: 16, overflow: 'hidden',
            display: 'flex', flexDirection: 'column', font: '14px/1.5 sans-serif', color: '#575e75'};
        const btn = {padding: '10px 18px', borderRadius: 8, border: 'none', color: '#fff', cursor: 'pointer',
            fontWeight: 600, background: 'linear-gradient(135deg,#4c97ff,#4280d7)'};
        const sel = {padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', font: 'inherit'};
        const max = this.state.maximized;
        const csel = {...sel, padding: '4px 8px', fontSize: 12}; // compact select
        return (
            <div style={wrap}>
                {/* ── Single merged row: language tabs (left) + compact controls (right) ── */}
                <div style={{display: 'flex', gap: 2, marginBottom: -1, alignItems: 'flex-end', flexWrap: 'nowrap', flexShrink: 0}}
                    data-testid="bw-lang-row">
                    {[['pseudocode', '🧩 Pseudo'], ['python', '🐍 Py'], ['javascript', '🟨 JS'], ['c', '🔧 C'], ['basic', '📺 BAS'], ['asm', '🔩 ASM'],
                        // The tab follows the DEVICE line, except when a
                        // MicroPython program was imported from a .hex: there
                        // is no pseudocode then, and hiding the tab would hide
                        // the Run button of the one program we can run as-is.
                        ...(this.currentDevice() === 'microbit' || (this.state.buffers.micropython || '').trim() ?
                            [['micropython', '🤖 micro:bit']] : [])].map(([l, label]) => {
                        const active = this.state.lang === l;
                        return (
                            <button key={l} type="button" aria-pressed={active} onClick={() => this.switchTab(l)}
                                disabled={this.state.busy && !active}
                                style={{padding: '6px 10px', border: '1px solid #cbd5e1', borderBottom: active ? '1px solid #fff' : '1px solid #cbd5e1',
                                    borderRadius: '8px 8px 0 0', cursor: 'pointer', fontWeight: active ? 700 : 500, fontSize: 13,
                                    background: active ? '#fff' : '#eef2f7', color: active ? '#1e293b' : '#64748b',
                                    position: 'relative', top: active ? 0 : 1, whiteSpace: 'nowrap'}}>
                                {label}
                            </button>
                        );
                    })}
                    <span style={{flex: 1, minWidth: 4}} />
                    {/* Compact controls */}
                    <React.Fragment>
                        <button type="button" onClick={() => this.setState(s => ({showInfo: !s.showInfo}))}
                            aria-label={this.L.infoAria} title={this.L.infoTitle}
                            style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20,
                                padding: 0, border: 'none', borderRadius: '50%', background: this.state.showInfo ? '#4c97ff' : '#e2e8f0',
                                color: this.state.showInfo ? '#fff' : '#475569', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                fontStyle: 'italic', alignSelf: 'center'}}>
                            i
                        </button>
                        <select value={this.currentDevice() || ''} onChange={e => this.setDevice(e.target.value)}
                            style={{...csel, alignSelf: 'center'}} title={this.L.deviceTitle}
                            data-testid="bw-device-select">
                            <option value="">{this.L.noChips}</option>
                            {DEVICE_GROUPS.map(g => (
                                <optgroup key={g.label} label={g.label}>
                                    {g.devices.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                                </optgroup>
                            ))}
                        </select>
                        {this.renderActionMenu(csel)}
                    </React.Fragment>
                    {/* In maximize mode: compact To/From-blocks in the tab row */}
                    {max && (
                        <React.Fragment>
                            <button onClick={this.compile}
                                disabled={this.state.busy || !this.activeCode().trim() || !TWO_WAY.has(this.state.lang)}
                                title={this.L.toBlocksTitle(LANG_LABEL[this.state.lang])}
                                style={{...csel, cursor: 'pointer', fontWeight: 600, alignSelf: 'center',
                                    background: 'linear-gradient(135deg,#4c97ff,#4280d7)', color: '#fff', border: 'none'}}>
                                {this.L.compactToBlocks}
                            </button>
                            <button onClick={this.fromBlocks} disabled={this.state.busy}
                                title={this.L.fromBlocksTitle}
                                style={{...csel, cursor: 'pointer', fontWeight: 600, alignSelf: 'center',
                                    background: 'linear-gradient(135deg,#a55b80,#8e4a6c)', color: '#fff', border: 'none'}}>
                                {this.L.compactFromBlocks}
                            </button>
                        </React.Fragment>
                    )}
                    <button onClick={() => this.toggleMaximize()}
                        style={{...csel, cursor: 'pointer', background: max ? '#4c97ff' : '#f1f5f9',
                            color: max ? '#fff' : 'inherit', minWidth: 24, border: '1px solid #cbd5e1', alignSelf: 'center'}}
                        title={max ? this.L.restoreTitle : this.L.maximizeTitle}
                        data-testid="bw-editor-maximize">
                        {max ? '⊡' : '⊞'}
                    </button>
                </div>

                {this.state.showRepresentation && !max && (
                    <div data-testid="bw-representation-status" role="status"
                        style={{padding: '5px 10px', background: '#fff8e1', border: '1px solid #f0c36d',
                            borderRadius: '0 0 6px 6px', color: '#5d4300', fontSize: 11, lineHeight: 1.35,
                            flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                        <span>{representationNotice(this.state.lang, this.state.asmMode, this.props.locale)}</span>
                        <button onClick={() => this.setState({showRepresentation: false})} style={{background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px', fontSize: 14}}>✕</button>
                    </div>
                )}

                {this.state.showInfo && !max && (
                    <div style={{padding: '8px 12px', background: '#eff6ff', border: '1px solid #bfdbfe',
                        borderRadius: '0 0 8px 8px', fontSize: 12, color: '#334155', flexShrink: 0}}>
                        <div style={{fontWeight: 'bold', marginBottom: 6, color: '#1e3a8a'}}>
                            {this.currentDevice() ? deviceHelp(this.currentDevice()) : deviceHelp('default')}
                        </div>
                        {pickLocale(this.props.locale) === 'de' ? (
                            <React.Fragment>
                                Schreibe dein Projekt als Code in jedem Tab. <strong>Pseudocode</strong>, <strong>Python</strong>,{' '}
                                <strong>JavaScript</strong>, <strong>C</strong> und <strong>BASIC</strong> wandeln nur die{' '}
                                unterstützte Teilmenge in beide Richtungen um; Warnungen benennen nicht darstellbare Konstrukte:{' '}
                                <strong>⇦ Zu Blöcken</strong> kompiliert den aktiven Tab, <strong>Von Blöcken ⇨</strong>{' '}
                                liest das aktuelle Projekt in jede Sprache ein, Tab-Wechsel wandelt um.{' '}
                                <strong>ASM</strong> ist bewusst einbahnig — schreiben, assemblieren, ausführen; kein Rückweg zu Blöcken.{' '}
                                <strong>micro:bit</strong> wird für DEVICE MICROBIT generiert (noch kein Rücklesen).{' '}
                                Sprite-/Stift-Verhalten liegt in den Blöcken (die Wahrheit) — Kommentare bleiben erhalten.
                            </React.Fragment>
                        ) : (
                            <React.Fragment>
                                Write your project as code in any tab. <strong>Pseudocode</strong>, <strong>Python</strong>,{' '}
                                <strong>JavaScript</strong>, <strong>C</strong> and <strong>BASIC</strong> convert only the{' '}
                                supported subset in both directions; warnings identify constructs that cannot be represented:{' '}
                                <strong>⇦ To blocks</strong> compiles the active tab, <strong>From blocks ⇨</strong>{' '}
                                reads the current project into every language, switching tabs converts.{' '}
                                <strong>ASM</strong> is deliberately one-way — write, assemble and run.{' '}
                                <strong>micro:bit</strong> is generated for DEVICE MICROBIT (no reader yet).{' '}
                                Sprite/pen behaviour lives in the blocks (ground truth) — comments are kept.
                            </React.Fragment>
                        )}
                    </div>
                )}

                {this.state.showRef && !max && (
                    <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))',
                        gap: 12, marginBottom: 4, padding: 10, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0',
                        fontSize: 12, flexShrink: 0}}>
                        {(this.state.lang === 'pseudocode' ? SYNTAX : SUPPORTED[this.state.lang] || []).map(([h, items]) => (
                            <div key={h}>
                                <div style={{fontWeight: 700, marginBottom: 4}}>{this.L.h[h] || h}</div>
                                <ul style={{margin: 0, paddingLeft: 16}}>
                                    {items.map((it, i) => (
                                        <li key={i}><code style={{fontSize: 11}}>{it}</code></li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                )}
                {this.state.lang === 'basic' && !max && (
                    <div style={{display: 'flex', gap: 16, padding: '6px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderTop: 'none', fontSize: 13, alignItems: 'center'}}>
                        <label style={{display: 'flex', alignItems: 'center', gap: 4}}>
                            {this.L.profile}
                            <select value={this.state.basicProfile} onChange={e => this.setState({basicProfile: e.target.value, buffers: {...this.state.buffers, basic: ''}})}
                                style={{padding: '2px 6px', borderRadius: 4, border: '1px solid #cbd5e1'}}>
                                <option value="bbc">{'BBC BASIC'}</option>
                                <option value="ms">{'6502 BASIC'}</option>
                            </select>
                        </label>
                        <label style={{display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer'}}>
                            <input type="checkbox" checked={this.state.basicLineNumbers}
                                disabled={this.state.basicProfile === 'ms'}
                                onChange={e => this.setState({basicLineNumbers: e.target.checked, buffers: {...this.state.buffers, basic: ''}})} />
                            {this.L.lineNumbers}{' '}{this.state.basicProfile === 'ms' ? this.L.alwaysOn6502 : ''}
                        </label>
                    </div>
                )}
                {this.state.lang === 'asm' && !max && (
                    <div style={{display: 'flex', gap: 16, padding: '6px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderTop: 'none', fontSize: 13, alignItems: 'center'}}>
                        <label style={{display: 'flex', alignItems: 'center', gap: 4}}>
                            {this.L.asmModeLabel}
                            <select value={this.state.asmMode}
                                onChange={e => {
                                    const mode = e.target.value;
                                    this.setState({asmMode: mode});
                                    if (mode === 'listing') this.fetchAsmListing();
                                }}
                                style={{padding: '2px 6px', borderRadius: 4, border: '1px solid #cbd5e1'}}>
                                <option value="source">{this.L.asmSource}</option>
                                <option value="listing">{this.L.asmListing}</option>
                            </select>
                        </label>
                        {this.state.asmMode === 'source' && this._asmExamples().length > 0 && (
                            <label style={{display: 'flex', alignItems: 'center', gap: 4}}>
                                {this.L.asmExampleLabel}
                                <select
                                    data-testid="bw-asm-examples"
                                    onChange={e => this.loadAsmExample(e.target.value)}
                                    style={{padding: '2px 6px', borderRadius: 4, border: '1px solid #cbd5e1'}}
                                    value=""
                                >
                                    <option value="">{this.L.asmExamplePick}</option>
                                    {this._asmExamples().map(ex => (
                                        <option key={ex.id} value={ex.id}>
                                            {pickLocale(this.props.locale) === 'de' ? ex.labelDe : ex.label}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        )}
                        {/* The licence is the CONDITION these ship under, so it
                            is visible where they are chosen rather than only in
                            THIRD-PARTY-NOTICES.md. The programs also carry their
                            own AUTHOR/REPOSITORY/LICENSE header into the editor,
                            so a learner who copies the text out takes the notice
                            with them. */}
                        {this.state.asmMode === 'source' && this._asmCredit() && (
                            <a
                                data-testid="bw-asm-example-credit"
                                href={this._asmCredit().repo}
                                target="_blank" rel="noopener noreferrer"
                                title={this.L.asmCreditTitle(this._asmCredit())}
                                style={{fontSize: 11, color: '#64748b', textDecoration: 'underline'}}>
                                {this.L.asmCredit(this._asmCredit())}
                            </a>
                        )}
                        {this.state.asmMode === 'source' && (
                            <button type="button"
                                onClick={() => this.assembleAndRun()}
                                disabled={this.state.busy || !this.state.buffers.asm.trim()}
                                style={{padding: '4px 12px', borderRadius: 6, border: 'none',
                                    cursor: 'pointer', fontWeight: 600, fontSize: 12,
                                    background: 'linear-gradient(135deg,#37b24d,#2f9e44)', color: '#fff'}}
                                data-testid="bw-asm-assemble">
                                {this.L.assembleAndRun}
                            </button>
                        )}
                    </div>
                )}
                {this.state.lang === 'micropython' && !max && (
                    <div style={{display: 'flex', gap: 16, padding: '6px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderTop: 'none', fontSize: 13, alignItems: 'center'}}
                        data-testid="bw-micropython-bar">
                        <span style={{color: '#166534'}}>
                            {this.state.importedPython ? this.L.micropythonImported : this.L.micropythonReadonly}
                        </span>
                        <span style={{flex: 1}} />
                        {/* Debug granularity: block-level (marker, stock firmware) or
                            line-level (settrace, debug firmware). User's choice, persisted. */}
                        <div style={{display: 'inline-flex', border: '1px solid #a855f7', borderRadius: 6, overflow: 'hidden'}}
                            data-testid="bw-microbit-debug-level">
                            {['block', 'line'].map(lv => (
                                <button key={lv} type="button"
                                    onClick={() => this._setDebugLevel(lv)}
                                    title={lv === 'line' ? this.L.debugLineHint : this.L.debugBlockHint}
                                    style={{padding: '3px 10px', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                                        background: this.state.debugLevel === lv ? '#7c3aed' : '#faf5ff',
                                        color: this.state.debugLevel === lv ? '#fff' : '#7c3aed'}}
                                    data-testid={`bw-microbit-debug-level-${lv}`}>
                                    {lv === 'line' ? this.L.debugLevelLine : this.L.debugLevelBlock}
                                </button>
                            ))}
                        </div>
                        <button type="button"
                            onClick={() => this.flashMicrobitSimDebug()}
                            disabled={this.state.busy || !this.state.buffers.micropython.trim() || /^# ===/.test(this.state.buffers.micropython)}
                            style={{padding: '4px 12px', borderRadius: 6, border: '1px solid #a855f7',
                                cursor: 'pointer', fontWeight: 600, fontSize: 12,
                                background: '#faf5ff', color: '#7c3aed'}}
                            data-testid="bw-microbit-debug">
                            {this.L.debugOnSimulator}
                        </button>
                        <button type="button"
                            onClick={() => this.flashMicrobitSim()}
                            disabled={this.state.busy || !this.state.buffers.micropython.trim() || /^# ===/.test(this.state.buffers.micropython)}
                            style={{padding: '4px 12px', borderRadius: 6, border: 'none',
                                cursor: 'pointer', fontWeight: 600, fontSize: 12,
                                background: 'linear-gradient(135deg,#16a34a,#15803d)', color: '#fff'}}
                            data-testid="bw-microbit-flash">
                            {this.L.runOnSimulator}
                        </button>
                        <button type="button"
                            onClick={() => this.downloadMicrobitHex()}
                            disabled={this.state.busy || !this.state.buffers.micropython.trim() || /^# ===/.test(this.state.buffers.micropython)}
                            title={this.L.microbitNeedFirmware}
                            style={{padding: '4px 12px', borderRadius: 6, border: '1px solid #0ea5e9',
                                cursor: 'pointer', fontWeight: 600, fontSize: 12,
                                background: '#f0f9ff', color: '#0369a1'}}
                            data-testid="bw-microbit-download-hex">
                            {this.L.downloadHex}
                        </button>
                    </div>
                )}
                {this.state.revealed ? (
                    <React.Suspense fallback={
                        <FallbackEditor
                        value={this.activeCode()}
                        onChange={text => this.setActiveCode(text)}
                        readOnly={!TWO_WAY.has(this.state.lang) && !(this.state.lang === 'asm' && this.state.asmMode === 'source')}
                    />
                    }>
                        <CMEditor
                            ref={ref => { this._cmEditor = ref; }}
                            value={this.activeCode()}
                            onChange={text => this.setActiveCode(text)}
                            readOnly={!TWO_WAY.has(this.state.lang) && !(this.state.lang === 'asm' && this.state.asmMode === 'source')}
                            lang={this.state.lang}
                        />
                    </React.Suspense>
                ) : (
                    /* Hidden tab: the textarea stands in and CodeMirror is not fetched. */
                    <FallbackEditor
                        value={this.activeCode()}
                        onChange={text => this.setActiveCode(text)}
                        readOnly={!TWO_WAY.has(this.state.lang) && !(this.state.lang === 'asm' && this.state.asmMode === 'source')}
                    />
                )}

                {this.state.showArt && (
                <div style={{margin: '12px 0 4px', padding: 12, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8}}>
                    <p style={{margin: '0 0 8px'}}>
                        {pickLocale(this.props.locale) === 'de' ? (
                            <React.Fragment>
                                Lade eine oder mehrere <code>.svg</code>-Dateien hoch und ordne jede unten in der Tabelle
                                einem Sprite aus deinem Pseudocode zu. Bei <strong>⇦ Zu Blöcken</strong> wird jedes SVG als
                                Kostüm dieses Sprites eingebacken — <em>ersetzen</em> tauscht das Kostüm, <em>als Bild
                                hinzufügen</em> ergänzt eines für Animation.
                            </React.Fragment>
                        ) : (
                            <React.Fragment>
                                Upload one or more <code>.svg</code> files, then associate each with a sprite from your
                                pseudocode in the table below. On <strong>⇦ To blocks</strong>, every SVG is baked
                                in as that sprite&apos;s costume — <em>replace</em> swaps its costume, <em>add as frame</em>
                                appends one for animation.
                            </React.Fragment>
                        )}
                    </p>
                    <input type="file" accept=".svg,image/svg+xml" multiple onChange={this.handleFiles} />
                    {this.state.uploads.length > 0 && (() => {
                        const sprites = this.spriteNames();
                        const th = {textAlign: 'left', padding: '6px 8px', borderBottom: '2px solid #e2e8f0', fontSize: 12, opacity: .75};
                        const td = {padding: '6px 8px', borderBottom: '1px solid #eef2f7', verticalAlign: 'middle'};
                        return (
                            <table style={{borderCollapse: 'collapse', width: '100%', marginTop: 10}}>
                                <thead><tr>
                                    <th style={th}>{this.L.svgFile}</th>
                                    <th style={th}>{this.L.sprite}</th>
                                    <th style={th}>{this.L.mode}</th>
                                    <th style={th} />
                                </tr></thead>
                                <tbody>
                                    {this.state.uploads.map((u, i) => (
                                        <tr key={i}>
                                            <td style={td}>
                                                <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
                                                    <img src={`data:image/svg+xml,${encodeURIComponent(u.svg)}`} alt=""
                                                        style={{width: 36, height: 36, objectFit: 'contain', background: '#fff',
                                                            border: '1px solid #e2e8f0', borderRadius: 6, flexShrink: 0}} />
                                                    <span style={{fontSize: 12, opacity: .7, wordBreak: 'break-all'}}>{u.filename}</span>
                                                </div>
                                            </td>
                                            <td style={td}>
                                                <select value={u.sprite} onChange={e => this.setUpload(i, {sprite: e.target.value})}
                                                    style={{padding: '4px 8px', borderRadius: 6,
                                                        border: `1px solid ${u.sprite ? '#cbd5e1' : '#f0a0a0'}`, minWidth: 130}}>
                                                    <option value="">{this.L.chooseSprite}</option>
                                                    {sprites.map(n => <option key={n} value={n}>{n}</option>)}
                                                    {u.sprite && !sprites.includes(u.sprite) &&
                                                        <option value={u.sprite}>{u.sprite} ({this.L.notInCode})</option>}
                                                </select>
                                            </td>
                                            <td style={td}>
                                                <select value={u.mode} onChange={e => this.setUpload(i, {mode: e.target.value})}
                                                    style={{padding: '4px 6px', borderRadius: 6, border: '1px solid #cbd5e1'}}>
                                                    <option value="replace">{this.L.replaceCostume}</option>
                                                    <option value="add">{this.L.addFrame}</option>
                                                </select>
                                            </td>
                                            <td style={td}>
                                                <button onClick={() => this.removeUpload(i)}
                                                    style={{border: 'none', background: 'none', cursor: 'pointer', fontSize: 16}}>✕</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        );
                    })()}
                    {this.state.uploads.length > 0 && this.spriteNames().length === 0 && (
                        <p style={{margin: '8px 0 0', fontSize: 12, color: '#b45309'}}>
                            {pickLocale(this.props.locale) === 'de' ? (
                                <React.Fragment>
                                    Noch keine <code>SPRITE</code>-Deklarationen im Pseudocode gefunden — füge eine hinzu
                                    (z.&nbsp;B. <code> SPRITE Player:</code>), um ein SVG damit zu verknüpfen.
                                </React.Fragment>
                            ) : (
                                <React.Fragment>
                                    No <code>SPRITE</code> declarations found in your pseudocode yet — add one (e.g.
                                    <code> SPRITE Player:</code>) to associate an SVG with it.
                                </React.Fragment>
                            )}
                        </p>
                    )}
                    {this.state.uploads.length > 0 && (() => {
                        const unassigned = this.state.uploads.filter(u => !u.sprite).length;
                        return (
                            <div style={{marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap'}}>
                                <button type="button"
                                    onClick={() => { this.setState({showArt: false}); this.compile(); }}
                                    disabled={this.state.busy || unassigned > 0 || !this.activeCode().trim()}
                                    title={unassigned > 0 ?
                                        this.L.applyTitle(unassigned) :
                                        this.L.applyReady}
                                    style={{...btn, background: unassigned > 0 ?
                                        '#cbd5e1' : 'linear-gradient(135deg,#3aa76d,#2d8a58)'}}>
                                    {this.L.apply}
                                </button>
                                <button type="button" onClick={() => this.setState({showArt: false})}
                                    title={this.L.doneTitle}
                                    style={{...btn, background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1'}}>
                                    {this.L.done}
                                </button>
                                {unassigned > 0 && (
                                    <span style={{fontSize: 12, color: '#b45309'}}>
                                        {this.L.needSprite(unassigned)}
                                    </span>
                                )}
                            </div>
                        );
                    })()}
                </div>
                )}

                {/* Bottom controls row — hidden in maximize mode (compact To/From are in the tab row) */}
                <div style={{marginTop: max ? 4 : 12, display: max ? 'none' : 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flexShrink: 0}}>
                    <button onClick={this.compile}
                        disabled={this.state.busy || !this.activeCode().trim() || !TWO_WAY.has(this.state.lang)}
                        title={this.L.toBlocksTitle(LANG_LABEL[this.state.lang])}
                        style={btn}>
                        {this.L.toBlocks}
                    </button>
                    <button onClick={this.fromBlocks} disabled={this.state.busy}
                        title={this.L.fromBlocksTitle}
                        style={{...btn, background: 'linear-gradient(135deg,#a55b80,#8e4a6c)'}}>
                        {this.L.fromBlocks}
                    </button>
                    {this.currentDevice() === 'pico' ? (
                        <button onClick={this.deployToPico} disabled={this.state.busy}
                            data-testid="bw-deploy-pico"
                            title={this.L.deployPicoTitle}
                            style={{...btn, background: 'linear-gradient(135deg,#2f9e44,#237a34)'}}>
                            {this.L.deployPico}
                        </button>
                    ) : null}
                    {/* Flash to a real board for every family that has a serial
                        bootloader (STC ISP, AVR STK500v1, STM32 AN3155); the
                        method downloads the image + names the programmer for
                        the rest. Pico keeps its own MicroPython button above. */}
                    {this.currentDevice() !== 'pico'
                     && this.state.lang === 'pseudocode'
                     && this.flashFamily(this.currentDevice()) !== null ? (
                        <button onClick={this.flashToBoard} disabled={this.state.busy}
                            data-testid="bw-flash-board"
                            title={this.L.flashBoardTitle}
                            style={{...btn, background: 'linear-gradient(135deg,#c9761b,#a35d12)'}}>
                            {this.L.flashBoard}
                        </button>
                    ) : null}
                    {/* The 8086's ▶. It sits with the other per-device buttons
                        rather than with the Python/JS "Run" above, because it
                        does what THEY do — build for the selected device and
                        start it — and not what that one does (evaluate the
                        editor's text in a worker). `asmTargetForDevice` is the
                        one function that decides what an 8086 is, so the
                        button and the assembler cannot disagree about it. */}
                    {this.state.lang === 'pseudocode'
                     && asmTargetForDevice(this.currentDevice()) === 'i8086' ? (
                            <button onClick={this.runPseudocodeOn8086} disabled={this.state.busy}
                                data-testid="bw-run-8086"
                                title={this.L.run8086Title}
                                style={{...btn, background: 'linear-gradient(135deg,#37b24d,#2f9e44)'}}>
                                {this.L.run8086}
                            </button>
                        ) : null}
                    {this.currentDevice() === 'stm32f030' && this.state.lang === 'pseudocode' ? (
                        <button onClick={this.flashStm32ViaSwd} disabled={this.state.busy}
                            data-testid="bw-flash-swd"
                            title={this.L.flashSwdTitle}
                            style={{...btn, background: 'linear-gradient(135deg,#1b7fc9,#125fa3)'}}>
                            {this.L.flashSwd}
                        </button>
                    ) : null}
                    {this.state.lang !== 'pseudocode' && this.state.lang !== 'c' && /_[a-z]+\.|Driver/.test(this.activeCode()) ? (
                        <span style={{fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 8}}>
                            <label title={this.L.driverTitle}>
                                🔌{' '}
                                <select value={this.state.driverMode} onChange={e => this.setGenOpt({driverMode: e.target.value})} disabled={this.state.busy}
                                    style={{padding: '5px 8px', borderRadius: 6, border: '1px solid #cbd5e1', font: 'inherit'}}>
                                    <option value="shim">{this.L.driverShim}</option>
                                    <option value="remote">{this.L.driverRemote}</option>
                                    <option value="ondevice">{this.L.driverOnbrick}</option>
                                    <option value="simulator">{this.L.driverSim}</option>
                                </select>
                            </label>
                            <label title={this.L.asyncTitle}>
                                <input type="checkbox" checked={this.state.asyncMode} disabled={this.state.busy}
                                    onChange={e => this.setGenOpt({asyncMode: e.target.checked})} /> {this.L.asyncLabel}
                            </label>
                            <label title={this.L.eventsTitle}>
                                <input type="checkbox" checked={this.state.eventsMode} disabled={this.state.busy}
                                    onChange={e => this.setGenOpt({eventsMode: e.target.checked})} /> {this.L.eventsLabel}
                            </label>
                        </span>
                    ) : null}
                    {(this.state.lang === 'python' || this.state.lang === 'javascript') && this.activeCode().trim() ? (
                        <button onClick={this.run} disabled={this.state.running}
                            style={{...btn, background: 'linear-gradient(135deg,#37b24d,#2f9e44)'}}>
                            ▶ {this.L.run} {this.state.lang === 'python' ? 'Python' : 'JavaScript'}
                        </button>
                    ) : null}
                    {this.state.lang === 'basic' && this.activeCode().trim() ? (
                        <button onClick={() => this.runBasic()} disabled={this.state.running}
                            style={{...btn, background: 'linear-gradient(135deg,#37b24d,#2f9e44)'}}
                            data-testid="bw-basic-run">
                            {this.L.runBasic}
                        </button>
                    ) : null}
                    {this.state.lang === 'c' ? <span style={{fontSize: 13, color: '#64748b'}}>{this.L.cNote}</span> : null}
                    {this.state.lang === 'basic' ? (
                        <button type="button" onClick={() => this.setState(s => ({showBasicInfo: !s.showBasicInfo}))}
                            style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18,
                                padding: 0, border: 'none', borderRadius: '50%', background: this.state.showBasicInfo ? '#4c97ff' : '#e2e8f0',
                                color: this.state.showBasicInfo ? '#fff' : '#475569', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontStyle: 'italic'}}
                            title={this.L.basicInfoTitle} data-testid="bw-basic-info-toggle">i</button>
                    ) : null}
                    {this.state.lang === 'asm' ? (
                        <button type="button" onClick={() => this.setState(s => ({showAsmInfo: !s.showAsmInfo}))}
                            style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18,
                                padding: 0, border: 'none', borderRadius: '50%', background: this.state.showAsmInfo ? '#4c97ff' : '#e2e8f0',
                                color: this.state.showAsmInfo ? '#fff' : '#475569', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontStyle: 'italic'}}
                            title={this.L.asmInfoTitle} data-testid="bw-asm-info-toggle">i</button>
                    ) : null}
                    {this.state.status ? <span data-testid="bw-code-status"
                        style={{fontSize: 13}}>{this.state.status}</span> : null}
                </div>
                {this.state.conversionReport ? (() => {
                    const report = this.state.conversionReport;
                    const de = pickLocale(this.props.locale) === 'de';
                    const exp = this.state.reportExpanded;
                    return (
                        <div data-testid="bw-conversion-report" role="status"
                            style={{marginTop: 4, border: '1px solid #cbd5e1',
                                borderRadius: 6, background: '#f8fafc', fontSize: 12, color: '#334155',
                                flexShrink: 0}}>
                            <div style={{display: 'flex', alignItems: 'center', padding: exp ? '7px 10px 4px' : '4px 8px', cursor: 'pointer', fontWeight: 600}}
                                onClick={() => this.setState(s => ({reportExpanded: !s.reportExpanded}))}>
                                <span style={{width: 16, display: 'inline-block', fontSize: 10}}>{exp ? '▼' : '▶'}</span>
                                {de ? 'Umwandlungsbericht' : 'Conversion report'}: {report.direction}
                                {!exp && (
                                    <span style={{marginLeft: 'auto', display: 'flex', gap: 6, fontSize: 11}}>
                                        {report.preserved ? null : <span style={{color: '#991b1b'}}>❌</span>}
                                        {report.changed.length > 0 && <span style={{color: '#0284c7'}}>{report.changed.length} {de ? 'geändert' : 'changed'}</span>}
                                        {report.unsupported.length > 0 && <span style={{color: '#92400e'}}>{report.unsupported.length} {de ? 'nicht unterstützt' : 'unsupported'}</span>}
                                        {report.preserved && report.changed.length === 0 && report.unsupported.length === 0 && <span style={{color: '#166534'}}>✓ OK</span>}
                                    </span>
                                )}
                            </div>
                            {exp && (
                                <div style={{padding: '0 10px 7px 26px'}}>
                                    <div data-testid="bw-conversion-preserved" style={{color: report.preserved ? '#166534' : '#991b1b'}}>
                                        {de ? 'Bewahrt' : 'Preserved'}: {report.preserved ?
                                            (de ? 'Projektstruktur erzeugt und geladen' : 'project structure generated and loaded') :
                                            (de ? 'nein — Umwandlung fehlgeschlagen' : 'no — conversion failed')}
                                    </div>
                                    <div data-testid="bw-conversion-changed">
                                        {de ? 'Geändert' : 'Changed'}: {report.changed.length ? report.changed.join(' · ') :
                                            (de ? 'keine gemeldeten Änderungen' : 'no reported changes')}
                                    </div>
                                    <div data-testid="bw-conversion-unsupported"
                                        style={{color: report.unsupported.length ? '#92400e' : '#334155'}}>
                                        {de ? 'Nicht unterstützt' : 'Unsupported'}: {report.unsupported.length ?
                                            report.unsupported.join(' · ') : (de ? 'nichts gemeldet' : 'nothing reported')}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })() : null}
                {this.state.lang === 'basic' && this.state.showBasicInfo && (
                    <div style={{padding: '6px 12px', background: '#eff6ff', border: '1px solid #bfdbfe',
                        borderRadius: 8, fontSize: 13, color: '#334155', marginTop: 4, flexShrink: 0}}
                        data-testid="bw-basic-info-panel">
                        {this.L.basicNote}
                    </div>
                )}
                {this.state.lang === 'asm' && this.state.showAsmInfo && (
                    <div style={{padding: '6px 12px', background: '#eff6ff', border: '1px solid #bfdbfe',
                        borderRadius: 8, fontSize: 13, color: '#334155', marginTop: 4, flexShrink: 0}}
                        data-testid="bw-asm-info-panel">
                        {this.L.asmNote}
                    </div>
                )}
                {/* VDU terminal for BBC BASIC — renders DRAW/MOVE/PLOT graphics */}
                {this.state.basicIsBbc && this.state.basicRawOutput ? (
                    <React.Suspense fallback={null}>
                        <VduTerminal output={this.state.basicRawOutput} />
                    </React.Suspense>
                ) : null}
                {this.state.output != null ? (
                    <pre data-testid={this.state.lang === 'basic' ? 'bw-basic-output' : undefined}
                        style={{marginTop: 10, padding: 12, background: '#0c3a44', color: '#c7f0e0', borderRadius: 8,
                        fontFamily: 'monospace', fontSize: 13, maxHeight: 220, overflow: 'auto', whiteSpace: 'pre-wrap'}}>
                        {this.state.output || '…'}
                    </pre>
                ) : null}
            </div>
        );
    }
}

PseudocodeImporter.propTypes = {
    vm: PropTypes.shape({loadProject: PropTypes.func, toJSON: PropTypes.func}).isRequired,
    locale: PropTypes.string,
    // Whether this tab is the selected one. Gates the CodeMirror chunk and the
    // example sources; see the comment above CMEditor. Defaults to visible so a
    // host that does not manage tabs gets the full editor.
    isVisible: PropTypes.bool,
    // Injected by connect() with no mapDispatchToProps. Declared so the refusal
    // alert is not a silent prop-types warning in development.
    dispatch: PropTypes.func
};

PseudocodeImporter.defaultProps = {
    isVisible: true
};

export default connect(state => ({
    vm: state.scratchGui.vm,
    locale: state.locales && state.locales.locale
}))(PseudocodeImporter);
