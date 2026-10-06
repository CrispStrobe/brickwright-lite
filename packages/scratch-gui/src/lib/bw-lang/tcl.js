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
import {collectScripts, decodeInput, field, procName, procPrototype, substackId, variablesUsed,
    variablesUsedBySets, writtenFirst} from './project-walk.js';

/** Helper procs, in the order they are emitted when used. */
const HELPERS = {
    '#': 'proc # {} {}',
    else: 'proc else {} {return 1}',
    not: 'proc not {a} {if {== $a 0} {return 1}; return 0}',
    and: 'proc and {a b} {if {== $a 0} {return 0}; if {== $b 0} {return 0}; return 1}',
    or: 'proc or {a b} {if {!= $a 0} {return 1}; if {!= $b 0} {return 1}; return 0}',
    // Scratch's mod is floored (the sign of the divisor); C's % truncates.
    // Integer powers by repeated multiplication (Tcl's ** in partcl).
    pow: 'proc pow {a b} {set r 1; while {> $b 0} {set r [* $r $a]; set b [- $b 1]}; return $r}',
    abs: 'proc abs {a} {if {< $a 0} {return [- 0 $a]}; return $a}',
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
function literalWord (text, warn, top = false) {
    const s = String(text);
    if (s === '') return '{}';
    if (/^-?\d+$/.test(s)) return s;
    if (!/["$[\]]/.test(s)) return `"${s}"`;
    // partcl reads {…} by counting braces and […] by counting brackets, so
    // balanced pairs inside braces are safe; real Tcl reads the same text the
    // same way except for backslash-newline, which is never left in.
    // A word that is a command's own argument (not inside […]) may hold
    // unbalanced brackets too: nothing is counting them there.
    if (pairs(s, '{', '}') && (top || pairs(s, '[', ']')) && !/\\\n/.test(s)) return `{${s}}`;
    warn(`text ${JSON.stringify(s)} holds unbalanced braces or brackets, which partcl cannot quote — they were removed`);
    const kept = s.replace(/["$[\]{}]/g, '');
    return kept ? `"${kept}"` : '{}';
}

/** Every `open` in s has its `close`, in order. */
function pairs (s, open, close) {
    let d = 0;
    for (const c of s) {
        if (c === open) d++;
        else if (c === close && --d < 0) return false;
    }
    return d === 0;
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

    // Custom blocks: name, params, return value, and the globals partcl
    // cannot reach.
    //
    // RETURN VALUES. Blocks have none; the reader writes `return X` in proc f
    // as `set f_result to X; stop this script` and `[f …]` as a call before
    // the statement that reads f_result. Here that is undone: a custom block
    // that sets <its name>_result RETURNS, a call to it is
    // `set f_result [f …]`, and `set f_result X` followed by stop (or last in
    // the body) is `return X`. In partcl each f_result is then a local of
    // whichever frame made the call — exactly what recursion needs.
    //
    // LOCALS. A partcl proc sees only its own frame. A variable it writes
    // before reading (at the top of its body, in order) behaves the same as
    // a local, so it is one; any other variable is a global, which is refused.
    const procInfo = new Map();
    for (const p of procs) {
        const proto = procPrototype(p.block, p.blocks);
        const label = procName(proto.proccode);
        const name = procNamer(label);
        const params = proto.argumentNames.map(a => String(a).replace(/[^A-Za-z0-9_]/g, '_') || 'arg');
        const resultVar = `${label}_result`;
        const returns = variablesUsedBySets(p.block.next, p.blocks).has(resultVar);
        procInfo.set(proto.proccode, {name, params, proto, resultVar, returns});
    }
    const resultVars = new Set([...procInfo.values()].filter(i => i.returns).map(i => i.resultVar));
    // Which scripts touch each variable, to tell a proc's own from a shared one.
    const scripts = [...flags, ...procs].map(sc => ({sc, vars: variablesUsed(sc.block.next, sc.blocks)}));
    const localNames = new Set();
    for (const p of procs) {
        const info = procInfo.get(procPrototype(p.block, p.blocks).proccode);
        const label = procName(info.proto.proccode);
        info.locals = new Map();
        for (const v of variablesUsed(p.block.next, p.blocks)) {
            if (resultVars.has(v) || !writtenFirst(p.block.next, p.blocks, v)) continue;
            const own = v.startsWith(`${label}_`);
            const shared = scripts.some(x => x.sc !== p && x.vars.has(v));
            if (!own && shared) continue;
            // The reader names a proc's locals <proc>_<name>; write them so.
            info.locals.set(v, own ? v.replace(/[^A-Za-z0-9_]/g, '_') : `${label}_${v}`.replace(/[^A-Za-z0-9_]/g, '_'));
            localNames.add(v);
        }
        const globals = [...variablesUsed(p.block.next, p.blocks)]
            .filter(v => !resultVars.has(v) && !info.locals.has(v));
        if (globals.length) {
            refuse(`custom block "${info.name}" uses the variable(s) ${globals.join(', ')} — ` +
                'a partcl proc sees only its own arguments (there is no global/upvar)');
        }
    }

    // A variable's Tcl name: a proc's own local, or the global.
    const vn = (name, ctx) => (ctx && ctx.locals && ctx.locals.has(name) ? ctx.locals.get(name) : varName(name));

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
    const word = (input, blocks, ctx, top = false) => {
        const d = decodeInput(input, blocks);
        switch (d.kind) {
        case 'num': return num(d.value);
        case 'str': return literalWord(d.value, warn, top);
        case 'var': return `$${vn(d.name, ctx)}`;
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
        if (d.kind === 'var') { out.push(`[set ${vn(d.name, ctx)}]`); return; }
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
        case 'planetemaths_pow': used.add('pow'); return op2('pow', 'NUM1', 'NUM2');
        case 'operator_mathop': {
            const op = field(b, 'OPERATOR').toLowerCase();
            if (op === 'abs') { used.add('abs'); return bracket(`abs ${w('NUM')}`); }
            if (op === 'floor' || op === 'ceiling') {
                warn(`partcl numbers are integers already: ${op} of x is x`);
                return w('NUM');
            }
            refuse(`partcl has no ${op} (integers only, no math library)`);
            return '0';
        }
        case 'operator_join': {
            const parts = [];
            joinParts(b.inputs.STRING1, blocks, ctx, parts);
            joinParts(b.inputs.STRING2, blocks, ctx, parts);
            return parts.join('') === '' ? '{}' : `"${parts.join('')}"`;
        }
        case 'argument_reporter_string_number':
        case 'argument_reporter_boolean': {
            const name = field(b, 'VALUE');
            const params = ctx.params || [];
            const i = (ctx.argNames || []).indexOf(name);
            return `$${i >= 0 ? params[i] : name}`;
        }
        case 'data_variable': return `$${vn(field(b, 'VARIABLE'), ctx)}`;
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
            // set f_result X; stop this script — or last in f's body — is return X.
            if (ctx.resultVar && b.opcode === 'data_setvariableto' && field(b, 'VARIABLE') === ctx.resultVar) {
                const next = blocks[b.next];
                const stops = next && next.opcode === 'control_stop' && field(next, 'STOP_OPTION') === 'this script';
                if (stops || (!next && depth === 1)) {
                    out.push(`${pad(depth)}return ${word(b.inputs.VALUE, blocks, ctx)}`);
                    b = stops ? blocks[next.next] : null;
                    continue;
                }
            }
            // f calling itself, then stop: return [f …] (its result is ours).
            if (ctx.resultVar && b.opcode === 'procedures_call') {
                const info = procInfo.get(String((b.mutation || {}).proccode));
                const next = blocks[b.next];
                if (info && info.resultVar === ctx.resultVar && next && next.opcode === 'control_stop' &&
                    field(next, 'STOP_OPTION') === 'this script') {
                    const args = info.proto.argumentIds.map(id => (b.inputs[id] ? word(b.inputs[id], blocks, ctx) : '{}'));
                    out.push(`${pad(depth)}return ${bracket([info.name, ...args].join(' '))}`);
                    b = blocks[next.next];
                    continue;
                }
            }
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
            out.push(`${p}set ${vn(field(b, 'VARIABLE'), ctx)} ${word(b.inputs.VALUE, blocks, ctx, true)}`);
            return;
        case 'data_changevariableby': {
            const n = vn(field(b, 'VARIABLE'), ctx);
            out.push(`${p}set ${n} ${bracket(`+ $${n} ${w('VALUE')}`)}`);
            return;
        }
        case 'looks_say': case 'looks_think': case 'stc12_print':
            out.push(`${p}puts ${word(b.inputs[b.inputs.MESSAGE ? 'MESSAGE' : 'VALUE'], blocks, ctx, true)}`);
            return;
        case 'looks_sayforsecs': case 'looks_thinkforsecs':
            used.add('wait');
            warn('partcl has no clock: wait is a no-op');
            out.push(`${p}puts ${word(b.inputs.MESSAGE, blocks, ctx, true)}`, `${p}wait ${w('SECS')}`);
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
                // Leaving a block that returns: its result is whatever this
                // frame last put in <name>_result (a call's, or a set's).
                out.push(ctx.resultVar ? `${p}return $${vn(ctx.resultVar, ctx)}` : `${p}return`);
                return;
            }
            refuse(`partcl cannot "stop ${opt}"${ctx.inProc ? ' from inside a custom block' : ''}`);
            return;
        }
        case 'procedures_call': {
            const info = procInfo.get(String((b.mutation || {}).proccode));
            if (!info) { refuse(`call of an undefined custom block "${(b.mutation || {}).proccode}"`); return; }
            const ids = info.proto.argumentIds;
            const args = ids.map(id => (b.inputs[id] ? word(b.inputs[id], blocks, ctx, !info.returns) : '{}'));
            const call = [info.name, ...args].join(' ');
            out.push(info.returns ? `${p}set ${varName(info.resultVar)} ${bracket(call)}` : `${p}${call}`);
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
        const ctx = {inProc: true, params: info.params, argNames: proto.argumentNames,
            resultVar: info.returns ? info.resultVar : null, locals: info.locals};
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
            if (localNames.has(name)) continue;   // a proc's own, set before use
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
// Tcl → pseudocode
// ======================================================================
//
// The reader takes partcl (what the generator writes) AND real Tcl 8.x (what
// a person brings from the wiki or Rosetta Code): `expr`, `incr`, `for`,
// `if … then … elseif … else`, backslash escapes, `${name}`, default
// arguments. A construct with no block is left as `# unsupported: <cmd>` and
// named in a warning; the rest of the program still comes through.

class TclReadError extends Error {}

const BACKSLASH = {n: '\n', t: '\t', r: '\r', a: '\x07', b: '\b', f: '\f', v: '\v'};

/**
 * Split a script into commands of words, the way Tcl's parser does for the
 * forms the reader handles: {braced}, "quoted" and bare words with $var,
 * ${var}, [cmd] and backslash substitutions, newline/`;` separators, and a
 * `#` comment where a command would start. Each word and command carries the
 * line it starts on, counted from `baseLine` so a nested body reports lines
 * of the original source.
 */
function parseScript (src, baseLine = 1, partcl = false) {
    const cmds = [];
    let i = 0;
    let line = baseLine;
    let words = [];
    let startLine = baseLine;
    const n = src.length;
    const endCmd = () => {
        if (words.length) cmds.push({words, line: startLine});
        words = [];
    };
    const matchClose = (open, close, from) => {
        let depth = 0;
        for (let j = from; j < n; j++) {
            if (src[j] === '\\' && !partcl) { j++; continue; }
            if (src[j] === open) depth++;
            else if (src[j] === close && --depth === 0) return j;
        }
        throw new TclReadError(`line ${line}: unbalanced ${open}`);
    };
    // One backslash sequence at src[i] (the `\`): its text, and the new index.
    const backslash = () => {
        const c = src[i + 1];
        if (c === undefined) return ['\\', i + 1];
        if (c === '\n') {
            line++;
            let j = i + 2;
            while (src[j] === ' ' || src[j] === '\t') j++;
            return [' ', j];
        }
        if (BACKSLASH[c]) return [BACKSLASH[c], i + 2];
        let m;
        if (c === 'u' && (m = /^[0-9a-fA-F]{1,4}/.exec(src.slice(i + 2)))) return [String.fromCharCode(parseInt(m[0], 16)), i + 2 + m[0].length];
        if (c === 'x' && (m = /^[0-9a-fA-F]{1,2}/.exec(src.slice(i + 2)))) return [String.fromCharCode(parseInt(m[0], 16)), i + 2 + m[0].length];
        return [c, i + 2];
    };
    // Parts of a quoted or bare word: literal text, $var, [cmd].
    const readParts = stop => {
        const parts = [];
        let lit = '';
        const flush = () => { if (lit) { parts.push({lit}); lit = ''; } };
        while (i < n && !stop(src[i])) {
            const c = src[i];
            if (c === '\\' && !partcl) {
                const [text, j] = backslash();
                lit += text;
                i = j;
            } else if (c === '$') {
                const rest = src.slice(i);
                const m = /^\$\{([^}]*)\}/.exec(rest) || /^\$((?:::)?[A-Za-z0-9_]+(?:::[A-Za-z0-9_]+)*)/.exec(rest);
                if (!m) { lit += c; i++; continue; }
                flush();
                i += m[0].length;
                if (src[i] === '(') {
                    // An array element: unsupported, but only for its command.
                    parts.push({bad: `array element $${m[1]}(…) — blocks have no Tcl arrays`});
                    i = matchClose('(', ')', i) + 1;
                    continue;
                }
                parts.push({var: m[1].replace(/^::/, '')});
            } else if (c === '[') {
                const j = matchClose('[', ']', i);
                flush();
                parts.push({cmd: src.slice(i + 1, j), line});
                line += (src.slice(i, j).match(/\n/g) || []).length;
                i = j + 1;
            } else {
                if (c === '\n') line++;
                lit += c;
                i++;
            }
        }
        flush();
        return parts;
    };
    while (i < n) {
        const c = src[i];
        if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
        if (c === '\\' && src[i + 1] === '\n' && !partcl) { i = backslash()[1]; continue; }
        if (c === '\n' || c === ';') { if (c === '\n') line++; endCmd(); i++; continue; }
        if (!words.length) startLine = line;
        if (c === '#' && !words.length) {
            let j = i;
            // A comment runs to an unescaped newline.
            while (j < n && src[j] !== '\n') j += src[j] === '\\' && !partcl ? 2 : 1;
            cmds.push({words: [{comment: src.slice(i + 1, j).trim()}], line});
            line += (src.slice(i, j).match(/\n/g) || []).length;
            i = j;
            continue;
        }
        if (c === '{' && src.startsWith('{*}', i) && src[i + 3] && !/\s/.test(src[i + 3])) {
            words.push({bad: '{*} argument expansion — blocks take a fixed argument list', parts: [], line});
            i += 3;
            continue;
        }
        if (c === '{') {
            const j = matchClose('{', '}', i);
            // Tcl substitutes backslash-newline even inside braces.
            const raw = src.slice(i + 1, j);
            const text = partcl ? raw : raw.replace(/\\\n[ \t]*/g, ' ');
            words.push({brace: text, line});
            line += (raw.match(/\n/g) || []).length - (text.match(/\n/g) || []).length;
            line += (text.match(/\n/g) || []).length;
            i = j + 1;
        } else if (c === '"') {
            i++;
            const parts = readParts(ch => ch === '"');
            if (src[i] !== '"') throw new TclReadError(`line ${line}: unclosed "`);
            i++;
            words.push({parts, quoted: true, line});
        } else {
            words.push({parts: readParts(ch => ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n' || ch === ';'), line});
        }
    }
    endCmd();
    return cmds;
}

/** A Tcl list's elements (braces group, quotes group, backslashes escape). */
function parseList (text) {
    const cmds = parseScript(String(text).replace(/[\n;]/g, ' '));
    return cmds.length ? cmds[0].words : [];
}

const pseudoString = s => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    .replace(/\n/g, '\\n').replace(/\t/g, '\\t').replace(/\r/g, '\\r')}"`;
const isNumber = s => /^-?\d+(\.\d+)?$/.test(s);
// Variables pseudocode would read as something else.
const PSEUDO_CLASH = new Set(['x', 'y']);
const identifier = s => {
    const n = String(s).replace(/^::/, '').replace(/::/g, '_').replace(/[^A-Za-z0-9_]/g, '_');
    return /^[A-Za-z_]/.test(n) ? n : `p${n}`;
};

// ---- expr --------------------------------------------------------------
//
// Tcl's expression language, to pseudocode. Precedence from expr(n):
// unary, **, * / %, + -, << >>, < > <= >=, == !=, eq ne, in ni, &, ^, |,
// &&, ||, ?:. What blocks cannot say (bit operators, **, ?:, in/ni, most
// functions) throws by name.
const EXPR_FUNCS = {abs: 'abs', floor: 'floor', ceil: 'ceiling', sqrt: 'sqrt'};

function tokenizeExpr (text) {
    const toks = [];
    let i = 0;
    const n = text.length;
    while (i < n) {
        const c = text[i];
        if (/\s/.test(c)) { i++; continue; }
        const rest = text.slice(i);
        let m;
        if ((m = /^(0x[0-9a-fA-F]+|\d+\.?\d*(?:[eE][-+]?\d+)?|\.\d+(?:[eE][-+]?\d+)?)/.exec(rest))) {
            toks.push({num: String(Number(m[0]))});
            i += m[0].length;
        } else if (c === '$') {
            m = /^\$\{([^}]*)\}/.exec(rest) || /^\$((?:::)?[A-Za-z0-9_]+(?:::[A-Za-z0-9_]+)*)/.exec(rest);
            if (!m) throw new TclReadError(`expr: stray $ in "${text}"`);
            if (text[i + m[0].length] === '(') throw new TclReadError('array element in expr — blocks have no Tcl arrays');
            toks.push({var: m[1].replace(/^::/, '')});
            i += m[0].length;
        } else if (c === '[') {
            let depth = 0;
            let j = i;
            for (; j < n; j++) {
                if (text[j] === '\\') { j++; continue; }
                if (text[j] === '[') depth++;
                else if (text[j] === ']' && --depth === 0) break;
            }
            if (j >= n) throw new TclReadError('expr: unbalanced [');
            toks.push({cmd: text.slice(i + 1, j)});
            i = j + 1;
        } else if (c === '"' || c === '{') {
            const w = parseScript(rest)[0];
            if (!w) throw new TclReadError('expr: unclosed string');
            // Re-lex just this word to know where it ends.
            const close = c === '"' ? '"' : '}';
            let depth = 0;
            let j = i;
            for (; j < n; j++) {
                if (text[j] === '\\') { j++; continue; }
                if (c === '{' && text[j] === '{') depth++;
                else if (text[j] === close && (c === '"' ? j > i : --depth === 0)) break;
            }
            toks.push({word: w.words[0]});
            i = j + 1;
        } else if ((m = /^(\*\*|==|!=|<=|>=|&&|\|\||<<|>>|eq\b|ne\b|in\b|ni\b)/.exec(rest))) {
            toks.push({op: m[0]});
            i += m[0].length;
        } else if ('+-*/%<>!~?:(),&|^'.includes(c)) {
            toks.push({op: c});
            i++;
        } else if ((m = /^[A-Za-z_][A-Za-z0-9_:]*/.exec(rest))) {
            toks.push({ident: m[0]});
            i += m[0].length;
        } else {
            throw new TclReadError(`expr: cannot read "${rest.slice(0, 12)}"`);
        }
    }
    return toks;
}

// After `abs of` / `round` the dialect reads `-4` as subtraction from the
// words before it (`abs of -4` is the variable "abs of" minus 4).
const neg = v => (/^-/.test(v) ? `(${v})` : v);

const LEVELS = [['||'], ['&&'], ['|'], ['^'], ['&'], ['in', 'ni'], ['eq', 'ne'], ['==', '!='],
    ['<', '>', '<=', '>='], ['<<', '>>'], ['+', '-'], ['*', '/', '%']];
const BINARY = {
    '||': (a, b) => `(${a} or ${b})`, '&&': (a, b) => `(${a} and ${b})`,
    eq: (a, b) => `(${a} = ${b})`, ne: (a, b) => `(not (${a} = ${b}))`,
    '==': (a, b) => `(${a} = ${b})`, '!=': (a, b) => `(not (${a} = ${b}))`,
    '<': (a, b) => `(${a} < ${b})`, '>': (a, b) => `(${a} > ${b})`,
    '<=': (a, b) => `(not (${a} > ${b}))`, '>=': (a, b) => `(not (${a} < ${b}))`,
    '+': (a, b) => `(${a} + ${b})`, '-': (a, b) => `(${a} - ${b})`,
    '*': (a, b) => `(${a} * ${b})`, '/': (a, b) => `(${a} / ${b})`, '%': (a, b) => `(${a} mod ${b})`
};

/** Parse tokens to pseudocode; `atom` renders $var / [cmd] / words in the caller's scope. */
function exprToPseudo (toks, atom) {
    let k = 0;
    const peek = () => toks[k];
    const isOp = (t, ops) => t && t.op !== undefined && ops.includes(t.op);
    const level = d => {
        if (d === LEVELS.length) return unary();
        let left = level(d + 1);
        while (isOp(peek(), LEVELS[d])) {
            const op = toks[k++].op;
            const right = level(d + 1);
            if (!BINARY[op]) throw new TclReadError(`expr operator ${op} has no block`);
            left = BINARY[op](left, right);
        }
        return left;
    };
    const ternary = () => {
        const c = level(0);
        if (isOp(peek(), ['?'])) throw new TclReadError('expr ?: has no block (use if)');
        return c;
    };
    const unary = () => {
        const t = peek();
        if (isOp(t, ['-'])) {
            k++;
            const v = unary();
            return /^\d/.test(v) ? `-${v}` : `(0 - ${v})`;
        }
        if (isOp(t, ['+'])) { k++; return unary(); }
        if (isOp(t, ['!'])) { k++; return `(not ${unary()})`; }
        if (isOp(t, ['~'])) throw new TclReadError('expr operator ~ has no block');
        const base = primary();
        if (isOp(peek(), ['**'])) {
            k++;
            return `(${base} to the power of ${neg(unary())})`;
        }
        return base;
    };
    const primary = () => {
        const t = toks[k++];
        if (!t) throw new TclReadError('expr ends early');
        if (t.num !== undefined) return t.num;
        if (t.op === '(') {
            const v = ternary();
            if (!isOp(toks[k++], [')'])) throw new TclReadError('expr: missing )');
            return v;
        }
        if (t.ident !== undefined) {
            const name = t.ident.replace(/^(::)?tcl::mathfunc::/, '');
            if (/^(true|yes|on)$/i.test(name)) return '(1 = 1)';
            if (/^(false|no|off)$/i.test(name)) return '(1 = 0)';
            if (!isOp(peek(), ['('])) throw new TclReadError(`expr: bare word "${name}"`);
            k++;
            const args = [];
            if (!isOp(peek(), [')'])) {
                args.push(ternary());
                while (isOp(peek(), [','])) { k++; args.push(ternary()); }
            }
            if (!isOp(toks[k++], [')'])) throw new TclReadError(`expr: ${name}( not closed`);
            if (EXPR_FUNCS[name] && args.length === 1) return `(${EXPR_FUNCS[name]} of ${neg(args[0])})`;
            if (name === 'round' && args.length === 1) return `(round ${neg(args[0])})`;
            if ((name === 'double' || name === 'wide' || name === 'entier') && args.length === 1) return args[0];
            if (name === 'int' && args.length === 1) return `(floor of ${neg(args[0])})`;
            throw new TclReadError(`expr function ${name}() has no block`);
        }
        if (t.op !== undefined) throw new TclReadError(`expr: unexpected ${t.op}`);
        return atom(t);
    };
    const v = ternary();
    if (k !== toks.length) throw new TclReadError('expr: trailing tokens');
    return v;
}

// Commands partcl evaluates as a condition (`if {< $a 3}`); anything else
// in a condition is a real-Tcl expression (`if {$a < 3}`).
const PARTCL_COND = new Set(['+', '-', '*', '/', '>', '<', '>=', '<=', '==', '!=', 'not', 'and', 'or', 'mod', 'abs', 'pow', 'set']);

/**
 * Tcl → pseudocode (the importer's reader contract: returns
 * {pseudocode, warnings} or throws).
 */
export default function tclToPseudocode (source) {
    const text = String(source || '');
    // What the generator wrote is partcl, where a backslash is just a
    // character; anything else is read as real Tcl, where it escapes.
    const partcl = /^# --- program ---$/m.test(text);
    const parse = (src, line) => parseScript(src, line, partcl);
    const warnings = [];
    const globals = new Set();
    const procs = [];
    const userProcs = new Map();   // Tcl name → {name, params, defaults}
    const rename = name => {
        if (PSEUDO_CLASH.has(name)) {
            const w = `variable "${name}" renamed to "${name}_var" (pseudocode reads "set ${name}" as motion)`;
            if (!warnings.includes(w)) warnings.push(w);
            return `${name}_var`;
        }
        return identifier(name);
    };
    const procOf = head => (head !== null && userProcs.has(head.replace(/^::/, '')) ? userProcs.get(head.replace(/^::/, '')) : null);

    // ---- expressions -------------------------------------------------
    const exprOfCmd = (text, scope, line) => {
        const cmds = parse(text, line);
        if (cmds.length !== 1) throw new TclReadError(`[${text.trim().slice(0, 30)}] is not one command`);
        return exprOfWords(cmds[0].words, scope);
    };
    const exprOfParts = (parts, scope, quoted) => {
        const pieces = parts.map(p => {
            if (p.bad !== undefined) throw new TclReadError(p.bad);
            if (p.var !== undefined) return varRef(p.var, scope);
            if (p.cmd !== undefined) return exprOfCmd(p.cmd, scope, p.line);
            if (!quoted && isNumber(p.lit) && parts.length === 1) return p.lit;
            return pseudoString(p.lit);
        });
        if (!pieces.length) return '""';
        return pieces.reduce((a, b) => `(${a} join ${b})`);
    };
    // A Tcl proc's variables are its own unless declared `global`: they
    // read as `<proc>_<name>`, so two procs' `i` stay two variables in blocks
    // too. A parameter the body assigns to is copied into such a variable
    // first (blocks cannot assign to an argument). `<proc>_result` names are
    // the return-value convention and are shared.
    const resolve = (name, scope) => {
        const bare = name.replace(/^::/, '');
        if (scope.proc && !name.startsWith('::')) {
            if (scope.alias && scope.alias.has(bare)) return scope.alias.get(bare);
            if (scope.params.includes(bare)) return null;
            if (!scope.globalsDeclared.has(bare) && !isResultVar(bare) && !bare.startsWith(`${scope.proc}_`)) {
                return identifier(`${scope.proc}_${bare}`);
            }
        }
        return rename(bare);
    };
    const isResultVar = n => /_result$/.test(n) && [...userProcs.values()].some(pr => `${pr.name}_result` === n);
    const varRef = (name, scope) => {
        const v = resolve(name, scope);
        if (v === null) return name.replace(/^::/, '');
        globals.add(v);
        return v;
    };
    const target = (name, scope) => {
        const v = resolve(name, scope);
        if (v === null) throw new TclReadError(`assigning to the argument "${name}" — blocks cannot`);
        globals.add(v);
        return v;
    };
    const exprOfWord = (w, scope) => {
        if (w.brace !== undefined) return isNumber(w.brace) ? w.brace : pseudoString(w.brace);
        return exprOfParts(w.parts, scope, w.quoted);
    };
    // A real-Tcl expression, from its text (`expr {…}`, `if {…}`).
    const exprOfText = (text, scope, line) => exprToPseudo(tokenizeExpr(text), t => {
        if (t.var !== undefined) return varRef(t.var, scope);
        if (t.cmd !== undefined) return exprOfCmd(t.cmd, scope, line);
        return exprOfWord(t.word, scope);
    });
    // `expr $a * 2` (unbraced): the words, substituted, are the expression.
    const wordSource = w => {
        if (w.brace !== undefined) return `{${w.brace}}`;
        const body = w.parts.map(p => (p.var !== undefined ? `\${${p.var}}` : p.cmd !== undefined ? `[${p.cmd}]` : p.lit)).join('');
        return w.quoted ? `"${body}"` : body;
    };
    const BIN = {'+': '+', '-': '-', '*': '*', '/': '/', mod: 'mod', '>': '>', '<': '<', '==': '=', and: 'and', or: 'or'};
    const NEG = {'>=': '<', '<=': '>', '!=': '='};
    const exprOfWords = (words, scope) => {
        const head = bareText(words[0]);
        const args = () => words.slice(1).map(w => exprOfWord(w, scope));
        if (head === 'expr' && words.length === 2 && words[1].parts && !words[1].parts.every(x => x.lit !== undefined)) {
            // `expr $f` evaluates the expression that $f HOLDS — an eval.
            throw new TclReadError('expr of a computed expression (an eval) — blocks need the expression written out');
        }
        if (head === 'expr' && words.length >= 2) {
            const text = words.length === 2 && words[1].brace !== undefined ? words[1].brace :
                words.slice(1).map(wordSource).join(' ');
            return exprOfText(text, scope, words[0].line);
        }
        if (BIN[head] && words.length === 3) { const a = args(); return `(${a[0]} ${BIN[head]} ${a[1]})`; }
        if (NEG[head] && words.length === 3) { const a = args(); return `(not (${a[0]} ${NEG[head]} ${a[1]}))`; }
        if (head === 'not' && words.length === 2) return `(not ${args()[0]})`;
        if (head === 'abs' && words.length === 2) return `(abs of ${neg(args()[0])})`;
        if (head === 'pow' && words.length === 3) { const a = args(); return `(${a[0]} to the power of ${neg(a[1])})`; }
        if (head === 'set' && words.length === 2) return varRef(bareText(words[1]), scope);
        if (procOf(head)) return hoistCall(procOf(head), words.slice(1), scope);
        throw new TclReadError(head === null ? 'a computed command name ($cmd or [cmd] as the command)' :
            `no block for the Tcl command [${head}]`);
    };
    // [f a b] used for its value: the call runs as a statement just before
    // the one that uses it, and the value is read from f_result. Two calls to
    // the same proc in one expression would overwrite each other's result
    // (the blocks have no locals to keep the first), so that is refused.
    const hoistCall = (proc, argWords, scope) => {
        if (!scope.hoist) throw new TclReadError(`[${proc.name} …] used for its value here — blocks have no reporter custom blocks`);
        const before = new Set(scope.pending);
        const args = callArgs(proc, argWords, scope);
        for (const q of [...scope.pending]) if (!before.has(q)) scope.pending.delete(q);
        if (scope.pending.has(proc.name)) {
            throw new TclReadError(`two results of ${proc.name} in one expression — the second call would overwrite the first`);
        }
        scope.hoist.push([proc.name, ...args].join(' '));
        scope.pending.add(proc.name);
        globals.add(`${proc.name}_result`);
        return `${proc.name}_result`;
    };
    // Run fn with a fresh hoist list; return [its value, the hoisted calls].
    const withHoist = (scope, fn) => {
        const saved = [scope.hoist, scope.pending];
        scope.hoist = [];
        scope.pending = new Set();
        try {
            const v = fn();
            return [v, scope.hoist];
        } finally {
            [scope.hoist, scope.pending] = saved;
        }
    };
    // A condition: partcl's command form, or a real-Tcl expression.
    const condOf = (w, scope) => {
        if (w.brace === undefined) {
            // `if $done …` / `while [more]` — an unbraced expression.
            return exprOfText(wordSource(w), scope, w.line);
        }
        const text = w.brace;
        const cmds = parse(text, w.line);
        const head = cmds.length === 1 ? bareText(cmds[0].words[0]) : null;
        if (cmds.length === 1 && (PARTCL_COND.has(head) || (procOf(head) && cmds[0].words.length > 1))) {
            return exprOfWords(cmds[0].words, scope);
        }
        const v = exprOfText(text, scope, w.line);
        if (isNumber(v)) return Number(v) ? '(1 = 1)' : '(1 = 0)';
        return v;
    };

    // ---- statements --------------------------------------------------
    const pad = d => '  '.repeat(d);
    const block = (w, scope, depth) => statements(parse(w.brace, w.line), scope, depth);
    const callArgs = (proc, a, scope) => {
        if (a.length > proc.params.length) throw new TclReadError(`${proc.name} called with ${a.length} arguments, takes ${proc.params.length}`);
        const out = a.map(w => exprOfWord(w, scope));
        for (let i = a.length; i < proc.params.length; i++) {
            if (proc.defaults[i] === undefined) throw new TclReadError(`${proc.name} called without its argument "${proc.params[i]}"`);
            out.push(isNumber(proc.defaults[i]) ? proc.defaults[i] : pseudoString(proc.defaults[i]));
        }
        return out.map(e => (/^[\w.-]+$|^".*"$|^\(.*\)$/s.test(e) ? e : `(${e})`));
    };
    // `tail`: these commands end a proc body, so the last one's value is the
    // proc's result (Tcl returns the value of a proc's last command).
    const statements = (cmds, scope, depth, tail = false) => {
        const out = [];
        const p = pad(depth);
        let last = cmds.length - 1;
        while (last >= 0 && cmds[last].words[0].comment !== undefined) last--;
        for (let k = 0; k < cmds.length; k++) {
            const {words, line} = cmds[k];
            if (words[0].comment !== undefined) continue;
            const head = bareText(words[0]);
            const a = words.slice(1);
            const mark = out.length;
            try {
                const bad = words.find(w => w.bad) || words.flatMap(w => w.parts || []).find(x => x.bad);
                if (bad) throw new TclReadError(bad.bad);
                const atTail = tail && k === last && scope.proc;
                const [skip, hoisted] = withHoist(scope, () => (atTail && tailReturn(words, head, a, line) ? 0 :
                    statement(words, head, a, line, k)));
                out.splice(mark, 0, ...hoisted.map(h => `${p}${h}`));
                k += skip;
            } catch (e) {
                if (!(e instanceof TclReadError)) throw e;
                out.length = mark;
                warnings.push(`unsupported (line ${line}): ${e.message}`);
                out.push(`${p}# unsupported: ${String(head || 'command').replace(/\s+/g, ' ').slice(0, 30)}`);
            }
        }
        return out;

        // The last command of a proc, used as its value: `expr …`, a call
        // (when the proc is used for its value), or an if whose branches end
        // that way. Returns false to read it as an ordinary statement.
        function tailReturn (words, head, a, line) {
            const result = `${scope.proc}_result`;
            if (head === 'expr') {
                const value = exprOfWords(words, scope);
                globals.add(result);
                out.push(`${p}set ${result} to ${value}`, `${p}stop this script`);
                return true;
            }
            if (procOf(head) && usedForValue.has(scope.proc)) {
                const value = hoistCall(procOf(head), a, scope);
                globals.add(result);
                if (value !== result) out.push(`${p}set ${result} to ${value}`);
                out.push(`${p}stop this script`);
                return true;
            }
            if (head === 'if' && usedForValue.has(scope.proc)) {
                out.push(...ifChain(a, scope, depth, line, true));
                return true;
            }
            return false;
        }

        // One command; pushes onto `out` (k may advance past a consumed command).
        function statement (words, head, a, line, k) {
            {
                // REPEAT n, as the generator writes it:
                //   [set _nK <n>]  set _rK 0  while {< $_rK <n>|$_nK} {set _rK [+ $_rK 1]; …}
                const counter = head === 'set' && a.length === 2 && /^_r\d+$/.test(bareText(a[0]) || '') &&
                    bareText(a[1]) === '0' && cmds[k + 1] && bareText(cmds[k + 1].words[0]) === 'while' ?
                    repeatN(bareText(a[0]), cmds[k + 1], scope, depth) : null;
                if (counter) { out.push(...counter); return 1; }
                if (head === 'set' && a.length === 2) {
                    const name = bareText(a[0]);
                    if (name === null) throw new TclReadError('set of a computed variable name');
                    // set _nK <n> right before a counter loop is that loop's limit.
                    const next = cmds[k + 1] && cmds[k + 1].words;
                    if (/^_n\d+$/.test(name) && next && bareText(next[0]) === 'set' &&
                        /^_r\d+$/.test(bareText(next[1]) || '')) {
                        pendingLimit.set(name, exprOfWord(a[1], scope));
                        return 0;
                    }
                    if (/\(/.test(name)) throw new TclReadError(`array element ${name} — blocks have no Tcl arrays`);
                    const bare = name.replace(/^::/, '');
                    const to = target(name, scope);
                    const v = a[1];
                    // set n [+ $n X] → change n by X
                    if (v.parts && v.parts.length === 1 && v.parts[0].cmd !== undefined) {
                        const inner = parse(v.parts[0].cmd)[0];
                        if (inner && inner.words.length === 3 && bareText(inner.words[0]) === '+' &&
                            varOfWord(inner.words[1]) === bare) {
                            out.push(`${p}change ${to} by ${exprOfWord(inner.words[2], scope)}`);
                            return 0;
                        }
                    }
                    const value = exprOfWord(v, scope);
                    // set f_result [f …] is the call itself (the generator's form).
                    if (value === to && isResultVar(to)) return 0;
                    out.push(`${p}set ${to} to ${value}`);
                } else if (head === 'incr' && (a.length === 1 || a.length === 2) && bareText(a[0])) {
                    const to = target(bareText(a[0]), scope);
                    out.push(`${p}change ${to} by ${a.length === 2 ? exprOfWord(a[1], scope) : '1'}`);
                } else if (head === 'puts') {
                    out.push(...putsStmt(a, scope, p));
                } else if (head === 'wait' && a.length === 1) {
                    out.push(`${p}wait ${exprOfWord(a[0], scope)} secs`);
                } else if (head === 'after' && a.length === 1 && isNumber(bareText(a[0]) || '')) {
                    out.push(`${p}wait ${Number(bareText(a[0])) / 1000} secs`);
                } else if (head === 'while' && a.length === 2) {
                    out.push(...whileLoop(a[0], a[1], scope, depth));
                } else if (head === 'for' && a.length === 4) {
                    out.push(...forLoop(a, scope, depth));
                } else if (head === 'if') {
                    out.push(...ifChain(a, scope, depth, line));
                } else if (head === 'return' && a.length === 0) {
                    out.push(`${p}stop this script`);
                } else if (head === 'return' && a.length === 1 && scope.proc) {
                    // The return-value convention: f_result, then leave.
                    const value = exprOfWord(a[0], scope);
                    globals.add(`${scope.proc}_result`);
                    if (value !== `${scope.proc}_result`) out.push(`${p}set ${scope.proc}_result to ${value}`);
                    out.push(`${p}stop this script`);
                } else if (head === 'proc' && a.length === 3) {
                    if (!scope.top) throw new TclReadError('proc defined inside a body');
                    const name = bareText(a[0]);
                    if (HELPER_NAMES.has(name)) return 0;
                    const proc = procOf(name) || procSignature(name, a[1]);
                    procs.push({...proc, body: a[2], line});
                } else if (head === 'package' && bareText(a[0]) === 'require' && bareText(a[1]) === 'Tcl') {
                    return 0;   // the interpreter is the requirement
                } else if (head === 'global' && scope.proc) {
                    for (const w of a) scope.globalsDeclared.add(String(bareText(w)).replace(/^::/, ''));
                    return 0;
                } else if (procOf(head)) {
                    const proc = procOf(head);
                    out.push(`${p}${[proc.name, ...callArgs(proc, a, scope)].join(' ')}`);
                } else {
                    throw new TclReadError(head === null ? 'a computed command name ($cmd or [cmd] as the command)' :
                        `no block for the Tcl command "${head}"`);
                }
            }
            return 0;
        }
    };
    const putsStmt = (a, scope, p) => {
        let args = a;
        let newline = true;
        if (bareText(args[0]) === '-nonewline') { newline = false; args = args.slice(1); }
        if (args.length === 2) {
            const ch = bareText(args[0]);
            if (ch !== 'stdout') throw new TclReadError(`puts to ${ch || 'a channel'} — blocks say on the stage only`);
            args = args.slice(1);
        }
        if (args.length !== 1) throw new TclReadError('puts with these arguments');
        if (!newline) warnings.push('puts -nonewline read as say (which always ends the line)');
        return [`${p}say ${exprOfWord(args[0], scope)}`];
    };
    const procSignature = (rawName, paramsWord) => {
        const params = [];
        const defaults = [];
        for (const el of parseList(bareText(paramsWord) ?? '')) {
            if (el.brace !== undefined) {
                const [pn, dflt] = parseList(el.brace).map(bareText);
                params.push(identifier(pn));
                defaults.push(dflt ?? undefined);
            } else {
                params.push(identifier(bareText(el)));
                defaults.push(undefined);
            }
        }
        if (params.includes('args')) throw new TclReadError(`proc ${rawName} takes variadic args — a block has a fixed argument list`);
        return {name: identifier(rawName), params, defaults};
    };
    const pendingLimit = new Map();
    const repeatN = (counter, whileCmd, scope, depth) => {
        const [condW, bodyW] = whileCmd.words.slice(1);
        if (!condW || condW.brace === undefined || !bodyW || bodyW.brace === undefined) return null;
        const c = parse(condW.brace)[0];
        if (!c || c.words.length !== 3 || bareText(c.words[0]) !== '<' || varOfWord(c.words[1]) !== counter) return null;
        const bodyCmds = parse(bodyW.brace, bodyW.line);
        const first = bodyCmds[0];
        const inc = first && first.words.length === 3 && bareText(first.words[0]) === 'set' &&
            bareText(first.words[1]) === counter && first.words[2].parts && first.words[2].parts.length === 1 &&
            first.words[2].parts[0].cmd !== undefined ? parse(first.words[2].parts[0].cmd)[0] : null;
        if (!inc || bareText(inc.words[0]) !== '+' || varOfWord(inc.words[1]) !== counter ||
            bareText(inc.words[2]) !== '1') return null;
        const limitVar = varOfWord(c.words[2]);
        const limit = limitVar && pendingLimit.has(limitVar) ? pendingLimit.get(limitVar) : exprOfWord(c.words[2], scope);
        if (limitVar) pendingLimit.delete(limitVar);
        return [`${pad(depth)}REPEAT ${limit}:`, ...statements(bodyCmds.slice(1), scope, depth + 1)];
    };
    const loopBody = (w, scope, depth) => {
        if (w.brace === undefined) throw new TclReadError('a loop body that is not braced');
        const cmds = parse(w.brace, w.line);
        for (const c of cmds) {
            const h = bareText(c.words[0]);
            if (h === 'break' || h === 'continue') throw new TclReadError(`${h} — blocks have no ${h}`);
        }
        return statements(cmds, scope, depth);
    };
    const whileLoop = (condW, bodyW, scope, depth) => {
        const p = pad(depth);
        const inner = loopBody(bodyW, scope, depth + 1);
        if (condW.brace !== undefined) {
            const c = parse(condW.brace)[0];
            const words = c ? c.words : [];
            const t = words.map(bareText);
            if ((t.length === 3 && t[0] === '==' && t[1] === t[2] && isNumber(t[1])) ||
                (t.length === 1 && /^(\d+|true|yes|on)$/.test(t[0] || '') && t[0] !== '0')) {
                return [`${p}FOREVER:`, ...inner];
            }
            if (t[0] === 'not' && words.length === 2) {
                return [`${p}REPEAT UNTIL ${exprOfWord(words[1], scope)}:`, ...inner];
            }
        }
        // A condition that calls a proc re-runs that call at the end of each pass.
        const [c, calls] = withHoist(scope, () => condOf(condW, scope));
        if (c === '(1 = 1)' && !calls.length) return [`${p}FOREVER:`, ...inner];
        return [...calls.map(h => `${p}${h}`), `${p}REPEAT UNTIL ${negate(c)}:`, ...inner,
            ...calls.map(h => `${p}  ${h}`)];
    };
    // for {init} {cond} {next} {body} → init; REPEAT UNTIL not cond: body; next
    const forLoop = ([init, condW, next, bodyW], scope, depth) => {
        const p = pad(depth);
        if (init.brace === undefined || next.brace === undefined) throw new TclReadError('for with unbraced init/next');
        const head = statements(parse(init.brace, init.line), scope, depth);
        const step = statements(parse(next.brace, next.line), scope, depth + 1);
        const inner = loopBody(bodyW, scope, depth + 1);
        if ([...head, ...step].some(l => /# unsupported/.test(l))) throw new TclReadError('for with an init or step blocks cannot say');
        const [c, calls] = withHoist(scope, () => condOf(condW, scope));
        return [...head, ...calls.map(h => `${p}${h}`), `${p}REPEAT UNTIL ${negate(c)}:`, ...inner, ...step,
            ...calls.map(h => `${p}  ${h}`)];
    };
    // REPEAT UNTIL wants the stop condition: undo a leading not instead of
    // stacking a second one.
    const negate = c => {
        const m = /^\(not (.*)\)$/s.exec(c);
        if (m && balanced(m[1])) return m[1];
        return `(not ${c})`;
    };
    const ifChain = (a, scope, depth, line, tail = false) => {
        const p = pad(depth);
        if (a.length < 2) throw new TclReadError(`if needs a condition and a body (line ${line})`);
        let rest = a.slice(1);
        if (bareText(rest[0]) === 'then') rest = rest.slice(1);
        const out = [`${p}IF ${condOf(a[0], scope)} THEN:`, ...bodyOf(rest[0], scope, depth + 1, tail)];
        rest = rest.slice(1);
        if (!rest.length) return out;
        const kw = bareText(rest[0]);
        if (kw === 'else' && rest.length === 2) {
            out.push(`${p}ELSE:`, ...bodyOf(rest[1], scope, depth + 1, tail));
        } else if (kw === 'elseif' && rest.length >= 3) {
            out.push(`${p}ELSE:`, ...nestedIf(rest.slice(1), scope, depth + 1, line, tail));
        } else if (rest.length >= 2) {
            // partcl's native chain: if {c1} {b1} {c2} {b2} …
            out.push(`${p}ELSE:`, ...nestedIf(rest, scope, depth + 1, line, tail));
        } else {
            // `if {c} {a} {b}`: Tcl's else keyword is optional (and partcl
            // evaluates the lone word, which is the same when it returns).
            out.push(`${p}ELSE:`, ...bodyOf(rest[0], scope, depth + 1, tail));
        }
        return out;
    };
    // An elseif's condition calls its procs only when it is reached.
    const nestedIf = (a, scope, depth, line, tail = false) => {
        const [lines, calls] = withHoist(scope, () => ifChain(a, scope, depth, line, tail));
        return [...calls.map(h => `${pad(depth)}${h}`), ...lines];
    };
    const bodyOf = (w, scope, depth, tail = false) => {
        if (!w) throw new TclReadError('if without a body');
        if (w.brace !== undefined) return statements(parse(w.brace, w.line), scope, depth, tail);
        return statements([{words: [w], line: w.line || 0}], scope, depth, tail);
    };

    const top = parse(text);
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
    // Procs whose value something uses ([f …] anywhere): their last command
    // is their result.
    const usedForValue = new Set();
    // Register every proc first, so a call reads as a call wherever it sits.
    for (const c of main) {
        const w = c.words;
        const name = bareText(w[1]);
        if (bareText(w[0]) === 'proc' && w.length === 4 && name && !HELPER_NAMES.has(name)) {
            try {
                const sig = procSignature(name, w[2]);
                userProcs.set(name.replace(/^::/, ''), sig);
                const esc = name.replace(/^::/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                if (new RegExp(`\\[\\s*(::)?${esc}(\\s|\\])`).test(text)) usedForValue.add(sig.name);
            } catch (e) {
                if (!(e instanceof TclReadError)) throw e;
                warnings.push(`unsupported (line ${c.line}): ${e.message}`);
            }
        }
    }
    const mainLines = statements(main.filter(c => !(bareText(c.words[0]) === 'proc' &&
        bareText(c.words[1]) && !procOf(bareText(c.words[1])) && !HELPER_NAMES.has(bareText(c.words[1])))), {top: true}, 1);
    const procLines = [];
    for (const pr of procs) {
        const scope = {params: pr.params, proc: pr.name, globalsDeclared: new Set(), alias: new Map()};
        const bodyText = pr.body.brace !== undefined ? pr.body.brace : '';
        // A parameter the body assigns to becomes a variable, copied on entry.
        const copies = [];
        for (const q of pr.params) {
            if (new RegExp(`(^|[\\s;\\[{])(set|incr|append|lappend)\\s+${q}\\b`).test(bodyText)) {
                const v = identifier(`${pr.name}_${q}`);
                scope.alias.set(q, v);
                globals.add(v);
                copies.push(`  set ${v} to ${q}`);
            }
        }
        const bodyLines = [...copies, ...statements(parse(bodyText, pr.body.line), scope, 1, true)];
        procLines.push(`DEFINE ${[pr.name, ...pr.params.map(x => `(${x})`)].join(' ')}:`,
            // pseudocode refuses a DEFINE with no statement under it (a comment
            // is not one), and the generator writes the placeholder back.
            ...bodyLines, ...(bodyLines.some(l => !/^\s*#/.test(l)) ? [] : ['  wait 0 secs']), '');
    }
    const lines = [...[...globals].map(g => `GLOBAL ${g}`)];
    if (lines.length) lines.push('');
    lines.push(...procLines);
    if (mainLines.length) lines.push('WHEN flag clicked:', ...mainLines);
    if (!procLines.length && !mainLines.length && text.trim()) {
        warnings.push('no Tcl the blocks can represent was found');
    }
    return {pseudocode: `${lines.join('\n').replace(/\n+$/, '')}\n`, warnings};
}

/** Parentheses in s balance (so stripping an outer pair is safe). */
function balanced (s) {
    let d = 0;
    let q = false;
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (c === '\\' && q) { i++; continue; }
        if (c === '"') q = !q;
        else if (!q && c === '(') d++;
        else if (!q && c === ')' && --d < 0) return false;
    }
    return d === 0;
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
