/**
 * Wave 6 — "Signals and systems" — claims gate.
 *
 * Wave 6 goes back to circuits, so it goes back to Wave 1's instrument: the
 * example is SOLVED through `scripts/lesson-bench.mjs` — `bw-circuit-ui`'s
 * `Circuit.fromJSON` over a fully-registered `bw-board` — and every number
 * below comes out of that. What is new is that half this wave's checkpoints
 * name the FREQUENCY-domain instruments, so this gate also drives the app's own
 * sweep (`model/sweep-runner.js` `runBode`, the same call `SweepPanel` makes)
 * and the app's own scope tap (`board.addScopeChannel` with the arguments
 * `ScopePanel` passes: a type and a net, and nothing else).
 *
 * WHAT IS DELIBERATELY NOT PINNED HERE: wall-clock timings. The Bode sweep's
 * cost matters to two lessons and was measured (7.2 s for one point at 10 Hz,
 * 57 s at 1 Hz, 84 s at 0.5 Hz on the review machine), but a wall-clock number
 * from a loaded box is not reproducible and a gate built on one is a gate people
 * learn to ignore. What IS pinned is the deterministic cost model those timings
 * come from: `runAcSweep` spends `settleCycles + measureCycles` = 10 cycles of
 * SIMULATED time per frequency point, so a point at f costs 10/f seconds of
 * simulation whatever the machine.
 *
 * Tests named OPEN DEFECT assert a defect STILL REPRODUCES; they fail the day
 * the app or an example is fixed, and that failure is the instruction to update
 * `docs/LESSON-REVIEW-WAVE-6.md` and the lesson hint each names.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {boot, load, terminalVolts, EXAMPLES, circuitPathFor, fmt} from '../scripts/lesson-bench.mjs';

const REPO = path.resolve(import.meta.dirname, '..');
const GUI = path.join(REPO, 'overlay/scratch-gui/src');
const CUI = path.join(GUI, 'lib/bw-circuit-ui');
const BWB = path.join(GUI, 'lib/bw-board');
const WAVE = JSON.parse(readFileSync(
    path.join(GUI, 'components/gui/lesson-waves/signals-6.json'), 'utf8'));

const circuitOf = id => JSON.parse(
    readFileSync(path.join(EXAMPLES, circuitPathFor(id)), 'utf8'));

const MS = 1000n * 1000n;
const US = 1000n;

const lesson = id => {
    const found = WAVE.lessons.find(l => l.id === id);
    assert.ok(found, `${id} is no longer in signals-6.json`);
    return found;
};
const checkpoint = (id, cp) => {
    const found = lesson(id).checkpoints.find(c => c.id === cp);
    assert.ok(found, `${id} has no "${cp}" checkpoint`);
    return found;
};

await boot();
const {getEngine} = await import(path.join(CUI, 'engine.js'));
const {netOfTerminal, runBode, listSweepSources} =
    await import(path.join(CUI, 'model/sweep-runner.js'));

/** One Bode point, through the same call the panel makes. */
function bodePoint (board, sourceId, inNet, outNet, f) {
    const r = runBode(getEngine(), board, {sourceId, inNet, outNet, fFrom: f, fTo: f, pointsPerDecade: 1});
    assert.ok(r.ok, `the sweep refused at ${f} Hz: ${r.reason}`);
    // logSpace can hand back the endpoint twice when from === to; the first row
    // is the one measured throughout this review.
    assert.ok(r.rows.length >= 1, `the sweep returned no rows at ${f} Hz`);
    return r.rows[0];
}
const near = (actual, expected, tol, what) =>
    assert.ok(Math.abs(actual - expected) <= tol,
        `${what}: measured ${fmt(actual)}, expected ${expected} ± ${tol}`);

test('instrument: Wave 6 still has the ten lessons this gate measures', () => {
    assert.equal(WAVE.wave, 'signals-6');
    assert.deepEqual(WAVE.lessons.map(l => l.id).sort(), [
        'signals-aliasing-fft', 'signals-bode-sweep', 'signals-complex-impedance',
        'signals-cutoff-phase', 'signals-loading', 'signals-model-measurement',
        'signals-noise', 'signals-rc-response', 'signals-resonance', 'signals-rl-response'
    ]);
    assert.equal(WAVE.lessons.reduce((n, l) => n + l.checkpoints.length, 0), 20);
});

test('instrument: the sweep and the scope are wired, so a refusal would be real', async () => {
    const {board} = await load('50-rc-scope');
    assert.deepEqual(listSweepSources(board).map(s => s.id), ['fg1']);
    const engine = getEngine();
    for (const fn of ['runAcSweep', 'runDcSweep', 'logSpace']) {
        assert.equal(typeof engine[fn], 'function', `the engine injection lacks ${fn}`);
    }
    assert.equal(typeof board.addScopeChannel, 'function');
});

// ── signals-rc-response / 43-rc-timing ─────────────────────────────────────

test('signals-rc-response: from 0.5 tau on, the bench is textbook to four decimals', async () => {
    assert.equal(lesson('signals-rc-response').exampleId, '43-rc-timing');
    const {board, data} = await load('43-rc-timing');
    const r = data.parts.find(p => p.id === 'r1').params.ohms;
    const c = data.parts.find(p => p.id === 'c1').params.farads;
    assert.equal(r * c, 1, 'tau is 10 kohm x 100 uF = 1 s, which the lesson hint states');
    // The checkpoint asks for 0, 0.5, 1, 2 and 3 tau.
    const expect = {500: 1.9673, 1000: 3.1606, 2000: 4.3233, 3000: 4.7511};
    for (const [ms, v] of Object.entries(expect)) {
        board.advanceTo(BigInt(ms) * MS);
        near(terminalVolts(board)['c1.a'], v, 5e-4, `V(c1.a) at t = ${ms} ms`);
    }
});

test('OPEN DEFECT: the t = 0 sample reads the supply, not zero', async () => {
    // The lesson asks for a reading "at 0". A freshly loaded board answers with
    // its DC operating point, in which the capacitor is an open circuit, so the
    // meter says 5 V on a capacitor the engine itself believes is at 0 V.
    const fresh = await load('43-rc-timing');
    assert.equal(fmt(terminalVolts(fresh.board)['c1.a']), '5.0000',
        'the first reading is no longer the DC operating point — re-measure Wave 6 ' +
        'and soften the signals-rc-response hint');
    assert.equal(fresh.board.getCapVoltage('c1'), 0,
        'the engine no longer disagrees with itself about c1 — the defect is fixed');
    // One nanosecond of simulation is enough to make it honest.
    fresh.board.advanceTo(1n);
    assert.equal(fmt(terminalVolts(fresh.board)['c1.a']), '0.0000');
});

test('OPEN DEFECT: the scope cannot hold a step this slow', async () => {
    // 100 kHz x 8192 samples is fixed in the engine and the panel passes neither,
    // so every scope capture in this wave is 81.92 ms long — against a 1 s tau.
    const {board} = await load('43-rc-timing');
    const netId = board.nets.find(n =>
        n.terminals.some(t => t.part === 'c1' && t.terminal === 'a')).id;
    const handle = board.addScopeChannel({type: 'voltage', netId});
    board.advanceTo(200n * MS);
    const d = board.getScopeData(handle);
    assert.equal(Number(d.sampleIntervalNs), 10_000, 'the scope cadence changed — re-measure Wave 6');
    assert.equal(d.samples.length / 2, 8192, 'the scope depth changed — re-measure Wave 6');
    const recordMs = (d.samples.length / 2) * Number(d.sampleIntervalNs) / 1e6;
    assert.equal(recordMs, 81.92);
    assert.ok(recordMs < 1000, 'the scope record now spans a full RC time constant — ' +
        'restore the scope to signals-rc-response and delete this test');
    const panel = readFileSync(path.join(CUI, 'components/ScopePanel.jsx'), 'utf8');
    assert.ok(!/sampleRateHz|depth:/.test(panel),
        'ScopePanel now chooses a sample rate or depth — the fixed 81.92 ms record is gone');
});

// ── signals-rl-response / pc52-inductor-filter ─────────────────────────────

test('OPEN DEFECT: the RL lesson names an RLC bench, and L/R holds only in its first 300 us', async () => {
    assert.equal(lesson('signals-rl-response').exampleId, 'pc52-inductor-filter');
    const {board, data} = await load('pc52-inductor-filter');
    const L = data.parts.find(p => p.id === 'l').params.henrys;
    const rSeries = data.parts.find(p => p.id === 'r').params.ohms;
    const rLoad = data.parts.find(p => p.id === 'load').params.ohms;
    const cap = data.parts.find(p => p.id === 'c').params.farads;
    assert.deepEqual([L, rSeries, rLoad, cap], [0.01, 100, 1000, 0.0001],
        'pc52 changed — re-measure Wave 6');

    // Nothing in the app steps this source for the learner; the lesson has to.
    board.setPartParam('src', 'volts', 0);
    board.advanceTo(200n * MS);
    board.setPartParam('src', 'volts', 5);
    // `advanceTo` only moves forward, so every sample is taken once, in order,
    // and read back from the record afterwards.
    const I = {};
    for (const us of [50, 100, 200, 300, 500, 1000]) {
        board.advanceTo((200n * MS) + (BigInt(us) * US));
        I[us] = (5 - terminalVolts(board)['r.b']) / 100;   // the hint's own method
    }
    // Inside the window the capacitor is still a short, so the current obeys
    // the RL law with R = 100 ohm and an asymptote of 50 mA.
    const ideal = us => 0.05 * (1 - Math.exp(-us / 100));
    for (const us of [50, 100, 200, 300]) {
        const ratio = I[us] / ideal(us);
        assert.ok(ratio > 0.98 && ratio <= 1.0,
            `at ${us} us the measured current is ${(ratio * 100).toFixed(2)} % of the ideal RL curve`);
    }
    near(I[100], 0.031556, 5e-6, 'I at t = 1 tau (63 % of 50 mA)');
    // And outside it the capacitor owns the response: the current turns around.
    near(I[500], 0.048161, 5e-6, 'the current peaks near 500 us');
    assert.ok(I[1000] < I[500], 'and falls again — an RL step response never does that');
    board.advanceTo((200n * MS) + (500n * MS));
    const settled = (5 - terminalVolts(board)['r.b']) / 100;
    near(settled, 0.0045455, 1e-6,
        'the circuit settles at 5 V / 1100 ohm, not at the RL asymptote of 50 mA');
    assert.ok(settled / 0.05 < 0.1,
        'the settled current is now within a decade of the RL asymptote — re-measure Wave 6');
});

// ── signals-complex-impedance + signals-cutoff-phase / 50-rc-scope ─────────

test('signals-cutoff-phase: both criteria bracket the same cutoff on this bench', async () => {
    assert.equal(lesson('signals-cutoff-phase').exampleId, '50-rc-scope');
    assert.equal(lesson('signals-complex-impedance').exampleId, '50-rc-scope');
    const {board, data} = await load('50-rc-scope');
    const r = data.parts.find(p => p.id === 'r1').params.ohms;
    const c = data.parts.find(p => p.id === 'c1').params.farads;
    const fc = 1 / (2 * Math.PI * r * c);
    near(fc, 15.9155, 1e-3, 'the bench cutoff the lesson has the learner calculate');

    const inNet = netOfTerminal(board, 'fg1', 'pos');
    const outNet = netOfTerminal(board, 'c1', 'a');
    const below = bodePoint(board, 'fg1', inNet, outNet, 10);
    const above = bodePoint(board, 'fg1', inNet, outNet, 17.78);
    near(below.magDb, -1.445, 0.02, 'magnitude at 10 Hz');
    near(below.phaseDeg, -32.14, 0.3, 'phase at 10 Hz');
    near(above.magDb, -3.519, 0.02, 'magnitude at 17.78 Hz');
    near(above.phaseDeg, -48.17, 0.3, 'phase at 17.78 Hz');
    // The -3.010 dB crossing and the -45 deg crossing are both inside the same
    // bracket, which is the agreement the lesson exists to test.
    assert.ok(below.magDb > -3.010 && above.magDb < -3.010, 'the -3 dB crossing is bracketed');
    assert.ok(below.phaseDeg > -45 && above.phaseDeg < -45, 'and so is the -45 deg crossing');
});

test('OPEN DEFECT: a tone a decade below cutoff does not fit in a scope record', async () => {
    // signals-complex-impedance measures "below, at, and above cutoff" and its
    // hint converts a scope delta-t to phase. At fc/10 the period is 628 ms
    // against the fixed 81.92 ms record.
    const {data} = await load('50-rc-scope');
    const fc = 1 / (2 * Math.PI * data.parts.find(p => p.id === 'r1').params.ohms *
        data.parts.find(p => p.id === 'c1').params.farads);
    const periodBelowMs = 1000 / (fc / 10);
    near(periodBelowMs, 628.3, 0.5, 'the period a decade below cutoff');
    assert.ok(periodBelowMs > 81.92,
        'a decade below cutoff now fits in the scope record — restore the scope route to ' +
        'signals-complex-impedance and delete this test');
    // At cutoff it does fit, which is why the lesson keeps the scope for that point.
    assert.ok(1000 / fc < 81.92, 'one cycle at cutoff fits in the record');
});

// ── signals-bode-sweep + signals-model-measurement / pc50-two-stage-rc ─────

test('the Bode bench corners inside the instrument\'s range', async () => {
    // Was an OPEN DEFECT, and it fired as written: "the sweep got cheaper —
    // re-measure Wave 6 and restore the corner sweep to the lesson."
    //
    // pc50-two-stage-rc was two 10 kΩ / 100 µF stages cornering at 0.159 Hz.
    // `runAcSweep` measures each point by single-frequency correlation over
    // settleCycles + measureCycles cycles, so a point costs 10/f seconds of
    // SIMULATED time — 629 s a decade below that corner, which is why the
    // checkpoint had to be reworded to stay two decades ABOVE the corners, i.e.
    // away from the only part of a Bode plot worth looking at.
    //
    // 100 µF → 100 nF (sb3-creator 776a96e) moves both corners to 159.155 Hz.
    // The transfer function depends on R·C, so only the frequency axis moved:
    // every magnitude, phase and slope below is what the old bench produced at
    // one thousandth of the frequency. Both lessons are restored to version 3.
    assert.equal(lesson('signals-bode-sweep').exampleId, 'pc50-two-stage-rc');
    assert.equal(lesson('signals-model-measurement').exampleId, 'pc50-two-stage-rc');
    const {board, data} = await load('pc50-two-stage-rc');
    const r1 = data.parts.find(p => p.id === 'r1').params.ohms;
    const c1 = data.parts.find(p => p.id === 'c1').params.farads;
    const fc = 1 / (2 * Math.PI * r1 * c1);
    near(fc, 159.1549, 1e-3, 'each stage corners here');

    // The cost model, read off the engine rather than off a stopwatch.
    const sweepSrc = readFileSync(path.join(BWB, 'sweep.js'), 'utf8');
    assert.match(sweepSrc, /settleCycles = 6/);
    assert.match(sweepSrc, /measureCycles = 4/);
    assert.match(sweepSrc, /samplesPerCycle = 32/);
    const secondsPerPoint = f => (6 + 4) / f;
    near(secondsPerPoint(fc / 10), 0.628, 0.005,
        'one point a decade below the corner now costs this many seconds of simulated time');
    assert.ok(secondsPerPoint(fc / 10) < 1,
        'a point a decade below the corner costs more than a second of simulated time again — ' +
        'the bench moved back out of range. Re-measure Wave 6 and re-word signals-bode-sweep ' +
        'and signals-model-measurement, which both now tell the learner to sweep ACROSS the corner.');

    // The response the lesson teaches, at the frequencies the lesson now names.
    const inNet = netOfTerminal(board, 'src', 'pos');
    const outNet = netOfTerminal(board, 'c2', 'a');
    const below = bodePoint(board, 'src', inNet, outNet, fc / 10);
    const at = bodePoint(board, 'src', inNet, outNet, fc);
    const above = bodePoint(board, 'src', inNet, outNet, fc * 10);
    near(below.magDb, -0.456, 0.02, 'magnitude a decade below the corner');
    near(below.phaseDeg, -16.60, 0.1, 'phase a decade below the corner');
    near(at.magDb, -9.572, 0.02, 'magnitude at the corner');
    near(at.phaseDeg, -89.62, 0.1, 'phase at the corner');
    near(above.magDb, -40.738, 0.05, 'magnitude a decade above the corner');
    near(above.phaseDeg, -161.98, 0.1, 'phase a decade above the corner');

    // And the finding the checkpoint's `explain` step exists for: two poles, but
    // short of the ideal −40 dB/decade because the second stage loads the first.
    const twoAbove = bodePoint(board, 'src', inNet, outNet, fc * 100);
    const slope = twoAbove.magDb - above.magDb;
    near(slope, -36.64, 0.1, 'slope one to two decades above the corner');
    assert.ok(slope > -40,
        'the loaded cascade must attenuate LESS steeply than the product of two ideal stages');

    // The panel's default start is now inside the passband rather than deep in
    // the stopband, which was the other half of the finding.
    const panel = readFileSync(path.join(CUI, 'components/SweepPanel.jsx'), 'utf8');
    assert.match(panel, /useState\(10\)/, 'the panel default fFrom changed — re-measure');
    const atDefault = bodePoint(board, 'src', inNet, outNet, 10);
    assert.ok(atDefault.magDb > -1,
        `a learner who just clicks Sweep now starts in the passband (${atDefault.magDb.toFixed(3)} dB ` +
        'at the panel default 10 Hz), not at −71.549 dB as on the old bench');
});

test('both pc50 lessons were restored when their bench was', () => {
    // The pairing this campaign keeps getting wrong in the other direction: a
    // bench repaired without its lesson leaves the workaround in the copy.
    for (const id of ['signals-bode-sweep', 'signals-model-measurement']) {
        assert.equal(lesson(id).version, 3, `${id} must be at content version 3`);
    }
    const sweepHint = lesson('signals-bode-sweep').checkpoints
        .find(c => c.id === 'sweep').copy.en.hint;
    assert.ok(!/Stay two decades above|over ten minutes|R × C = 1 s/.test(sweepHint),
        'the workaround wording is still in signals-bode-sweep');
    assert.match(sweepHint, /159\.155 Hz/, 'the hint names the corner it can now reach');
    const compare = lesson('signals-model-measurement').checkpoints
        .find(c => c.id === 'compare').copy.en;
    assert.ok(!/two decades above the corner/.test(compare.action),
        'the workaround wording is still in signals-model-measurement');
    // D3 is still open, so the transcribe-by-hand half must NOT have been dropped.
    assert.match(compare.hint, /no numeric readout and no export/,
        'the sweep still reports no numbers (D3) — that disclosure must stay until it does');
});

test('OPEN DEFECT: the sweep plots but reports no numbers', () => {
    // signals-model-measurement asks for residuals with propagated uncertainty
    // and its python variant says to "export or transcribe sweep rows". The
    // panel draws a 260x140 canvas whose only labels are the two dB extremes
    // and +/-180 deg: no frequency axis, no per-point readout, no export.
    const panel = readFileSync(path.join(CUI, 'components/SweepPanel.jsx'), 'utf8');
    const labels = [...panel.matchAll(/g\.fillText\(([^,]+),/g)].map(m => m[1].trim());
    assert.deepEqual(labels, [
        '`${(iHi * 1000).toFixed(2)}mA`', '`${(iLo * 1000).toFixed(2)}mA`',
        '`${vLo.toFixed(1)}V`', '`${vHi.toFixed(1)}V`',
        '`${dbHi.toFixed(0)}dB`', '`${dbLo.toFixed(0)}dB`',
        "'+180°'", "'-180°'"
    ], 'the sweep panel grew or lost a label — if it now reports frequencies or rows, ' +
       'soften signals-model-measurement and signals-bode-sweep and delete this test');
    assert.ok(!/download|toCSV|copyRows|clipboard/i.test(panel),
        'the sweep panel grew an export — the residual analysis is now possible');
});

test('signals-bode-sweep: the two-pole slope and the loading effect are both measurable', async () => {
    // These were 1 Hz and 10 Hz on the 100 µF bench — 6.28x and 62.8x the
    // corner. The corner moved by 1000x, so the SAME two points are now at
    // 1 kHz and 10 kHz, and they read what they read before, to the millibel.
    // That equality is the evidence that changing the capacitor moved the axis
    // and nothing else.
    const {board, data} = await load('pc50-two-stage-rc');
    const inNet = netOfTerminal(board, 'src', 'pos');
    const outNet = netOfTerminal(board, 'c2', 'a');
    const fc = 1 / (2 * Math.PI * data.parts.find(p => p.id === 'r1').params.ohms
        * data.parts.find(p => p.id === 'c1').params.farads);
    const one = bodePoint(board, 'src', inNet, outNet, fc * 6.2832);
    const ten = bodePoint(board, 'src', inNet, outNet, fc * 62.832);
    near(one.magDb, -32.782, 0.05, 'magnitude at 2*pi times the corner');
    near(ten.magDb, -71.549, 0.05, 'magnitude a decade above that');
    const slope = ten.magDb - one.magDb;
    assert.ok(slope < -38 && slope > -41,
        `two poles give about -40 dB/decade; measured ${slope.toFixed(2)}`);
    // The lesson's point: the ideal unloaded cascade is not what this bench does.
    const idealOneStageDb = f => 20 * Math.log10(1 / Math.sqrt(1 + ((f / fc) ** 2)));
    const unloaded = 2 * idealOneStageDb(fc * 6.2832);
    assert.ok(one.magDb < unloaded - 0.3,
        `the loaded cascade attenuates more than the ideal product ` +
        `(${one.magDb.toFixed(3)} dB against ${unloaded.toFixed(3)} dB)`);
});

// ── signals-resonance / pc52-inductor-filter ───────────────────────────────

test('OPEN DEFECT: as shipped the resonance bench is overdamped and has no peak to find', async () => {
    assert.equal(lesson('signals-resonance').exampleId, 'pc52-inductor-filter');
    const {board} = await load('pc52-inductor-filter');
    const inNet = netOfTerminal(board, 'src', 'pos');
    const outNet = netOfTerminal(board, 'load', 'a');
    const rows = [50, 100, 159, 250, 500].map(f => bodePoint(board, 'src', inNet, outNet, f));
    for (let i = 1; i < rows.length; i++) {
        assert.ok(rows[i].magDb < rows[i - 1].magDb,
            'the shipped response is monotone — a peak appeared, so re-measure Wave 6');
    }
    near(rows[2].magDb, -20.002, 0.05, 'magnitude at the nominal f0 of 159 Hz — 20 dB DOWN, not up');

    // With a capacitor the learner chooses, the peak the lesson asks for is real.
    board.setPartParam('c', 'farads', 1e-7);
    const f0 = 1 / (2 * Math.PI * Math.sqrt(0.01 * 1e-7));
    near(f0, 5032.9, 1, 'f0 with 0.1 uF');
    const peak = bodePoint(board, 'src', inNet, outNet, 5033);
    near(peak.magDb, 3.872, 0.05, 'the peak this bench can actually show');
    assert.ok(peak.magDb > 0, 'a resonant peak rises above the passband');
});

test('signals-resonance: the edit its checkpoint asks for now reaches the lesson', async () => {
    // Was an OPEN DEFECT, and the third of three: `bw-circuit-changed` was
    // dispatched only when the derived PIN DECLARATIONS moved, and this bench
    // has no MCU, so no wiring edit could raise it. Wave 1 found it on
    // starter-circuit-path, Wave 6 on signals-resonance, Wave 7 on
    // machines-contention — one defect, three discoveries.
    //
    // Fixed 2026-08-24: CircuitDesigner fires `onCircuitEdit` from a STRUCTURAL
    // signature of the circuit, and circuit-tab.jsx dispatches the DOM event
    // from there.
    assert.deepEqual(checkpoint('signals-resonance', 'sweep').observe, {event: 'circuit-changed'});
    const {circuitSignature} = await import(path.join(CUI, 'model/circuit-signature.js'));
    const raw = circuitOf(lesson('signals-resonance').exampleId);

    const base = circuitSignature(raw.parts, raw.wires);

    // A WIRING edit, which is what this checkpoint actually asks for — and on a
    // 6502 bench it is the only edit there is: every part on it carries an empty
    // `params`, so a param-based probe would assert nothing here. (It did, in the
    // first draft of this test, and failed for the right reason.)
    assert.ok((raw.wires || []).length, 'the bench has no wires to edit');
    const cut = structuredClone(raw);
    cut.wires = cut.wires.slice(0, -1);
    assert.notEqual(circuitSignature(cut.parts, cut.wires), base,
        'breaking a wire must move the circuit signature, or this checkpoint goes back to ' +
        'being completable only by its manual button');

    // A PARAM edit too, where the bench has one — the other half of what
    // `starter-circuit-path`'s hint suggests.
    const swapped = structuredClone(raw);
    const part = swapped.parts.find(p => p.params && Object.keys(p.params).length);
    if (part) {
        const key = Object.keys(part.params)[0];
        part.params[key] = typeof part.params[key] === 'number' ? part.params[key] * 2 : 'changed';
        assert.notEqual(circuitSignature(swapped.parts, swapped.wires), base,
            'editing a part param must move the signature too');
    }

    const tab = readFileSync(path.join(GUI, 'components/tw-pseudocode/circuit-tab.jsx'), 'utf8');
    assert.match(tab, /onCircuitEdit=\{this\.handleCircuitEdit\}/,
        'circuit-tab.jsx no longer subscribes to onCircuitEdit — re-measure and update ' +
        'docs/LESSON-REVIEW-WAVE-6.md');
});

// ── signals-loading / pc54-opamp-follower ──────────────────────────────────

test('signals-loading: the divider error the lesson teaches is measured, decade by decade', async () => {
    assert.equal(lesson('signals-loading').exampleId, 'pc54-opamp-follower');
    const buffered = {};
    for (const ohms of [1e6, 1e5, 1e4, 1e3, 1e2]) {
        const {board} = await load('pc54-opamp-follower');
        board.setPartParam('load', 'ohms', ohms);
        board.setControl('pot', 0.5);
        board.advanceTo(50n * MS);
        buffered[ohms] = terminalVolts(board)['amp.out'];
    }
    for (const [ohms, v] of Object.entries(buffered)) {
        near(v, 2.5, 5e-4, `buffered output with a ${ohms} ohm load`);
    }
    // Unbuffered: the same load straight onto the wiper. Thevenin is 2.5 V
    // behind 2.5 kohm, and the bench agrees with that to four figures.
    const {Circuit} = await boot();
    const {data} = await load('pc54-opamp-follower');
    const unbuffered = {};
    for (const ohms of [1e6, 1e5, 1e4, 1e3, 1e2]) {
        const parts = data.parts.filter(p => p.id !== 'amp')
            .map(p => (p.id === 'load' ? {...p, params: {...p.params, ohms}} : p));
        const wires = (data.wires || []).filter(w =>
            w.from !== 'amp' && w.to !== 'amp' && !(w.to && w.to.board));
        const circuit = Circuit.fromJSON({...data, parts, wires: [...wires,
            {from: 'pot', fromTerminal: 'wiper', to: 'load', toTerminal: 'a'},
            {from: 'load', fromTerminal: 'b', to: 'gnd', toTerminal: 'gnd'}]});
        assert.ok(!circuit.netlistError, `unbuffered netlist rejected: ${circuit.netlistError}`);
        circuit.board.setControl('pot', 0.5);
        circuit.board.advanceTo(50n * MS);
        unbuffered[ohms] = terminalVolts(circuit.board)['pot.wiper'];
    }
    near(unbuffered[1e6], 2.4938, 5e-4, 'unbuffered with 1 Mohm');
    near(unbuffered[1e5], 2.4390, 5e-4, 'unbuffered with 100 kohm');
    near(unbuffered[1e4], 2.0000, 5e-4, 'unbuffered with 10 kohm');
    near(unbuffered[1e3], 0.7143, 5e-4, 'unbuffered with 1 kohm');
    near(unbuffered[1e2], 0.0962, 5e-4, 'unbuffered with 100 ohm');
});

test('OPEN DEFECT: the follower has no output limit and the probe has no input impedance', async () => {
    // signals-loading asks the learner to "identify where follower output limits
    // replace divider error", and to include "probe input impedance".
    const {board} = await load('pc54-opamp-follower');
    board.setPartParam('load', 'ohms', 1);
    board.setControl('pot', 0.5);
    board.advanceTo(50n * MS);
    const v = terminalVolts(board)['amp.out'];
    near(v, 2.5, 5e-4, 'the follower output into 1 ohm');
    assert.ok(v / 1 > 2,
        'the op-amp model now droops under load — restore the output-limit regime to ' +
        'signals-loading and delete this test');
    // The probe: a `meter` part is removed from the netlist before the solve,
    // so it cannot load anything.
    const circuitModel = readFileSync(path.join(CUI, 'model/circuit.js'), 'utf8');
    const filters = circuitModel.match(/p\.kind !== 'meter'/g) || [];
    assert.ok(filters.length >= 2,
        'the meter is no longer filtered out of the engine netlist — probe loading may now be ' +
        'observable, so restore it to signals-loading and delete this test');
});

// ── signals-noise / arduino-03-smoothing ───────────────────────────────────

test('OPEN DEFECT: the noise lesson has no noise — the simulated sensor is bit-exact', async () => {
    assert.equal(lesson('signals-noise').exampleId, 'arduino-03-smoothing');
    const {board} = await load('arduino-03-smoothing');
    board.setControl('pot1', 0.371);
    const counts = [];
    let t = 0n;
    for (let i = 0; i < 12; i++) {
        board.advanceTo(t += 5n * MS);
        counts.push(Math.round((board.readAnalog('a0') / 5) * 1023));
    }
    assert.deepEqual([...new Set(counts)], [380],
        'the simulated pot now varies between reads — there is noise to smooth, so restore ' +
        'the spread half of signals-noise and delete this test');
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    const sd = Math.sqrt(counts.reduce((a, b) => a + ((b - mean) ** 2), 0) / counts.length);
    assert.equal(sd, 0, 'the standard deviation the checkpoint asks for is exactly zero');
    // The delay half IS teachable: the program is a real 10-sample moving average.
    const program = readFileSync(path.join(EXAMPLES, 'arduino-03-smoothing/program.bw'), 'utf8');
    assert.match(program, /set numReadings to 10/, 'the window size the learner varies');
    assert.match(program, /set average to \(total \/ numReadings\)/, 'a genuine moving average');
    assert.match(program, /print average/, 'and it reports, so the delay is observable');
});

// ── signals-aliasing-fft / 49-function-generator-sine ──────────────────────

test('OPEN DEFECT: there is no FFT, and the samples an FFT would need are an envelope', async () => {
    assert.equal(lesson('signals-aliasing-fft').exampleId, '49-function-generator-sine');
    // No spectrum view anywhere in the circuit UI.
    const panel = readFileSync(path.join(CUI, 'components/ScopePanel.jsx'), 'utf8');
    assert.ok(!/fft|fourier|spectrum|hann|hamming|blackman/i.test(panel.replace(/channel/gi, '')),
        'the scope grew a spectrum view — restore the FFT half of signals-aliasing-fft ' +
        'and delete this test');
    // And what the scope stores is a min/max envelope, two numbers per bucket,
    // not the raw series a transform consumes.
    const {board} = await load('49-function-generator-sine');
    const netId = board.nets.find(n =>
        n.terminals.some(t => t.part === 'fg1' && t.terminal === 'pos')).id;
    const handle = board.addScopeChannel({type: 'voltage', netId});
    board.advanceTo(100n * MS);
    const d = board.getScopeData(handle);
    assert.equal(d.samples.length, 8192 * 2, 'interleaved (min, max) pairs, not a sample series');
    const boardSrc = readFileSync(path.join(BWB, 'board.js'), 'utf8');
    assert.match(boardSrc, /Ring buffer: interleaved \[min0, max0/);
    // The two numbers the predict step needs, neither of which the app displays.
    assert.equal(1e9 / Number(d.sampleIntervalNs) / 2, 50_000, 'Nyquist');
    assert.equal(1e9 / Number(d.sampleIntervalNs) / 8192, 12.20703125, 'bin spacing, Hz');
    // The panel uses the cadence to label its cursor delta and never shows the
    // cadence or the record length themselves, so neither number the predict
    // step needs is on screen.
    assert.ok(!/100\s*kHz|8192|81\.92|Nyquist/i.test(panel),
        'the panel now states the sample cadence or the record length — the predict step ' +
        'has its inputs, so soften signals-aliasing-fft and delete this test');
});

// ── The lesson copy this review wrote, in both languages ───────────────────

test('the Wave 6 revisions are present, EN and DE, at the content version this review recorded', () => {
    assert.deepEqual(Object.fromEntries(WAVE.lessons.map(l => [l.id, l.version])), {
        'signals-rc-response': 3,
        'signals-rl-response': 2,
        'signals-complex-impedance': 2,
        'signals-cutoff-phase': 2,
        'signals-bode-sweep': 3,
        'signals-resonance': 2,
        'signals-loading': 2,
        'signals-noise': 2,
        'signals-aliasing-fft': 2,
        'signals-model-measurement': 3
    }, 'a Wave 6 lesson changed content version — update docs/LESSON-REVIEW-WAVE-6.md with it');

    const says = (id, cp, field, en, de) => {
        const copy = checkpoint(id, cp).copy;
        assert.match(copy.en[field], en, `${id}/${cp}: the English ${field} lost its Wave 6 revision`);
        assert.match(copy.de[field], de, `${id}/${cp}: the German ${field} lost its Wave 6 revision`);
    };
    says('signals-rc-response', 'measure', 'hint', /before the simulation has advanced|meter/i, /Messger(ä|ae)t|fortgeschritten/i);
    says('signals-rl-response', 'measure', 'action', /step the source/i, /Quelle.*(0|null)/i);
    says('signals-rl-response', 'predict', 'hint', /100/, /100/);
    says('signals-complex-impedance', 'measure', 'hint', /81\.92 ms|sweep/i, /81,92 ms|81\.92 ms|Sweep/i);
    says('signals-bode-sweep', 'sweep', 'hint', /corner|ten cycles/i, /Eckfrequenz|Perioden/i);
    says('signals-resonance', 'sweep', 'action', /100 µF|100 uF/, /100 µF|100 uF/);
    says('signals-loading', 'measure', 'hint', /no output limit|ideal/i, /ideal|keine? (Ausgangs)?begrenzung/i);
    says('signals-noise', 'measure', 'action', /no spread|identical|zero/i, /identisch|keine Streuung|null/i);
    says('signals-aliasing-fft', 'measure', 'action', /no FFT|without an FFT/i, /kein(e)? FFT|ohne FFT/i);
    says('signals-model-measurement', 'compare', 'hint', /no numeric readout|canvas/i, /Zahlen|Leinwand|Kurve/i);
});
