#!/usr/bin/env node
/**
 * HOW MUCH SHIPPED PSEUDOCODE IS IN THE COMBINATIONAL SUBSET?
 *
 * docs/PSEUDOCODE-TO-VERILOG.md recommends option A — "boolean expressions over
 * 1-bit inputs become a circuit; everything else is refused by name" — and then
 * lists as still open:
 *
 *   "How much pseudocode is actually in the subset? Worth measuring against the
 *    shipped examples before building: if almost nothing qualifies, C is the
 *    better shape."
 *
 * This is that measurement. It is deliberately a SCRIPT and not a test: it
 * reports a number about the corpus as it stands, and the corpus is allowed to
 * change. test/verilog-subset-census.test.mjs pins the parts that would make
 * the number a lie if they rotted.
 *
 * WHAT COUNTS. Two different questions, and conflating them would flatter the
 * result:
 *
 *   1. EXPRESSION-LEVEL — does the program contain a boolean expression over
 *      1-bit inputs that could become gates? This is what a subtab would show
 *      something for.
 *   2. PROGRAM-LEVEL — is the WHOLE program combinational: no time, no state,
 *      no analog? This is what "your program is a circuit" would need, and it
 *      is the stronger claim a learner would hear.
 *
 * Run: node scripts/measure-verilog-subset.mjs [--json] [--examples DIR]
 */
import {readFileSync, readdirSync, existsSync} from 'node:fs';
import path from 'node:path';
import {expressionToModel, conditionOf} from '../overlay/scratch-gui/src/lib/bw-fpga/pseudocode-expr.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const argOf = name => {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : undefined;
};
const EXAMPLES = path.resolve(argOf('examples') || path.join(ROOT, 'overlay/scratch-gui/examples'));

/** A line's code part: everything before a `#` comment, trimmed. */
export const codeOf = line => line.split('#')[0].trim();

/**
 * Pin declarations: `PIN name = P1.0 OUTPUT ACTIVE LOW`, `PIN ldr = P1.3 ANALOG`.
 * Only a digital INPUT is a 1-bit input; ANALOG and PWM are not, and an OUTPUT
 * is not an input at all.
 */
export const parsePins = text => {
    const pins = new Map();
    for (const raw of text.split('\n')) {
        const m = /^PIN\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\S+\s+([A-Z]+)/.exec(codeOf(raw));
        if (m) pins.set(m[1], m[2]);
    }
    return pins;
};

/** The words that make a program depend on TIME or STATE rather than on its inputs. */
const TIME_OR_STATE = [
    {re: /\bwait\b/i, why: 'wait (time)'},
    {re: /\bFOREVER\b/, why: 'FOREVER (loop)'},
    {re: /\bREPEAT\b/, why: 'REPEAT (loop)'},
    {re: /\bWHILE\b/, why: 'WHILE (loop)'},
    {re: /^\s*set\s+[A-Za-z_]/i, why: 'set (variable state)'},
    {re: /\bchange\s+[A-Za-z_]/i, why: 'change (variable state)'},
    {re: /\btimer\b/i, why: 'timer'}
];

/** Boolean operators the subset could lower to gates. */
const BOOL_OPS = [{re: /\bAND\b/, op: 'AND'}, {re: /\bOR\b/, op: 'OR'}, {re: /\bNOT\b/, op: 'NOT'}];

export function analyse (text) {
    const pins = parsePins(text);
    const oneBitIn = [...pins].filter(([, k]) => k === 'INPUT').map(([n]) => n);
    const analog = [...pins].filter(([, k]) => k === 'ANALOG' || k === 'PWM').map(([n]) => n);

    const body = text.split('\n').map(codeOf).filter(l => l && !/^(DEVICE|CLOCK|PIN)\b/.test(l));

    const boolLines = [];
    for (const line of body) {
        const ops = BOOL_OPS.filter(o => o.re.test(line)).map(o => o.op);
        if (!ops.length) continue;
        // THE REAL PARSER DECIDES, not a regex. Asking the thing that would
        // actually do the lowering is the only way this census measures the
        // feature rather than an approximation of it — and it means the
        // refusal REASONS are the ones a learner would see.
        const cond = conditionOf(line);
        const verdict = cond === null ? {problem: 'not an expression position'}
            : expressionToModel(cond, {inputs: oneBitIn});
        boolLines.push({line, ops, cond, lowerable: verdict.problem === null, why: verdict.problem});
    }

    const blockers = [];
    for (const {re, why} of TIME_OR_STATE) {
        if (body.some(l => re.test(l))) blockers.push(why);
    }
    if (analog.length) blockers.push('analog/PWM pin');

    return {
        pins: pins.size, oneBitIn: oneBitIn.length, analog: analog.length,
        boolLines,
        // (1) would a subtab show anything at all?
        hasSubsetExpression: boolLines.some(b => b.lowerable),
        hasAnyBoolean: boolLines.length > 0,
        // (2) could the WHOLE program be a circuit?
        blockers,
        wholeProgramCombinational: blockers.length === 0 && boolLines.length > 0
    };
}

// Importable: the report below runs only when this file IS the entry point, so
// test/verilog-subset-census.test.mjs can import analyse() without printing a
// census as a side effect of importing.
const RUN = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename);

const dirs = !RUN ? [] : existsSync(EXAMPLES)
    ? readdirSync(EXAMPLES).filter(d => existsSync(path.join(EXAMPLES, d, 'program.bw'))).sort()
    : [];
if (RUN && !dirs.length) {
    console.error(`no examples with program.bw under ${EXAMPLES}`);
    process.exit(1);
}
if (!RUN) { /* imported for its analyse(); no report */ }
else {

const rows = dirs.map(d => ({name: d, ...analyse(readFileSync(path.join(EXAMPLES, d, 'program.bw'), 'utf8'))}));
const pct = (n) => `${((100 * n) / rows.length).toFixed(1)} %`;

const withExpr = rows.filter(r => r.hasSubsetExpression);
const withAnyBool = rows.filter(r => r.hasAnyBoolean);
const whole = rows.filter(r => r.wholeProgramCombinational);

if (process.argv.includes('--json')) {
    console.log(JSON.stringify({total: rows.length, withExpr: withExpr.length,
        withAnyBool: withAnyBool.length, whole: whole.length,
        rows: rows.map(({name, hasSubsetExpression, hasAnyBoolean, blockers}) =>
            ({name, hasSubsetExpression, hasAnyBoolean, blockers}))}, null, 2));
    process.exit(0);
}

console.log(`Programs measured: ${rows.length}  (${EXAMPLES.replace(ROOT + '/', '')})\n`);
console.log(`  contains ANY boolean operator      ${String(withAnyBool.length).padStart(4)}  ${pct(withAnyBool.length)}`);
console.log(`  ...over a 1-bit INPUT pin          ${String(withExpr.length).padStart(4)}  ${pct(withExpr.length)}   <- a subtab would show something`);
console.log(`  WHOLE program is combinational     ${String(whole.length).padStart(4)}  ${pct(whole.length)}   <- "your program is a circuit"\n`);

const refusals = new Map();
for (const r of rows) {
    for (const b of r.boolLines) {
        if (b.lowerable) continue;
        const key = (b.why || 'unknown').replace(/"[^"]*"/g, '"…"');
        refusals.set(key, (refusals.get(key) || 0) + 1);
    }
}
if (refusals.size) {
    console.log('Why the parser refuses the booleans that ARE there (its own words):');
    for (const [why, n] of [...refusals].sort((a, b) => b[1] - a[1])) {
        console.log(`  ${String(n).padStart(4)}  ${why}`);
    }
    console.log('');
}

if (withExpr.length) {
    console.log('The programs a combinational subtab would produce anything for:');
    for (const r of withExpr) {
        console.log(`  ${r.name}`);
        for (const b of r.boolLines.filter(x => x.lowerable)) {
            console.log(`      ${b.ops.join('+')}: ${b.line.slice(0, 88)}`);
        }
    }
    console.log('');
}

const reasons = new Map();
for (const r of rows) for (const b of r.blockers) reasons.set(b, (reasons.get(b) || 0) + 1);
console.log('Why whole programs fall outside the subset (a program can have several):');
for (const [why, n] of [...reasons].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${pct(n).padStart(7)}  ${why}`);
}
}
