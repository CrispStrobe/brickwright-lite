/**
 * Blocks ⇄ Tcl for the Code tab's Tcl tab, where "Tcl" means exactly what
 * runs on the DOS bench: zserge's partcl (static/roms/tcl.exe,
 * DOS_TOOLCHAINS 'tcl'). Two halves:
 *
 *   generateTcl(project)        blocks → partcl source   {ok, tcl, reasons, warnings}
 *   tclToPseudocode(source)     partcl source → pseudocode {pseudocode, warnings} (default export)
 *
 * WHAT PARTCL IS, MEASURED ON THE BENCH (not recalled from real Tcl):
 *   - Built-ins are set, subst, puts, proc, if, while, return, break, continue
 *     and the prefix math commands + - * / > >= < <= == !=. No expr, incr,
 *     else, for, lists or string commands.
 *   - Numbers are C `int` on ia16: 16-bit. [* 300 300] prints 24464.
 *     Division truncates toward zero. Strings compare as atoi() → 0.
 *   - A proc sees only its own arguments; there is no `global` or `upvar`.
 *   - An unknown command is an error, and the first error ends the program
 *     silently. So every helper the generated code calls (`else`, `not`,
 *     `and`, `or`, `mod`, `wait`, `#`) is defined at the top as a proc —
 *     `if {c} {a} else {b}` works because `else` is a proc returning 1,
 *     which `if` evaluates as its next condition.
 *   - There is no backslash escaping; a literal with `$ [ ] "` must be braced.
 *   - `return` at top level ends the program.
 *
 * Refused by name, not degraded: anything partcl cannot run as Scratch would
 * (a second WHEN script, a custom block that touches a global, lists, random,
 * text operations other than join, sprite/pen/sound blocks).
 */
import {collectScripts, decodeInput, field, procName, procPrototype, substackId, variablesUsed} from './project-walk.js';

/** Helper procs, in the order they are emitted when used. */
const HELPERS = {
    '#': 'proc # {} {}',
    else: 'proc else {} {return 1}',
    not: 'proc not {a} {if {== $a 0} {return 1}; return 0}',
    and: 'proc and {a b} {if {== $a 0} {return 0}; if {== $b 0} {return 0}; return 1}',
    or: 'proc or {a b} {if {!= $a 0} {return 1}; if {!= $b 0} {return 1}; return 0}',
    // Scratch's mod is floored (the sign of the divisor); C's % truncates.
    mod: 'proc mod {a b} {set r [- $a [* $b [/ $a $b]]]; if {!= $r 0} {if {!= [< $r 0] [< $b 0]} {set r [+ $r $b]}}; return $r}',
    // partcl has no clock, so a wait is a no-op that keeps its argument.
    wait: 'proc wait {s} {}'
};
const HELPER_NAMES = new Set(Object.keys(HELPERS));
const RESERVED = new Set(['set', 'subst', 'puts', 'proc', 'if', 'while', 'return', 'break', 'continue',
    ...HELPER_NAMES]);
const MARK_VARS = '# --- variables ---';
const MARK_PROGRAM = '# --- program ---';

const INT16_MIN = -32768;
const INT16_MAX = 32767;

/**
 * A literal as one partcl word. Quoted when it can be; braced when it holds
 * a character partcl would substitute; stripped (with a warning) when it
 * holds braces or brackets too, since partcl has no escape for those.
 */
function literalWord (text, warn) {
    const s = String(text);
    if (s === '') return '{}';
    if (/^-?\d+$/.test(s)) return s;
    if (!/["$[\]]/.test(s)) return `"${s}"`;
    if (!/[{}[\]]/.test(s)) return `{${s}}`;
    warn(`text ${JSON.stringify(s)} holds characters partcl cannot quote ({ } [ ]) — they were removed`);
    return `"${s.replace(/["$[\]{}]/g, '')}"`;
}

/** `[cmd]`, keeping a closing quote off the bracket (partcl's lexer refuses `"]`). */
const bracket = cmd => (cmd.endsWith('"') ? `[${cmd} ]` : `[${cmd}]`);

/** A fresh identifier for a Scratch name, unique within `taken`. */
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
 * Blocks → partcl.
 * @param {object} project serialized SB3 project (vm.toJSON() / creator.project)
 * @returns {{ok: boolean, tcl: string, reasons: string[], warnings: string[]}}
 */
export function generateTcl (project) {
    const reasons = [];
    const warnings = [];
    const warnOnce = new Set();
    const warn = w => { if (!warnOnce.has(w)) { warnOnce.add(w); warnings.push(w); } };
    const refuse = r => { if (!reasons.includes(r)) reasons.push(r); };
    const used = new Set();
    const taken = new Set();
    const varName = makeNamer(taken);
    const procNamer = makeNamer(taken);
    let loopSeq = 0;

    const {flags, procs, other} = collectScripts(project);
    if (flags.length > 1) {
        refuse(`partcl runs one script at a time: this project has ${flags.length} "when flag clicked" scripts`);
    }
    for (const o of other) {
        if (/^(argument_|procedures_prototype)/.test(o.block.opcode)) continue;
        refuse(`no Tcl form for the script starting with ${o.block.opcode}`);
    }

    // Custom blocks: name, params, and the globals partcl cannot reach.
    const procInfo = new Map();
    for (const p of procs) {
        const proto = procPrototype(p.block, p.blocks);
        const name = procNamer(procName(proto.proccode));
        const params = proto.argumentNames.map(a => String(a).replace(/[^A-Za-z0-9_]/g, '_') || 'arg');
        procInfo.set(proto.proccode, {name, params, proto});
        const globals = [...variablesUsed(p.block.next, p.blocks)];
        if (globals.length) {
            refuse(`custom block "${name}" uses the variable(s) ${globals.join(', ')} — ` +
                'a partcl proc sees only its own arguments (there is no global/upvar)');
        }
    }

    // ---- expressions -------------------------------------------------
    // Each returns a partcl WORD (usable as an argument).
    const num = n => {
        if (!Number.isInteger(n)) {
            warn(`partcl is integer-only: ${n} became ${Math.trunc(n)}`);
            n = Math.trunc(n);
        }
        if (n < INT16_MIN || n > INT16_MAX) warn(`${n} does not fit partcl's 16-bit integers on the 8086`);
        return String(n);
    };
    const word = (input, blocks, ctx) => {
        const d = decodeInput(input, blocks);
        switch (d.kind) {
        case 'num': return num(d.value);
        case 'str': return literalWord(d.value, warn);
        case 'var': return `$${varName(d.name)}`;
        case 'list': refuse(`partcl has no lists ("${d.name}")`); return '0';
        case 'block': return reporter(d.block, blocks, ctx);
        default: return '{}';
        }
    };
    // The command form of a boolean, for `if {…}` / `while {…}`.
    const cond = (input, blocks, ctx) => {
        const w = word(input, blocks, ctx);
        const m = /^\[(.*?) ?\]$/s.exec(w);
        return m ? m[1] : `!= ${w} 0`;
    };
    const joinParts = (input, blocks, ctx, out) => {
        const d = decodeInput(input, blocks);
        if (d.kind === 'block' && d.block.opcode === 'operator_join') {
            joinParts(d.block.inputs.STRING1, blocks, ctx, out);
            joinParts(d.block.inputs.STRING2, blocks, ctx, out);
            return;
        }
        if (d.kind === 'num') { out.push(num(d.value)); return; }
        if (d.kind === 'str') {
            if (/["$[\]]/.test(d.value)) warn(`text ${JSON.stringify(d.value)} lost its " $ [ ] inside a join`);
            out.push(d.value.replace(/["$[\]]/g, ''));
            return;
        }
        if (d.kind === 'var') { out.push(`[set ${varName(d.name)}]`); return; }
        const w = word(input, blocks, ctx);
        out.push(w.startsWith('[') ? w.replace(/ \]$/, ']') : w.replace(/^"|"$/g, ''));
    };
    const reporter = (b, blocks, ctx) => {
        const w = k => word(b.inputs[k], blocks, ctx);
        const op2 = (op, a, c) => bracket(`${op} ${w(a)} ${w(c)}`);
        switch (b.opcode) {
        case 'operator_add': return op2('+', 'NUM1', 'NUM2');
        case 'operator_subtract': return op2('-', 'NUM1', 'NUM2');
        case 'operator_multiply': return op2('*', 'NUM1', 'NUM2');
        case 'operator_divide':
            warn('partcl divides integers: / truncates toward zero');
            return op2('/', 'NUM1', 'NUM2');
        case 'operator_mod': used.add('mod'); return op2('mod', 'NUM1', 'NUM2');
        case 'operator_gt': return op2('>', 'OPERAND1', 'OPERAND2');
        case 'operator_lt': return op2('<', 'OPERAND1', 'OPERAND2');
        case 'operator_equals': {
            for (const k of ['OPERAND1', 'OPERAND2']) {
                if (decodeInput(b.inputs[k], blocks).kind === 'str') {
                    warn('partcl compares numbers only: = on text compares atoi() of both sides');
                }
            }
            return op2('==', 'OPERAND1', 'OPERAND2');
        }
        case 'operator_and': used.add('and'); return op2('and', 'OPERAND1', 'OPERAND2');
        case 'operator_or': used.add('or'); return op2('or', 'OPERAND1', 'OPERAND2');
        case 'operator_not': used.add('not'); return bracket(`not ${w('OPERAND')}`);
        case 'operator_round': return w('NUM');
        case 'operator_join': {
            const parts = [];
            joinParts(b.inputs.STRING1, blocks, ctx, parts);
            joinParts(b.inputs.STRING2, blocks, ctx, parts);
            return `"${parts.join('')}"`;
        }
        case 'argument_reporter_string_number':
        case 'argument_reporter_boolean': {
            const name = field(b, 'VALUE');
            const params = ctx.params || [];
            const i = (ctx.argNames || []).indexOf(name);
            return `$${i >= 0 ? params[i] : name}`;
        }
        case 'data_variable': return `$${varName(field(b, 'VARIABLE'))}`;
        default:
            refuse(`no Tcl form for the reporter ${b.opcode}`);
            return '0';
        }
    };

    // ---- statements --------------------------------------------------
    const pad = d => '  '.repeat(d);
    const stack = (id, blocks, ctx, depth, out) => {
        let b = blocks[id];
        while (b) {
            statement(b, blocks, ctx, depth, out);
            b = blocks[b.next];
        }
    };
    const body = (b, key, blocks, ctx, depth, out) => {
        const sid = substackId(b, key);
        if (sid) stack(sid, blocks, ctx, depth, out);
    };
    const statement = (b, blocks, ctx, depth, out) => {
        const p = pad(depth);
        const w = k => word(b.inputs[k], blocks, ctx);
        switch (b.opcode) {
        case 'data_setvariableto':
            out.push(`${p}set ${varName(field(b, 'VARIABLE'))} ${w('VALUE')}`);
            return;
        case 'data_changevariableby': {
            const n = varName(field(b, 'VARIABLE'));
            out.push(`${p}set ${n} ${bracket(`+ $${n} ${w('VALUE')}`)}`);
            return;
        }
        case 'looks_say': case 'looks_think': case 'stc12_print':
            out.push(`${p}puts ${w(b.inputs.MESSAGE ? 'MESSAGE' : 'VALUE')}`);
            return;
        case 'looks_sayforsecs': case 'looks_thinkforsecs':
            used.add('wait');
            warn('partcl has no clock: wait is a no-op');
            out.push(`${p}puts ${w('MESSAGE')}`, `${p}wait ${w('SECS')}`);
            return;
        case 'control_wait':
            used.add('wait');
            warn('partcl has no clock: wait is a no-op');
            out.push(`${p}wait ${w('DURATION')}`);
            return;
        case 'control_repeat': {
            const k = ++loopSeq;
            const times = decodeInput(b.inputs.TIMES, blocks);
            let limit = w('TIMES');
            if (times.kind !== 'num') {
                out.push(`${p}set _n${k} ${limit}`);
                limit = `$_n${k}`;
            }
            out.push(`${p}set _r${k} 0`, `${p}while {< $_r${k} ${limit}} {`, `${p}  set _r${k} [+ $_r${k} 1]`);
            body(b, 'SUBSTACK', blocks, ctx, depth + 1, out);
            out.push(`${p}}`);
            return;
        }
        case 'control_forever':
            out.push(`${p}while {== 1 1} {`);
            body(b, 'SUBSTACK', blocks, ctx, depth + 1, out);
            out.push(`${p}}`);
            return;
        case 'control_repeat_until': {
            // until not C is while C: no double negation for a hand-written while.
            const inner = decodeInput(b.inputs.CONDITION, blocks);
            if (inner.kind === 'block' && inner.block.opcode === 'operator_not') {
                out.push(`${p}while {${cond(inner.block.inputs.OPERAND, blocks, ctx)}} {`);
                body(b, 'SUBSTACK', blocks, ctx, depth + 1, out);
                out.push(`${p}}`);
                return;
            }
            used.add('not');
            const c = w('CONDITION');
            out.push(`${p}while {not ${c.startsWith('[') ? c : bracket(`!= ${c} 0`)}} {`);
            body(b, 'SUBSTACK', blocks, ctx, depth + 1, out);
            out.push(`${p}}`);
            return;
        }
        case 'control_while':
            out.push(`${p}while {${cond(b.inputs.CONDITION, blocks, ctx)}} {`);
            body(b, 'SUBSTACK', blocks, ctx, depth + 1, out);
            out.push(`${p}}`);
            return;
        case 'control_if':
            out.push(`${p}if {${cond(b.inputs.CONDITION, blocks, ctx)}} {`);
            body(b, 'SUBSTACK', blocks, ctx, depth + 1, out);
            out.push(`${p}}`);
            return;
        case 'control_if_else':
            used.add('else');
            out.push(`${p}if {${cond(b.inputs.CONDITION, blocks, ctx)}} {`);
            body(b, 'SUBSTACK', blocks, ctx, depth + 1, out);
            out.push(`${p}} else {`);
            body(b, 'SUBSTACK2', blocks, ctx, depth + 1, out);
            out.push(`${p}}`);
            return;
        case 'control_stop': {
            const opt = field(b, 'STOP_OPTION');
            if (opt === 'this script' || (opt === 'all' && !ctx.inProc)) {
                out.push(`${p}return`);
                return;
            }
            refuse(`partcl cannot "stop ${opt}"${ctx.inProc ? ' from inside a custom block' : ''}`);
            return;
        }
        case 'procedures_call': {
            const info = procInfo.get(String((b.mutation || {}).proccode));
            if (!info) { refuse(`call of an undefined custom block "${(b.mutation || {}).proccode}"`); return; }
            const ids = info.proto.argumentIds;
            const args = ids.map(id => (b.inputs[id] ? word(b.inputs[id], blocks, ctx) : '{}'));
            out.push(`${p}${[info.name, ...args].join(' ')}`);
            return;
        }
        default:
            refuse(`no Tcl form for the block ${b.opcode}`);
        }
    };

    // ---- assemble ----------------------------------------------------
    const procLines = [];
    for (const p of procs) {
        const info = procInfo.get(procPrototype(p.block, p.blocks).proccode);
        const {proto} = info;
        const ctx = {inProc: true, params: info.params, argNames: proto.argumentNames};
        procLines.push(`proc ${info.name} {${info.params.join(' ')}} {`);
        stack(p.block.next, p.blocks, ctx, 1, procLines);
        procLines.push('}');
    }
    const mainLines = [];
    if (flags.length === 1) stack(flags[0].block.next, flags[0].blocks, {inProc: false}, 0, mainLines);

    // Scratch variables start at their stored value; an unset partcl variable
    // is the empty string, which `puts` would show as nothing.
    const varLines = [];
    for (const target of (project && project.targets) || []) {
        for (const [name, value] of Object.values(target.variables || {})) {
            const n = Number(value);
            varLines.push(`set ${varName(name)} ${Number.isFinite(n) && String(value).trim() !== '' ?
                num(n) : literalWord(value, warn)}`);
        }
    }

    if (reasons.length) return {ok: false, tcl: '', reasons, warnings};
    used.add('#');
    const out = [];
    for (const h of Object.keys(HELPERS)) if (used.has(h)) out.push(HELPERS[h]);
    out.push(...procLines);
    if (varLines.length) out.push(MARK_VARS, ...varLines);
    out.push(MARK_PROGRAM, ...mainLines);
    return {ok: true, tcl: `${out.join('\n')}\n`, reasons, warnings};
}

// ======================================================================
// partcl → pseudocode
// ======================================================================

class TclReadError extends Error {}

/**
 * Split a script into commands of words, the way partcl's tcl_next does for
 * the forms it has: {braced}, "quoted with $var and [cmd]", bare words, and
 * newline/`;` separators. A command starting with `#` is a comment (the
 * generator defines `#` as a no-op proc; real Tcl treats it the same way).
 */
function parseScript (src) {
    const cmds = [];
    let i = 0;
    let line = 1;
    let words = [];
    let startLine = 1;
    const n = src.length;
    const endCmd = () => {
        if (words.length) cmds.push({words, line: startLine});
        words = [];
    };
    const matchClose = (open, close, from) => {
        let depth = 0;
        for (let j = from; j < n; j++) {
            if (src[j] === open) depth++;
            else if (src[j] === close && --depth === 0) return j;
        }
        throw new TclReadError(`line ${line}: unbalanced ${open}`);
    };
    // Parts of a quoted or bare word: literal text, $var, [cmd].
    const readParts = (stop) => {
        const parts = [];
        let lit = '';
        while (i < n && !stop(src[i])) {
            const c = src[i];
            if (c === '$') {
                const m = /^\$([A-Za-z0-9_]+)/.exec(src.slice(i));
                if (!m) { lit += c; i++; continue; }
                if (lit) { parts.push({lit}); lit = ''; }
                parts.push({var: m[1]});
                i += m[0].length;
            } else if (c === '[') {
                const j = matchClose('[', ']', i);
                if (lit) { parts.push({lit}); lit = ''; }
                parts.push({cmd: src.slice(i + 1, j)});
                i = j + 1;
            } else {
                if (c === '\n') line++;
                lit += c;
                i++;
            }
        }
        if (lit) parts.push({lit});
        return parts;
    };
    while (i < n) {
        const c = src[i];
        if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
        if (c === '\n' || c === ';') { if (c === '\n') line++; endCmd(); i++; continue; }
        if (!words.length) startLine = line;
        if (c === '#' && !words.length) {
            const j = src.indexOf('\n', i);
            const text = src.slice(i + 1, j < 0 ? n : j).trim();
            cmds.push({words: [{comment: text}], line});
            i = j < 0 ? n : j;
            continue;
        }
        if (c === '{') {
            const j = matchClose('{', '}', i);
            const text = src.slice(i + 1, j);
            words.push({brace: text, line});
            line += (text.match(/\n/g) || []).length;
            i = j + 1;
        } else if (c === '"') {
            i++;
            const parts = readParts(ch => ch === '"');
            if (src[i] !== '"') throw new TclReadError(`line ${line}: unclosed "`);
            i++;
            words.push({parts, quoted: true});
        } else {
            words.push({parts: readParts(ch => ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n' || ch === ';')});
        }
    }
    endCmd();
    return cmds;
}

const pseudoString = s => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const isNumber = s => /^-?\d+(\.\d+)?$/.test(s);
// Variables pseudocode would read as something else.
const PSEUDO_CLASH = new Set(['x', 'y']);

/**
 * partcl → pseudocode (the importer's reader contract: returns
 * {pseudocode, warnings} or throws).
 */
export default function tclToPseudocode (source) {
    const warnings = [];
    const globals = new Set();
    const procs = [];
    const rename = name => {
        if (PSEUDO_CLASH.has(name)) {
            const w = `variable "${name}" renamed to "${name}_var" (pseudocode reads "set ${name}" as motion)`;
            if (!warnings.includes(w)) warnings.push(w);
            return `${name}_var`;
        }
        return name;
    };
    const userProcs = new Map();

    // ---- expressions -------------------------------------------------
    const exprOfCmd = (text, scope) => {
        const cmds = parseScript(text);
        if (cmds.length !== 1) throw new TclReadError(`[${text}] is not one command`);
        return exprOfWords(cmds[0].words, scope);
    };
    const exprOfParts = (parts, scope, quoted) => {
        const pieces = parts.map(p => {
            if (p.var !== undefined) return varRef(p.var, scope);
            if (p.cmd !== undefined) return exprOfCmd(p.cmd, scope);
            if (!quoted && isNumber(p.lit) && parts.length === 1) return p.lit;
            return pseudoString(p.lit);
        });
        if (!pieces.length) return '""';
        return pieces.reduce((a, b) => `(${a} join ${b})`);
    };
    const varRef = (name, scope) => {
        if (scope.params && scope.params.includes(name)) return name;
        globals.add(rename(name));
        return rename(name);
    };
    const exprOfWord = (w, scope) => {
        if (w.brace !== undefined) return isNumber(w.brace) ? w.brace : pseudoString(w.brace);
        return exprOfParts(w.parts, scope, w.quoted);
    };
    const BIN = {'+': '+', '-': '-', '*': '*', '/': '/', mod: 'mod', '>': '>', '<': '<', '==': '=', and: 'and', or: 'or'};
    const NEG = {'>=': '<', '<=': '>', '!=': '='};
    const exprOfWords = (words, scope) => {
        const head = bareText(words[0]);
        const args = words.slice(1).map(w => exprOfWord(w, scope));
        if (BIN[head] && args.length === 2) return `(${args[0]} ${BIN[head]} ${args[1]})`;
        if (NEG[head] && args.length === 2) return `(not (${args[0]} ${NEG[head]} ${args[1]}))`;
        if (head === 'not' && args.length === 1) return `(not ${args[0]})`;
        if (head === 'set' && args.length === 1) return varRef(bareText(words[1]), scope);
        if (head === 'subst' && args.length === 1) return args[0];
        if (userProcs.has(head)) throw new TclReadError(`[${head} …] uses a proc's result; blocks have no reporter custom blocks`);
        throw new TclReadError(`no block for the Tcl command [${head}]`);
    };
    // A condition is a COMMAND (partcl evaluates the braced text as a script).
    const condOf = (w, scope) => {
        const text = w.brace !== undefined ? w.brace : null;
        if (text === null) return exprOfWord(w, scope);
        const cmds = parseScript(text);
        if (cmds.length !== 1) throw new TclReadError(`condition {${text}} is not one command`);
        const words = cmds[0].words;
        if (words.length === 1 && words[0].parts) {
            const only = words[0].parts;
            if (only.length === 1 && only[0].lit !== undefined && isNumber(only[0].lit)) {
                return Number(only[0].lit) ? '(1 = 1)' : '(1 = 0)';
            }
        }
        return exprOfWords(words, scope);
    };

    // ---- statements --------------------------------------------------
    const pad = d => '  '.repeat(d);
    const block = (text, scope, depth) => statements(parseScript(text), scope, depth);
    const statements = (cmds, scope, depth) => {
        const out = [];
        const p = pad(depth);
        for (let k = 0; k < cmds.length; k++) {
            const {words, line} = cmds[k];
            if (words[0].comment !== undefined) continue;
            const head = bareText(words[0]);
            const a = words.slice(1);
            try {
                // REPEAT n, as the generator writes it:
                //   [set _nK <n>]  set _rK 0  while {< $_rK <n>|$_nK} {set _rK [+ $_rK 1]; …}
                const counter = head === 'set' && a.length === 2 && /^_r\d+$/.test(bareText(a[0]) || '') &&
                    bareText(a[1]) === '0' && cmds[k + 1] && bareText(cmds[k + 1].words[0]) === 'while' ?
                    repeatN(bareText(a[0]), cmds[k + 1], scope, depth) : null;
                if (counter) { out.push(...counter); k++; continue; }
                if (head === 'set' && a.length === 2) {
                    const name = bareText(a[0]);
                    // set _nK <n> right before a counter loop is that loop's limit.
                    const next = cmds[k + 1] && cmds[k + 1].words;
                    if (/^_n\d+$/.test(name) && next && bareText(next[0]) === 'set' &&
                        /^_r\d+$/.test(bareText(next[1]) || '')) {
                        pendingLimit.set(name, exprOfWord(a[1], scope));
                        continue;
                    }
                    const target = scope.params && scope.params.includes(name) ? null : rename(name);
                    if (!target) throw new TclReadError(`assigning to the argument "${name}" — blocks cannot`);
                    globals.add(target);
                    const v = a[1];
                    // set n [+ $n X] → change n by X
                    if (v.parts && v.parts.length === 1 && v.parts[0].cmd !== undefined) {
                        const inner = parseScript(v.parts[0].cmd)[0];
                        if (inner && inner.words.length === 3 && bareText(inner.words[0]) === '+' &&
                            varOfWord(inner.words[1]) === name) {
                            out.push(`${p}change ${target} by ${exprOfWord(inner.words[2], scope)}`);
                            continue;
                        }
                    }
                    out.push(`${p}set ${target} to ${exprOfWord(v, scope)}`);
                } else if (head === 'puts' && a.length === 1) {
                    out.push(`${p}say ${exprOfWord(a[0], scope)}`);
                } else if (head === 'wait' && a.length === 1) {
                    out.push(`${p}wait ${exprOfWord(a[0], scope)} secs`);
                } else if (head === 'while' && a.length === 2) {
                    out.push(...whileLoop(a[0], a[1], scope, depth));
                } else if (head === 'if') {
                    out.push(...ifChain(a, scope, depth, line));
                } else if (head === 'return' && a.length === 0) {
                    out.push(`${p}stop this script`);
                } else if (head === 'proc' && a.length === 3) {
                    if (!scope.top) throw new TclReadError('proc defined inside a body');
                    const name = bareText(a[0]);
                    if (HELPER_NAMES.has(name)) continue;
                    procs.push({name, params: userProcs.get(name), body: a[2].brace !== undefined ? a[2].brace : '', line});
                } else if (userProcs.has(head)) {
                    const args = a.map(w => {
                        const e = exprOfWord(w, scope);
                        return /^[\w.-]+$|^".*"$|^\(.*\)$/s.test(e) ? e : `(${e})`;
                    });
                    out.push(`${p}${[head, ...args].join(' ')}`);
                } else {
                    throw new TclReadError(`no block for the Tcl command "${head}"`);
                }
            } catch (e) {
                if (!(e instanceof TclReadError)) throw e;
                warnings.push(`unsupported (line ${line}): ${e.message}`);
                out.push(`${p}# unsupported: ${head}`);
            }
        }
        return out;
    };
    const pendingLimit = new Map();
    const repeatN = (counter, whileCmd, scope, depth) => {
        const [condW, bodyW] = whileCmd.words.slice(1);
        if (!condW || condW.brace === undefined || !bodyW || bodyW.brace === undefined) return null;
        const c = parseScript(condW.brace)[0];
        if (!c || c.words.length !== 3 || bareText(c.words[0]) !== '<' || varOfWord(c.words[1]) !== counter) return null;
        const bodyCmds = parseScript(bodyW.brace);
        const first = bodyCmds[0];
        const inc = first && first.words.length === 3 && bareText(first.words[0]) === 'set' &&
            bareText(first.words[1]) === counter && first.words[2].parts && first.words[2].parts.length === 1 &&
            first.words[2].parts[0].cmd !== undefined ? parseScript(first.words[2].parts[0].cmd)[0] : null;
        if (!inc || bareText(inc.words[0]) !== '+' || varOfWord(inc.words[1]) !== counter ||
            bareText(inc.words[2]) !== '1') return null;
        const limitVar = varOfWord(c.words[2]);
        const limit = limitVar && pendingLimit.has(limitVar) ? pendingLimit.get(limitVar) : exprOfWord(c.words[2], scope);
        if (limitVar) pendingLimit.delete(limitVar);
        return [`${pad(depth)}REPEAT ${limit}:`, ...statements(bodyCmds.slice(1), scope, depth + 1)];
    };
    const whileLoop = (condW, bodyW, scope, depth) => {
        const p = pad(depth);
        const inner = bodyW.brace !== undefined ? block(bodyW.brace, scope, depth + 1) : [];
        if (condW.brace !== undefined) {
            const c = parseScript(condW.brace)[0];
            const words = c ? c.words : [];
            const t = words.map(bareText);
            if ((t.length === 3 && t[0] === '==' && t[1] === t[2] && isNumber(t[1])) ||
                (t.length === 1 && isNumber(t[0]) && Number(t[0]) !== 0)) {
                return [`${p}FOREVER:`, ...inner];
            }
            if (t[0] === 'not' && words.length === 2) {
                return [`${p}REPEAT UNTIL ${exprOfWord(words[1], scope)}:`, ...inner];
            }
        }
        return [`${p}REPEAT UNTIL (not ${condOf(condW, scope)}):`, ...inner];
    };
    const ifChain = (a, scope, depth, line) => {
        const p = pad(depth);
        if (a.length < 2) throw new TclReadError(`if needs a condition and a body (line ${line})`);
        const out = [`${p}IF ${condOf(a[0], scope)} THEN:`, ...bodyOf(a[1], scope, depth + 1)];
        let rest = a.slice(2);
        if (!rest.length) return out;
        const kw = bareText(rest[0]);
        if (kw === 'else' && rest.length === 2) {
            out.push(`${p}ELSE:`, ...bodyOf(rest[1], scope, depth + 1));
        } else if (kw === 'elseif' && rest.length >= 3) {
            out.push(`${p}ELSE:`, ...ifChain(rest.slice(1), scope, depth + 1, line));
        } else if (rest.length >= 2) {
            // partcl's native chain: if {c1} {b1} {c2} {b2} …
            out.push(`${p}ELSE:`, ...ifChain(rest, scope, depth + 1, line));
        } else {
            throw new TclReadError(`if has a dangling word (line ${line})`);
        }
        return out;
    };
    const bodyOf = (w, scope, depth) => (w.brace !== undefined ? block(w.brace, scope, depth) :
        statements([{words: [w], line: 0}], scope, depth));

    const top = parseScript(String(source || ''));
    // Generated programs fence their initialisers; those become GLOBALs, not statements.
    const vs = top.findIndex(c => c.words[0].comment === MARK_VARS.slice(2));
    const ps = top.findIndex(c => c.words[0].comment === MARK_PROGRAM.slice(2));
    let main = top;
    if (vs >= 0 && ps > vs) {
        for (const c of top.slice(vs + 1, ps)) {
            if (bareText(c.words[0]) === 'set' && c.words[1]) globals.add(rename(bareText(c.words[1])));
        }
        main = [...top.slice(0, vs), ...top.slice(ps + 1)];
    }
    // Register every proc first, so a call reads as a call wherever it sits.
    for (const c of main) {
        const w = c.words;
        if (bareText(w[0]) === 'proc' && w.length === 4 && !HELPER_NAMES.has(bareText(w[1]))) {
            userProcs.set(bareText(w[1]), (bareText(w[2]) || '').split(/\s+/).filter(Boolean));
        }
    }
    const mainLines = statements(main, {top: true}, 1);
    const procLines = [];
    for (const pr of procs) {
        const bodyLines = statements(parseScript(pr.body), {params: pr.params}, 1);
        procLines.push(`DEFINE ${[pr.name, ...pr.params.map(x => `(${x})`)].join(' ')}:`,
            ...(bodyLines.length ? bodyLines : ['  wait 0 secs']), '');
    }
    const lines = [...[...globals].map(g => `GLOBAL ${g}`)];
    if (lines.length) lines.push('');
    lines.push(...procLines);
    if (mainLines.length) lines.push('WHEN flag clicked:', ...mainLines);
    if (!procLines.length && !mainLines.length && String(source || '').trim()) {
        warnings.push('no Tcl the blocks can represent was found');
    }
    return {pseudocode: `${lines.join('\n').replace(/\n+$/, '')}\n`, warnings};
}

/** The literal text of a word with no substitution in it, else null. */
function bareText (w) {
    if (!w) return null;
    if (w.brace !== undefined) return w.brace;
    if (w.comment !== undefined) return null;
    if (w.parts.length === 0) return '';
    if (w.parts.length === 1 && w.parts[0].lit !== undefined) return w.parts[0].lit;
    return null;
}

/** `$name` → name, else null. */
function varOfWord (w) {
    return w && w.parts && w.parts.length === 1 && w.parts[0].var !== undefined ? w.parts[0].var : null;
}
