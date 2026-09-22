/**
 * The learning path — a sequence of build-it-yourself challenges, from a single
 * wire up to an adder and a multiplexer. Each challenge names the interface the
 * design must expose and carries a PURE reference function; the grader
 * (grader.js) enumerates every input combination, runs the design through the
 * tested evaluator, and compares — the same maths-as-oracle idea, turned into
 * auto-grading. `requires` chains them so passing one unlocks the next.
 *
 * A challenge marked `realise: true` is graded on the BOARD instead of on the
 * canvas — the learner builds the gate in real parts and the grader drives the
 * live circuit (grader.js: gradeRealisedCircuit). Its reference function is the
 * same pure oracle either way.
 *
 * Reference functions return 0/1 per output name. Inputs are 1-bit unless a
 * width is given. Pure data + pure functions, so the whole curriculum is
 * unit-tested without a browser.
 *
 * @module
 */
import {carryCoverRows} from './logic-ic-circuit.js';
import {t} from './l10n.js';

const io = names => names.map(name => ({name}));

// The 4-bit adder is graded on chosen rows, not the whole input space — 9 inputs
// is 512 combinations and minutes of real simulation. carryCoverRows picks the
// rows that show every bit position all eight cases its full adder can see.
const rippleRows = () => carryCoverRows(4);
const rippleExpect = i => {
    let a = 0; let b = 0;
    for (let k = 0; k < 4; k++) { a += i[`a${k}`] << k; b += i[`b${k}`] << k; }
    const total = a + b + i.cin;
    const out = {cout: total >= 16 ? 1 : 0};
    for (let k = 0; k < 4; k++) out[`sum${k}`] = (total >> k) & 1;
    return out;
};

export const CHALLENGES = Object.freeze([
    {
        id: 'wire', requires: [],
        inputs: io(['a']), outputs: io(['y']),
        expect: i => ({y: i.a})
    },
    {
        id: 'not', requires: ['wire'],
        inputs: io(['a']), outputs: io(['y']),
        expect: i => ({y: i.a ? 0 : 1})
    },
    {
        id: 'and', requires: ['not'],
        inputs: io(['a', 'b']), outputs: io(['y']),
        expect: i => ({y: i.a & i.b})
    },
    {
        id: 'or', requires: ['and'],
        inputs: io(['a', 'b']), outputs: io(['y']),
        expect: i => ({y: i.a | i.b})
    },
    {
        id: 'nand', requires: ['and'],
        inputs: io(['a', 'b']), outputs: io(['y']),
        expect: i => ({y: (i.a & i.b) ? 0 : 1})
    },
    {
        id: 'xor', requires: ['or', 'not'],
        inputs: io(['a', 'b']), outputs: io(['y']),
        expect: i => ({y: i.a ^ i.b})
    },
    {
        id: 'mux2', requires: ['xor'],
        inputs: io(['a', 'b', 'sel']), outputs: io(['y']),
        expect: i => ({y: i.sel ? i.b : i.a})
    },
    {
        id: 'half_adder', requires: ['xor', 'and'],
        inputs: io(['a', 'b']), outputs: io(['sum', 'carry']),
        expect: i => ({sum: i.a ^ i.b, carry: i.a & i.b})
    },
    {
        id: 'full_adder', requires: ['half_adder'],
        inputs: io(['a', 'b', 'cin']), outputs: io(['sum', 'cout']),
        expect: i => ({sum: i.a ^ i.b ^ i.cin, cout: (i.a & i.b) | (i.b & i.cin) | (i.a & i.cin)})
    },
    {
        id: 'mux4', requires: ['mux2'],
        inputs: io(['d0', 'd1', 'd2', 'd3', 's0', 's1']), outputs: io(['y']),
        expect: i => ({y: [i.d0, i.d1, i.d2, i.d3][(i.s1 << 1) | i.s0]})
    },
    // Minimise steps — graded on SIZE as well as correctness: the design must be
    // right AND use no more than the minimum (Quine–McCluskey) gate count. This
    // is where a learner meets Boolean minimisation (the ⊞ Truth table tool's
    // "minimise" does it, or reason it out). The budget is computed from the
    // reference, so it is always the true minimum.
    {
        id: 'absorb', requires: ['or', 'and'], minimize: true,
        inputs: io(['a', 'b']), outputs: io(['y']),
        expect: i => ({y: i.a | (i.a & i.b)})
    },
    {
        id: 'consensus', requires: ['absorb'], minimize: true,
        inputs: io(['a', 'b', 'c']), outputs: io(['y']),
        expect: i => ({y: (i.a & i.b) | ((i.b ? 0 : 1) & i.c) | (i.a & i.c)})
    },
    {
        id: 'majority_min', requires: ['consensus'], minimize: true,
        inputs: io(['a', 'b', 'c']), outputs: io(['y']),
        expect: i => ({y: (i.a + i.b + i.c) >= 2 ? 1 : 0})
    },
    // Sequential steps — graded by clocking the design (stepClock) through a
    // stimulus, so they need a flip-flop (DFF) and a clk input.
    {
        id: 'register', requires: ['mux4'], sequential: true,
        inputs: io(['d', 'clk']), outputs: io(['q']),
        stimulus: {d: [1, 0, 0, 1, 1, 0]},
        seqExpect: stim => { let q = 0; return stim.d.map(v => { const out = {q}; q = v; return out; }); }
    },
    {
        id: 'toggle', requires: ['register', 'not'], sequential: true,
        inputs: io(['clk']), outputs: io(['q']),
        cycles: 6,
        stimulus: {},
        seqExpect: () => [0, 1, 0, 1, 0, 1].map(q => ({q}))
    },
    // ── Real parts ───────────────────────────────────────────────────────────
    // Everything above is graded on the DESIGN — the gates drawn on the canvas.
    // These are graded on the BOARD: realise the gate in the Circuit tab (⚙ as a
    // 74HC chip, ⚛ as CMOS transistors, or wire it yourself), and the grader
    // drives the real switches through every input combination and reads the
    // real output LED (grader.js: gradeRealisedCircuit).
    //
    // They are graded by RESULT, never by topology, so ANY construction that
    // computes the function passes — which is the point: a 14-pin chip and six
    // transistors are the same gate because they behave the same.
    //
    // `rungs` names the realisations that can build this gate, and is checked
    // against what the builders actually support: 'ic' is logic-ic.js
    // (not/and/or/nand/nor/xor), 'cmos' is cmos.js, which has no discrete XOR.
    {
        id: 'not_real', requires: ['not'], realise: true, gate: 'not', rungs: ['ic', 'cmos'],
        inputs: io(['a']), outputs: io(['y']),
        expect: i => ({y: i.a ? 0 : 1})
    },
    {
        id: 'and_real', requires: ['and', 'not_real'], realise: true, gate: 'and', rungs: ['ic', 'cmos'],
        inputs: io(['a', 'b']), outputs: io(['y']),
        expect: i => ({y: i.a & i.b})
    },
    {
        id: 'or_real', requires: ['or', 'and_real'], realise: true, gate: 'or', rungs: ['ic', 'cmos'],
        inputs: io(['a', 'b']), outputs: io(['y']),
        expect: i => ({y: i.a | i.b})
    },
    {
        id: 'nand_real', requires: ['nand', 'or_real'], realise: true, gate: 'nand', rungs: ['ic', 'cmos'],
        inputs: io(['a', 'b']), outputs: io(['y']),
        expect: i => ({y: (i.a & i.b) ? 0 : 1})
    },
    {
        id: 'nor_real', requires: ['or', 'nand_real'], realise: true, gate: 'nor', rungs: ['ic', 'cmos'],
        inputs: io(['a', 'b']), outputs: io(['y']),
        expect: i => ({y: (i.a | i.b) ? 0 : 1})
    },
    {
        id: 'xor_real', requires: ['xor', 'nor_real'], realise: true, gate: 'xor', rungs: ['ic'],
        inputs: io(['a', 'b']), outputs: io(['y']),
        expect: i => ({y: i.a ^ i.b})
    },
    {
        id: 'half_adder_real', requires: ['half_adder', 'xor_real'], realise: true, circuit: 'half_adder', rungs: ['ic'],
        inputs: io(['a', 'b']), outputs: io(['sum', 'carry']),
        expect: i => ({sum: i.a ^ i.b, carry: i.a & i.b})
    },
    {
        id: 'full_adder_real', requires: ['full_adder', 'half_adder_real'], realise: true, circuit: 'full_adder', rungs: ['ic'],
        inputs: io(['a', 'b', 'cin']), outputs: io(['sum', 'cout']),
        expect: i => ({sum: i.a ^ i.b ^ i.cin, cout: (i.a + i.b + i.cin) >= 2 ? 1 : 0})
    },
    {
        id: 'ripple_adder_real', requires: ['full_adder_real'], realise: true, circuit: 'ripple_adder_4', rungs: ['ic'],
        inputs: io(['a0', 'b0', 'a1', 'b1', 'a2', 'b2', 'a3', 'b3', 'cin']),
        outputs: io(['sum0', 'sum1', 'sum2', 'sum3', 'cout']),
        rows: rippleRows,
        rowsNoteKey: 'note.carryCover',
        expect: rippleExpect
    },
    {
        id: 'adder_chip_real', requires: ['ripple_adder_real'], realise: true, circuit: 'adder_chip_4', rungs: ['ic'],
        inputs: io(['a0', 'b0', 'a1', 'b1', 'a2', 'b2', 'a3', 'b3', 'cin']),
        outputs: io(['s0', 's1', 's2', 's3', 'cout']),
        rows: rippleRows,
        rowsNoteKey: 'note.carryCover',
        expect: i => {
            const out = rippleExpect(i);
            return {s0: out.sum0, s1: out.sum1, s2: out.sum2, s3: out.sum3, cout: out.cout};
        }
    },
    {
        id: 'register_real', requires: ['register', 'adder_chip_real'], realise: true, circuit: 'dff', rungs: ['ic'],
        sequential: true,
        inputs: io(['d', 'clk']), outputs: io(['q']),
        stimulus: {d: [1, 0, 1, 1, 0, 0, 1]},
        // q takes d on each rising edge, so after the edge q IS d.
        seqExpect: stim => stim.d.map(v => ({q: v}))
    },
    {
        id: 'toggle_real', requires: ['toggle', 'register_real'], realise: true,
        circuit: 'toggle', rungs: ['ic'], sequential: true,
        inputs: io(['clk']), outputs: io(['q']),
        cycles: 8,
        // Nothing to drive but the clock — the grader supplies the edges. q
        // starts low and inverts on every one of them, which is the ÷2.
        stimulus: {},
        seqExpect: () => [1, 0, 1, 0, 1, 0, 1, 0].map(q => ({q}))
    },
    {
        id: 'counter_real', requires: ['toggle_real'], realise: true,
        circuit: 'counter2', rungs: ['ic'], sequential: true,
        inputs: io(['clk']), outputs: io(['q0', 'q1']),
        cycles: 8,
        stimulus: {},
        // Both flip-flops of one 74HC74, the second clocked by the first. The
        // pair powers up at 2, so the first edge shows 3 and it counts on from
        // there, wrapping through every value.
        seqExpect: () => [3, 0, 1, 2, 3, 0, 1, 2].map(v => ({q0: v & 1, q1: (v >> 1) & 1}))
    },
    {
        id: 'counter4_real', requires: ['counter_real'], realise: true,
        circuit: 'counter4', rungs: ['ic'], sequential: true,
        inputs: io(['clk']), outputs: io(['q0', 'q1', 'q2', 'q3']),
        // Eighteen edges, not sixteen: the wrap is the whole claim. A board that
        // counts 0..15 and then stops, or starts over from a different value,
        // agrees with the first sixteen rows and fails here — and sixteen would
        // never ask the question.
        cycles: 18,
        stimulus: {},
        // MEASURED from the solver, not derived (test/fpga-counter4-board.test.mjs
        // re-measures it, so this cannot drift from the board in silence). Four
        // flip-flops across two 74HC74s wake up all set, so the first edge shows
        // 15 and it counts up from 0 after that.
        seqExpect: () => Array.from({length: 18}, (_, t) => (t + 15) % 16)
            .map(v => ({q0: v & 1, q1: (v >> 1) & 1, q2: (v >> 2) & 1, q3: (v >> 3) & 1}))
    }
]);

/**
 * The learner-facing name of a challenge, in `locale`.
 *
 * Titles and briefs used to sit in the data above as English literals, which
 * made the whole curriculum English-only however well the surrounding UI was
 * translated. They live in l10n.js now, keyed by challenge id, and the data
 * carries only what is language-independent: the interface, the oracle, and
 * the prerequisites.
 */
export const challengeTitle = (c, locale) => t(locale, `challenge.${c && c.id}.title`);

/** The learner-facing brief of a challenge, in `locale`. */
export const challengeBrief = (c, locale) => t(locale, `challenge.${c && c.id}.brief`);

/** Look up a challenge by id. */
export const challengeById = id => CHALLENGES.find(c => c.id === id);

/**
 * Is this challenge graded on the real breadboard rather than on the canvas?
 * The panel routes on this: a realise challenge is checked with
 * gradeRealisedCircuit against the live circuit, not with grade against a model.
 */
export const isRealise = c => Boolean(c && c.realise);

/** Is `id` unlocked given the set of passed ids? (all prerequisites passed) */
export function isUnlocked (id, passed) {
    const c = challengeById(id);
    if (!c) return false;
    return c.requires.every(r => passed.has ? passed.has(r) : (passed || []).includes(r));
}
