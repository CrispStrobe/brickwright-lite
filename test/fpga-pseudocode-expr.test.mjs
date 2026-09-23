// "a AND NOT b" -> gates, and the truth table has to agree.
//
// This is option C from docs/PSEUDOCODE-TO-VERILOG.md. The claim is narrow and
// checkable: a boolean expression over 1-bit inputs becomes the SAME function
// in gates, and everything else is refused by name.
//
// Two standards are applied, both the repo's own:
//   1. BEHAVIOUR — the model is evaluated on every input combination and
//      compared against the expression's meaning, computed independently here.
//      A structural check ("it made an AND node") would pass on a circuit wired
//      backwards.
//   2. THE ROUND TRIP — model -> Verilog -> model, which is what
//      sb3-creator-chost.js calls the proof that emission loses nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import {expressionToModel, isLowerable} from '../overlay/scratch-gui/src/lib/bw-fpga/pseudocode-expr.js';
import {evalModel} from '../overlay/scratch-gui/src/lib/bw-fpga/gate-eval.js';
import {modelToVerilog} from '../overlay/scratch-gui/src/lib/bw-fpga/gate-builder.js';
import {verilogToModel} from '../overlay/scratch-gui/src/lib/bw-fpga/verilog-to-model.js';

/** Drive every combination of `names` through a model and read output `out`. */
const truthTable = (model, names, out = 'y') => {
    const rows = [];
    for (let i = 0; i < (1 << names.length); i++) {
        const inputs = {};
        names.forEach((nm, b) => { inputs[nm] = (i >> b) & 1; });
        // evalModel returns {values, outputs, settled}; the named ports are in `outputs`.
        const {outputs} = evalModel(model, inputs);
        rows.push(outputs[out] ? 1 : 0);
    }
    return rows;
};

const CASES = [
    {expr: 'a', names: ['a'], fn: v => v.a},
    {expr: 'NOT a', names: ['a'], fn: v => (v.a ? 0 : 1)},
    {expr: 'a AND b', names: ['a', 'b'], fn: v => v.a & v.b},
    {expr: 'a OR b', names: ['a', 'b'], fn: v => v.a | v.b},
    {expr: 'a AND NOT b', names: ['a', 'b'], fn: v => v.a & (v.b ? 0 : 1)},
    {expr: 'NOT (a AND b)', names: ['a', 'b'], fn: v => ((v.a & v.b) ? 0 : 1)},
    {expr: 'a OR b AND c', names: ['a', 'b', 'c'], fn: v => v.a | (v.b & v.c)},   // AND binds tighter
    {expr: '(a OR b) AND c', names: ['a', 'b', 'c'], fn: v => (v.a | v.b) & v.c},
    {expr: 'a and not b or c', names: ['a', 'b', 'c'], fn: v => (v.a & (v.b ? 0 : 1)) | v.c}
];

test('every accepted expression computes the function it says', () => {
    for (const {expr, names, fn} of CASES) {
        const {model, problem} = expressionToModel(expr, {inputs: names});
        assert.equal(problem, null, `${expr}: ${problem}`);
        const got = truthTable(model, names);
        const want = [];
        for (let i = 0; i < (1 << names.length); i++) {
            const v = {};
            names.forEach((nm, b) => { v[nm] = (i >> b) & 1; });
            want.push(fn(v) ? 1 : 0);
        }
        assert.deepEqual(got, want, `${expr} produced the wrong truth table`);
    }
});

test('AND binds tighter than OR — the one precedence mistake that still looks plausible', () => {
    // a OR b AND c and (a OR b) AND c differ on exactly one row: a=1,b=0,c=0.
    const loose = expressionToModel('a OR b AND c', {inputs: ['a', 'b', 'c']}).model;
    const tight = expressionToModel('(a OR b) AND c', {inputs: ['a', 'b', 'c']}).model;
    assert.notDeepEqual(truthTable(loose, ['a', 'b', 'c']), truthTable(tight, ['a', 'b', 'c']),
        'if these agree, precedence is not being applied at all');
    assert.equal(evalModel(loose, {a: 1, b: 0, c: 0}).outputs.y ? 1 : 0, 1);
    assert.equal(evalModel(tight, {a: 1, b: 0, c: 0}).outputs.y ? 1 : 0, 0);
});

test('THE ROUND TRIP: model -> Verilog -> model keeps the function', () => {
    for (const {expr, names} of CASES) {
        const {model} = expressionToModel(expr, {inputs: names});
        const {verilog, problems} = modelToVerilog(model, {moduleName: 'expr'});
        assert.deepEqual(problems, [], `${expr}: emission problems ${JSON.stringify(problems)}`);
        // verilogToModel returns {model, problems} — the model is not the return value.
        const {model: back, problems: readProblems} = verilogToModel(verilog);
        assert.deepEqual(readProblems, [], `${expr}: read-back problems ${JSON.stringify(readProblems)}`);
        assert.ok(back && back.nodes && back.nodes.length, `${expr}: nothing read back`);
        assert.deepEqual(truthTable(back, names), truthTable(model, names),
            `${expr}: the circuit read back from Verilog computes something else`);
    }
});

test('one pin read twice is ONE input node, not two', () => {
    const {model} = expressionToModel('a AND NOT a', {inputs: ['a']});
    assert.equal(model.nodes.filter(n => n.kind === 'in').length, 1, 'a is one wire however often it is read');
    assert.deepEqual(truthTable(model, ['a']), [0, 0], 'a AND NOT a is always false');
});

test('refusals name the reason, and cover what the corpus actually contains', () => {
    // Names are declared here so the COMPARISON is what gets refused; with
    // undeclared names the parser refuses at the name first, which is also
    // right but tests a different rule.
    const cases = [
        ['a >= 0', /compares values|arithmetic/],
        ['a = 3', /compares values|arithmetic/],
        ['a AND 1', /value/],
        ['a AND', /ends where a value was expected/],
        ['(a AND b', /never closed/],
        ['a b', /left over/],
        ['', /no expression/]
    ];
    for (const [expr, re] of cases) {
        const {model, problem} = expressionToModel(expr, {inputs: ['a', 'b']});
        assert.equal(model, null, `"${expr}" should be refused`);
        assert.match(problem, re, `"${expr}" refused with the wrong reason: ${problem}`);
    }
});

test('the shape every real corpus boolean has is refused, whichever rule catches it first', () => {
    // `IF hit >= 0 AND key < 0` — 0 of 282 shipped programs get past this, and
    // the measurement in docs/PSEUDOCODE-TO-VERILOG.md is why this is an action
    // and not a tab. Either refusal is correct; what matters is that it never
    // silently becomes gates.
    for (const expr of ['hit >= 0 AND key < 0', 'key_input = "0" OR key_input = "1"', 'op = 4 AND NOT entry = 0']) {
        const {model, problem} = expressionToModel(expr, {inputs: ['a', 'b']});
        assert.equal(model, null, `"${expr}" must not become a circuit`);
        assert.ok(problem && problem.length > 0, 'and it must say why');
    }
});

test('a name that is not a declared 1-bit input is refused by name', () => {
    const {model, problem} = expressionToModel('a AND ldr', {inputs: ['a']});
    assert.equal(model, null);
    assert.match(problem, /"ldr" is not a 1-bit input pin/);
    // …and with no pin list at all, a bare expression is accepted on its own terms.
    assert.equal(expressionToModel('a AND ldr').problem, null);
});

test('isLowerable decides whether the action is even offered', () => {
    assert.equal(isLowerable('a AND b', {inputs: ['a', 'b']}), true);
    assert.equal(isLowerable('IF hit >= 0 AND key < 0 THEN:', {inputs: ['a']}), false);
});
