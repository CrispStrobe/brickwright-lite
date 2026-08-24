/**
 * What can this bench actually DO? — measured, not inferred from its part list.
 *
 * A lesson checkpoint asks a learner to observe something. Deciding whether the
 * example it names can produce that observation needs one fact about the bench:
 * the set of states it can reach. This module finds that set by SOLVING the
 * circuit — every control at each extreme, sampled across time — and reports
 * the properties a checkpoint's prose can demand.
 *
 * It is deliberately not a part-list heuristic. "Has a capacitor" does not mean
 * the capacitor can discharge: `29-capacitor-charge` has one and cannot, which
 * is exactly the defect this exists to catch. `capDischarges` is therefore true
 * only when some capacitor's voltage is measured to fall.
 *
 * Every property here is a fact about the engine's answer. Nothing is read off
 * the JSON except the control list, and that is then exercised rather than
 * trusted.
 */
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {boot, EXAMPLES, circuitPathOrNull} from './lesson-bench.mjs';

const MS = 1_000_000n;
/** Sample points, in ms. Chosen coprime with 1 kHz and 100 Hz periods so a
 *  waveform source cannot alias to a flat line — the exact trap that made a
 *  1 kHz sine read as DC during the Wave 2 review. */
const SAMPLE_MS = [1, 7, 23, 61, 137, 331, 797, 1597];

/** Extremes worth trying for each controllable kind. */
const EXTREMES = {
    button: [0, 1],
    switch: [0, 1],
    potentiometer: [0, 0.5, 1],
    ldr: [0, 1],
    ntc: [0, 1],
    vsource: null   // filled from the part's own declared volts, plus its negation
};

const vector = board => board.nets.map(n => {
    const v = board.nodeVoltage(n.id);
    return Number.isFinite(v) ? v.toFixed(4) : 'x';
}).join('|');

const capVolts = board => board.parts
    .filter(p => p.kind === 'capacitor')
    .map(p => [p.id, board.getCapVoltage ? board.getCapVoltage(p.id) : null]);

const ledBright = board => board.parts
    .filter(p => p.kind === 'led')
    .map(p => [p.id, board.ledBrightness(p.id)]);

/**
 * Probe one example.
 *
 * @param {string} exampleId
 * @returns {Promise<object>} measured capability record
 */
export async function benchCapabilities(exampleId, opts = {}) {
    // One heavy machine bench must not stall a corpus scan. `eater6502-full-build`
    // takes minutes where a discrete circuit takes 0.1 s. When the budget runs
    // out the record is marked `partial` and says how far it got — a truncated
    // measurement reported as complete is the "a skip is not a pass" failure in
    // a different costume.
    const budgetMs = opts.budgetMs ?? 20_000;
    const started = process.hrtime.bigint();
    const overBudget = () => Number(process.hrtime.bigint() - started) / 1e6 > budgetMs;
    let partial = false;
    const {Circuit} = await boot();
    const rel = circuitPathOrNull(exampleId);
    if (!rel) {
        // A program-only example. Every property below is a statement about a
        // circuit, so report the absence: `staticDC: false` here would read as
        // "it varies", which is a different and false claim.
        return {
            exampleId, circuitFile: null, noCircuit: true, controls: [], controlKinds: [],
            partKinds: [], stateCount: 0, staticDC: false, timeVarying: false,
            controllable: false, alternates: false, alternationScanned: false,
            capDischarges: false, hasCapacitor: false, hasInductor: false,
            ledOn: false, ledOff: false, ledSwitches: false, negativeNode: false,
            sourceReverses: false
        };
    }
    const raw = JSON.parse(readFileSync(path.join(EXAMPLES, rel), 'utf8'));

    const probe = settings => {
        const circuit = Circuit.fromJSON(structuredClone(raw));
        if (circuit.netlistError) return {error: circuit.netlistError};
        for (const [id, value] of settings) circuit.setControl(id, value);
        const board = circuit.board;
        const states = [];
        const caps = [];
        const leds = [];
        let t = 0n;
        for (const ms of SAMPLE_MS) {
            // The budget has to bite INSIDE the sample loop, not only between
            // control settings: one advanceTo on a full 6502 machine bench can
            // outlast the whole budget on its own, and checking only at the
            // outer level left the scan wedged on `eater6502-full-build`.
            if (overBudget()) { partial = true; break; }
            board.advanceTo(t = BigInt(ms) * MS);
            states.push(vector(board));
            caps.push(capVolts(board));
            leds.push(ledBright(board));
        }
        return {states, caps, leds, board, circuit};
    };

    const first = probe([]);
    if (first.error) return {exampleId, circuitFile: rel, error: first.error};

    const controls = first.circuit.getControls();
    // Every control setting worth trying, as a list of [id, value] settings.
    const settingsList = [[]];
    for (const control of controls) {
        const declared = raw.parts.find(p => p.id === control.id)?.params?.volts;
        const values = control.kind === 'vsource'
            ? [...new Set([declared ?? control.value ?? 5, -(declared ?? control.value ?? 5), 0])]
            : EXTREMES[control.kind] || [0, 1];
        for (const value of values) settingsList.push([[control.id, value]]);
    }
    // Plus every control at once, both ways — a two-switch bench (charge then
    // discharge) only shows its second phase when both are exercised together.
    if (controls.length > 1) {
        settingsList.push(controls.map(c => [c.id, 1]));
        settingsList.push(controls.map(c => [c.id, 0]));
        // charge-then-discharge: first control on, then off while the second goes on
        settingsList.push([[controls[0].id, 1]]);
    }

    const allStates = new Set();
    let timeVarying = false;
    let capDischarges = false;
    let ledOn = false;
    let ledOff = false;
    let negativeNode = false;
    let sourceReverses = false;

    const runs = [];
    for (const settings of settingsList) {
        if (overBudget()) { partial = true; break; }
        const r = probe(settings);
        if (r.error) continue;
        runs.push({settings, r});
        for (const s of r.states) allStates.add(s);
        if (new Set(r.states).size > 1) timeVarying = true;
        for (const led of r.leds.flat()) {
            if (led[1] > 0.02) ledOn = true;
            if (led[1] <= 0.001) ledOff = true;
        }
        for (const step of r.states) if (/(^|\|)-\d/.test(step)) negativeNode = true;
        // A capacitor discharges when its voltage falls materially below the
        // maximum it reached in the SAME run.
        const ids = (r.caps[0] || []).map(c => c[0]);
        for (let i = 0; i < ids.length; i++) {
            let peak = -Infinity;
            for (const sample of r.caps) {
                const v = sample[i]?.[1];
                if (v == null || !Number.isFinite(v)) continue;
                if (v > peak) peak = v;
                if (peak > 0.2 && v < peak - Math.max(0.1, 0.05 * peak)) capDischarges = true;
            }
        }
    }

    // Some states only exist across a SEQUENCE of control changes — the
    // charge/discharge bench, where one switch opens as another closes, and its
    // LED only ever lights in that second phase. One probe per setting cannot
    // see either, so walk the sequence on one board. (Omitting this made the
    // prober report `ledSwitches: false` for pc29-capacitor-discharge, whose
    // LED measurably reaches 0.14 during discharge — a false negative that
    // would have flagged a correct lesson.)
    // >= 1, not >= 2: a ONE-switch bench has the same sequence-only state
    // (charge with the switch open, then close it to discharge) and the
    // per-setting probes apply every control from t=0 — so 43-rc-timing's
    // new discharge switch read capDischarges:false and the detector
    // flagged the corrected lesson as unachievable (2026-08-25).
    if (controls.length >= 1 && !overBudget()) {
        const circuit = Circuit.fromJSON(structuredClone(raw));
        const board = circuit.board;
        let t = 0n;
        const seq = [];
        for (const c of controls) circuit.setControl(c.id, c.kind === 'vsource' ? c.value : 0);
        // close each non-source control in turn, holding the previous ones open
        const switches = controls.filter(c => c.kind === 'switch' || c.kind === 'button');
        // Settle with everything open FIRST — the charge phase. Without it a
        // one-switch bench closes its only switch at t=0 and there is
        // nothing charged left to fall.
        for (const ms of [50, 1000, 3000]) {
            board.advanceTo(t += BigInt(ms) * MS);
            seq.push(capVolts(board));
            allStates.add(vector(board));
        }
        for (const sw of switches) {
            for (const other of switches) circuit.setControl(other.id, other.id === sw.id ? 1 : 0);
            for (const ms of [50, 250, 1000, 3000]) {
                board.advanceTo(t += BigInt(ms) * MS);
                seq.push(capVolts(board));
                allStates.add(vector(board));
                for (const led of ledBright(board)) {
                    if (led[1] > 0.02) ledOn = true;
                    if (led[1] <= 0.001) ledOff = true;
                }
            }
        }
        const ids = (seq[0] || []).map(c => c[0]);
        for (let i = 0; i < ids.length; i++) {
            let peak = -Infinity;
            for (const sample of seq) {
                const v = sample[i]?.[1];
                if (v == null || !Number.isFinite(v)) continue;
                if (v > peak) peak = v;
                if (peak > 0.2 && v < peak - Math.max(0.1, 0.05 * peak)) capDischarges = true;
            }
        }
    }

    // Does any source actually alternate? Measured as a node that crosses its
    // own mean in both directions more than once inside one control setting.
    let alternates = false;
    for (const {r} of runs) {
        const circuit = Circuit.fromJSON(structuredClone(raw));
        const board = circuit.board;
        const netIds = board.nets.map(n => n.id);
        const traces = netIds.map(() => []);
        // 17 us steps over 51 ms: coprime with the 1 ms and 10 ms periods in the
        // corpus, and long enough to hold five cycles of the slowest (100 Hz).
        for (let i = 1; i <= 3000; i++) {
            board.advanceTo(BigInt(i * 17) * 1000n);
            netIds.forEach((id, k) => traces[k].push(board.nodeVoltage(id)));
        }
        for (const trace of traces) {
            const finite = trace.filter(Number.isFinite);
            if (finite.length < 10) continue;
            const mean = finite.reduce((a, b) => a + b, 0) / finite.length;
            const span = Math.max(...finite) - Math.min(...finite);
            if (span < 0.2) continue;
            let up = 0;
            let down = 0;
            for (let i = 1; i < finite.length; i++) {
                if (finite[i - 1] < mean && finite[i] >= mean) up++;
                if (finite[i - 1] > mean && finite[i] <= mean) down++;
            }
            if (up >= 2 && down >= 2) alternates = true;
        }
        break;   // the default control setting is enough to see a waveform source
    }

    const controlKinds = [...new Set(controls.map(c => c.kind))].sort();
    const partKinds = [...new Set(raw.parts.map(p => p.kind))].sort();
    for (const c of controls) {
        if (c.kind !== 'vsource') continue;
        const declared = raw.parts.find(p => p.id === c.id)?.params;
        if (declared && typeof declared.volts === 'number') sourceReverses = true;
    }

    return {
        exampleId,
        circuitFile: rel,
        partial,
        settingsTried: runs.length,
        settingsPossible: settingsList.length,
        controls: controls.map(c => ({id: c.id, kind: c.kind})),
        controlKinds,
        partKinds,
        stateCount: allStates.size,
        staticDC: allStates.size === 1,
        timeVarying,
        controllable: allStates.size > 1,
        alternates,
        capDischarges,
        hasCapacitor: partKinds.includes('capacitor'),
        hasInductor: partKinds.includes('inductor'),
        ledOn,
        ledOff,
        ledSwitches: ledOn && ledOff,
        negativeNode,
        sourceReverses
    };
}
