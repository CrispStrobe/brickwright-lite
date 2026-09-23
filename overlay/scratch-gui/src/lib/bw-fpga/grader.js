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
import {t, tn} from './l10n.js';
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
export function validateInterface (model, challenge, locale) {
    const ins = namesOfKind(model, 'in');
    const outs = namesOfKind(model, 'out');
    for (const {name} of challenge.inputs) {
        if (!ins.has(name)) return t(locale, 'problem.needInput', {name});
    }
    for (const {name} of challenge.outputs) {
        if (!outs.has(name)) return t(locale, 'problem.needOutput', {name});
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
export function gradeSequential (model, challenge, locale) {
    const problem = validateInterface(model, challenge, locale);
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
            return {pass: false, failing: {cycle: t, reasonKey: 'grade.model.unsettledCycle'}, checked: t};
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

export function grade (model, challenge, locale) {
    if (challenge.sequential) return gradeSequential(model, challenge, locale);
    const problem = validateInterface(model, challenge, locale);
    if (problem) return {pass: false, problem};

    const names = challenge.inputs.map(i => i.name);
    const n = names.length;
    const total = 1 << n;
    for (let bits = 0; bits < total; bits++) {
        const inputs = {};
        names.forEach((nm, i) => { inputs[nm] = (bits >> i) & 1; });
        const {outputs, settled} = evalModel(model, inputs);
        if (!settled) {
            return {pass: false, failing: {inputs, reasonKey: 'grade.model.unsettled'}, checked: bits};
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

/** The failure's reason sentence, resolved in `locale`. */
const reasonOf = (f, locale) => (f.reasonKey ? t(locale, f.reasonKey, f.reasonVars) : f.reason);

/** Inputs as "a=1, b=0" — names and digits, the same in every language. */
const inputList = f => Object.entries(f.inputs || {}).map(([k, v]) => `${k}=${v}`).join(', ');

/** A one-line, learner-facing summary of a grade result. */
export function gradeMessage (result, challenge, locale) {
    if (result.pass) {
        if (result.minimal) {
            return tn(locale, 'grade.pass.minimal', result.minimal.used, {used: result.minimal.used});
        }
        return t(locale, result.sequential ? 'grade.pass.sequentialModel' : 'grade.pass.exhaustiveModel',
            {checked: result.checked});
    }
    if (result.overBudget) {
        return t(locale, 'grade.overBudget',
            {used: result.overBudget.used, budget: result.overBudget.budget});
    }
    if (result.problem) return result.problem;
    const f = result.failing;
    const reason = reasonOf(f, locale);
    if (f.cycle !== undefined) {
        return reason
            ? t(locale, 'grade.fail.cycleReason', {cycle: f.cycle, reason})
            : t(locale, 'grade.fail.cycle',
                {cycle: f.cycle, output: f.output, got: f.got, expected: f.expected});
    }
    const inputs = inputList(f);
    return reason
        ? t(locale, 'grade.fail.reason', {inputs, reason})
        : t(locale, 'grade.fail.row', {inputs, output: f.output, got: f.got, expected: f.expected});
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
export function validateRealisation (circuit, challenge, io, locale) {
    const board = circuit && circuit.board;
    if (!board || typeof board.setControl !== 'function'
        || typeof board.advanceTo !== 'function' || typeof board.ledBrightness !== 'function') {
        return t(locale, 'problem.openCircuitTab');
    }
    const want = challenge.inputs.length;
    const got = io.inputs.length;
    if (got === 0 && !io.leds) {
        return t(locale, 'problem.nothingBuilt');
    }
    if (got !== want) {
        const names = challenge.inputs.map(i => i.name).join(', ');
        return t(locale, 'problem.switchCount', {names,
            inputs: tn(locale, 'count.inputs', want),
            switches: tn(locale, 'count.switches', got)});
    }
    const wantOut = challenge.outputs.length;
    if (!io.leds) {
        return wantOut === 1
            ? t(locale, 'problem.needLed')
            : t(locale, 'problem.needLeds', {names: challenge.outputs.map(o => o.name).join(', ')});
    }
    if (io.leds !== wantOut) {
        const names = challenge.outputs.map(o => o.name).join(', ');
        return t(locale, 'problem.ledCount', {names,
            outputs: tn(locale, 'count.outputs', wantOut),
            leds: tn(locale, 'count.leds', io.leds)});
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
function* gradeRealisedSteps (circuit, challenge, opts = {}) {
    const io = opts.io || discoverRealisation(circuit, challenge);
    const problem = validateRealisation(circuit, challenge, io, opts.locale);
    if (problem) return {pass: false, realised: true, problem};

    const board = circuit.board;
    const settleMs = opts.settleMs || SETTLE_MS;
    const stepMs = opts.stepMs || STEP_MS;
    if (typeof board.setPower === 'function') board.setPower(true);

    const names = challenge.inputs.map(i => i.name);

    // Which rows to drive. Exhausting the input space is the default and the
    // honest best, but it stops being possible: a 4-bit adder has 9 inputs, and
    // 512 rows on the real board is minutes of simulation, which is not a thing
    // to do inside a click. A challenge may instead name the rows it wants
    // driven, together with what they cover — the verdict then says so rather
    // than implying an exhaustiveness it did not do.
    const declared = typeof challenge.rows === 'function' ? challenge.rows()
        : (Array.isArray(challenge.rows) ? challenge.rows : null);
    const rows = declared || Array.from({length: 1 << names.length}, (_, bits) => {
        const row = {};
        names.forEach((nm, i) => { row[nm] = (bits >> i) & 1; });
        return row;
    });
    const total = rows.length;

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
        // Hand control back between rows so a long grade does not freeze the
        // page. The sync wrapper drains this without pausing, so nothing that
        // grades headlessly changes.
        yield {checked: bits, total};
        const inputs = rows[bits];
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
                    reasonKey: 'grade.real.floating'
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
    return {pass: true, realised: true, checked: total, ...(declared ? {coveringKey: challenge.rowsNoteKey || null} : {})};
}

/**
 * Grade a SEQUENTIAL challenge on the real board: clock it, and check both that
 * it takes the value AND that it keeps it.
 *
 * Everything else here is combinational — drive the inputs, read the LEDs. A
 * register is different in the one way that matters: its output must NOT follow
 * its input until a clock edge. So each cycle does two things:
 *
 *   1. set the data inputs, pulse the clock, and check the outputs took the
 *      value the reference says they should;
 *   2. change the data inputs WITHOUT clocking, and check the outputs did not
 *      move.
 *
 * Step 2 is the one that matters. A plain wire from d to the LED passes step 1
 * perfectly and fails step 2 immediately, and a learner who has wired a wire
 * deserves to be told that rather than congratulated.
 *
 * No reset is needed: every check is relative to an edge this grader caused.
 *
 * @param {object} circuit  the live Circuit
 * @param {object} challenge  a sequential realise challenge
 * @param {{io?: object, settleMs?: number, stepMs?: number}} [opts]
 */
function* gradeRealisedSequentialSteps (circuit, challenge, opts = {}) {
    const io = opts.io || discoverRealisation(circuit, challenge);
    const problem = validateRealisation(circuit, challenge, io, opts.locale);
    if (problem) return {pass: false, realised: true, sequential: true, problem};

    const names = challenge.inputs.map(i => i.name);
    const clockName = challenge.clock || 'clk';
    const clockAt = names.indexOf(clockName);
    if (clockAt < 0) {
        return {pass: false, realised: true, sequential: true,
            problem: `This challenge clocks the board, but no input is named "${clockName}".`};
    }

    const board = circuit.board;
    const settleMs = opts.settleMs || SETTLE_MS;
    const stepMs = opts.stepMs || STEP_MS;
    if (typeof board.setPower === 'function') board.setPower(true);

    const before = typeof board.getControl === 'function'
        ? io.inputs.map(inp => board.getControl(inp.switch)) : null;
    const restore = () => {
        if (!before) return;
        io.inputs.forEach((inp, i) => {
            if (before[i] !== undefined) board.setControl(inp.switch, before[i]);
        });
    };

    const setData = values => names.forEach((nm, i) => {
        if (i !== clockAt) board.setControl(io.inputs[i].switch, values[nm] ? 1 : 0);
    });
    const clock = level => board.setControl(io.inputs[clockAt].switch, level);
    const readOut = () => {
        const out = {};
        io.outputs.forEach((o, oi) => {
            const name = o.name || challenge.outputs[oi].name;
            const b = board.ledBrightness(o.led);
            out[name] = b >= LIT ? 1 : (b <= DARK ? 0 : null);
        });
        return out;
    };

    const stim = challenge.stimulus || {};
    const driven = Object.keys(stim);
    const cycles = challenge.cycles || (driven.length ? stim[driven[0]].length : 0);
    const expected = challenge.seqExpect(stim);

    clock(0);
    settle(board, settleMs, stepMs);

    for (let t = 0; t < cycles; t++) {
        yield {checked: t, total: cycles};
        const inputs = {};
        for (const k of driven) inputs[k] = stim[k][t];

        setData(inputs);
        settle(board, settleMs, stepMs);
        clock(1);                                  // the rising edge
        settle(board, settleMs, stepMs);

        const got = readOut();
        for (const {name} of challenge.outputs) {
            if (got[name] === null) {
                restore();
                return {pass: false, realised: true, sequential: true, checked: t, failing: {
                    cycle: t, inputs, output: name,
                    reasonKey: 'grade.real.floatingEdge'
                }};
            }
            if (got[name] !== expected[t][name]) {
                restore();
                return {pass: false, realised: true, sequential: true, checked: t,
                    failing: {cycle: t, inputs, output: name, expected: expected[t][name], got: got[name]}};
            }
        }

        // HOLD: move the DATA inputs with the clock still high. A register keeps
        // its value; a wire does not.
        //
        // An ASYNCHRONOUS CONTROL is not data and is held still here. A 74HC74's
        // clear takes effect the moment it is asserted, by design and by the
        // datasheet — so flipping it would make a CORRECT board look like a wire
        // ("q changed when the input changed but the clock did not"), which is
        // the opposite of what this check is for. Challenges name theirs in
        // `asyncInputs`. Before any challenge had one, every counter reached
        // here with nothing driven at all, so this check was already vacuous for
        // them; excluding the reset keeps it exactly as meaningful as it was,
        // and keeps it biting on the register, whose `d` IS data.
        const asyncControls = new Set(challenge.asyncInputs || []);
        const flipped = {};
        for (const k of driven) flipped[k] = asyncControls.has(k) ? inputs[k] : (inputs[k] ? 0 : 1);
        setData(flipped);
        settle(board, settleMs, stepMs);
        const held = readOut();
        for (const {name} of challenge.outputs) {
            if (held[name] !== got[name]) {
                restore();
                return {pass: false, realised: true, sequential: true, checked: t, failing: {
                    cycle: t, inputs, output: name, expected: got[name], got: held[name],
                    reasonKey: 'grade.real.notARegister', reasonVars: {output: name}
                }};
            }
        }
        setData(inputs);
        clock(0);                                  // back low, ready for the next edge
        settle(board, settleMs, stepMs);
    }

    restore();
    return {pass: true, realised: true, sequential: true, checked: cycles};
}

/** Run a grading generator to completion without pausing. */
function drain (it) {
    let step = it.next();
    while (!step.done) step = it.next();
    return step.value;
}

/** The steps a grade will take, so a caller can drive it however it likes. */
const stepsFor = (circuit, challenge, opts) => (challenge.sequential
    ? gradeRealisedSequentialSteps(circuit, challenge, opts)
    : gradeRealisedSteps(circuit, challenge, opts));

/**
 * Grade the learner's LIVE CIRCUIT. Synchronous: the whole grade runs before
 * this returns, which is what every headless test and every small challenge
 * wants.
 *
 * For a long one — the 4-bit adder drives 22 rows and takes seconds — use
 * gradeRealisedAsync, which does the same work without freezing the page.
 */
export function gradeRealisedCircuit (circuit, challenge, opts = {}) {
    return drain(stepsFor(circuit, challenge, opts));
}

/** Grade a sequential challenge synchronously. */
export function gradeRealisedSequential (circuit, challenge, opts = {}) {
    return drain(gradeRealisedSequentialSteps(circuit, challenge, opts));
}

/**
 * The same grade, yielding to the event loop between rows so the page stays
 * alive and can show progress.
 *
 * The board is driven exactly as the sync version drives it — same rows, same
 * settling, same verdict — the only difference is who holds the thread in
 * between. `onProgress({checked, total})` fires before each row.
 *
 * @returns {Promise<object>} the same result object as gradeRealisedCircuit
 */
export async function gradeRealisedAsync (circuit, challenge, opts = {}) {
    const {onProgress} = opts;
    const it = stepsFor(circuit, challenge, opts);
    let step = it.next();
    while (!step.done) {
        if (onProgress) onProgress(step.value);
        // A macrotask, not a microtask: a microtask queue drains before paint,
        // so awaiting a resolved promise would not let the browser render.
        await new Promise(resolve => setTimeout(resolve, 0));
        step = it.next();
    }
    return step.value;
}

/** A one-line, learner-facing summary of a real-parts grade. */
export function gradeMessageRealised (result, challenge, locale) {
    if (result.pass && result.sequential) {
        return tn(locale, 'grade.real.pass.sequential', result.checked, {checked: result.checked});
    }
    if (result.pass) {
        // A multi-output challenge watches several LEDs, and saying "the output
        // LED" of a half adder is simply untrue of what was just checked. Two
        // gets its own phrasing because "all 2 output LEDs" is not English —
        // and languages differ on this, so it is three keys, not a suffix.
        const nOut = ((challenge && challenge.outputs) || []).length;
        const leds = t(locale, nOut > 2 ? 'grade.real.leds.several'
            : nOut === 2 ? 'grade.real.leds.pair' : 'grade.real.leds.single', {n: nOut});
        // A declared row set is NOT every combination, and saying so is the
        // whole difference between a verdict a learner can trust and one that
        // quietly overclaims.
        if (result.coveringKey) {
            return t(locale, 'grade.real.pass.covering',
                {leds, checked: result.checked, covering: t(locale, result.coveringKey)});
        }
        return tn(locale, 'grade.real.pass.exhaustive', result.checked,
            {leds, checked: result.checked});
    }
    if (result.problem) return result.problem;
    const f = result.failing;
    const inputs = inputList(f);
    const reason = reasonOf(f, locale);
    if (f.cycle !== undefined) {
        return reason
            ? t(locale, 'grade.real.fail.cycleReason', {cycle: f.cycle, inputs, reason})
            : t(locale, 'grade.real.fail.cycle',
                {cycle: f.cycle, inputs, output: f.output, got: f.got, expected: f.expected});
    }
    if (reason) return t(locale, 'grade.real.fail.reason', {inputs, reason});
    return t(locale, 'grade.real.fail.row', {inputs,
        state: t(locale, f.got ? 'grade.real.lit' : 'grade.real.dark'),
        output: f.output, expected: f.expected});
}
