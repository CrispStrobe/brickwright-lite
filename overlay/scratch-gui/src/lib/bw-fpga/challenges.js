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
        id: 'wire', title: 'A wire', requires: [],
        brief: 'The simplest thing that works: make the output follow the input. Drag an Input and an Output, then connect them.',
        inputs: io(['a']), outputs: io(['y']),
        expect: i => ({y: i.a})
    },
    {
        id: 'not', title: 'NOT — an inverter', requires: ['wire'],
        brief: 'Output the opposite of the input. One NOT gate.',
        inputs: io(['a']), outputs: io(['y']),
        expect: i => ({y: i.a ? 0 : 1})
    },
    {
        id: 'and', title: 'AND', requires: ['not'],
        brief: 'Output 1 only when BOTH inputs are 1.',
        inputs: io(['a', 'b']), outputs: io(['y']),
        expect: i => ({y: i.a & i.b})
    },
    {
        id: 'or', title: 'OR', requires: ['and'],
        brief: 'Output 1 when EITHER input is 1.',
        inputs: io(['a', 'b']), outputs: io(['y']),
        expect: i => ({y: i.a | i.b})
    },
    {
        id: 'nand', title: 'NAND — the universal gate', requires: ['and'],
        brief: 'NOT-AND: 0 only when both inputs are 1. Every other gate can be built from this one.',
        inputs: io(['a', 'b']), outputs: io(['y']),
        expect: i => ({y: (i.a & i.b) ? 0 : 1})
    },
    {
        id: 'xor', title: 'XOR — difference detector', requires: ['or', 'not'],
        brief: 'Output 1 when the inputs DIFFER. Build it from AND/OR/NOT if you like.',
        inputs: io(['a', 'b']), outputs: io(['y']),
        expect: i => ({y: i.a ^ i.b})
    },
    {
        id: 'mux2', title: '2:1 multiplexer', requires: ['xor'],
        brief: 'A selector: when sel is 0 pass a, when sel is 1 pass b.',
        inputs: io(['a', 'b', 'sel']), outputs: io(['y']),
        expect: i => ({y: i.sel ? i.b : i.a})
    },
    {
        id: 'half_adder', title: 'Half adder', requires: ['xor', 'and'],
        brief: 'Add two bits: sum is their XOR, carry is their AND.',
        inputs: io(['a', 'b']), outputs: io(['sum', 'carry']),
        expect: i => ({sum: i.a ^ i.b, carry: i.a & i.b})
    },
    {
        id: 'full_adder', title: 'Full adder', requires: ['half_adder'],
        brief: 'Add two bits plus a carry-in. sum = a^b^cin; cout is the majority.',
        inputs: io(['a', 'b', 'cin']), outputs: io(['sum', 'cout']),
        expect: i => ({sum: i.a ^ i.b ^ i.cin, cout: (i.a & i.b) | (i.b & i.cin) | (i.a & i.cin)})
    },
    {
        id: 'mux4', title: '4:1 multiplexer', requires: ['mux2'],
        brief: 'Two select bits choose one of four inputs. s1 s0 pick d0..d3.',
        inputs: io(['d0', 'd1', 'd2', 'd3', 's0', 's1']), outputs: io(['y']),
        expect: i => ({y: [i.d0, i.d1, i.d2, i.d3][(i.s1 << 1) | i.s0]})
    },
    // Minimise steps — graded on SIZE as well as correctness: the design must be
    // right AND use no more than the minimum (Quine–McCluskey) gate count. This
    // is where a learner meets Boolean minimisation (the ⊞ Truth table tool's
    // "minimise" does it, or reason it out). The budget is computed from the
    // reference, so it is always the true minimum.
    {
        id: 'absorb', title: 'Absorption — spot the useless input', requires: ['or', 'and'], minimize: true,
        brief: 'y = a OR (a AND b). Build it from gates — then notice b never changes the answer, and get it down to the minimum (a single wire, zero gates).',
        inputs: io(['a', 'b']), outputs: io(['y']),
        expect: i => ({y: i.a | (i.a & i.b)})
    },
    {
        id: 'consensus', title: 'Consensus — drop the redundant term', requires: ['absorb'], minimize: true,
        brief: 'y = (a·b) + (¬b·c) + (a·c). The last term is implied by the other two (the consensus theorem) — remove it and reach the minimum.',
        inputs: io(['a', 'b', 'c']), outputs: io(['y']),
        expect: i => ({y: (i.a & i.b) | ((i.b ? 0 : 1) & i.c) | (i.a & i.c)})
    },
    {
        id: 'majority_min', title: 'Majority, minimally', requires: ['consensus'], minimize: true,
        brief: 'Output 1 when at least two of a, b, c are 1 — in as few gates as possible. The minimum is a·b + b·c + a·c with no inverters.',
        inputs: io(['a', 'b', 'c']), outputs: io(['y']),
        expect: i => ({y: (i.a + i.b + i.c) >= 2 ? 1 : 0})
    },
    // Sequential steps — graded by clocking the design (stepClock) through a
    // stimulus, so they need a flip-flop (DFF) and a clk input.
    {
        id: 'register', title: 'A register (D flip-flop)', requires: ['mux4'], sequential: true,
        brief: 'Store a bit. Wire d and clk into a DFF and q out: q takes d on each clock, so it shows the PREVIOUS d. Use Run + ⟳ Clock to watch it.',
        inputs: io(['d', 'clk']), outputs: io(['q']),
        stimulus: {d: [1, 0, 0, 1, 1, 0]},
        seqExpect: stim => { let q = 0; return stim.d.map(v => { const out = {q}; q = v; return out; }); }
    },
    {
        id: 'toggle', title: 'Toggle flip-flop (÷2)', requires: ['register', 'not'], sequential: true,
        brief: 'A 1-bit counter: q flips every clock. Feed the DFF its own inverted output (q → NOT → d), and clock it. That halves the clock frequency.',
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
        id: 'not_real', title: 'NOT — in real parts', requires: ['not'], realise: true, gate: 'not', rungs: ['ic', 'cmos'],
        brief: 'You drew an inverter. Now build one you could touch. In the Circuit tab press ⚙ for a 74HC04 chip, or ⚛ to wire it from a PMOS and an NMOS — then Check. This grades the BOARD: the switch is really toggled and the output LED is really read.',
        inputs: io(['a']), outputs: io(['y']),
        expect: i => ({y: i.a ? 0 : 1})
    },
    {
        id: 'and_real', title: 'AND — in real parts', requires: ['and', 'not_real'], realise: true, gate: 'and', rungs: ['ic', 'cmos'],
        brief: 'The same AND, in parts that exist. Build it either way — ⚙ drops a 74HC08, ⚛ builds it from six transistors (a NAND, then an inverter). Both pass, because the grader reads the LED, not your wiring.',
        inputs: io(['a', 'b']), outputs: io(['y']),
        expect: i => ({y: i.a & i.b})
    },
    {
        id: 'or_real', title: 'OR — in real parts', requires: ['or', 'and_real'], realise: true, gate: 'or', rungs: ['ic', 'cmos'],
        brief: 'OR on the bench: ⚙ is a 74HC32, ⚛ is six transistors — a NOR followed by an inverter, the same "invert the inverse" trick AND uses. Toggle either switch and the LED lights.',
        inputs: io(['a', 'b']), outputs: io(['y']),
        expect: i => ({y: i.a | i.b})
    },
    {
        id: 'nand_real', title: 'NAND — the universal gate, in silicon', requires: ['nand', 'or_real'], realise: true, gate: 'nand', rungs: ['ic', 'cmos'],
        brief: 'Build NAND from transistors (⚛) and look at what you get: two PMOS in parallel pulling up, two NMOS in series pulling down. That is the whole gate — four transistors, and every other gate can be built from copies of it.',
        inputs: io(['a', 'b']), outputs: io(['y']),
        expect: i => ({y: (i.a & i.b) ? 0 : 1})
    },
    {
        id: 'nor_real', title: 'NOR — the other universal gate', requires: ['or', 'nand_real'], realise: true, gate: 'nor', rungs: ['ic', 'cmos'],
        brief: 'NOR is NAND held up to a mirror. Build it with ⚛ and compare: NAND put its two PMOS in PARALLEL and its two NMOS in SERIES — NOR does exactly the opposite, PMOS in series above, NMOS in parallel below. Four transistors again, and it is just as universal: every gate can be built from NORs alone. (⚙ is a 74HC02.)',
        inputs: io(['a', 'b']), outputs: io(['y']),
        expect: i => ({y: (i.a | i.b) ? 0 : 1})
    },
    {
        id: 'xor_real', title: 'XOR — a chip with no simple transistor form', requires: ['xor', 'nor_real'], realise: true, gate: 'xor', rungs: ['ic'],
        brief: 'XOR is the one the ⚛ button will not build: it has no tidy pull-up/pull-down pair the way AND and NOR do — it is made of several gates. So take the 74HC86 (⚙) and prove the chip computes it on the board.',
        inputs: io(['a', 'b']), outputs: io(['y']),
        expect: i => ({y: i.a ^ i.b})
    },
    {
        id: 'half_adder_real', title: 'Half adder — addition, in parts you can buy',
        requires: ['half_adder', 'xor_real'], realise: true, circuit: 'half_adder', rungs: ['ic'],
        brief: 'Two chips, one job: a 74HC86 XOR gives the sum, a 74HC08 AND gives the carry, and both watch the SAME two switches. Press ⚙ Half adder to build it, then Check — this is the first challenge that reads TWO output LEDs, and it is binary addition happening in parts you could buy. Try 1+1: the sum goes dark and the carry lights.',
        inputs: io(['a', 'b']), outputs: io(['sum', 'carry']),
        expect: i => ({sum: i.a ^ i.b, carry: i.a & i.b})
    },
    {
        id: 'full_adder_real', title: 'Full adder — carry in, carry out',
        requires: ['full_adder', 'half_adder_real'], realise: true, circuit: 'full_adder', rungs: ['ic'],
        brief: 'Three bits in, two out, and five chips to do it: a 74HC86 XOR and a 74HC08 AND make one half adder, a second pair adds the carry-in, and a 74HC32 OR merges the two carries — either one means a carry out. Pick Full adder and press ⚙. The row that proves it is 1+1+1: BOTH LEDs light, because three is 11 in binary. This is the circuit a computer adds with, one bit wide.',
        inputs: io(['a', 'b', 'cin']), outputs: io(['sum', 'cout']),
        expect: i => ({sum: i.a ^ i.b ^ i.cin, cout: (i.a + i.b + i.cin) >= 2 ? 1 : 0})
    },
    {
        id: 'ripple_adder_real', title: '4-bit adder — the carry ripples',
        requires: ['full_adder_real'], realise: true, circuit: 'ripple_adder_4', rungs: ['ic'],
        brief: 'Four full adders in a row, each one handing its carry up to the next: twenty chips, nine switches, five LEDs, and it adds two 4-bit numbers. Pick 4-bit adder and press ⚙. Set a to 1111 and add 1 — every sum LED goes dark and the carry lights, which is how counting rolls over. That hand-off is also why real adders are slow: bit 3 cannot settle until bit 0\'s carry has rippled all the way up.',
        inputs: io(['a0', 'b0', 'a1', 'b1', 'a2', 'b2', 'a3', 'b3', 'cin']),
        outputs: io(['sum0', 'sum1', 'sum2', 'sum3', 'cout']),
        rows: rippleRows,
        rowsNote: 'every bit position through all eight cases its full adder can see (all 512 combinations would take minutes)',
        expect: rippleExpect
    },
    {
        id: 'adder_chip_real', title: 'The same adder — as one chip',
        requires: ['ripple_adder_real'], realise: true, circuit: 'adder_chip_4', rungs: ['ic'],
        brief: 'You just built 4-bit addition from twenty gates in five packages. The 74HC283 is the same function in ONE 16-pin part: the a and b pins go in, the s pins come out. Pick "4-bit adder (one chip)" and press ⚙, then Check — the grader drives exactly the same rows and cannot tell the difference, because there is none. That is integration, and it is why nobody wires adders out of XOR gates any more. Compare the two parts lists.',
        inputs: io(['a0', 'b0', 'a1', 'b1', 'a2', 'b2', 'a3', 'b3', 'cin']),
        outputs: io(['s0', 's1', 's2', 's3', 'cout']),
        rows: rippleRows,
        rowsNote: 'every bit position through all eight cases a full adder can see (all 512 combinations would take minutes)',
        expect: i => {
            const out = rippleExpect(i);
            return {s0: out.sum0, s1: out.sum1, s2: out.sum2, s3: out.sum3, cout: out.cout};
        }
    }
]);

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
