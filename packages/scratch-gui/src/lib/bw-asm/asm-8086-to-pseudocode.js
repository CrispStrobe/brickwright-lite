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
 *   - the two-or-more-script scheduler form (`CALL BW_SCHINIT`): one WHEN
 *     script only in v1;
 *   - pins, ports, displays, tones, PWM, keypad, broadcast, `say ... for N
 *     secs` (the emitter's other anchors): named when met;
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

    // ---- values -----------------------------------------------------------------------
    /**
     * A 32-bit value into DX:AX: a literal, a variable, or a string's offset.
     * @returns {object} an expression node
     */
    value32 () {
        const t = this.peek();
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
            const e = this.expr();
            if (e.type === 'str') this.take('CALL', 'BW_PUTS');
            else this.take('CALL', 'BW_PRINTN');
            this.take('CALL', 'BW_CRLF');
            return `${text} ${renderExpr(e)}`;
        }
        if (text === 'wait') {
            const hi = parseNumber(this.take('MOV', 'CX').args[1]);
            const lo = parseNumber(this.take('MOV', 'DX').args[1]);
            this.take('MOV', 'AH', '86h'); this.take('INT', '15h');
            const micros = (hi * 0x10000) + lo;
            const secs = micros / 1e6;
            return `wait ${Number.isInteger(secs) ? secs : String(secs)} secs`;
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
        // A note that is not a known anchor is either one of the emitter's
        // other statements (named below) or a prose comment it writes ahead
        // of one — the 8255 setup block precedes the first `; pin`. Name the
        // FEATURE, not the prose: scan ahead for the first anchor we know.
        const OTHER = ['pin', 'port', 'display', 'tone', 'pwm', 'keypad', 'broadcast', 'say for secs'];
        let feature = OTHER.includes(text) ? text : null;
        for (let k = 0; !feature && this.peek(k); k++) {
            const t = this.peek(k);
            if (t.kind === 'note' && OTHER.includes(t.text)) feature = t.text;
        }
        this.stats.refused++;
        const named = feature || text;
        throw new LiftError(`the "${named}" statement is not lifted yet (pins, ports, displays, tones, PWM, ` +
            'keypad, broadcast and "say for secs" are named refusals in v1)',
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
        if (this.toks.some(t => t.kind === 'ins' && t.op === 'CALL' && t.args[0] === 'BW_SCHINIT')) {
            const scripts = this.toks.filter(t => t.kind === 'label' && /^BW_TASK\d+$/.test(t.name)).length;
            throw new LiftError(`the scheduler form (${scripts} WHEN scripts) is not lifted yet; one script only`,
                {kind: 'refused'});
        }
        // skip the header up to BW_MAIN:
        while (this.peek() && !(this.peek().kind === 'label' && this.peek().name === 'BW_MAIN')) this.next();
        this.takeLabel('BW_MAIN');
        const body = this.block(t => t.kind === 'label' && t.name === 'BW_EXIT');
        const lines = ['DEVICE i8086'];
        for (const v of this.vars) lines.push(`GLOBAL ${v}`);
        lines.push('WHEN flag clicked:');
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
        emit(body, 1);
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
