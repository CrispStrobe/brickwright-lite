/**
 * Blocks ⇄ fe for the Code tab's fe tab: rxi's tiny Lisp as it runs on the
 * DOS bench (static/roms/fe.exe, DOS_TOOLCHAINS 'fe'). Two halves:
 *
 *   generateFe(project)       blocks → fe source        {ok, fe, reasons, warnings}
 *   feToPseudocode(source)    fe source → pseudocode   {pseudocode, warnings} (default export)
 *
 * WHAT FE IS, MEASURED ON THE BENCH:
 *   - Special forms let = if fn mac while quote and or do; primitives cons car
 *     cdr setcar setcdr list not is atom print < <= + - * /. Nothing else: no
 *     mod, no floor, no string concatenation, no return/break.
 *   - Numbers are floats ("%.7g"): 7/2 is 3.5, as in Scratch.
 *   - nil is the only false value; comparisons return t or nil, and `print`
 *     shows them as "t"/"nil" (Scratch says true/false).
 *   - `=` assigns the innermost binding, else the global one, so a `fn` body
 *     sees and changes globals. `let` binds only inside a body (fn/do/while):
 *     at top level it is a no-op, which is why top-level counters use `=` and
 *     counters inside a custom block use `let` (recursion must not share them).
 *   - An error prints "error: …" and ends the program (exit 1).
 *
 * Refused by name: a second WHEN script, join (fe cannot build a string),
 * stop (no return), lists, and anything outside the console subset.
 */
import {collectScripts, decodeInput, field, procName, procPrototype, substackId} from './project-walk.js';

const HELPERS = {
    // Scratch's mod is floored; fe has no floor, so subtract down to [0, b).
    mod: '(= mod (fn (a b) (let r a) (while (<= b r) (= r (- r b))) (while (< r 0) (= r (+ r b))) r))',
    // fe has no clock, so a wait is a no-op that keeps its argument.
    wait: '(= wait (fn (s) nil))'
};
const HELPER_NAMES = new Set(Object.keys(HELPERS));
const RESERVED = new Set(['let', 'fn', 'mac', 'if', 'while', 'quote', 'and', 'or', 'do', 'cons', 'car', 'cdr',
    'setcar', 'setcdr', 'list', 'not', 'is', 'atom', 'print', 't', 'nil', ...HELPER_NAMES]);
const MARK_VARS = '; --- variables ---';
const MARK_PROGRAM = '; --- program ---';

const feString = s => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

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
 * A list form over several lines: `(head` then each child indented, the
 * closing paren on the last line (Lisp style). Children are line arrays.
 */
function form (head, children) {
    if (!children.length) return [`(${head})`];
    const lines = [`(${head}`];
    for (const c of children) lines.push(...c.map(l => `  ${l}`));
    lines[lines.length - 1] += ')';
    return lines;
}

/**
 * Blocks → fe.
 * @param {object} project serialized SB3 project
 * @returns {{ok: boolean, fe: string, reasons: string[], warnings: string[]}}
 */
export function generateFe (project) {
    const reasons = [];
    const warnings = [];
    const warn = w => { if (!warnings.includes(w)) warnings.push(w); };
    const refuse = r => { if (!reasons.includes(r)) reasons.push(r); };
    const used = new Set();
    const taken = new Set();
    const varName = makeNamer(taken);
    const procNamer = makeNamer(taken);
    let loopSeq = 0;

    const {flags, procs, other} = collectScripts(project);
    if (flags.length > 1) {
        refuse(`fe runs one script at a time: this project has ${flags.length} "when flag clicked" scripts`);
    }
    for (const o of other) {
        if (/^(argument_|procedures_prototype)/.test(o.block.opcode)) continue;
        refuse(`no fe form for the script starting with ${o.block.opcode}`);
    }
    const procInfo = new Map();
    for (const p of procs) {
        const proto = procPrototype(p.block, p.blocks);
        const params = proto.argumentNames.map(a => String(a).replace(/[^A-Za-z0-9_]/g, '_') || 'arg');
        procInfo.set(proto.proccode, {name: procNamer(procName(proto.proccode)), params, proto});
    }

    // ---- expressions -------------------------------------------------
    const expr = (input, blocks, ctx) => {
        const d = decodeInput(input, blocks);
        switch (d.kind) {
        case 'num': return String(d.value);
        case 'str': return feString(d.value);
        case 'var': return varName(d.name);
        case 'list': refuse(`fe programs here have no Scratch lists ("${d.name}")`); return 'nil';
        case 'block': return reporter(d.block, blocks, ctx);
        default: return '""';
        }
    };
    const reporter = (b, blocks, ctx) => {
        const e = k => expr(b.inputs[k], blocks, ctx);
        switch (b.opcode) {
        case 'operator_add': return `(+ ${e('NUM1')} ${e('NUM2')})`;
        case 'operator_subtract': return `(- ${e('NUM1')} ${e('NUM2')})`;
        case 'operator_multiply': return `(* ${e('NUM1')} ${e('NUM2')})`;
        case 'operator_divide': return `(/ ${e('NUM1')} ${e('NUM2')})`;
        case 'operator_mod': used.add('mod'); return `(mod ${e('NUM1')} ${e('NUM2')})`;
        case 'operator_gt': return `(< ${e('OPERAND2')} ${e('OPERAND1')})`;
        case 'operator_lt': return `(< ${e('OPERAND1')} ${e('OPERAND2')})`;
        case 'operator_equals': return `(is ${e('OPERAND1')} ${e('OPERAND2')})`;
        case 'operator_and': return `(and ${e('OPERAND1')} ${e('OPERAND2')})`;
        case 'operator_or': return `(or ${e('OPERAND1')} ${e('OPERAND2')})`;
        case 'operator_not': return `(not ${e('OPERAND')})`;
        case 'operator_join':
            refuse('fe cannot join text (it has no string concatenation) — say the parts separately');
            return '""';
        case 'argument_reporter_string_number':
        case 'argument_reporter_boolean': {
            const name = field(b, 'VALUE');
            const i = (ctx.argNames || []).indexOf(name);
            return i >= 0 ? ctx.params[i] : varName(name);
        }
        case 'data_variable': return varName(field(b, 'VARIABLE'));
        default:
            refuse(`no fe form for the reporter ${b.opcode}`);
            return 'nil';
        }
    };

    // ---- statements (each returns a line array) ----------------------
    const stack = (id, blocks, ctx) => {
        const out = [];
        let b = blocks[id];
        while (b) {
            out.push(statement(b, blocks, ctx));
            b = blocks[b.next];
        }
        return out;
    };
    const body = (b, key, blocks, ctx) => {
        const sid = substackId(b, key);
        return sid ? stack(sid, blocks, ctx) : [];
    };
    const statement = (b, blocks, ctx) => {
        const e = k => expr(b.inputs[k], blocks, ctx);
        // Top-level `let` is a no-op in fe; inside a fn it keeps recursion's
        // counters apart.
        const bind = ctx.inProc ? 'let' : '=';
        switch (b.opcode) {
        case 'data_setvariableto': return [`(= ${varName(field(b, 'VARIABLE'))} ${e('VALUE')})`];
        case 'data_changevariableby': {
            const n = varName(field(b, 'VARIABLE'));
            return [`(= ${n} (+ ${n} ${e('VALUE')}))`];
        }
        case 'looks_say': case 'looks_think': case 'stc12_print':
            return [`(print ${e(b.inputs.MESSAGE ? 'MESSAGE' : 'VALUE')})`];
        case 'looks_sayforsecs': case 'looks_thinkforsecs':
            used.add('wait');
            warn('fe has no clock: wait is a no-op');
            return [`(print ${e('MESSAGE')})`, `(wait ${e('SECS')})`];
        case 'control_wait':
            used.add('wait');
            warn('fe has no clock: wait is a no-op');
            return [`(wait ${e('DURATION')})`];
        case 'control_repeat': {
            const k = ++loopSeq;
            const times = decodeInput(b.inputs.TIMES, blocks);
            const pre = [];
            let limit = e('TIMES');
            if (times.kind !== 'num') {
                pre.push(`(${bind} _n${k} ${limit})`);
                limit = `_n${k}`;
            }
            pre.push(`(${bind} _r${k} 0)`);
            return [...pre, ...form(`while (< _r${k} ${limit})`,
                [[`(= _r${k} (+ _r${k} 1))`], ...body(b, 'SUBSTACK', blocks, ctx)])];
        }
        case 'control_forever': return form('while t', body(b, 'SUBSTACK', blocks, ctx));
        case 'control_repeat_until': {
            // until not C is while C: no double negation for a hand-written while.
            const inner = decodeInput(b.inputs.CONDITION, blocks);
            if (inner.kind === 'block' && inner.block.opcode === 'operator_not') {
                return form(`while ${expr(inner.block.inputs.OPERAND, blocks, ctx)}`, body(b, 'SUBSTACK', blocks, ctx));
            }
            return form(`while (not ${e('CONDITION')})`, body(b, 'SUBSTACK', blocks, ctx));
        }
        case 'control_while':
            return form(`while ${e('CONDITION')}`, body(b, 'SUBSTACK', blocks, ctx));
        case 'control_if':
            return form(`if ${e('CONDITION')}`, [form('do', body(b, 'SUBSTACK', blocks, ctx))]);
        case 'control_if_else':
            return form(`if ${e('CONDITION')}`, [form('do', body(b, 'SUBSTACK', blocks, ctx)),
                form('do', body(b, 'SUBSTACK2', blocks, ctx))]);
        case 'procedures_call': {
            const info = procInfo.get(String((b.mutation || {}).proccode));
            if (!info) { refuse(`call of an undefined custom block "${(b.mutation || {}).proccode}"`); return []; }
            const args = info.proto.argumentIds.map(id => (b.inputs[id] ? expr(b.inputs[id], blocks, ctx) : '""'));
            return [`(${[info.name, ...args].join(' ')})`];
        }
        case 'control_stop':
            refuse(`fe has no way to "stop ${field(b, 'STOP_OPTION')}" (no return or exit)`);
            return [];
        default:
            refuse(`no fe form for the block ${b.opcode}`);
            return [];
        }
    };

    // ---- assemble ----------------------------------------------------
    const procLines = [];
    for (const p of procs) {
        const info = procInfo.get(procPrototype(p.block, p.blocks).proccode);
        const ctx = {inProc: true, params: info.params, argNames: info.proto.argumentNames};
        procLines.push(...form(`= ${info.name}`, [form(`fn (${info.params.join(' ')})`,
            stack(p.block.next, p.blocks, ctx))]));
    }
    const mainLines = flags.length === 1 ? stack(flags[0].block.next, flags[0].blocks, {inProc: false}).flat() : [];
    const varLines = [];
    for (const target of (project && project.targets) || []) {
        for (const [name, value] of Object.values(target.variables || {})) {
            const n = Number(value);
            varLines.push(`(= ${varName(name)} ${Number.isFinite(n) && String(value).trim() !== '' ?
                String(n) : feString(value)})`);
        }
    }
    if (reasons.length) return {ok: false, fe: '', reasons, warnings};
    const out = [];
    for (const h of Object.keys(HELPERS)) if (used.has(h)) out.push(HELPERS[h]);
    out.push(...procLines);
    if (varLines.length) out.push(MARK_VARS, ...varLines);
    out.push(MARK_PROGRAM, ...mainLines);
    return {ok: true, fe: `${out.join('\n')}\n`, reasons, warnings};
}

// ======================================================================
// fe → pseudocode
// ======================================================================

class FeReadError extends Error {}

/**
 * Read fe source into nodes: {list: [...]}, {num}, {str}, {sym}, and
 * top-level {comment} (kept so the generator's markers can be found).
 */
function readAll (src) {
    const nodes = [];
    let i = 0;
    let line = 1;
    const n = src.length;
    const skip = keepComments => {
        while (i < n) {
            const c = src[i];
            if (c === '\n') { line++; i++; } else if (c === ' ' || c === '\t' || c === '\r') { i++; } else if (c === ';') {
                const j = src.indexOf('\n', i);
                const text = src.slice(i, j < 0 ? n : j).trim();
                if (keepComments) nodes.push({comment: text, line});
                i = j < 0 ? n : j;
            } else break;
        }
    };
    const read = () => {
        skip(false);
        if (i >= n) throw new FeReadError(`line ${line}: unexpected end of input`);
        const c = src[i];
        const at = line;
        if (c === '(') {
            i++;
            const items = [];
            for (;;) {
                skip(false);
                if (i >= n) throw new FeReadError(`line ${at}: unclosed (`);
                if (src[i] === ')') { i++; break; }
                items.push(read());
            }
            return {list: items, line: at};
        }
        if (c === ')') throw new FeReadError(`line ${line}: stray )`);
        if (c === "'") { i++; return {list: [{sym: 'quote'}, read()], line: at}; }
        if (c === '"') {
            let s = '';
            i++;
            while (i < n && src[i] !== '"') {
                if (src[i] === '\\' && i + 1 < n) {
                    i++;
                    s += {n: '\n', r: '\r', t: '\t'}[src[i]] || src[i];
                } else {
                    if (src[i] === '\n') line++;
                    s += src[i];
                }
                i++;
            }
            if (i >= n) throw new FeReadError(`line ${at}: unclosed string`);
            i++;
            return {str: s, line: at};
        }
        let j = i;
        while (j < n && !' \n\t\r();'.includes(src[j])) j++;
        const tok = src.slice(i, j);
        i = j;
        const num = Number(tok);
        if (tok !== '' && Number.isFinite(num) && /^[-+.\d]/.test(tok)) return {num: tok, line: at};
        return {sym: tok, line: at};
    };
    for (;;) {
        skip(true);
        if (i >= n) break;
        nodes.push(read());
    }
    return nodes;
}

const pseudoString = s => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const PSEUDO_CLASH = new Set(['x', 'y']);
const sym = node => (node && node.sym !== undefined ? node.sym : null);
const head = node => (node && node.list && node.list.length ? sym(node.list[0]) : null);

/**
 * fe → pseudocode (the importer's reader contract: returns
 * {pseudocode, warnings} or throws).
 */
export default function feToPseudocode (source) {
    const warnings = [];
    const globals = new Set();
    const procs = [];
    const userProcs = new Map();
    const rename = name => {
        if (PSEUDO_CLASH.has(name)) {
            const w = `variable "${name}" renamed to "${name}_var" (pseudocode reads "set ${name}" as motion)`;
            if (!warnings.includes(w)) warnings.push(w);
            return `${name}_var`;
        }
        return name;
    };
    const varRef = (name, scope) => {
        if (scope.params && scope.params.includes(name)) return name;
        globals.add(rename(name));
        return rename(name);
    };

    // ---- expressions -------------------------------------------------
    const fold = (op, args) => args.reduce((a, b) => `(${a} ${op} ${b})`);
    const expr = (node, scope) => {
        if (node.num !== undefined) return node.num;
        if (node.str !== undefined) return pseudoString(node.str);
        if (node.sym !== undefined) {
            if (node.sym === 't') return '(1 = 1)';
            if (node.sym === 'nil') return '(1 = 0)';
            return varRef(node.sym, scope);
        }
        const h = head(node);
        const args = node.list.slice(1).map(a => expr(a, scope));
        switch (h) {
        case '+': case '*':
            if (!args.length) throw new FeReadError(`(${h}) with no arguments`);
            return args.length === 1 ? args[0] : fold(h, args);
        case '-': case '/':
            if (!args.length) throw new FeReadError(`(${h}) with no arguments`);
            return args.length === 1 ? args[0] : fold(h, args);
        case '<':
            if (args.length !== 2) break;
            // `(< 3 n)` is what the generator writes for `n > 3`: read a
            // literal on the left back that way, so it survives as written.
            return node.list[1].num !== undefined && node.list[2].num === undefined ?
                `(${args[1]} > ${args[0]})` : `(${args[0]} < ${args[1]})`;
        case '<=': if (args.length === 2) return `(not (${args[0]} > ${args[1]}))`; break;
        case 'is': if (args.length === 2) return `(${args[0]} = ${args[1]})`; break;
        case 'and': case 'or':
            if (args.length) return args.length === 1 ? args[0] : fold(h, args);
            break;
        case 'not': if (args.length === 1) return `(not ${args[0]})`; break;
        case 'mod': if (args.length === 2) return `(${args[0]} mod ${args[1]})`; break;
        default:
            if (userProcs.has(h)) throw new FeReadError(`(${h} …) uses a function's result; blocks have no reporter custom blocks`);
        }
        throw new FeReadError(`no block for the fe expression (${h || '…'})`);
    };
    // ---- statements --------------------------------------------------
    const pad = d => '  '.repeat(d);
    const statements = (nodes, scope, depth) => {
        const out = [];
        const p = pad(depth);
        for (let k = 0; k < nodes.length; k++) {
            const node = nodes[k];
            if (node.comment !== undefined) continue;
            const h = head(node);
            const a = node.list ? node.list.slice(1) : [];
            try {
                if (!node.list) throw new FeReadError('a bare value is not a statement');
                // REPEAT n, as the generator writes it:
                //   [(= _nK <n>)]  (= _rK 0)  (while (< _rK <n>|_nK) (= _rK (+ _rK 1)) …)
                const isBind = h === '=' || h === 'let';
                if (isBind && a.length === 2 && /^_n\d+$/.test(sym(a[0]) || '') && nodes[k + 1] &&
                    /^_r\d+$/.test(sym((nodes[k + 1].list || [])[1]) || '')) {
                    const r = repeatN(nodes[k + 1], nodes[k + 2], scope, depth, {name: sym(a[0]), value: a[1]});
                    if (r) { out.push(...r); k += 2; continue; }
                }
                if (isBind && a.length === 2 && /^_r\d+$/.test(sym(a[0]) || '')) {
                    const r = repeatN(node, nodes[k + 1], scope, depth, null);
                    if (r) { out.push(...r); k++; continue; }
                }
                if (isBind && a.length === 2 && sym(a[0])) {
                    const name = sym(a[0]);
                    if (head(a[1]) === 'fn') {
                        if (!scope.top || h !== '=') throw new FeReadError('a function defined inside a body');
                        if (HELPER_NAMES.has(name)) continue;
                        procs.push({name, params: userProcs.get(name), body: a[1].list.slice(2)});
                        continue;
                    }
                    if (scope.params && scope.params.includes(name)) {
                        throw new FeReadError(`assigning to the argument "${name}" — blocks cannot`);
                    }
                    const target = rename(name);
                    globals.add(target);
                    const v = a[1];
                    if (head(v) === '+' && v.list.length === 3 && sym(v.list[1]) === name) {
                        out.push(`${p}change ${target} by ${expr(v.list[2], scope)}`);
                    } else {
                        out.push(`${p}set ${target} to ${expr(v, scope)}`);
                    }
                } else if (h === 'print' && a.length) {
                    // fe prints its arguments separated by spaces.
                    const parts = a.map(x => expr(x, scope));
                    out.push(`${p}say ${parts.reduce((x, y) => `((${x} join " ") join ${y})`)}`);
                } else if (h === 'wait' && a.length === 1) {
                    out.push(`${p}wait ${expr(a[0], scope)} secs`);
                } else if (h === 'while' && a.length >= 1) {
                    const c = a[0];
                    const inner = statements(a.slice(1), scope, depth + 1);
                    if (sym(c) === 't' || (c.num !== undefined && Number(c.num) !== 0) || c.str !== undefined) {
                        out.push(`${p}FOREVER:`, ...inner);
                    } else if (head(c) === 'not' && c.list.length === 2) {
                        out.push(`${p}REPEAT UNTIL ${expr(c.list[1], scope)}:`, ...inner);
                    } else {
                        out.push(`${p}REPEAT UNTIL (not ${expr(c, scope)}):`, ...inner);
                    }
                } else if (h === 'if' && a.length >= 2) {
                    out.push(...ifChain(a, scope, depth));
                } else if (h === 'do') {
                    out.push(...statements(a, scope, depth));
                } else if (userProcs.has(h)) {
                    const args = a.map(x => {
                        const e = expr(x, scope);
                        return /^[\w.-]+$|^".*"$|^\(.*\)$/s.test(e) ? e : `(${e})`;
                    });
                    out.push(`${p}${[h, ...args].join(' ')}`);
                } else {
                    throw new FeReadError(`no block for the fe form (${h || '…'})`);
                }
            } catch (e) {
                if (!(e instanceof FeReadError)) throw e;
                warnings.push(`unsupported (line ${node.line}): ${e.message}`);
                out.push(`${p}# unsupported: ${h || 'value'}`);
            }
        }
        return out;
    };
    const branch = (node, scope, depth) => statements(head(node) === 'do' ? node.list.slice(1) : [node], scope, depth);
    const ifChain = (a, scope, depth) => {
        const p = pad(depth);
        const out = [`${p}IF ${expr(a[0], scope)} THEN:`, ...branch(a[1], scope, depth + 1)];
        const rest = a.slice(2);
        if (rest.length === 1) out.push(`${p}ELSE:`, ...branch(rest[0], scope, depth + 1));
        else if (rest.length >= 2) out.push(`${p}ELSE:`, ...ifChain(rest, scope, depth + 1));
        return out;
    };
    const repeatN = (init, loop, scope, depth, limitBind) => {
        const counter = sym(init.list[1]);
        if (!init.list[2] || init.list[2].num !== '0' || head(loop) !== 'while') return null;
        const c = loop.list[1];
        if (head(c) !== '<' || c.list.length !== 3 || sym(c.list[1]) !== counter) return null;
        const inc = loop.list[2];
        if (!inc || head(inc) !== '=' || sym(inc.list[1]) !== counter || head(inc.list[2]) !== '+' ||
            sym(inc.list[2].list[1]) !== counter || (inc.list[2].list[2] || {}).num !== '1') return null;
        const limitNode = c.list[2];
        const limit = limitBind && sym(limitNode) === limitBind.name ?
            expr(limitBind.value, scope) : expr(limitNode, scope);
        if (limitBind && sym(limitNode) !== limitBind.name) return null;
        return [`${pad(depth)}REPEAT ${limit}:`, ...statements(loop.list.slice(3), scope, depth + 1)];
    };

    const top = readAll(String(source || ''));
    const vs = top.findIndex(n => n.comment === MARK_VARS);
    const ps = top.findIndex(n => n.comment === MARK_PROGRAM);
    let main = top;
    if (vs >= 0 && ps > vs) {
        for (const n of top.slice(vs + 1, ps)) {
            if (head(n) === '=' && sym(n.list[1])) globals.add(rename(sym(n.list[1])));
        }
        main = [...top.slice(0, vs), ...top.slice(ps + 1)];
    }
    for (const n of main) {
        if (head(n) === '=' && head(n.list[2]) === 'fn' && !HELPER_NAMES.has(sym(n.list[1]))) {
            const params = (n.list[2].list[1] && n.list[2].list[1].list || []).map(sym).filter(Boolean);
            userProcs.set(sym(n.list[1]), params);
        }
    }
    const mainLines = statements(main, {top: true}, 1);
    const procLines = [];
    for (const pr of procs) {
        const bodyLines = statements(pr.body, {params: pr.params}, 1);
        procLines.push(`DEFINE ${[pr.name, ...pr.params.map(x => `(${x})`)].join(' ')}:`,
            ...(bodyLines.length ? bodyLines : ['  wait 0 secs']), '');
    }
    const lines = [...globals].map(g => `GLOBAL ${g}`);
    if (lines.length) lines.push('');
    lines.push(...procLines);
    if (mainLines.length) lines.push('WHEN flag clicked:', ...mainLines);
    if (!procLines.length && !mainLines.length && String(source || '').trim()) {
        warnings.push('no fe the blocks can represent was found');
    }
    return {pseudocode: `${lines.join('\n').replace(/\n+$/, '')}\n`, warnings};
}
