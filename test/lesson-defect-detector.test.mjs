/**
 * The Tier-3 detector must be able to fail — proven against the real defects.
 *
 * `docs/VERIFICATION-AUTOMATION.md`: "Mutation-prove every detector.
 * Re-introduce the exact defect it guards, confirm red, restore. A detector
 * that has never failed is not evidence."
 *
 * The mutation here is not synthetic. Both fixtures are the actual version-1
 * lesson objects, read out of git history at the commit before each was
 * repaired, so what is proven is that the detector catches the two defects a
 * human found by reading — the two that motivated building it.
 *
 * The negative half matters as much: the repaired version-2 forms must come
 * back clean. A detector that flags the fix as well as the defect gets ignored,
 * and the guard that separates them (prose that DISCUSSES a phenomenon versus
 * prose that asks the learner to OBSERVE it) is the fragile part, so it is
 * pinned here rather than trusted.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {detect, loadCatalog, OBSERVABLES, DEMANDS} from '../scripts/detect-lesson-defects.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const WAVE = 'overlay/scratch-gui/src/components/gui/lesson-waves/electricity-1.json';

const lessonAt = (rev, id) => {
    const raw = execFileSync('git', ['-C', ROOT, 'show', `${rev}:${WAVE}`],
        {encoding: 'utf8', maxBuffer: 1 << 24});
    const lesson = JSON.parse(raw).lessons.find(l => l.id === id);
    assert.ok(lesson, `${id} not present at ${rev} — the fixture moved, fix this test`);
    return lesson;
};

// ── Instrument check ────────────────────────────────────────────────────────
test('instrument: the fixtures really are the pre-repair forms', () => {
    // 310a31278 repaired the diode lesson, ef8f7717b the capacitor one, so each
    // parent holds the defect. If these are not version 1 pointing at the old
    // bench, the "mutation" below is measuring something else entirely.
    const diode = lessonAt('310a31278^', 'electricity-diode');
    const cap = lessonAt('ef8f7717b^', 'electricity-capacitor');
    assert.equal(diode.version, 1);
    assert.equal(diode.exampleId, '42-diode-rectifier');
    assert.equal(cap.version, 1);
    assert.equal(cap.exampleId, '29-capacitor-charge');
    // and the current ones are the repairs
    const now = Object.fromEntries(loadCatalog().map(l => [l.id, l]));
    assert.equal(now['electricity-diode'].exampleId, 'pc31-bridge-rectifier');
    assert.equal(now['electricity-capacitor'].exampleId, 'pc29-capacitor-discharge');
});

// ── Mutation proof ──────────────────────────────────────────────────────────
test('MUTATION: the version-1 diode lesson is flagged — a static bench cannot show a cycle', async () => {
    const report = await detect({lessons: [lessonAt('310a31278^', 'electricity-diode')]});
    const blocking = report.findings.filter(f => f.severity === 'blocking');
    assert.ok(blocking.length >= 1,
        'the detector did not flag the defect it was built for — it is not a detector');
    assert.ok(blocking.some(f => f.evidence.demand === 'alternating-source'),
        `expected an alternating-source finding, got ${JSON.stringify(blocking.map(f => f.evidence.demand))}`);
    // The evidence must name the measurement, not merely assert a verdict.
    const one = blocking.find(f => f.evidence.demand === 'alternating-source');
    assert.equal(one.evidence.measured.stateCount, 1, '42-diode-rectifier reaches exactly one state');
    assert.equal(one.evidence.measured.alternates, false);
    assert.ok(one.evidence.phrase, 'the finding must quote the prose that triggered it');
});

test('MUTATION: the version-1 capacitor lesson is flagged — a charge-only bench cannot discharge', async () => {
    const report = await detect({lessons: [lessonAt('ef8f7717b^', 'electricity-capacitor')]});
    const blocking = report.findings.filter(f => f.severity === 'blocking');
    assert.ok(blocking.some(f => f.evidence.demand === 'discharge'),
        `expected a discharge finding, got ${JSON.stringify(blocking.map(f => f.evidence.demand))}`);
    const one = blocking.find(f => f.evidence.demand === 'discharge');
    // The distinction that matters: the bench DOES vary with time (the cap
    // charges), so a "is anything moving?" check would have passed it. What
    // fails is specifically that no capacitor voltage ever falls.
    assert.equal(one.evidence.measured.timeVarying, true);
    assert.equal(one.evidence.measured.capDischarges, false);
});

test('NEGATIVE CONTROL: both repaired lessons come back clean', async () => {
    const now = Object.fromEntries(loadCatalog().map(l => [l.id, l]));
    const report = await detect({lessons: [now['electricity-diode'], now['electricity-capacitor']]});
    assert.deepEqual(report.findings, [],
        'the repaired lessons must not be flagged — a detector that cannot tell a fix ' +
        'from a defect will be switched off');
});

test('NEGATIVE CONTROL: the hypothetical guard is what separates them', async () => {
    // electricity-diode v2 says "explain what would happen with an alternating
    // source" — correct teaching on a DC bench. Strip the hypothetical marker
    // and the same sentence becomes an instruction the bench cannot satisfy,
    // and the detector must then fire. This pins the guard: if it ever swallows
    // the imperative form too, this test goes red.
    const now = Object.fromEntries(loadCatalog().map(l => [l.id, l]));
    const lesson = structuredClone(now['electricity-diode']);
    const explain = lesson.checkpoints.find(c => c.id === 'explain');
    explain.copy.en.action = 'Compare the load waveform with an alternating source over a full cycle';
    const report = await detect({lessons: [lesson]});
    assert.ok(report.findings.some(f => f.evidence.demand === 'alternating-source'),
        'the guard is swallowing an imperative, not just a hypothetical');
});

// ── The detector's own contract ─────────────────────────────────────────────
test('every observable the catalog uses has a named producer in the app', () => {
    const used = new Set();
    for (const lesson of loadCatalog()) {
        for (const checkpoint of lesson.checkpoints) {
            if (checkpoint.observe) used.add(checkpoint.observe.event);
        }
    }
    for (const event of used) {
        assert.ok(OBSERVABLES[event],
            `the catalog observes "${event}" but the detector knows no producer for it. ` +
            `Either the app grew one — add it to OBSERVABLES — or no lesson can ever see it.`);
    }
});

test('every demand names a bench property the prober actually measures', async () => {
    const {benchCapabilities} = await import('../scripts/bench-capabilities.mjs');
    const sample = await benchCapabilities('pc29-capacitor-discharge');
    const derived = new Set(['hasSourceControl', 'hasButton', 'hasSwitch', 'hasPot', 'hasProgram']);
    for (const demand of DEMANDS) {
        assert.ok(demand.needs in sample || derived.has(demand.needs),
            `demand ${demand.id} needs "${demand.needs}", which nothing measures — ` +
            `it would be permanently undefined, so the demand could never be satisfied`);
    }
});

// ── The false positives the first sweep produced, pinned ────────────────────
//
// The detector's first run over all 79 lessons produced eleven blocking
// findings, seven of which were wrong. Each wrong one named a distinct way the
// prose heuristic can misfire, and each was fixed by narrowing something. Those
// narrowings are the fragile part of this file — a later widening would quietly
// bring the noise back and the report would stop being read — so each is
// pinned by the case that produced it.
const findingsFor = async (id, checkpoint) => {
    const lesson = loadCatalog().find(l => l.id === id);
    assert.ok(lesson, `${id} is gone; this regression case needs rewriting`);
    const report = await detect({lessons: [lesson]});
    return report.findings.filter(f => f.checkpoint === checkpoint);
};

test('not a defect: the lesson panel\'s own "manual button" is not a bench affordance', async () => {
    // starter-lego-extension: "if no hub is available, use the manual button"
    assert.deepEqual(await findingsFor('starter-lego-extension', 'connect'), []);
});

test('not a defect: "while it runs" is about the motor, not about a program', async () => {
    // electricity-motor-flyback v2: "verify that the diode is reverse-biased
    // while it runs" on a circuit-only lesson.
    assert.deepEqual(await findingsFor('electricity-motor-flyback', 'trace'), []);
});

test('not a defect: a real-hardware safety rule is not an observation of this bench', async () => {
    // measurement-resistance: "Do this only with power removed and stored
    // energy discharged" — 22-series-parallel has no capacitor at all.
    assert.deepEqual(await findingsFor('measurement-resistance', 'explain'), []);
});

test('not a defect: a controller faceplate\'s buttons count as buttons', async () => {
    // retro-console and mb05-faceplate-matrix are program-only with no circuit,
    // but ship a controller.json carrying dpad and button widgets.
    assert.deepEqual(await findingsFor('interactive-input-controls', 'predict'), []);
    assert.deepEqual(await findingsFor('interactive-two-way-binding', 'predict'), []);
});

test('MUTATION: a decimal point must not end a sentence', async () => {
    // The third real defect this detector found: signals-rc-response v1 asked
    // the learner to "Calculate voltage at 0, 0.5T, 1T, 2T, and 3T for charging
    // and discharging" on 43-rc-timing, which has no discharge path at all.
    //
    // It is pinned here because it went MISSING once. Splitting sentences on a
    // bare "." cut the fragment at the decimal point in "0.5T", the observation
    // verb "Calculate" fell outside it, and the finding quietly vanished
    // between two runs of the sweep. Only adjudicating a disappearance caught
    // it. The fixture is the pre-repair text, reconstructed on the repaired
    // lesson so it survives the lesson moving between wave files.
    const lesson = structuredClone(loadCatalog().find(l => l.id === 'signals-rc-response'));
    const predict = lesson.checkpoints.find(c => c.id === 'predict');
    predict.copy.en.action = 'Calculate voltage at 0, 0.5\u03c4, 1\u03c4, 2\u03c4, and 3\u03c4 for charging and discharging.';
    predict.copy.en.hint = 'State initial value, final value, R and C before substituting.';
    const report = await detect({lessons: [lesson]});
    assert.ok(report.findings.some(f => f.evidence.demand === 'discharge'),
        'the 43-rc-timing discharge defect must be reported for the v1 text');
    // and the repaired text must not be
    const clean = await detect({lessons: [loadCatalog().find(l => l.id === 'signals-rc-response')]});
    assert.deepEqual(clean.findings, [], 'the repaired v2 text must come back clean');
});

// ── The corpus ratchet ──────────────────────────────────────────────────────
//
// Running the detector over all 79 lessons is the point of building it, so the
// result is a gate rather than a report someone remembers to run. The list below
// is the residue after the 2026-08-23 sweep: every entry is a defect that could
// not be repaired from the lesson side, and every one is written up in
// `docs/LESSON-ACHIEVABILITY-SWEEP.md`.
//
// **Ratchets only shrink.** Fixing one removes it here in the same commit; the
// second assertion below fails if an entry stops reproducing, so a fix cannot
// leave the documentation behind.
const KNOWN_UNACHIEVABLE = new Set([
    // `bw-circuit-changed` fires only when the derived pin declarations move, so
    // no MCU-less bench can ever raise it. Needs a CircuitDesigner change in
    // bw-circuit-ui; the lessons' intent is right, so the observables stay.
    'starter-circuit-path/change',
    'signals-resonance/sweep',
    'machines-contention/repair'
]);

test('corpus ratchet: no lesson checkpoint is unachievable except the known three', async () => {
    const report = await detect();
    const blocking = report.findings.filter(f => f.severity === 'blocking')
        .map(f => `${f.lesson}/${f.checkpoint}`);
    const unexpected = blocking.filter(k => !KNOWN_UNACHIEVABLE.has(k));
    assert.deepEqual(unexpected, [],
        `new unachievable checkpoints. Run \`node scripts/detect-lesson-defects.mjs\` ` +
        `for the evidence, fix the lesson or the bench, and only add to ` +
        `KNOWN_UNACHIEVABLE if the fix genuinely belongs elsewhere.`);

    const healed = [...KNOWN_UNACHIEVABLE].filter(k => !blocking.includes(k));
    assert.deepEqual(healed, [],
        `these are on the ratchet but no longer reproduce — delete them from ` +
        `KNOWN_UNACHIEVABLE and update docs/LESSON-ACHIEVABILITY-SWEEP.md in the ` +
        `same commit, so the ratchet keeps shrinking`);

    // Coverage, stated rather than implied: a run that scanned nothing would
    // satisfy both assertions above.
    assert.equal(report.lessons, 79, 'the sweep must cover the whole catalog');
    assert.ok(report.checkpoints >= 180, `only ${report.checkpoints} checkpoints scanned`);
});
