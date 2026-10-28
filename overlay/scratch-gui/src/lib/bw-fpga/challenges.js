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
        // The first realisation that ROUTES rather than computes. It sits after
        // xor_real because it needs no new gate type — an inverter, two ANDs
        // and an OR — and before the adders because choosing is simpler than
        // carrying, whatever the gate count says.
        id: 'mux2_real', requires: ['mux2', 'xor_real'], realise: true, circuit: 'mux2', rungs: ['ic'],
        inputs: io(['a', 'b', 'sel']), outputs: io(['y']),
        expect: i => ({y: i.sel ? i.b : i.a})
    },
    {
        id: 'half_adder_real', requires: ['half_adder', 'mux2_real'], realise: true, circuit: 'half_adder', rungs: ['ic'],
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
        // Bought, not built, like the adder chip before it — and the first
        // board whose SELECTED output is the dark one. The ladder is a line,
        // so the register now follows this rather than the adder chip.
        id: 'decoder_real', requires: ['adder_chip_real'], realise: true, circuit: 'decoder3to8', rungs: ['ic'],
        inputs: io(['a', 'b', 'c']),
        outputs: io(['y0', 'y1', 'y2', 'y3', 'y4', 'y5', 'y6', 'y7']),
        // ACTIVE LOW: the addressed line goes to 0 and every other stays at 1.
        // Writing it the other way round would grade a part that does not exist.
        expect: i => {
            const n = i.a + (i.b << 1) + (i.c << 2);
            const out = {};
            for (let k = 0; k < 8; k++) out[`y${k}`] = k === n ? 0 : 1;
            return out;
        }
    },
    {
        id: 'register_real', requires: ['register', 'decoder_real'], realise: true, circuit: 'dff', rungs: ['ic'],
        sequential: true,
        inputs: io(['d', 'clk']), outputs: io(['q']),
        stimulus: {d: [1, 0, 1, 1, 0, 0, 1]},
        // q takes d on each rising edge, so after the edge q IS d.
        seqExpect: stim => stim.d.map(v => ({q: v}))
    },
    {
        id: 'toggle_real', requires: ['toggle', 'register_real'], realise: true,
        circuit: 'toggle', rungs: ['ic'], sequential: true,
        inputs: io(['clk', 'rst']), outputs: io(['q']),
        cycles: 8,
        // Nothing to drive but the clock — the grader supplies the edges. q
        // starts low and inverts on every one of them, which is the ÷2.
        // Cycle 0 holds the active-low clear down, so the run starts from a
        // state the learner chose instead of one the silicon happened to wake
        // in. The array is exactly `cycles` long: a short one reads as
        // undefined, which the grader drives as 0 — reset back on, silently.
        // `rst` is an ASYNCHRONOUS clear: the grader must not flip it to test
        // that the board HOLDS, because a correct board does not hold through a
        // clear — that is what a clear is.
        asyncInputs: ['rst'],
        stimulus: {rst: [0, 1, 1, 1, 1, 1, 1, 1]},
        // MEASURED, cleared then toggling: 0,1,0,1,…
        seqExpect: stim => stim.rst.map((_, t) => ({q: t % 2}))
    },
    {
        id: 'counter_real', requires: ['toggle_real'], realise: true,
        circuit: 'counter2', rungs: ['ic'], sequential: true,
        inputs: io(['clk', 'rst']), outputs: io(['q0', 'q1']),
        cycles: 8,
        // `rst` is an ASYNCHRONOUS clear: the grader must not flip it to test
        // that the board HOLDS, because a correct board does not hold through a
        // clear — that is what a clear is.
        asyncInputs: ['rst'],
        stimulus: {rst: [0, 1, 1, 1, 1, 1, 1, 1]},
        // Both flip-flops of one 74HC74, the second clocked by the first, and
        // one reset switch holding BOTH clears. Cleared first, it counts
        // 0,1,2,3 and wraps — MEASURED, and no longer a statement about which
        // state the part happened to power up in.
        seqExpect: stim => stim.rst.map((_, t) => ({q0: (t % 4) & 1, q1: ((t % 4) >> 1) & 1}))
    },
    {
        id: 'counter4_real', requires: ['counter_real'], realise: true,
        circuit: 'counter4', rungs: ['ic'], sequential: true,
        inputs: io(['clk', 'rst']), outputs: io(['q0', 'q1', 'q2', 'q3']),
        // Eighteen edges, not sixteen: the wrap is the whole claim. A board that
        // counts 0..15 and then stops, or starts over from a different value,
        // agrees with the first sixteen rows and fails here — and sixteen would
        // never ask the question.
        cycles: 18,
        // `rst` is an ASYNCHRONOUS clear: the grader must not flip it to test
        // that the board HOLDS, because a correct board does not hold through a
        // clear — that is what a clear is.
        asyncInputs: ['rst'],
        stimulus: {rst: [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]},
        // MEASURED from the solver, not derived (test/fpga-counter4-board.test.mjs
        // re-measures it, so this cannot drift from the board in silence).
        // Cleared on the first edge, then 0..15 and round again — the reset is
        // what makes that a fact about the circuit rather than about which state
        // four flip-flops happened to wake up in.
        seqExpect: stim => stim.rst.map((_, t) => t % 16)
            .map(v => ({q0: v & 1, q1: (v >> 1) & 1, q2: (v >> 2) & 1, q3: (v >> 3) & 1}))
    },
    {
        // The last rung, and the one that MOVES a bit rather than holding it.
        id: 'shift_real', requires: ['counter4_real'], realise: true,
        circuit: 'shift8', rungs: ['ic'], sequential: true,
        // ORDER MATTERS: the grader pairs challenge.inputs with the built
        // circuit's switches BY POSITION, so this must match SHIFT_REG_8.inputs
        // exactly. Written ['clk','ser'] first, it clocked `ser` and fed data to
        // `clk` — the board then failed at cycle 0 with "qa is 0 but should be
        // 1", which reads as a broken part rather than a swapped pair.
        inputs: io(['ser', 'clk']), outputs: io(['qa', 'qb', 'qc', 'qd', 'qe', 'qf', 'qg', 'qh']),
        cycles: 10,
        // Ten edges, and the pattern is chosen so a bit is seen ENTERING,
        // travelling and LEAVING: 1101 walks right across all eight outputs and
        // falls off the end, which three or four cycles would never show.
        stimulus: {ser: [1, 1, 0, 1, 0, 0, 0, 0, 0, 0]},
        // MEASURED on the board (test/fpga-shift-register-board.test.mjs
        // re-measures it): with srclk and rclk tied, output i carries the bit
        // fed in i cycles ago, and 0 before the run started.
        seqExpect: stim => stim.ser.map((_, t) => {
            const out = {};
            ['qa', 'qb', 'qc', 'qd', 'qe', 'qf', 'qg', 'qh'].forEach((name, i) => {
                out[name] = t - i >= 0 ? stim.ser[t - i] : 0;
            });
            return out;
        })
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
