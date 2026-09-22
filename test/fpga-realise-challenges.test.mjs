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
import {buildLogicIcCircuit, IC_CIRCUITS} from '../overlay/scratch-gui/src/lib/bw-fpga/logic-ic-circuit.js';
import {challengeBrief} from '../overlay/scratch-gui/src/lib/bw-fpga/challenges.js';
import {STRINGS, LOCALES} from '../overlay/scratch-gui/src/lib/bw-fpga/l10n.js';

const {Circuit} = await boot();

const REALISE = REALISE_ALL();
function REALISE_ALL () { return CHALLENGES.filter(isRealise); }
/** What a realise challenge asks for: one gate, or a named multi-gate circuit. */
const subjectOf = c => c.gate || c.circuit;
/** Challenges that realise a SINGLE gate — the ones the gate rules apply to. */
const GATE_REALISE = REALISE_ALL().filter(c => c.gate);
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
            if (c.circuit) buildLogicIcCircuit(circuit, IC_CIRCUITS[c.circuit]);
            else RUNGS[rung].build(circuit, c.gate);
            const result = gradeRealisedCircuit(circuit, c);
            assert.equal(result.pass, true, gradeMessageRealised(result, c));
            // A challenge that declares its rows is graded on THOSE; only an
            // exhaustive one drives the whole input space.
            const expected = c.sequential
                ? (c.cycles || Object.values(c.stimulus || {})[0].length)
                : c.rows ? (typeof c.rows === 'function' ? c.rows() : c.rows).length
                    : 1 << c.inputs.length;
            assert.equal(result.checked, expected,
                c.sequential ? 'every clock cycle was driven'
                    : c.rows ? 'every declared row was driven' : 'every input combination was driven');
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
    for (const c of GATE_REALISE) {
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
    for (const c of GATE_REALISE) {
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
    const covered = new Set(GATE_REALISE.map(c => c.gate));
    const orphans = LOGIC_IC_GATES.filter(g => !covered.has(g));
    assert.deepEqual(orphans, [],
        `these chips are buildable but no challenge asks for them: ${
            orphans.map(g => `${gateToLogicIc(g).label} (${g})`).join(', ')}`);
});

test('every gate the ⚛ builder offers has a challenge too, bar the documented one', () => {
    const covered = new Set(GATE_REALISE.map(c => c.gate));
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
    assert.match(challengeBrief(challengeById('nor_real'), 'en'), /mirror/i, 'and the brief says so');
});

test('XOR is the one with no discrete transistor form', () => {
    // The xor_real brief makes this claim to the learner; hold the code to it.
    const xor = REALISE.find(c => c.gate === 'xor');
    assert.ok(xor, 'there is an XOR realise challenge');
    assert.deepEqual(xor.rungs, ['ic'], 'chip only');
    assert.equal(gateToCmos('xor'), null, 'and cmos.js really has no XOR netlist');
});

test('a single-gate realise challenge reads exactly one LED', () => {
    for (const c of GATE_REALISE) {
        assert.equal(c.outputs.length, 1, `${c.id} realises one gate, so it reads one LED`);
    }
});

test('a combinational realise challenge is graded by enumeration, a sequential one by clocking', () => {
    for (const c of REALISE) {
        assert.ok(c.outputs.length >= 1, `${c.id} must read something`);
        assert.ok(!c.minimize, `${c.id} cannot be graded on gate count: there is no canvas model to count`);
        if (c.sequential) {
            // Clocking needs a clock to drive and a stimulus to drive it with.
            assert.ok(c.inputs.some(i => i.name === (c.clock || 'clk')),
                `${c.id} is sequential, so it needs a clock input`);
            // A clock-only challenge (the toggle) has nothing to drive but the
            // edges, so it declares `cycles` instead of a stimulus. One or the
            // other must say how long to clock for.
            const cycles = c.cycles || Object.values(c.stimulus || {})[0]?.length;
            assert.ok(cycles > 0, `${c.id} must say how many clock cycles to drive`);
            assert.equal(typeof c.seqExpect, 'function', `${c.id} needs a per-cycle reference`);
        } else {
            assert.equal(typeof c.expect, 'function', `${c.id} needs a truth reference`);
        }
    }
});

test('the sequential realise challenges are exactly the ones that need a clock', () => {
    // Pins the split, so a combinational challenge cannot quietly acquire a
    // stimulus, nor a sequential one lose its clock.
    assert.deepEqual(REALISE.filter(c => c.sequential).map(c => c.id),
        ['register_real', 'toggle_real', 'counter_real']);
});

test('every registry spec has a translated label and hint in every locale', () => {
    for (const [key, spec] of Object.entries(IC_CIRCUITS)) {
        assert.equal(spec.id, key, 'the registry key and the spec id agree');
        for (const loc of LOCALES) {
            assert.ok(STRINGS[loc][`circuit.${key}.label`], `${key} needs a ${loc} label for the picker`);
            assert.ok(STRINGS[loc][`circuit.${key}.hint`], `${key} needs a ${loc} hint for the "try this" line`);
        }
    }
});

test('a multi-gate realise challenge names a spec that really builds its outputs', () => {
    for (const c of REALISE.filter(x => x.circuit)) {
        const spec = IC_CIRCUITS[c.circuit];
        assert.ok(spec, `${c.id} names unknown circuit "${c.circuit}"`);
        assert.deepEqual(spec.outputs, c.outputs.map(o => o.name),
            `${c.id}'s outputs must match the spec's, in order`);
        assert.deepEqual(spec.inputs, c.inputs.map(i => i.name), 'and its inputs');
        for (const g of spec.gates) {
            assert.ok(gateToLogicIc(g.type), `${c.id}'s spec uses ${g.type}, which has no chip`);
        }
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
        const subject = subjectOf(c);
        if (canvasIds.has(subject)) {
            assert.ok(c.requires.includes(subject),
                `${c.id} should require designing ${subject} first`);
        }
        assert.ok(!isUnlocked(c.id, new Set()), `${c.id} must not be open from the start`);
    }
});

test('the challenges with no same-named canvas lesson are exactly the five expected', () => {
    // Pins the exceptions, so a future challenge cannot quietly skip the
    // "design it before you build it" rule by having no canvas lesson.
    //   nor            — the canvas ladder goes straight from OR to NAND
    //   ripple_adder_4 — twenty gates is past what the canvas ladder teaches;
    //                    it is gated behind full_adder_real instead, which is
    //                    the same circuit one bit wide.
    const canvasIds = new Set(CHALLENGES.filter(c => !isRealise(c)).map(c => c.id));
    //   adder_chip_4   — the same function as ripple_adder_4, bought not built;
    //                    gated behind having built it the long way first.
    //   dff            — the canvas lesson is called `register`; the PART is a
    //                    flip-flop, and the challenge requires `register`.
    //   counter2       — two toggles chained; the canvas ladder stops at one.
    assert.deepEqual(REALISE.filter(c => !canvasIds.has(subjectOf(c))).map(subjectOf),
        ['nor', 'ripple_adder_4', 'adder_chip_4', 'dff', 'counter2']);
});

test('a realise challenge with no canvas lesson is gated behind a realise one', () => {
    // It still cannot be the learner's first encounter with the idea.
    const canvasIds = new Set(CHALLENGES.filter(c => !isRealise(c)).map(c => c.id));
    const realiseIds = new Set(REALISE.map(c => c.id));
    for (const c of REALISE.filter(x => !canvasIds.has(subjectOf(x)))) {
        assert.ok(c.requires.some(r => realiseIds.has(r) || canvasIds.has(r)),
            `${c.id} must be gated behind something`);
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

test('the briefs\' concrete claims match what the builders actually make', () => {
    // The briefs quote part numbers and transistor counts at the learner. Those
    // are checkable, so check them — a brief that lies is worse than a vague
    // one, and nothing else would catch it if a builder changed.
    const byId = id => CHALLENGES.find(c => c.id === id);
    const briefOf = id => challengeBrief(byId(id), 'en');
    const chipOf = gate => gateToLogicIc(gate).label;
    const transistorsOf = gate => {
        const c = new Circuit(5.0);
        return buildCmosGate(c, gate).transistors.length;
    };
    assert.match(briefOf('not_real'), new RegExp(chipOf('not')), 'the NOT brief names the right chip');
    assert.equal(transistorsOf('not'), 2, 'and "a PMOS and an NMOS" really is two transistors');
    assert.match(briefOf('and_real'), new RegExp(chipOf('and')), 'the AND brief names the right chip');
    assert.match(briefOf('and_real'), /six transistors/, 'and claims six');
    assert.equal(transistorsOf('and'), 6, 'which is what buildCmosGate makes');
    assert.match(briefOf('nand_real'), /four transistors/, 'the NAND brief claims four');
    assert.equal(transistorsOf('nand'), 4, 'which is what buildCmosGate makes');
    assert.match(briefOf('or_real'), new RegExp(chipOf('or')), 'the OR brief names the right chip');
    assert.match(briefOf('or_real'), /six transistors/, 'and claims six');
    assert.equal(transistorsOf('or'), 6, 'which is what buildCmosGate makes');
    assert.match(briefOf('nor_real'), new RegExp(chipOf('nor')), 'the NOR brief names the right chip');
    assert.match(briefOf('nor_real'), /Four transistors/i, 'and claims four');
    assert.equal(transistorsOf('nor'), 4, 'which is what buildCmosGate makes');
    assert.match(briefOf('xor_real'), new RegExp(chipOf('xor')), 'the XOR brief names the right chip');
    // The half adder brief assigns a specific chip to each output. Read that
    // off the spec rather than trusting the prose.
    const ha = byId('half_adder_real');
    const spec = IC_CIRCUITS[ha.circuit];
    const chipFor = out => gateToLogicIc(spec.gates.find(g => g.out === out).type).label;
    assert.match(briefOf('half_adder_real'), new RegExp(`${chipFor('sum')} XOR gives the sum`), 'the sum chip is named correctly');
    assert.match(briefOf('half_adder_real'), new RegExp(`${chipFor('carry')} AND gives the carry`), 'and the carry chip');
    assert.match(briefOf('half_adder_real'), /SAME two switches/, 'and that the inputs are shared');
    const fa = byId('full_adder_real');
    const faSpec = IC_CIRCUITS[fa.circuit];
    // The brief spells the count out, which reads better than a digit — so
    // accept either form, and still check it against the SPEC rather than
    // letting the prose claim any number it likes.
    const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
    const n = faSpec.gates.length;
    assert.match(briefOf('full_adder_real'), new RegExp(`(${n}|${WORDS[n]}) chips`, 'i'),
        `the full adder brief must say it is ${n} chips, as the spec builds`);
    for (const type of ['xor', 'and', 'or']) {
        assert.match(briefOf('full_adder_real'), new RegExp(gateToLogicIc(type).label),
            `the full adder brief names the ${type.toUpperCase()} chip it uses`);
    }
    assert.equal(faSpec.inputs.length, 3, 'and it really does take a carry-in');
    assert.deepEqual(spec.gates.map(g => g.in), [['a', 'b'], ['a', 'b']], 'which the spec really does');
});

test('every realise brief tells the learner which button to press', () => {
    for (const c of REALISE) {
        for (const loc of LOCALES) {
            const brief = challengeBrief(c, loc);
            assert.ok(brief && brief.length > 40, `${c.id} needs a real brief in ${loc}`);
            assert.ok(/⚙|⚛/.test(brief), `${c.id}'s ${loc} brief should name the ⚙ / ⚛ buttons`);
        }
    }
});
