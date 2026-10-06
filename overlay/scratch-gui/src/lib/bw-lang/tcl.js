/**
 * Blocks ⇄ Tcl for the Code tab's Tcl tab. The tab runs real Tcl: Jim Tcl on
 * the DOS bench (static/roms/jim.exe, DOS_TOOLCHAINS 'jim'), and what the
 * generator writes is ordinary Tcl 8 that tclsh runs the same way.
 *
 *   generateTcl(project)        blocks → Tcl          {ok, tcl, reasons, warnings}
 *   tclToPseudocode(source)     Tcl → pseudocode      {pseudocode, warnings} (default export)
 *
 * NOTHING IS DROPPED. A command the blocks have no form for (a dict, a regexp,
 * a namespace, a comment) is read as the grey `raw "<the command>"` block and
 * written back exactly as it was — the same lossless import the MicroPython
 * tab gives. So every program comes back through blocks as a program that
 * runs; what the blocks can SHOW grows as the mapping below grows.
 *
 * NAMES STAY THE PROGRAM'S. A raw command refers to variables by their Tcl
 * names, so the mapping never renames what it cannot rename back:
 *   - a proc's own variable `v` is `<proc>_v` in blocks (blocks have no
 *     locals; the prefix keeps two procs' `i` apart) and `v` again in Tcl;
 *   - names pseudocode reads as something else (`x`, `size`, `answer`,
 *     `true`, … in any case) are `name__` in blocks and `name` again in Tcl;
 *   - a name that is not a plain identifier keeps its whole command raw.
 *
 * LISTS. A variable list commands work on (lappend, lindex, llength, lset,
 * linsert, lreplace, foreach, in) and nothing writes otherwise is a Scratch
 * list; `foreach x $L` is a counter walking it, which the generator writes
 * back as foreach. Indices shift by one (Tcl from 0, Scratch from 1).
 *
 * TRUTH. Tcl's `if {$v}` is false for 0 and false; it reads as
 * not ((v = 0) or (v = "false")) and is written back as `if {$v}`. A
 * condition used as a VALUE stays raw: pseudocode reads it as text there.
 *
 * RETURN VALUES. Blocks have none: `return X` in proc f is `set f_result to
 * X; stop this script`, a call used for its value runs just before the
 * statement that reads f_result, and the generator turns both back into
 * `return X` and `set f_result [f …]`.
 *
 * The reader also still reads what the earlier partcl generator wrote (a
 * file starting `proc # {} {}`), where a backslash is just a character.
 */
import {collectScripts, decodeInput, field, procName, procPrototype, substackId, variablesUsed} from './project-walk.js';

const MARK_VARS = '# --- variables ---';
const MARK_PROGRAM = '# --- program ---';
// Loop counters the generator introduces (repeat, foreach): never initialised,
// always local to the proc they are in.
const COUNTER = /^_[rnf]\d+$/;
// Names pseudocode reads as something else (`set x …` is motion, `size` the
// sprite's size, `answer` the ask reply, `true` a literal…): the reader
// renames them `name__`, the generator undoes it.
const CLASHING = ['x', 'y', 'size', 'volume', 'tempo', 'username', 'timer', 'answer', 'loudness',
    'true', 'false', 'join'];
// (pseudocode matches them in any case: SIZE and Username clash too)
const clashIn = n => (CLASHING.includes(n.toLowerCase()) ? `${n}__` : null);
const clashOut = n => (/__$/.test(n) && CLASHING.includes(n.slice(0, -2).toLowerCase()) ? n.slice(0, -2) : null);
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const TCL_INDENT = '    ';

/** A Tcl word for a literal: bare when that is safe, else a quoted string. */
function tclLiteral (text) {
    const s = String(text);
    if (s === '') return '{}';
    if (/^-?\d+(\.\d+)?(e[-+]?\d+)?$/i.test(s)) return s;
    if (/^[A-Za-z0-9_.,:+\-/=@]+$/.test(s)) return s;
    return quoteTcl(s);
}

/**
 * A double-quoted Tcl string with the characters Tcl substitutes escaped —
 * and the braces, which would unbalance a proc or loop body around it.
 */
const quoteTcl = s => `"${String(s).replace(/[\\"$[\]{}]/g, '\\$&').replace(/\n/g, '\\n').replace(/\t/g, '\\t')
    .replace(/\r/g, '\\r')}"`;

/** The text inside a quoted string (for a join's literal parts). */
const quoteInner = s => quoteTcl(s).slice(1, -1);

/**
 * Blocks → Tcl.
 * @param {object} project serialized SB3 project (vm.toJSON() / creator.project)
 * @returns {{ok: boolean, tcl: string, reasons: string[], warnings: string[]}}
 */
export function generateTcl (project) {
    const reasons = [];
    const warnings = [];
    const warn = w => { if (!warnings.includes(w)) warnings.push(w); };
    const refuse = r => { if (!reasons.includes(r)) reasons.push(r); };
    let loopSeq = 0;

    // ---- names ----------------------------------------------------------
    const tclNames = new Map();
    const takenNames = new Set();
    const tclName = raw => {
        const key = String(raw);
        if (tclNames.has(key)) return tclNames.get(key);
        let n = clashOut(key) || key;
        if (!IDENT.test(n)) {
            n = n.replace(/[^A-Za-z0-9_]/g, '_');
            if (!/^[A-Za-z_]/.test(n)) n = `v${n}`;
            warn(`variable "${key}" is "${n}" in Tcl (a Tcl name is letters, digits and _)`);
        }
        while (takenNames.has(n)) n += '_';
        takenNames.add(n);
        tclNames.set(key, n);
        return n;
    };

    const {flags, procs, other} = collectScripts(project);
    if (flags.length > 1) {
        refuse(`Tcl runs one script at a time: this project has ${flags.length} "when flag clicked" scripts`);
    }
    for (const o of other) {
        if (/^(argument_|procedures_prototype)/.test(o.block.opcode)) continue;
        refuse(`no Tcl form for the script starting with ${o.block.opcode}`);
    }

    // ---- custom blocks: name, params, return value, locals --------------
    const scripts = [...flags, ...procs].map(sc => ({sc, vars: variablesUsed(sc.block.next, sc.blocks)}));
    const procInfo = new Map();
    for (const p of procs) {
        const proto = procPrototype(p.block, p.blocks);
        const label = procName(proto.proccode);
        const params = proto.argumentNames.map(a => (IDENT.test(String(a)) ? String(a) : String(a).replace(/[^A-Za-z0-9_]/g, '_') || 'arg'));
        const resultVar = `${label}_result`;
        procInfo.set(proto.proccode, {
            name: IDENT.test(label) ? label : label.replace(/[^A-Za-z0-9_]/g, '_'),
            label, params, proto, resultVar,
            // it sets <label>_result, or something reads it (a raw
            // `return …` in the body is the value then)
            returns: setsVariable(p.block.next, p.blocks, resultVar) || scripts.some(x => x.vars.has(resultVar))
        });
    }
    const resultVars = new Set([...procInfo.values()].filter(i => i.returns).map(i => i.resultVar));
    const localNames = new Set();
    for (const p of procs) {
        const info = procInfo.get(procPrototype(p.block, p.blocks).proccode);
        const used = variablesUsed(p.block.next, p.blocks);
        // A proc's own variable: <label>_v (the reader's naming) or a loop
        // counter, used by no other script. In Tcl it is the local `v`.
        info.locals = new Map();
        for (const v of used) {
            const shared = scripts.some(x => x.sc !== p && x.vars.has(v));
            if (COUNTER.test(v) && !shared) { info.locals.set(v, v); localNames.add(v); continue; }
            if (resultVars.has(v) || shared || !v.startsWith(`${info.label}_`)) continue;
            const bare = v.slice(info.label.length + 1).replace(/^result__$/, 'result');
            if (IDENT.test(bare) && !info.params.includes(bare)) {
                info.locals.set(v, bare);
                localNames.add(v);
            }
        }
        info.globals = [...used].filter(v => !info.locals.has(v) && !resultVars.has(v));
        info.lists = [...listsUsed(p.block.next, p.blocks)];
    }

    // ---- expressions ----------------------------------------------------
    // Each reporter is {e, word}: `e` is text for inside expr {…} (a bare
    // operand or a parenthesised compound), `word` is a Tcl word.
    const vn = (name, ctx) => (ctx.locals && ctx.locals.has(name) ? ctx.locals.get(name) : tclName(name));
    const ln = name => tclName(name);
    const exprNode = text => ({e: `(${text})`, word: `[expr {${text}}]`, inner: text});
    const operand = (input, blocks, ctx) => {
        const d = decodeInput(input, blocks);
        switch (d.kind) {
        case 'num': return {e: d.text, word: d.text, num: d.value};
        case 'str': return {e: quoteTcl(d.value), word: tclLiteral(d.value), str: d.value};
        case 'var': return {e: `$${vn(d.name, ctx)}`, word: `$${vn(d.name, ctx)}`};
        case 'list': return {e: `$${ln(d.name)}`, word: `$${ln(d.name)}`};
        case 'block': return reporter(d.block, blocks, ctx);
        default: return {e: '{}', word: '{}', str: ''};
        }
    };
    const E = (input, blocks, ctx) => operand(input, blocks, ctx).e;
    const W = (input, blocks, ctx) => operand(input, blocks, ctx).word;
    // A 1-based Scratch index as a 0-based Tcl index.
    const index0 = (input, blocks, ctx) => {
        const d = decodeInput(input, blocks);
        if (d.kind === 'num' && Number.isInteger(d.value)) return String(d.value - 1);
        if (d.kind === 'str' && /^last$/i.test(d.value)) return 'end';
        if (d.kind === 'block' && d.block.opcode === 'operator_add') {
            const two = decodeInput(d.block.inputs.NUM2, blocks);
            if (two.kind === 'num' && two.value === 1) return W(d.block.inputs.NUM1, blocks, ctx);
        }
        return `[expr {${E(input, blocks, ctx)} - 1}]`;
    };
    const binary = (b, blocks, ctx, op, a, c) => exprNode(`${E(b.inputs[a], blocks, ctx)} ${op} ${E(b.inputs[c], blocks, ctx)}`);
    const joinParts = (input, blocks, ctx, out) => {
        const d = decodeInput(input, blocks);
        if (d.kind === 'block' && d.block.opcode === 'operator_join') {
            joinParts(d.block.inputs.STRING1, blocks, ctx, out);
            joinParts(d.block.inputs.STRING2, blocks, ctx, out);
        } else if (d.kind === 'num') {
            out.push(d.text);
        } else if (d.kind === 'str') {
            out.push(quoteInner(d.value));
        } else if (d.kind === 'var') {
            out.push(`\${${vn(d.name, ctx)}}`);
        } else if (d.kind === 'list') {
            out.push(`\${${ln(d.name)}}`);
        } else if (d.kind === 'block') {
            const r = reporter(d.block, blocks, ctx);
            out.push(r.word.startsWith('[') ? r.word : r.word.startsWith('"') ? r.word.slice(1, -1) : `[expr {${r.inner || r.e}}]`);
        }
    };
    const reporter = (b, blocks, ctx) => {
        const f = k => field(b, k);
        switch (b.opcode) {
        case 'operator_add': return binary(b, blocks, ctx, '+', 'NUM1', 'NUM2');
        case 'operator_subtract': return binary(b, blocks, ctx, '-', 'NUM1', 'NUM2');
        case 'operator_multiply': return binary(b, blocks, ctx, '*', 'NUM1', 'NUM2');
        case 'operator_divide':
            warn('Tcl divides two integers as integers (7 / 2 is 3); Scratch gives 3.5');
            return binary(b, blocks, ctx, '/', 'NUM1', 'NUM2');
        case 'operator_mod': return binary(b, blocks, ctx, '%', 'NUM1', 'NUM2');
        case 'operator_gt': return binary(b, blocks, ctx, '>', 'OPERAND1', 'OPERAND2');
        case 'operator_lt': return binary(b, blocks, ctx, '<', 'OPERAND1', 'OPERAND2');
        case 'operator_equals': return binary(b, blocks, ctx, '==', 'OPERAND1', 'OPERAND2');
        case 'operator_and': return binary(b, blocks, ctx, '&&', 'OPERAND1', 'OPERAND2');
        case 'operator_or': {
            const x = falsy(b, blocks, ctx);
            if (x) return exprNode(`!${x}`);
            return binary(b, blocks, ctx, '||', 'OPERAND1', 'OPERAND2');
        }
        case 'operator_not': {
            const d = decodeInput(b.inputs.OPERAND, blocks);
            const x = d.kind === 'block' && falsy(d.block, blocks, ctx);
            // Tcl's own truth test: `if {$v}`
            if (x) return {e: x, word: `[expr {!!${x}}]`, inner: x};
            return exprNode(`!${E(b.inputs.OPERAND, blocks, ctx)}`);
        }
        case 'operator_round': return exprNode(`round(${E(b.inputs.NUM, blocks, ctx)})`);
        case 'operator_random': {
            const a = E(b.inputs.FROM, blocks, ctx);
            const c = E(b.inputs.TO, blocks, ctx);
            return exprNode(`int(rand() * (${c} - ${a} + 1)) + ${a}`);
        }
        case 'operator_mathop': {
            const x = E(b.inputs.NUM, blocks, ctx);
            const op = f('OPERATOR').toLowerCase();
            const fn = {abs: 'abs', sqrt: 'sqrt', ln: 'log', log: 'log10', 'e ^': 'exp'}[op];
            if (fn) return exprNode(`${fn}(${x})`);
            if (op === 'floor') return exprNode(`int(floor(${x}))`);
            if (op === 'ceiling') return exprNode(`int(ceil(${x}))`);
            if (op === '10 ^') return exprNode(`10 ** ${x}`);
            refuse(`no Tcl form for "${op} of" (Tcl's trigonometry is in radians, Scratch's in degrees)`);
            return {e: '0', word: '0'};
        }
        case 'planetemaths_pow': return binary(b, blocks, ctx, '**', 'NUM1', 'NUM2');
        case 'operator_join': {
            const parts = [];
            joinParts(b.inputs.STRING1, blocks, ctx, parts);
            joinParts(b.inputs.STRING2, blocks, ctx, parts);
            const t = `"${parts.join('')}"`;
            return {e: t, word: t};
        }
        case 'operator_length': {
            const t = `[string length ${W(b.inputs.STRING, blocks, ctx)}]`;
            return {e: t, word: t};
        }
        case 'operator_letter_of': {
            const t = `[string index ${W(b.inputs.STRING, blocks, ctx)} ${index0(b.inputs.LETTER, blocks, ctx)}]`;
            return {e: t, word: t};
        }
        case 'operator_contains':
            warn('Scratch\'s contains ignores case; Tcl\'s string first does not');
            return exprNode(`[string first ${W(b.inputs.STRING2, blocks, ctx)} ${W(b.inputs.STRING1, blocks, ctx)}] >= 0`);
        case 'data_itemoflist': {
            const t = `[lindex $${ln(f('LIST'))} ${index0(b.inputs.INDEX, blocks, ctx)}]`;
            return {e: t, word: t};
        }
        case 'data_lengthoflist': {
            const t = `[llength $${ln(f('LIST'))}]`;
            return {e: t, word: t};
        }
        case 'data_itemnumoflist':
            return exprNode(`[lsearch -exact $${ln(f('LIST'))} ${W(b.inputs.ITEM, blocks, ctx)}] + 1`);
        case 'data_listcontainsitem':
            return exprNode(`${E(b.inputs.ITEM, blocks, ctx)} in $${ln(f('LIST'))}`);
        case 'data_listcontents': return {e: `$${ln(f('LIST'))}`, word: `$${ln(f('LIST'))}`};
        case 'data_variable': return {e: `$${vn(f('VARIABLE'), ctx)}`, word: `$${vn(f('VARIABLE'), ctx)}`};
        case 'argument_reporter_string_number':
        case 'argument_reporter_boolean': {
            const name = f('VALUE');
            const i = (ctx.argNames || []).indexOf(name);
            const p = `$${i >= 0 ? ctx.params[i] : name}`;
            return {e: p, word: p};
        }
        default:
            refuse(`no Tcl form for the reporter ${b.opcode}`);
            return {e: '0', word: '0'};
        }
    };
    // ((X = 0) or (X = "false")): the reader's form of Tcl's "X is false"
    // (a bare value as a condition) → the operand text of X, else null.
    const falsy = (b, blocks, ctx) => {
        if (!b || b.opcode !== 'operator_or') return null;
        const side = (key, want) => {
            const d = decodeInput(b.inputs[key], blocks);
            if (d.kind !== 'block' || d.block.opcode !== 'operator_equals') return null;
            const r = decodeInput(d.block.inputs.OPERAND2, blocks);
            const ok = want === 0 ? r.kind === 'num' && r.value === 0 : r.kind === 'str' && r.value === want;
            return ok ? E(d.block.inputs.OPERAND1, blocks, ctx) : null;
        };
        const a = side('OPERAND1', 0);
        return a !== null && a === side('OPERAND2', 'false') ? a : null;
    };
    const cond = (input, blocks, ctx) => {
        const r = operand(input, blocks, ctx);
        return r.inner || r.e;
    };

    // ---- statements -----------------------------------------------------
    const pad = d => TCL_INDENT.repeat(d);
    const stack = (id, blocks, ctx, depth, out) => {
        let b = blocks[id];
        while (b) {
            const next = blocks[b.next];
            // set f_result X; stop this script — or last in f's body — is return X.
            if (ctx.resultVar && b.opcode === 'data_setvariableto' && field(b, 'VARIABLE') === ctx.resultVar) {
                const stops = next && next.opcode === 'control_stop' && field(next, 'STOP_OPTION') === 'this script';
                if (stops || (!next && depth === 1)) {
                    out.push(`${pad(depth)}return ${W(b.inputs.VALUE, blocks, ctx)}`);
                    b = stops ? blocks[next.next] : null;
                    continue;
                }
            }
            // f calling itself, then stop: return [f …].
            if (ctx.resultVar && b.opcode === 'procedures_call' && next && next.opcode === 'control_stop' &&
                field(next, 'STOP_OPTION') === 'this script') {
                const info = procInfo.get(String((b.mutation || {}).proccode));
                if (info && info.resultVar === ctx.resultVar) {
                    out.push(`${pad(depth)}return [${callText(info, b, blocks, ctx)}]`);
                    b = blocks[next.next];
                    continue;
                }
            }
            // foreach x $L, as the reader writes it:
            //   set _fK to 0; REPEAT (length of L): change _fK by 1; set x to item _fK of L; …
            const fe = foreachShape(b, blocks);
            if (fe) {
                out.push(`${pad(depth)}foreach ${vn(fe.item, ctx)} $${ln(fe.list)} {`);
                stack(fe.bodyStart, blocks, ctx, depth + 1, out);
                out.push(`${pad(depth)}}`);
                b = blocks[fe.after];
                continue;
            }
            statement(b, blocks, ctx, depth, out);
            b = next;
        }
    };
    const body = (b, key, blocks, ctx, depth, out) => {
        const sid = substackId(b, key);
        if (sid) stack(sid, blocks, ctx, depth, out);
    };
    const callText = (info, b, blocks, ctx) => [info.name,
        ...info.proto.argumentIds.map(id => (b.inputs[id] ? W(b.inputs[id], blocks, ctx) : '{}'))].join(' ');
    const block = (head, b, key, blocks, ctx, depth, out) => {
        out.push(`${pad(depth)}${head} {`);
        body(b, key, blocks, ctx, depth + 1, out);
        out.push(`${pad(depth)}}`);
    };
    const statement = (b, blocks, ctx, depth, out) => {
        const p = pad(depth);
        const f = k => field(b, k);
        const w = k => W(b.inputs[k], blocks, ctx);
        switch (b.opcode) {
        case 'data_setvariableto': out.push(`${p}set ${vn(f('VARIABLE'), ctx)} ${w('VALUE')}`); return;
        case 'data_changevariableby': {
            const n = vn(f('VARIABLE'), ctx);
            const d = decodeInput(b.inputs.VALUE, blocks);
            if (d.kind === 'num' && Number.isInteger(d.value)) {
                out.push(d.value === 1 ? `${p}incr ${n}` : `${p}incr ${n} ${d.value}`);
            } else {
                out.push(`${p}set ${n} [expr {$${n} + ${E(b.inputs.VALUE, blocks, ctx)}}]`);
            }
            return;
        }
        case 'looks_say': case 'looks_think': case 'stc12_print':
            out.push(`${p}puts ${w(b.inputs.MESSAGE ? 'MESSAGE' : 'VALUE')}`);
            return;
        case 'looks_sayforsecs': case 'looks_thinkforsecs':
            out.push(`${p}puts ${w('MESSAGE')}`, `${p}${afterText(b.inputs.SECS, blocks, ctx)}`);
            return;
        case 'control_wait': out.push(`${p}${afterText(b.inputs.DURATION, blocks, ctx)}`); return;
        case 'control_repeat': {
            const k = ++loopSeq;
            const times = decodeInput(b.inputs.TIMES, blocks);
            let limit = times.kind === 'num' ? times.text : null;
            if (limit === null) {
                out.push(`${p}set _n${k} ${w('TIMES')}`);
                limit = `$_n${k}`;
            }
            block(`for {set _r${k} 0} {$_r${k} < ${limit}} {incr _r${k}}`, b, 'SUBSTACK', blocks, ctx, depth, out);
            return;
        }
        case 'control_forever': block('while 1', b, 'SUBSTACK', blocks, ctx, depth, out); return;
        case 'control_repeat_until': {
            const inner = decodeInput(b.inputs.CONDITION, blocks);
            const x = inner.kind === 'block' && falsy(inner.block, blocks, ctx);
            const c = x || (inner.kind === 'block' && inner.block.opcode === 'operator_not' ?
                cond(inner.block.inputs.OPERAND, blocks, ctx) : `!${E(b.inputs.CONDITION, blocks, ctx)}`);
            block(`while {${c}}`, b, 'SUBSTACK', blocks, ctx, depth, out);
            return;
        }
        case 'control_while': block(`while {${cond(b.inputs.CONDITION, blocks, ctx)}}`, b, 'SUBSTACK', blocks, ctx, depth, out); return;
        case 'control_if': block(`if {${cond(b.inputs.CONDITION, blocks, ctx)}}`, b, 'SUBSTACK', blocks, ctx, depth, out); return;
        case 'control_if_else':
            out.push(`${p}if {${cond(b.inputs.CONDITION, blocks, ctx)}} {`);
            body(b, 'SUBSTACK', blocks, ctx, depth + 1, out);
            out.push(`${p}} else {`);
            body(b, 'SUBSTACK2', blocks, ctx, depth + 1, out);
            out.push(`${p}}`);
            return;
        case 'control_stop': {
            const opt = f('STOP_OPTION');
            if (opt === 'this script') {
                out.push(ctx.resultVar ? `${p}return $${vn(ctx.resultVar, ctx)}` : `${p}return`);
                return;
            }
            if (opt === 'all') { out.push(`${p}exit`); return; }
            refuse(`Tcl runs one script, so there are no other scripts to "stop ${opt}"`);
            return;
        }
        case 'procedures_call': {
            const info = procInfo.get(String((b.mutation || {}).proccode));
            if (!info) { refuse(`call of an undefined custom block "${(b.mutation || {}).proccode}"`); return; }
            out.push(info.returns ? `${p}set ${vn(info.resultVar, ctx)} [${callText(info, b, blocks, ctx)}]` :
                `${p}${callText(info, b, blocks, ctx)}`);
            return;
        }
        case 'bw_raw': out.push(`${p}${f('TEXT')}`); return;
        // ---- lists ----
        case 'data_addtolist': out.push(`${p}lappend ${ln(f('LIST'))} ${w('ITEM')}`); return;
        case 'data_deletealloflist': out.push(`${p}set ${ln(f('LIST'))} {}`); return;
        case 'data_deleteoflist': {
            const L = ln(f('LIST'));
            const d = decodeInput(b.inputs.INDEX, blocks);
            if (d.kind === 'str' && /^all$/i.test(d.value)) { out.push(`${p}set ${L} {}`); return; }
            const i = index0(b.inputs.INDEX, blocks, ctx);
            out.push(`${p}set ${L} [lreplace $${L} ${i} ${i}]`);
            return;
        }
        case 'data_insertatlist': {
            const L = ln(f('LIST'));
            out.push(`${p}set ${L} [linsert $${L} ${index0(b.inputs.INDEX, blocks, ctx)} ${w('ITEM')}]`);
            return;
        }
        case 'data_replaceitemoflist':
            out.push(`${p}lset ${ln(f('LIST'))} ${index0(b.inputs.INDEX, blocks, ctx)} ${w('ITEM')}`);
            return;
        case 'data_showvariable': case 'data_hidevariable': case 'data_showlist': case 'data_hidelist':
            warn('show/hide of a variable or list has no Tcl form (there is no stage) — left out');
            return;
        default:
            refuse(`no Tcl form for the block ${b.opcode}`);
        }
    };
    const afterText = (input, blocks, ctx) => {
        const d = decodeInput(input, blocks);
        if (d.kind === 'num') return `after ${Math.round(d.value * 1000)}`;
        return `after [expr {int(${E(input, blocks, ctx)} * 1000)}]`;
    };

    // ---- assemble -------------------------------------------------------
    const procLines = [];
    for (const p of procs) {
        const info = procInfo.get(procPrototype(p.block, p.blocks).proccode);
        const ctx = {inProc: true, params: info.params, argNames: info.proto.argumentNames,
            resultVar: info.returns ? info.resultVar : null, locals: info.locals};
        const bodyLines = [];
        stack(p.block.next, p.blocks, ctx, 1, bodyLines);
        // `global` for every shared variable and list the body uses, unless the
        // body already declares it itself (a raw `global` line kept from Tcl).
        const declared = new Set();
        for (const l of bodyLines) {
            const m = /^ {4}global\s+(.*)$/.exec(l);
            if (m) for (const n of m[1].trim().split(/\s+/)) declared.add(n);
        }
        const need = [...new Set([...info.globals.map(v => vn(v, ctx)), ...info.lists.map(ln)])]
            .filter(n => !declared.has(n) && !info.params.includes(n));
        procLines.push(`proc ${info.name} {${info.params.join(' ')}} {`,
            ...(need.length ? [`${TCL_INDENT}global ${need.join(' ')}`] : []), ...bodyLines, '}');
    }
    const mainLines = [];
    if (flags.length === 1) stack(flags[0].block.next, flags[0].blocks, {inProc: false}, 0, mainLines);

    // Scratch variables and lists start at their stored values; a Tcl
    // variable read before it is set is an error.
    const varLines = [];
    for (const target of (project && project.targets) || []) {
        for (const [name, value] of Object.values(target.variables || {})) {
            if (localNames.has(name) || COUNTER.test(name)) continue;
            const n = Number(value);
            varLines.push(`set ${tclName(name)} ${Number.isFinite(n) && String(value).trim() !== '' ?
                String(value) : tclLiteral(value)}`);
        }
        for (const [name, items] of Object.values(target.lists || {})) {
            varLines.push(`set ${ln(name)} [list${items.map(x => ` ${tclLiteral(x)}`).join('')}]`);
        }
    }

    if (reasons.length) return {ok: false, tcl: '', reasons, warnings};
    const out = [...procLines];
    if (varLines.length) out.push(MARK_VARS, ...varLines);
    out.push(MARK_PROGRAM, ...mainLines);
    return {ok: true, tcl: `${out.join('\n')}\n`, reasons, warnings};
}

/** Does a stack assign `name` with `set … to` anywhere (substacks included)? */
function setsVariable (startId, blocks, name) {
    let found = false;
    const visit = id => {
        const b = blocks[id];
        if (!b || found || typeof b !== 'object') return;
        if (b.opcode === 'data_setvariableto' && field(b, 'VARIABLE') === name) { found = true; return; }
        for (const input of Object.values(b.inputs || {})) if (input && typeof input[1] === 'string') visit(input[1]);
        if (b.next) visit(b.next);
    };
    visit(startId);
    return found;
}

/** Every list a stack names (its blocks' LIST fields and list reporters). */
function listsUsed (startId, blocks) {
    const names = new Set();
    const visit = id => {
        const b = blocks[id];
        if (!b || typeof b !== 'object') return;
        if (b.fields && b.fields.LIST) names.add(String(b.fields.LIST[0]));
        for (const input of Object.values(b.inputs || {})) {
            const v = input && input[1];
            if (Array.isArray(v) && v[0] === 13) names.add(String(v[1]));
            else if (typeof v === 'string') visit(v);
        }
        if (b.next) visit(b.next);
    };
    visit(startId);
    return names;
}

/**
 * The reader's foreach shape, starting at `b`:
 *   set _fK to 0
 *   REPEAT (length of L):
 *     change _fK by 1
 *     set item to (item _fK of L)
 *     …body…
 * → {item, list, bodyStart, after}, or null.
 */
function foreachShape (b, blocks) {
    if (!b || b.opcode !== 'data_setvariableto') return null;
    const counter = field(b, 'VARIABLE');
    if (!/^_f\d+$/.test(counter)) return null;
    const zero = decodeInput(b.inputs.VALUE, blocks);
    if (zero.kind !== 'num' || zero.value !== 0) return null;
    const loop = blocks[b.next];
    if (!loop || loop.opcode !== 'control_repeat') return null;
    const times = decodeInput(loop.inputs.TIMES, blocks);
    if (times.kind !== 'block' || times.block.opcode !== 'data_lengthoflist') return null;
    const list = field(times.block, 'LIST');
    const inc = blocks[substackId(loop, 'SUBSTACK')];
    if (!inc || inc.opcode !== 'data_changevariableby' || field(inc, 'VARIABLE') !== counter) return null;
    const one = decodeInput(inc.inputs.VALUE, blocks);
    if (one.kind !== 'num' || one.value !== 1) return null;
    const get = blocks[inc.next];
    if (!get || get.opcode !== 'data_setvariableto') return null;
    const item = decodeInput(get.inputs.VALUE, blocks);
    if (item.kind !== 'block' || item.block.opcode !== 'data_itemoflist' || field(item.block, 'LIST') !== list) return null;
    const idx = decodeInput(item.block.inputs.INDEX, blocks);
    if (idx.kind !== 'var' || idx.name !== counter) return null;
    return {item: field(get, 'VARIABLE'), list, bodyStart: get.next, after: loop.next};
}

// ======================================================================
// Tcl → pseudocode
// ======================================================================

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
    let startAt = 0;
    const n = src.length;
    // Each command keeps its exact source text: what a `raw` block carries.
    const endCmd = () => {
        if (words.length) cmds.push({words, line: startLine, text: src.slice(startAt, i).replace(/\s+$/, '')});
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
        if (!words.length) { startLine = line; startAt = i; }
        if (c === '#' && !words.length) {
            let j = i;
            // A comment runs to an unescaped newline.
            while (j < n && src[j] !== '\n') j += src[j] === '\\' && !partcl ? 2 : 1;
            cmds.push({words: [{comment: src.slice(i + 1, j).trim()}], line, text: src.slice(i, j).replace(/\s+$/, '')});
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
/**
 * The variables of a Tcl program that can be Scratch lists: named by a list
 * command (lappend, lset, lindex, llength, lsearch -exact, foreach, in, or
 * set to [list …]) and never written by a command that would make them
 * something else (set to a non-list, incr, append, unset, an array element).
 * Read textually over the whole program; the reader then only treats a
 * GLOBAL name as a list, so a proc local of the same name stays a variable.
 */
function listCandidates (text) {
    const id = '(?:::)?([A-Za-z_]\\w*)';
    const uses = [
        new RegExp(`\\b(?:lappend|lset)\\s+${id}`, 'g'),
        new RegExp(`\\[\\s*(?:lindex|llength|lsearch\\s+-exact)\\s+\\$${id}`, 'g'),
        new RegExp(`\\bforeach\\s+[A-Za-z_]\\w*\\s+\\$${id}\\s+\\{`, 'g'),
        new RegExp(`\\s(?:in|ni)\\s+\\$${id}\\s*\\}`, 'g'),
        new RegExp(`(?:^|[\\s;{])set\\s+${id}\\s+\\[list[\\s\\]]`, 'gm')
    ];
    const names = new Set();
    for (const re of uses) for (const m of text.matchAll(re)) names.add(m[1]);
    const esc = n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const n of [...names]) {
        const N = esc(n);
        const sets = new RegExp(`(?:^|[\\s;{\\[])set\\s+(?:::)?${N}\\s+(\\S[^\\n;]*)`, 'gm');
        for (const m of text.matchAll(sets)) {
            const v = m[1];
            if (!(/^(\{\}|""|\[list[\s\]]|\{[^{}$\[\]]*\})/.test(v) ||
                v.startsWith(`[lreplace $${n} `) || v.startsWith(`[linsert $${n} `))) names.delete(n);
        }
        if (new RegExp(`\\b(?:incr|append|unset|lassign\\s.*)\\s+(?:::)?${N}\\b|\\$(?:::)?${N}\\(|\\b(?:proc\\s+\\S+\\s+\\{[^}]*\\b${N}\\b)`).test(text)) names.delete(n);
        if (clashIn(n)) names.delete(n);
    }
    return names;
}

function parseList (text) {
    const cmds = parseScript(String(text).replace(/[\n;]/g, ' '));
    return cmds.length ? cmds[0].words : [];
}

const pseudoString = s => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    .replace(/\n/g, '\\n').replace(/\t/g, '\\t').replace(/\r/g, '\\r')}"`;
const isNumber = s => /^-?\d+(\.\d+)?$/.test(s);
// Variables pseudocode would read as something else.
// The earlier partcl generator's scaffolding procs.
const PARTCL_HELPERS = new Set(['#', 'else', 'not', 'and', 'or', 'mod', 'wait', 'pow', 'abs']);
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
// Tcl math function → Scratch's `<op> of`. Tcl's log is natural (Scratch ln),
// log10 is Scratch's log.
const EXPR_FUNCS = {abs: 'abs', floor: 'floor', ceil: 'ceiling', sqrt: 'sqrt', log: 'ln', log10: 'log', exp: 'e ^'};

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
            toks.push({num: exprNumber(m[0])});
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

// A Tcl number literal, keeping whether it is a double: 2.0 / 2 is 1.0,
// 2 / 2 is 1 — and 4 / 2.0 is not integer division. 010 is octal in Tcl 8.
function exprNumber (t) {
    if (/^0\d/.test(t)) throw new TclReadError(`the octal literal ${t}`);
    if (/^0x/i.test(t)) return String(Number(t));
    if (/^\d+(\.\d+)?$/.test(t)) return t;
    const v = String(Number(t));
    return /[.e]/i.test(t) && !/[.e]/i.test(v) ? `${v}.0` : v;
}

// After `abs of` / `round` the dialect reads `-4` as subtraction from the
// words before it (`abs of -4` is the variable "abs of" minus 4).
const neg = v => (/^-/.test(v) ? `(${v})` : v);

const LEVELS = [['||'], ['&&'], ['|'], ['^'], ['&'], ['in', 'ni'], ['eq', 'ne'], ['==', '!='],
    ['<', '>', '<=', '>='], ['<<', '>>'], ['+', '-'], ['*', '/', '%']];
// A bare value where Tcl wants a truth value means "nonzero" (`$done &&
// …`, `!$done`); in a Scratch condition it would be compared with "true".
const truth = v => (isBoolean(v) ? v : `(not ${falseTest(v)})`);
// Tcl's false values a program writes: 0 and false (Scratch's = ignores case).
const falseTest = v => `((${v} = 0) or (${v} = "false"))`;
/** Whether pseudocode `v` is, or has inside it, a condition. */
function containsCondition (v) {
    if (isBoolean(v)) return true;
    for (let i = 0; i < v.length; i++) {
        if (v[i] !== '(') continue;
        let depth = 0;
        let str = false;
        for (let j = i; j < v.length; j++) {
            const c = v[j];
            if (str) { if (c === '\\') j++; else if (c === '"') str = false; continue; }
            if (c === '"') str = true;
            else if (c === '(') depth++;
            else if (c === ')' && --depth === 0) {
                if (isBoolean(v.slice(i, j + 1))) return true;
                break;
            }
        }
    }
    return false;
}

/** Whether pseudocode `v` is a condition (a comparison, and/or/not, contains). */
function isBoolean (v) {
    if (!/^\(.*\)$/s.test(v)) return false;
    const inner = v.slice(1, -1);
    if (/^not /.test(inner)) return true;
    let depth = 0;
    let str = false;
    for (let i = 0; i < inner.length; i++) {
        const c = inner[i];
        if (str) { if (c === '\\') i++; else if (c === '"') str = false; continue; }
        if (c === '"') str = true;
        else if (c === '(') depth++;
        else if (c === ')') depth--;
        else if (depth === 0 && c === ' ' && /^ (=|<|>|and|or|contains) /.test(inner.slice(i))) return true;
    }
    // a parenthesised value that is not a whole expression, e.g. (a) (b)
    return depth !== 0;
}
const BINARY = {
    '||': (a, b) => `(${truth(a)} or ${truth(b)})`, '&&': (a, b) => `(${truth(a)} and ${truth(b)})`,
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
        if (isOp(t, ['!'])) {
            k++;
            const v = unary();
            return isBoolean(v) ? `(not ${v})` : falseTest(v);
        }
        if (isOp(t, ['~'])) throw new TclReadError('expr operator ~ has no block');
        const base = primary();
        if (isOp(peek(), ['**'])) {
            k++;
            const exp = neg(unary());
            return base === '10' ? `(10 ^ of ${exp})` : `(${base} to the power of ${exp})`;
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
            // int(floor(x)) is how the generator writes Scratch's floor (Tcl's
            // floor returns a double): one floor, not two.
            if (name === 'int' && args.length === 1) {
                return /^\((floor|ceiling) of /.test(args[0]) ? args[0] : `(floor of ${neg(args[0])})`;
            }
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
    // A proc with default arguments becomes a block that always takes all of
    // them (the reader fills the defaults in at each call it lifts). When raw
    // Tcl also calls it, that call may leave them out — so such a proc is
    // read again, kept raw itself.
    let keepRaw = new Set();
    for (;;) {
        const r = readTcl(source, keepRaw);
        if (!r.retry.length) return {pseudocode: r.pseudocode, warnings: r.warnings};
        keepRaw = new Set([...keepRaw, ...r.retry]);
    }
}

function readTcl (source, keepRaw) {
    const text = String(source || '');
    // What the earlier partcl generator wrote (it always started with
    // `proc # {} {}`) is partcl, where a backslash is just a character and its
    // helper procs are scaffolding; anything else is real Tcl.
    const partcl = /^proc # \{\} \{\}$/m.test(text);
    const helper = name => partcl && PARTCL_HELPERS.has(name);
    const parse = (src, line) => parseScript(src, line, partcl);
    const warnings = [];
    const globals = new Set();
    const procs = [];
    const userProcs = new Map();   // Tcl name → {name, params, defaults}
    // A Tcl variable's block name: itself, x__/y__ for x/y (pseudocode reads
    // `set x` as motion; the generator writes them back as x/y), and nothing
    // for a name that is not a plain identifier — its command stays raw.
    const rename = name => {
        if (clashIn(name)) return clashIn(name);
        if (!IDENT.test(name)) throw new TclReadError(`the variable name "${name}" is not one blocks can hold`);
        return name;
    };
    const procOf = head => (head !== null && userProcs.has(head.replace(/^::/, '')) ? userProcs.get(head.replace(/^::/, '')) : null);

    // ---- lists -------------------------------------------------------
    // A Tcl variable reads as a Scratch list when a list command (lappend,
    // lset, lindex, llength, lsearch, foreach, in) works on it and nothing
    // writes it any other way. Commands on it that blocks cannot say stay raw
    // Tcl, which still sees an ordinary Tcl list. Proc locals are not lists
    // (blocks have no local lists): their list commands stay raw.
    const lists = listCandidates(text);
    const listsSeen = new Set();
    const listOf = (name, scope) => {
        if (name === null || name === undefined) return null;
        let v;
        try { v = resolve(String(name), scope); } catch (e) { return null; }
        if (v === null || !lists.has(v)) return null;
        listsSeen.add(v);
        return v;
    };
    const listOfWord = (w, scope) => (w && w.parts && w.parts.length === 1 && w.parts[0].var !== undefined ?
        listOf(w.parts[0].var, scope) : null);
    // A Tcl index (from 0, or end) as a Scratch one (from 1, or last).
    const plus1 = (w, scope) => {
        const t = bareText(w);
        if (t === 'end') return '"last"';
        const e = exprOfWord(w, scope);
        if (/^-?\d+$/.test(e)) return String(Number(e) + 1);
        const m = /^\((.*) - 1\)$/s.exec(e);
        return m ? m[1] : `(${e} + 1)`;
    };
    let foreachCount = 0;

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
    // too (the generator writes them back as `name`). `<proc>_result` names
    // are the return-value convention, and loop counters stay as they are.
    const resolve = (name, scope) => {
        const bare = name.replace(/^::/, '');
        if (scope.proc && !name.startsWith('::')) {
            if (scope.params.includes(bare)) return null;
            if (!scope.globalsDeclared.has(bare) && !isResultVar(bare) && !bare.startsWith(`${scope.proc}_`) &&
                !COUNTER.test(bare)) {
                if (!IDENT.test(bare)) throw new TclReadError(`the variable name "${bare}" is not one blocks can hold`);
                // a local `result` is not the proc's return value f_result
                return bare === 'result' ? `${scope.proc}_result__` : `${scope.proc}_${bare}`;
            }
        }
        return rename(bare);
    };
    const isResultVar = n => /_result$/.test(n) && [...userProcs.values()].some(pr => `${pr.name}_result` === n);
    const varRef = (name, scope) => {
        const v = resolve(name, scope);
        if (v === null) return name.replace(/^::/, '');
        if (lists.has(v)) { listsSeen.add(v); return v; }
        globals.add(v);
        return v;
    };
    const target = (name, scope) => {
        const v = resolve(name, scope);
        if (v === null) throw new TclReadError(`assigning to the argument "${name}" — blocks cannot`);
        if (lists.has(v)) throw new TclReadError(`${v} is a list here — this write has no list block`);
        globals.add(v);
        return v;
    };
    // A value slot (set, say, an argument, a list item): pseudocode reads a
    // condition there as text, so Tcl that uses one as a value stays raw.
    const asValue = v => {
        if (containsCondition(v)) throw new TclReadError('a condition used as a value — pseudocode has no boolean in a value slot');
        return v;
    };
    const valueOf = (w, scope) => asValue(exprOfWord(w, scope));
    const exprOfWord = (w, scope) => {
        if (w.brace !== undefined) return isNumber(w.brace) ? w.brace : pseudoString(w.brace);
        return exprOfParts(w.parts, scope, w.quoted);
    };
    // A real-Tcl expression, from its text (`expr {…}`, `if {…}`). Two
    // shapes the generator writes are read whole first: Scratch's pick
    // random, and contains.
    const exprOfText = (text, scope, line, inCond = false) => {
        const t = text.trim();
        const r = /^int\(rand\(\) \* \((.*)\)\) \+ (.+)$/.exec(t);
        if (r && r[1].endsWith(` - ${r[2]} + 1`)) {
            const hi = r[1].slice(0, -` - ${r[2]} + 1`.length);
            return `(pick random ${exprOfText(r[2], scope, line)} to ${exprOfText(hi, scope, line)})`;
        }
        const c = /^\[string first (.*)\] >= 0$/.exec(t);
        if (c) {
            const w = parse(`string first ${c[1]}`, line)[0];
            if (w && w.words.length === 4) return `(${exprOfWord(w.words[3], scope)} contains ${exprOfWord(w.words[2], scope)})`;
        }
        const inL = /^(\$\w+|"[^"\\$\[]*"|[\w.-]+) (in|ni) \$((?:::)?\w+)$/.exec(t);
        // (as a condition only: as a value Tcl's 1/0 is not Scratch's true/false)
        if (inCond && inL && listOf(inL[3], scope)) {
            const has = `(${listOf(inL[3], scope)} contains ${exprOfText(inL[1], scope, line)})`;
            return inL[2] === 'in' ? has : `(not ${has})`;
        }
        return exprToPseudo(tokenizeExpr(text), tok => {
            if (tok.var !== undefined) return varRef(tok.var, scope);
            if (tok.cmd !== undefined) return exprOfCmd(tok.cmd, scope, line);
            return exprOfWord(tok.word, scope);
        });
    };
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
        if (head === 'set' && words.length === 2 && bareText(words[1]) !== null) return varRef(bareText(words[1]), scope);
        if (head === 'string' && bareText(words[1]) === 'length' && words.length === 3) {
            return `(length of ${exprOfWord(words[2], scope)})`;
        }
        if (head === 'string' && bareText(words[1]) === 'index' && words.length === 4) {
            // Tcl counts from 0, Scratch's letter from 1.
            const i = exprOfWord(words[3], scope);
            return `(letter ${/^-?\d+$/.test(i) ? String(Number(i) + 1) : `(${i} + 1)`} of ${exprOfWord(words[2], scope)})`;
        }
        if (head === 'llength' && words.length === 2 && listOfWord(words[1], scope)) {
            return `(length of ${listOfWord(words[1], scope)})`;
        }
        if (head === 'lindex' && words.length === 3 && listOfWord(words[1], scope)) {
            return `(item ${plus1(words[2], scope)} of ${listOfWord(words[1], scope)})`;
        }
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
        let v;
        if (w.brace === undefined) {
            // `if $done …` / `while [more]` — an unbraced expression.
            v = exprOfText(wordSource(w), scope, w.line, true);
        } else {
            const cmds = parse(w.brace, w.line);
            const head = cmds.length === 1 ? bareText(cmds[0].words[0]) : null;
            if (cmds.length === 1 && (PARTCL_COND.has(head) || (procOf(head) && cmds[0].words.length > 1))) {
                return exprOfWords(cmds[0].words, scope);
            }
            v = exprOfText(w.brace, scope, w.line, true);
        }
        if (isNumber(v)) return Number(v) ? '(1 = 1)' : '(1 = 0)';
        if (/^"(true|yes|on)"$/i.test(v)) return '(1 = 1)';
        if (/^"(false|no|off)"$/i.test(v)) return '(1 = 0)';
        // `if {$flag}`: Tcl tests a number for nonzero; a bare value in a
        // Scratch condition would be compared with "true".
        return truth(v);
    };

    // ---- statements --------------------------------------------------
    const pad = d => '  '.repeat(d);
    const block = (w, scope, depth) => statements(parse(w.brace, w.line), scope, depth);
    const callArgs = (proc, a, scope) => {
        if (a.length > proc.params.length) throw new TclReadError(`${proc.name} called with ${a.length} arguments, takes ${proc.params.length}`);
        const out = a.map(w => valueOf(w, scope));
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
            // A comment is kept as raw Tcl: blocks have no comment statement.
            if (words[0].comment !== undefined) { out.push(`${p}raw ${pseudoString(cmds[k].text)}`); continue; }
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
                // Kept exactly as written: a grey raw block that the
                // generator writes back verbatim.
                out.length = mark;
                warnings.push(`kept as Tcl (line ${line}): ${e.message}`);
                out.push(`${p}raw ${pseudoString(cmds[k].text)}`);
            }
        }
        return out;

        // The last command of a proc, used as its value: `expr …`, a call
        // (when the proc is used for its value), or an if whose branches end
        // that way. Returns false to read it as an ordinary statement.
        function tailReturn (words, head, a, line) {
            const result = `${scope.proc}_result`;
            if (head === 'expr') {
                const value = asValue(exprOfWords(words, scope));
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
                    if (/^_n\d+$/.test(name) && next && ((bareText(next[0]) === 'set' &&
                        /^_r\d+$/.test(bareText(next[1]) || '')) || (bareText(next[0]) === 'for' &&
                        /^set _r\d+ 0$/.test((next[1] && next[1].brace) || '')))) {
                        pendingLimit.set(name, exprOfWord(a[1], scope));
                        return 0;
                    }
                    if (/\(/.test(name)) throw new TclReadError(`array element ${name} — blocks have no Tcl arrays`);
                    const L = listOf(name, scope);
                    if (L) { out.push(...setList(L, a[1], scope, p)); return 0; }
                    const bare = name.replace(/^::/, '');
                    const to = target(name, scope);
                    const v = a[1];
                    // set n [+ $n X] (partcl) or set n [expr {$n + X}] → change n by X
                    if (v.parts && v.parts.length === 1 && v.parts[0].cmd !== undefined) {
                        const inner = parse(v.parts[0].cmd)[0];
                        if (inner && inner.words.length === 3 && bareText(inner.words[0]) === '+' &&
                            varOfWord(inner.words[1]) === bare) {
                            out.push(`${p}change ${to} by ${exprOfWord(inner.words[2], scope)}`);
                            return 0;
                        }
                        const esc = bare.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        const m = inner && inner.words.length === 2 && bareText(inner.words[0]) === 'expr' &&
                            inner.words[1].brace !== undefined &&
                            new RegExp(`^\\$(?:${esc}|\\{${esc}\\}) \\+ (.+)$`, 's').exec(inner.words[1].brace.trim());
                        // (by a whole number the generator writes incr, so that
                        // one stays a set: the round trip keeps its text)
                        if (m && !/^-?\d+$/.test(m[1].trim())) {
                            out.push(`${p}change ${to} by ${exprOfText(m[1], scope, line)}`);
                            return 0;
                        }
                    }
                    const value = valueOf(v, scope);
                    // set f_result [f …] is the call itself (the generator's form).
                    if (value === to && isResultVar(to)) return 0;
                    out.push(`${p}set ${to} to ${value}`);
                } else if (head === 'lappend' && a.length >= 2 && listOf(bareText(a[0]), scope)) {
                    const L = listOf(bareText(a[0]), scope);
                    for (const w of a.slice(1)) out.push(`${p}add ${valueOf(w, scope)} to ${L}`);
                } else if (head === 'lset' && a.length === 3 && listOf(bareText(a[0]), scope)) {
                    const L = listOf(bareText(a[0]), scope);
                    out.push(`${p}replace item ${plus1(a[1], scope)} of ${L} with ${valueOf(a[2], scope)}`);
                } else if (head === 'foreach' && a.length === 3 && IDENT.test(bareText(a[0]) || '') && listOfWord(a[1], scope)) {
                    // The generator's foreach shape: a counter walking the list.
                    const L = listOfWord(a[1], scope);
                    const item = target(bareText(a[0]), scope);
                    const c = `_f${++foreachCount}`;
                    globals.add(c);
                    out.push(`${p}set ${c} to 0`, `${p}REPEAT (length of ${L}):`, `${p}  change ${c} by 1`,
                        `${p}  set ${item} to (item ${c} of ${L})`, ...loopBody(a[2], scope, depth + 1));
                } else if (head === 'incr' && (a.length === 1 || a.length === 2) && bareText(a[0])) {
                    const to = target(bareText(a[0]), scope);
                    out.push(`${p}change ${to} by ${a.length === 2 ? exprOfWord(a[1], scope) : '1'}`);
                } else if (head === 'puts') {
                    out.push(...putsStmt(a, scope, p));
                } else if (head === 'wait' && a.length === 1) {
                    out.push(`${p}wait ${exprOfWord(a[0], scope)} secs`);
                } else if (head === 'after' && a.length === 1 && isNumber(bareText(a[0]) || '')) {
                    out.push(`${p}wait ${Number(bareText(a[0])) / 1000} secs`);
                } else if (head === 'after' && a.length === 1 && afterSeconds(a[0]) !== null) {
                    out.push(`${p}wait ${exprOfText(afterSeconds(a[0]), scope, line)} secs`);
                } else if (head === 'exit' && a.length === 0) {
                    out.push(`${p}stop all`);
                } else if (head === 'while' && a.length === 2) {
                    out.push(...whileLoop(a[0], a[1], scope, depth));
                } else if (head === 'for' && a.length === 4) {
                    out.push(...(forRepeat(a, scope, depth) || forLoop(a, scope, depth)));
                } else if (head === 'if') {
                    out.push(...ifChain(a, scope, depth, line));
                } else if (head === 'return' && a.length === 0) {
                    out.push(`${p}stop this script`);
                } else if (head === 'return' && a.length === 1) {
                    if (!scope.proc) throw new TclReadError('return with a value outside a proc');
                    // The return-value convention: f_result, then leave.
                    const value = valueOf(a[0], scope);
                    globals.add(`${scope.proc}_result`);
                    if (value !== `${scope.proc}_result`) out.push(`${p}set ${scope.proc}_result to ${value}`);
                    out.push(`${p}stop this script`);
                } else if (head === 'proc' && a.length === 3) {
                    if (!scope.top) throw new TclReadError('proc defined inside a body');
                    const name = bareText(a[0]);
                    if (helper(name)) return 0;
                    const proc = procOf(name);
                    if (!proc) throw new TclReadError(procRefusal.get(name) || `proc ${name} has no block form`);
                    procs.push({...proc, body: a[2], line});
                } else if (head === 'package' && bareText(a[0]) === 'require' && bareText(a[1]) === 'Tcl') {
                    return 0;   // the interpreter is the requirement
                } else if (head === 'global') {
                    // Kept as written (the generator only adds what is missing);
                    // the names read as globals from here on.
                    if (scope.proc) for (const w of a) scope.globalsDeclared.add(String(bareText(w)).replace(/^::/, ''));
                    out.push(`${p}raw ${pseudoString(cmds[k].text)}`);
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
    // set L <value> for a list: the shapes that are list blocks.
    const setList = (L, v, scope, p) => {
        const items = listLiteral(v);
        if (items) return [`${p}delete all of ${L}`, ...items.map(x => `${p}add ${x} to ${L}`)];
        const inner = v.parts && v.parts.length === 1 && v.parts[0].cmd !== undefined ? parse(v.parts[0].cmd)[0] : null;
        const w = inner ? inner.words : [];
        const h = bareText(w[0]);
        if (h === 'list') return [`${p}delete all of ${L}`, ...w.slice(1).map(x => `${p}add ${valueOf(x, scope)} to ${L}`)];
        if (h === 'lreplace' && w.length === 4 && listOfWord(w[1], scope) === L && wordSource(w[2]) === wordSource(w[3])) {
            return [`${p}delete ${plus1(w[2], scope)} of ${L}`];
        }
        if (h === 'linsert' && w.length === 4 && listOfWord(w[1], scope) === L) {
            return [`${p}insert ${valueOf(w[3], scope)} at ${plus1(w[2], scope)} of ${L}`];
        }
        throw new TclReadError(`${L} is a list here — this write has no list block`);
    };
    // A literal list word ({a b c}, "", {}) → its items as pseudocode, else null.
    const listLiteral = v => {
        const t = v.brace !== undefined ? v.brace : bareText(v);
        if (t === null || t === undefined) return null;
        const items = parseList(t).map(bareText);
        if (items.some(x => x === null)) return null;
        // only a list written the way Tcl prints one (`{ a b}` prints its space)
        if (items.join(' ') !== t || items.some(x => x === '' || /[\s{}"\\$[\];]/.test(x))) return null;
        return items.map(x => (isNumber(x) ? x : pseudoString(x)));
    };
    const putsStmt = (a, scope, p) => {
        let args = a;
        if (bareText(args[0]) === '-nonewline') throw new TclReadError('puts -nonewline (say always ends the line)');
        if (args.length === 2) {
            const ch = bareText(args[0]);
            if (ch !== 'stdout') throw new TclReadError(`puts to ${ch || 'a channel'} — blocks say on the stage only`);
            args = args.slice(1);
        }
        if (args.length !== 1) throw new TclReadError('puts with these arguments');
        return [`${p}say ${valueOf(args[0], scope)}`];
    };
    // `after [expr {int(S * 1000)}]` (the generator's wait) → S, else null.
    const afterSeconds = w => {
        if (!w.parts || w.parts.length !== 1 || w.parts[0].cmd === undefined) return null;
        const c = parse(w.parts[0].cmd)[0];
        if (!c || c.words.length !== 2 || bareText(c.words[0]) !== 'expr' || c.words[1].brace === undefined) return null;
        const m = /^int\((.*) \* 1000\)$/s.exec(c.words[1].brace.trim());
        return m ? m[1] : null;
    };
    // for {set _rK 0} {$_rK < N} {incr _rK} {…} — the generator's REPEAT N.
    const forRepeat = ([init, condW, next, bodyW], scope, depth) => {
        const m = /^set (_r\d+) 0$/.exec((init.brace || '').trim());
        if (!m || bodyW.brace === undefined) return null;
        const k = m[1];
        const c = new RegExp(`^\\$${k} < (.+)$`).exec((condW.brace || '').trim());
        if (!c || (next.brace || '').trim() !== `incr ${k}`) return null;
        const limitVar = /^\$(_n\d+)$/.exec(c[1]);
        const limit = limitVar && pendingLimit.has(limitVar[1]) ? pendingLimit.get(limitVar[1]) : exprOfText(c[1], scope, init.line);
        if (limitVar) pendingLimit.delete(limitVar[1]);
        return [`${pad(depth)}REPEAT ${limit}:`, ...loopBody(bodyW, scope, depth + 1)];
    };
    const procSignature = (rawName, paramsWord) => {
        const params = [];
        const defaults = [];
        for (const el of parseList(bareText(paramsWord) ?? '')) {
            if (el.brace !== undefined) {
                const [pn, dflt] = parseList(el.brace).map(bareText);
                params.push(pn);
                defaults.push(dflt ?? undefined);
            } else {
                params.push(bareText(el));
                defaults.push(undefined);
            }
        }
        if (params.includes('args')) throw new TclReadError(`proc ${rawName} takes variadic args — a block has a fixed argument list`);
        const bad = [rawName, ...params].find(n => !IDENT.test(String(n)));
        if (bad !== undefined) throw new TclReadError(`the name "${bad}" is not one blocks can hold`);
        return {name: rawName, params, defaults};
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
        if (condW.brace === undefined && /^(\d+|true|yes|on)$/.test(bareText(condW) || '') && bareText(condW) !== '0') {
            return [`${p}FOREVER:`, ...inner];
        }
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
        // The step moves to the end of the body, where a `continue` would skip it.
        if (/\bcontinue\b/.test(bodyW.brace || '')) throw new TclReadError('for with continue — the step would be skipped');
        const head = statements(parse(init.brace, init.line), scope, depth);
        const step = statements(parse(next.brace, next.line), scope, depth + 1);
        const inner = loopBody(bodyW, scope, depth + 1);
        if ([...head, ...step].some(l => /^\s*raw /.test(l))) throw new TclReadError('for with an init or step blocks cannot say');
        const [c, calls] = withHoist(scope, () => condOf(condW, scope));
        if (c === '(1 = 1)' && !calls.length) return [...head, `${p}FOREVER:`, ...inner, ...step];
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
        // An unbraced body is one word, run as a script: `if {…} break`.
        return statements(parse(wordSource(w), w.line), scope, depth, tail);
    };

    const top = parse(text);
    const initial = new Map();
    const listInit = new Map();
    // Generated programs fence their initialisers; those become GLOBALs, not statements.
    const vs = top.findIndex(c => c.words[0].comment === MARK_VARS.slice(2));
    const ps = top.findIndex(c => c.words[0].comment === MARK_PROGRAM.slice(2));
    let main = top;
    if (vs >= 0 && ps > vs) {
        for (const c of top.slice(vs + 1, ps)) {
            if (bareText(c.words[0]) !== 'set' || c.words.length !== 3) continue;
            try {
                const name = rename(bareText(c.words[1]));
                const v = c.words[2];
                const inner = v.parts && v.parts.length === 1 && v.parts[0].cmd !== undefined ? parse(v.parts[0].cmd)[0] : null;
                if (inner && bareText(inner.words[0]) === 'list' && lists.has(name)) {
                    const items = inner.words.slice(1).map(bareText);
                    if (!items.some(x => x === null)) {
                        listsSeen.add(name);
                        listInit.set(name, items.map(x => (isNumber(x) ? x : pseudoString(x))));
                        continue;
                    }
                }
                const lit = bareText(v);
                globals.add(name);
                if (lit !== null && lit !== '' && lit !== '0') initial.set(name, isNumber(lit) ? lit : pseudoString(lit));
            } catch (e) {
                if (!(e instanceof TclReadError)) throw e;
            }
        }
        main = [...top.slice(0, vs), ...top.slice(ps + 1)];
    } else if (ps >= 0) {
        main = [...top.slice(0, ps), ...top.slice(ps + 1)];
    }
    // Procs whose value something uses ([f …] anywhere): their last command
    // is their result.
    const usedForValue = new Set();
    const procRefusal = new Map();
    // Register every proc first, so a call reads as a call wherever it sits.
    for (const c of main) {
        const w = c.words;
        const name = bareText(w[1]);
        if (bareText(w[0]) === 'proc' && w.length === 4 && name && !helper(name)) {
            try {
                const sig = procSignature(name, w[2]);
                if (keepRaw.has(sig.name)) throw new TclReadError(`proc ${name} has default arguments that raw Tcl relies on`);
                userProcs.set(name.replace(/^::/, ''), sig);
                const esc = name.replace(/^::/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                if (new RegExp(`\\[\\s*(::)?${esc}(\\s|\\])`).test(text)) usedForValue.add(sig.name);
            } catch (e) {
                if (!(e instanceof TclReadError)) throw e;
                procRefusal.set(name, e.message);
            }
        }
    }
    const mainLines = statements(main, {top: true}, 1);
    const procLines = [];
    for (const pr of procs) {
        // An assignment to a parameter stays raw Tcl (blocks cannot assign to
        // an argument, and renaming it would desynchronise raw commands).
        const scope = {params: pr.params, proc: pr.name, globalsDeclared: new Set()};
        const bodyText = pr.body.brace !== undefined ? pr.body.brace : '';
        const bodyLines = statements(parse(bodyText, pr.body.line), scope, 1, true);
        procLines.push(`DEFINE ${[pr.name, ...pr.params.map(x => `(${x})`)].join(' ')}:`,
            // pseudocode refuses a DEFINE with no statement under it (a comment
            // is not one), and the generator writes the placeholder back.
            ...bodyLines, ...(bodyLines.some(l => !/^\s*#/.test(l)) ? [] : ['  wait 0 secs']), '');
    }
    const lines = [...[...globals].map(g => (initial.has(g) ? `GLOBAL ${g} = ${initial.get(g)}` : `GLOBAL ${g}`)),
        ...[...listsSeen].map(l => (listInit.get(l) && listInit.get(l).length ?
            `GLOBAL LIST ${l} = [${listInit.get(l).join(', ')}]` : `GLOBAL LIST ${l}`))];
    if (lines.length) lines.push('');
    lines.push(...procLines);
    if (mainLines.length) lines.push('WHEN flag clicked:', ...mainLines);
    if (!procLines.length && !mainLines.length && text.trim()) {
        warnings.push('no Tcl the blocks can represent was found');
    }
    const rawLines = lines.filter(l => /^\s*raw "/.test(l)).join('\n');
    const retry = procs.filter(pr => pr.defaults.some(d => d !== undefined) &&
        new RegExp(`(^|[^\\w:])(::)?${pr.name}(?![\\w:])`).test(rawLines)).map(pr => pr.name);
    return {pseudocode: `${lines.join('\n').replace(/\n+$/, '')}\n`, warnings, retry};
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
