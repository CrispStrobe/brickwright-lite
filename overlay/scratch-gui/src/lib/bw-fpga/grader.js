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
