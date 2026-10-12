/**
 * Blocks ⇄ Forth for the Code tab's Forth tab: zForth as it runs on the DOS
 * bench (static/roms/forth.exe, DOS_TOOLCHAINS 'forth'). Two halves:
 *
 *   generateForth(project)        blocks → Forth source     {ok, forth, reasons, warnings}
 *   forthToPseudocode(source)     Forth source → pseudocode {pseudocode, warnings} (default export)
 *
 * WHAT ZFORTH IS, MEASURED ON THE BENCH:
 *   - A numeric Forth: cells are floats ("%.14g"), so 7/2 is 3.5, as in Scratch.
 *   - Globals are `var X` (reserves a cell, pushes its address); `X @` reads,
 *     `<v> X !` writes, `<v> X +!` adds. (zForth's `variable` wants a value
 *     first; `var` does not.) The program body lives in a `: main … ; main`
 *     word because zForth's if/else/fi + begin/until are compile-only.
 *   - Reporters compile to RPN: `(a + b)` → `a b +`. Primitives + - * / and the
 *     core.zf words < > <= >= = != and or not. Booleans are 0 / non-0.
 *   - Printing: a number with `.` (trailing space), a literal string with `." "`;
 *     each `say` ends with `cr`.
 *   - Control: `<cond> if … else … fi` (zForth spells `then` as `fi`).
 *
 * This v1 is a SUBSET, like fe/Tcl began: globals, set/change, arithmetic,
 * comparisons, and/or/not, say (number or string literal), if / if-else.
 * Refused by name (a later slice): loops (REPEAT / FOREVER / REPEAT UNTIL),
 * custom blocks (Forth passes arguments on the stack, not by name), join (zForth
 * has no string building), lists, wait and stop. The generator and reader share
 * one canonical shape so a program round-trips through pseudocode unchanged.
 */
import {collectScripts, decodeInput, field, procPrototype, substackId} from './project-walk.js';

const RESERVED = new Set(['var', 'variable', 'if', 'else', 'fi', 'begin', 'until', 'again', 'dup', 'drop', 'swap',
    'over', 'rot', 'and', 'or', 'not', 'cr', 'emit', 'here', 'allot', 'exit', 'i', 'times']);
const MARK_VARS = '( --- variables --- )';
const MARK_PROGRAM = '( --- program --- )';

// A Forth `." ..."` string: zForth stops the literal at the closing quote, so a
// double quote cannot appear inside one. Refused upstream (join), but escape
// defensively by dropping any stray quote.
const forthString = s => `." ${String(s).replace(/"/g, '')}"`;

function makeNamer (taken) {
    const map = new Map();
    return raw => {
        const key = String(raw);
        if (map.has(key)) return map.get(key);
        let n = key.replace(/[^A-Za-z0-9_]/g, '_');
        if (!n || /^[\d_]/.test(n)) n = `v${n}`;
        while (RESERVED.has(n) || taken.has(n)) n += '_';
        taken.add(n);
        map.set(key, n);
        return n;
    };
}

/**
 * Blocks → Forth.
 * @param {object} project serialized SB3 project
 * @returns {{ok: boolean, forth: string, reasons: string[], warnings: string[]}}
 */
export function generateForth (project) {
    const reasons = [];
    const warnings = [];
    const refuse = r => { if (!reasons.includes(r)) reasons.push(r); };
    const taken = new Set();
    const varName = makeNamer(taken);

    const {flags, procs, other} = collectScripts(project);
    if (flags.length > 1) {
        refuse(`Forth runs one script at a time: this project has ${flags.length} "when flag clicked" scripts`);
    }
    if (procs.length) {
        refuse('Forth custom blocks are not supported yet (Forth passes arguments on the stack, not by name)');
    }
    for (const o of other) {
        if (/^(argument_|procedures_prototype)/.test(o.block.opcode)) continue;
        refuse(`no Forth form for the script starting with ${o.block.opcode}`);
    }

    // ---- expressions → RPN (a list of whitespace-joined tokens) ----------
    const expr = (input, blocks) => {
        const d = decodeInput(input, blocks);
        switch (d.kind) {
        case 'num': return String(d.value);
        case 'str':
            refuse('Forth cannot use text as a number here (zForth values are numeric)');
            return '0';
        case 'var': return `${varName(d.name)} @`;
        case 'list': refuse(`Forth programs here have no Scratch lists ("${d.name}")`); return '0';
        case 'block': return reporter(d.block, blocks);
        default: return '0';
        }
    };
    const reporter = (b, blocks) => {
        const e = k => expr(b.inputs[k], blocks);
        switch (b.opcode) {
        case 'operator_add': return `${e('NUM1')} ${e('NUM2')} +`;
        case 'operator_subtract': return `${e('NUM1')} ${e('NUM2')} -`;
        case 'operator_multiply': return `${e('NUM1')} ${e('NUM2')} *`;
        case 'operator_divide': return `${e('NUM1')} ${e('NUM2')} /`;
        case 'operator_gt': return `${e('OPERAND1')} ${e('OPERAND2')} >`;
        case 'operator_lt': return `${e('OPERAND1')} ${e('OPERAND2')} <`;
        case 'operator_equals': return `${e('OPERAND1')} ${e('OPERAND2')} =`;
        case 'operator_and': return `${e('OPERAND1')} ${e('OPERAND2')} and`;
        case 'operator_or': return `${e('OPERAND1')} ${e('OPERAND2')} or`;
        case 'operator_not': return `${e('OPERAND')} not`;
        case 'operator_mod': refuse('Forth mod is not supported yet'); return '0';
        case 'operator_join':
            refuse('Forth cannot join text (zForth has no string building) — say the parts separately');
            return '0';
        case 'data_variable': return `${varName(field(b, 'VARIABLE'))} @`;
        default:
            refuse(`no Forth form for the reporter ${b.opcode}`);
            return '0';
        }
    };

    // ---- statements (each returns a line array) --------------------------
    const stack = (id, blocks) => {
        const out = [];
        let b = blocks[id];
        while (b) { out.push(...statement(b, blocks)); b = blocks[b.next]; }
        return out;
    };
    const body = (b, key, blocks) => {
        const sid = substackId(b, key);
        return sid ? stack(sid, blocks) : [];
    };
    const sayStatement = (input, blocks) => {
        const d = decodeInput(input, blocks);
        if (d.kind === 'str') return [`${forthString(d.value)} cr`];
        if (d.kind === 'block' && d.block.opcode === 'operator_join') {
            refuse('Forth cannot join text (zForth has no string building) — say the parts separately');
            return [];
        }
        return [`${expr(input, blocks)} . cr`];
    };
    const statement = (b, blocks) => {
        const e = k => expr(b.inputs[k], blocks);
        switch (b.opcode) {
        case 'data_setvariableto': return [`${e('VALUE')} ${varName(field(b, 'VARIABLE'))} !`];
        case 'data_changevariableby': return [`${e('VALUE')} ${varName(field(b, 'VARIABLE'))} +!`];
        case 'looks_say': case 'looks_think': case 'stc12_print':
            return sayStatement(b.inputs.MESSAGE ? b.inputs.MESSAGE : b.inputs.VALUE, blocks);
        case 'control_if': {
            const inner = body(b, 'SUBSTACK', blocks);
            return [`${e('CONDITION')} if`, ...inner.map(l => `  ${l}`), 'fi'];
        }
        case 'control_if_else': {
            const t = body(b, 'SUBSTACK', blocks);
            const f = body(b, 'SUBSTACK2', blocks);
            return [`${e('CONDITION')} if`, ...t.map(l => `  ${l}`), 'else', ...f.map(l => `  ${l}`), 'fi'];
        }
        case 'control_repeat': case 'control_forever': case 'control_repeat_until': case 'control_while':
            refuse('Forth loops are not supported yet (REPEAT / FOREVER / REPEAT UNTIL)');
            return [];
        case 'control_wait': case 'looks_sayforsecs': case 'looks_thinkforsecs':
            refuse('Forth has no clock (no wait)');
            return [];
        case 'control_stop':
            refuse('Forth has no way to "stop" here (no return or exit)');
            return [];
        case 'procedures_call':
            refuse('Forth custom blocks are not supported yet');
            return [];
        default:
            refuse(`no Forth form for the block ${b.opcode}`);
            return [];
        }
    };

    const mainLines = flags.length === 1 ? stack(flags[0].block.next, flags[0].blocks) : [];
    const varLines = [];
    const seen = new Set();
    for (const target of (project && project.targets) || []) {
        for (const [name] of Object.values(target.variables || {})) {
            const n = varName(name);
            if (seen.has(n)) continue;
            seen.add(n);
            varLines.push(`var ${n}`);
        }
    }
    if (reasons.length) return {ok: false, forth: '', reasons, warnings};
    const out = [];
    if (varLines.length) out.push(MARK_VARS, ...varLines);
    out.push(MARK_PROGRAM);
    // The program body lives inside a `: main … ; main` word: zForth's if/else/fi
    // and begin/until are compile-only (they only run inside a definition), and
    // `var` globals stay reachable from it. An empty body still defines main so
    // the shape is uniform.
    out.push(': main', ...mainLines.map(l => `  ${l}`), ';', 'main');
    return {ok: true, forth: `${out.join('\n')}\n`, reasons, warnings};
}

// ======================================================================
// Forth → pseudocode
// ======================================================================

class ForthReadError extends Error {}

/** Tokenise Forth: words, `( … )` comments (dropped, but the two markers kept),
 *  and `." … "` string literals as one `{str}` token. */
function tokenize (src) {
    const toks = [];
    let i = 0;
    const n = src.length;
    let line = 1;
    while (i < n) {
        const c = src[i];
        if (c === '\n') { line++; i++; continue; }
        if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
        if (c === '(') {
            const j = src.indexOf(')', i);
            const text = src.slice(i, j < 0 ? n : j + 1).trim();
            if (text === MARK_VARS) toks.push({t: 'mark', v: 'vars', line});
            else if (text === MARK_PROGRAM) toks.push({t: 'mark', v: 'program', line});
            i = j < 0 ? n : j + 1;
            continue;
        }
        if (c === '.' && src[i + 1] === '"') {
            // ." string"
            const j = src.indexOf('"', i + 2);
            if (j < 0) throw new ForthReadError(`line ${line}: unclosed ." string`);
            toks.push({t: 'str', v: src.slice(i + 2, j).replace(/^ /, ''), line});
            i = j + 1;
            continue;
        }
        let j = i;
        while (j < n && !' \t\r\n('.includes(src[j])) j++;
        toks.push({t: 'word', v: src.slice(i, j), line});
        i = j;
    }
    return toks;
}

const pseudoString = s => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const PSEUDO_CLASH = new Set(['x', 'y']);
const BIN = {'+': '+', '-': '-', '*': '*', '/': '/', '<': '<', '>': '>', '=': '=', 'and': 'and', 'or': 'or'};

/**
 * Forth → pseudocode (the importer's reader contract: returns
 * {pseudocode, warnings} or throws). Reads the canonical shape the generator
 * writes: an RPN stack machine rebuilds each expression, and `if/else/fi`
 * nests statement lists.
 */
export default function forthToPseudocode (source) {
    const warnings = [];
    const globals = new Set();
    const defNames = new Set();
    const toks = tokenize(String(source || ''));
    let pos = 0;
    const rename = name => {
        if (PSEUDO_CLASH.has(name)) {
            const w = `variable "${name}" renamed to "${name}_var" (pseudocode reads "set ${name}" as motion)`;
            if (!warnings.includes(w)) warnings.push(w);
            return `${name}_var`;
        }
        return name;
    };

    const peek = () => toks[pos];
    const next = () => toks[pos++];

    // Parse one statement; returns an array of pseudocode lines at `depth`, or
    // null at a block terminator (else/fi) which the caller consumes.
    const pad = d => '  '.repeat(d);

    // RPN expression builder: consume words until a statement terminator
    // (! +! . str if) and return {infix, kind}. The terminator token is left
    // for the statement parser, except operands/operators which are consumed.
    const readStatement = (depth) => {
        const estack = [];
        const popExpr = () => {
            if (!estack.length) throw new ForthReadError(`line ${(peek() || {}).line}: empty Forth stack`);
            return estack.pop();
        };
        for (;;) {
            const tk = peek();
            if (!tk) return null;
            if (tk.t === 'mark') { next(); continue; }
            if (tk.t === 'str') {
                next();
                // a say-string: it must be immediately followed by `cr`
                if (peek() && peek().t === 'word' && peek().v === 'cr') next();
                return [`${pad(depth)}say ${pseudoString(tk.v)}`];
            }
            const w = tk.v;
            if (w === 'else' || w === 'fi' || w === 'until' || w === 'again' || w === ';') return null; // terminator for caller
            next();
            if (w === 'cr') continue;
            if (w === ':') {                 // `: main … ;` — the program-body word
                const nm = next();
                if (!nm || nm.t !== 'word') throw new ForthReadError(': without a name');
                defNames.add(nm.v);
                const lines = [];
                for (;;) {
                    const t2 = peek();
                    if (!t2) throw new ForthReadError(`: ${nm.v} without ;`);
                    if (t2.t === 'word' && t2.v === ';') { next(); break; }
                    const s = readStatement(depth);
                    if (s === null) break;
                    lines.push(...s);
                }
                return lines;
            }
            if (defNames.has(w)) return [];  // a bare call of a defined word (the `main` invocation)
            if (w === 'var') {
                const nm = next();
                if (!nm || nm.t !== 'word') throw new ForthReadError('variable without a name');
                globals.add(rename(nm.v));
                return [];
            }
            if (/^[-+]?(\d+\.?\d*|\.\d+)$/.test(w)) { estack.push({s: w, atom: true}); continue; }
            if (w === '@') continue; // a stray `@`; a var read `X @` is handled at the var lookahead below
            if (w === 'not') { estack.push({s: `(not ${popExpr().s})`}); continue; }
            if (BIN[w]) {
                const b = popExpr(); const a = popExpr();
                estack.push({s: `(${a.s} ${BIN[w]} ${b.s})`});
                continue;
            }
            if (w === '.') {
                const v = popExpr();
                if (peek() && peek().t === 'word' && peek().v === 'cr') next(); // `<expr> . cr` — eat the cr
                return [`${pad(depth)}say ${v.s}`];
            }
            if (w === 'if') {
                const cond = popExpr();
                return parseIf(cond, depth);
            }
            // otherwise a bare word: a variable. Look ahead to tell read vs target.
            const nxt = peek();
            if (nxt && nxt.t === 'word' && nxt.v === '@') {
                next(); // consume @
                estack.push({s: rename(w)});
                globals.add(rename(w));
                continue;
            }
            if (nxt && nxt.t === 'word' && (nxt.v === '!' || nxt.v === '+!')) {
                const op = next().v;
                const target = rename(w);
                globals.add(target);
                const val = popExpr();
                return [op === '!' ? `${pad(depth)}set ${target} to ${val.s}`
                    : `${pad(depth)}change ${target} by ${val.s}`];
            }
            throw new ForthReadError(`line ${tk.line}: unexpected Forth word "${w}"`);
        }
    };

    const parseIf = (cond, depth) => {
        const out = [`${pad(depth)}IF ${cond.s} THEN:`];
        // then-branch
        for (;;) {
            const tk = peek();
            if (!tk) throw new ForthReadError('if without fi');
            if (tk.t === 'word' && (tk.v === 'else' || tk.v === 'fi')) break;
            const s = readStatement(depth + 1);
            if (s === null) break;
            out.push(...s);
        }
        if (peek() && peek().t === 'word' && peek().v === 'else') {
            next();
            out.push(`${pad(depth)}ELSE:`);
            for (;;) {
                const tk = peek();
                if (!tk) throw new ForthReadError('else without fi');
                if (tk.t === 'word' && tk.v === 'fi') break;
                const s = readStatement(depth + 1);
                if (s === null) break;
                out.push(...s);
            }
        }
        if (!(peek() && peek().t === 'word' && peek().v === 'fi')) throw new ForthReadError('if without fi');
        next(); // consume fi
        return out;
    };

    const lines = [];
    const body = [];
    while (pos < toks.length) {
        const before = pos;
        const s = readStatement(1);
        if (s === null) { // a stray terminator at top level
            const tk = next();
            warnings.push(`unexpected "${(tk || {}).v}" at top level`);
            continue;
        }
        body.push(...s);
        if (pos === before) { next(); } // guard against no progress
    }

    const globalLines = [...globals].sort().map(g => `GLOBAL ${g}`);
    if (globalLines.length) { lines.push(...globalLines, ''); }
    // strip say/set/etc. that are variable declarations (empty arrays already dropped)
    const realBody = body.filter(Boolean);
    if (realBody.length) lines.push('WHEN flag clicked:', ...realBody);
    if (!realBody.length && String(source || '').trim()) {
        warnings.push('no Forth the blocks can represent was found');
    }
    return {pseudocode: `${lines.join('\n').replace(/\n+$/, '')}\n`, warnings};
}
