/**
 * 8086 assembly → Brickwright pseudocode: the reader the ASM tab never had.
 *
 * This is LIFTING, not decompilation. It recognises exactly the shapes
 * `pseudocode-8086.js` emits — every statement begins at one of that
 * emitter's `; note` anchors, every value travels through DX:AX, every binary
 * operator is `PUSH DX / PUSH AX / <rhs> / MOV CX, DX / MOV BX, AX / POP AX /
 * POP DX / <op>` — and turns them back into the dialect, so that a program
 * lowered by the ▶ button reads back into blocks and re-lowers to the SAME
 * bytes. Anything else is refused BY NAME: the line, the instruction and why,
 * counted in `stats.refused`, never silently dropped. That is the BASIC
 * reader's doctrine (sb3-creator-basic.js) applied to machine code.
 *
 * Deliberately NOT here, each with its refusal text:
 *   - displays, tones, PWM, keypad, broadcast, `say ... for N secs` (the
 *     emitter's other anchors): named when met. Pins and ports ARE lifted,
 *     with declarations synthesised from their use; ACTIVE LOW is not
 *     recoverable from the bytes and is warned about, not guessed.
 *   - hand-written assembly with no anchors: reported as "no Brickwright
 *     anchors found", because lifting a stranger's loop is decompilation and
 *     this file does not pretend to do it.
 *
 * Plan: docs/LANGUAGE-DEVICE-MATRIX-PLAN.md, task L1.
 * @module
 */

export class LiftError extends Error {
    constructor (message, {line = null, kind = 'shape'} = {}) {
        super(line ? `line ${line}: ${message}` : message);
        this.name = 'LiftError';
        this.line = line;
        this.kind = kind;
    }
}

// ---- tokens -------------------------------------------------------------------

const parseLine = (raw, n) => {
    const text = raw.replace(/\r$/, '');
    if (!text.trim()) return null;
    let m;
    if ((m = text.match(/^\s+;\s?(.*)$/))) return {kind: 'note', text: m[1].trim(), line: n};
    if (/^;/.test(text)) return {kind: 'comment', line: n};
    if ((m = text.match(/^([A-Za-z_][\w]*):\s*(;.*)?$/))) return {kind: 'label', name: m[1], line: n};
    if ((m = text.match(/^([A-Za-z_][\w]*)\s+(DW|DB)\s+(.*)$/i))) {
        return {kind: 'data', name: m[1], width: m[2].toUpperCase(), rest: m[3], line: n};
    }
    if ((m = text.match(/^\s*(ORG|END)\b(.*)$/i))) {
        return {kind: 'directive', op: m[1].toUpperCase(), rest: m[2].trim(), line: n};
    }
    if ((m = text.match(/^\s+([A-Za-z]+)\s*(.*?)\s*(;.*)?$/))) {
        const args = m[2] ? m[2].split(',').map(a => a.trim()) : [];
        return {kind: 'ins', op: m[1].toUpperCase(), args, line: n, text: text.trim()};
    }
    return {kind: 'unknown', text: text.trim(), line: n};
};

const describe = t => (t ? (t.text || `${t.kind} ${t.name || ''}`.trim()) : 'end of file');

const parseNumber = text => {
    const t = String(text).trim();
    let m;
    if ((m = t.match(/^([0-9A-Fa-f]+)h$/i))) return parseInt(m[1], 16);
    if ((m = t.match(/^0x([0-9A-Fa-f]+)$/i))) return parseInt(m[1], 16);
    if (/^-?\d+$/.test(t)) return Number(t);
    return null;
};

const signed32 = (lo, hi) => {
    const u = ((hi & 0xffff) * 0x10000) + (lo & 0xffff);
    return u >= 0x80000000 ? u - 0x100000000 : u;
};

// ---- expressions ---------------------------------------------------------------

const lit = value => ({type: 'lit', value});
const variable = name => ({type: 'var', name});
const str = value => ({type: 'str', value});
const bin = (op, a, b) => ({type: 'bin', op, a, b});
const not = a => ({type: 'not', a});

const PREC = {'or': 1, 'and': 2, '<': 3, '>': 3, '=': 3, '+': 4, '-': 4, '*': 5, '/': 5, 'mod': 5};

// The 8255 on the DOS bench: P1/P2/P3 map onto ports A/B/C at I/O 60h..62h,
// the control word at 63h. Mode-0 direction bits per port (C by nibble).
const PPI = {
    shadowToPort: {'[BW_PORTA]': 1, '[BW_PORTB]': 2, '[BW_PORTC]': 3},
    ioToPort: {96: 1, 97: 2, 98: 3},
    ctrlPort: 99
};

/**
 * @param {number} mask a byte with exactly one bit set
 * @returns {number} that bit's index, or -1
 */
const bitOfMask = function (mask) {
    for (let b = 0; b < 8; b++) if (mask === (1 << b)) return b;
    return -1;
};

/**
 * @param {number} port 1..3 (A..C)
 * @param {number} bit the pin, which matters only for port C's two nibbles
 * @returns {number} the control-word bit that makes it an input
 */
const inputBit = function (port, bit) {
    if (port === 1) return 0x10;
    if (port === 2) return 0x02;
    return bit >= 4 ? 0x08 : 0x01;
};

/**
 * Render an expression in the dialect, parenthesising only where the tree needs it.
 * @param {object} e an expression node
 * @param {number} [parentPrec] the enclosing operator's precedence
 * @returns {string} dialect text
 */
export const renderExpr = function (e, parentPrec = 0) {
    switch (e.type) {
    case 'lit': return String(e.value);
    case 'var': return e.name;
    // The dialect keeps a string's own escapes (`\"`) verbatim in the block
    // text and the emitter writes them into the DB unchanged, so the text is
    // already in source form: quoting it is enough, escaping it again is not.
    case 'str': return `"${e.value}"`;
    case 'read': return `(read ${e.name})`;
    case 'not': return `not ${renderExpr(e.a, 6)}`;
    case 'bin': {
        const p = PREC[e.op];
        const inner = `${renderExpr(e.a, p)} ${e.op} ${renderExpr(e.b, p + 1)}`;
        return p < parentPrec ? `(${inner})` : inner;
    }
    default: throw new LiftError(`cannot render ${e.type}`);
    }
};

// ---- the lifter ------------------------------------------------------------------

class Lifter {
    constructor (source) {
        this.toks = [];
        source.split('\n').forEach((raw, i) => {
            const t = parseLine(raw, i + 1);
            if (t && t.kind !== 'comment') this.toks.push(t);
        });
        this.i = 0;
        this.vars = []; // declared order, from the data section
        this.strings = new Map();
        this.pins = new Map(); // 'P1.3' -> {port, bit, direction, name}
        this.ports = new Map(); // 1 -> {port, direction, name}
        this.modeWord = null; // the control word the program writes to 63h
        this.polarityWarned = false;
        this.warnings = [];
        this.stats = {lifted: 0, refused: 0};
    }

    peek (k = 0) {
        return this.toks[this.i + k] || null;
    }
    next () {
        return this.toks[this.i++] || null;
    }
    at (op, ...args) {
        const t = this.peek();
        if (!t || t.kind !== 'ins' || t.op !== op) return false;
        return args.every((a, k) => a === null || (a instanceof RegExp ? a.test(t.args[k] || '') : t.args[k] === a));
    }
    take (op, ...args) {
        if (!this.at(op, ...args)) {
            const t = this.peek();
            const want = `${op} ${args.filter(a => a !== null).join(', ')}`;
            throw new LiftError(`expected ${want}, found ${describe(t)}`,
                {line: t ? t.line : null});
        }
        return this.next();
    }
    takeLabel (name = null) {
        const t = this.peek();
        if (!t || t.kind !== 'label' || (name && t.name !== name)) {
            throw new LiftError(`expected label ${name || ''}, found ${describe(t)}`, {line: t ? t.line : null});
        }
        return this.next().name;
    }
    jumpTarget (op) {
        const t = this.take(op);
        return t.args[0];
    }

    // ---- data section: variable names and strings ---------------------------------
    readData () {
        for (const t of this.toks) {
            if (t.kind !== 'data') continue;
            let m;
            if (t.width === 'DW' && (m = t.name.match(/^BW_V_(.+)$/))) this.vars.push(m[1]);
            else if (t.width === 'DB' && /^BW_S\d+$/.test(t.name)) {
                const s = t.rest.match(/^'((?:[^']|'')*)'\s*,\s*0\s*(;.*)?$/);
                this.strings.set(t.name, s ? s[1].replace(/''/g, '\'') : '');
            }
        }
    }

    // ---- pins and ports: declared from their use ----------------------------------------
    /**
     * The name a pin gets when it is first seen, or a refusal when it is used both ways.
     * @param {number} port 1..3
     * @param {number} bit 0..7
     * @param {string} direction 'input' | 'output'
     * @returns {string} the synthesised declaration name
     */
    pinName (port, bit, direction) {
        const key = `P${port}.${bit}`;
        let p = this.pins.get(key);
        if (!p) {
            p = {port, bit, direction, name: `pin${port}_${bit}`};
            this.pins.set(key, p);
        } else if (p.direction !== direction) {
            throw new LiftError(`${key} is used as both an input and an output`, {kind: 'refused'});
        }
        return p.name;
    }
    /**
     * @param {number} port 1..3
     * @param {string} direction 'input' | 'output'
     * @returns {string} the synthesised declaration name
     */
    portName (port, direction) {
        let p = this.ports.get(port);
        if (!p) {
            p = {port, direction, name: `port${port}`};
            this.ports.set(port, p);
        } else if (p.direction !== direction) {
            throw new LiftError(`P${port} is used as both an input and an output`, {kind: 'refused'});
        }
        return p.name;
    }
    /**
     * `MOV DX, <io>` → the 8255 port number, or a refusal naming the address.
     * @param {object} t the MOV token
     * @returns {number} 1..3
     */
    ioPort (t) {
        const io = parseNumber(t.args[1]);
        const port = PPI.ioToPort[io];
        if (!port) throw new LiftError(`I/O port ${t.args[1]} is not an 8255 data port`, {line: t.line});
        return port;
    }
    /**
     * The read-a-pin value: IN, mask, and a 0/1 into AX.
     * @returns {object} a read node
     */
    readPin () {
        const port = this.ioPort(this.take('MOV', 'DX'));
        this.take('IN', 'AL', 'DX');
        const mask = parseNumber(this.take('AND', 'AL').args[1]);
        const bit = bitOfMask(mask);
        if (bit < 0) throw new LiftError(`pin mask ${mask} is not a single bit`, {line: this.peek().line});
        this.take('CMP', 'AL', '0'); this.take('MOV', 'AX', '0');
        const L = this.jumpTarget('JZ'); this.take('MOV', 'AX', '1'); this.takeLabel(L); this.take('MOV', 'DX', '0');
        return {type: 'read', name: this.pinName(port, bit, 'input')};
    }
    /**
     * The read-a-port value: IN and zero-extend.
     * @returns {object} a read node
     */
    readPort () {
        const port = this.ioPort(this.take('MOV', 'DX'));
        this.take('IN', 'AL', 'DX'); this.take('XOR', 'AH', 'AH'); this.take('XOR', 'DX', 'DX');
        return {type: 'read', name: this.portName(port, 'input')};
    }
    /**
     * After AL holds the new shadow byte: store it and write the port.
     * @param {string} shadow the shadow operand, e.g. '[BW_PORTA]'
     * @param {number} port 1..3, which the OUT must agree with
     */
    writeShadow (shadow, port) {
        this.take('MOV', shadow, 'AL');
        const io = this.ioPort(this.take('MOV', 'DX'));
        if (io !== port) throw new LiftError(`shadow ${shadow} written to port ${io}`, {line: this.peek().line});
        this.take('OUT', 'DX', 'AL');
    }
    warnPolarity () {
        if (this.polarityWarned) return;
        this.polarityWarned = true;
        this.warnings.push('pin polarity (ACTIVE LOW) is not recoverable from the bytes; every pin is lifted as ' +
            'active-high, so a turn-on of an active-low pin reads back as a turn-off. The bytes are identical.');
    }

    // ---- values -----------------------------------------------------------------------
    /**
     * A 32-bit value into DX:AX: a literal, a variable, or a string's offset.
     * @returns {object} an expression node
     */
    value32 () {
        const t = this.peek();
        if (t && t.kind === 'note' && (t.text === 'pin' || t.text === 'port')) {
            this.next();
            return t.text === 'pin' ? this.readPin() : this.readPort();
        }
        if (this.at('MOV', 'AX', /^\[BW_V_/)) {
            const name = this.next().args[1].slice(6, -1);
            this.take('MOV', 'DX', `[BW_V_${name}+2]`);
            return variable(name);
        }
        if (this.at('MOV', 'AX') && parseNumber(this.peek().args[1]) !== null) {
            const lo = parseNumber(this.next().args[1]);
            const hiT = this.take('MOV', 'DX');
            const hi = parseNumber(hiT.args[1]);
            if (hi === null) throw new LiftError(`MOV DX, ${hiT.args[1]} is not a literal`, {line: hiT.line});
            return lit(signed32(lo, hi));
        }
        if (this.at('MOV', 'DX', /^OFFSET BW_S\d+$/)) {
            const name = this.next().args[1].slice(7);
            if (!this.strings.has(name)) throw new LiftError(`${name} has no DB in the data section`, {line: t.line});
            return str(this.strings.get(name));
        }
        throw new LiftError(`expected a value into DX:AX, found ${describe(t)}`, {line: t ? t.line : null});
    }

    /**
     * An expression: the emitter's stack machine. Reads until an instruction
     * that only a statement produces.
     * @returns {object} an expression node
     */
    expr () {
        const stack = [];
        let acc = this.value32();
        for (;;) {
            if (this.at('PUSH', 'DX') && this.peek(1) && this.peek(1).op === 'PUSH' && this.peek(1).args[0] === 'AX') {
                this.next(); this.next();
                stack.push(acc);
                acc = this.value32();
                continue;
            }
            if (this.at('PUSH', 'AX')) { // a boolean pushed for and/or
                this.next();
                stack.push(acc);
                acc = this.value32();
                continue;
            }
            if (this.at('MOV', 'CX', 'DX')) { // rhs into CX:BX, lhs back into DX:AX
                this.next(); this.take('MOV', 'BX', 'AX'); this.take('POP', 'AX'); this.take('POP', 'DX');
                const rhs = acc;
                const lhs = stack.pop();
                if (!lhs) throw new LiftError('operator with nothing pushed', {line: this.peek().line});
                acc = this.binaryOp(lhs, rhs);
                continue;
            }
            if (this.at('MOV', 'BX', 'AX') && this.peek(1) && this.peek(1).op === 'POP') { // boolean and / or
                this.next(); this.take('POP', 'AX');
                const rhs = acc;
                const lhs = stack.pop();
                if (!lhs) throw new LiftError('and/or with nothing pushed', {line: this.peek().line});
                if (this.at('AND', 'AX', 'BX')) {
                    this.next(); this.take('XOR', 'DX', 'DX'); acc = bin('and', lhs, rhs); continue;
                }
                if (this.at('OR', 'AX', 'BX')) {
                    this.next(); this.take('XOR', 'DX', 'DX'); acc = bin('or', lhs, rhs); continue;
                }
                throw new LiftError(`expected AND or OR after the boolean pop, found ${this.peek().text}`,
                    {line: this.peek().line});
            }
            if (this.at('XOR', 'AX', '1')) { // not
                this.next(); this.take('XOR', 'DX', 'DX');
                acc = not(acc);
                continue;
            }
            if (stack.length) {
                const t = this.peek();
                throw new LiftError(`expression left ${stack.length} value(s) on the stack at ${describe(t)}`,
                    {line: t ? t.line : null});
            }
            return acc;
        }
    }

    /**
     * lhs in DX:AX, rhs in CX:BX; what follows names the operator.
     * @param {object} lhs the popped left operand
     * @param {object} rhs the right operand
     * @returns {object} a binary expression node
     */
    binaryOp (lhs, rhs) {
        if (this.at('ADD', 'AX', 'BX')) {
            this.next(); this.take('ADC', 'DX', 'CX'); return bin('+', lhs, rhs);
        }
        if (this.at('SUB', 'AX', 'BX')) {
            this.next(); this.take('SBB', 'DX', 'CX'); return bin('-', lhs, rhs);
        }
        if (this.at('CALL', 'BW_MUL32')) {
            this.next(); return bin('*', lhs, rhs);
        }
        if (this.at('CALL', 'BW_DIV32')) {
            this.next(); return bin('/', lhs, rhs);
        }
        if (this.at('CALL', 'BW_MOD32')) {
            this.next(); return bin('mod', lhs, rhs);
        }
        if (this.at('XOR', 'SI', 'SI')) {
            this.next();
            let op;
            if (this.at('CMP', 'DX', 'CX') && this.peek(1).op === 'JL') {
                this.next(); const T = this.jumpTarget('JL'); const F = this.jumpTarget('JG');
                this.take('CMP', 'AX', 'BX'); this.take('JB', T); this.take('JMP', F);
                this.takeLabel(T); this.take('MOV', 'SI', '1'); this.takeLabel(F);
                op = '<';
            } else if (this.at('CMP', 'CX', 'DX')) {
                this.next(); const T = this.jumpTarget('JL'); const F = this.jumpTarget('JG');
                this.take('CMP', 'BX', 'AX'); this.take('JB', T); this.take('JMP', F);
                this.takeLabel(T); this.take('MOV', 'SI', '1'); this.takeLabel(F);
                op = '>';
            } else if (this.at('CMP', 'DX', 'CX') && this.peek(1).op === 'JNE') {
                this.next(); const F = this.jumpTarget('JNE');
                this.take('CMP', 'AX', 'BX'); this.take('JNE', F); this.take('MOV', 'SI', '1'); this.takeLabel(F);
                op = '=';
            } else {
                throw new LiftError(`unknown comparison shape at ${this.peek().text}`, {line: this.peek().line});
            }
            this.take('MOV', 'AX', 'SI'); this.take('XOR', 'DX', 'DX');
            return bin(op, lhs, rhs);
        }
        const t = this.peek();
        throw new LiftError(`unknown operator after the operand pop: ${describe(t)}`, {line: t ? t.line : null});
    }

    // ---- statements ---------------------------------------------------------------------
    /**
     * Statements until `stopAt(token)` is true for the next token.
     * @param {function} stopAt the terminator predicate
     * @returns {Array} lifted statements (strings, or [header, block, ...] for blocks)
     */
    block (stopAt) {
        const out = [];
        for (;;) {
            const t = this.peek();
            if (!t) throw new LiftError('unexpected end of file inside a block');
            if (stopAt(t)) return out;
            if (t.kind !== 'note') {
                throw new LiftError(`expected a statement anchor (\`; set x\`, \`; repeat\`, …), found ${describe(t)}`,
                    {line: t.line});
            }
            if (/^8255 mode 0\./.test(t.text)) {
                // The emitter's own prose ahead of the control word, then the
                // word itself: `MOV DX, 99 / MOV AL, n / OUT DX, AL`.
                while (this.peek() && this.peek().kind === 'note') this.next();
                this.take('MOV', 'DX', String(PPI.ctrlPort));
                this.modeWord = parseNumber(this.take('MOV', 'AL').args[1]);
                this.take('OUT', 'DX', 'AL');
                continue;
            }
            this.next();
            out.push(this.statement(t));
            this.stats.lifted++;
        }
    }

    statement (note) {
        const text = note.text;
        let m;
        if ((m = text.match(/^set (.+)$/))) {
            const e = this.expr();
            this.take('MOV', `[BW_V_${m[1]}]`, 'AX'); this.take('MOV', `[BW_V_${m[1]}+2]`, 'DX');
            return `set ${m[1]} to ${renderExpr(e)}`;
        }
        if ((m = text.match(/^change (.+)$/))) {
            const e = this.expr();
            this.take('ADD', `[BW_V_${m[1]}]`, 'AX'); this.take('ADC', `[BW_V_${m[1]}+2]`, 'DX');
            return `change ${m[1]} by ${renderExpr(e)}`;
        }
        if (text === 'say' || text === 'print') {
            // In the scheduler form output runs with interrupts off, so the
            // tick handler cannot interleave two scripts' characters.
            const guarded = this.at('PUSHF');
            if (guarded) {
                this.next(); this.take('CLI');
            }
            const e = this.expr();
            if (e.type === 'str') this.take('CALL', 'BW_PUTS');
            else this.take('CALL', 'BW_PRINTN');
            this.take('CALL', 'BW_CRLF');
            if (guarded) this.take('POPF');
            return `${text} ${renderExpr(e)}`;
        }
        if (text === 'wait') {
            if (this.at('MOV', 'AX')) {
                // Scheduler form: milliseconds times the measured ticks-per-ms,
                // then sleep on the tick count.
                const lo = parseNumber(this.take('MOV', 'AX').args[1]);
                const hi = parseNumber(this.take('MOV', 'DX').args[1]);
                this.take('MOV', 'BX', '[BW_TPMS]'); this.take('XOR', 'CX', 'CX');
                this.take('CALL', 'BW_MUL32'); this.take('CALL', 'BW_SLEEP');
                const ms = (hi * 0x10000) + lo;
                return `wait ${String(ms / 1000)} secs`;
            }
            // Single script: INT 15h AH=86h, microseconds in CX:DX.
            const hi = parseNumber(this.take('MOV', 'CX').args[1]);
            const lo = parseNumber(this.take('MOV', 'DX').args[1]);
            this.take('MOV', 'AH', '86h'); this.take('INT', '15h');
            const micros = (hi * 0x10000) + lo;
            return `wait ${String(micros / 1e6)} secs`;
        }
        if (text === 'repeat') {
            const count = this.expr();
            this.take('OR', 'DX', 'DX'); const clampOk = this.jumpTarget('JNS');
            this.take('XOR', 'AX', 'AX'); this.take('XOR', 'DX', 'DX'); this.takeLabel(clampOk);
            const counter = this.take('MOV', /^\[BW_C\d+\]$/, 'AX').args[0];
            const hi = `${counter.slice(0, -1)}+2]`;
            this.take('MOV', hi, 'DX');
            const head = this.takeLabel();
            this.take('MOV', 'AX', counter); this.take('OR', 'AX', hi);
            const body = this.jumpTarget('JNZ'); const end = this.jumpTarget('JMP'); this.takeLabel(body);
            const inner = this.block(t => t.kind === 'ins' && t.op === 'MOV' && t.args[0] === 'AX' &&
                t.args[1] === counter);
            this.take('MOV', 'AX', counter); this.take('SUB', 'AX', '1'); this.take('MOV', counter, 'AX');
            this.take('MOV', 'AX', hi); this.take('SBB', 'AX', '0'); this.take('MOV', hi, 'AX');
            this.take('JMP', head); this.takeLabel(end);
            return [`REPEAT ${renderExpr(count)}:`, inner];
        }
        if (text === 'if' || text === 'if / else') {
            const cond = this.expr();
            this.take('OR', 'AX', 'AX');
            const then = this.jumpTarget('JNZ');
            const otherwise = this.jumpTarget('JMP');
            this.takeLabel(then);
            if (text === 'if') {
                const inner = this.block(t => t.kind === 'label' && t.name === otherwise);
                this.takeLabel(otherwise);
                return [`IF ${renderExpr(cond)} THEN:`, inner];
            }
            const inner = this.block(t => t.kind === 'ins' && t.op === 'JMP');
            const end = this.jumpTarget('JMP'); this.takeLabel(otherwise);
            const elseBlock = this.block(t => t.kind === 'label' && t.name === end);
            this.takeLabel(end);
            return [`IF ${renderExpr(cond)} THEN:`, inner, 'ELSE:', elseBlock];
        }
        if (text === 'repeat until') {
            const head = this.takeLabel();
            const cond = this.expr();
            this.take('OR', 'AX', 'AX');
            const body = this.jumpTarget('JZ');
            const end = this.jumpTarget('JMP');
            this.takeLabel(body);
            const inner = this.block(t => t.kind === 'ins' && t.op === 'JMP' && t.args[0] === head);
            this.take('JMP', head); this.takeLabel(end);
            return [`REPEAT UNTIL ${renderExpr(cond)}:`, inner];
        }
        if (text === 'wait until') {
            const head = this.takeLabel();
            const cond = this.expr();
            this.take('OR', 'AX', 'DX'); this.take('JZ', head);
            return `wait until ${renderExpr(cond)}`;
        }
        if (text === 'forever') {
            const head = this.takeLabel();
            const inner = this.block(t => t.kind === 'ins' && t.op === 'JMP' && t.args[0] === head);
            this.take('JMP', head);
            return ['FOREVER:', inner];
        }
        if ((m = text.match(/^stop (.+)$/))) {
            this.take('JMP', 'BW_EXIT');
            return `stop ${m[1]}`;
        }
        if (text === 'pin') {
            if (this.at('MOV', 'AL', /^\[BW_PORT[ABC]\]$/)) {
                // turn on / turn off / toggle: one shadow operation.
                const shadow = this.next().args[1];
                const port = PPI.shadowToPort[shadow];
                const op = this.next();
                const mask = parseNumber(op.args[1]);
                let bit; let verb;
                if (op.op === 'OR') {
                    bit = bitOfMask(mask); verb = 'turn on';
                } else if (op.op === 'XOR') {
                    bit = bitOfMask(mask); verb = 'toggle';
                } else if (op.op === 'AND') {
                    bit = bitOfMask((~mask) & 0xff); verb = 'turn off'; this.warnPolarity();
                } else throw new LiftError(`unknown pin operation ${op.text}`, {line: op.line});
                if (bit < 0) throw new LiftError(`pin mask ${mask} is not a single bit`, {line: op.line});
                if (verb === 'turn on') this.warnPolarity();
                this.writeShadow(shadow, port);
                return `${verb} ${this.pinName(port, bit, 'output')}`;
            }
            // set <pin> to <value>: nonzero in either half is HIGH.
            const e = this.expr();
            this.take('OR', 'AX', 'DX');
            const shadow = this.take('MOV', 'AL', /^\[BW_PORT[ABC]\]$/).args[1];
            const port = PPI.shadowToPort[shadow];
            const low = this.jumpTarget('JZ');
            const mask = parseNumber(this.take('OR', 'AL').args[1]);
            const high = this.jumpTarget('JMP'); this.takeLabel(low);
            this.take('AND', 'AL', String((~mask) & 0xff)); this.takeLabel(high);
            this.writeShadow(shadow, port);
            const bit = bitOfMask(mask);
            if (bit < 0) throw new LiftError(`pin mask ${mask} is not a single bit`, {line: this.peek().line});
            return `set ${this.pinName(port, bit, 'output')} to ${renderExpr(e)}`;
        }
        if (text === 'port') {
            const e = this.expr();
            const shadow = this.take('MOV', /^\[BW_PORT[ABC]\]$/, 'AL').args[0];
            const port = PPI.shadowToPort[shadow];
            const io = this.ioPort(this.take('MOV', 'DX'));
            if (io !== port) throw new LiftError(`shadow ${shadow} written to port ${io}`, {line: this.peek().line});
            this.take('OUT', 'DX', 'AL');
            return `set ${this.portName(port, 'output')} to ${renderExpr(e)}`;
        }
        // A note that is not a known anchor is either one of the emitter's
        // other statements (named below) or a prose comment it writes ahead
        // of one — the 8255 setup block precedes the first `; pin`. Name the
        // FEATURE, not the prose: scan ahead for the first anchor we know.
        const OTHER = ['display', 'tone', 'pwm', 'keypad', 'broadcast', 'say for secs'];
        let feature = OTHER.includes(text) ? text : null;
        for (let k = 0; !feature && this.peek(k); k++) {
            const t = this.peek(k);
            if (t.kind === 'note' && OTHER.includes(t.text)) feature = t.text;
        }
        this.stats.refused++;
        const named = feature || text;
        throw new LiftError(`the "${named}" statement is not lifted yet (displays, tones, PWM, keypad, ` +
            'broadcast and "say for secs" are named refusals in v1)',
        {line: note.line, kind: 'refused'});
    }

    // ---- the program ----------------------------------------------------------------------
    lift () {
        this.readData();
        const anchored = this.toks.some(t => t.kind === 'note') &&
            this.toks.some(t => t.kind === 'label' && t.name === 'BW_MAIN');
        if (!anchored) {
            throw new LiftError('no Brickwright anchors found: this reader lifts programs the ▶ button lowered, ' +
                'not hand-written assembly', {kind: 'foreign'});
        }
        const scheduler = this.toks.some(t => t.kind === 'ins' && t.op === 'CALL' && t.args[0] === 'BW_SCHINIT');
        const scripts = [];
        if (scheduler) {
            // Two or more WHEN scripts: BW_MAIN is the startup code, and each
            // script is a BW_TASKn block ending in JMP BW_TEND. The startup
            // code is the emitter's, not the learner's, so it is skipped.
            const tasks = this.toks.filter(t => t.kind === 'label' && /^BW_TASK\d+$/.test(t.name)).map(t => t.name);
            for (const name of tasks) {
                while (this.peek() && !(this.peek().kind === 'label' && this.peek().name === name)) this.next();
                this.takeLabel(name);
                scripts.push(this.block(t => t.kind === 'ins' && t.op === 'JMP' && t.args[0] === 'BW_TEND'));
                this.take('JMP', 'BW_TEND');
            }
        } else {
            while (this.peek() && !(this.peek().kind === 'label' && this.peek().name === 'BW_MAIN')) this.next();
            this.takeLabel('BW_MAIN');
            scripts.push(this.block(t => t.kind === 'label' && t.name === 'BW_EXIT'));
        }
        // The control word is the union of every INPUT declaration. One this
        // program never reads cannot be recovered from the bytes, so it is a
        // named refusal rather than a re-lowering that silently differs.
        if (this.pins.size || this.ports.size || this.modeWord !== null) {
            let ctrl = 0x80;
            for (const p of this.pins.values()) if (p.direction === 'input') ctrl |= inputBit(p.port, p.bit);
            for (const p of this.ports.values()) {
                if (p.direction === 'input') ctrl |= inputBit(p.port, 0) | inputBit(p.port, 4);
            }
            if (this.modeWord === null) {
                throw new LiftError('pins are used but no 8255 control word was written', {kind: 'refused'});
            }
            if (ctrl !== this.modeWord) {
                throw new LiftError(`the 8255 control word ${this.modeWord} declares an input this program never ` +
                    `reads (the reads seen imply ${ctrl}); an unused INPUT declaration cannot be recovered ` +
                    'from the bytes',
                {kind: 'refused'});
            }
        }
        const lines = ['DEVICE i8086'];
        for (const p of this.pins.values()) {
            lines.push(`PIN ${p.name} = P${p.port}.${p.bit} ${p.direction.toUpperCase()}`);
        }
        for (const p of this.ports.values()) lines.push(`PORT ${p.name} = P${p.port} ${p.direction.toUpperCase()}`);
        for (const v of this.vars) lines.push(`GLOBAL ${v}`);
        const emit = (items, depth) => {
            for (const it of items) {
                if (Array.isArray(it)) {
                    // [header, block, ('ELSE:', block)?]
                    lines.push(`${'  '.repeat(depth)}${it[0]}`);
                    emit(it[1], depth + 1);
                    if (it.length === 4) {
                        lines.push(`${'  '.repeat(depth)}${it[2]}`); emit(it[3], depth + 1);
                    }
                } else lines.push(`${'  '.repeat(depth)}${it}`);
            }
        };
        for (const body of scripts) {
            lines.push('WHEN flag clicked:');
            emit(body, 1);
        }
        return `${lines.join('\n')}\n`;
    }
}

/**
 * Lift 8086 assembly the ▶ button produced back to pseudocode.
 * @param {string} source the .asm text
 * @returns {object} {ok, pseudocode, error, stats: {lifted, refused}, warnings} — pseudocode when ok,
 *   error (a LiftError with line and kind) when not
 */
export default function asm8086ToPseudocode (source) {
    const l = new Lifter(String(source || ''));
    try {
        const pseudocode = l.lift();
        return {ok: true, pseudocode, stats: l.stats, warnings: l.warnings};
    } catch (e) {
        if (!(e instanceof LiftError)) throw e;
        if (e.kind !== 'refused') l.stats.refused++;
        return {ok: false, error: e, stats: l.stats, warnings: l.warnings};
    }
}
