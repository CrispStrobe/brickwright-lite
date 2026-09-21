// The "build it in real parts" challenges — are they actually passable?
//
// A challenge that cannot be met is worse than no challenge: the learner does
// everything right and the panel still says no. So this does not merely check
// the curriculum data is well-formed — for EVERY realise challenge, it builds
// the gate with EVERY realisation the challenge advertises, grades the result
// on the real solver, and demands a pass. If a `rungs` entry is wrong, or a
// builder cannot make that gate, or the gate does not compute on the board,
// this goes red.
import test from 'node:test';
import assert from 'node:assert/strict';
import {boot} from '../scripts/lesson-bench.mjs';
import {CHALLENGES, challengeById, isUnlocked, isRealise} from '../overlay/scratch-gui/src/lib/bw-fpga/challenges.js';
import {gradeRealisedCircuit, gradeMessageRealised} from '../overlay/scratch-gui/src/lib/bw-fpga/grader.js';
import {buildLogicIcGate} from '../overlay/scratch-gui/src/lib/bw-fpga/logic-ic-board.js';
import {buildCmosGate} from '../overlay/scratch-gui/src/lib/bw-fpga/cmos-board.js';
import {gateToLogicIc} from '../overlay/scratch-gui/src/lib/bw-fpga/logic-ic.js';
import {gateToCmos} from '../overlay/scratch-gui/src/lib/bw-fpga/cmos.js';

const {Circuit} = await boot();

const REALISE = CHALLENGES.filter(isRealise);
/** rung id → how it builds, and whether it can build a given gate at all. */
const RUNGS = {
    ic: {build: buildLogicIcGate, supports: gateToLogicIc, label: '74HC chip'},
    cmos: {build: buildCmosGate, supports: gateToCmos, label: 'CMOS transistors'}
};

test('the learning path HAS real-parts challenges', () => {
    assert.ok(REALISE.length >= 3, `expected a few realise challenges, got ${REALISE.length}`);
});

// ── The claim that matters: each one can actually be passed ─────────────────

for (const c of REALISE) {
    for (const rung of c.rungs) {
        test(`${c.id}: building it as ${RUNGS[rung].label} passes the challenge`, () => {
            const circuit = new Circuit(5.0);
            RUNGS[rung].build(circuit, c.gate);
            const result = gradeRealisedCircuit(circuit, c);
            assert.equal(result.pass, true, gradeMessageRealised(result, c));
            assert.equal(result.checked, 1 << c.inputs.length, 'every input combination was driven');
        });
    }
}

// ── And that a WRONG gate is rejected, so a pass means something ────────────

test('realising the wrong gate fails the challenge', () => {
    // Build each realise challenge's gate on a DIFFERENT challenge's board and
    // expect a refusal wherever the two functions actually differ.
    const twoInput = REALISE.filter(c => c.inputs.length === 2);
    assert.ok(twoInput.length >= 2, 'need two comparable challenges');
    const [first, second] = twoInput;
    const circuit = new Circuit(5.0);
    buildLogicIcGate(circuit, first.gate);
    const result = gradeRealisedCircuit(circuit, second);
    assert.equal(result.pass, false, `${first.gate} should not satisfy ${second.id}`);
    assert.ok(result.failing, 'and it names the row that disagrees');
});

// ── Curriculum consistency ─────────────────────────────────────────────────

test('every realise challenge names a gate its rungs can actually build', () => {
    for (const c of REALISE) {
        assert.ok(c.gate, `${c.id} must name the gate to realise`);
        assert.ok(Array.isArray(c.rungs) && c.rungs.length, `${c.id} must name its rungs`);
        for (const rung of c.rungs) {
            assert.ok(RUNGS[rung], `${c.id} names unknown rung "${rung}"`);
            assert.ok(RUNGS[rung].supports(c.gate),
                `${c.id} claims the ${rung} rung can build ${c.gate}, but the builder has no such realisation`);
        }
    }
});

test('a rung is only omitted when the builder really cannot build that gate', () => {
    // Guards against quietly dropping a rung that would in fact work — the
    // curriculum should offer every realisation a gate has.
    for (const c of REALISE) {
        for (const rung of Object.keys(RUNGS)) {
            if (c.rungs.includes(rung)) continue;
            assert.ok(!RUNGS[rung].supports(c.gate),
                `${c.id} omits the ${rung} rung, but ${c.gate} CAN be built that way — offer it`);
        }
    }
});

test('XOR is the one with no discrete transistor form', () => {
    // The xor_real brief makes this claim to the learner; hold the code to it.
    const xor = REALISE.find(c => c.gate === 'xor');
    assert.ok(xor, 'there is an XOR realise challenge');
    assert.deepEqual(xor.rungs, ['ic'], 'chip only');
    assert.equal(gateToCmos('xor'), null, 'and cmos.js really has no XOR netlist');
});

test('realise challenges have a single output — the one LED that gets read', () => {
    for (const c of REALISE) {
        assert.equal(c.outputs.length, 1, `${c.id} must have exactly one output to read off an LED`);
        assert.ok(!c.sequential, `${c.id} must be combinational — the board grader enumerates inputs`);
        assert.ok(!c.minimize, `${c.id} cannot be graded on gate count: there is no canvas model to count`);
    }
});

test('each realise challenge is gated behind designing that gate on the canvas', () => {
    for (const c of REALISE) {
        assert.ok(c.requires.length, `${c.id} must have prerequisites`);
        // You must have DESIGNED the gate before being asked to build it.
        assert.ok(c.requires.includes(c.gate) || c.requires.some(r => challengeById(r).gate === c.gate),
            `${c.id} should require designing ${c.gate} first`);
        assert.ok(!isUnlocked(c.id, new Set()), `${c.id} must not be open from the start`);
    }
});

test('the realise ladder unlocks in order once its prerequisites pass', () => {
    const passed = new Set();
    // Nothing realise-y is open yet.
    assert.equal(REALISE.some(c => isUnlocked(c.id, passed)), false);
    // Pass every canvas challenge; the first realise step opens.
    for (const c of CHALLENGES.filter(x => !isRealise(x))) passed.add(c.id);
    assert.equal(isUnlocked(REALISE[0].id, passed), true, 'the first real-parts step opens');
    // …and each later one opens only after the one before it.
    for (let i = 1; i < REALISE.length; i++) {
        assert.equal(isUnlocked(REALISE[i].id, passed), false, `${REALISE[i].id} opened too early`);
        passed.add(REALISE[i - 1].id);
        assert.equal(isUnlocked(REALISE[i].id, passed), true, `${REALISE[i].id} should open now`);
    }
});

test('every realise brief tells the learner which button to press', () => {
    for (const c of REALISE) {
        assert.ok(c.brief && c.brief.length > 40, `${c.id} needs a real brief`);
        assert.ok(/⚙|⚛/.test(c.brief), `${c.id}'s brief should name the ⚙ / ⚛ realisation buttons`);
    }
});
