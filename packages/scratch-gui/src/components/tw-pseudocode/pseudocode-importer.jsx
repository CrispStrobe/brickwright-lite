import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import examples from '../../lib/sb3-creator-examples.js';
import brickRobot from './brick-robot.svg';

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
    ]},
    { label: 'Raspberry Pi', core: 'rp2040', devices: [
        { id: 'pico', label: 'Raspberry Pi Pico', compile: true, emulator: 'rp2040js' },
    ]},
    { label: '6502', core: 'w65c02', devices: [
        { id: 'eater6502', label: 'Eater 6502', compile: false, emulator: null },
    ]},
    { label: 'Z80', core: 'z80', devices: [
        { id: 'z80', label: 'Z80 bench', compile: false, emulator: null },
    ]},
    { label: 'MicroPython', core: 'micropython', devices: [
        { id: 'microbit', label: 'micro:bit', compile: false, emulator: null },
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
        stLoaded: 'Compiled to blocks and loaded. Switch to the Code tab to see them.',
        stWarn: w => `Loaded with warnings — ${w}`,
        foreverLoop: 'This project has a forever (game) loop, so it runs in the blocks — press the green flag to play it. For a text run, try an algorithmic example (quiz, operators, 2048, …).',
        cNote: 'C for the STC12 / 8051. Paste your own firmware and press ⇦ To blocks, or compile it to a .hex with stc-compiler.vercel.app.',
        basicNote: 'Runs BBC BASIC (R.T. Russell, zlib) or 6502 BASIC (derived from MIT-licensed source). Toggle profile and line numbers above. Multi-WHEN programs cannot be shown (BASIC is single-threaded).',
        asmNote: 'Write assembly or view the compiled listing. Source mode: write per-device assembly (8051/6502/Z80/AVR, assembled by the hosted toolchain) and assemble+run — the 6502/Z80 benches boot the image directly. Listing mode: generated disassembly. No ASM-to-blocks path — that asymmetry is deliberate.',
        stCOneWay: 'That language cannot be compiled back to blocks.',
        // BASIC / ASM mode bar
        profile: 'Profile:', lineNumbers: 'Line numbers', alwaysOn6502: '(always on for 6502)',
        asmModeLabel: 'Mode:', asmSource: 'Source (editable)', asmListing: 'Listing (from compiler)',
        assembleAndRun: '🔩 Assemble & Run',
        basicInfoTitle: 'BASIC info', asmInfoTitle: 'ASM info',
        // micro:bit bar
        micropythonReadonly: 'Read-only — generated from your blocks for the micro:bit.',
        runOnSimulator: '▶ Run on Simulator',
        // device selector / maximize
        devicePlaceholder: 'Device…', deviceTitle: 'Target device — sets pin names, compile target and emulator',
        maximizeTitle: 'Maximize editor', restoreTitle: 'Restore panels',
        asmWriteFirst: 'Write assembly source first.',
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
            Registers: 'Registers', Workflow: 'Workflow', Addressing: 'Addressing'
        }
    },
    de: {
        loadExample: '📚 Beispiel laden…', loadExampleTitle: 'Ein eingebautes Beispiel laden',
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
        stLoaded: 'Zu Blöcken kompiliert und geladen. Wechsle zum Blöcke-Tab, um sie zu sehen.',
        stWarn: w => `Mit Warnungen geladen — ${w}`,
        foreverLoop: 'Dieses Projekt hat eine Endlosschleife (Spiel), es läuft daher in den Blöcken — klicke die grüne Flagge zum Spielen. Für einen Text-Lauf nimm ein algorithmisches Beispiel (Quiz, Operatoren, 2048, …).',
        cNote: 'C für den STC12 / 8051. Eigene Firmware einfügen und „⇦ Zu Blöcken” drücken, oder auf stc-compiler.vercel.app zu .hex kompilieren.',
        basicNote: 'BBC BASIC (R.T. Russell, zlib) oder 6502 BASIC (abgeleitet von MIT-lizenzierter Quelle). Profil und Zeilennummern oben umschalten. Multi-WHEN-Programme werden nicht dargestellt (BASIC ist einzel-threaded).',
        asmNote: 'Assembler schreiben oder kompiliertes Listing ansehen. Source-Modus: gerätespezifischen Assembler (8051/6502/Z80/AVR, assembliert vom gehosteten Toolchain-Dienst) schreiben und assemblieren+ausführen — die 6502/Z80-Werkbänke booten das Image direkt. Listing-Modus: generierte Disassemblierung. Kein ASM-zu-Blöcke-Pfad — diese Asymmetrie ist beabsichtigt.',
        stCOneWay: 'Diese Sprache lässt sich nicht zu Blöcken zurückführen.',
        // BASIC / ASM mode bar
        profile: 'Profil:', lineNumbers: 'Zeilennummern', alwaysOn6502: '(immer an bei 6502)',
        asmModeLabel: 'Modus:', asmSource: 'Source (editierbar)', asmListing: 'Listing (vom Compiler)',
        assembleAndRun: '🔩 Assemblieren & Ausführen',
        basicInfoTitle: 'BASIC-Info', asmInfoTitle: 'ASM-Info',
        // micro:bit bar
        micropythonReadonly: 'Nur-Lesen — aus deinen Blöcken für den micro:bit generiert.',
        runOnSimulator: '▶ Im Simulator ausführen',
        // device selector / maximize
        devicePlaceholder: 'Gerät…', deviceTitle: 'Zielgerät — bestimmt Pinbenennung, Compile-Ziel und Emulator',
        maximizeTitle: 'Editor maximieren', restoreTitle: 'Panels wiederherstellen',
        asmWriteFirst: 'Schreibe zuerst Assembler-Quellcode.',
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
            Registers: 'Register', Workflow: 'Arbeitsablauf', Addressing: 'Adressierung'
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
        ['snake', '🐍 Snake'], ['snake_pro', '🐍 Snake (growing tail)'], ['breakout', '🧱 Breakout'],
        ['pong_2p', '🏓 Pong (2 players)'], ['pong_ai', '🤖 Pong (vs AI)'], ['tetris', '🟦 Tetris'],
        ['sokoban', '📦 Sokoban'], ['bomberman', '💣 Bomberman'], ['invaders', '👾 Space Invaders'],
        ['flappy', '🐤 Flappy'], ['tictactoe', '⭕ Tic-Tac-Toe (2 players)'], ['tictactoe_ai', '⭕ Tic-Tac-Toe (vs AI)'],
        ['g2048', '🔢 2048'], ['maze', '👻 Maze Chase'], ['connect4', '🔴 Connect Four (vs AI)'], ['minesweeper', '💥 Minesweeper']
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
    ]}
];

// Section header keys map to L10N.h — the code snippet items stay English (they ARE code).
const SYNTAX = [
    ['Structure', ['SPRITE Name:', 'STAGE:', 'GLOBAL score / LOCAL hp', 'LIST inventory',
        'SHAPE rect 16 90 / circle 18', 'SHAPE polygon 20 0 40 40 0 40 #f53',
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

const LANG_LABEL = {pseudocode: 'Pseudocode', python: 'Python', javascript: 'JavaScript', c: 'C', basic: 'BASIC', asm: 'ASM', micropython: 'micro:bit'};

// Languages you can compile back INTO blocks. C joined them once cToPseudocode landed:
// it reads both our own emitted C (which carries an `@bw` marker header, so the round-trip
// is exact) and hand-written firmware (pins from `#define LED1 P1_0`, polarity from the
// `LED_ON 0` idiom — every inference reported as a warning, never guessed silently).
// The one thing it will not do is invert the cooperative-scheduler form; it says so.
const TWO_WAY = new Set(['pseudocode', 'python', 'javascript', 'c', 'basic']);

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
            'Per-device: 8051 (sdas8051), 6502 (ca65), AVR (avr-as)']],
        ['Registers', ['A, B, DPTR, SP, PSW (8051)',
            'R0–R7 (register bank), SFRs',
            'Carry (C), Overflow (OV), Parity (P)']],
        ['Addressing', ['MOV A, #imm / MOV A, addr',
            'MOV @R0, A (indirect)', 'MOVC A, @A+DPTR (code memory)',
            'SJMP / LJMP / AJMP, LCALL / ACALL']]
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
// The CM chunk (~200 KB) loads only when the Code tab activates.
// Blocks-only users never download it.
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
        this.state = {lang: 'pseudocode', buffers: {pseudocode: '', python: '', javascript: '', c: '', basic: '', asm: '', micropython: ''},
            basicProfile: 'bbc', basicLineNumbers: true,
            uploads: [], status: '', busy: false, showRef: false, showInfo: false, showArt: false, output: null, running: false,
            // Hardware-extension codegen options (see reference/runtime-drivers.md): the emitted
            // driver (shim / remote / on-brick), plus async/await and event-hat switches.
            driverMode: 'shim', asyncMode: false, eventsMode: false,
            // Editor maximize: collapses reference/art panels and hides the right stage pane
            maximized: false,
            // ASM tab mode: 'source' = editable author buffer, 'listing' = read-only disassembly
            asmMode: 'source',
            // ASM listing line map from the compile service (addr/file/line triples).
            // Future current-PC highlight will drive setHighlightedLine via this.
            asmLineMap: null,
            // ASM listing buffer (separate from the editable asm buffer)
            asmListing: ''};
        this._cmEditor = null;
        // Cache compiled ASM by source hash so tab switching doesn't recompile.
        this._asmCache = {hash: null, asm: '', lineMap: null};
        this.handleFiles = this.handleFiles.bind(this);
        this.compile = this.compile.bind(this);
        this.fromBlocks = this.fromBlocks.bind(this);
        this.loadExample = this.loadExample.bind(this);
        this.run = this.run.bind(this);
        this.switchTab = this.switchTab.bind(this);
        this.flashMicrobitSim = this.flashMicrobitSim.bind(this);
    }

    componentDidMount () {
        // Pick up pseudocode from an example loaded via the Circuit tab.
        // loadExampleProgram stores the source on vm.runtime.bwPseudocodeSource
        // and emits PROJECT_CHANGED; we read it here so the Code tab fills.
        const vm = this.props.vm;
        if (vm && vm.runtime) {
            this._onProjectChanged = () => {
                const src = vm.runtime.bwPseudocodeSource;
                if (src && src !== this.state.buffers.pseudocode) {
                    this.setState(s => ({
                        lang: 'pseudocode',
                        buffers: {...s.buffers, pseudocode: src}
                    }));
                    delete vm.runtime.bwPseudocodeSource;
                }
            };
            vm.runtime.on('PROJECT_CHANGED', this._onProjectChanged);
        }
        // If a device is already set (e.g. from a loaded project), compute
        // example compatibility so the dropdown is filtered from the start.
        const device = this.currentDevice();
        if (device) this.computeExampleCompat(device);
    }

    componentWillUnmount () {
        const vm = this.props.vm;
        if (vm && vm.runtime && this._onProjectChanged) {
            vm.runtime.removeListener('PROJECT_CHANGED', this._onProjectChanged);
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

    // Lazily import the compiler module.
    async lib () { return (await import(/* webpackChunkName: "sb3-creator" */ '../../lib/sb3-creator.js')); }

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

        // Check cache
        const hash = this._hashSource(cSrc);
        if (this._asmCache.hash === hash && this._asmCache.asm) {
            this.setState({
                lang: 'asm', asmMode: 'listing', busy: false, output: null, status: '',
                asmListing: this._asmCache.asm,
                asmLineMap: this._asmCache.lineMap
            });
            return;
        }

        this.setState({busy: true, status: this.L.stCompiling});
        try {
            const stc = this.currentStc();
            const deviceId = (stc && stc.device || 'stc12c5a60s2').toLowerCase();
            // Map device to compile target (same map as debug-runner.js)
            const COMPILE_TARGET = {
                'arduino-nano': 'atmega328p', 'arduino-uno': 'atmega328p',
                'atmega328p': 'atmega328p', 'atmega168p': 'atmega168p',
                'arduino-mega': 'atmega2560', 'pico': 'rp2040', 'eater6502': 'eater6502'
            };
            const compileTarget = COMPILE_TARGET[deviceId] || deviceId;
            const res = await fetch('https://stc-compiler.vercel.app/compile', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    code: cSrc,
                    language: 'c',
                    target: compileTarget,
                    format: deviceId === 'pico' ? 'bin' : 'ihx',
                    disassemble: true
                })
            });
            const out = await res.json();
            if (!out.success) throw new Error(out.error || 'the compiler refused this program');
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

    /** Assemble and run: POST authored ASM to the hosted assembler
     *  (stc-compiler /assemble — sdas8051, ca65+ld65, sdasz80, avr-gcc),
     *  then dispatch the raw image so the debug panel can boot it on the
     *  machine bench. Auto-run is wired for the 6502/Z80 benches; other
     *  targets assemble (errors surface here) but have no load path yet
     *  — the status says which of the two happened. */
    async assembleAndRun () {
        const source = this.state.buffers.asm;
        if (!source || !source.trim()) {
            this.setState({status: this.L.asmWriteFirst});
            return;
        }
        const stc = this.currentStc();
        const device = (stc && stc.device || '').toLowerCase();
        // /assemble takes device ids directly (stc*, atmega*, attiny*);
        // the two machine benches normalize to their toolchain names.
        const target = /6502|eater/.test(device) ? 'eater6502'
            : /^(z80|zx48|zx128)$/.test(device) ? 'z80'
            : device || 'stc12c5a60s2';
        const isBench = target === 'eater6502' || target === 'z80';
        this.setState({busy: true, status: 'Assembling…'});
        try {
            const res = await fetch('https://stc-compiler.vercel.app/assemble', {
                method: 'POST',
                headers: {'content-type': 'application/json'},
                body: JSON.stringify({asm: source, target}),
            });
            if (!res.ok) throw new Error(`Assembler HTTP ${res.status}`);
            const result = await res.json();
            if (!result.success) {
                const msgs = (result.errors || []).map(e => (e.line ? `L${e.line}: ` : '') + e.message);
                this.setState({busy: false,
                    status: `Assembly errors: ${msgs.join('; ') || result.error || 'assembly failed'}`});
                return;
            }
            if (!result.base64) throw new Error('Assembler returned no image');
            const rom = Uint8Array.from(atob(result.base64), c => c.charCodeAt(0));
            if (isBench) {
                window.dispatchEvent(new CustomEvent('bw-asm-rom-ready', {
                    detail: {rom, listing: result.listing, target}
                }));
                this.setState({busy: false, status: `Assembled ${rom.length} bytes — booting the ${target === 'z80' ? 'Z80' : '6502'} bench…`});
            } else {
                this.setState({busy: false,
                    status: `Assembled OK (${rom.length} bytes). Auto-run from ASM is wired for the 6502/Z80 benches; for ${target} use the compile path.`});
            }
        } catch (e) {
            this.setState({busy: false, status: `Assemble error: ${e.message}`});
        }
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
        const info = DEVICE_BY_ID[deviceId];
        if (!info) return;
        const src = this.state.buffers.pseudocode || '';
        const hasPins = /^\s*PIN\s/im.test(src);

        if (hasPins) {
            const SB3Creator = (await this.lib()).default;
            const result = SB3Creator.retargetPseudocode(src, deviceId);
            if (result.ok) {
                this.setState({
                    buffers: {...this.state.buffers, pseudocode: result.pseudocode},
                    status: result.warnings.length
                        ? `Retargeted to ${info.label}: ${result.warnings.join('; ')}`
                        : `Retargeted to ${info.label}.`
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
        this.computeExampleCompat(deviceId);
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
        window.dispatchEvent(new CustomEvent('bw-microbit-flash', {detail: {code}}));
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

    // Compute which hardware examples can retarget to the given device. Returns
    // { [exampleKey]: { ok, reasons } }. Cached by device so render stays cheap.
    _exampleCompatCache = {};
    _exampleCompatDevice = null;
    async computeExampleCompat (device) {
        if (!device || device === this._exampleCompatDevice) return;
        const SB3Creator = (await this.lib()).default;
        if (!SB3Creator.retargetPseudocode) return;
        const cache = {};
        for (const [key, src] of Object.entries(examples)) {
            if (!/^DEVICE\s/im.test(src)) continue; // not a hardware example
            const exDev = (src.match(/^DEVICE\s+([\w-]+)/im) || [])[1];
            if (exDev && exDev.toLowerCase() === device) { cache[key] = { ok: true }; continue; }
            const result = SB3Creator.retargetPseudocode(src, device);
            cache[key] = { ok: result.ok, reasons: result.reasons };
        }
        this._exampleCompatCache = cache;
        this._exampleCompatDevice = device;
        this.forceUpdate();
    }

    /** Inline lookup: is this example compatible with the current device? */
    exampleCompat (key) {
        return this._exampleCompatCache[key];
    }

    async loadExample (key) {
        const src = key && examples[key];
        if (!src) return;
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
            buffers: {pseudocode: src, python: '', javascript: '', c: '', basic: '', asm: ''}});
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
            }
            const warns = [...parseWarnings, ...creator.warnings];
            if (missing.length) warns.push(`no sprite named: ${missing.join(', ')}`);
            this.setState({buffers: nb, status: warns.length ?
                this.L.stWarn(warns.slice(0, 4).join(' · ')) :
                this.L.stLoaded});
        } catch (e) {
            this.setState({status: this.L.stError(e.message)});
        }
        this.setState({busy: false});
    }
    // Read the running project into all languages at once.
    async fromBlocks () {
        this.setState({busy: true, status: this.L.stReading});
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
            const unsupported = (buffers.pseudocode.match(/^# unsupported:/gm) || []).length;
            this.setState({buffers, output: null, status: unsupported ?
                `Read into all languages — ${unsupported} block(s) not representable in pseudocode (left as comments).` :
                'Read the current project into all languages. Edit any of them, then “To blocks”.'});
        } catch (e) {
            this.setState({status: this.L.stError(e.message)});
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
                        ...(this.currentDevice() === 'microbit' ? [['micropython', '🤖 µ:bit']] : [])].map(([l, label]) => {
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
                    {/* Compact controls — hidden in maximize mode */}
                    {!max && (
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
                                style={{...csel, alignSelf: 'center'}} title={this.L.deviceTitle}>
                                <option value="" disabled>{this.L.devicePlaceholder}</option>
                                {DEVICE_GROUPS.map(g => (
                                    <optgroup key={g.label} label={g.label}>
                                        {g.devices.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                                    </optgroup>
                                ))}
                            </select>
                            <select defaultValue="" onChange={e => this.loadExample(e.target.value)}
                                style={{...csel, alignSelf: 'center'}} title={this.L.loadExampleTitle}>
                                <option value="" disabled>{this.L.loadExample}</option>
                                {GROUPS.map(g => (
                                    <optgroup key={g.label} label={g.label}>
                                        {g.items.filter(([k]) => examples[k]).map(([k, label]) => {
                                            const compat = this.exampleCompat(k);
                                            const blocked = compat && !compat.ok;
                                            return (
                                                <option key={k} value={k} disabled={blocked}
                                                    title={blocked ? compat.reasons.join('; ') : ''}>
                                                    {blocked ? `${label} ⛔` : label}
                                                </option>
                                            );
                                        })}
                                    </optgroup>
                                ))}
                            </select>
                            <button onClick={() => this.setState(s => ({showRef: !s.showRef}))}
                                style={{...csel, cursor: 'pointer', background: this.state.showRef ? '#e2e8f0' : '#f1f5f9',
                                    border: '1px solid #cbd5e1', alignSelf: 'center'}}
                                title={this.L.referenceTitle(this.state.lang)}>
                                📝 {this.L.reference}
                            </button>
                            <button type="button" onClick={() => this.setState(s => ({showArt: !s.showArt}))}
                                title={this.L.customArtTitle}
                                style={{...csel, cursor: 'pointer', border: '1px solid #cbd5e1',
                                    background: this.state.showArt ? '#e2e8f0' : '#f1f5f9', alignSelf: 'center'}}>
                                🖼️{this.state.uploads.length ? ` (${this.state.uploads.length})` : ''}
                            </button>
                        </React.Fragment>
                    )}
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

                {this.state.showInfo && !max && (
                    <div style={{padding: '6px 10px', background: '#eff6ff', border: '1px solid #bfdbfe',
                        borderRadius: '0 0 8px 8px', fontSize: 12, color: '#334155', flexShrink: 0}}>
                        {pickLocale(this.props.locale) === 'de' ? (
                            <React.Fragment>
                                Schreibe dein Projekt als Code in jedem Tab. <strong>Pseudocode</strong>, <strong>Python</strong>,{' '}
                                <strong>JavaScript</strong>, <strong>C</strong> und <strong>BASIC</strong> sind wechselseitig:{' '}
                                <strong>⇦ Zu Blöcken</strong> kompiliert den aktiven Tab, <strong>Von Blöcken ⇨</strong>{' '}
                                liest das aktuelle Projekt in jede Sprache ein, Tab-Wechsel wandelt um.{' '}
                                <strong>ASM</strong> ist bewusst einbahnig — schreiben, assemblieren, ausführen; kein Rückweg zu Blöcken.{' '}
                                <strong>micro:bit</strong> wird für DEVICE MICROBIT generiert (noch kein Rücklesen).{' '}
                                Sprite-/Stift-Verhalten liegt in den Blöcken (die Wahrheit) — Kommentare bleiben erhalten.
                            </React.Fragment>
                        ) : (
                            <React.Fragment>
                                Write your project as code in any tab. <strong>Pseudocode</strong>, <strong>Python</strong>,{' '}
                                <strong>JavaScript</strong>, <strong>C</strong> and <strong>BASIC</strong> are two-way:{' '}
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
                        <span style={{color: '#166534'}}>{this.L.micropythonReadonly}</span>
                        <span style={{flex: 1}} />
                        <button type="button"
                            onClick={() => this.flashMicrobitSim()}
                            disabled={this.state.busy || !this.state.buffers.micropython.trim() || /^# ===/.test(this.state.buffers.micropython)}
                            style={{padding: '4px 12px', borderRadius: 6, border: 'none',
                                cursor: 'pointer', fontWeight: 600, fontSize: 12,
                                background: 'linear-gradient(135deg,#16a34a,#15803d)', color: '#fff'}}
                            data-testid="bw-microbit-flash">
                            {this.L.runOnSimulator}
                        </button>
                    </div>
                )}
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
                    {this.state.status ? <span style={{fontSize: 13}}>{this.state.status}</span> : null}
                </div>
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
                    <pre style={{marginTop: 10, padding: 12, background: '#0c3a44', color: '#c7f0e0', borderRadius: 8,
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
    locale: PropTypes.string
};

export default connect(state => ({
    vm: state.scratchGui.vm,
    locale: state.locales && state.locales.locale
}))(PseudocodeImporter);
