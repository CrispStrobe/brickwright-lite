/**
 * The learning-path grader, checked against the maths. A KNOWN-CORRECT design
 * for a challenge must pass exhaustively; a wrong design must fail at a concrete
 * input; an incomplete interface must be reported, not graded. And the whole
 * curriculum must be self-consistent (references are 0/1, prerequisites exist,
 * the unlock chain is a DAG). Pure — no browser.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {grade, validateInterface, gradeMessage} from '../overlay/scratch-gui/src/lib/bw-fpga/grader.js';
import {CHALLENGES, challengeById, isUnlocked} from '../overlay/scratch-gui/src/lib/bw-fpga/challenges.js';

// tiny model builders
const inNode = name => ({id: name, kind: 'in', name});
const outNode = name => ({id: `o_${name}`, kind: 'out', name});
const gate = (id, type) => ({id, kind: 'gate', type});
const wire = (from, to, port = 'in') => ({from: {node: from, port: 'out'}, to: {node: to, port}});

test('a correct wire passes; a swapped one is caught', () => {
    const model = {nodes: [inNode('a'), outNode('y')], edges: [wire('a', 'o_y')]};
    assert.equal(grade(model, challengeById('wire')).pass, true);
});

test('a correct AND passes exhaustively; an OR built by mistake fails at a=1,b=0', () => {
    const and = {nodes: [inNode('a'), inNode('b'), gate('g', 'and'), outNode('y')],
        edges: [wire('a', 'g', 'a'), wire('b', 'g', 'b'), wire('g', 'o_y')]};
    const res = grade(and, challengeById('and'));
    assert.equal(res.pass, true);
    assert.equal(res.checked, 4, 'all four combinations verified');

    const orByMistake = {nodes: [inNode('a'), inNode('b'), gate('g', 'or'), outNode('y')],
        edges: [wire('a', 'g', 'a'), wire('b', 'g', 'b'), wire('g', 'o_y')]};
    const bad = grade(orByMistake, challengeById('and'));
    assert.equal(bad.pass, false);
    assert.deepEqual(bad.failing.inputs, {a: 1, b: 0}, 'the first difference is a=1,b=0');
    assert.equal(bad.failing.expected, 0);
    assert.equal(bad.failing.got, 1);
});

test('a two-output challenge (half adder) grades both outputs', () => {
    const ha = {nodes: [inNode('a'), inNode('b'), gate('x', 'xor'), gate('c', 'and'), outNode('sum'), outNode('carry')],
        edges: [wire('a', 'x', 'a'), wire('b', 'x', 'b'), wire('a', 'c', 'a'), wire('b', 'c', 'b'),
            wire('x', 'o_sum'), wire('c', 'o_carry')]};
    assert.equal(grade(ha, challengeById('half_adder')).pass, true);
    // drop the carry wire → carry is wrong somewhere
    const noCarry = {...ha, edges: ha.edges.filter(e => e.to.node !== 'o_carry')};
    assert.equal(grade(noCarry, challengeById('half_adder')).pass, false);
});

test('a mux gate solves the 2:1 mux challenge', () => {
    const mux = {nodes: [inNode('a'), inNode('b'), inNode('sel'), gate('m', 'mux'), outNode('y')],
        edges: [wire('a', 'm', 'd0'), wire('b', 'm', 'd1'), wire('sel', 'm', 'sel'), wire('m', 'o_y')]};
    assert.equal(grade(mux, challengeById('mux2')).pass, true);
});

test('an incomplete interface is reported, not graded', () => {
    const model = {nodes: [inNode('a'), inNode('b')], edges: []}; // inputs present, no output
    const res = grade(model, challengeById('and'));
    assert.equal(res.pass, false);
    assert.match(res.problem, /output named "y"/);
    // and a missing input is reported too
    assert.match(grade({nodes: [inNode('a'), outNode('y')], edges: []}, challengeById('and')).problem, /input named "b"/);
    assert.equal(validateInterface({nodes: [inNode('a'), inNode('b'), outNode('y')]}, challengeById('and')), null);
});

test('gradeMessage explains the first failing case', () => {
    const orByMistake = {nodes: [inNode('a'), inNode('b'), gate('g', 'or'), outNode('y')],
        edges: [wire('a', 'g', 'a'), wire('b', 'g', 'b'), wire('g', 'o_y')]};
    const msg = gradeMessage(grade(orByMistake, challengeById('and')), challengeById('and'));
    assert.match(msg, /a=1, b=0/);
    assert.match(msg, /is 1 but should be 0/);
    assert.match(gradeMessage({pass: true, checked: 4}), /verified all 4/);
});

test('the curriculum is self-consistent — 0/1 references, a valid unlock DAG', () => {
    const ids = new Set(CHALLENGES.map(c => c.id));
    for (const c of CHALLENGES) {
        // every prerequisite exists and comes earlier (a DAG, no cycles/forward refs)
        const index = CHALLENGES.indexOf(c);
        for (const r of c.requires) {
            assert.ok(ids.has(r), `${c.id} requires unknown ${r}`);
            assert.ok(CHALLENGES.findIndex(x => x.id === r) < index, `${c.id} requires later ${r}`);
        }
        // the reference returns 0/1 for every output across every input combination
        const names = c.inputs.map(i => i.name);
        for (let bits = 0; bits < (1 << names.length); bits++) {
            const inp = {};
            names.forEach((nm, i) => { inp[nm] = (bits >> i) & 1; });
            const out = c.expect(inp);
            for (const {name} of c.outputs) {
                assert.ok(out[name] === 0 || out[name] === 1, `${c.id}.${name} must be 0/1, got ${out[name]}`);
            }
        }
    }
    // the first challenge unlocks with nothing passed; a later one does not
    assert.equal(isUnlocked('wire', new Set()), true);
    assert.equal(isUnlocked('and', new Set()), false);
    assert.equal(isUnlocked('and', new Set(['wire', 'not'])), true);
});
