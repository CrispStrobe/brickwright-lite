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
import {gateToLogicIc, LOGIC_IC_GATES} from '../overlay/scratch-gui/src/lib/bw-fpga/logic-ic.js';
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

test('every chip the ⚙ builder offers has a challenge that asks for it', () => {
    // Otherwise a part exists in the product only as somebody's WRONG answer.
    // 74HC32 (OR) and 74HC02 (NOR) were exactly that until this test was added:
    // buildable from the dropdown, reachable by no challenge.
    const covered = new Set(REALISE.map(c => c.gate));
    const orphans = LOGIC_IC_GATES.filter(g => !covered.has(g));
    assert.deepEqual(orphans, [],
        `these chips are buildable but no challenge asks for them: ${
            orphans.map(g => `${gateToLogicIc(g).label} (${g})`).join(', ')}`);
});

test('every gate the ⚛ builder offers has a challenge too, bar the documented one', () => {
    const covered = new Set(REALISE.map(c => c.gate));
    // 'buffer' is deliberate: two inverters in series teaches nothing the NOT
    // challenge has not already taught, so it stays a toy on the dropdown.
    const ALLOWED_UNCOVERED = ['buffer'];
    const cmosGates = ['not', 'buffer', 'nand', 'nor', 'and', 'or'].filter(g => gateToCmos(g));
    const orphans = cmosGates.filter(g => !covered.has(g) && !ALLOWED_UNCOVERED.includes(g));
    assert.deepEqual(orphans, [], `uncovered CMOS gates: ${orphans.join(', ')}`);
});

test('the NOR brief\'s duality claim is true of the actual netlists', () => {
    // The brief tells the learner NAND is PMOS-parallel / NMOS-series and NOR is
    // the mirror image. That is a structural claim about cmos.js, so read it off
    // the netlists: a PMOS sourced directly from vcc is a parallel pull-up, and
    // parallel pull-ups come with series pull-downs.
    const pullUpsOnVcc = g => gateToCmos(g).transistors.filter(t => t.kind === 'pmos' && t.a === 'vcc').length;
    const pullDownsOnGnd = g => gateToCmos(g).transistors.filter(t => t.kind === 'nmos' && (t.a === 'gnd' || t.b === 'gnd')).length;
    assert.equal(pullUpsOnVcc('nand'), 2, 'NAND: both PMOS hang off VCC — parallel');
    assert.equal(pullDownsOnGnd('nand'), 1, 'NAND: only the last NMOS reaches GND — series');
    assert.equal(pullUpsOnVcc('nor'), 1, 'NOR: only the first PMOS hangs off VCC — series');
    assert.equal(pullDownsOnGnd('nor'), 2, 'NOR: both NMOS reach GND — parallel');
    assert.match(challengeById('nor_real').brief, /mirror/i, 'and the brief says so');
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
    const canvasIds = new Set(CHALLENGES.filter(c => !isRealise(c)).map(c => c.id));
    for (const c of REALISE) {
        assert.ok(c.requires.length, `${c.id} must have prerequisites`);
        // You must have DESIGNED the gate before being asked to build it — where
        // there IS a canvas lesson for it. NOR has none (the canvas ladder goes
        // straight from OR to NAND), so it is gated behind OR instead, and its
        // brief teaches the gate itself.
        if (canvasIds.has(c.gate)) {
            assert.ok(c.requires.includes(c.gate),
                `${c.id} should require designing ${c.gate} first`);
        }
        assert.ok(!isUnlocked(c.id, new Set()), `${c.id} must not be open from the start`);
    }
});

test('the realise challenge with no canvas counterpart is NOR, and only NOR', () => {
    // Pins the exception above, so a future gate cannot quietly skip the
    // "design it before you build it" rule by having no canvas lesson.
    const canvasIds = new Set(CHALLENGES.filter(c => !isRealise(c)).map(c => c.id));
    assert.deepEqual(REALISE.filter(c => !canvasIds.has(c.gate)).map(c => c.gate), ['nor']);
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

test('the briefs\' concrete claims match what the builders actually make', () => {
    // The briefs quote part numbers and transistor counts at the learner. Those
    // are checkable, so check them — a brief that lies is worse than a vague
    // one, and nothing else would catch it if a builder changed.
    const byId = id => CHALLENGES.find(c => c.id === id);
    const chipOf = gate => gateToLogicIc(gate).label;
    const transistorsOf = gate => {
        const c = new Circuit(5.0);
        return buildCmosGate(c, gate).transistors.length;
    };
    assert.match(byId('not_real').brief, new RegExp(chipOf('not')), 'the NOT brief names the right chip');
    assert.equal(transistorsOf('not'), 2, 'and "a PMOS and an NMOS" really is two transistors');
    assert.match(byId('and_real').brief, new RegExp(chipOf('and')), 'the AND brief names the right chip');
    assert.match(byId('and_real').brief, /six transistors/, 'and claims six');
    assert.equal(transistorsOf('and'), 6, 'which is what buildCmosGate makes');
    assert.match(byId('nand_real').brief, /four transistors/, 'the NAND brief claims four');
    assert.equal(transistorsOf('nand'), 4, 'which is what buildCmosGate makes');
    assert.match(byId('or_real').brief, new RegExp(chipOf('or')), 'the OR brief names the right chip');
    assert.match(byId('or_real').brief, /six transistors/, 'and claims six');
    assert.equal(transistorsOf('or'), 6, 'which is what buildCmosGate makes');
    assert.match(byId('nor_real').brief, new RegExp(chipOf('nor')), 'the NOR brief names the right chip');
    assert.match(byId('nor_real').brief, /Four transistors/i, 'and claims four');
    assert.equal(transistorsOf('nor'), 4, 'which is what buildCmosGate makes');
    assert.match(byId('xor_real').brief, new RegExp(chipOf('xor')), 'the XOR brief names the right chip');
});

test('every realise brief tells the learner which button to press', () => {
    for (const c of REALISE) {
        assert.ok(c.brief && c.brief.length > 40, `${c.id} needs a real brief`);
        assert.ok(/⚙|⚛/.test(c.brief), `${c.id}'s brief should name the ⚙ / ⚛ realisation buttons`);
    }
});
