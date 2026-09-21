/**
 * The auto-grader for the learning path. Given the design the learner built and
 * a challenge, it checks the design exposes the right interface, then evaluates
 * it against EVERY input combination with the tested evaluator (gate-eval) and
 * compares to the challenge's pure reference. It returns the FIRST failing case
 * so the learner sees a concrete "with a=1, b=0 you gave 1 but should be 0".
 *
 * Pure — the same oracle idea as the exhaustive gate-eval tests, now driving a
 * lesson. Unit-tested without a browser.
 *
 * @module
 */
import {evalModel, stepClock} from './gate-eval.js';
import {synthesizeTruthTable, truthTableFrom} from './synthesize.js';

/** Gates in a model. Display instruments (led/seg7/ledbank) never count. */
const gateCount = model => ((model && model.nodes) || []).filter(n => n.kind === 'gate').length;

/**
 * The minimum gate count for a combinational challenge — its reference function,
 * synthesised with Quine–McCluskey minimisation. This is the budget a "minimise"
 * challenge grades against: build the function, then get down to this.
 */
export function minimalGates (challenge) {
    const ins = challenge.inputs.map(i => i.name);
    const outs = challenge.outputs.map(o => o.name);
    const table = truthTableFrom(ins, outs, challenge.expect);
    return gateCount(synthesizeTruthTable(table, {minimize: true}));
}

/** Names present on the model, by kind. */
const namesOfKind = (model, kind) =>
    new Set(((model && model.nodes) || []).filter(n => n.kind === kind && n.name).map(n => n.name));

/**
 * Does the design expose the challenge's inputs and outputs? Returns a
 * human-readable problem string, or null when the interface is complete.
 */
export function validateInterface (model, challenge) {
    const ins = namesOfKind(model, 'in');
    const outs = namesOfKind(model, 'out');
    for (const {name} of challenge.inputs) {
        if (!ins.has(name)) return `Add an input named "${name}".`;
    }
    for (const {name} of challenge.outputs) {
        if (!outs.has(name)) return `Add an output named "${name}".`;
    }
    return null;
}

/**
 * Grade `model` against `challenge`.
 * @returns {{pass: boolean, problem?: string, failing?: Object, checked?: number}}
 *   pass:true — every input combination matched the reference.
 *   problem   — the interface is incomplete (nothing was graded).
 *   failing   — {inputs, output, expected, got} or {inputs, reason} for the first miss.
 *   checked   — how many input combinations were verified.
 */
/**
 * Grade a SEQUENTIAL challenge: clock the design through a stimulus and compare
 * each cycle's output to the reference. The design's state advances with the
 * tested stepClock, so it needs a flip-flop wired up.
 */
export function gradeSequential (model, challenge) {
    const problem = validateInterface(model, challenge);
    if (problem) return {pass: false, problem};

    const stim = challenge.stimulus || {};
    const driven = Object.keys(stim);
    const cycles = challenge.cycles || (driven.length ? stim[driven[0]].length : 0);
    const expected = challenge.seqExpect(stim);
    let state = {};
    for (let t = 0; t < cycles; t++) {
        const inputs = {};
        for (const k of driven) inputs[k] = stim[k][t];
        const {outputs, settled} = evalModel(model, inputs, state);
        if (!settled) {
            return {pass: false, failing: {cycle: t, reason: 'the design never settled at this cycle'}, checked: t};
        }
        for (const {name} of challenge.outputs) {
            if (outputs[name] !== expected[t][name]) {
                return {pass: false, failing: {cycle: t, inputs, output: name, expected: expected[t][name], got: outputs[name]}, checked: t};
            }
        }
        state = stepClock(model, inputs, state);
    }
    return {pass: true, checked: cycles, sequential: true};
}

export function grade (model, challenge) {
    if (challenge.sequential) return gradeSequential(model, challenge);
    const problem = validateInterface(model, challenge);
    if (problem) return {pass: false, problem};

    const names = challenge.inputs.map(i => i.name);
    const n = names.length;
    const total = 1 << n;
    for (let bits = 0; bits < total; bits++) {
        const inputs = {};
        names.forEach((nm, i) => { inputs[nm] = (bits >> i) & 1; });
        const {outputs, settled} = evalModel(model, inputs);
        if (!settled) {
            return {pass: false, failing: {inputs, reason: 'the design never settled — a feedback loop without a flip-flop?'}, checked: bits};
        }
        const expected = challenge.expect(inputs);
        for (const {name} of challenge.outputs) {
            if (outputs[name] !== expected[name]) {
                return {pass: false, failing: {inputs, output: name, expected: expected[name], got: outputs[name]}, checked: bits};
            }
        }
    }
    // A "minimise" challenge grades on SIZE too: the design must be correct AND
    // no larger than the minimum (Quine–McCluskey) gate count.
    if (challenge.minimize) {
        const budget = minimalGates(challenge);
        const used = gateCount(model);
        if (used > budget) return {pass: false, checked: total, overBudget: {used, budget}};
        return {pass: true, checked: total, minimal: {used, budget}};
    }
    return {pass: true, checked: total};
}

/** A one-line, learner-facing summary of a grade result. */
export function gradeMessage (result, challenge) {
    if (result.pass) {
        if (result.minimal) return `✓ Correct AND minimal — ${result.minimal.used} gate${result.minimal.used === 1 ? '' : 's'}, the fewest possible.`;
        return result.sequential
            ? `✓ Correct — held through all ${result.checked} clock cycles.`
            : `✓ Correct — verified all ${result.checked} input combinations.`;
    }
    if (result.overBudget) {
        return `Correct, but it uses ${result.overBudget.used} gates — the minimum is ${result.overBudget.budget}. `
            + `Reduce it: the ⊞ Truth table tool minimises, or spot the input that never matters.`;
    }
    if (result.problem) return result.problem;
    const f = result.failing;
    if (f.cycle !== undefined) {
        if (f.reason) return `Not yet: at clock cycle ${f.cycle}, ${f.reason}`;
        return `Not yet: at clock cycle ${f.cycle}, output ${f.output} is ${f.got} but should be ${f.expected}.`;
    }
    const inStr = Object.entries(f.inputs).map(([k, v]) => `${k}=${v}`).join(', ');
    if (f.reason) return `Not yet: with ${inStr}, ${f.reason}`;
    return `Not yet: with ${inStr}, output ${f.output} is ${f.got} but should be ${f.expected}.`;
}

// ─── Grading a REAL circuit ─────────────────────────────────────────────────
//
// Everything above grades a MODEL — the design drawn on the gate-builder
// canvas. What follows grades the thing the learner BUILT in the Circuit tab:
// a 74HC chip, six CMOS transistors, or their own hand-wiring. It drives the
// board's input switches through every combination and reads the output LED.
//
// It grades by RESULT, never by topology. Any construction that computes the
// function passes, which is the honest test — and the whole point of the rung:
// a chip and a pile of transistors are the same gate because they behave the
// same, not because they look alike.
//
// Pure in the same sense as the rest of this module: it holds no solver import,
// it only drives the live Circuit object it is handed (the one the designer
// publishes as `window.__circuit`), so it unit-tests headlessly.

/** An LED at or above this fraction of rated current reads as a 1. */
const LIT = 0.1;
/** At or below this it reads as a 0. Between the two is "can't tell" — a fault. */
const DARK = 0.05;
/** Per combination: hold the inputs this long before believing the LED. */
const SETTLE_MS = 200;
/**
 * Advance in steps this size, never one leap. LED brightness is a moving
 * average over a trailing 20 ms window, sampled per `advanceTo` call — a single
 * jump to the end leaves the window empty and reads 0 on a lit LED.
 */
const STEP_MS = 25;

const NS_PER_MS = 1000000n;

const partsOfKind = (circuit, kind) => ((circuit && circuit.parts) || []).filter(p => p && p.kind === kind);

/**
 * Find the driveable interface of a built board: its input switches and its
 * output LED.
 *
 * Switches are ordered top-to-bottom (then left-to-right), which is the order
 * both realisation builders stack them and the order a learner reads them — so
 * the challenge's first input name is the topmost switch on screen.
 *
 * @param {object} circuit  a live Circuit (needs a `parts` array)
 * @returns {{inputs: Array<{switch: string}>, output: ?{led: string}, leds: number}}
 */
export function discoverRealisation (circuit, challenge) {
    const byPosition = (p, q) => (p.y - q.y) || (p.x - q.x) || String(p.id).localeCompare(String(q.id));
    const switches = partsOfKind(circuit, 'switch').slice().sort(byPosition);
    const leds = partsOfKind(circuit, 'led').slice().sort(byPosition);

    // Match an output LED to the output it REPRESENTS by name when the part
    // carries one (the builders set declName), because position is a guess and a
    // name is not: a learner who drags the carry LED above the sum LED has not
    // built the wrong circuit. Fall back to top-to-bottom for a hand-wired board
    // that names nothing — the same order the builder stacks them and the order
    // the brief tells the learner to use.
    const wanted = ((challenge && challenge.outputs) || []).map(o => o.name);
    const named = new Map(leds.filter(l => l.declName).map(l => [l.declName, l]));
    const allNamed = wanted.length > 0 && wanted.every(n => named.has(n));
    const outputs = allNamed
        ? wanted.map(n => ({name: n, led: named.get(n).id}))
        : leds.map((l, i) => ({name: wanted[i], led: l.id}));

    return {
        inputs: switches.map(s => ({switch: s.id})),
        outputs,
        matchedByName: allNamed,
        // The single-output shape the first realise challenges were written
        // against, kept so nothing that reads `io.output` has to change.
        output: outputs.length ? {led: outputs[0].led} : null,
        leds: leds.length
    };
}

/**
 * Can this circuit answer this challenge at all? Returns a learner-facing
 * problem string, or null when it is ready to be graded.
 */
export function validateRealisation (circuit, challenge, io) {
    const board = circuit && circuit.board;
    if (!board || typeof board.setControl !== 'function'
        || typeof board.advanceTo !== 'function' || typeof board.ledBrightness !== 'function') {
        return 'Open the Circuit tab and build the gate there — this challenge grades the real board.';
    }
    const want = challenge.inputs.length;
    const got = io.inputs.length;
    if (got === 0 && !io.leds) {
        return 'Nothing is built yet. Realise it in the Circuit tab (⚙ as a chip, ⚛ as transistors), then check again.';
    }
    if (got !== want) {
        const names = challenge.inputs.map(i => i.name).join(', ');
        return `This challenge drives ${want} input${want === 1 ? '' : 's'} (${names}), `
            + `but the board has ${got} switch${got === 1 ? '' : 'es'}. Put one switch per input.`;
    }
    const wantOut = challenge.outputs.length;
    if (!io.leds) {
        return wantOut === 1
            ? 'Add an LED on the output — that is what gets read.'
            : `Add an LED per output (${challenge.outputs.map(o => o.name).join(', ')}) — those are what get read.`;
    }
    if (io.leds !== wantOut) {
        const names = challenge.outputs.map(o => o.name).join(', ');
        return `This challenge reads ${wantOut} output${wantOut === 1 ? '' : 's'} (${names}), `
            + `but the board has ${io.leds} LED${io.leds === 1 ? '' : 's'}. Leave one LED per output.`;
    }
    return null;
}

/** Hold the current inputs for `ms`, stepping so the brightness window fills. */
function settle (board, ms, stepMs) {
    const step = BigInt(stepMs) * NS_PER_MS;
    const start = typeof board.timeNs === 'bigint' ? board.timeNs : 0n;
    const end = start + (BigInt(ms) * NS_PER_MS);
    for (let t = start + step; t <= end; t += step) board.advanceTo(t);
}

/**
 * Grade the learner's LIVE CIRCUIT against `challenge`.
 *
 * Drives every input combination through the board's switches and compares the
 * output LED to the challenge's pure reference, returning the FIRST row that
 * disagrees — the same shape `grade` returns, so the challenge panel renders
 * both the same way.
 *
 * The board is driven where it already stands (time carries on from wherever
 * the learner left it) rather than rebuilt, because the learner's board is the
 * subject: rebuilding it would grade our reconstruction instead of their work.
 *
 * @param {object} circuit  the live Circuit (window.__circuit), with `.board`
 * @param {object} challenge  a challenge from challenges.js
 * @param {{io?: object, settleMs?: number, stepMs?: number}} [opts]
 *   io — an explicit interface (e.g. the return of buildLogicIcGate) instead of
 *   discovering it from the parts.
 * Multi-output challenges (a half adder's sum and carry) read one LED per
 * output from the same settled state; an output's LED is found by NAME when the
 * parts carry one, else top-to-bottom.
 *
 * @returns {{pass: boolean, realised: true, problem?: string, failing?: object, checked?: number}}
 */
export function gradeRealisedCircuit (circuit, challenge, opts = {}) {
    const io = opts.io || discoverRealisation(circuit, challenge);
    const problem = validateRealisation(circuit, challenge, io);
    if (problem) return {pass: false, realised: true, problem};

    const board = circuit.board;
    const settleMs = opts.settleMs || SETTLE_MS;
    const stepMs = opts.stepMs || STEP_MS;
    if (typeof board.setPower === 'function') board.setPower(true);

    const names = challenge.inputs.map(i => i.name);
    const total = 1 << names.length;

    // Grading toggles the learner's own switches, so remember where they had
    // them and put them back. Otherwise pressing Check silently rearranges
    // their board — it would be left on whatever the last combination was.
    const before = typeof board.getControl === 'function'
        ? io.inputs.map(inp => board.getControl(inp.switch))
        : null;
    const restore = () => {
        if (!before) return;
        io.inputs.forEach((inp, i) => {
            if (before[i] !== undefined) board.setControl(inp.switch, before[i]);
        });
    };

    for (let bits = 0; bits < total; bits++) {
        const inputs = {};
        names.forEach((nm, i) => { inputs[nm] = (bits >> i) & 1; });
        io.inputs.forEach((inp, i) => board.setControl(inp.switch, inputs[names[i]] ? 1 : 0));
        settle(board, settleMs, stepMs);

        // Every output is read from the SAME settled board state, so a
        // multi-output design (a half adder's sum and carry) is judged on one
        // consistent moment rather than re-driven once per output.
        const expected = challenge.expect(inputs);
        for (let oi = 0; oi < io.outputs.length; oi++) {
            const out = io.outputs[oi];
            const outName = out.name || challenge.outputs[oi].name;
            const brightness = board.ledBrightness(out.led);
            const got = brightness >= LIT ? 1 : (brightness <= DARK ? 0 : null);
            if (got === null) {
                // Neither lit nor dark: the output is floating or half-driven —
                // a real fault on a real board, and worth saying so rather than
                // rounding it to a wrong answer.
                restore();
                return {pass: false, realised: true, checked: bits, failing: {
                    inputs, output: outName, expected: expected[outName], got: null, brightness,
                    reason: 'the output LED is neither clearly lit nor clearly dark — the output looks floating. Check it is driven and has a path to ground.'
                }};
            }
            if (got !== expected[outName]) {
                restore();
                return {pass: false, realised: true, checked: bits,
                    failing: {inputs, output: outName, expected: expected[outName], got, brightness}};
            }
        }
    }
    restore();
    return {pass: true, realised: true, checked: total};
}

/** A one-line, learner-facing summary of a real-parts grade. */
export function gradeMessageRealised (result, challenge) {
    if (result.pass) {
        return `✓ It works in real parts — the output LED followed the truth table `
            + `through all ${result.checked} input combination${result.checked === 1 ? '' : 's'} on the live board.`;
    }
    if (result.problem) return result.problem;
    const f = result.failing;
    const inStr = Object.entries(f.inputs).map(([k, v]) => `${k}=${v}`).join(', ');
    if (f.reason) return `Not yet: with ${inStr}, ${f.reason}`;
    return `Not yet: with ${inStr} the output LED is ${f.got ? 'lit' : 'dark'}, but ${f.output} should be ${f.expected}.`;
}
