/**
 * Pseudocode → 8086 assembly, in the browser, with no network and no
 * toolchain. The offline half of the ▶ button for the DOS bench.
 *
 * WHY THIS FILE EXISTS. Every other device reaches silicon the same way:
 * `SB3Creator.generateC(project)` and a POST to stc-compiler. That chain has
 * no 8086 back end and is not about to grow one — the same reason
 * `bw-asm/assemble-route.js` had to open a local assembler route. So the
 * blocks a learner writes reach an 8086 by being lowered HERE, to the MASM
 * subset `bw-board/i8086-asm.js` already assembles, and handed to the same
 * `requestAssembly` the ASM tab uses. No network is involved at any point,
 * which is the whole claim: this button works on a train.
 *
 * IT IS NOT A NEW LANGUAGE DESIGN. `generateC` already decided what a
 * WHEN block means, and this file follows it rather than inventing a second
 * answer. In particular it mirrors generateC's SINGLE-SCRIPT shape — the one
 * where `_cTasks` is false and the body is emitted straight-line into
 * `main()` with a blocking `delay_ms()`. That is not a shortcut around the
 * cooperative scheduler; it is the form generateC itself emits for one
 * script, and the scheduler form is REFUSED by name here (see DECISION 3).
 *
 * ── DECISION 1: WHAT IS THE TICK? ────────────────────────────────────────
 *
 * One MICROSECOND, and `wait` is INT 15h AH=86h — FOR A SINGLE SCRIPT. Not
 * the 18.2 Hz BIOS tick, and emphatically not the 8254.
 *
 * **AMENDED 2026-09-04.** The reasoning below is still right about the 8254's
 * RATE and still right that INT 15h is the best single-script answer. It was
 * wrong about one thing, and the error was load-bearing: it concluded that
 * because the 8254 cannot INTERRUPT here, a cooperative scheduler was
 * impossible, and two WHEN scripts were refused on that basis. A scheduler
 * does not need an interrupt — it needs a clock it can READ, and counter 0
 * can be latched and read at any time. Two scripts now work (see
 * `schedRuntime`), on a polled counter, with no PIC.
 *
 * The rate caveat below is exactly why that scheduler MEASURES the counter
 * instead of assuming 1193182 Hz: assuming it made every wait 4.19x too
 * short, which is the same 4.19x this section predicted.
 *
 * The 8254 is the obvious answer and it is the wrong one HERE, for a reason
 * that is measurable rather than aesthetic. `DOSBOX8086_XT` (i8086-dos.js)
 * is `clockHz: 5_000_000` and lists `{kind: 'pit', name: 'pit1', at: 0x40}`
 * with NO `irq` key; `I8086Machine._advanceChips(n)` (i8086-machine.js) then
 * feeds every chip the CPU's own cycle count. So counter 0 on this bench is
 * clocked at 5 MHz, not the PC's 1.193182 MHz. The canonical PC program —
 * program counter 0 with divisor 65536 and count its output — yields
 * 76.29 Hz here where every book says 18.2065 Hz. That is a 4.19× error in
 * every duration, in a program that runs, prints plausible numbers, and
 * blames the learner. It is exactly the failure the 32-bit narrowing rule
 * exists to forbid, wearing a different hat.
 *
 * The 8254 also cannot interrupt: that config has no PIC and the PIT is
 * deliberately not wired to an IRQ line ("DELIBERATELY NO PIC, AND THE PIT
 * IS NOT WIRED TO AN IRQ", i8086-dos.js). So the 8051's shape — a Timer-0
 * ISR that does nothing but `bw_ms++` — has no counterpart on this machine
 * at all. Polling is not a compromise here, it is the only thing available.
 *
 * What this bench DOES publish correctly is simulated machine time
 * (`machine.tMs = cycles / clockHz`), through three doors: INT 1Ah/00h at
 * 18.2065 Hz, INT 21h/2Ch at 10 ms, and INT 15h/86h at 1 µs. The first two
 * are counters you read; the third is a WAIT, and it is the one worth
 * having, because `int15()` sets `machine.cycles = cycles + us*clockHz/1e6`
 * directly. That makes a wait
 *
 *   - EXACT at every duration a learner can type. `wait 1 secs` is
 *     1 000 000 µs, measured at 1005.076 ms of machine time end to end on
 *     this bench, against 18 BIOS ticks = 988.7 ms (1.1% short) or a wait of
 *     0.02 s rounding to ZERO ticks and not happening at all;
 *   - FREE. It costs no emulated instructions, so a ten-second program
 *     finishes in two 5 ms slices instead of spinning ~2.4 million polls of
 *     a counter through the trap page.
 *
 * The cost, stated rather than hidden: INT 15h/86h BLOCKS. With one script
 * that is precisely Scratch's semantics and precisely what generateC's
 * straight-line `delay_ms()` does. With two it would starve one of them,
 * which is why two scripts are refused by name rather than half-scheduled.
 * A future lane that wants the cooperative scheduler needs a POLLED clock,
 * and INT 1Ah/00h is the one to build it on — INT 21h/2Ch is finer (10 ms)
 * but its fields must be recombined into a monotonic counter by hand, and
 * the 8254 remains wrong for the reason above.
 *
 * ── DECISION 2: WHAT HAPPENS TO 32-BIT VARIABLES? ────────────────────────
 *
 * They stay 32 bits. Nothing here narrows.
 *
 * `generateC` declares every user variable `static long` and says why in the
 * emitted source: "int is 16-bit on sdcc/avr-gcc/cc65 and silently wraps
 * mid-expression". The 8086 is a 16-bit machine, so the choice was between
 * emitting register pairs and refusing the whole device. Register pairs won,
 * because the refusal would have been a refusal of arithmetic itself — a
 * learner's `set counter to 100000` is not an exotic program.
 *
 * So: every variable is `DW 0, 0`, every value lives in DX:AX (high:low),
 * every intermediate is pushed as a pair, and the four operations that
 * cannot be done in one instruction get a runtime routine — BW_MUL32 (three
 * MULs, low 32 bits), BW_UDIV32 (a 32-iteration shift-subtract), BW_SDIV
 * (sign handling around it) and BW_PRINTN (repeated division by ten). Add,
 * subtract and all three comparisons are inline ADD/ADC, SUB/SBB and a
 * high-word-then-low-word compare.
 *
 * WHERE NARROWING WOULD HAVE BEEN EASY AND IS NOT DONE: the REPEAT counter.
 * generateC uses `unsigned int` for it, which is 16 bits on sdcc — so
 * `repeat 100000` on an 8051 runs 34464 times. Here the counter is a
 * 32-bit pair decremented with SUB/SBB, and `repeat 100000` runs 100000
 * times. This file is not obliged to reproduce that.
 *
 * The one place a number IS refused rather than truncated is a literal that
 * does not fit a signed 32-bit integer: `set x to 5000000000` throws
 * `number out of range`, because storing it would be the silent wrap this
 * decision exists to prevent. RUNTIME overflow past 2^31 wraps, exactly as
 * `long` does in the C path — same contract, same limit, stated here so it
 * is not a surprise.
 *
 * ── DECISION 3: WHICH BLOCKS LOWER ───────────────────────────────────────
 *
 * `SUPPORTED` below is the whole list and it is short on purpose. Everything
 * else THROWS, by name, naming the block in the learner's own spelling.
 *
 * Warning-and-continue was the other option — it is what `cWarn` does in
 * generateC, where an unsupported block becomes a C comment and the program
 * builds without it. That is the right trade on a device whose whole output
 * is a pin wiggling: you still get most of the program. It is the wrong one
 * here. This button's output is CHARACTERS ON A SCREEN, and a program that
 * silently dropped `say` would run, terminate cleanly, and show nothing —
 * indistinguishable from a broken emulator, which is the exact failure
 * `test/i8086-asm-examples.test.mjs` was written to stop. So the refusal is
 * a hard stop with a message that names the block and lists what does work.
 *
 * NOT DONE, and named rather than left to be discovered:
 *   - Sprites, DEFINE (custom blocks), lists, strings in variables, `join`.
 *
 * EVERY EVENT HAT NOW LOWERS, as of 2026-09-04: more than one WHEN flag
 * script, WHEN <pin> pressed/released, WHEN I receive, and WHEN <key>
 * pressed — see `schedRuntime`, `emitPinHat`, `emitMessageHat` and
 * `emitKeyHat`. Two of the three refusal REASONS turned out to be wrong
 * rather than merely expensive: broadcast needed no queue (the receiver is
 * already a task watching one byte), and the key hat needed no edge (a pin
 * has a level so a hat must manufacture one, but DOS hands over a QUEUE of
 * keystrokes and each arrival is already an event).
 *   - Sprites. A DOS program has no stage; a project with a SPRITE section
 *     is refused rather than silently flattened.
 *   - Custom blocks (DEFINE), lists, strings-in-variables, `join`, and every
 *     motion/sensing/sound block. Refused.
 *   - PIN I/O. `set pin 13 high` on this tier is an 8255 port write, not an
 *     AVR register, and it needs the chip list the circuit extractor
 *     produces. That is a different lane's input and none of it is wired
 *     here; `stc12_setpin` is refused with that sentence.
 *
 * @module
 */

import {requestAssembly} from './assemble-route.js';

/**
 * A refusal, in the shape `i8086-asm.js` uses for a directive it will not
 * assemble: a lower-case sentence that names the construct in the user's own
 * spelling, and a short stable `what` tag to bucket by.
 *
 * There is no `line`, because a block has no line number — `block` carries
 * the opcode instead, which is the thing a bug report needs.
 */
export class Pseudocode8086Error extends Error {
    /** @param {string} message @param {{what?: string, block?: string}} [ctx] */
    constructor (message, ctx = {}) {
        super(`8086 pseudocode: ${message}`);
        this.name = 'Pseudocode8086Error';
        this.what = ctx.what || 'error';
        this.block = ctx.block || '';
    }
}

/**
 * Every block this back end lowers, by opcode, with the pseudocode spelling
 * a learner would have typed. Exported because it is the honest deliverable:
 * the refusal message prints it, and the gate asserts that each entry really
 * does assemble and run.
 */
export const SUPPORTED = Object.freeze({
    event_whenflagclicked: 'WHEN flag clicked:',
    data_setvariableto: 'set <var> to <value>',
    data_changevariableby: 'change <var> by <value>',
    control_repeat: 'REPEAT <n>:',
    control_forever: 'FOREVER:',
    control_if: 'IF <cond> THEN:',
    control_if_else: 'IF <cond> THEN: / ELSE:',
    control_repeat_until: 'REPEAT UNTIL <cond>:',
    control_wait: 'wait <n> secs',
    control_stop: 'stop all / stop this script',
    looks_say: 'say <value>',
    looks_sayforsecs: 'say <value> for <n> secs',
    stc12_print: 'print <value>',
    operator_add: '<a> + <b>',
    operator_subtract: '<a> - <b>',
    operator_multiply: '<a> * <b>',
    operator_divide: '<a> / <b>',
    operator_mod: '<a> mod <b>',
    operator_lt: '<a> < <b>',
    operator_gt: '<a> > <b>',
    operator_equals: '<a> = <b>',
    operator_and: '<cond> and <cond>',
    operator_or: '<cond> or <cond>',
    operator_not: 'not <cond>',
    // The pin blocks WERE lowered and were still listed as refusable below,
    // so every refusal printed a "this back end lowers:" sentence that did
    // not mention pins -- the one thing a reseated program is most likely to
    // be using. Found while adding the keypad.
    stc12_setpin: 'set <pin> high/low',
    stc12_toggle: 'toggle <pin>',
    stc12_read: 'read <pin>',
    stc12_keypad: 'read <keypad>',
    stc12_setport: 'set <port> to <value>',
    stc12_readport: 'read <port>',
    stc12_writepin: 'set <pin> to <value>',
    stc12_settone: 'set <pin> to <n> hz',
    control_wait_until: 'wait until <cond>',
    stc12_whenpin: 'WHEN <pin> pressed/released:',
    event_whenbroadcastreceived: 'WHEN I receive "<message>":',
    event_broadcast: 'broadcast "<message>"',
    event_whenkeypressed: 'WHEN <key> key pressed:',
    stc12_setpwm: 'set <pin> to <n> percent',
    stc12_seg_shownum: 'show number <n> on <display>',
    stc12_seg_clear: 'clear <display>'
});

/** What a refused block is called, when the opcode alone would not say. */
const BLOCK_NAMES = {
    looks_sayforsecs: 'say ... for ... secs',
    looks_think: 'think ...',
    motion_movesteps: 'move ... steps',
    motion_gotoxy: 'go to x: ... y: ...',
    operator_join: '... join ...',
    operator_random: 'pick random ... to ...',
    operator_mathop: 'sqrt/sin/cos/... of ...',
    data_addtolist: 'add ... to <list>',
    control_create_clone_of: 'create clone of ...',
    procedures_definition: 'DEFINE ...',
    procedures_call: 'a custom block call'
};

/** The list a refusal prints, so "unsupported" is never the whole message. */
const SUPPORTED_SENTENCE = () =>
    `this back end lowers: ${Object.values(SUPPORTED).join(', ')}.`;

const nameOf = (opcode) => BLOCK_NAMES[opcode] || opcode;

const refuse = (message, what, block) => {
    throw new Pseudocode8086Error(message, {what, block});
};

/**
 * `IF flag THEN:` does not parse to a bare variable — it parses to
 * `operator_equals` against the LITERAL STRING "true".
 *
 * This is `SB3Creator.boolishTruthTest`, reimplemented rather than imported
 * because importing the compiler here would drag `jszip` into a module whose
 * whole job is to need nothing. It is a verbatim transcription of that
 * static, including the rule that a right-hand literal wins over a left-hand
 * one; `test/pseudocode-8086.test.mjs` drives BOTH against the same table so
 * the copy cannot drift from the original in silence.
 *
 * Without it a learner's `IF flag THEN:` is refused with "true is not a
 * number" — which is true of the block that was PARSED and nonsense about
 * the block that was written.
 */
export function boolishTruthTest (b) {
    if (!b || b.opcode !== 'operator_equals' || !b.inputs) return null;
    const lit = (k) => {
        const inner = Array.isArray(b.inputs[k]) ? b.inputs[k][1] : null;
        return Array.isArray(inner) && (inner[0] === 10 || inner[0] === 4)
            ? String(inner[1]) : null;
    };
    const l = lit('OPERAND1'), r = lit('OPERAND2');
    if (/^true$/i.test(r || '')) return {key: 'OPERAND1', negate: false};
    if (/^false$/i.test(r || '')) return {key: 'OPERAND1', negate: true};
    if (/^true$/i.test(l || '')) return {key: 'OPERAND2', negate: false};
    if (/^false$/i.test(l || '')) return {key: 'OPERAND2', negate: true};
    return null;
}

/** Signed 32-bit range. A literal outside it is refused, never wrapped. */
/** The 8255 on this tier, at the XT's addresses: A=60h, B=61h, C=62h,
 *  control=63h. The same chip the keyboard's scancode arrives on, which is
 *  why one board can serve a pin program and a keyboard program at once. */
// The ADC0809 lives in 300h-31Fh, the block IBM documented for cards a user
// adds -- a learner's add-on board belongs where add-on boards went.
// The 8254's input clock on a PC: 14.31818 MHz / 12. Every tone this machine
// can make is this divided by a whole number.
const PIT_HZ = 1193182;
const PIT_BASE = 0x40;
// Per-script stack. Deep enough for the nesting this back end can produce
// (expressions push at most a few words, and there are no recursive calls),
// small enough that eight scripts cost 2K.
// Per-script stack. PREEMPTION CAN HAPPEN ANYWHERE, so each stack must also
// hold an interrupt frame (3 words) plus the nine saved registers on top of
// whatever the script itself is using -- 24 bytes of overhead per suspension,
// which the cooperative version did not have to carry.
const SCHED_STACK = 512;
// Eight scripts is 2K of stack. Past that a .COM has more scheduler than
// program in its one segment.
const MAX_SCRIPTS = 8;

/** The literal behind an input, or null if it is computed. Used only to say
 *  which frequency will actually be played -- never to change what is emitted. */
function literalNumber (input) {
    const inner = Array.isArray(input) ? input[1] : null;
    if (!Array.isArray(inner)) return null;
    const n = Number(inner[1]);
    return Number.isFinite(n) ? n : null;
}

const ADC_BASE = 0x300;
const ADC_EOC = 0x308;

const PPI_BASE = 0x60;
const PPI_CTRL = 0x63;

const I32_MIN = -2147483648;
const I32_MAX = 2147483647;

/** MASM wants a leading digit and an `h` suffix; there is no `0x` here. */
const hex16 = (n) => {
    const v = n & 0xffff;
    const s = v.toString(16).toUpperCase();
    return (/^[0-9]/.test(s) ? s : `0${s}`) + 'h';
};

/**
 * A quoted MASM byte list for arbitrary text.
 *
 * Printable ASCII goes in quotes so the generated source stays readable;
 * anything else — a quote character, a tab, an accented letter — goes out as
 * a number. There is no escape syntax to get wrong this way, and a `$` in a
 * learner's text cannot truncate the string (which is also why printing goes
 * through INT 21h AH=02h per character rather than AH=09h).
 */
const dbBytes = (text) => {
    const parts = [];
    let run = '';
    const flush = () => { if (run) { parts.push(`'${run}'`); run = ''; } };
    for (const ch of String(text)) {
        const c = ch.codePointAt(0);
        if (c >= 0x20 && c <= 0x7e && ch !== "'") run += ch;
        else { flush(); parts.push(c > 0xff ? '3Fh' : hex8(c)); }
    }
    flush();
    parts.push('0');
    return parts.join(', ');
};

const hex8 = (n) => {
    const s = (n & 0xff).toString(16).toUpperCase();
    return (/^[0-9]/.test(s) ? s : `0${s}`) + 'h';
};

/** ------------------------------------------------------------------ */

class Emitter {
    constructor () {
        this.code = [];
        this.data = [];
        this.warnings = [];
        this.labels = 0;
        this.vars = new Map();      // variable id -> {sym, name}
        this.strings = new Map();   // text -> symbol
        this.counters = [];         // REPEAT counter symbols
        this.uses = {
            puts: false, crlf: false, printn: false,
            mul: false, div: false, mod: false, sdiv: false, ppi: false,
            keypad: false, adc: false, sched: false, keypump: false, seg: false
        };
        this.pins = [];             // declared PINs, from the parser
        this.ports = [];            // declared PORTs -- eight bits at once
        // More than one WHEN script means the cooperative scheduler, and that
        // changes what `wait` and `stop this script` compile to. One script
        // keeps the straight-line path: simpler code, and no reason to make
        // every existing program pay for a scheduler it does not use.
        this.tasks = 1;
        this.messages = new Map();  // broadcast name -> its flag symbol
        this.pwm = new Map();       // PWM pin name -> its duty byte + task
        this.segs = new Map();      // 7-seg display name -> its buffer + task
        this.parts = [];            // declared PARTs (keypad4x4 only, so far)
        this.keypads = new Map();   // name -> label, one scan routine each
    }

    warn (message) {
        if (!this.warnings.includes(message)) this.warnings.push(message);
    }

    label (tag) { return `BW_${tag}${this.labels++}`; }

    emit (...lines) { for (const l of lines) this.code.push(l); }

    /** `    MOV AX, 1` — one indent level for everything inside the body. */
    op (text) { this.code.push(`    ${text}`); }

    note (text) { this.code.push(`    ; ${text}`); }

    // ---- data ---------------------------------------------------------

    /**
     * The label a variable gets, and it carries the learner's own name where
     * it can. `BW_V_counter` rather than `BW_V0`: the generated assembly is
     * left in the ASM tab to be read, and a listing whose every operand is
     * `BW_V3` teaches nothing about which variable it is. The `BW_V_` prefix
     * keeps it clear of every mnemonic, register and directive name, and the
     * numeric fallback covers a name that is not an identifier (or that
     * sanitises to one already taken).
     */
    varSym (field) {
        const [name, id] = field;
        const key = id || name;
        if (!this.vars.has(key)) {
            const clean = String(name).replace(/[^A-Za-z0-9_]/g, '_').replace(/^_+/, '');
            const taken = new Set([...this.vars.values()].map(v => v.sym));
            let sym = /^[A-Za-z]/.test(clean) ? `BW_V_${clean}` : '';
            if (!sym || taken.has(sym)) sym = `BW_V${this.vars.size}`;
            this.vars.set(key, {sym, name});
        }
        return this.vars.get(key).sym;
    }

    stringSym (text) {
        if (!this.strings.has(text)) {
            this.strings.set(text, `BW_S${this.strings.size}`);
        }
        return this.strings.get(text);
    }

    counterSym () {
        const sym = `BW_C${this.counters.length}`;
        this.counters.push(sym);
        return sym;
    }

    // ---- values -------------------------------------------------------

    /**
     * A numeric literal, as an exact signed 32-bit integer.
     *
     * Truncation of a fraction is a WARNING, not a silence: every value in
     * this back end is an integer (as in the C device path, whose variables
     * are `long`), so `set x to 2.5` really does store 2 and the learner is
     * told. A value that does not fit 32 bits is REFUSED — see DECISION 2.
     */
    literal (raw, where) {
        const n = Number(raw);
        if (!Number.isFinite(n)) {
            refuse(`"${raw}" is not a number, and every value on this target is a ` +
                `32-bit integer — text can only be printed, not stored or ` +
                `calculated with`, 'non-numeric value', where);
        }
        const t = Math.trunc(n);
        if (t !== n) {
            this.warn(`${n} was stored as ${t}: every value on this target is a whole ` +
                `number, the same as the "long" the C back end emits`);
        }
        if (t < I32_MIN || t > I32_MAX) {
            refuse(`${t} does not fit a 32-bit whole number (${I32_MIN} to ${I32_MAX}), ` +
                `and storing it would wrap silently`, 'number out of range', where);
        }
        return t;
    }

    /** DX:AX <- constant. */
    loadConst (n) {
        const lo = n & 0xffff;
        const hi = (n >> 16) & 0xffff;
        this.op(`MOV AX, ${hex16(lo)}`);
        this.op(`MOV DX, ${hex16(hi)}`);
    }

    /**
     * Evaluate a numeric input into DX:AX.
     *
     * `input` is a Scratch input array. `[1, [4, "10"]]` is a literal,
     * `[3, [12, name, id], ...]` is a variable, and a bare block id is a
     * nested reporter.
     */
    evalNum (input, where) {
        if (!Array.isArray(input)) { this.loadConst(0); return; }
        const inner = input[1];
        if (Array.isArray(inner)) {
            const [type, a, b] = inner;
            if (type === 12) {
                const sym = this.varSym([a, b]);
                this.op(`MOV AX, [${sym}]`);
                this.op(`MOV DX, [${sym}+2]`);
                return;
            }
            if (type === 13) {
                refuse('lists are not supported on this target — a list needs an ' +
                    'allocator, and this back end has 32-bit variables and nothing else',
                    'list', where);
            }
            this.loadConst(this.literal(a, where));
            return;
        }
        if (typeof inner === 'string' && this.blocks[inner]) {
            this.evalReporter(this.blocks[inner]);
            return;
        }
        this.loadConst(0);
    }

    /** Left operand in DX:AX, right in CX:BX. Both fully evaluated. */
    evalPair (b, k1, k2) {
        this.evalNum(b.inputs[k1], b.opcode);
        this.op('PUSH DX');
        this.op('PUSH AX');
        this.evalNum(b.inputs[k2], b.opcode);
        this.op('MOV CX, DX');
        this.op('MOV BX, AX');
        this.op('POP AX');
        this.op('POP DX');
    }

    evalReporter (b) {
        switch (b.opcode) {
        case 'operator_add':
            this.evalPair(b, 'NUM1', 'NUM2');
            this.op('ADD AX, BX');
            this.op('ADC DX, CX');
            return;
        case 'operator_subtract':
            this.evalPair(b, 'NUM1', 'NUM2');
            this.op('SUB AX, BX');
            this.op('SBB DX, CX');
            return;
        case 'operator_multiply':
            this.evalPair(b, 'NUM1', 'NUM2');
            this.uses.mul = true;
            this.op('CALL BW_MUL32');
            return;
        case 'operator_divide':
            this.evalPair(b, 'NUM1', 'NUM2');
            this.uses.div = true; this.uses.sdiv = true;
            this.warn('"/" is whole-number division here (7 / 2 is 3), the same as the ' +
                'C back end every other device uses — there is no floating point on ' +
                'this target. Dividing by 0 gives 0.');
            this.op('CALL BW_DIV32');
            return;
        case 'operator_mod':
            this.evalPair(b, 'NUM1', 'NUM2');
            this.uses.mod = true; this.uses.sdiv = true;
            this.warn('"mod" takes its sign from the left-hand value (-7 mod 3 is -1), ' +
                'the same as the C back end. Scratch\'s own mod follows the right-hand ' +
                'value instead.');
            this.op('CALL BW_MOD32');
            return;
        case 'operator_lt': case 'operator_gt': case 'operator_equals':
        case 'operator_and': case 'operator_or': case 'operator_not':
            this.evalCond(b);
            return;
        case 'stc12_read':
            this.note('pin');
            this.emitPinRead(b.fields.PIN[0], b.opcode);
            return;
        case 'stc12_readport':
            this.note('port');
            this.emitPortRead(b.fields.PORT[0], b.opcode);
            return;
        case 'stc12_keypad':
            this.note('keypad');
            this.emitKeypadRead(b.fields.PART[0], b.opcode);
            return;
        default:
            refuse(`"${nameOf(b.opcode)}" is not supported on the 8086 — ` +
                SUPPORTED_SENTENCE(), `unsupported reporter ${b.opcode}`, b.opcode);
        }
    }

    // ---- conditions ---------------------------------------------------

    /** DX:AX <- 0 or 1 for an arbitrary value already in DX:AX. */
    toBool () {
        const done = this.label('B');
        this.op('OR AX, DX');
        this.op(`JZ ${done}`);
        this.op('MOV AX, 1');
        this.code.push(`${done}:`);
        this.op('XOR DX, DX');
    }

    /**
     * Does this expression read anything OUTSIDE the program's own variables?
     *
     * Used only to decide whether a `wait until` can ever finish. A pin, a
     * port or a keypad can change without the program doing anything; a
     * variable in a single-script program with no interrupt handlers cannot
     * change inside a loop whose body is empty.
     */
    readsTheWorld (input) {
        const OUTSIDE = new Set(['stc12_read', 'stc12_readport', 'stc12_keypad']);
        const seen = new Set();
        const walk = (id) => {
            if (!id || seen.has(id)) return false;      // `seen` guards a cycle
            seen.add(id);
            const b = this.blocks[id];
            if (!b) return false;
            if (OUTSIDE.has(b.opcode)) return true;
            for (const v of Object.values(b.inputs || {})) {
                if (Array.isArray(v) && typeof v[1] === 'string' && walk(v[1])) return true;
            }
            return false;
        };
        return Array.isArray(input) && typeof input[1] === 'string' && walk(input[1]);
    }

    /** Evaluate a boolean input to 0/1 in DX:AX. */
    evalCondInput (input, where) {
        if (!Array.isArray(input)) { this.loadConst(0); return; }
        const inner = input[1];
        if (typeof inner === 'string' && this.blocks[inner]) {
            this.evalCond(this.blocks[inner]);
            return;
        }
        // An empty hexagon is false, as it is in generateC's cCond.
        if (inner === null || inner === undefined) { this.loadConst(0); return; }
        this.evalNum(input, where);
        this.toBool();
    }

    /** A comparison or a boolean operator, to 0/1 in DX:AX. */
    evalCond (b) {
        switch (b.opcode) {
        case 'operator_lt': case 'operator_gt': case 'operator_equals': {
            // `IF flag THEN:` — a truthiness test wearing an equals block.
            const truthy = boolishTruthTest(b);
            if (truthy) {
                this.evalNum(b.inputs[truthy.key], b.opcode);
                this.toBool();
                if (truthy.negate) this.op('XOR AX, 1');
                return;
            }
            this.evalPair(b, 'OPERAND1', 'OPERAND2');
            const yes = this.label('T');
            const end = this.label('T');
            this.op('XOR SI, SI');
            if (b.opcode === 'operator_equals') {
                this.op('CMP DX, CX');
                this.op(`JNE ${end}`);
                this.op('CMP AX, BX');
                this.op(`JNE ${end}`);
                this.op('MOV SI, 1');
            } else {
                // gt(l, r) is lt(r, l); emit one shape with the registers swapped.
                const [h1, h2, l1, l2] = b.opcode === 'operator_lt'
                    ? ['DX', 'CX', 'AX', 'BX'] : ['CX', 'DX', 'BX', 'AX'];
                this.op(`CMP ${h1}, ${h2}`);
                this.op(`JL ${yes}`);
                this.op(`JG ${end}`);
                this.op(`CMP ${l1}, ${l2}`);
                this.op(`JB ${yes}`);
                this.op(`JMP ${end}`);
                this.code.push(`${yes}:`);
                this.op('MOV SI, 1');
            }
            this.code.push(`${end}:`);
            this.op('MOV AX, SI');
            this.op('XOR DX, DX');
            return;
        }
        case 'operator_and': case 'operator_or': {
            this.evalCondInput(b.inputs.OPERAND1, b.opcode);
            this.op('PUSH AX');
            this.evalCondInput(b.inputs.OPERAND2, b.opcode);
            this.op('MOV BX, AX');
            this.op('POP AX');
            this.op(`${b.opcode === 'operator_and' ? 'AND' : 'OR'} AX, BX`);
            this.op('XOR DX, DX');
            return;
        }
        case 'operator_not':
            this.evalCondInput(b.inputs.OPERAND, b.opcode);
            this.op('XOR AX, 1');
            this.op('XOR DX, DX');
            return;
        default:
            // A reporter used where a boolean was expected — generateC's cCond
            // falls through to the numeric emitter, and so does this.
            this.evalReporter(b);
            this.toBool();
        }
    }

    /**
     * Branch on the condition in AX (0 or 1).
     *
     * Always inverted-test-plus-near-JMP. `i8086-asm.js` gives conditional
     * jumps 8 bits of reach and REFUSES an out-of-range one rather than
     * promoting it (`longJumps` is off in assemble-route.js, deliberately),
     * so a generated body of any size would eventually break a `JZ` that
     * spanned it. Here every Jcc jumps exactly over one 3-byte JMP.
     */
    branchIfFalse (target) {
        const on = this.label('K');
        this.op('OR AX, AX');
        this.op(`JNZ ${on}`);
        this.op(`JMP ${target}`);
        this.code.push(`${on}:`);
    }

    branchIfTrue (target) {
        const off = this.label('K');
        this.op('OR AX, AX');
        this.op(`JZ ${off}`);
        this.op(`JMP ${target}`);
        this.code.push(`${off}:`);
    }

    // ---- printing -----------------------------------------------------

    /**
     * `say` / `print`, which on this bench means characters on the CGA text
     * page through INT 21h.
     *
     * A text literal prints as itself; anything else is evaluated as a
     * number and printed as signed decimal. Both end in CR+LF, matching
     * `bw_print` in the C back end — one line per say is what makes a
     * counting program readable, and a bubble has no meaning here.
     *
     * Note this is a block the C DEVICE path REFUSES ("no C equivalent for
     * `say counter`"), and rightly: an 8051 has no screen. This one does.
     */

    /**
     * A DECLARED PIN, AS AN 8255 PORT AND BIT — and this is what lets an 8051
     * pin program RESEAT onto an 8086 unchanged.
     *
     * The parser gives `{name, port, bit, direction, activeLow}` from
     * `PIN led = P1.0 OUTPUT`. P1/P2/P3 are 8051 port names, and the 8255 has
     * exactly three ports, so P1 -> A, P2 -> B, P3 -> C is a mapping and not a
     * translation: the same declaration means the same wire on either chip.
     *
     * WHY THIS IS THE WHOLE FEATURE. A learner's blink program written for a
     * Nano or an STC does not have to be rewritten to run on an 8086 -- the
     * CPU changes and the pin declaration does not. That is what "reseating an
     * example" has to mean if it is to be worth anything.
     *
     * P0 IS REFUSED BY NAME rather than mapped. An 8051's P0 is the
     * multiplexed address/data bus and needs external pull-ups; there is no
     * fourth 8255 port and inventing one would put a pin somewhere a board
     * cannot have it.
     */
    pinAddr (name, opcode) {
        const pin = (this.pins || []).find((p) => p.name === name);
        if (!pin) {
            refuse(`"${name}" is used as a pin but no PIN line declares it`,
                'undeclared pin', opcode);
        }
        const PORT = { 1: 'A', 2: 'B', 3: 'C' }[pin.port];
        if (!PORT) {
            refuse(`PIN ${name} is on P${pin.port}, and an 8255 has three ports: `
                + 'P1, P2 and P3 map to A, B and C. P0 on an 8051 is the multiplexed '
                + 'address/data bus and has no 8255 equivalent.',
                'pin port out of range', opcode);
        }
        return { ...pin, PORT, dataPort: PPI_BASE + { A: 0, B: 1, C: 2 }[PORT] };
    }

    /**
     * WRITING AN INPUT PIN, OR READING AN OUTPUT ONE — refused here because
     * NOTHING ELSE CAN SEE IT.
     *
     * The review lane measured what happens without this check, and the
     * measurement is the argument:
     *
     *     OUTPUT + turn on:  latch=0x01  dir=0xff  pins=0x01   the LED lights
     *     INPUT  + turn on:  latch=0x01  dir=0x00  pins=0xff   nothing lights
     *
     * The write reaches the latch, the chip is not driving the port, and the
     * pins carry the input. **Every layer is behaving correctly** -- that is
     * an 8255 doing exactly what an 8255 does -- so there is nothing for the
     * machine to report and no warning it could honestly raise. The learner
     * sees a program that runs and a lamp that never lights.
     *
     * ONLY THE COMPILER KNOWS THE DECLARATION SAID INPUT. That is the whole
     * reason this belongs here and nowhere lower: by the time the write
     * reaches the chip, the intent is gone.
     *
     * Reading an OUTPUT pin is the mirror and is refused for the mirror
     * reason: an 8255 output port reads back the LATCH, so the value is
     * whatever the program last wrote. It is not a fault, it answers, and it
     * answers something the learner did not ask.
     */
    checkDirection (pin, want, opcode) {
        if (pin.direction === want) return;
        // ANALOG IS REFUSED ON THE CHIP, NOT ON THE DIRECTION. The review lane
        // caught the old message claiming an ANALOG pin was "declared OUTPUT":
        // `want` has two values and the vocabulary has more, so inferring the
        // declaration from the thing being attempted states something untrue
        // about the learner's own program. The remedy it offered happened to
        // be right; the reason it gave was not.
        //
        // And the honest reason is a fact about the chip rather than about
        // this bench: an 8255 is a digital part with no analog path, so it
        // cannot drift the day a preset gains an ADC -- a board that grows an
        // ADC0809 grows a chip this pin can resolve to, and the refusal lifts
        // exactly there.
        if (pin.direction === 'analog') {
            // Reaching here means a WRITE to an analog pin. Reading one is
            // handled before this, by emitPinRead -> emitAnalogRead.
            refuse(`"${pin.name}" is declared ANALOG and this writes to it. An analog `
                + 'declaration means "measure the voltage here", and a converter reads -- '
                + 'it has no way to drive the pin back. Declare the pin OUTPUT to drive it.',
                'write to an analog pin', opcode);
        }
        const declared = String(pin.direction || 'undeclared').toUpperCase();
        const what = want === 'output'
            ? `"${pin.name}" is declared ${declared} and this writes to it`
            : `"${pin.name}" is declared ${declared} and this reads it`;
        const why = want === 'output'
            ? 'An 8255 accepts the write and does not drive the pin, so the program runs '
                + 'and nothing lights -- there is no error for the machine to report, because '
                + 'nothing went wrong at the chip. Change the PIN line to OUTPUT, or write a '
                + 'different pin.'
            : 'An 8255 output port reads back the LATCH -- whatever this program last wrote '
                + 'to it -- not the outside world. It answers, and it answers something you '
                + 'did not ask. Change the PIN line to INPUT, or read a different pin.';
        refuse(`${what}. ${why}`, `pin direction ${want}`, opcode);
    }

    /**
     * Drive one pin. The 8255 has NO read-modify-write on an output port --
     * reading one back gives the latch, which is fine, but a program that
     * shares a port between two pins must not clobber the neighbour. So the
     * latch is SHADOWED in memory and written whole, which is what an 8051
     * program does with its own port SFR and what a real 8255 driver does too.
     */
    emitPin (name, level, opcode) {
        const p = this.pinAddr(name, opcode);
        this.checkDirection(p, 'output', opcode);
        this.uses.ppi = true;
        const shadow = `BW_PORT${p.PORT}`;
        const mask = 1 << p.bit;
        // activeLow inverts at the PIN declaration, not at every use -- a
        // learner who wrote `ACTIVE LOW` said it once and means it always.
        const on = p.activeLow ? !level : level;
        this.op(`MOV AL, [${shadow}]`);
        this.op(on ? `OR AL, ${mask}` : `AND AL, ${(~mask) & 0xff}`);
        this.op(`MOV [${shadow}], AL`);
        this.op(`MOV DX, ${p.dataPort}`);
        this.op('OUT DX, AL');
    }

    /** Toggle: the same shadow, XOR'd. */
    emitPinToggle (name, opcode) {
        const p = this.pinAddr(name, opcode);
        this.checkDirection(p, 'output', opcode);
        this.uses.ppi = true;
        this.op(`MOV AL, [BW_PORT${p.PORT}]`);
        this.op(`XOR AL, ${1 << p.bit}`);
        this.op(`MOV [BW_PORT${p.PORT}], AL`);
        this.op(`MOV DX, ${p.dataPort}`);
        this.op('OUT DX, AL');
    }


    /**
     * READ A PIN — the input half, and what the switch panel exists to drive.
     *
     * `IN AL, DX` reads the PINS, not the latch: on an 8255 an input port
     * returns what the outside world is holding the line at, which is exactly
     * what a switch changes. A learner flips a toggle and this sees it.
     *
     * THE PORT MUST BE AN INPUT AND THIS DOES NOT MAKE IT ONE. The control
     * word is written once at entry, configuring every port as an OUTPUT --
     * because a mode word clears the latches, so reconfiguring per-access
     * would blink every pin off. A program that declares an INPUT pin gets a
     * control word that says so, computed once from ALL the declarations
     * together. That is why the direction lives on the PIN line rather than
     * being inferred from use.
     *
     * Result is 0 or 1 in the 32-bit pair, because every value in this back
     * end is 32 bits and a pin read has to be comparable with a number the
     * learner wrote.
     */
    emitPinRead (name, opcode) {
        const p = this.pinAddr(name, opcode);
        if (p.direction === 'analog') { this.emitAnalogRead(p, opcode); return; }
        this.checkDirection(p, 'input', opcode);
        this.uses.ppi = true;
        this.op(`MOV DX, ${p.dataPort}`);
        this.op('IN AL, DX');
        this.op(`AND AL, ${1 << p.bit}`);
        // activeLow at the declaration again: a button wired to pull LOW reads
        // 0 when pressed, and the learner who wrote ACTIVE LOW means "pressed".
        if (p.activeLow) {
            this.op(`XOR AL, ${1 << p.bit}`);
        }
        // A LABEL, not `JZ $+5`. The relative form works only while the two
        // instructions it jumps over keep their exact encodings, and an
        // assembler that shortened one -- which this one does, deliberately --
        // would silently land the jump one byte into the next instruction.
        const one = this.label('PIN');
        this.op('CMP AL, 0');
        this.op('MOV AX, 0');
        this.op(`JZ ${one}`);
        this.op('MOV AX, 1');
        this.code.push(`${one}:`);
        this.op('MOV DX, 0');
    }

    /**
     * A KEYPAD, AS 8255 PORTS AND BITS — a matrix keypad is not a device with
     * a protocol, it is EIGHT WIRES, which is why it belongs on this bench
     * when an LCD does not.
     *
     * The parser gives `{name, type, rows:[{port,bit}], cols:[{port,bit}]}`
     * from `PART pad = KEYPAD4X4 ROWS P3.0 ... COLS P2.0 ...`. Rows and
     * columns map through the same P1/P2/P3 -> A/B/C correspondence a PIN
     * uses, so a keypad program reseats for the same reason a blink does.
     *
     * TWO THINGS ARE REFUSED BY NAME, and both are hardware facts:
     *
     * ROWS AND COLUMNS ON ONE PORT, unless that port is C. An 8255 sets
     * direction PER PORT -- ports A and B are eight bits in or eight bits
     * out, and there is no middle. Rows must drive and columns must be read,
     * so one port cannot carry both. Port C is the exception because its two
     * nibbles have independent directions, which is exactly what makes it the
     * handshake port; rows in one nibble and columns in the other works.
     *
     * On an 8051 all four ports are quasi-bidirectional and rows+columns on
     * one port is the ordinary wiring, so this is a real difference between
     * the chips rather than a limitation of this back end -- and it is the
     * kind of thing that must be said out loud rather than silently
     * half-working.
     *
     * THE GENERIC PIN FORM. `ROWS P0 P1 ...` with micro:bit or Pico pin names
     * carries no port/bit, and there is no 8255 pin those names could mean.
     */
    keypadPart (name, opcode) {
        const part = (this.parts || []).find((p) => p.name === name);
        if (!part) {
            refuse(`"${name}" is used as a keypad but no PART line declares it`,
                'undeclared part', opcode);
        }
        const at = (w, what) => {
            if (!w || w.port === undefined || w.bit === undefined) {
                refuse(`PART ${name} names its ${what} with board pin names rather than `
                    + '8051 port pins. This bench maps P1/P2/P3 onto the 8255 ports A/B/C, '
                    + 'so a keypad has to be declared as P<port>.<bit> -- for example '
                    + 'ROWS P3.0 P3.1 P3.2 P3.3 COLS P2.0 P2.1 P2.2 P2.3.',
                    'keypad pins not 8051 form', opcode);
            }
            const PORT = { 1: 'A', 2: 'B', 3: 'C' }[w.port];
            if (!PORT) {
                refuse(`PART ${name} puts a ${what} on P${w.port}, and an 8255 has three `
                    + 'ports: P1, P2 and P3 map to A, B and C. P0 on an 8051 is the '
                    + 'multiplexed address/data bus and has no 8255 equivalent.',
                    'keypad port out of range', opcode);
            }
            return { PORT, bit: w.bit, dataPort: PPI_BASE + { A: 0, B: 1, C: 2 }[PORT] };
        };
        const rows = (part.rows || []).map((w) => at(w, 'rows'));
        const cols = (part.cols || []).map((w) => at(w, 'columns'));
        if (rows.length !== 4 || cols.length !== 4) {
            refuse(`PART ${name} declares ${rows.length} rows and ${cols.length} columns; `
                + 'a KEYPAD4X4 has four of each.', 'keypad not 4x4', opcode);
        }
        const onePort = (set, what) => {
            const ports = [...new Set(set.map((w) => w.PORT))];
            if (ports.length !== 1) {
                refuse(`PART ${name} spreads its ${what} across 8255 ports `
                    + `${ports.join(' and ')}. The scan drives all four ${what} from one `
                    + 'port write, so they must share a port.', 'keypad split across ports', opcode);
            }
            return ports[0];
        };
        const rowPort = onePort(rows, 'rows');
        const colPort = onePort(cols, 'columns');
        const nibble = (set) => [...new Set(set.map((w) => (w.bit >= 4 ? 'high' : 'low')))];
        if (rowPort === colPort) {
            const rn = nibble(rows), cn = nibble(cols);
            if (rowPort !== 'C' || rn.length !== 1 || cn.length !== 1 || rn[0] === cn[0]) {
                refuse(`PART ${name} puts its rows and columns both on port ${rowPort}. `
                    + 'An 8255 sets direction a whole port at a time, and the scan has to '
                    + 'DRIVE the rows while READING the columns -- one port cannot do both. '
                    + 'Put them on different ports, or on the two halves of P3 (port C), '
                    + 'whose nibbles have independent directions. On an 8051 every port is '
                    + 'quasi-bidirectional and one port carries both, so this is a real '
                    + 'difference between the two chips.',
                    'keypad rows and columns share a port', opcode);
            }
        }
        return { name: part.name, rows, cols, rowPort, colPort };
    }

    /**
     * SCAN THE KEYPAD — result 0..15, or -1 for nothing pressed.
     *
     * That contract is not invented here: it is the STC extension's, written
     * down as "the scanned key 0..15, or -1 for none — same contract as the C
     * scanner", and matching it is the whole point. A program that reads a
     * keypad means the same thing on either chip or it has not reseated.
     *
     * A MATRIX KEYPAD IS ACTIVE LOW BY CONSTRUCTION and there is no ACTIVE
     * LOW to declare. Each row is driven low in turn while the other three
     * are held high; a pressed key shorts its row to its column, so that
     * column reads LOW, and only while its own row is the one being driven.
     * Nothing about that is a convention someone chose -- it is what the
     * wires do -- which is why it is not spelled on the PART line.
     */
    emitKeypadRead (name, opcode) {
        const kp = this.keypadPart(name, opcode);
        this.uses.ppi = true;
        this.uses.keypad = true;
        if (!this.keypads.has(kp.name)) {
            this.keypads.set(kp.name, { label: `BW_KEYPAD_${this.keypads.size}`, kp });
        }
        this.op(`CALL ${this.keypads.get(kp.name).label}`);
    }

    /**
     * READ A VOLTAGE — `PIN pot = P1.3 ANALOG`, through an ADC0809 at 300h.
     *
     * THE CHANNEL IS THE BIT, NOT THE PORT. On an STC12 the ADC channel n IS
     * physically P1.n, and the 0809's eight-channel mux keeps that a MAPPING
     * rather than a translation -- which is the same relationship P1/P2/P3 ->
     * A/B/C already is, and the reason this chip and not the single-channel
     * ADC0804. P1 is what makes the pin analog; the bit picks the channel.
     *
     * THE POLL IS NOT CEREMONY. A conversion takes 64 ADC clocks -- about 500
     * CPU cycles here -- and START does NOT clear the output latch, so a
     * program that reads without polling gets the PREVIOUS conversion. It
     * would appear to work from the second call onward and be wrong on the
     * first, which is the silent-wrong class this tier exists to refuse. So
     * the emitted sequence always polls EOC.
     *
     * EIGHT BITS, SCALED TO TEN. The 0809 answers 0..255 where an STC12's
     * ADC answers 0..1023, and a program that compares against 512 has to
     * mean the same thing on both. `SHL 2` scales it, and the warning says so
     * rather than letting the two devices disagree quietly -- the low two
     * bits are resolution this converter never had, not precision invented.
     */
    emitAnalogRead (p, opcode) {
        if (p.port !== 1) {
            refuse(`PIN ${p.name} is declared ANALOG on P${p.port}. The converter's eight `
                + 'channels correspond to P1.0-P1.7, the way an STC12\'s ADC channels are '
                + 'physically P1.0-P1.7, so an analog pin has to be on P1.',
                'analog pin not on P1', opcode);
        }
        this.uses.adc = true;
        this.warn(`"${p.name}" is analog, so the build adds an ADC0809 at ${ADC_BASE.toString(16).toUpperCase()}h `
            + `and reads channel ${p.bit} for P1.${p.bit}. It converts to EIGHT bits (0-255) `
            + 'where an STC12 gives ten (0-1023), so the reading is scaled up by four -- the '
            + 'low two bits are resolution this converter does not have.');
        this.op(`MOV DX, ${ADC_BASE + p.bit}      ; the ADDRESS selects the mux channel`);
        this.op('OUT DX, AL         ; any write is ALE + START');
        const poll = this.label('ADC');
        this.code.push(`${poll}:`);
        this.op(`MOV DX, ${ADC_EOC}`);
        this.op('IN AL, DX');
        this.op('TEST AL, 1         ; bit 0 is EOC');
        this.op(`JZ ${poll}          ; no PIC on this bench, so polling is the only way`);
        this.op(`MOV DX, ${ADC_BASE}`);
        this.op('IN AL, DX          ; OE -- the converted byte');
        this.op('XOR AH, AH');
        this.op('SHL AX, 1');
        this.op('SHL AX, 1          ; 0-255 -> 0-1023, to agree with an STC12');
        this.op('XOR DX, DX');
    }

    /**
     * A DECLARED PORT — `PORT leds = P2 OUTPUT`, eight bits at once.
     *
     * This is EASIER on an 8255 than a single pin, not harder: a port write
     * is one OUT with no shadow arithmetic, because there is no neighbour to
     * preserve. It was refused here until now, and the refusal said "this
     * bench has none" -- which was true when written and false since the
     * 8255 landed. A stale refusal is worse than an honest one: it tells a
     * learner their program cannot work on hardware that is sitting there.
     */
    portAddr (name, opcode) {
        const port = (this.ports || []).find((p) => p.name === name);
        if (!port) {
            refuse(`"${name}" is used as a port but no PORT line declares it`,
                'undeclared port', opcode);
        }
        const PORT = { 1: 'A', 2: 'B', 3: 'C' }[port.port];
        if (!PORT) {
            refuse(`PORT ${name} is P${port.port}, and an 8255 has three ports: P1, P2 and `
                + 'P3 map to A, B and C. P0 on an 8051 is the multiplexed address/data bus '
                + 'and has no 8255 equivalent.', 'port out of range', opcode);
        }
        return { ...port, PORT, dataPort: PPI_BASE + { A: 0, B: 1, C: 2 }[PORT] };
    }

    /** Write eight bits at once. The shadow is updated so pins on the same
     *  port stay consistent with what the chip is actually driving. */
    emitPortWrite (name, input, opcode) {
        const p = this.portAddr(name, opcode);
        if (p.direction !== 'output') {
            refuse(`PORT ${name} is declared ${String(p.direction).toUpperCase()} and this `
                + 'writes to it. An 8255 accepts the write and does not drive the pins, so '
                + 'the program runs and nothing happens.', 'write to an input port', opcode);
        }
        this.uses.ppi = true;
        this.evalNum(input, `set ${name}`);     // value in the 32-bit pair
        if (p.activeLow) this.op('NOT AL');
        this.op(`MOV [BW_PORT${p.PORT}], AL`);
        this.op(`MOV DX, ${p.dataPort}`);
        this.op('OUT DX, AL');
    }

    /** Read eight bits at once, as an unsigned 0-255. */
    emitPortRead (name, opcode) {
        const p = this.portAddr(name, opcode);
        if (p.direction !== 'input') {
            refuse(`PORT ${name} is declared ${String(p.direction).toUpperCase()} and this `
                + 'reads it. An 8255 output port reads back the LATCH -- whatever this '
                + 'program last wrote -- not the outside world.', 'read of an output port', opcode);
        }
        this.uses.ppi = true;
        this.op(`MOV DX, ${p.dataPort}`);
        this.op('IN AL, DX');
        if (p.activeLow) this.op('NOT AL');
        this.op('XOR AH, AH');
        this.op('XOR DX, DX');
    }

    /**
     * `set <pin> to <expr>` — A LEVEL, NOT A VOLTAGE.
     *
     * This was nearly lowered to a DAC, and it would have been wrong. The
     * parser calls it a computed LEVEL and every other back end emits
     * `if (VALUE) high else low` -- so `set led to 128` means "drive it
     * high", not "put 128/255 of Vref on it". A converter here would run,
     * look plausible, and mean something else.
     *
     * ACTIVE LOW DOES NOT INVERT IT, deliberately and consistently with
     * `set high` / `set low`: a level is a level. Only `turn on` / `turn off`
     * are states, and only states respect the wiring.
     */
    emitPinWrite (name, input, opcode) {
        const p = this.pinAddr(name, opcode);
        this.checkDirection(p, 'output', opcode);
        this.uses.ppi = true;
        const mask = 1 << p.bit;
        this.evalNum(input, `set ${name}`);      // the value, 32 bits in AX:DX
        const low = this.label('LVL'), done = this.label('LVL');
        this.op('OR AX, DX             ; nonzero in either half is HIGH');
        // MOV does not touch the flags, so the shadow load is safe between
        // the test and the branch.
        this.op(`MOV AL, [BW_PORT${p.PORT}]`);
        this.op(`JZ ${low}`);
        this.op(`OR AL, ${mask}`);
        this.op(`JMP ${done}`);
        this.code.push(`${low}:`);
        this.op(`AND AL, ${(~mask) & 0xff}`);
        this.code.push(`${done}:`);
        this.op(`MOV [BW_PORT${p.PORT}], AL`);
        this.op(`MOV DX, ${p.dataPort}`);
        this.op('OUT DX, AL');
    }

    /**
     * `set <pin> to <n> hz` — A TONE, FROM THE HARDWARE THAT ACTUALLY MAKES IT.
     *
     * On an 8051 a tone comes out of whichever pin you name. On this bench it
     * cannot: the speaker is fixed hardware, gated by 8255 port B bits 0 and 1
     * and driven by 8254 counter 2. Bit 0 opens the counter's gate, bit 1
     * connects its output to the cone, and BOTH are needed.
     *
     * So a TONE pin anywhere else is REFUSED rather than silently ignored --
     * a program whose sound comes from a pin it did not name is the "runs but
     * means something different" failure. P2 maps to port B, so `P2.0` and
     * `P2.1` genuinely ARE the speaker and the declaration that works is one
     * the learner can write.
     *
     * IT GOES THROUGH BW_PORTB, and that is not tidiness. The review lane
     * measured the alternative: a raw `OUT 61h` and a pin write on the same
     * port diverge, and afterwards the shadow says a lamp is lit while the
     * port holds it dark. Nothing stops and nothing errors -- there is no
     * diagnostic a learner could act on.
     */
    emitTone (name, input, opcode) {
        const p = this.pinAddr(name, opcode);
        if (p.direction !== 'tone') {
            refuse(`"${name}" is declared ${String(p.direction).toUpperCase()} and this asks `
                + 'it for a frequency. Declare it TONE.', 'tone on a non-tone pin', opcode);
        }
        if (p.PORT !== 'B' || p.bit > 1) {
            refuse(`"${name}" is a TONE pin on P${p.port}.${p.bit}, and on this machine the `
                + 'speaker is not on a pin you can choose. It is fixed hardware: 8254 '
                + 'counter 2 makes the square wave and 8255 port B bits 0 and 1 gate it. '
                + 'P2 maps to port B, so declare the speaker as P2.0 or P2.1 -- those bits '
                + 'ARE the speaker. On an 8051 a tone comes out of whatever pin you name, '
                + 'which is a real difference between the two machines rather than a '
                + 'limitation here.', 'tone on a pin that is not the speaker', opcode);
        }
        this.uses.ppi = true;
        this.uses.div = true; this.uses.sdiv = true;
        // THE REQUESTED TONE IS NOT THE TONE PRODUCED. A PIT can only make
        // 1193182/n for whole n, so the frequency is reported back from the
        // divisor rather than echoed from what was typed -- echoing it would
        // invent a precision the chip does not have.
        const lit = literalNumber(input);
        if (lit != null) {
            if (lit <= 0) {
                this.warn(`"${name}" is set to ${lit} Hz, which turns the speaker OFF.`);
            } else {
                const div = Math.max(1, Math.min(65535, Math.round(PIT_HZ / lit)));
                const got = Math.round(PIT_HZ / div);
                this.warn(`"${name}" asks for ${lit} Hz and the speaker plays ${got} Hz. `
                    + `An 8254 divides a ${PIT_HZ} Hz clock by a whole number, so only `
                    + `${PIT_HZ}/n is reachable -- here n = ${div}.`);
            }
        } else {
            this.warn(`"${name}" is set from a computed frequency. An 8254 divides a `
                + `${PIT_HZ} Hz clock by a whole number, so the tone played is the nearest `
                + `${PIT_HZ}/n rather than exactly the value asked for.`);
        }

        const off = this.label('TONE'), done = this.label('TONE');
        this.evalNum(input, `set ${name}`);          // Hz, 32 bits in AX:DX
        this.op('OR AX, DX             ; 0 Hz means silence, not a divide by zero');
        this.op(`JZ ${off}`);
        this.evalNum(input, `set ${name}`);
        this.op('MOV CX, DX');
        this.op('MOV BX, AX            ; divisor := the requested Hz');
        this.op(`MOV AX, ${PIT_HZ & 0xffff}`);
        this.op(`MOV DX, ${PIT_HZ >>> 16}            ; dividend := ${PIT_HZ}`);
        this.op('CALL BW_DIV32         ; AX = the PIT count');
        this.op('PUSH AX');
        this.op('MOV AL, 0B6h          ; counter 2, mode 3 square wave, lo/hi');
        this.op(`MOV DX, ${PIT_BASE + 3}`);
        this.op('OUT DX, AL');
        this.op('POP AX');
        this.op(`MOV DX, ${PIT_BASE + 2}`);
        this.op('OUT DX, AL            ; count, low byte');
        this.op('MOV AL, AH');
        this.op('OUT DX, AL            ; count, high byte');
        this.op(`MOV AL, [BW_PORT${p.PORT}]   ; the SAME shadow the pin writes use`);
        this.op('OR AL, 3              ; bit 0 gates the counter, bit 1 the cone');
        this.op(`MOV [BW_PORT${p.PORT}], AL`);
        this.op(`MOV DX, ${p.dataPort}`);
        this.op('OUT DX, AL');
        this.op(`JMP ${done}`);
        this.code.push(`${off}:`);
        this.op(`MOV AL, [BW_PORT${p.PORT}]`);
        this.op('AND AL, 0FCh          ; both gate bits down: silence');
        this.op(`MOV [BW_PORT${p.PORT}], AL`);
        this.op(`MOV DX, ${p.dataPort}`);
        this.op('OUT DX, AL');
        this.code.push(`${done}:`);
    }

    /**
     * `wait` INSIDE A SCHEDULED PROGRAM — a yield, not a blocking call.
     *
     * The single-script path waits with INT 15h/86h, which BLOCKS: nothing
     * else can run, which is fine when there is nothing else. With two
     * scripts it would stop the other one dead, so the wait becomes "wake me
     * at time T" followed by a switch to whoever is due.
     *
     * TIME IS MEASURED IN PIT TICKS, NOT MICROSECONDS, because the clock has
     * to be POLLED rather than waited on. 8254 counter 0 free-runs at
     * 1193182 Hz; the scheduler samples it and accumulates the difference, so
     * elapsed time is exact and no interrupt is needed. That matters: this
     * bench has no PIC, so an interrupt-driven tick could not exist here --
     * which is what "the clock blocks" used to mean and why two scripts were
     * refused.
     */
    emitSleep (input, opcode) {
        this.uses.sched = true;
        this.uses.mul = true;
        const inner = Array.isArray(input) ? input[1] : null;
        if (Array.isArray(inner) && inner[0] !== 12 && inner[0] !== 13) {
            const secs = Number(inner[1]);
            if (!Number.isFinite(secs) || secs < 0) {
                refuse(`"wait ${inner[1]} secs" is not a length of time`,
                    'bad wait duration', opcode);
            }
            const ms = Math.round(secs * 1000);
            if (ms > 0x7fffff) {
                refuse(`"wait ${secs} secs" is longer than a scheduled program can time. `
                    + 'The scheduler compares wake times as SIGNED 32-bit counts of timer '
                    + 'ticks so they stay correct when the counter wraps, and the tick is '
                    + 'faster than a millisecond.', 'wait too long', opcode);
            }
            this.op(`MOV AX, ${hex16(ms & 0xffff)}`);
            this.op(`MOV DX, ${hex16(Math.floor(ms / 65536))}`);
            this.op('MOV BX, [BW_TPMS]   ; ticks per ms, MEASURED at startup');
            this.op('XOR CX, CX');
            this.op('CALL BW_MUL32');
        } else {
            this.warn('a "wait" whose length is computed is rounded to whole seconds '
                + 'before it is converted to timer ticks. A typed-in length such as '
                + '"wait 0.5 secs" is exact.');
            this.evalNum(input, opcode);
            this.op('MOV BX, 1000');
            this.op('XOR CX, CX');
            this.op('CALL BW_MUL32       ; seconds -> milliseconds');
            this.op('MOV BX, [BW_TPMS]');
            this.op('XOR CX, CX');
            this.op('CALL BW_MUL32       ; -> ticks, at the MEASURED rate');
        }
        this.op('CALL BW_SLEEP');
    }

    /**
     * `WHEN <key> pressed:` — A KEYSTROKE IS ALREADY AN EVENT.
     *
     * I refused this once on the grounds that it "needs the keyboard's own
     * edge", and that was wrong. A pin has a level, so a hat on it must
     * manufacture an edge. DOS hands over a QUEUE OF KEYSTROKES: each arrival
     * is an event, which is strictly more than an edge and needs no
     * transition detection at all.
     *
     * READING A KEY CONSUMES IT, and that is the real design problem. Two
     * hats each polling INT 21h would race: whichever ran first would take
     * the keystroke and the other would never see it — and a program with
     * `WHEN a` and `WHEN b` would drop half its input for no visible reason.
     *
     * So ONE pump task reads the keyboard and publishes; the hats watch what
     * it published. The pump is a task the program did not write, which is
     * why the build says it added one.
     */
    keyChar (name, opcode) {
        const key = String(name || '').toLowerCase();
        if (key === 'any') return null;                  // matches anything
        const NAMED = {space: 0x20, enter: 0x0d};
        if (Object.prototype.hasOwnProperty.call(NAMED, key)) return NAMED[key];
        if (key.length === 1) {
            const c = key.charCodeAt(0);
            if (c >= 0x20 && c < 0x7f) return c;
        }
        refuse(`"WHEN ${name} key pressed" names a key this bench cannot report. DOS `
            + 'hands over printable characters, space and enter; the arrows, function '
            + 'keys and the like arrive as a NUL followed by a scan code, which is a '
            + 'second read this back end does not do. Use a printable key, space or '
            + 'enter — or `any`.', 'key not reportable', opcode);
        return 0;
    }

    /** The pump: read the keyboard once and publish what it said. */
    keyPumpRoutine () {
        return ['',
            '; ---- the keyboard pump ---------------------------------------',
            '; ONE reader, because reading CONSUMES. Two hats polling INT 21h',
            '; would race for each keystroke and a program with two key hats',
            '; would drop half its input with nothing to show why.',
            '; AH=0Bh asks whether a key is waiting and does NOT block; AH=07h',
            '; then takes it without echoing, so the program decides what the',
            '; screen shows rather than DOS deciding for it.',
            'BW_KEYPUMP:',
            '    MOV AH, 0BH',
            '    INT 21H',
            '    OR AL, AL',
            '    JZ BW_KP1',
            '    MOV AH, 7',
            '    INT 21H',
            '    MOV [BW_KEY], AL',
            '    MOV BYTE PTR [BW_KFRESH], 1',
            'BW_KP1:',
            '    CALL BW_POLL1MS',
            '    JMP BW_KEYPUMP'];
    }

    /** One key hat: watch what the pump published. */
    emitKeyHat (block, name) {
        const want = this.keyChar(name, block.opcode);
        const top = this.label('KEY'), wait = this.label('KEY');
        this.code.push(`${top}:`);
        this.op('CMP BYTE PTR [BW_KFRESH], 0');
        this.op(`JE ${wait}`);
        if (want !== null) {
            this.op('MOV AL, [BW_KEY]');
            this.op(`CMP AL, ${want}`);
            this.op(`JNE ${wait}          ; another hat's key, or nobody's`);
        }
        this.op('MOV BYTE PTR [BW_KFRESH], 0');
        this.stack(block.next);
        this.op(`JMP ${top}`);
        this.code.push(`${wait}:`);
        this.op('CALL BW_POLL1MS');
        this.op(`JMP ${top}`);
    }

    /**
     * `set <pin> to <n> percent` — GENUINE PWM, from a task that yields.
     *
     * I refused this and said a DAC substitution would be dishonest, which
     * was right: a steady voltage gives the same brightness by a different
     * mechanism, so a scope, a motor or an RC filter would disagree with the
     * lamp. What was NOT right was assuming the honest version needed an
     * interrupt handler. A scheduled task pulses the pin for real.
     *
     * THE RESOLUTION IS DERIVED FROM THE MEASURED TICK, not chosen. The
     * review lane measured this bench: at 100 levels four adjacent duties
     * collapse to one value, at 20 they are cleanly distinguishable and
     * monotonic. The reason is not noise -- the period is steady to six
     * MICROSECONDS over 655 periods -- it is that every period is a whole
     * number of scheduler ticks, so the tick IS the resolution. Since the
     * tick is measured at startup, the number of usable levels is computed
     * rather than hardcoded, and it follows the clock if the clock changes.
     *
     * A known, stated systematic remains: fixed per-phase overhead lands on
     * both waits, so the duty is compressed toward 50% with a gain near
     * 0.91 (5% reads 9%, 95% reads 91%). It is monotonic, so a fade is still
     * a fade; it loses a little travel at the ends.
     */
    pwmSlot (name, opcode) {
        const p = this.pinAddr(name, opcode);
        if (p.direction !== 'pwm') {
            refuse(`"${name}" is declared ${String(p.direction).toUpperCase()} and this `
                + 'sets a percentage. Declare it PWM.', 'percent on a non-pwm pin', opcode);
        }
        if (!this.pwm.has(name)) {
            this.pwm.set(name, { sym: `BW_DUTY${this.pwm.size}`, pin: p, index: this.pwm.size });
        }
        return this.pwm.get(name);
    }

    emitSetPwm (name, input, opcode) {
        const slot = this.pwmSlot(name, opcode);
        this.uses.ppi = true;
        this.evalNum(input, `set ${name}`);
        // Clamp rather than wrap: 130% is a mistake, and a duty that wrapped
        // to 30% would look like a working program doing the wrong thing.
        const hi = this.label('PWM'), done = this.label('PWM');
        this.op('OR DX, DX');
        this.op(`JS ${hi}            ; negative -> 0`);
        this.op('CMP DX, 0');
        this.op(`JNE ${hi}`);
        this.op('CMP AX, 100');
        this.op(`JBE ${done}`);
        this.code.push(`${hi}:`);
        this.op('MOV AX, 100');
        this.op('OR DX, DX');
        this.op(`JNS ${done}`);
        this.op('XOR AX, AX');
        this.code.push(`${done}:`);
        this.op(`MOV [${slot.sym}], AL`);
    }

    /** One task per PWM pin: pulse it forever at the duty the program set. */
    pwmRoutine (slot) {
        const p = slot.pin;
        const mask = 1 << p.bit, shadow = `BW_PORT${p.PORT}`;
        const L = (t) => `BW_PW${slot.index}_${t}`;
        const drive = (on) => [
            `    MOV AL, [${shadow}]`,
            `    ${on ? 'OR' : 'AND'} AL, ${on ? mask : ((~mask) & 0xff)}`,
            `    MOV [${shadow}], AL`,
            `    MOV DX, ${p.dataPort}`,
            '    OUT DX, AL'];
        // ticks = TPMS * percent / 10, which is percent% of a ~10 ms period.
        const ticks = (expr) => [
            ...expr,
            '    XOR AH, AH',
            '    MOV BX, [BW_TPMS]',
            '    MUL BX',
            '    MOV BX, 10',
            '    DIV BX',
            '    XOR DX, DX',
            '    CALL BW_SLEEP'];
        return ['',
            `; ---- PWM on ${p.name} (P${p.port}.${p.bit}) ---------------------`,
            '; A ~10 ms period, so about 100 Hz -- above flicker fusion. The ON',
            '; and OFF phases are whole numbers of scheduler ticks, and that',
            '; quantisation is the resolution: about 21 ticks fit a period here,',
            '; so roughly 20 levels are distinguishable. Measured, not assumed.',
            `${L('TOP')}:`,
            `    MOV AL, [${slot.sym}]`,
            '    OR AL, AL',
            `    JZ ${L('OFF')}          ; 0% never turns on`,
            '    CMP AL, 100',
            `    JAE ${L('ON')}          ; 100% never turns off`,
            ...drive(true),
            ...ticks([`    MOV AL, [${slot.sym}]`]),
            ...drive(false),
            ...ticks([`    MOV AL, 100`, `    SUB AL, [${slot.sym}]`]),
            `    JMP ${L('TOP')}`,
            `${L('OFF')}:`,
            ...drive(false),
            '    CALL BW_POLL1MS',
            `    JMP ${L('TOP')}`,
            `${L('ON')}:`,
            ...drive(true),
            '    CALL BW_POLL1MS',
            `    JMP ${L('TOP')}`];
    }

    /**
     * `PART d = SEVENSEG8 SEGMENTS P1 SELECT P2.0 P2.1 P2.2` — EIGHT DIGITS
     * ON ONE PORT, which only works because they are never all lit at once.
     *
     * A multiplexed display shows ONE digit at a time and relies on the eye
     * to blend them. That is why it was refused here: the 8051 runs the scan
     * in its Timer-0 ISR and this back end had nowhere to put one. The
     * preemptive scheduler is that somewhere — the scan is a task, and at
     * roughly 1 kHz each of eight digits is refreshed 125 times a second,
     * which is well above flicker.
     *
     * SEGMENTS is a whole port (through a '245 on a real board); SELECT is
     * three pins into a 74HC138, whose eight outputs are the digit commons.
     * Three pins for eight digits is the entire reason the decoder is there.
     */
    segPart (name, opcode) {
        const part = (this.parts || []).find((p) => p.name === name);
        if (!part || part.type !== 'sevenseg8') {
            refuse(`"${name}" is used as a display but no PART line declares one`,
                'undeclared display', opcode);
        }
        if (!this.segs.has(name)) {
            const PORT = { 1: 'A', 2: 'B', 3: 'C' }[part.segPort];
            if (!PORT) {
                refuse(`PART ${name} puts its segments on P${part.segPort}, and an 8255 `
                    + 'has three ports: P1, P2 and P3 map to A, B and C.',
                    'display port out of range', opcode);
            }
            const sel = part.selPins.map((w) => {
                const SP = { 1: 'A', 2: 'B', 3: 'C' }[w.port];
                if (!SP) {
                    refuse(`PART ${name} puts a select pin on P${w.port}, and an 8255 has `
                        + 'three ports.', 'display select out of range', opcode);
                }
                return { PORT: SP, bit: w.bit, dataPort: PPI_BASE + { A: 0, B: 1, C: 2 }[SP] };
            });
            this.segs.set(name, {
                index: this.segs.size,
                buf: `BW_SEGB${this.segs.size}`,
                cur: `BW_SEGC${this.segs.size}`,
                PORT, dataPort: PPI_BASE + { A: 0, B: 1, C: 2 }[PORT],
                sel, anode: !!part.commonAnode, name,
            });
        }
        return this.segs.get(name);
    }

    /** `show number <n> on <d>` — fill the frame buffer with decimal digits. */
    emitSegShow (name, input, opcode) {
        const d = this.segPart(name, opcode);
        this.uses.ppi = true;
        this.uses.seg = true;
        this.evalNum(input, `show number on ${name}`);
        this.op(`MOV DI, OFFSET ${d.buf}`);
        this.op('CALL BW_SEGNUM');
    }

    /** `clear <d>` — blank every digit. */
    emitSegClear (name, opcode) {
        const d = this.segPart(name, opcode);
        this.uses.ppi = true;
        this.uses.seg = true;
        this.op(`MOV DI, OFFSET ${d.buf}`);
        this.op('CALL BW_SEGCLR');
    }

    /** The shared helpers: one font, one number->digits, one blank. */
    segRuntime () {
        return ['',
            '; ---- seven-segment helpers -----------------------------------',
            '; Fill the 8-byte buffer at DI with the decimal digits of DX:AX,',
            '; right-aligned, leading zeros blanked.',
            '; THE FILL IS A CRITICAL SECTION. The scan task reads this buffer',
            '; on its own schedule, and the digits are written before the',
            '; leading zeros are blanked -- so a preemption in between shows a',
            '; digit that is about to be blanked. Measured: 1207 displayed as',
            '; " 0  1207", a stray zero four places left of the number, which',
            '; reads as a display fault rather than a race.',
            'BW_SEGNUM:',
            '    PUSHF',
            '    CLI',
            '    PUSH SI',
            '    PUSH DI',
            '    PUSH BX',
            '    PUSH CX',
            '    ADD DI, 7',
            '    MOV CX, 8',
            'BW_SN1:',
            '    PUSH CX',
            '    ; DX:AX / 10 -> DX:AX, remainder in BX. The classic two-step:',
            '    ; a single DIV would overflow whenever the quotient exceeds',
            '    ; 16 bits, which is most of the range we care about.',
            '    MOV BX, 10',
            '    MOV CX, AX',
            '    MOV AX, DX',
            '    XOR DX, DX',
            '    DIV BX',
            '    MOV SI, AX',
            '    MOV AX, CX',
            '    DIV BX',
            '    MOV BX, DX',
            '    MOV DX, SI',
            '    PUSH AX',
            '    MOV AL, [BW_SEGFONT + BX]',
            '    MOV [DI], AL',
            '    POP AX',
            '    DEC DI',
            '    POP CX',
            '    LOOP BW_SN1',
            '    ; Blank leading zeros, but never the last digit -- a display',
            '    ; showing nothing at all for the value 0 looks broken.',
            '    INC DI',
            '    MOV CX, 7',
            'BW_SN2:',
            '    CMP BYTE PTR [DI], 3FH',
            '    JNE BW_SN3',
            '    MOV BYTE PTR [DI], 0',
            '    INC DI',
            '    LOOP BW_SN2',
            'BW_SN3:',
            '    POP CX',
            '    POP BX',
            '    POP DI',
            '    POP SI',
            '    POPF',
            '    RET',
            '',
            'BW_SEGCLR:',
            '    PUSHF',
            '    CLI',
            '    PUSH CX',
            '    MOV CX, 8',
            'BW_SC1:',
            '    MOV BYTE PTR [DI], 0',
            '    INC DI',
            '    LOOP BW_SC1',
            '    POP CX',
            '    POPF',
            '    RET',
            '',
            '; 0-9 and A-F, common cathode: bit 0 = a (top), 1 = b, 2 = c,',
            '; 3 = d (bottom), 4 = e, 5 = f, 6 = g (middle), 7 = decimal point.',
            'BW_SEGFONT DB 3FH, 06H, 5BH, 4FH, 66H, 6DH, 7DH, 07H',
            '           DB 7FH, 6FH, 77H, 7CH, 39H, 5EH, 79H, 71H'];
    }

    /** One scan task per display. */
    segRoutine (d) {
        const L = (t) => `BW_SG${d.index}_${t}`;
        const out = ['',
            `; ---- ${d.name}: scan eight digits ---------------------------`,
            '; ONE DIGIT AT A TIME, and the eye does the rest. Eight digits at',
            '; about 1 kHz is 125 Hz each, well above flicker. Blank the',
            '; segments BEFORE moving the select lines: changing which digit is',
            '; enabled while the old pattern is still driven lights the wrong',
            '; segments on the new digit, which shows as faint ghosting.',
            `${L('TOP')}:`,
            `    MOV AL, 0${d.anode ? 'FFH' : '0H'}`,
            `    MOV [BW_PORT${d.PORT}], AL`,
            `    MOV DX, ${d.dataPort}`,
            '    OUT DX, AL'];
        d.sel.forEach((s, i) => {
            const mask = 1 << s.bit;
            out.push(
                `    MOV AL, [BW_PORT${s.PORT}]`,
                `    TEST BYTE PTR [${d.cur}], ${1 << i}`,
                `    JZ ${L(`C${i}`)}`,
                `    OR AL, ${mask}`,
                `    JMP ${L(`D${i}`)}`,
                `${L(`C${i}`)}:`,
                `    AND AL, ${(~mask) & 0xff}`,
                `${L(`D${i}`)}:`,
                `    MOV [BW_PORT${s.PORT}], AL`,
                `    MOV DX, ${s.dataPort}`,
                '    OUT DX, AL');
        });
        out.push(
            `    MOV BL, [${d.cur}]`,
            '    XOR BH, BH',
            `    MOV AL, [${d.buf} + BX]`,
            ...(d.anode ? ['    NOT AL'] : []),
            `    MOV [BW_PORT${d.PORT}], AL`,
            `    MOV DX, ${d.dataPort}`,
            '    OUT DX, AL',
            `    INC BYTE PTR [${d.cur}]`,
            `    AND BYTE PTR [${d.cur}], 7`,
            '    CALL BW_POLL1MS',
            `    JMP ${L('TOP')}`);
        return out;
    }

    /** The flag byte for a broadcast name, created on first mention. */
    messageSym (name) {
        const key = String(name);
        if (!this.messages.has(key)) {
            // BW_BCAST, not BW_MSG: `label('MSG')` already generates BW_MSG0
            // for the receiver loop, and the two collided -- the assembler
            // caught it as "defined twice", which is exactly the error a
            // generated-name scheme should produce rather than a silent
            // aliasing of a jump target onto a data byte.
            this.messages.set(key, `BW_BCAST${this.messages.size}`);
        }
        return this.messages.get(key);
    }

    /**
     * `broadcast "x"` — SET A FLAG, and that is the whole mechanism.
     *
     * Scratch's broadcast starts the receiving script. Here the receiver is
     * already a task, sitting in a loop watching one byte, so a broadcast is
     * a single store and the scheduler does the rest. No queue: a second
     * broadcast of the same message before the first was noticed is the same
     * event, which is also what Scratch does -- a script already running is
     * restarted rather than run twice over.
     */
    emitBroadcast (block) {
        const input = block.inputs && block.inputs.BROADCAST_INPUT;
        const inner = Array.isArray(input) ? input[1] : null;
        const name = Array.isArray(inner) ? inner[1] : null;
        if (!name) {
            refuse('this `broadcast` names no message', 'broadcast without a name',
                block.opcode);
        }
        if (!this.messages.has(String(name))) {
            refuse(`nothing receives the broadcast "${name}". A message with no `
                + '`WHEN I receive` script is a store to a byte nobody reads -- which '
                + 'runs, does nothing, and looks like the receiver was never reached.',
                'broadcast with no receiver', block.opcode);
        }
        this.op(`MOV BYTE PTR [${this.messageSym(name)}], 1`);
    }

    /**
     * `WHEN I receive "x":` — a task watching one byte.
     *
     * It CLEARS the flag before running the body, not after, so a broadcast
     * sent by the body itself is not swallowed by its own handler.
     */
    emitMessageHat (block, name) {
        const sym = this.messageSym(name);
        const top = this.label('MSG'), fire = this.label('MSG');
        this.code.push(`${top}:`);
        this.op(`CMP BYTE PTR [${sym}], 0`);
        this.op(`JNE ${fire}`);
        this.op('CALL BW_POLL1MS');
        this.op(`JMP ${top}`);
        this.code.push(`${fire}:`);
        this.op(`MOV BYTE PTR [${sym}], 0   ; cleared BEFORE the body runs`);
        this.stack(block.next);
        this.op(`JMP ${top}`);
    }

    /**
     * `WHEN <pin> pressed:` — AN EDGE, WHICH IS WHY IT NEEDS ITS OWN TASK.
     *
     * The hat fires on the TRANSITION into the named state, not while the pin
     * sits there. A hat that fired on the level would run its body thousands
     * of times while a finger rested on a button, which is not what anyone
     * means by "when pressed".
     *
     * So the task arms first — it waits for the pin to be in the OPPOSITE
     * state — and only then watches for the state itself. Between samples it
     * hands over, so a `WHEN flag clicked` script beside it keeps running.
     * That is the whole reason this could not exist before the scheduler: an
     * edge needs somewhere to sample from that is not inside another script's
     * turn, and now there is one.
     *
     * ACTIVE LOW is already handled by the pin read, so "pressed" means what
     * the learner's wiring says it means rather than what the voltage does.
     */
    emitPinHat (block, name, edge) {
        const arm = this.label('HAT'), watch = this.label('HAT');
        // `pressed` is a 1 out of emitPinRead (ACTIVE LOW inverts there).
        const wantOne = edge !== 'released';
        this.code.push(`${arm}:`);
        this.emitPinRead(name, block.opcode);
        this.op('OR AX, AX');
        this.op(`${wantOne ? 'JZ' : 'JNZ'} ${watch}      ; armed: the pin is in the other state`);
        this.op('CALL BW_POLL1MS');
        this.op(`JMP ${arm}`);
        this.code.push(`${watch}:`);
        this.emitPinRead(name, block.opcode);
        this.op('OR AX, AX');
        const fire = this.label('HAT');
        this.op(`${wantOne ? 'JNZ' : 'JZ'} ${fire}       ; the edge`);
        this.op('CALL BW_POLL1MS');
        this.op(`JMP ${watch}`);
        this.code.push(`${fire}:`);
        this.stack(block.next);
        this.op(`JMP ${arm}                ; re-arm: one run per press`);
    }

    emitSay (input, opcode, textMode) {
        // A LINE IS A SHARED RESOURCE, so under the scheduler printing one is
        // a critical section. `print` is a string followed by a CRLF, and a
        // preemption between them lets another script's text land on the same
        // line: two scripts printing "a" and "b" produced "ba" on one line and
        // then singles. That is honest hardware behaviour -- it is exactly
        // what two tasks sharing a device without a lock do -- but a learner
        // reading it would blame the program rather than the concurrency.
        //
        // PUSHF/CLI rather than CLI/STI: it restores whatever the flags were
        // instead of asserting that interrupts must have been on, which is
        // the difference between a lock and an assumption.
        const atomic = this.tasks > 1;
        if (atomic) { this.op('PUSHF'); this.op('CLI'); }
        const inner = Array.isArray(input) ? input[1] : null;
        const isLiteralText = Array.isArray(inner) && (inner[0] === 10 || textMode);
        if (isLiteralText) {
            const text = String(inner[1] === null || inner[1] === undefined ? '' : inner[1])
                .replace(/^"|"$/g, '');
            this.uses.puts = true;
            this.op(`MOV DX, OFFSET ${this.stringSym(text)}`);
            this.op('CALL BW_PUTS');
        } else {
            this.evalNum(input, opcode);
            this.uses.printn = true;
            this.op('CALL BW_PRINTN');
        }
        this.uses.crlf = true;
        this.op('CALL BW_CRLF');
        if (atomic) this.op('POPF');
    }

    // ---- waiting ------------------------------------------------------

    /**
     * `wait N secs` — INT 15h AH=86h, CX:DX microseconds. See DECISION 1.
     *
     * A literal duration is converted at emit time and is exact to the
     * microsecond. A computed one is evaluated as whole SECONDS and
     * multiplied by a million at run time, which is all the block can mean
     * once every value is an integer; the 32-bit product caps that at 4294
     * seconds and the learner is told so rather than left to find it.
     */
    emitWait (input, opcode) {
        if (this.tasks > 1) { this.emitSleep(input, opcode); return; }
        const inner = Array.isArray(input) ? input[1] : null;
        if (Array.isArray(inner) && inner[0] !== 12 && inner[0] !== 13) {
            const secs = Number(inner[1]);
            if (!Number.isFinite(secs) || secs < 0) {
                refuse(`"wait ${inner[1]} secs" is not a length of time`,
                    'bad wait duration', opcode);
            }
            const us = Math.round(secs * 1e6);
            if (us > 0xffffffff) {
                refuse(`"wait ${secs} secs" is longer than this target can time ` +
                    `(4294 seconds is the ceiling of the 32-bit microsecond count ` +
                    `INT 15h/86h takes)`, 'wait too long', opcode);
            }
            this.op(`MOV CX, ${hex16(Math.floor(us / 65536))}`);
            this.op(`MOV DX, ${hex16(us & 0xffff)}`);
        } else {
            this.warn('a "wait" whose length is computed waits a whole number of ' +
                'seconds, and no more than 4294 of them — that is the ceiling of the ' +
                '32-bit microsecond count INT 15h/86h takes. A typed-in length such ' +
                'as "wait 0.5 secs" is exact.');
            this.evalNum(input, opcode);
            this.uses.mul = true;
            this.op('MOV CX, 000Fh');
            this.op('MOV BX, 4240h');       // 1 000 000
            this.op('CALL BW_MUL32');
            this.op('MOV CX, DX');
            this.op('MOV DX, AX');
        }
        this.op('MOV AH, 86h');
        this.op('INT 15h');
    }

    // ---- statements ---------------------------------------------------

    stack (firstId) {
        let id = firstId;
        while (id && this.blocks[id]) {
            this.statement(this.blocks[id]);
            id = this.blocks[id].next;
        }
    }

    sub (b, key) {
        const input = b.inputs && b.inputs[key];
        if (Array.isArray(input) && typeof input[1] === 'string') this.stack(input[1]);
    }

    statement (b) {
        switch (b.opcode) {
        case 'data_setvariableto': {
            const sym = this.varSym(b.fields.VARIABLE);
            this.note(`set ${b.fields.VARIABLE[0]}`);
            this.evalNum(b.inputs.VALUE, b.opcode);
            this.op(`MOV [${sym}], AX`);
            this.op(`MOV [${sym}+2], DX`);
            return;
        }
        case 'data_changevariableby': {
            const sym = this.varSym(b.fields.VARIABLE);
            this.note(`change ${b.fields.VARIABLE[0]}`);
            this.evalNum(b.inputs.VALUE, b.opcode);
            this.op(`ADD [${sym}], AX`);
            this.op(`ADC [${sym}+2], DX`);
            return;
        }
        case 'control_repeat': {
            // A 32-bit counter, not the 16-bit one generateC uses — see
            // DECISION 2. A negative or zero count runs the body no times.
            const c = this.counterSym();
            const top = this.label('L');
            const body = this.label('L');
            const end = this.label('L');
            const pos = this.label('L');
            this.note('repeat');
            this.evalNum(b.inputs.TIMES, b.opcode);
            this.op('OR DX, DX');
            this.op(`JNS ${pos}`);
            this.op('XOR AX, AX');
            this.op('XOR DX, DX');
            this.code.push(`${pos}:`);
            this.op(`MOV [${c}], AX`);
            this.op(`MOV [${c}+2], DX`);
            this.code.push(`${top}:`);
            this.op(`MOV AX, [${c}]`);
            this.op(`OR AX, [${c}+2]`);
            this.op(`JNZ ${body}`);
            this.op(`JMP ${end}`);
            this.code.push(`${body}:`);
            this.sub(b, 'SUBSTACK');
            this.op(`MOV AX, [${c}]`);
            this.op('SUB AX, 1');
            this.op(`MOV [${c}], AX`);
            this.op(`MOV AX, [${c}+2]`);
            this.op('SBB AX, 0');
            this.op(`MOV [${c}+2], AX`);
            this.op(`JMP ${top}`);
            this.code.push(`${end}:`);
            return;
        }
        case 'control_forever': {
            // NO STARVATION WARNING HERE ANY MORE, and removing it is the
            // point of the preemptive scheduler. It used to say a FOREVER
            // without a `wait` "never hands control back" — true of the
            // cooperative version and FALSE now, because the timer takes the
            // CPU away whether the script cooperates or not. Measured: a
            // FOREVER that only increments a variable no longer stops the
            // script beside it from printing or from ending the program.
            //
            // Leaving the warning in would have been the same defect this
            // file keeps finding elsewhere — a claim that was true when it
            // was written and was never re-checked against what the code does.
            const top = this.label('L');
            this.note('forever');
            this.code.push(`${top}:`);
            this.sub(b, 'SUBSTACK');
            this.op(`JMP ${top}`);
            return;
        }
        case 'control_repeat_until': {
            const top = this.label('L');
            const end = this.label('L');
            this.note('repeat until');
            this.code.push(`${top}:`);
            this.evalCondInput(b.inputs.CONDITION, b.opcode);
            this.branchIfTrue(end);
            this.sub(b, 'SUBSTACK');
            this.op(`JMP ${top}`);
            this.code.push(`${end}:`);
            return;
        }
        case 'control_wait_until': {
            // `wait until <cond>` is `repeat until <cond>` with an empty body,
            // and spinning is the right implementation: it is what the same
            // program does on hardware, and the bench reports a spinning
            // program as running rather than hung.
            const top = this.label('W');
            this.note('wait until');
            // WITH MORE THAN ONE SCRIPT THIS WARNING WOULD BE WRONG: another
            // script can change a variable while this one waits, so a wait on
            // variables alone is perfectly reasonable there. The claim only
            // holds when there is exactly one script and nothing else running.
            if (this.tasks === 1 && !this.readsTheWorld(b.inputs.CONDITION)) {
                // NOTHING IN THIS LOOP CAN CHANGE THE ANSWER. One script, no
                // interrupt handlers, and a condition that reads no pin, port
                // or keypad -- so if it is false on entry it is false forever.
                // That is not a hunch, it is the whole state of the machine:
                // a spin with an empty body writes nothing.
                this.warn('`wait until` here tests only variables and constants. '
                    + 'Nothing inside the wait can change them -- there is one script and '
                    + 'no interrupt handler on this bench -- so if the condition is false '
                    + 'when the wait is reached, it stays false and the program stops '
                    + 'there. Wait on a pin, a port or a keypad, or use `repeat until` '
                    + 'with a body that changes something.');
            }
            this.code.push(`${top}:`);
            this.evalCondInput(b.inputs.CONDITION, b.opcode);
            this.op('OR AX, DX');
            if (this.tasks > 1) {
                // A SPIN THAT DOES NOT HAND OVER WOULD STARVE EVERY OTHER
                // SCRIPT, including the pin hat that might be the only thing
                // able to make this condition true. Cooperative scheduling
                // means the cooperation has to be emitted.
                const done = this.label('W');
                this.op(`JNZ ${done}`);
                this.op('CALL BW_POLL1MS');
                this.op(`JMP ${top}`);
                this.code.push(`${done}:`);
            } else {
                this.op(`JZ ${top}`);
            }
            return;
        }
        case 'control_if': {
            const end = this.label('L');
            this.note('if');
            this.evalCondInput(b.inputs.CONDITION, b.opcode);
            this.branchIfFalse(end);
            this.sub(b, 'SUBSTACK');
            this.code.push(`${end}:`);
            return;
        }
        case 'control_if_else': {
            const other = this.label('L');
            const end = this.label('L');
            this.note('if / else');
            this.evalCondInput(b.inputs.CONDITION, b.opcode);
            this.branchIfFalse(other);
            this.sub(b, 'SUBSTACK');
            this.op(`JMP ${end}`);
            this.code.push(`${other}:`);
            this.sub(b, 'SUBSTACK2');
            this.code.push(`${end}:`);
            return;
        }
        case 'control_wait':
            this.note('wait');
            this.emitWait(b.inputs.DURATION, b.opcode);
            return;
        case 'control_stop': {
            const option = b.fields.STOP_OPTION ? b.fields.STOP_OPTION[0] : 'all';
            if (option === 'other scripts in sprite') {
                this.note('stop other scripts — there are none on this target');
                return;
            }
            this.note(`stop ${option}`);
            // `stop this script` ends THIS task and lets the others run on;
            // `stop all` ends the program. With one script they coincide,
            // which is why this distinction never had to exist before.
            if (this.tasks > 1 && option === 'this script') {
                this.op('JMP BW_TEND');
            } else {
                this.op('JMP BW_EXIT');
            }
            return;
        }
        case 'looks_say':
            this.note('say');
            this.emitSay(b.inputs.MESSAGE, b.opcode, false);
            return;
        case 'looks_sayforsecs':
            this.note('say for secs');
            this.emitSay(b.inputs.MESSAGE, b.opcode, false);
            this.emitWait(b.inputs.SECS, b.opcode);
            return;
        case 'stc12_setpin':
            this.note('pin');
            this.emitPin(b.fields.PIN[0],
                (b.fields.STATE && b.fields.STATE[0]) === 'on', b.opcode);
            return;
        case 'stc12_toggle':
            this.note('pin');
            this.emitPinToggle(b.fields.PIN[0], b.opcode);
            return;
        case 'stc12_writepin':
            this.note('pin');
            this.emitPinWrite(b.fields.PIN[0], b.inputs.VALUE, b.opcode);
            return;
        case 'stc12_settone':
            this.note('tone');
            this.emitTone(b.fields.PIN[0], b.inputs.VALUE, b.opcode);
            return;
        case 'stc12_seg_shownum':
            this.note('display');
            this.emitSegShow(b.fields.PART[0], b.inputs.NUM, b.opcode);
            return;
        case 'stc12_seg_clear':
            this.note('display');
            this.emitSegClear(b.fields.PART[0], b.opcode);
            return;
        case 'stc12_setpwm':
            this.note('pwm');
            this.emitSetPwm(b.fields.PIN[0], b.inputs.VALUE, b.opcode);
            return;
        case 'event_broadcast':
            this.note('broadcast');
            this.emitBroadcast(b);
            return;
        case 'stc12_setport':
            this.note('port');
            this.emitPortWrite(b.fields.PORT[0], b.inputs.VALUE, b.opcode);
            return;
        case 'stc12_print':
            this.note('print');
            this.emitSay(b.inputs.VALUE, b.opcode,
                !!(b.fields && b.fields.MODE && b.fields.MODE[0] === 'text'));
            return;
        default:
            if (/^stc12_|^devices_|^ledcube_/.test(b.opcode)) {
                refuse(`"${nameOf(b.opcode)}" drives hardware, and this bench has none. ` +
                    'The 8086 DOS bench is a screen and a keyboard: no board is ' +
                    'attached, so there are no pins to write. Pin I/O on this tier ' +
                    'would be an 8255 port write and it is not wired here.',
                    `unsupported hardware block ${b.opcode}`, b.opcode);
            }
            refuse(`"${nameOf(b.opcode)}" is not supported on the 8086 — ` +
                SUPPORTED_SENTENCE(), `unsupported block ${b.opcode}`, b.opcode);
        }
    }

    // ---- the runtime ---------------------------------------------------

    runtime () {
        const r = [];
        const need = this.uses;
        // The scheduler's own poll routine multiplies milliseconds by the
        // measured tick rate, so BW_MUL32 is part of it -- not something only
        // a `wait` drags in. A program of nothing but pin hats never calls
        // emitSleep and was assembling with an undefined symbol.
        if (need.sched) need.mul = true;
        for (const { label, kp } of this.keypads.values()) r.push(...this.keypadRoutine(label, kp));
        if (need.sched) r.push(...this.schedRuntime());
        if (need.keypump) r.push(...this.keyPumpRoutine());
        for (const slot of this.pwm.values()) r.push(...this.pwmRoutine(slot));
        if (need.seg) r.push(...this.segRuntime());
        for (const d of this.segs.values()) r.push(...this.segRoutine(d));
        if (need.printn) { need.crlf = true; }
        if (need.div || need.mod) need.sdiv = true;

        if (need.puts) {
            r.push('',
                '; Print the NUL-terminated string at DX, one character at a time.',
                '; AH=02h rather than AH=09h so a "$" in the text is just a "$".',
                'BW_PUTS:',
                '    PUSH SI',
                '    PUSH AX',
                '    PUSH DX',
                '    MOV SI, DX',
                'BW_PUTS_L:',
                '    MOV DL, [SI]',
                '    OR DL, DL',
                '    JNZ BW_PUTS_C',
                '    JMP BW_PUTS_E',
                'BW_PUTS_C:',
                '    MOV AH, 02h',
                '    INT 21h',
                '    INC SI',
                '    JMP BW_PUTS_L',
                'BW_PUTS_E:',
                '    POP DX',
                '    POP AX',
                '    POP SI',
                '    RET');
        }
        if (need.crlf) {
            r.push('',
                '; End the line. One say, one line -- see emitSay.',
                'BW_CRLF:',
                '    PUSH AX',
                '    PUSH DX',
                '    MOV AH, 02h',
                '    MOV DL, 0Dh',
                '    INT 21h',
                '    MOV AH, 02h',
                '    MOV DL, 0Ah',
                '    INT 21h',
                '    POP DX',
                '    POP AX',
                '    RET');
        }
        if (need.printn) {
            r.push('',
                '; Print DX:AX as a signed decimal number. Digits come out of',
                '; repeated division by ten in the wrong order, so they go on the',
                '; stack and come back off it.',
                'BW_PRINTN:',
                '    PUSH BX',
                '    PUSH CX',
                '    PUSH SI',
                '    PUSH DI',
                '    OR DX, DX',
                '    JNS BW_PN_A',
                '    PUSH AX',
                '    PUSH DX',
                '    MOV AH, 02h',
                "    MOV DL, '-'",
                '    INT 21h',
                '    POP DX',
                '    POP AX',
                '    NEG DX',
                '    NEG AX',
                '    SBB DX, 0',
                'BW_PN_A:',
                '    XOR CX, CX',
                'BW_PN_D:',
                '    MOV BX, 10',
                '    MOV SI, AX',
                '    MOV AX, DX',
                '    XOR DX, DX',
                '    DIV BX',
                '    MOV DI, AX',
                '    MOV AX, SI',
                '    DIV BX',
                '    PUSH DX',
                '    INC CX',
                '    MOV DX, DI',
                '    MOV SI, AX',
                '    OR SI, DX',
                '    JZ BW_PN_E',
                '    JMP BW_PN_D',
                'BW_PN_E:',
                '    POP DX',
                "    ADD DL, '0'",
                '    MOV AH, 02h',
                '    INT 21h',
                '    DEC CX',
                '    JZ BW_PN_Z',
                '    JMP BW_PN_E',
                'BW_PN_Z:',
                '    POP DI',
                '    POP SI',
                '    POP CX',
                '    POP BX',
                '    RET');
        }
        if (need.mul) {
            r.push('',
                '; DX:AX * CX:BX -> DX:AX, low 32 bits. Three MULs: the two cross',
                '; products only ever contribute to the high word, so only their',
                '; low halves are needed.',
                'BW_MUL32:',
                '    PUSH SI',
                '    PUSH DI',
                '    MOV SI, AX',
                '    MOV DI, DX',
                '    MOV AX, DI',
                '    MUL BX',
                '    MOV DI, AX',
                '    MOV AX, SI',
                '    MUL CX',
                '    ADD DI, AX',
                '    MOV AX, SI',
                '    MUL BX',
                '    ADD DX, DI',
                '    POP DI',
                '    POP SI',
                '    RET');
        }
        if (need.div) {
            r.push('',
                '; DX:AX / CX:BX -> DX:AX (quotient).',
                'BW_DIV32:',
                '    CALL BW_SDIV',
                '    MOV AX, [BW_Q]',
                '    MOV DX, [BW_Q2]',
                '    RET');
        }
        if (need.mod) {
            r.push('',
                '; DX:AX mod CX:BX -> DX:AX (remainder, signed like the dividend).',
                'BW_MOD32:',
                '    CALL BW_SDIV',
                '    MOV AX, [BW_R]',
                '    MOV DX, [BW_R2]',
                '    RET');
        }
        if (need.sdiv) {
            r.push('',
                '; Signed 32/32. Take both absolute values, divide, put the signs',
                '; back: the quotient takes the exclusive-or of them and the',
                '; remainder takes the dividend\'s, which is what C does and',
                '; therefore what the other back ends do.',
                '; Dividing by zero yields 0 rather than trapping.',
                'BW_SDIV:',
                '    PUSH SI',
                '    XOR SI, SI',
                '    OR DX, DX',
                '    JNS BW_SD_1',
                '    OR SI, 3',
                '    NEG DX',
                '    NEG AX',
                '    SBB DX, 0',
                'BW_SD_1:',
                '    OR CX, CX',
                '    JNS BW_SD_2',
                '    XOR SI, 1',
                '    NEG CX',
                '    NEG BX',
                '    SBB CX, 0',
                'BW_SD_2:',
                '    MOV [BW_Q], AX',
                '    MOV [BW_Q2], DX',
                '    MOV [BW_D], BX',
                '    MOV [BW_D2], CX',
                '    MOV AX, BX',
                '    OR AX, CX',
                '    JNZ BW_SD_G',
                '    XOR AX, AX',
                '    MOV [BW_Q], AX',
                '    MOV [BW_Q2], AX',
                '    MOV [BW_R], AX',
                '    MOV [BW_R2], AX',
                '    POP SI',
                '    RET',
                'BW_SD_G:',
                '    CALL BW_UDIV32',
                '    TEST SI, 1',
                '    JZ BW_SD_3',
                '    MOV AX, [BW_Q]',
                '    MOV DX, [BW_Q2]',
                '    NEG DX',
                '    NEG AX',
                '    SBB DX, 0',
                '    MOV [BW_Q], AX',
                '    MOV [BW_Q2], DX',
                'BW_SD_3:',
                '    TEST SI, 2',
                '    JZ BW_SD_4',
                '    MOV AX, [BW_R]',
                '    MOV DX, [BW_R2]',
                '    NEG DX',
                '    NEG AX',
                '    SBB DX, 0',
                '    MOV [BW_R], AX',
                '    MOV [BW_R2], DX',
                'BW_SD_4:',
                '    POP SI',
                '    RET',
                '',
                '; Unsigned 32/32 by shift and subtract. BW_Q starts as the',
                '; dividend and ends as the quotient; the bit shifted off its top',
                '; carries into BW_R, which ends as the remainder.',
                'BW_UDIV32:',
                '    PUSH AX',
                '    PUSH CX',
                '    XOR AX, AX',
                '    MOV [BW_R], AX',
                '    MOV [BW_R2], AX',
                '    MOV CX, 32',
                'BW_UD_L:',
                '    SHL WORD PTR [BW_Q], 1',
                '    RCL WORD PTR [BW_Q2], 1',
                '    RCL WORD PTR [BW_R], 1',
                '    RCL WORD PTR [BW_R2], 1',
                '    MOV AX, [BW_R2]',
                '    CMP AX, [BW_D2]',
                '    JB BW_UD_N',
                '    JA BW_UD_S',
                '    MOV AX, [BW_R]',
                '    CMP AX, [BW_D]',
                '    JB BW_UD_N',
                'BW_UD_S:',
                '    MOV AX, [BW_R]',
                '    SUB AX, [BW_D]',
                '    MOV [BW_R], AX',
                '    MOV AX, [BW_R2]',
                '    SBB AX, [BW_D2]',
                '    MOV [BW_R2], AX',
                '    OR WORD PTR [BW_Q], 1',
                'BW_UD_N:',
                '    DEC CX',
                '    JZ BW_UD_E',
                '    JMP BW_UD_L',
                'BW_UD_E:',
                '    POP CX',
                '    POP AX',
                '    RET');
        }
        return r;
    }

    /**
     * The scan itself, as generated assembly. One routine per declared
     * keypad, because the row and column bits are wherever the board put
     * them and a shared routine would have to be table-driven for no gain.
     *
     * The row port is written through its SHADOW, like every other output on
     * this bench: a keypad's rows may share a port with LEDs, and clobbering
     * a neighbour is exactly the bug the shadow exists to stop.
     */
    keypadRoutine (label, kp) {
        const rowMaskAll = kp.rows.reduce((m, w) => m | (1 << w.bit), 0);
        const shadow = `BW_PORT${kp.rowPort}`;
        const rowData = kp.rows[0].dataPort, colData = kp.cols[0].dataPort;
        const portNum = (P) => ({ A: 1, B: 2, C: 3 }[P]);
        // A LOOP, NOT SIXTEEN UNROLLED TESTS. The unrolled form read better
        // and did not assemble: sixteen tests put the shared exit 157 bytes
        // from the first JZ, and an 8086 conditional branch reaches 127. The
        // alternative was `longJumps`, which would have made a keypad program
        // the one thing on this bench that assembles nowhere else.
        return ['',
            `; ---- ${kp.name}: scan a 4x4 matrix keypad -------------------`,
            '; Returns the key 0..15 in AX (32-bit pair AX:DX), or -1 for none,',
            "; which is the STC extension's contract verbatim -- so a program",
            '; that reads a keypad means the same thing on either chip.',
            ';',
            '; Each row is driven LOW in turn while the other three are held',
            '; HIGH. A pressed key shorts its row to its column, so that column',
            '; reads LOW, and only while its own row is the one being driven.',
            '; That is what the wires do, which is why a matrix keypad has no',
            '; ACTIVE LOW to declare -- it could not be anything else.',
            `; Rows: port ${kp.rowPort} (P${portNum(kp.rowPort)}).  Columns: port ${kp.colPort} (P${portNum(kp.colPort)}).`,
            `${label}:`,
            '    PUSH BX',
            '    PUSH SI',
            '    PUSH DI',
            '    XOR BL, BL           ; BL counts row*4 + column as we test',
            '    XOR SI, SI           ; SI = row',
            `${label}_ROW:`,
            `    MOV AL, [${shadow}]  ; through the shadow: rows may share a port with LEDs`,
            `    OR AL, ${rowMaskAll}          ; all four rows high`,
            `    MOV BH, [${label}_RMASK + SI]`,
            '    AND AL, BH           ; ...then this one low',
            `    MOV [${shadow}], AL`,
            `    MOV DX, ${rowData}`,
            '    OUT DX, AL',
            `    MOV DX, ${colData}`,
            '    IN AL, DX            ; the columns, as the pins actually are',
            '    XOR DI, DI           ; DI = column',
            `${label}_COL:`,
            `    MOV BH, [${label}_CMASK + DI]`,
            '    TEST AL, BH',
            `    JZ ${label}_HIT      ; low = this key shorts row to column`,
            '    INC BL',
            '    INC DI',
            '    CMP DI, 4',
            `    JB ${label}_COL`,
            '    INC SI',
            '    CMP SI, 4',
            `    JB ${label}_ROW`,
            '    MOV AX, 0FFFFh       ; -1: nothing pressed',
            '    MOV DX, 0FFFFh',
            `    JMP ${label}_DONE`,
            `${label}_HIT:`,
            '    MOV AL, BL',
            '    XOR AH, AH',
            '    XOR DX, DX',
            `${label}_DONE:`,
            '    POP DI',
            '    POP SI',
            '    POP BX',
            '    RET'];
    }

    /**
     * THE COOPERATIVE SCHEDULER — one stack per script, and a switch is a
     * swap of SP.
     *
     * The alternative was to rewrite each script as a state machine over a
     * tick, which is what the C back end does. A coroutine is better here:
     * arbitrary control flow survives a wait for free, so a `wait` nested
     * three loops deep needs no special handling, whereas a state-machine
     * transform has to lift every one of those loops into explicit state.
     *
     * NO INTERRUPTS ARE INVOLVED, and that is not a shortcut -- this bench
     * has no PIC, so an interrupt-driven scheduler could not exist on it. The
     * clock is 8254 counter 0, free-running and POLLED: the dispatcher samples
     * it and accumulates the difference into a 32-bit tick count. That is what
     * makes the whole thing possible and is exactly the thing the old refusal
     * said was missing.
     */
    schedRuntime () {
        const n = this.tasks;
        const R = ['AX', 'BX', 'CX', 'DX', 'SI', 'DI', 'BP', 'DS', 'ES'];
        const push = R.map(r => `    PUSH ${r}`);
        const pop = [...R].reverse().map(r => `    POP ${r}`);
        return ['',
            '; ---- the preemptive scheduler --------------------------------',
            '; One stack per script, switched by a TIMER INTERRUPT rather than',
            '; only at a `wait`. A script that never waits still loses the CPU,',
            '; so a FOREVER with no wait can no longer starve the others -- which',
            '; the cooperative version could only warn about.',
            ';',
            '; VECTOR 70h, NOT 8. The PIC is programmed with vector base 70h and',
            '; INT 8 / INT 1Ch are deliberately LEFT POINTING AT THE TRAP PAGE.',
            '; The DOS layer synthesises an 18.2 Hz BIOS tick whenever either of',
            '; those is hooked away, so taking INT 8 would deliver TWO unrelated',
            '; clocks -- the real IRQ0 and a synthetic one -- and quantum',
            '; accounting would drift with nothing to show why. Leaving them',
            '; alone also means INT 1Ah keeps working for the program.',
            ';',
            '; ONE FRAME SHAPE. A voluntary yield is `INT 0F0h`, so it pushes',
            '; exactly what a hardware interrupt pushes. A task suspended by the',
            '; timer and a task suspended by a `wait` are indistinguishable when',
            '; resumed, which is what lets one dispatcher serve both. A CALL-based',
            '; yield beside an IRET-based preemption cannot share a dispatcher.',
            '',
            '; The timer. EOI BEFORE the switch, deliberately: if we switched',
            '; first, this interrupt would never be acknowledged -- the task we',
            '; left is resumed by whoever preempts IT -- and the PIC would hold',
            '; IRQ0 in service forever, so exactly one tick would ever arrive.',
            'BW_ISR:',
            ...push,
            '    ADD WORD PTR [BW_TICKS], 1',
            '    ADC WORD PTR [BW_TICKS + 2], 0',
            '    MOV AL, 20H',
            '    OUT 20H, AL',
            '    CALL BW_PICK',
            ...pop,
            '    IRET',
            '',
            '; The voluntary yield, INT 0F0h. No EOI: nothing is in service.',
            'BW_ISRV:',
            ...push,
            '    CALL BW_PICK',
            ...pop,
            '    IRET',
            '',
            '; Save SP, choose the next runnable script, load its SP. Called, so',
            '; its return address is on the stack -- and every suspended task has',
            '; one too, in the same place, which is why RET lands correctly in',
            '; whichever ISR that task was suspended from.',
            ';',
            '; IF NOBODY ELSE IS DUE IT RETURNS TO THE CURRENT TASK. It must not',
            '; wait here: interrupts are off inside an ISR, so a wait loop in this',
            '; routine could never be ended by the tick it is waiting for.',
            'BW_PICK:',
            '    MOV BX, [BW_CUR]',
            '    SHL BX, 1',
            '    MOV [BW_TSP + BX], SP',
            `    MOV CX, ${n}`,
            '    MOV BX, [BW_CUR]',
            'BW_NEXT:',
            '    INC BX',
            `    CMP BX, ${n}`,
            '    JB BW_NOWRAP',
            '    XOR BX, BX',
            'BW_NOWRAP:',
            '    CMP BYTE PTR [BW_TDONE + BX], 0',
            '    JNE BW_SKIP',
            '    ; due when (ticks - wake) >= 0 as a SIGNED 32-bit difference,',
            '    ; which stays correct across the tick count wrapping.',
            '    MOV DI, BX',
            '    SHL DI, 1',
            '    SHL DI, 1',
            '    MOV AX, [BW_TICKS]',
            '    MOV DX, [BW_TICKS + 2]',
            '    SUB AX, [BW_TWAKE + DI]',
            '    SBB DX, [BW_TWAKE + DI + 2]',
            '    OR DX, DX',
            '    JS BW_SKIP',
            '    MOV [BW_CUR], BX',
            'BW_RESUME:',
            '    MOV BX, [BW_CUR]',
            '    SHL BX, 1',
            '    MOV SP, [BW_TSP + BX]',
            '    RET',
            'BW_SKIP:',
            '    LOOP BW_NEXT',
            '    JMP BW_RESUME           ; nobody else due: carry on where we were',
            '',
            '; Give up the rest of this quantum.',
            'BW_YIELD:',
            '    INT 0F0H',
            '    RET',
            '',
            '; Sleep DX:AX TICKS. Loops rather than yielding once, because the',
            '; dispatcher hands control back to a task that is not yet due when',
            '; nothing else can run.',
            'BW_SLEEP:',
            '    MOV BX, [BW_CUR]',
            '    SHL BX, 1',
            '    SHL BX, 1',
            '    ADD AX, [BW_TICKS]',
            '    ADC DX, [BW_TICKS + 2]',
            '    MOV [BW_TWAKE + BX], AX',
            '    MOV [BW_TWAKE + BX + 2], DX',
            'BW_SLP1:',
            '    INT 0F0H',
            '    MOV BX, [BW_CUR]',
            '    SHL BX, 1',
            '    SHL BX, 1',
            '    MOV AX, [BW_TICKS]',
            '    MOV DX, [BW_TICKS + 2]',
            '    SUB AX, [BW_TWAKE + BX]',
            '    SBB DX, [BW_TWAKE + BX + 2]',
            '    OR DX, DX',
            '    JS BW_SLP1',
            '    RET',
            '',
            '; Hand over for about a millisecond -- a pin hat samples at 1 kHz,',
            '; far finer than a finger and cheap enough that nothing notices.',
            'BW_POLL1MS:',
            '    MOV AX, [BW_TPMS]',
            '    XOR DX, DX',
            '    CALL BW_SLEEP',
            '    RET',
            '',
            '; This script is finished. The others carry on; when none are left',
            '; the program is over.',
            'BW_TEND:',
            '    MOV BX, [BW_CUR]',
            '    MOV BYTE PTR [BW_TDONE + BX], 1',
            'BW_TEND1:',
            `    MOV CX, ${n}`,
            '    XOR BX, BX',
            '    XOR AL, AL',
            'BW_ALLD:',
            '    ADD AL, [BW_TDONE + BX]',
            '    INC BX',
            '    LOOP BW_ALLD',
            `    CMP AL, ${n}`,
            '    JNE BW_TEND2',
            '    JMP BW_EXIT',
            'BW_TEND2:',
            '    INT 0F0H',
            '    JMP BW_TEND1',
            '',
            '; ---- startup -------------------------------------------------',
            '; Arrange one task\'s stack so the dispatcher can resume it as if it',
            '; had been interrupted: a full IRET frame, then the register set the',
            '; ISR epilogue pops, then the return address BW_PICK will RET to.',
            '; AX = stack top, BX = entry point, SI = task index.',
            '; NO PUSH SP anywhere -- on an 8086 that pushes SP AFTER the',
            '; decrement, a real difference from every later x86.',
            'BW_TINIT:',
            '    MOV DI, AX',
            '    SUB DI, 2',
            '    MOV WORD PTR [DI], 0202H    ; FLAGS with IF set: the task runs enabled',
            '    SUB DI, 2',
            '    MOV [DI], CS                ; CS',
            '    SUB DI, 2',
            '    MOV [DI], BX                ; IP -- the script entry',
            '    ; The nine saved registers, in the order the ISR epilogue pops',
            '    ; them: AX BX CX DX SI DI BP are zero, but DS AND ES MUST NOT BE.',
            '    ; A .COM has DS = ES = its PSP, and a task resumed with DS = 0',
            '    ; reads every string and variable out of segment zero -- which',
            '    ; prints control characters instead of text and looks like a',
            '    ; broken emulator rather than a wrong register.',
            '    MOV CX, 7',
            'BW_TI1:',
            '    SUB DI, 2',
            '    MOV WORD PTR [DI], 0',
            '    LOOP BW_TI1',
            '    SUB DI, 2',
            '    MOV [DI], DS                ; DS',
            '    SUB DI, 2',
            '    MOV [DI], DS                ; ES',
            '    SUB DI, 2',
            '    MOV WORD PTR [DI], OFFSET BW_TIRET   ; where BW_PICK returns to',
            '    MOV BX, SI',
            '    SHL BX, 1',
            '    MOV [BW_TSP + BX], DI',
            '    SHL BX, 1',
            '    MOV WORD PTR [BW_TWAKE + BX], 0',
            '    MOV WORD PTR [BW_TWAKE + BX + 2], 0',
            '    MOV BYTE PTR [BW_TDONE + SI], 0',
            '    RET',
            '',
            '; A fresh task resumes here: pop the zeroed registers and IRET into',
            '; its entry point with interrupts on.',
            'BW_TIRET:',
            ...pop,
            '    IRET',
            '',
            'BW_SCHINIT:',
            '    ; counter 0, mode 2, divisor 1193 -- about 1 kHz on a PC crystal',
            '    ; and about 4 kHz if the counter is fed the CPU clock. Either is',
            '    ; a fine quantum, and the rate is MEASURED below rather than',
            '    ; assumed, so which one it is does not matter.',
            '    MOV AL, 34H',
            `    MOV DX, ${PIT_BASE + 3}`,
            '    OUT DX, AL',
            '    MOV AL, 0A9H',
            `    MOV DX, ${PIT_BASE}`,
            '    OUT DX, AL',
            '    MOV AL, 04H',
            '    OUT DX, AL',
            '    ; the PIC: single, edge, ICW4, vector base 70h, IRQ0 unmasked',
            '    MOV AL, 13H',
            '    OUT 20H, AL',
            '    MOV AL, 70H',
            '    OUT 21H, AL',
            '    MOV AL, 01H',
            '    OUT 21H, AL',
            '    MOV AL, 0FEH',
            '    OUT 21H, AL',
            '    ; vectors 70h (timer) and F0h (voluntary yield)',
            '    PUSH DS',
            '    MOV AX, 2570H',
            '    MOV DX, OFFSET BW_ISR',
            '    INT 21H',
            '    MOV AX, 25F0H',
            '    MOV DX, OFFSET BW_ISRV',
            '    INT 21H',
            '    POP DS',
            '    MOV WORD PTR [BW_TICKS], 0',
            '    MOV WORD PTR [BW_TICKS + 2], 0',
            '    STI',
            '    ; fall through into the calibration',
            '',
            '; HOW FAST IS THE TICK? MEASURE IT. The counter may be clocked at a',
            '; PC\'s 1193182 Hz or at the CPU clock, and a scheduler that assumed',
            '; one got every wait 4.19x wrong while every ordering test passed.',
            '; INT 21h/2Ch is the reference because it is computed from simulated',
            '; time and is independent of the counter entirely.',
            'BW_CALIB:',
            '    CALL BW_CSEDGE',
            '    MOV AX, [BW_TICKS]',
            '    MOV [BW_CSA], AX',
            '    CALL BW_CSEDGE',
            '    MOV AX, [BW_TICKS]',
            '    SUB AX, [BW_CSA]        ; ticks in one centisecond',
            '    XOR DX, DX',
            '    MOV BX, 10',
            '    DIV BX                  ; -> ticks per millisecond',
            '    ; ZERO TICKS MEANS THE TIMER IS NOT RUNNING, and carrying on',
            '    ; would be the worst possible failure: every `wait` would spin',
            '    ; forever with nothing on screen and no message -- which is',
            '    ; exactly what happened when a bench was handed this program',
            '    ; WITHOUT the PIC and timer the build asked for. Say so and',
            '    ; exit, rather than hang and look like a broken emulator.',
            '    OR AX, AX',
            '    JNZ BW_CALOK',
            '    MOV DX, OFFSET BW_NOTICK',
            '    MOV AH, 9',
            '    INT 21H',
            '    MOV AX, 4C01H',
            '    INT 21H',
            'BW_CALOK:',
            '    MOV [BW_TPMS], AX',
            '    RET',
            '',
            'BW_CSEDGE:',
            '    MOV AH, 2CH',
            '    INT 21H',
            '    MOV [BW_CSV], DL',
            'BW_CSE1:',
            '    MOV AH, 2CH',
            '    INT 21H',
            '    CMP DL, [BW_CSV]',
            '    JE BW_CSE1',
            '    RET'];
    }

    /** The scheduler's tables and per-script stacks. */
    schedData () {
        const n = this.tasks;
        return ['',
            'BW_CUR   DW 0            ; the running script',
            'BW_TPMS  DW 1            ; timer ticks per millisecond, MEASURED',
            'BW_CSA   DW 0            ; calibration scratch',
            'BW_CSV   DB 0            ; last centisecond seen',
            "BW_NOTICK DB 'scheduler: the timer never ticked. This program needs an 8259 "
                + "PIC at 20h and the 8254 wired to IRQ0 -- the build asks for both, and "
                + "this machine was started without them.', 0DH, 0AH, '$'",
            'BW_TICKS DW 0, 0         ; 32-bit tick count -- THE clock',
            `BW_TSP   DW ${n} DUP (0)        ; saved SP per script`,
            `BW_TWAKE DW ${n * 2} DUP (0)        ; 32-bit wake time per script`,
            `BW_TDONE DB ${n} DUP (1)        ; finished flags -- START AT 1`,
            '                         ; The timer is running during calibration,',
            '                         ; BEFORE any task stack exists. A task',
            '                         ; whose saved SP is still zero must never',
            '                         ; be chosen, so every slot begins DORMANT',
            '                         ; and BW_TINIT wakes it once its stack is',
            '                         ; real. Starting at 0 let the dispatcher',
            '                         ; load SP=0 and the program walked over',
            '                         ; its own PSP.',
            `BW_STK   DB ${n * SCHED_STACK} DUP (0)      ; ${SCHED_STACK} bytes of stack each`];
    }

    /** The row and column bit masks, as data — see keypadRoutine. */
    keypadTables () {
        const d = [];
        for (const { label, kp } of this.keypads.values()) {
            d.push(`${label}_RMASK DB ` + kp.rows
                .map((w) => `${(~(1 << w.bit)) & 0xff}`).join(', ')
                + '   ; each row low in turn');
            d.push(`${label}_CMASK DB ` + kp.cols
                .map((w) => `${1 << w.bit}`).join(', ') + '   ; column bits');
        }
        return d;
    }

    dataSection () {
        const d = ['', '; ---- data ----------------------------------------------------'];
        for (const {sym, name} of this.vars.values()) {
            d.push(`${sym} DW 0, 0        ; the variable "${name}"`);
        }
        for (const sym of this.counters) d.push(`${sym} DW 0, 0        ; repeat counter`);
        for (const [text, sym] of this.strings) {
            d.push(`${sym} DB ${dbBytes(text)}`);
        }
        if (this.uses.ppi) {
            // ONE SHADOW BYTE PER PORT, because an 8255 output port cannot be
            // read-modify-written safely: reading it back gives the LATCH,
            // which is right, but two pins sharing a port must not clobber
            // each other and the chip offers no bit-set for ports A and B.
            // An 8051 program keeps its port SFR the same way.
            d.push('BW_PORTA DB 0    ; shadow of 8255 port A',
                'BW_PORTB DB 0    ; shadow of port B',
                'BW_PORTC DB 0    ; shadow of port C');
        }
        for (const disp of this.segs.values()) {
            d.push(`${disp.buf} DB 8 DUP (0)   ; frame buffer for "${disp.name}"`,
                `${disp.cur} DB 0          ; which digit the scan is on`);
        }
        for (const slot of this.pwm.values()) {
            d.push(`${slot.sym} DB 0          ; duty for "${slot.pin.name}", 0-100 percent`);
        }
        if (this.uses.keypump) {
            d.push('BW_KEY    DB 0          ; the last key the pump read',
                'BW_KFRESH DB 0          ; and whether anyone has taken it yet');
        }
        for (const [name, sym] of this.messages) {
            d.push(`${sym} DB 0            ; the broadcast "${name}"`);
        }
        d.push(...this.keypadTables());
        if (this.uses.sched) d.push(...this.schedData());
        if (this.uses.sdiv) {
            d.push('BW_Q DW 0', 'BW_Q2 DW 0', 'BW_D DW 0', 'BW_D2 DW 0',
                'BW_R DW 0', 'BW_R2 DW 0');
        }
        return d;
    }
}

/**
 * Lower a parsed project to 8086 assembly for the DOS bench.
 *
 * `source` is the pseudocode text the project was parsed FROM, and it is not
 * optional decoration. `SB3Creator.parse()` DROPS a hardware statement whose
 * DEVICE it does not recognise — measured: `DEVICE i8086` + `PIN led = P1.0
 * OUTPUT` + `turn led on` parses to a lone `event_whenflagclicked` with
 * `next: null`, the `turn led on` simply gone. By the time a project reaches
 * this function the block that should have been refused no longer exists, so
 * the refusal has to be made against the text. Without it the learner gets a
 * program that assembles, runs, terminates cleanly and prints nothing —
 * which is the failure this whole file is written to avoid.
 *
 * @param {object} project a project as `SB3Creator.parse()` leaves it
 * @param {{source?: string}} [opts] the pseudocode it was parsed from
 * @returns {{asm: string, warnings: string[], variables: string[]}}
 * @throws {Pseudocode8086Error} for anything this back end will not lower
 */
export function emitI8086Asm (project, opts = {}) {
    const source = String(opts.source || '');
    const hardware = source.match(/^[ \t]*(PIN|PART|PORT|LEDCUBE)\b[^\n]*/im);
    const stcPins = project && project.stc &&
        ((project.stc.pins || []).length || (project.stc.parts || []).length);
    // PINS ARE SUPPORTED NOW; PARTS ARE NOT, and the difference is real rather
    // than a matter of effort. A PIN is one wire, and this bench has an 8255
    // to hang it on -- P1/P2/P3 map onto ports A/B/C, so an 8051 pin program
    // reseats onto an 8086 unchanged, which is what makes the mapping worth
    // having. A PART is an LCD, a keypad, an LED cube: a component with a
    // protocol, and modelling one is not a port write.
    // A KEYPAD IS THE EXCEPTION AND THE REASON IS THE SAME ONE THAT REFUSES
    // THE REST: a KEYPAD4X4 is eight wires and a scan loop, so it is a PIN
    // program wearing a part's name. An LCD or a cube is a device with a
    // protocol, and driving one is not a port write.
    const declared = (project && project.stc && project.stc.parts) || [];
    const unsupportedParts = declared.filter(
        (p) => p.type !== 'keypad4x4' && p.type !== 'sevenseg8');
    const sourceParts = source.match(/^[ \t]*(LEDCUBE)\b[^\n]*/im)
        || (declared.length ? null : source.match(/^[ \t]*(PART)\b[^\n]*/im));
    const parts = sourceParts;
    const stcParts = unsupportedParts.length;
    if (parts || stcParts) {
        refuse(`this program declares a component (${parts ? parts[0].trim()
            : `${unsupportedParts[0].name} = ${unsupportedParts[0].type.toUpperCase()}`}), ` +
            'and this bench has an 8255 but no parts on it. A PIN is one wire and works; ' +
            'a PART is a device with a protocol -- an LCD, a shift register, a cube -- and ' +
            'driving one is not a port write. A KEYPAD4X4 is the exception and does work ' +
            'here, because a matrix keypad is eight wires and a scan loop rather than a ' +
            'protocol. Use PIN lines, or choose a device with that part.',
            'part declared');
    }
    const targets = (project && project.targets) || [];
    const stage = targets.find(t => t.isStage);
    if (!stage) {
        refuse('this project has no stage, so there is nothing to run', 'no stage');
    }
    for (const t of targets) {
        if (t.isStage) continue;
        if (Object.keys(t.blocks || {}).length) {
            refuse(`the sprite "${t.name}" has a script, and a DOS program has no ` +
                'stage for a sprite to live on — there is a text screen and nothing ' +
                'else. Put the script under STAGE:, or run this project on a device ' +
                'where a sprite means something.', 'sprite script');
        }
    }

    const blocks = stage.blocks || {};
    const hats = Object.entries(blocks).filter(([, b]) => b && b.topLevel);
    const flags = hats.filter(([, b]) => b.opcode === 'event_whenflagclicked');
    const pinHats = hats.filter(([, b]) => b.opcode === 'stc12_whenpin');
    const msgHats = hats.filter(([, b]) => b.opcode === 'event_whenbroadcastreceived');
    const keyHats = hats.filter(([, b]) => b.opcode === 'event_whenkeypressed');
    for (const [, b] of hats) {
        if (b.opcode === 'event_whenflagclicked') continue;
        if (b.opcode === 'stc12_whenpin') continue;
        if (b.opcode === 'event_whenbroadcastreceived') continue;
        if (b.opcode === 'event_whenkeypressed') continue;
        if (b.opcode === 'procedures_definition') {
            refuse('DEFINE (a custom block) is not supported on the 8086 — a call ' +
                'needs a frame this back end does not build', 'custom block');
        }
        refuse(`"${nameOf(b.opcode)}" needs the cooperative scheduler, and this back ` +
            'end has none. Every event hat has to be polled against a clock, and the ' +
            'clock on this bench blocks (INT 15h/86h) — see DECISION 1 in ' +
            'lib/bw-asm/pseudocode-8086.js. Use WHEN flag clicked.',
        `unsupported hat ${b.opcode}`, b.opcode);
    }
    // A pin hat is a script too, so a project made only of them has something
    // to run -- it just never finishes, which is what an event program does.
    if (flags.length === 0 && pinHats.length === 0 && msgHats.length === 0
        && keyHats.length === 0) {
        refuse('this project has no "WHEN flag clicked:" script and no event, so ' +
            'there is nothing to run', 'no script');
    }
    const pump = keyHats.length ? 1 : 0;
    // EVERY PWM PIN GETS A TASK, declared or not set. They have to be counted
    // BEFORE emission, because the scheduler's task table is sized up front
    // and a pin is otherwise only discovered when a `set ... percent` is
    // lowered -- so a program that declares one and never sets it would get a
    // table one entry short, or one entry too many if the set came later.
    // A declared-but-unset pin sits at 0%, which is off.
    const pwmPins = ((project && project.stc && project.stc.pins) || [])
        .filter(p => p.direction === 'pwm');
    // Each display gets a scan task, counted here for the same reason: the
    // table is sized before any body is lowered.
    const segParts = declared.filter(p => p.type === 'sevenseg8');
    const pwmCount = ((project && project.stc && project.stc.pins) || [])
        .filter(p => p.direction === 'pwm').length;
    if (flags.length + pinHats.length + msgHats.length + keyHats.length + pump + pwmCount
        > MAX_SCRIPTS) {
        refuse(`this project has ${flags.length + pinHats.length + msgHats.length
            + keyHats.length} scripts${pump ? ' (plus the keyboard pump the build adds)' : ''} `
            + `and the `
            + `scheduler here carries ${MAX_SCRIPTS}. Each one needs its own stack, and `
            + 'beyond that the stacks crowd out the program in a .COM\'s single segment. '
            + 'Join some of the scripts.', 'too many scripts');
    }

    // An EMPTY script is refused too, and for the same reason the hardware
    // check above exists: a program that runs, terminates and prints nothing
    // is indistinguishable from a broken emulator.
    for (const [, f] of [...flags, ...pinHats, ...msgHats, ...keyHats]) {
        if (!f.next) {
            refuse('a "WHEN flag clicked:" script is empty, so this program would run, ' +
                'finish, and leave the screen blank — which looks exactly like a bench ' +
                'that failed to start', 'empty script');
        }
    }

    const em = new Emitter();
    // The parser's PIN declarations, which is where port/bit/activeLow live.
    em.pins = (project && project.stc && project.stc.pins) || [];
    em.parts = declared;
    em.ports = (project && project.stc && project.stc.ports) || [];
    em.blocks = blocks;
    em.tasks = flags.length + pinHats.length + msgHats.length + keyHats.length
        + pump + pwmPins.length + segParts.length;
    for (const p of pwmPins) em.pwmSlot(p.name, 'stc12_setpwm');
    for (const d of segParts) em.segPart(d.name, 'stc12_seg_shownum');
    if (segParts.length) {
        em.uses.sched = true;
        em.uses.seg = true;
        em.warn(`this program declares ${segParts.length} eight-digit display`
            + `${segParts.length > 1 ? 's' : ''}, so the build adds a script for each to `
            + 'scan it. A multiplexed display lights ONE digit at a time and relies on '
            + 'the eye to blend them -- at about 1 kHz each of the eight is refreshed '
            + '125 times a second, well above flicker. On an 8051 that scan lives in the '
            + 'Timer-0 ISR; here it is a scheduled script.');
    }
    if (pwmPins.length) {
        em.warn(`this program declares ${pwmPins.length} PWM pin`
            + `${pwmPins.length > 1 ? 's' : ''}, so the build adds a script for each: an `
            + '8255 has no PWM hardware, so the pulse is generated by pulsing the pin. '
            + 'The period is about 10 ms (100 Hz, above flicker), and each phase is a '
            + 'whole number of scheduler ticks -- which is the resolution. About 20 '
            + 'levels are distinguishable here; asking for 100 gives four settings that '
            + 'come out the same. Fixed overhead lands on both phases, so the duty is '
            + 'pulled toward 50%: 5% measures about 9%, 95% about 91%. A fade stays a '
            + 'fade and loses a little travel at the ends.');
    }
    if (pwmPins.length) em.uses.sched = true;
    if (keyHats.length) {
        em.uses.keypump = true;
        em.warn('this program has a `WHEN <key> pressed` script, so the build adds a '
            + 'keyboard PUMP as an extra script. Reading a key CONSUMES it, so two hats '
            + 'polling DOS directly would race and a program with two key scripts would '
            + 'drop half its input. One reader publishes; the hats watch what it read.');
    }
    // REGISTER EVERY RECEIVER BEFORE ANY BODY IS EMITTED. A `broadcast` is
    // refused when nothing receives it, and the flag's symbol has to exist
    // before the first script that sends one is lowered -- otherwise whether
    // a program compiles would depend on which script came first in the file.
    for (const [, h] of msgHats) em.messageSym(h.fields.BROADCAST_OPTION[0]);
    if (em.tasks > 1) {
        // EACH SCRIPT IS A COROUTINE WITH ITS OWN STACK. They are emitted one
        // after another, each ending in BW_TEND, and the scheduler decides
        // which runs. Nothing about the block emitters changes -- only `wait`
        // and `stop this script`, which is the whole benefit of a coroutine
        // over a state-machine rewrite.
        em.uses.sched = true;
        em.warn(`this project has ${em.tasks} scripts, so the build adds a PREEMPTIVE `
            + 'scheduler and the hardware it needs: an 8259 interrupt controller at 20h '
            + 'and the 8254 timer wired to IRQ0. Each script gets its own stack, and a '
            + 'timer interrupt switches between them -- so a script that never waits '
            + 'still loses the CPU and cannot starve the others. The timer runs at vector '
            + '70h, leaving INT 8 and INT 1Ch alone so the BIOS tick keeps working. The '
            + 'tick rate is MEASURED at startup rather than assumed, which costs about '
            + '20 ms before the first script runs.');
        flags.forEach(([, f], i) => {
            em.code.push('', `BW_TASK${i}:`);
            em.stack(f.next);
            em.op('JMP BW_TEND');
        });
        pinHats.forEach(([, h], i) => {
            em.code.push('', `BW_TASK${flags.length + i}:`);
            em.emitPinHat(h, h.fields.PIN[0], h.fields.EDGE ? h.fields.EDGE[0] : 'pressed');
        });
        msgHats.forEach(([, h], i) => {
            em.code.push('', `BW_TASK${flags.length + pinHats.length + i}:`);
            em.emitMessageHat(h, h.fields.BROADCAST_OPTION[0]);
        });
        const keyBase = flags.length + pinHats.length + msgHats.length;
        keyHats.forEach(([, h], i) => {
            em.code.push('', `BW_TASK${keyBase + i}:`);
            em.emitKeyHat(h, h.fields.KEY_OPTION ? h.fields.KEY_OPTION[0] : 'any');
        });
        if (pump) {
            em.code.push('', `BW_TASK${keyBase + keyHats.length}:`, '    JMP BW_KEYPUMP');
        }
        // ONE TASK PER PWM PIN. The duty byte is set by the program; the task
        // pulses the pin forever at whatever it currently says, so `set led to
        // 40 percent` returns immediately and the fade keeps running -- which
        // is what it does on an STC, where the PCA does it in hardware.
        let pwmBase = keyBase + keyHats.length + pump;
        for (const slot of em.pwm.values()) {
            em.code.push('', `BW_TASK${pwmBase}:`, `    JMP BW_PW${slot.index}_TOP`);
            pwmBase++;
        }
        for (const d of em.segs.values()) {
            em.code.push('', `BW_TASK${pwmBase}:`, `    JMP BW_SG${d.index}_TOP`);
            pwmBase++;
        }
    } else if (msgHats.length === 1 && flags.length === 0 && pinHats.length === 0) {
        em.tasks = 1;
        em.uses.sched = true;
        em.code.push('', 'BW_TASK0:');
        em.emitMessageHat(msgHats[0][1], msgHats[0][1].fields.BROADCAST_OPTION[0]);
    } else if (pinHats.length === 1 && flags.length === 0) {
        // A LONE PIN HAT STILL NEEDS THE SCHEDULER, because its poll hands
        // over -- there is nothing else to hand over TO, but the polling
        // routine lives in the scheduler runtime and the clock it waits on is
        // the scheduler's. Cheaper to reuse it than to grow a second timer.
        em.tasks = 1;
        em.uses.sched = true;
        em.code.push('', 'BW_TASK0:');
        em.emitPinHat(pinHats[0][1], pinHats[0][1].fields.PIN[0],
            pinHats[0][1].fields.EDGE ? pinHats[0][1].fields.EDGE[0] : 'pressed');
    } else {
        em.stack(flags[0][1].next);
    }

    // Variables carry their declared initial value, as `cInit` does in the C
    // back end: a non-numeric initial value becomes 0 rather than a refusal,
    // because it is Scratch's own default for a fresh variable and the
    // program may never read it before writing it.
    const inits = [];
    for (const [id, entry] of Object.entries(stage.variables || {})) {
        if (!em.vars.has(id)) continue;
        const n = Number(entry[1]);
        const v = Number.isFinite(n) ? Math.trunc(n) : 0;
        if (v === 0) continue;   // the data section already declares 0, 0
        const sym = em.vars.get(id).sym;
        inits.push(`    MOV WORD PTR [${sym}], ${hex16(v & 0xffff)}`,
            `    MOV WORD PTR [${sym}+2], ${hex16((v >> 16) & 0xffff)}`);
    }

    const head = [
        '; Generated by Brickwright — pseudocode → 8086, in the browser.',
        ';',
        '; This is a .COM: it loads at 0100h with CS=DS=ES=SS, which is why no',
        '; segment is set up and why the data sits after the code.',
        ';',
        '; Every value is a 32-bit whole number in DX:AX (high:low) — the same',
        '; width the C back end gives a Scratch variable, on a machine whose',
        '; registers are half that. Nothing here narrows to 16 bits.',
        ';',
        '; "wait" is INT 15h AH=86h (microseconds). The 8254 on this bench is',
        '; clocked from the CPU, not the PC\'s 1.193182 MHz, so counting its',
        '; ticks would be 4.19x wrong; and there is no PIC, so it cannot',
        '; interrupt. Machine time through the BIOS is the honest clock here.',
        '',
        'ORG 100h',
        '',
        'BW_MAIN:'
    ];
    // CONFIGURE THE 8255 BEFORE ANY PIN WRITE, and only if there is one.
    //
    // 80h is mode 0 with every port an OUTPUT. It is written once, at entry,
    // because a mode word CLEARS all three output latches -- writing it again
    // mid-program would darken every LED the program had lit, for the instant
    // until the next write. That is real 8255 behaviour and it is exactly the
    // bug a "reconfigure before each write" version would have.
    //
    // The shadow bytes start at 0 and the ports start at 0, so they agree
    // before the first instruction rather than after the first write.
    if (em.uses.ppi) {
        // THE CONTROL WORD IS COMPUTED FROM ALL THE PIN DECLARATIONS AT ONCE,
        // and it has to be. A mode word clears every output latch, so it can
        // be written exactly once -- which means the direction of every port
        // must be known before the first pin is touched. That is why direction
        // lives on the PIN line and is not inferred from first use: inferring
        // it would need a second mode word, and the second one would darken
        // whatever the first had lit.
        //
        // Mode 0. Bit 4 = port A input, bit 1 = port B input, bit 3 = port C
        // upper input, bit 0 = port C lower. Port C is TWO half-ports with
        // independent directions, which is what makes it the handshake port --
        // and here it means a program can read four switches on PC0-PC3 while
        // driving four LEDs on PC4-PC7.
        let ctrl = 0x80;
        const asInput = (port, bit) => {
            if (port === 1) ctrl |= 0x10;
            else if (port === 2) ctrl |= 0x02;
            else if (port === 3) ctrl |= (bit >= 4 ? 0x08 : 0x01);
        };
        for (const pin of em.pins) {
            if (pin.direction !== 'input') continue;
            asInput(pin.port, pin.bit);
        }
        // A WHOLE PORT declared INPUT sets both nibbles, port C included.
        for (const port of em.ports) {
            if (port.direction !== 'input') continue;
            asInput(port.port, 0);
            asInput(port.port, 4);
        }
        // A KEYPAD'S COLUMNS ARE INPUTS AND ITS ROWS ARE OUTPUTS, and both
        // have to be in this word for the same reason the pins are: it is
        // written once, because a mode word clears the latches.
        for (const { kp } of em.keypads.values()) {
            for (const c of kp.cols) asInput({ A: 1, B: 2, C: 3 }[c.PORT], c.bit);
        }
        // AND THE ROWS MUST NOT HAVE BEEN TURNED INTO INPUTS BY SOMETHING
        // ELSE. If a declared INPUT pin shares a port with the rows, the word
        // above makes that whole port an input, the rows stop driving, and
        // every scan reads "nothing pressed" forever -- a program that runs
        // and means something different, which is the failure mode worth
        // spending a check on.
        for (const { kp } of em.keypads.values()) {
            const rowBit = { A: 0x10, B: 0x02, C: kp.rows[0].bit >= 4 ? 0x08 : 0x01 }[kp.rowPort];
            if (ctrl & rowBit) {
                refuse(`the keypad "${kp.name}" drives its rows on port ${kp.rowPort}, but `
                    + `something else declared on port ${kp.rowPort} is an INPUT. An 8255 sets `
                    + 'direction a whole port at a time (a nibble at a time on port C), so the '
                    + 'rows would stop driving and every scan would read "nothing pressed". '
                    + 'Move the keypad rows or the input pin to another port.',
                    'keypad rows forced to input');
            }
        }
        head.push(
            '',
            '    ; 8255 mode 0. Written ONCE, from every PIN declaration at once:',
            '    ; a mode word CLEARS the output latches, so a second one would',
            '    ; blink every pin off.',
            `    MOV DX, ${PPI_CTRL}`,
            `    MOV AL, ${ctrl}`,
            '    OUT DX, AL'
        );
    }
    // The scheduler's startup: build one stack per script, then dispatch into
    // the first. It goes AFTER the variable initialisers, because a script may
    // read a variable before the scheduler ever runs.
    if (em.uses.sched) {
        inits.push('', '    ; ---- start the scheduler ----',
            '    CALL BW_SCHINIT',
            '    ; INTERRUPTS OFF WHILE THE STACKS ARE BUILT. Calibration needs',
            '    ; the timer, so it runs with interrupts ON -- safe, because every',
            '    ; task is still marked dormant and the dispatcher can only',
            '    ; resume the slot it just saved. The moment BW_TINIT wakes task',
            '    ; 0, though, a tick would save the STARTUP code\'s SP over the',
            '    ; frame BW_TINIT just built for it, and task 0 would resume into',
            '    ; the startup path instead of its own script -- which printed',
            '    ; exactly one line per script and then lost them.',
            '    CLI');
        for (let i = 0; i < em.tasks; i++) {
            inits.push(
                `    MOV AX, OFFSET BW_STK + ${(i + 1) * SCHED_STACK}`,
                `    MOV BX, OFFSET BW_TASK${i}`,
                `    MOV SI, ${i}`,
                '    CALL BW_TINIT');
        }
        inits.push(
            '    MOV WORD PTR [BW_CUR], 0',
            '    MOV SP, [BW_TSP]',
            '    RET                     ; into BW_TIRET, whose IRET restores a',
            '                            ; FLAGS with IF set -- so interrupts come',
            '                            ; back on as the first script starts, and',
            '                            ; not one instruction before.');
    }

    const tail = [
        '',
        'BW_EXIT:',
        '    MOV AX, 4C00h',
        '    INT 21h'
    ];

    // THE CHIPS THIS PROGRAM NEEDS, so the bench can put them on the board.
    // A declaration causes a chip to appear -- a learner who had to write a
    // chip list before blinking an LED would have been failed by the tool,
    // and the 8255 already works this way. But appearing INVISIBLY is the
    // same failure class as a silently chosen default, so every added chip
    // is named in a warning as well as returned here.
    const chips = [];
    if (em.uses.adc) chips.push({ kind: 'adc0809', name: 'adc1', at: ADC_BASE });
    if (em.uses.sched) {
        // A PREEMPTIVE SCHEDULER NEEDS AN INTERRUPT, so a scheduled program
        // asks for a PIC and a timer wired to IRQ0. Same rule as the ADC: the
        // declaration causes the hardware to appear and the build says so.
        // Programs that do not schedule see an unchanged board -- which is why
        // this is requested here rather than added to the preset.
        chips.push({ kind: 'pic', name: 'pic1', at: 0x20 });
        chips.push({ kind: 'pit', name: 'pit1', at: PIT_BASE, irq: 0 });
    }

    const asm = [
        ...head,
        ...inits,
        ...em.code,
        ...tail,
        ...em.runtime(),
        ...em.dataSection(),
        '',
        'END BW_MAIN',
        ''
    ].join('\n');

    return {
        asm,
        chips,
        warnings: em.warnings,
        variables: [...em.vars.values()].map(v => v.name)
    };
}

/**
 * The whole offline path, and the function the ▶ button calls.
 *
 * The gate calls THIS, not `emitI8086Asm`, and overrides only the network —
 * the same discipline `assemble-route.js` keeps and for the same reason. A
 * test that called the code generator directly would prove the code
 * generator works and prove nothing about the button.
 *
 * @param {{project: object, source?: string, parseWarnings?: string[]}} req the
 *   parsed project, the pseudocode it came from, and the PARSER's own
 *   warnings -- which are not recoverable from the project, because a block
 *   the parser refused is simply not in it. See the warnings field below.
 *   The parsed project and the
 *   pseudocode it came from — see `emitI8086Asm` for why the text is needed
 *   as well as the project
 * @param {{hostedFetch?: Function, assembleLocal?: Function}} [seams]
 * @returns {Promise<{bytes: Uint8Array, format: 'com'|'exe', asm: string,
 *   warnings: string[], route: string, target: string, org: number|null}>}
 */
export async function buildPseudocode8086 ({project, source, parseWarnings = []}, seams = {}) {
    const {asm, chips, warnings, variables} = emitI8086Asm(project, {source});
    const out = await requestAssembly({source: asm, device: 'i8086'}, seams);
    return {
        bytes: out.bytes,
        format: out.format,
        route: out.route,
        target: out.target,
        org: out.org,
        // A .COM is not a ROM, and the bench has to be told so — carried
        // through verbatim from `requestAssembly` so the ▶ button dispatches
        // exactly the detail the ASM tab's button does.
        slotId: out.slotId,
        profile: out.profile,
        asm,
        // The chips this program's declarations require. The bench puts them
        // on the board; the warnings say so out loud.
        chips,
        variables,
        // THREE SOURCES, AND THE FIRST ONE USED TO BE MISSING. This said "the
        // emitter's give-and-take first, then the assembler's -- both are
        // shown; neither is silent", which enumerated two of three and was
        // believed complete. The PARSER's warnings were dropped on the floor
        // between `creator.parse()` and here, because the caller passed
        // `creator.project` and not `creator.warnings`.
        //
        // What that cost: `IF n = 1:` (no THEN) is diagnosed precisely by the
        // parser -- `Malformed IF (expected "IF <condition> THEN:")` plus
        // `Skipping line with unexpected indentation` for the orphaned body --
        // and the learner saw NEITHER. The program built clean, ran, and
        // printed plausible output with the branch silently gone. A learner
        // has no way to tell a dropped block from their own misunderstanding.
        warnings: [...parseWarnings, ...warnings, ...out.warnings]
    };
}

export default buildPseudocode8086;
