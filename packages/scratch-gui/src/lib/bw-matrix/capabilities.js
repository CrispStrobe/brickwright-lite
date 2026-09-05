/**
 * The language x device matrix — one table, read by the GUI and the docs.
 *
 * For a language L and a device D the cell says two independent things:
 *
 *   native   L itself runs on D. The artefact is L's own program: a `.py`
 *            for MicroPython, BASIC typed into a ROM interpreter, a `.hex`
 *            from a C or assembler toolchain. Where the toolchain runs
 *            (`local` in the browser, `hosted` on stc-compiler, `none`
 *            because the chip interprets the language) is a fact here too.
 *   lowered  L is read into the dialect AST and re-emitted as something D
 *            runs natively. The learner's text does not run; its meaning
 *            does. `via` names the language it lands in, and the reach of a
 *            lowered path IS the reach of that native cell.
 *
 * A cell is native, lowered, or both. There is no refused cell: where a
 * native half is physically out, it is `null` with a `reason` from the closed
 * REASONS set and a `cite` carrying the number the claim rests on.
 *
 * Reach (simulator / silicon) is never a boolean stored per cell. It is
 * computed: an artefact reaches the simulator if some shipped engine of the
 * device runs that artefact kind, and reaches silicon if some shipped
 * transport accepts it. So a transport added to a device lights up every
 * cell that produces what it accepts, and nothing has to be edited twice.
 *
 * Evidence: `checked` means test/bw-matrix-conformance.test.mjs reads the
 * source this fact describes and would go red if it changed; `declared`
 * means the table says so and nothing here proves it. The GUI and the
 * generated doc render the difference. Facts about the hosted service are
 * checked against docs/generated/hosted-targets.json, a pinned snapshot.
 *
 * Plan and task ids (N1, L2, ...): docs/LANGUAGE-DEVICE-MATRIX-PLAN.md.
 * @module
 */

export const SCHEMA_VERSION = 2;

export const EVIDENCE = Object.freeze({CHECKED: 'checked', DECLARED: 'declared'});
export const STATUS = Object.freeze({SHIPPED: 'shipped', OPEN: 'open'});

/**
 * How well a capability is KNOWN, as distinct from whether this table agrees
 * with the code (`evidence`). The vocabulary is bw-board's VERIFICATION.md.
 * `needs` on a fact names the external oracles its tier rests on; a fact whose
 * oracle is absent from CI is "recorded", not "standing" — that derivation
 * belongs to the generated doc, never to a typed column.
 */
export const TIERS = Object.freeze({
    '1': 'measured on real silicon, or read from the datasheet',
    '2a': 'agrees with an independent implementation or an independently produced vector set',
    '2b': 'agrees with a second reading of the same source',
    '2c': 'a single implementation asserting about itself (its own tests)',
    '3': 'asserted, unverified',
    '4': 'known not to be modelled'
});

/** Why a native half is null. Closed set; the schema test refuses others. */
export const REASONS = Object.freeze({
    'is-ast': {
        en: 'Pseudocode is the dialect every other language is read into; it has no runtime of its own.',
        de: 'Pseudocode ist der Dialekt, in den jede andere Sprache gelesen wird; er hat keine eigene Laufzeit.'
    },
    'ram': {
        en: 'the interpreter needs more RAM than this chip has',
        de: 'der Interpreter braucht mehr RAM, als dieser Chip hat'
    },
    'flash': {
        en: 'the interpreter needs more flash than this chip has',
        de: 'der Interpreter braucht mehr Flash, als dieser Chip hat'
    },
    'no-port': {
        en: 'no port of this language\'s runtime exists for this CPU',
        de: 'für diese CPU gibt es keine Portierung der Laufzeit dieser Sprache'
    },
    'licence': {
        en: 'the only runtimes found are not permissively licensed',
        de: 'die einzigen gefundenen Laufzeiten sind nicht permissiv lizenziert'
    },
    'no-reader': {
        en: 'nothing reads this language into the dialect yet',
        de: 'noch nichts liest diese Sprache in den Dialekt'
    }
});

/** Artefact kinds. A device's engines and transports name what they take. */
export const ARTEFACTS = Object.freeze([
    'hex', // Intel HEX or a raw firmware image for an MCU
    'bin', // raw binary image (ROM, ARM flash)
    'uf2', // RP2040 / SAMD UF2 container
    'py', // MicroPython / CircuitPython source
    'bas', // BASIC text typed into a ROM interpreter
    'com', // DOS .COM program
    'ts' // MakeCode (PXT) TypeScript, compiled hosted
]);

export const LANGUAGES = Object.freeze([
    {id: 'pseudocode', label: 'Pseudocode', reader: 'SB3Creator.parse', emitter: null},
    {id: 'python', label: 'Python', reader: 'sb3-creator-python.js', emitter: 'generatePython'},
    {id: 'javascript', label: 'JavaScript', reader: 'sb3-creator-javascript.js', emitter: 'generateJavaScript'},
    {id: 'c', label: 'C', reader: 'sb3-creator-c.js', emitter: 'generateC'},
    {id: 'basic', label: 'BASIC', reader: 'sb3-creator-basic.js', emitter: 'generateBASIC'},
    // The reader lifts the 8086 emitter's own shapes and refuses the rest by
    // name (plan task L1); 8051/6502/Z80/AVR assembly is still one-way.
    {
        id: 'asm',
        label: 'ASM',
        reader: 'bw-asm/asm-8086-to-pseudocode.js',
        readerNote: '8086 only: lifts what the ▶ button lowered, refuses hand-written assembly by name',
        readerTask: 'L1',
        emitter: 'pseudocode-8086.js (8086); compiler listings elsewhere'
    },
    {id: 'micropython', label: 'MicroPython', reader: 'sb3-creator-micropython.js', emitter: 'generateMicroPython'}
]);

/**
 * A simulator engine entry for a device.
 * @param {string} engine name, matching the picker's `emulator` where one exists
 * @param {string[]} runs artefact kinds it executes
 * @param {object} [extra] overrides (status, evidence, tier, needs, note)
 * @returns {object} the engine fact
 */
const eng = function (engine, runs, extra = {}) {
    return {
        engine,
        runs,
        status: STATUS.SHIPPED,
        evidence: EVIDENCE.CHECKED,
        tier: '2c',
        needs: [],
        ...extra
    };
};

/**
 * A silicon transport entry for a device.
 * @param {string} transport name
 * @param {string[]} accepts artefact kinds it flashes or loads
 * @param {?string} flashFamily the branch `flashFamily()` returns for it, or null
 * @param {object} [extra] overrides (status, task, evidence, tier, needs, note)
 * @returns {object} the transport fact
 */
const tx = function (transport, accepts, flashFamily, extra = {}) {
    return {
        transport,
        accepts,
        flashFamily,
        status: STATUS.SHIPPED,
        evidence: EVIDENCE.CHECKED,
        tier: '2c',
        needs: [],
        ...extra
    };
};

const OPEN_DECLARED = {status: STATUS.OPEN, evidence: EVIDENCE.DECLARED};

/**
 * One device in the picker's order.
 * @param {string} id the DEVICE id
 * @param {string} label the picker label
 * @param {string} group the picker group
 * @param {string} family the CELLS family
 * @param {object} rest pickerCompile, pickerEmulator, sim, silicon, programmable, overrides
 * @returns {object} the device
 */
const dev = function (id, label, group, family, rest) {
    return {id, label, group, family, ...rest};
};

const STC_IDS = ['stc12c5a60s2', 'stc12c5a16s2', 'stc15f2k60s2', 'stc15w408as', 'stc89c52rc', 'stc89c52'];
const AVR = 'Arduino (AVR)';
const ARCADE = 'Arcade & SAMD51';
const avr8 = {pickerCompile: true, pickerEmulator: 'avr8js', sim: [eng('avr8js', ['hex'])]};

/**
 * Devices, in the order and with the ids of DEVICE_GROUPS in
 * pseudocode-importer.jsx. `pickerCompile` / `pickerEmulator` mirror that
 * list's flags and exist only so the conformance test can hold the two in
 * agreement; the truth about what compiles is in the cells.
 */
export const DEVICES = Object.freeze([
    ...STC_IDS.map(id => dev(id, id.toUpperCase(), 'STC12 (8051)', '8051', {
        pickerCompile: true,
        pickerEmulator: 'emu8051',
        sim: [eng('emu8051', ['hex'], {tier: '2a', needs: ['ucsim-stc']})],
        silicon: [tx('stc-isp-webserial', ['hex'], 'stc', {note: 'answers only after a cold power-on'})],
        // sdcc-wasm links five of the six STC parts locally; the STC89C52 is
        // not in its LOCAL_TARGETS, so its C still goes to the hosted SDCC.
        // Found by the conformance gate, not by reading.
        ...(id === 'stc89c52' ?
            {overrides: {c: {where: 'hosted', note: 'not in sdcc-wasm LOCAL_TARGETS; compiled by the hosted SDCC'}}} :
            {})
    })),
    dev('arduino-uno', 'Arduino Uno', AVR, 'avr', {...avr8, silicon: [tx('stk500v1-webserial', ['hex'], 'avr')]}),
    dev('arduino-nano', 'Arduino Nano', AVR, 'avr', {...avr8, silicon: [tx('stk500v1-webserial', ['hex'], 'avr')]}),
    dev('arduino-mega', 'Arduino Mega', AVR, 'avr', {
        ...avr8,
        silicon: [tx('stk500v2-webserial', ['hex'], 'avr-mega')]
    }),
    dev('atmega328p', 'ATmega328P (bare)', AVR, 'avr', {...avr8, silicon: [tx('stk500v1-webserial', ['hex'], 'avr')]}),
    dev('atmega168p', 'ATmega168P (bare)', AVR, 'avr', {...avr8, silicon: [tx('stk500v1-webserial', ['hex'], 'avr')]}),
    dev('attiny88', 'ATtiny88 (bare)', AVR, 'avr', {
        pickerCompile: true,
        pickerEmulator: 'attiny88',
        sim: [eng('attiny88', ['hex'])],
        silicon: [tx('usbasp-webusb', ['hex'], 'isp')]
    }),
    dev('attiny85', 'ATtiny85', AVR, 'avr', {
        pickerCompile: true,
        pickerEmulator: 'attiny85',
        sim: [eng('attiny85', ['hex'])],
        silicon: [tx('usbasp-webusb', ['hex'], 'isp')]
    }),
    // A console: it runs a .hex somebody else built. No language cells.
    dev('arduboy', 'Arduboy (run .hex)', AVR, 'arduboy', {
        programmable: false,
        pickerCompile: false,
        pickerEmulator: 'arduboy',
        sim: [eng('arduboy', ['hex'])],
        silicon: []
    }),
    dev('pico', 'Raspberry Pi Pico', 'Raspberry Pi', 'rp2040', {
        pickerCompile: true,
        pickerEmulator: 'rp2040js',
        // 'py' is deliberately absent: MicroPython boots to a REPL in rp2040js
        // (measured 2026-09-05, docs/PICO-MICROPYTHON-BOOT.md) but the flash
        // filesystem needs five bootrom entries that live upstream in bw-board,
        // so deployMainPy cannot land a program yet. Plan tasks N3a-c.
        sim: [eng('rp2040js', ['hex', 'bin', 'uf2'])],
        silicon: [
            tx('micropython-raw-repl', ['py'], 'micropython'),
            tx('uf2-bootsel-download', ['uf2'], null, {...OPEN_DECLARED, task: 'L2'})
        ]
    }),
    dev('stm32f030', 'STM32F030', 'STM32 (ARM)', 'stm32', {
        pickerCompile: true,
        pickerEmulator: 'stm32f0',
        sim: [eng('stm32f0', ['bin', 'hex'], {
            tier: '2a',
            needs: ['labwired'],
            note: 'light tier; labwired heavy tier optional, see CHOOSING-HARDWARE'
        })],
        silicon: [
            tx('stm32-uart-bootloader-webserial', ['bin', 'hex'], 'stm32'),
            tx('cmsis-dap-swd-webusb', ['bin'], 'stm32')
        ]
    }),
    dev('eater6502', 'Eater 6502', '6502', 'w65c02', {
        pickerCompile: true,
        pickerEmulator: 'w65c02-bench',
        sim: [eng('w65c02-bench', ['hex', 'bin', 'bas'], {
            tier: '2a',
            needs: ['singlesteptests-65c02'],
            note: 'chosen by seating the part; BASIC typed into the MS BASIC ROM over the ACIA'
        })],
        silicon: [tx('eeprom-programmer-webserial', ['hex', 'bin'], 'eeprom')]
    }),
    dev('z80', 'Z80 bench', 'Z80', 'z80', {
        pickerCompile: false,
        pickerEmulator: null,
        sim: [eng('z80-bench', ['hex', 'bin', 'bas'], {
            tier: '2a',
            needs: ['singlesteptests-z80'],
            note: 'BBC BASIC on the bench'
        })],
        silicon: [tx('eeprom-programmer-webserial', ['hex', 'bin'], 'eeprom')]
    }),
    dev('i8086', 'Intel 8086 (DOS bench)', '8086', 'i8086', {
        pickerCompile: false,
        pickerEmulator: null,
        sim: [eng('i8086-machine', ['com', 'bin'], {tier: '2a', needs: ['singlesteptests-8086']})],
        silicon: [tx('com-export', ['com'], null, {...OPEN_DECLARED, task: 'N10'})]
    }),
    ...[['microbit', 'micro:bit'], ['calliopemini', 'Calliope mini']].map(([id, label]) =>
        dev(id, label, 'MicroPython', 'microbit', {
            pickerCompile: false,
            pickerEmulator: null,
            sim: [eng('microbit-sim', ['py'], {
                tier: '2a',
                note: 'the real MicroPython firmware built for the browser, in its own pane'
            })],
            silicon: [
                tx('hex-append-download', ['py'], null, {
                    tier: '2b',
                    note: 'uflash format: runtime + script, drag onto the board; our reader accepts our writer'
                }),
                tx('daplink-webusb', ['hex'], null, {...OPEN_DECLARED, task: 'N9'})
            ]
        })
    ),
    ...[['arcade', 'MakeCode Arcade (160×120)'], ['pybadge', 'Adafruit PyBadge'], ['pybadge-lc', 'Adafruit PyBadge LC']]
        .map(([id, label]) => dev(id, label, ARCADE, 'samd51', {
            pickerCompile: false,
            pickerEmulator: 'arcade',
            sim: [eng('arcade', ['ts'], {
                evidence: EVIDENCE.DECLARED,
                tier: '3',
                note: 'the Arcade console runs PXT output; no SAMD51 instruction emulator'
            })],
            silicon: [
                tx('circuitpython-copy', ['py'], null, {
                    ...OPEN_DECLARED, note: 'manual today: copy code.py onto the CIRCUITPY drive'
                }),
                tx('uf2-bootsel-download', ['uf2'], null, {...OPEN_DECLARED, task: 'L4'})
            ]
        })),
    dev('samd51', 'ATSAMD51J19 (generic)', ARCADE, 'samd51', {
        pickerCompile: false,
        pickerEmulator: null,
        sim: [],
        silicon: [tx('circuitpython-copy', ['py'], null, OPEN_DECLARED)]
    })
]);

// ---- cells, by family ------------------------------------------------------

const AST = {reason: 'is-ast', cite: 'the intermediate form itself'};

/**
 * A null native half with its reason and the number it rests on.
 * @param {string} reason a REASONS key
 * @param {string} cite the measurement
 * @returns {object} the null-native object
 */
const no = function (reason, cite) {
    return {reason, cite};
};

/**
 * A shipped native fact.
 * @param {string} artefact an ARTEFACTS kind
 * @param {string} toolchain what produces it
 * @param {string} where 'local' | 'hosted' | 'none'
 * @param {object} [extra] note, contradiction, evidence, tier, needs
 * @returns {object} the fact
 */
const shipped = function (artefact, toolchain, where, extra = {}) {
    return {
        artefact,
        toolchain,
        where,
        status: STATUS.SHIPPED,
        evidence: EVIDENCE.CHECKED,
        tier: '2c',
        needs: [],
        ...extra
    };
};

/**
 * An open native fact: a path that does not exist yet, with the task that adds it.
 * @param {string} artefact an ARTEFACTS kind
 * @param {string} toolchain what would produce it
 * @param {string} where 'local' | 'hosted' | 'none'
 * @param {?string} task plan task id, or null with a note
 * @param {object} [extra] note
 * @returns {object} the fact
 */
const open = function (artefact, toolchain, where, task, extra = {}) {
    return {artefact, toolchain, where, task, ...OPEN_DECLARED, ...extra};
};

/**
 * A shipped lowered path landing in the named language's native cell.
 * @param {string} lang the landing language id
 * @param {object} [extra] note, form, evidence
 * @returns {object} the path
 */
const via = function (lang, extra = {}) {
    return {via: lang, status: STATUS.SHIPPED, evidence: EVIDENCE.CHECKED, ...extra};
};

/**
 * An open lowered path.
 * @param {string} lang the landing language id
 * @param {string} task plan task id
 * @param {object} [extra] note, form
 * @returns {object} the path
 */
const viaOpen = function (lang, task, extra = {}) {
    return {via: lang, task, ...OPEN_DECLARED, ...extra};
};

/** The ASM row's lowered half: assembly as the listing of compiled C. */
const LISTING = via('c', {form: 'listing'});

const MPY_MIN = 'MicroPython needs roughly 256 KB flash and 16 KB RAM (its smallest official ports)';
const JS_MIN = 'Kaluma and Espruino need a Cortex-M with 64 KB RAM or more';
const STC_RAM = `STC12C5A60S2: 1,280 B RAM; ${MPY_MIN}`;
const AVR_RAM = `ATmega328P: 2 KB RAM; ${MPY_MIN}`;
const F030 = 'STM32F030: 16–32 KB flash, 4 KB RAM';
const MPY = shipped('py', 'MicroPython', 'none', {
    tier: '2a',
    note: 'the real interpreter; what is asserted is only the deploy protocol'
});
const CPY = shipped('py', 'CircuitPython', 'none', {evidence: EVIDENCE.DECLARED, tier: '3'});
const TS = via('ts', {evidence: EVIDENCE.DECLARED});

/**
 * cells[family][language] = { native, lowered[] }.
 * `native` is a fact object or a null-reason object; `lowered` is a list,
 * possibly empty, of {via} entries whose reach is the landing cell's.
 */
export const CELLS = Object.freeze({
    8051: {
        pseudocode: {native: AST, lowered: [via('c')]},
        python: {native: no('ram', STC_RAM), lowered: [via('c')]},
        javascript: {native: no('ram', `STC12C5A60S2: 1,280 B RAM; ${JS_MIN}`), lowered: [via('c')]},
        c: {
            native: shipped('hex', 'SDCC mcs51', 'local', {
                tier: '2a',
                needs: ['ucsim-stc'],
                note: 'SDCC 4.5.0 as four WASM stages; the hosted service is the same compiler'
            }),
            lowered: [via('c')]
        },
        basic: {
            native: open('bas', 'BASIC-52', 'none', 'N8', {note: 'investigation: RAM fit and licence'}),
            lowered: [via('c')]
        },
        asm: {native: shipped('hex', 'sdas8051', 'hosted'), lowered: [LISTING]},
        micropython: {native: no('ram', STC_RAM), lowered: [via('c')]}
    },
    avr: {
        pseudocode: {native: AST, lowered: [via('c')]},
        python: {native: no('ram', AVR_RAM), lowered: [via('c')]},
        javascript: {native: no('ram', `ATmega328P: 2 KB RAM; ${JS_MIN}`), lowered: [via('c')]},
        // DEVICE_GROUPS says `compile: false` for every AVR while the C tab
        // compiles through the hosted avr-gcc. Plan task T5 reconciles; until
        // then the conformance test carries this as a KNOWN contradiction.
        c: {native: shipped('hex', 'avr-gcc', 'hosted'), lowered: [via('c')]},
        basic: {native: open('bas', 'Tiny BASIC (MIT)', 'none', 'N8'), lowered: [via('c')]},
        asm: {native: shipped('hex', 'avr-gcc (as)', 'hosted'), lowered: [LISTING]},
        micropython: {native: no('ram', AVR_RAM), lowered: [via('c')]}
    },
    rp2040: {
        pseudocode: {native: AST, lowered: [via('micropython'), via('c')]},
        python: {native: MPY, lowered: [via('micropython'), via('c')]},
        javascript: {
            native: open('js', 'Kaluma (Apache-2.0) or Espruino (MPL-2.0)', 'none', 'N5'),
            lowered: [via('micropython'), via('c')]
        },
        c: {
            native: shipped('uf2', 'arm-none-eabi-gcc bare-metal', 'hosted', {
                note: 'runs in rp2040js today; the UF2 download for BOOTSEL is task L2'
            }),
            lowered: [via('c')]
        },
        basic: {
            native: no('licence', 'MMBasic (PicoMite) is not permissively licensed; no other Pico BASIC found'),
            lowered: [via('micropython'), via('c')]
        },
        asm: {native: open('bin', 'arm-none-eabi-as', 'hosted', 'N4'), lowered: [LISTING]},
        micropython: {native: MPY, lowered: [via('micropython')]}
    },
    stm32: {
        pseudocode: {native: AST, lowered: [via('c')]},
        python: {native: no('flash', `${F030}; ${MPY_MIN}`), lowered: [via('c')]},
        javascript: {native: no('flash', `${F030}; ${JS_MIN}`), lowered: [via('c')]},
        c: {native: shipped('bin', 'arm-none-eabi-gcc bare-metal', 'hosted'), lowered: [via('c')]},
        basic: {native: no('flash', `${F030}; no BASIC fits beside a program`), lowered: [via('c')]},
        asm: {native: open('bin', 'arm-none-eabi-as', 'hosted', 'N4'), lowered: [LISTING]},
        micropython: {native: no('flash', `${F030}; ${MPY_MIN}`), lowered: [via('c')]}
    },
    microbit: {
        pseudocode: {native: AST, lowered: [via('micropython')]},
        python: {native: MPY, lowered: [via('micropython')]},
        javascript: {native: open('ts', 'PXT static TypeScript (MIT)', 'hosted', 'N5'), lowered: [via('micropython')]},
        c: {
            native: open('hex', 'arm-none-eabi-gcc bare-metal', 'hosted', 'N7', {
                note: 'the hosted service has the nrf52833 linker script but no C target yet'
            }),
            lowered: [via('micropython')]
        },
        basic: {native: no('no-port', 'no BASIC interpreter for the nRF52833 found'), lowered: [via('micropython')]},
        // The hosted /assemble knows nrf52833, but asmTargetForDevice passes
        // 'microbit' through unmapped, so the ASM tab cannot reach it. N4.
        asm: {
            native: open('hex', 'arm-none-eabi-as', 'hosted', 'N4', {
                note: 'hosted chain exists for nrf52833; lite does not route to it'
            }),
            lowered: []
        },
        micropython: {native: MPY, lowered: [via('micropython')]}
    },
    w65c02: {
        pseudocode: {native: AST, lowered: [via('c'), via('basic')]},
        python: {
            native: no('no-port', 'no MicroPython or other Python for the 6502'),
            lowered: [via('c'), via('basic')]
        },
        javascript: {native: no('no-port', 'no JavaScript engine for the 6502'), lowered: [via('c'), via('basic')]},
        c: {native: shipped('bin', 'cc65', 'hosted'), lowered: [via('c')]},
        basic: {
            native: shipped('bas', 'MS BASIC ROM (`ms` profile)', 'none', {
                note: 'typed into the emulated ROM; no serial-typing transport to real hardware yet'
            }),
            lowered: [via('basic')]
        },
        asm: {native: shipped('bin', 'ca65 + ld65', 'hosted'), lowered: [LISTING]},
        micropython: {native: no('no-port', 'no MicroPython for the 6502'), lowered: [via('c'), via('basic')]}
    },
    z80: {
        pseudocode: {native: AST, lowered: [via('basic'), viaOpen('c', 'N1')]},
        python: {
            native: no('no-port', 'no MicroPython or other Python for the Z80'),
            lowered: [via('basic'), viaOpen('c', 'N1')]
        },
        javascript: {
            native: no('no-port', 'no JavaScript engine for the Z80'),
            lowered: [via('basic'), viaOpen('c', 'N1')]
        },
        c: {
            native: open('hex', 'SDCC -mz80', 'hosted', 'N1', {
                note: 'generateC already emits a z80 core; the hosted service assembles Z80 but has no C target'
            }),
            lowered: [viaOpen('c', 'N1')]
        },
        basic: {native: shipped('bas', 'BBC BASIC (`bbc` profile)', 'none'), lowered: [via('basic')]},
        asm: {native: shipped('hex', 'sdasz80 + sdldz80', 'hosted'), lowered: [viaOpen('c', 'N1', {form: 'listing'})]},
        micropython: {native: no('no-port', 'no MicroPython for the Z80'), lowered: [via('basic'), viaOpen('c', 'N1')]}
    },
    i8086: {
        pseudocode: {
            native: AST,
            lowered: [via('asm', {note: 'pseudocode-8086.js lowers in the browser'}), via('c')]
        },
        python: {native: no('no-port', 'no MicroPython or other Python for the 8086'), lowered: [via('asm'), via('c')]},
        javascript: {native: no('no-port', 'no JavaScript engine for the 8086'), lowered: [via('asm'), via('c')]},
        // SmallerC (WASM) emits NASM; the local assembler's NASM front end reads
        // it: 5 of 5 corpus programs, measured by test/smallerc-to-i8086-asm.
        // `float` and `long` are the two named edges.
        c: {
            native: shipped('com', 'SmallerC (WASM) + i8086-asm.js', 'local', {
                note: 'no libc; float does not link (soft-float helper), long is refused by smlrc (-seg16)'
            }),
            lowered: [via('c')]
        },
        // N6 measured 2026-09-05: 0 of 35 GW-BASIC (MIT) sources assemble —
        // they need full MASM (COMMENT, EXTRN, PUBLIC, IF1, macros), a linker
        // and the unreleased OEM layer — and no redistributable binary exists,
        // unlike the 6502's MS BASIC ROM and the Z80's BBC BASIC image.
        basic: {
            native: no('no-port', '0 of 35 GW-BASIC sources assemble on the bench and there is no ' +
                'redistributable binary to boot (bw-board docs/GW-BASIC-ON-THE-BENCH.md)'),
            lowered: [via('asm')]
        },
        asm: {
            native: shipped('com', 'i8086-asm.js (MASM and NASM dialects)', 'local', {
                tier: '2a',
                needs: ['nasm', 'retro-corpus-8086']
            }),
            lowered: [via('asm')]
        },
        micropython: {native: no('no-port', 'no MicroPython for the 8086'), lowered: [via('asm'), via('c')]}
    },
    samd51: {
        pseudocode: {
            native: AST,
            lowered: [via('ts', {
                evidence: EVIDENCE.DECLARED,
                note: 'bw_arcade.py on the hosted service; UF2 open (L4)'
            })]
        },
        python: {native: {...CPY, note: 'silicon by manual copy; no simulator'}, lowered: [TS]},
        javascript: {native: open('ts', 'PXT (MakeCode) static TypeScript', 'hosted', 'L4'), lowered: [TS]},
        c: {
            native: open('uf2', 'arm-none-eabi-gcc bare-metal', 'hosted', null, {
                note: 'silicon only; no SAMD51 instruction emulator. Low priority, no task id.'
            }),
            lowered: [TS]
        },
        basic: {native: no('no-port', 'no permissively licensed BASIC for the SAMD51 found'), lowered: [TS]},
        asm: {
            native: open('uf2', 'arm-none-eabi-as', 'hosted', null, {note: 'silicon only; no emulator'}),
            lowered: []
        },
        micropython: {native: CPY, lowered: [TS]}
    }
});

// ---- lookups ---------------------------------------------------------------

const DEVICE_BY_ID = new Map(DEVICES.map(d => [d.id, d]));
const LANGUAGE_BY_ID = new Map(LANGUAGES.map(l => [l.id, l]));

/**
 * @param {string} id a device id, any case
 * @returns {?object} the device, or null
 */
export const deviceById = function (id) {
    return DEVICE_BY_ID.get(String(id || '').toLowerCase()) || null;
};

/**
 * @param {string} id a language id, any case
 * @returns {?object} the language, or null
 */
export const languageById = function (id) {
    return LANGUAGE_BY_ID.get(String(id || '').toLowerCase()) || null;
};

/**
 * @param {?object} native a cell's native half
 * @returns {boolean} true when it is a null-with-reason rather than a fact
 */
export const isNativeNull = function (native) {
    return !native || typeof native.reason === 'string';
};

const NO_REACH = {sim: false, silicon: false};

/**
 * Reach of one native fact on one device, shipped paths only.
 * @param {?object} native the fact (or null-reason)
 * @param {object} device the device
 * @returns {{sim: boolean, silicon: boolean}} where the artefact can go
 */
export const reachOf = function (native, device) {
    if (isNativeNull(native) || native.status !== STATUS.SHIPPED) return NO_REACH;
    const a = native.artefact;
    return {
        sim: device.sim.some(e => e.status === STATUS.SHIPPED && e.runs.includes(a)),
        silicon: device.silicon.some(t => t.status === STATUS.SHIPPED && t.accepts.includes(a))
    };
};

/**
 * The resolved cell for (language, device): native with its reach, every
 * lowered path with the reach of the cell it lands in, and `kind`.
 * @param {string} langId a language id
 * @param {string} deviceId a device id
 * @returns {?object} {language, device, native, lowered, kind} or null for an
 *   unknown pair or a non-programmable device
 */
export const cell = function (langId, deviceId) {
    const lang = languageById(langId);
    const device = deviceById(deviceId);
    if (!lang || !device || device.programmable === false) return null;
    const fam = CELLS[device.family];
    const raw = fam && fam[lang.id];
    if (!raw) return null;
    // A device may override facts of its family's cell (e.g. one STC part
    // whose C compiles hosted rather than locally). Reach is computed after.
    const override = (device.overrides && device.overrides[lang.id]) || null;
    const native = isNativeNull(raw.native) ?
        {...raw.native, ...NO_REACH} :
        {...raw.native, ...override, ...reachOf(raw.native, device)};
    const lowered = raw.lowered.map(l => {
        const landing = fam[l.via] && fam[l.via].native;
        const reach = l.status === STATUS.SHIPPED ? reachOf(landing, device) : NO_REACH;
        return {...l, landing: isNativeNull(landing) ? null : landing, ...reach};
    });
    const hasNative = !isNativeNull(native) && native.status === STATUS.SHIPPED;
    const hasLowered = lowered.some(l => l.status === STATUS.SHIPPED);
    let kind = 'none';
    if (hasNative && hasLowered) kind = 'both';
    else if (hasNative) kind = 'native';
    else if (hasLowered) kind = 'lowered';
    return {language: lang, device, native, lowered, kind};
};

/**
 * Every programmable device x every language, for the overall view.
 * @returns {Array<{device: object, cells: object[]}>} one row per device
 */
export const overall = function () {
    return DEVICES.filter(d => d.programmable !== false)
        .map(d => ({device: d, cells: LANGUAGES.map(l => cell(l.id, d.id))}));
};

const T = {
    en: {
        native: 'native',
        lowered: 'lowered',
        via: 'via',
        simOnly: 'simulator only',
        siliconOnly: 'silicon only',
        simAndSilicon: 'simulator and silicon',
        neither: 'not runnable yet',
        open: 'open',
        task: 'task',
        nativeNo: 'no native path',
        on: 'on',
        unknown: 'no entry for this language and device',
        local: 'in the browser',
        hosted: 'hosted compiler',
        none: 'runs the language itself'
    },
    de: {
        native: 'nativ',
        lowered: 'übersetzt',
        via: 'über',
        simOnly: 'nur Simulator',
        siliconOnly: 'nur Hardware',
        simAndSilicon: 'Simulator und Hardware',
        neither: 'noch nicht lauffähig',
        open: 'offen',
        task: 'Aufgabe',
        nativeNo: 'kein nativer Weg',
        on: 'auf',
        unknown: 'kein Eintrag für diese Sprache und dieses Gerät',
        local: 'im Browser',
        hosted: 'gehosteter Compiler',
        none: 'führt die Sprache selbst aus'
    }
};

/**
 * @param {object} t a T locale table
 * @param {{sim: boolean, silicon: boolean}} r a reach
 * @returns {string} the phrase for it
 */
const reachWord = function (t, r) {
    if (r.sim && r.silicon) return t.simAndSilicon;
    if (r.sim) return t.simOnly;
    if (r.silicon) return t.siliconOnly;
    return t.neither;
};

/**
 * @param {string} id a language id
 * @returns {string} its label, or the id when unknown (e.g. 'ts')
 */
const labelOf = function (id) {
    const l = languageById(id);
    return l ? l.label : id;
};

/**
 * One line for the badge's title, e.g.
 *   "Python on Raspberry Pi Pico: native (MicroPython) · silicon only ·
 *    lowered via MicroPython, C · simulator and silicon"
 * @param {string} langId a language id
 * @param {string} deviceId a device id
 * @param {string} [locale] 'en' or 'de'
 * @returns {string} the sentence
 */
export const explain = function (langId, deviceId, locale = 'en') {
    const t = T[locale] || T.en;
    const c = cell(langId, deviceId);
    if (!c) return t.unknown;
    const parts = [];
    if (isNativeNull(c.native)) {
        const r = REASONS[c.native.reason] || {};
        parts.push(`${t.nativeNo} (${r[locale] || r.en || c.native.reason})`);
    } else if (c.native.status === STATUS.SHIPPED) {
        const where = t[c.native.where] || c.native.where;
        parts.push(`${t.native} (${c.native.toolchain}, ${where}) · ${reachWord(t, c.native)}`);
    } else {
        const task = c.native.task ? ` · ${t.task} ${c.native.task}` : '';
        parts.push(`${t.native} (${c.native.toolchain}): ${t.open}${task}`);
    }
    const shippedLowered = c.lowered.filter(l => l.status === STATUS.SHIPPED);
    if (shippedLowered.length) {
        const vias = [...new Set(shippedLowered.map(l => labelOf(l.via)))].join(', ');
        const reach = {sim: shippedLowered.some(l => l.sim), silicon: shippedLowered.some(l => l.silicon)};
        parts.push(`${t.lowered} ${t.via} ${vias} · ${reachWord(t, reach)}`);
    }
    for (const l of c.lowered.filter(x => x.status === STATUS.OPEN)) {
        parts.push(`${t.lowered} ${t.via} ${labelOf(l.via)}: ${t.open} · ${t.task} ${l.task}`);
    }
    return `${c.language.label} ${t.on} ${c.device.label}: ${parts.join(' · ')}`;
};

const S = {
    en: {
        native: 'native',
        lowered: 'lowered',
        both: 'native + lowered',
        open: 'open',
        via: 'via',
        sim: 'sim',
        silicon: 'silicon',
        none: 'no path yet'
    },
    de: {
        native: 'nativ',
        lowered: 'übersetzt',
        both: 'nativ + übersetzt',
        open: 'offen',
        via: 'über',
        sim: 'Sim',
        silicon: 'Hardware',
        none: 'noch kein Weg'
    }
};

/**
 * The compact badge: "native · sim + silicon", "lowered via C · sim",
 * "open · N1". `explain()` is its title text.
 * @param {string} langId a language id
 * @param {string} deviceId a device id
 * @param {string} [locale] 'en' or 'de'
 * @returns {string} the badge text, '' for an unknown pair
 */
export const summarize = function (langId, deviceId, locale = 'en') {
    const s = S[locale] || S.en;
    const c = cell(langId, deviceId);
    if (!c) return '';
    const reach = r => [r.sim && s.sim, r.silicon && s.silicon].filter(Boolean).join(' + ') || s.none;
    if (c.kind === 'none') {
        const tasks = [c.native, ...c.lowered]
            .filter(x => x && x.status === STATUS.OPEN && x.task)
            .map(x => x.task);
        return tasks.length ? `${s.open} · ${[...new Set(tasks)].join(', ')}` : s.none;
    }
    const shippedLowered = c.lowered.filter(l => l.status === STATUS.SHIPPED);
    const lowReach = {sim: shippedLowered.some(l => l.sim), silicon: shippedLowered.some(l => l.silicon)};
    if (c.kind === 'native') return `${s.native} · ${reach(c.native)}`;
    const vias = [...new Set(shippedLowered.map(l => labelOf(l.via)))].join(', ');
    if (c.kind === 'lowered') return `${s.lowered} ${s.via} ${vias} · ${reach(lowReach)}`;
    return `${s.both} · ${reach({sim: c.native.sim || lowReach.sim, silicon: c.native.silicon || lowReach.silicon})}`;
};
