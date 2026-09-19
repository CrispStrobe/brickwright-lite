/**
 * The learning path — a sequence of build-it-yourself challenges, from a single
 * wire up to an adder and a multiplexer. Each challenge names the interface the
 * design must expose and carries a PURE reference function; the grader
 * (grader.js) enumerates every input combination, runs the design through the
 * tested evaluator, and compares — the same maths-as-oracle idea, turned into
 * auto-grading. `requires` chains them so passing one unlocks the next.
 *
 * Reference functions return 0/1 per output name. Inputs are 1-bit unless a
 * width is given. Pure data + pure functions, so the whole curriculum is
 * unit-tested without a browser.
 *
 * @module
 */

const io = names => names.map(name => ({name}));

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
    }
]);

/** Look up a challenge by id. */
export const challengeById = id => CHALLENGES.find(c => c.id === id);

/** Is `id` unlocked given the set of passed ids? (all prerequisites passed) */
export function isUnlocked (id, passed) {
    const c = challengeById(id);
    if (!c) return false;
    return c.requires.every(r => passed.has ? passed.has(r) : (passed || []).includes(r));
}
