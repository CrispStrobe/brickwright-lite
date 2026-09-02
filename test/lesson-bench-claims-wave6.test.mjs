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
import {balancedFrom} from './helpers/js-scope.mjs';

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

// The OPEN DEFECT sentinel that stood here — "the t = 0 sample reads the supply,
// not zero" — fired on 2026-08-29 at the bw-board `4ae89b5` vendor bump and was
// retired per its own instruction. bw-board `f87adcc` makes the FIRST solve
// honour the stored capacitor state instead of treating every capacitor as an
// open circuit, so the reading at t = 0 is the one the lesson predicts.
test('the t = 0 reading is zero, and the engine agrees with itself about it', async () => {
    const fresh = await load('43-rc-timing');
    assert.equal(fmt(terminalVolts(fresh.board)['c1.a']), '0.0000',
        'the first solve is a DC operating point again — re-open D23 and re-measure Wave 6');
    assert.equal(fresh.board.getCapVoltage('c1'), 0,
        'the meter and getCapVoltage must report the same capacitor');
    // Still true after a step, which is what makes it a state and not a coincidence.
    fresh.board.advanceTo(1n);
    assert.equal(fmt(terminalVolts(fresh.board)['c1.a']), '0.0000');
});

test('the scope record is chosen, and a full RC step now fits in one', async () => {
    // Was an OPEN DEFECT, and it fired on its own terms: "ScopePanel now chooses
    // a sample rate or depth — the fixed 81.92 ms record is gone."
    //
    // The engine ALWAYS took `sampleRateHz` and `depth`; `ScopePanel` passed
    // neither, so every capture in the app was the default 100 kHz x 8192 =
    // 81.92 ms against a 1 s time constant. D4 records the owner as
    // "bw-board + bw-circuit-ui" and that was wrong: every read inside the
    // engine uses ch.intervalNs and ch.depth rather than a constant, so the
    // repair is one repo (bw-circuit-ui `29f6da6`).
    const {board} = await load('43-rc-timing');
    const netId = board.nets.find(n =>
        n.terminals.some(t => t.part === 'c1' && t.terminal === 'a')).id;

    // The default is unchanged, so a bench that was fine before still is.
    const fast = board.addScopeChannel({type: 'voltage', netId});
    board.advanceTo(200n * MS);
    const dFast = board.getScopeData(fast);
    assert.equal(Number(dFast.sampleIntervalNs), 10_000, 'the default cadence moved');
    assert.equal(dFast.samples.length / 2, 8192, 'the default depth moved');
    assert.equal((dFast.samples.length / 2) * Number(dFast.sampleIntervalNs) / 1e6, 81.92);

    // And a slower record holds the whole step the lesson measures. This is the
    // measurement that proves the engine was never the constraint.
    const {SCOPE_DEPTH, recordSeconds} = await import(path.join(CUI, 'model/scope-timebase.js'));
    const slow = board.addScopeChannel({type: 'voltage', netId, sampleRateHz: 1000, depth: SCOPE_DEPTH});
    let t = 200n * MS;
    for (let k = 0; k < 60; k++) board.advanceTo(t += 100n * MS);
    const dSlow = board.getScopeData(slow);
    assert.equal(Number(dSlow.sampleIntervalNs), 1_000_000, 'a 1 kHz channel samples every millisecond');
    const slowRecordS = (dSlow.samples.length / 2) * Number(dSlow.sampleIntervalNs) / 1e9;
    assert.equal(slowRecordS, 8.192);
    assert.ok(slowRecordS > 5, 'five time constants of a 1 s tau fit in one record');
    const seen = [...dSlow.samples].filter(Number.isFinite);
    assert.ok(Math.max(...seen) > 4.5,
        `the slow record reaches the charged tail (${Math.max(...seen).toFixed(3)} V)`);
    assert.equal(recordSeconds(1000, SCOPE_DEPTH), slowRecordS,
        'the panel\'s own arithmetic agrees with the engine it drives');

    // The panel passes them. A rate the panel never sends is a control that
    // moves a label and nothing else.
    const panel = readFileSync(path.join(CUI, 'components/ScopePanel.jsx'), 'utf8');
    assert.match(panel, /data-testid="bw-scope-record"/, 'the record control is rendered');
    // Each call's argument object, brace-matched from its own opening `{`, so a nested object
    // literal cannot end the region early.
    const calls = [...panel.matchAll(/board\.addScopeChannel\(/g)]
        .map(m => balancedFrom(panel, m.index, '{', '}', 'addScopeChannel argument'));
    // Two time-domain sites (re-attach after a netlist edit, and add-channel) plus
    // the spectrum tap the FFT view opens (D24, bw-circuit-ui `7696656`). The
    // invariant that matters is not the count but that NO site takes the default:
    // a rate the panel never sends is a control that moves a label and nothing else.
    assert.equal(calls.length, 3, `expected three addScopeChannel call sites, found ${calls.length}`);
    for (const c of calls) assert.match(c, /sampleRateHz/, `a channel is created without a rate: ${c}`);
    const spectrumTaps = calls.filter(c => /capture:\s*'sample'/.test(c));
    assert.equal(spectrumTaps.length, 1,
        'exactly one site is the spectrum tap, and it is the only one that asks for a sample series');
});

// ── signals-rl-response / pc52-inductor-filter ─────────────────────────────

test('the RL lesson is on an RL bench, and the law holds across the whole response', async () => {
    // Was an OPEN DEFECT. signals-rl-response was taught on pc52-inductor-filter,
    // an R-L-C, where the RL law holds only while the capacitor is still a short
    // — 0.9870 of ideal at 300 us, 0.9229 at 1 ms, and by 2 ms the current has
    // TURNED AROUND. pc89-rl-step (sb3-creator `4512354`) is src -> 100 ohm ->
    // 10 mH -> gnd and nothing else.
    assert.equal(lesson('signals-rl-response').exampleId, 'pc89-rl-step');
    const {board, data} = await load('pc89-rl-step');
    const L = data.parts.find(p => p.id === 'l').params.henrys;
    const R = data.parts.find(p => p.id === 'r').params.ohms;
    assert.deepEqual([L, R], [0.01, 100], 'pc89 changed — re-measure Wave 6');
    assert.ok(!data.parts.some(p => p.kind === 'capacitor'),
        'a capacitor appeared on the RL bench — that is the defect this example exists to avoid');

    // Nothing in the app steps this source for the learner; the lesson has to.
    board.setPartParam('src', 'volts', 0);
    board.advanceTo(200n * MS);
    board.setPartParam('src', 'volts', 5);
    const ideal = us => 0.05 * (1 - Math.exp(-us / 100));
    const I = {};
    for (const us of [25, 50, 100, 200, 300, 500, 1000, 2000]) {
        board.advanceTo((200n * MS) + (BigInt(us) * US));
        I[us] = (5 - terminalVolts(board)['r.b']) / 100;   // the hint's own method
    }
    // The whole response, not a window: within a hundredth of a percent out to
    // 5 tau and past it. On pc52 the same comparison fell to 0.84.
    for (const us of [25, 50, 100, 200, 300, 500, 1000, 2000]) {
        const ratio = I[us] / ideal(us);
        assert.ok(ratio > 0.9999 && ratio < 1.0002,
            `at ${us} us the measured current is ${(ratio * 100).toFixed(4)} % of the ideal RL curve`);
    }
    near(I[100], 0.0316086, 5e-6, 'I at t = 1 tau — 63.2 % of the 50 mA asymptote');
    // And it SETTLES at the RL asymptote rather than walking off to a divider.
    board.advanceTo((200n * MS) + (20n * MS));
    near((5 - terminalVolts(board)['r.b']) / 100, 0.05, 1e-6, 'settles at V/R = 50 mA');
});

test('OPEN DEFECT: pc52 still cannot be both an RL bench and a resonant one', async () => {
    // The reason pc89 is a NEW bench rather than a changed pc52, pinned so the
    // next person does not do what I nearly did.
    //
    // signals-resonance still names pc52 and still needs it to resonate, which
    // it does at C = 0.1 uF — the Wave 6 review measured +3.871 dB at 5032.9 Hz
    // and this test re-derives it. But at 0.1 uF the RL window is destroyed:
    // ratio 0.676 at 50 us, 0.193 at 100 us, because the current rings at 5 kHz
    // instead of rising. The two open defects on one bench want opposite parts.
    //
    // The sharp bit: changing C to close the resonance defect would have left
    // the OLD RL sentinel green — it asserted the RL law fails after 300 us,
    // which would still have been true, more so. The regression would have been
    // silent. That is why this is pinned as a conflict rather than left implied.
    assert.equal(lesson('signals-resonance').exampleId, 'pc52-inductor-filter');
    const {data} = await load('pc52-inductor-filter');
    assert.equal(data.parts.find(p => p.id === 'c').params.farads, 0.0001,
        'pc52 capacitor changed — if it is now 0.1 uF, signals-resonance may be fixed and ' +
        'signals-rl-response must NOT be moved back here; re-measure both');

    const resonant = structuredClone(data);
    resonant.parts.find(p => p.id === 'c').params.farads = 1e-7;
    const {Circuit} = await boot();
    const rb = Circuit.fromJSON(structuredClone(resonant)).board;
    const inNet = netOfTerminal(rb, 'src', 'pos');
    const outNet = netOfTerminal(rb, 'load', 'a');
    const f0 = 1 / (2 * Math.PI * Math.sqrt(0.01 * 1e-7));
    near(f0, 5032.9, 0.5, 'the resonant frequency signals-resonance would get');
    near(bodePoint(rb, 'src', inNet, outNet, f0).magDb, 3.871, 0.05,
        'and the peak it would see — a real peak, above 0 dB');

    // The same change, measured against the RL law the other lesson needs.
    const lb = Circuit.fromJSON(structuredClone(resonant)).board;
    lb.setPartParam('src', 'volts', 0);
    lb.advanceTo(200n * MS);
    lb.setPartParam('src', 'volts', 5);
    lb.advanceTo((200n * MS) + (100n * US));
    const iAt1Tau = (5 - terminalVolts(lb)['r.b']) / 100;
    assert.ok(iAt1Tau / (0.05 * (1 - Math.exp(-1))) < 0.25,
        `at one time constant the resonant bench reaches only ${(iAt1Tau * 1000).toFixed(3)} mA ` +
        'of the 31.6 mA the RL law predicts — the capacitor that makes it resonate makes it useless as an RL');
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
    // The optional `runAcSweep` scope comparison measures each point over
    // settleCycles + measureCycles cycles, so a point costs 10/f seconds of
    // SIMULATED time — 629 s a decade below that corner, which is why the
    // checkpoint had to be reworded to stay two decades ABOVE the corners, i.e.
    // away from the only part of a Bode plot worth looking at.
    //
    // 100 µF → 100 nF (sb3-creator 776a96e) moves both corners to 159.155 Hz.
    // The transfer function depends on R·C, so only the frequency axis moved:
    // every magnitude, phase and slope below is what the old bench produced at
    // one thousandth of the frequency. Both lessons were restored to version 3;
    // signals-bode-sweep is at 4 since its hint stopped citing the old bench.
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
    near(above.magDb, -40.295, 0.05, 'magnitude a decade above the corner');
    near(above.phaseDeg, -163.09, 0.1, 'phase a decade above the corner');

    // And the finding the checkpoint's `explain` step exists for: the
    // analytical response exposes the two-pole asymptote directly.
    const twoAbove = bodePoint(board, 'src', inNet, outNet, fc * 100);
    const slope = twoAbove.magDb - above.magDb;
    near(slope, -39.71, 0.1, 'slope one to two decades above the corner');
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
    // signals-bode-sweep went to 4 when the hint stopped citing the OLD bench's
    // 100 uF; its pair went to 4 when D3 gave the sweep a readout and its
    // transcribe-by-hand instruction became false.
    const EXPECTED_VERSION = {'signals-bode-sweep': 4, 'signals-model-measurement': 4};
    for (const [id, want] of Object.entries(EXPECTED_VERSION)) {
        assert.equal(lesson(id).version, want, `${id} must be at content version ${want}`);
    }
    const sweepHint = lesson('signals-bode-sweep').checkpoints
        .find(c => c.id === 'sweep').copy.en.hint;
    assert.ok(!/Stay two decades above|over ten minutes|R × C = 1 s/.test(sweepHint),
        'the workaround wording is still in signals-bode-sweep');
    assert.match(sweepHint, /159\.155 Hz/, 'the hint names the corner it can now reach');
    // The repair left a changelog note behind: the cost was contrasted against
    // "the ten minutes it cost while the stages were 100 uF". A lesson should
    // describe the bench a reader loads, not the one it replaced.
    // Checked in BOTH languages: check C reads only the English prose, so a stale
    // German copy would otherwise be the one place this can rot unseen.
    const sweepHintDe = lesson('signals-bode-sweep').checkpoints
        .find(c => c.id === 'sweep').copy.de.hint;
    for (const [lang, text] of [['en', sweepHint], ['de', sweepHintDe]]) {
        assert.ok(!/100 \u00b5F|100 uF/.test(text),
            `the ${lang} hint quotes the superseded bench's capacitance again`);
    }
    assert.match(sweepHintDe, /159,155 Hz/, 'the German hint names the corner too');
    const compare = lesson('signals-model-measurement').checkpoints
        .find(c => c.id === 'compare').copy.en;
    assert.ok(!/two decades above the corner/.test(compare.action),
        'the workaround wording is still in signals-model-measurement');
    // This assertion used to read the other way: while D3 was open, the
    // transcribe-by-hand disclosure had to STAY, and dropping it with the rest
    // of the hint would have been the opposite error. D3 closed on 2026-08-25
    // (bw-circuit-ui `2c66851`), so the guard inverts rather than disappears —
    // the disclosure is now the false sentence, and the test below proves the
    // readout it described is really there.
    assert.ok(!/no numeric readout and no export|record it by hand/.test(compare.hint),
        'the sweep reports numbers now (D3 closed) — this hint still tells the learner it does not');
});

test('the sweep reports numbers, and they are the ones it measured', async () => {
    // Was an OPEN DEFECT (D3), and it fired as written: "if it now reports
    // frequencies or rows, soften signals-model-measurement and
    // signals-bode-sweep and delete this test."
    //
    // `runBode` always returned every {f, magDb, phaseDeg} it measured;
    // `drawBode` discarded all of them and wrote four strings on a 260x140
    // canvas — the two dB extremes rounded to WHOLE decibels, and +/-180 deg.
    // No frequency axis, no per-point value, no export. Fixed in bw-circuit-ui
    // `2c66851`: src/model/sweep-readout.js plus the panel wiring.
    const panel = readFileSync(path.join(CUI, 'components/SweepPanel.jsx'), 'utf8');
    assert.match(panel, /data-testid="bw-sweep-readout"/, 'the numeric table is rendered');
    assert.match(panel, /data-testid="bw-sweep-csv"/, 'the export is reachable');
    assert.match(panel, /setRows\(result\.rows\)/,
        'the measured rows are kept rather than discarded after drawing');
    assert.ok(!/dbHi\.toFixed\(0\)|dbLo\.toFixed\(0\)/.test(panel),
        'whole-decibel labels are back — they render -3.010 dB and -3.5 dB as the same string, ' +
        'which are two different answers to "where is the corner"');

    // And the numbers it shows are the ones the engine measured, on the bench
    // the lesson names — the half a source-text assertion cannot reach.
    const {bodeAxisLabels, formatHz, sweepRowsToCsv, thinRows} =
        await import(path.join(CUI, 'model/sweep-readout.js'));
    const {board} = await load('pc50-two-stage-rc');
    const inNet = netOfTerminal(board, 'src', 'pos');
    const outNet = netOfTerminal(board, 'c2', 'a');
    const swept = runBode(getEngine(), board,
        {sourceId: 'src', inNet, outNet, fFrom: 15.9155, fTo: 1591.55, pointsPerDecade: 4});
    assert.ok(swept.ok, `the sweep refused: ${swept.reason}`);
    assert.ok(swept.rows.length >= 8, `${swept.rows.length} points measured`);

    const ax = bodeAxisLabels(swept.rows);
    assert.equal(ax.fLo, '15.9 Hz', 'the frequency axis this plot never had, at the low end');
    assert.equal(ax.fHi, '1.59 kHz', 'and at the high end');
    assert.equal(formatHz(159.155), '159 Hz', 'the corner, in the unit a reader says it in');

    // The CSV is the export signals-model-measurement's python variant asks for,
    // and it carries FULL precision: a residual analysis that starts from the
    // display rounding is measuring the formatter.
    const csv = sweepRowsToCsv(swept.rows, 'bode');
    const lines = csv.trim().split('\n');
    assert.equal(lines[0], 'f_hz,mag_db,phase_deg,linearization_region');
    assert.equal(lines.length, swept.rows.length + 1, 'every measured point is exported');
    const first = lines[1].split(',').map(Number);
    assert.equal(first[0], swept.rows[0].f, 'the CSV frequency IS the measured one, unrounded');
    assert.equal(first[1], swept.rows[0].magDb, 'and so is the magnitude');
    assert.ok(String(swept.rows[0].magDb).length > 6,
        'the fixture would not distinguish rounded from unrounded if the value were short');

    // The table is thinned for the screen but never drops the two points the
    // axis names, which is what lets a reader check one against the other.
    const shown = thinRows(swept.rows, 12);
    assert.ok(shown.length <= 12);
    assert.equal(shown[0].f, swept.rows[0].f);
    assert.equal(shown[shown.length - 1].f, swept.rows[swept.rows.length - 1].f);
});

test('the two lessons worded around the missing readout were restored with it', () => {
    // D3 is recorded as costing 4 lessons, but only TWO carry text written
    // around it — stated rather than rounded up to four restorations.
    for (const id of ['signals-cutoff-phase', 'signals-model-measurement']) {
        const cp = lesson(id).checkpoints.find(c => c.id === 'measure' || c.id === 'compare');
        for (const lang of ['en', 'de']) {
            const text = `${cp.copy[lang].action || ''} ${cp.copy[lang].hint || ''}`;
            assert.ok(!/no frequency axis|no per-point readout|no numeric readout|no export|record it by hand/i.test(text),
                `${id} (${lang}) still describes a sweep that reports nothing`);
            assert.ok(!/keine Frequenzachse|keine Punktanzeige|weder Zahlenanzeige noch Export|von Hand/i.test(text),
                `${id} (${lang}) still describes a sweep that reports nothing`);
        }
    }
    assert.equal(lesson('signals-cutoff-phase').version, 3);
    assert.equal(lesson('signals-model-measurement').version, 4);
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
    near(one.magDb, -32.641, 0.05, 'magnitude at 2*pi times the corner');
    near(ten.magDb, -71.935, 0.05, 'magnitude a decade above that');
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

// The OPEN DEFECT sentinel that stood here — "the follower has no output limit
// and the probe has no input impedance" — fired on 2026-08-29 at the vendor
// bump. It was written as ONE test over two defects on the assumption they
// would heal separately; both halves healed in the same wave (bw-board `18555e7`
// for the output limit, bw-circuit-ui `3f1d194` for the meter), so it retires
// whole rather than splitting. What replaces it is the measurement the lesson
// asks the learner to make.
test('signals-loading: both regimes the lesson names are now measurable', async () => {
    // 1. The follower's output limit. `iShort` defaults to 40 mA (bw-board
    //    spec-updates/opamp-output-limit.md), so the buffered output holds 2.5 V
    //    while the load asks for less than that and current-limits below it.
    const at = async ohms => {
        const {board} = await load('pc54-opamp-follower');
        board.setPartParam('load', 'ohms', ohms);
        board.setControl('pot', 0.5);
        board.advanceTo(50n * MS);
        return terminalVolts(board)['amp.out'];
    };
    near(await at(100), 2.5, 5e-4, 'a 100 ohm load draws 25 mA and is still inside the limit');
    near(await at(62.5), 2.5, 5e-4, 'and 62.5 ohm asks for exactly the 40 mA limit');
    // Below that the output is the limit current times the load, to four decimals.
    for (const [ohms, volts] of [[25, 1.0], [10, 0.4], [1, 0.04]]) {
        near(await at(ohms), volts, 5e-4, `the limited output into ${ohms} ohm`);
    }
    // 2. Probe input impedance. A placed meter is a real 10 Mohm across its
    //    probes now, and the hand-computed oracle is a 1 M / 1 M divider read by
    //    one: 1M || 10M = 10/11 Mohm, so V = 5 * (10/11) / (1 + 10/11) = 50/21.
    const {METER_INPUT_OHMS} = await import(path.join(CUI, 'model/meter-load.js'));
    assert.equal(METER_INPUT_OHMS, 10e6, 'the datasheet figure the lesson quotes');
    const {Circuit} = await boot();
    const divider = withMeter => Circuit.fromJSON({
        parts: [
            {id: 'vcc', kind: 'vsource', params: {volts: 5}},
            {id: 'gnd', kind: 'gnd'},
            {id: 'rtop', kind: 'resistor', params: {ohms: 1e6}},
            {id: 'rbot', kind: 'resistor', params: {ohms: 1e6}},
            ...(withMeter ? [{id: 'm1', kind: 'meter', params: {mode: 'voltage'}}] : []),
        ],
        wires: [
            {from: 'vcc', fromTerminal: 'pos', to: 'rtop', toTerminal: 'a'},
            {from: 'rtop', fromTerminal: 'b', to: 'rbot', toTerminal: 'a'},
            {from: 'rbot', fromTerminal: 'b', to: 'gnd', toTerminal: 'gnd'},
            {from: 'vcc', fromTerminal: 'neg', to: 'gnd', toTerminal: 'gnd'},
            ...(withMeter ? [
                {from: 'm1', fromTerminal: 'probe_a', to: 'rbot', toTerminal: 'a'},
                {from: 'm1', fromTerminal: 'probe_b', to: 'gnd', toTerminal: 'gnd'},
            ] : []),
        ],
    });
    const mid = circuit => {
        assert.ok(!circuit.netlistError, `netlist rejected: ${circuit.netlistError}`);
        circuit.board.advanceTo(50n * MS);
        const net = circuit.board.nets.find(n =>
            n.terminals.some(t => t.part === 'rbot' && t.terminal === 'a'));
        return circuit.board.nodeVoltage(net.id);
    };
    const bare = divider(false);
    const probed = divider(true);
    assert.deepEqual(bare.loadingMeters, [], 'no meter, nothing loading');
    assert.deepEqual(probed.loadingMeters, ['m1'], 'the placed meter is IN the netlist');
    near(mid(bare), 2.5, 5e-5, 'the unprobed divider');
    near(mid(probed), 50 / 21, 5e-5, 'the same divider with a 10 Mohm probe on it');
    // And the whole board survives being probed — the defect underneath D21 was
    // that wiring the instrument emptied the netlist it was pointed at.
    assert.ok(probed.board.nets.length >= bare.board.nets.length,
        'wiring the probe must not empty the board');
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

// The OPEN DEFECT sentinel that stood here — "there is no FFT, and the samples
// an FFT would need are an envelope" — fired on 2026-08-29 at the vendor bump
// and was retired per its own instruction. BOTH of its halves healed:
// bw-circuit-ui `7696656` added the spectrum view (model/fft.js + the panel's
// second tap) and bw-board `9441e4f`+`2169d9b` added `capture: 'sample'`, the
// true sample series a transform consumes. The envelope is still the DEFAULT,
// deliberately — it is what keeps a narrow pulse visible at a coarse timebase —
// so the fix is a second tap, not a change of storage, and the test says so.
test('signals-aliasing-fft: the spectrum view exists, over a sample series and not an envelope', async () => {
    assert.equal(lesson('signals-aliasing-fft').exampleId, '49-function-generator-sine');
    const panel = readFileSync(path.join(CUI, 'components/ScopePanel.jsx'), 'utf8');
    assert.match(panel, /data-testid="bw-scope-view"/, 'the view selector is rendered');
    assert.match(panel, /\['time', 'spectrum'\]/, 'and spectrum is one of the two views it offers');
    assert.match(panel, /data-testid="bw-scope-fft-window"/, 'the window is named on screen');
    assert.match(panel, /from '\.\.\/model\/fft\.js'/, 'and it is the real transform');

    const {board} = await load('49-function-generator-sine');
    const netId = board.nets.find(n =>
        n.terminals.some(t => t.part === 'fg1' && t.terminal === 'pos')).id;
    const {seriesFromScopeData, spectrum, peakBin, thd} =
        await import(path.join(CUI, 'model/fft.js'));
    const {SCOPE_DEPTH} = await import(path.join(CUI, 'model/scope-timebase.js'));

    // The default is still the envelope, and an envelope is REFUSED BY NAME
    // rather than transformed into a waveform that never existed.
    const envelope = board.addScopeChannel({type: 'voltage', netId});
    const spectrumTap = board.addScopeChannel({
        type: 'voltage', netId, sampleRateHz: 10_000, depth: SCOPE_DEPTH, capture: 'sample'});
    let t = 0n;
    for (let k = 0; k < 20; k++) board.advanceTo(t += 50n * MS);

    const env = board.getScopeData(envelope);
    assert.equal(env.capture ?? 'envelope', 'envelope', 'the default capture did not change');
    assert.equal(env.samples.length, 8192 * 2, 'interleaved (min, max) pairs');
    const refused = seriesFromScopeData(env);
    assert.equal(refused.ok, false);
    assert.match(refused.reason, /envelope/, 'and it says why, rather than returning numbers');

    // The second tap is a true series, and the transform over it finds the tone.
    const d = board.getScopeData(spectrumTap);
    assert.equal(d.capture, 'sample');
    const series = seriesFromScopeData(d);
    assert.equal(series.ok, true, series.reason);
    assert.equal(series.sampleRateHz, 10_000);
    assert.equal(series.values.length, 8192);
    const spec = spectrum(series.values, series.sampleRateHz, {window: 'hann'});
    assert.equal(spec.ok, true, spec.reason);
    // The two numbers the predict step asks for, at the spectrum tap's own rate.
    assert.equal(spec.sampleRateHz / 2, 5000, 'Nyquist');
    assert.equal(spec.binHz, 10000 / 8192, 'bin spacing, Hz');
    assert.equal(spec.binHz, 1.220703125);
    assert.equal(spec.windowName, 'Hann');
    // fg1 is a 1 kHz sine of amplitude 2.5 V on a 2.5 V offset.
    const peak = peakBin(spec);
    assert.equal(peak.index, 819, '1 kHz over 1.2207 Hz bins is bin 819.2, so the peak lands on 819');
    near(peak.f, 999.7559, 1e-3, 'the bin centre');
    near(peak.fInterp, 999.9466, 1e-3, 'and the parabolic interpolation, which is nearly the truth');
    near(peak.amplitude, 2.4999, 1e-3, 'peak volts, free of scalloping loss');
    // A pure sine has no harmonics, and the THD says so instead of saying null.
    const distortion = thd(spec);
    assert.ok(distortion, 'four harmonics fit under 5 kHz, so THD is a number');
    assert.equal(distortion.harmonics, 4);
    assert.ok(distortion.thdPercent < 0.01, `a sine's THD is ~0, measured ${distortion.thdPercent}`);
});

test('the predict step has its inputs on screen, for the trace and for the transform', () => {
    // What healed first (D4): the panel states its record length, so the learner
    // can derive Nyquist and bin spacing, which is exactly what
    // `signals-aliasing-fft`'s predict step asks for. What healed on 2026-08-29
    // (D24): the spectrum view states its own rate and window, which are the
    // same two inputs for the transform half.
    const panel = readFileSync(path.join(CUI, 'components/ScopePanel.jsx'), 'utf8');
    assert.match(panel, /data-testid="bw-scope-span"/,
        'the panel no longer states its record length — the predict step lost its inputs again');
    assert.match(panel, /recordSeconds\(sampleRateHz\)/,
        'the stated span is computed from the rate in force, not a constant');
    assert.match(panel, /data-testid="bw-scope-fft-rate"/,
        'the spectrum tap states the rate it captured at');
});

// ── The lesson copy this review wrote, in both languages ───────────────────

test('the Wave 6 revisions are present, EN and DE, at the content version this review recorded', () => {
    assert.deepEqual(Object.fromEntries(WAVE.lessons.map(l => [l.id, l.version])), {
        'signals-rc-response': 6,
        'signals-rl-response': 3,
        'signals-complex-impedance': 3,
        'signals-cutoff-phase': 3,
        'signals-bode-sweep': 4,
        'signals-resonance': 2,
        'signals-loading': 3,
        'signals-noise': 2,
        'signals-aliasing-fft': 4,
        'signals-model-measurement': 4
    }, 'a Wave 6 lesson changed content version — update docs/LESSON-REVIEW-WAVE-6.md with it');

    const says = (id, cp, field, en, de) => {
        const copy = checkpoint(id, cp).copy;
        assert.match(copy.en[field], en, `${id}/${cp}: the English ${field} lost its Wave 6 revision`);
        assert.match(copy.de[field], de, `${id}/${cp}: the German ${field} lost its Wave 6 revision`);
    };
    // v6 (D23 closed): the t = 0 reading is honest now, so the hint stopped
    // telling the learner not to take it.
    says('signals-rc-response', 'measure', 'hint', /reading at t = 0 is now trustworthy/i, /Wert bei t = 0 ist jetzt verl(ä|ae)sslich/i);
    // v4: the bench grew a discharge switch (D11), so the predict hint stopped
    // saying it has no discharge path and started teaching the general form.
    says('signals-rc-response', 'predict', 'hint', /discharge switch/i, /Entladeschalter/i);
    says('signals-rl-response', 'measure', 'action', /step the source/i, /Quelle.*(0|null)/i);
    says('signals-rl-response', 'predict', 'hint', /100/, /100/);
    // v3 (D4 closed): the record is selectable, so the below-cutoff point is a
    // scope measurement rather than one the sweep instrument has to supply.
    says('signals-complex-impedance', 'measure', 'hint', /record is selectable/i, /Aufzeichnungsl(ä|ae)nge ist jetzt w(ä|ae)hlbar/i);
    says('signals-bode-sweep', 'sweep', 'hint', /corner|ten cycles/i, /Eckfrequenz|Perioden/i);
    says('signals-resonance', 'sweep', 'action', /100 µF|100 uF/, /100 µF|100 uF/);
    // v3 (D20 + D21 closed): both regimes are measurable, so the hint quotes
    // the numbers instead of explaining why they cannot be taken.
    // The EN copy states the follower's limit in words and the RULE rather than
    // the three products: `scripts/lesson-numeric-contract.mjs` checks every
    // numeral-with-a-unit against what the SHIPPED bench produces, and these
    // three come from an edit the learner is told to make (lowering the load),
    // which that gate has no model of. The numbers themselves are pinned by the
    // measurement test above instead, which is the better place for them.
    says('signals-loading', 'measure', 'hint', /forty milliamps/, /62,5 \u03a9|40-mA/);
    says('signals-loading', 'predict', 'hint', /input impedance of 10 M\u03a9/, /10 M\u03a9/);
    says('signals-noise', 'measure', 'action', /no spread|identical|zero/i, /identisch|keine Streuung|null/i);
    // v4 (D24 closed): there IS a spectrum view, and it is a second tap.
    says('signals-aliasing-fft', 'measure', 'action', /spectrum view/i, /Spektrumsansicht/i);
    says('signals-aliasing-fft', 'measure', 'hint', /SECOND tap|1\.2207 Hz/, /ZWEITER Abgriff|1,2207 Hz/);
    // v4 (D3 closed): the hint stopped describing a plot with no numbers on it
    // and started telling the learner which of the two readouts to fit against.
    says('signals-model-measurement', 'compare', 'hint', /CSV/, /CSV/);
    // v3 (D3 closed): the crossing is bracketed from the table now, not by
    // re-running a narrower sweep because nothing could be read off the curve.
    says('signals-cutoff-phase', 'measure', 'hint', /frequency axis and a table/i, /Frequenzachse und darunter eine Tabelle/i);
});
