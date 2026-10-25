import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createManifest, createCases, TEMPLATE_COUNTS, canonicalJson, contentHash, sampleClock} from '../scripts/lib/instrument-regression-cases.mjs';
import {close, passiveReference, lmReference, createAdpReference, compareSeries,
    readMeter, parseScopeCsv, reconcileResults, oracleDeck, oracleVectors, parseOracleTable,
    compareDc, parseCapture, compareCapture} from '../scripts/lib/instrument-regression-compare.mjs';
import {admitReleaseRun, admitReleaseSummary, summaryFromOriginalLog, buildCliArgs,
    retainedMutationChecks, REQUIRED_MUTATIONS, admitReleaseJob, releaseObservation,
    verifyCaptureIdentity, RELEASE_OBSERVATION, ADMITTED_RELEASE_SUMMARY} from '../scripts/circuit-instrument-regression.mjs';

const manifest = createManifest();
const cases = manifest.cases;
const select = (template, predicate = () => true) => cases.find(c => c.template === template && predicate(c.parameters));

test('fixed inventory is 312/12, separating 264 ngspice and 48 nominal cases; 72 static/240 waveforms', () => {
    assert.deepEqual(manifest.counts, {cases: 312, templates: 12, ngspice: 264,
        nominalAnalytic: 48, staticCases: 72, waveformCases: 240});
    assert.equal(new Set(cases.map(c => c.id)).size, 312);
    assert.deepEqual(Object.fromEntries(Object.keys(TEMPLATE_COUNTS).map(t => [t,
        cases.filter(c => c.template === t).length])), TEMPLATE_COUNTS);
    assert.equal(canonicalJson(manifest), canonicalJson(createManifest()));
    assert.equal(manifest.definitionSha256, contentHash(canonicalJson(createCases())));
    assert.throws(() => { cases[0].parameters.volts = 99; });
});

test('every waveform uses exact integer time, first sample at dt, bounded source-model window', () => {
    for (const c of cases.filter(c => c.clock)) {
        assert.deepEqual(c.clock, sampleClock(c.clock.durationNs, c.clock.intervalNs));
        assert(Number.isSafeInteger(c.maxStepNs) && c.maxStepNs > 0);
        assert(c.scopes.length >= 2 && c.scopes.length <= 4);
        assert(c.meters.length <= 8);
        assert.equal(c.input.sha256, contentHash(c.input.text));
    }
    for (const args of [[0, 500], [1001, 500], [1000, 100], [Infinity, 500]]) {
        assert.throws(() => sampleClock(...args));
    }
});

test('independent authored topology witnesses pin component positions and nonlinear model field/thermal contracts', () => {
    assert.match(select('divider').input.text, /R1 IN OUT 1000\nR2 OUT 0 250/);
    assert.match(select('bridge').input.text, /R1 IN LEFT 1000\nR2 LEFT 0 1000\nR3 IN RIGHT 250\nR4 RIGHT 0 1000/);
    assert.match(select('rc-lowpass').input.text, /R1 IN OUT 1000\nC1 OUT 0 /);
    assert.match(select('rc-highpass').input.text, /C1 IN OUT .*\nR1 OUT 0 1000/);
    assert.match(select('rl-lowpass').input.text, /L1 IN OUT 0.01\nR1 OUT 0 100/);
    assert.match(select('rl-highpass').input.text, /R1 IN OUT 100\nL1 OUT 0 0.01/);
    assert.match(select('diode-reversed').input.text, /D1 0 OUT DCORE/);
    assert.match(select('npn-common-emitter').input.text, /Q1 COL BASE 0 NCORE/);
    for (const c of cases.filter(c => c.route === 'dc-sweep')) {
        assert.notEqual(c.sweep.from, c.sweep.to);
        assert.equal(c.currentConvention, 'into-terminal');
        assert.match(c.input.text, /TEMP=26\.826793442075882 TNOM=26\.826793442075882/);
    }
});

test('nominal fixtures connect physical rails, feedback, dual package leads and explicit approved models', () => {
    for (const c of cases.filter(c => c.referenceKind === 'nominal-analytic')) {
        const input = JSON.parse(c.input.text);
        assert(input.parts.length <= 10);
        assert(input.wires.some(w => w.to === 'U'));
        if (c.template === 'lm741-follower') {
            assert(input.wires.some(w => w.from === 'U' && w.fromTerminal === 'out' && w.toTerminal === 'inn'));
            assert.equal(input.parts.find(p => p.id === 'U').params.transientModel, 'linear-pole');
        } else {
            for (const lead of ['vin_7', 'vin_8', 'vout_2', 'sense_adj']) {
                assert(input.wires.some(w => w.to === 'U' && w.toTerminal === lead));
            }
            assert.equal(input.parts.find(p => p.id === 'U').params.startupModel, 'current-limited-envelope');
        }
    }
});

test('closed-form divider/bridge controls use actual finite ramp window, not final static voltage', () => {
    const c = select('divider', p => p.volts === 5 && p.ohms === 1000 && p.ratio === 1);
    const r = passiveReference(c, .0001);
    assert.equal(r.wave.output, 2.5);
    assert(Math.abs(r.meters['output-mean'] - 2.375) < 1e-12);
    assert(Math.abs(r.meters['load-current'] + .002375) < 1e-12);
    assert.equal(passiveReference(select('bridge', p => p.ratio === 1), .0001).wave.differential, 0);
});

test('RC/RL independent equations have the correct 1-tau low/high behavior and integral-current signs', () => {
    for (const template of ['rc-lowpass', 'rc-highpass', 'rl-lowpass', 'rl-highpass']) {
        const c = select(template, p => p.sign === 1);
        const tau = c.parameters.tauNs / 1e9, rise = c.parameters.riseNs / 1e9;
        const r = passiveReference(c, tau + rise);
        const low = 1 - Math.exp(-1) * (1 - Math.exp(-rise / tau)) / (rise / tau);
        assert(Math.abs(r.wave.output - (template.endsWith('lowpass') ? low : 1 - low)) < 1e-12);
        assert(r.meters['supply-current'] > 0);
        assert(r.meters['resistor-current'] < 0);
        assert.equal(passiveReference(c, 0).wave.output, 0);
    }
});

test('numeric comparison detects changed voltage, nonzero reversed current and timestamp-only shift', () => {
    assert.equal(close(1.1, 1, {absolute: .01, relative: 0}).pass, false);
    assert.equal(close(-.002, .002, {absolute: 1e-9, relative: 1e-4}).pass, false);
    const expected = [{timeNs: 500, unit: 'V', value: 1}];
    assert.throws(() => compareSeries([{timeNs: 501, unit: 'V', value: 1}], expected, {absolute: 0, relative: 0}), /Time/);
    assert.throws(() => close(NaN, 0, {absolute: 1, relative: 0}), /Nonfinite/);
});

test('wrong R/C/L substitutions reach numerical comparison and fail independent equations', () => {
    for (const template of ['divider', 'rc-lowpass', 'rl-lowpass']) {
        const original = select(template, p => (p.volts ?? p.sign) === 1);
        const wrong = structuredClone(original);
        if (template === 'divider') wrong.parameters.ratio *= 2;
        else wrong.parameters.tauNs *= 2;
        const time = original.clock.durationNs / 1e9 / 8;
        assert.equal(close(passiveReference(wrong, time).wave.output,
            passiveReference(original, time).wave.output, original.tolerances.waveV).pass, false);
    }
});

test('LM741 reference preserves phase and loaded pole; phase and ideal-pole substitutions fail fixed gate', () => {
    const c = select('lm741-follower', p => p.sign === 1 && p.phaseNs === 67 && p.loadOhms === 2000);
    assert.equal(lmReference(c, .000010).wave.output, 0);
    const wrongPhase = structuredClone(c); wrongPhase.referenceModel.delayNs -= 67;
    const wrongPole = structuredClone(c); wrongPole.referenceModel.bandwidthHz *= 2;
    const t = .0000105, expected = lmReference(c, t).wave.output;
    assert.equal(close(lmReference(wrongPhase, t).wave.output, expected, c.tolerances.waveV).pass, false);
    assert.equal(close(lmReference(wrongPole, t).wave.output, expected, c.tolerances.waveV).pass, false);
    const final = lmReference(c, .00002);
    assert(final.meters['output-mean'] > 0 && final.meters['output-mean'] < .005);
    assert.equal(final.meters['load-a-current'], -final.meters['load-b-current']);
});

test('ADP closed-form branch witnesses distinguish no-entry, entry/release and entry-only cases', () => {
    for (const c of cases.filter(c => c.template === 'adp7118-startup')) {
        const ref = createAdpReference(c), limited = ref.branches.filter(b => b.limited);
        assert.equal(limited.length > 0, c.requiredWitnesses.currentLimitEntry);
        assert.equal(ref.branches.length >= 3, c.requiredWitnesses.currentLimitRelease);
        const end = ref.at(.0012);
        assert(end.wave.output > 0 && end.wave.output < 5);
        assert(end.outputMeanCurrent > -end.meters['load-current']);
        assert.equal(ref.at(0).wave.output, 0);
    }
});

test('ADP omitted-limiter mutant fails numerical waveform and output-integral comparisons', () => {
    const c = select('adp7118-startup', p => p.microfarads === 100 && p.loadOhms === 1000);
    const ref = createAdpReference(c), mutant = createAdpReference(c, {omitLimit: true});
    assert.equal(close(mutant.at(.0004).wave.output, ref.at(.0004).wave.output, c.tolerances.waveV).pass, false);
    assert.equal(close(mutant.at(.0004).outputMeanCurrent, ref.at(.0004).outputMeanCurrent, c.tolerances.meanA).pass, false);
});

test('meter comparison reads finite typed SI fields, never the pretty formatted value', () => {
    const expected = {mode: 'current', probes: ['R1.a'], unit: 'A'};
    const row = {mode: 'current', probes: ['R1.a'], quantity: 'observed-dc-mean',
        reading: {value: '2.00', unit: 'mA', siValue: .002, siUnit: 'A', note: null}};
    assert.equal(readMeter(row, expected), .002);
    assert.throws(() => readMeter({...row, reading: {...row.reading, siUnit: 'mA'}}, expected));
    assert.throws(() => readMeter({...row, reading: {...row.reading, siValue: null}}, expected));
});

test('CSV uses absolute first-sample offset and rejects a shifted, incomplete or duplicate capture', () => {
    const c = select('lm741-follower');
    const csv = c.scopes.map(s => [`# net=${s.tip} - ${s.reference} capture=sample startTimeNs=500 sampleIntervalNs=500 points=40`,
        'elapsed_seconds,volts', ...Array.from({length: 40}, (_, i) => `${i * 500 / 1e9},0`)].join('\n')).join('\n\n') + '\n';
    const parsed = parseScopeCsv(csv, c);
    assert.equal(parsed[0].samples[0].timeNs, 500);
    assert.equal(parsed[0].samples.at(-1).timeNs, 20000);
    assert.throws(() => parseScopeCsv(csv.replace('startTimeNs=500', 'startTimeNs=0'), c));
    assert.throws(() => parseScopeCsv(csv.replace('0,0\n', '0.0000005,0\n'), c));
    assert.throws(() => parseScopeCsv(csv + '\n' + csv, c));
});

test('denominator accounting retains every selected case and cannot turn missing/refused into green', () => {
    const results = cases.map(c => ({id: c.id, status: 'not-run', executed: false}));
    assert.equal(reconcileResults(cases, results).complete, false);
    assert.throws(() => reconcileResults(cases, results.slice(1)), /Incomplete/);
    assert.throws(() => reconcileResults(cases, [...results, results[0]]), /duplicated/);
    results[0] = {id: cases[0].id, status: 'pass', executed: true};
    const report = reconcileResults(cases, results);
    assert.equal(report.counts.comparable, 1);
    assert.equal(report.counts['not-run'], 311);
});

test('ngspice deck freezes actual source, zero state, tight solve settings, original and linearized outputs', () => {
    const c = select('rc-lowpass');
    const deck = oracleDeck(c);
    assert.match(deck, /tran 800n 80000n 0 40n uic/);
    assert.match(deck, /wrdata oracle-raw.txt/);
    assert.match(deck, /linearize/);
    assert.match(deck, /wrdata oracle-sampled.txt/);
    assert.equal((deck.match(/\.end\n/g) ?? []).length, 1);
    assert.match(oracleDeck(select('diode-forward')), /dc V1 0 -1 -1/);
    assert.throws(() => oracleDeck(select('lm741-follower')));
});

test('oracle reader binds vector names and full DC grid; nonzero current reversal fails actual comparison', () => {
    const c = select('diode-forward', p => p.volts === 1);
    const vectors = oracleVectors(c);
    const table = ['v-sweep ' + vectors.join(' '),
        '0 ' + vectors.map(() => 0).join(' '),
        '1 ' + vectors.map(v => v === 'i(v1)' ? -.001 : v === 'v(in)' ? 1 : .6).join(' ')].join('\n');
    const rows = parseOracleTable(table, c);
    const report = {schemaVersion: 1, sourceId: 'V1', claims: {transient: false},
        observations: c.observations.map(o => ({kind: o.kind, selector: o.selector ?? o.tip, reference: o.reference, unit: o.unit})),
        samples: [{sourceVolts: 0, values: [0, 0, 0, 0, 0, 0]},
            {sourceVolts: 1, values: [1, .6, .6, .001, -.001, -.001]}]};
    assert(compareDc(report, c, rows).every(c => c.pass));
    report.samples[1].values[3] *= -1;
    assert(compareDc(report, c, rows).some(c => !c.pass));
    assert.throws(() => parseOracleTable(table.replace('v(in)', 'v(wrong)'), c), /identity/);
    assert.throws(() => parseOracleTable(table.replace('\n1 ', '\n0.9 '), c), /grid/);
});

const releaseSummary = () => ({action: 'audit', schemaVersion: 1, version: '0.1.26', tag: 'v0.1.26',
    releaseSource: '6d78f7e107752497ed96b30b03e985386916fc59', complete: true, iosPresent: true,
    metadataVerified: true, pendingReview: false, reviewRecorded: true, recoveryEligible: true,
    builds: ['IOS', 'MAC_OS'].map(platform => ({platform,
        processingState: 'VALID', expired: false, internalGroupLinked: true, externalGroupLinked: true,
        usesNonExemptEncryption: false, reviewState: 'APPROVED', localizedNotesPresent: {'en-US': true, 'de-DE': true},
        localizedNotesMatch: {'en-US': true, 'de-DE': true}, internalBuildState: 'IN_BETA_TESTING', externalBuildState: 'IN_BETA_TESTING'}))});

test('actual release gate refuses a mere successful workflow, pending review and missing iOS', () => {
    const run = {id: 123, run_attempt: 1, event: 'workflow_dispatch', status: 'completed', conclusion: 'success', head_branch: 'main',
        path: '.github/workflows/testflight-release-recovery.yml', head_sha: 'a'.repeat(40), repository: {full_name: 'CrispStrobe/brickwright-lite'}};
    assert.equal(admitReleaseRun(run), run);
    assert.throws(() => admitReleaseRun({...run, path: '.github/workflows/mobile.yml'}));
    assert.throws(() => admitReleaseRun({...run, conclusion: 'failure'}));
    const summary = releaseSummary();
    assert.equal(admitReleaseSummary(summary), summary);
    assert.throws(() => admitReleaseSummary({...summary, pendingReview: true}));
    assert.throws(() => admitReleaseSummary({...summary, complete: false}));
    assert.throws(() => admitReleaseSummary({...summary, builds: []}));
    for (const fields of [{usesNonExemptEncryption: true}, {reviewState: 'REJECTED'}, {reviewState: 'IN_REVIEW'}, {localizedNotesPresent: {}}]) {
        assert.throws(() => admitReleaseSummary({...summary, builds: [{...summary.builds[0], ...fields}]}));
    }
    const jobs = {total_count: 1, jobs: [{id: 456, run_id: 123, run_attempt: 1, head_sha: run.head_sha, name: 'metadata',
        status: 'completed', conclusion: 'success', steps: [{name: 'Audit or recover existing release metadata', status: 'completed', conclusion: 'success'}]}]};
    assert.equal(admitReleaseJob(run, jobs).id, 456);
    assert.throws(() => admitReleaseJob(run, {...jobs, jobs: [{...jobs.jobs[0], run_id: 122}]}));
    assert.throws(() => admitReleaseJob(run, {...jobs, jobs: [{...jobs.jobs[0], head_sha: 'b'.repeat(40)}]}));
    assert.deepEqual(summaryFromOriginalLog('2026-10-23T12:00:00.000Z ' + JSON.stringify(summary)), summary);
    assert.throws(() => summaryFromOriginalLog(JSON.stringify(summary) + '\n' + JSON.stringify(summary)), /one original/);
});

test('the admitted release summary is bound to its independently recorded original without reacquiring that log', () => {
    const run = {id: 40048235422, run_attempt: 1, event: 'workflow_dispatch', status: 'completed', conclusion: 'success', head_branch: 'main',
        path: '.github/workflows/testflight-release-recovery.yml', head_sha: 'dc0897cc4fdf1984752ed4ead0a3836bcd1d2385',
        repository: {full_name: 'CrispStrobe/brickwright-lite'}};
    const jobs = {total_count: 1, jobs: [{id: 120734738631, run_id: run.id, run_attempt: 1, head_sha: run.head_sha,
        name: 'metadata', status: 'completed', conclusion: 'success',
        steps: [{name: 'Audit or recover existing release metadata', status: 'completed', conclusion: 'success'}]}]};
    const summary = releaseSummary();
    assert.equal(contentHash(canonicalJson(summary)), '5f3b7d92ede237ab656d79e2a1d9812474f33197e8dd337f0b95b143ce35510e');
    assert.deepEqual(ADMITTED_RELEASE_SUMMARY, summary);
    assert.throws(() => { ADMITTED_RELEASE_SUMMARY.builds[0].reviewState = 'WAITING_FOR_REVIEW'; });
    const observed = releaseObservation(run, jobs, summary);
    assert.equal(observed.originalLogDownloadedByCampaign, false);
    assert.deepEqual(observed.originalLog, {bytes: 24622, sha256: '734373adbf58a5763860f558e8568ac82b8a173ad90f00cbee8cc8da38502bdb'});
    assert.equal(RELEASE_OBSERVATION.runId, run.id);
    const substituted = structuredClone(summary);
    substituted.builds[0].externalBuildState = 'READY_FOR_BETA_TESTING'; // Still available, but not this admitted observation.
    admitReleaseSummary(substituted);
    assert.throws(() => releaseObservation(run, jobs, substituted), /observation mismatch/);
    assert.throws(() => releaseObservation({...run, id: run.id + 1},
        {...jobs, jobs: [{...jobs.jobs[0], run_id: run.id + 1}]}, summary), /observation mismatch/);
    assert.throws(() => releaseObservation(run, {...jobs, jobs: [{...jobs.jobs[0], id: 120734738632}]}, summary), /observation mismatch/);
    assert.throws(() => releaseObservation({...run, head_sha: 'a'.repeat(40)},
        {...jobs, jobs: [{...jobs.jobs[0], head_sha: 'a'.repeat(40)}]}, summary), /observation mismatch/);
});

test('the hosted campaign reads only run/job metadata and reuses the once-admitted release observation', () => {
    const workflow = readFileSync(new URL('../.github/workflows/circuit-instrument-regression.yml', import.meta.url), 'utf8');
    assert.match(workflow, /--admit-release-observation/);
    const requests = workflow.split('\n').filter(line => /^\s*gh api /.test(line));
    assert.equal(requests.length, 2, 'exactly two metadata reads; no official log retrieval');
    assert(requests.some(line => line.includes('/actions/runs/$RELEASE_RUN" > release-evidence/run.json')));
    assert(requests.some(line => line.includes('/attempts/$RELEASE_ATTEMPT/jobs?per_page=100')));
    assert.doesNotMatch(workflow, /\/logs\b|\b(?:curl|wget)\b|gh run[^\n]*--log|actions\/download-artifact/);
    assert.doesNotMatch(workflow, /--bind-release-log|--release-log/);
    assert.match(workflow, /--release-observation release-evidence\/observation.json/);
});

test('CLI argv selects actual supported static/current and typed integer-time capture doors', () => {
    const staticArgs = buildCliArgs(select('diode-forward'), 'input.cir', 'evidence');
    assert.equal(staticArgs[0], 'dc-sweep');
    assert(staticArgs.includes('--current'));
    assert(!staticArgs.includes('--receipt'));
    const wave = buildCliArgs(select('lm741-follower'), 'input.json', 'evidence');
    assert(wave.includes('--watch'));
    assert(!wave.includes('--json'));
    assert(wave.includes('20000ns'));
    assert(wave.includes('2000000Hz'));
    assert(wave.includes('current:RL.a'));
    assert(!wave.includes('--current'));
});

// This fixture tests transport/comparator admission only. It is deliberately
// synthetic and is never labelled an engine run or independent circuit proof.
function typedFixture(c) {
    const adp = c.template === 'adp7118-startup' ? createAdpReference(c) : null;
    const ref = t => adp ? adp.at(t) : c.template === 'lm741-follower' ? lmReference(c, t) : passiveReference(c, t);
    const meterRows = t => c.meters.map(m => ({mode: m.mode, probes: m.probes, quantity: 'observed-dc-mean', timeSeconds: t,
        reading: {siUnit: m.unit, siValue: ref(t).meters[m.id] ??
            (m.id === 'vout_1' ? ref(t).outputMeanCurrent : m.id === 'vin_7' ? -ref(t).outputMeanCurrent : 0), note: null}}));
    const w = {attempts: 100, solves: 301, advances: c.acquisition === 'watch' ? c.clock.count : 1};
    const budget = {maxAttempts: 20000, maxSolves: 60001, maxAdvances: c.acquisition === 'watch' ? 200 : 1};
    const transient = {profile: {id: 'precision-v1'}, work: w, accuracyMet: true, failure: null,
        boundedAdvance: {completed: true, failure: null, requestedTimeNs: String(c.clock.durationNs), limits: budget,
            work: w, stream: {stepNs: String(c.clock.intervalNs), observerCalls: c.clock.count}}};
    const report = {requestedTransientProfile: 'precision-v1', plannedSamples: c.clock.count,
        durationSeconds: c.clock.durationNs / 1e9, rateHz: c.clock.rateHz,
        simulatedDurationSeconds: c.clock.durationNs / 1e9, effectiveRateHz: c.clock.rateHz, transient, precisionCapture: budget,
        scope: c.scopes.map(s => ({tip: s.tip, reference: s.reference, probe: 'ideal', capture: 'sample',
            startTimeSeconds: c.clock.firstSampleNs / 1e9, sampleIntervalSeconds: c.clock.intervalNs / 1e9,
            summary: {samples: c.clock.count}})), meters: meterRows(c.clock.durationNs / 1e9),
        poweredMeterAcquisition: {startTimeSeconds: 0, quantity: 'observed-dc-mean',
            maximumWindowSeconds: .1, independentIntegralCertificate: false}};
    const channels = c.scopes.map(s => ({id: s.id, samples: Array.from({length: c.clock.count}, (_, i) => {
        const timeNs = (i + 1) * c.clock.intervalNs;
        return {timeNs, unit: 'V', value: ref(timeNs / 1e9).wave[s.id]};
    })}));
    const prefixes = c.acquisition !== 'watch' ? [] : Array.from({length: c.clock.count}, (_, i) => {
        const t = (i + 1) * c.clock.intervalNs / 1e9;
        return {recordType: 'sample', index: i, qualified: false, timeSeconds: t, elapsedSeconds: t,
            scope: c.scopes.map(s => ({tip: s.tip, reference: s.reference, timeSeconds: t, volts: ref(t).wave[s.id]})),
            meters: meterRows(t)};
    });
    return {capture: {report, prefixes}, channels};
}

test('finite watch accepts only whole qualified final receipt; raw-prefix corruption and missing summary fail', () => {
    const c = select('lm741-follower'), {capture, channels} = typedFixture(c);
    const stream = [...capture.prefixes, {recordType: 'summary', watchSamples: c.clock.count, qualified: true, report: capture.report}];
    const parsed = parseCapture(stream.map(r => JSON.stringify(r)).join('\n'), c);
    assert(compareCapture(parsed, channels, c).every(c => c.pass));
    const bad = structuredClone(stream); bad.at(-1).report.transient.boundedAdvance.completed = false;
    assert.throws(() => parseCapture(bad.map(r => JSON.stringify(r)).join('\n'), c), /receipt/);
    assert.throws(() => parseCapture(stream.slice(0, -1).map(r => JSON.stringify(r)).join('\n'), c), /incomplete/);
    parsed.prefixes[21].scope[0].volts += .001;
    assert(compareCapture(parsed, channels, c).some(c => !c.pass));
});

test('ADP prefix means prove plateau/release and KCL using actual exposed current fields', () => {
    const c = select('adp7118-startup', p => p.microfarads === 47 && p.loadOhms === 1000 && p.inputVolts === 6);
    const {capture, channels} = typedFixture(c);
    const checks = compareCapture(capture, channels, c);
    assert(checks.every(c => c.pass));
    assert(checks.some(c => c.kind === 'current-limit-entry-witness'));
    assert(checks.some(c => c.kind === 'current-limit-release-witness'));
    const ground = c.meters.findIndex(m => m.id === 'gnd');
    capture.prefixes[40].meters[ground].reading.siValue += .001;
    assert(compareCapture(capture, channels, c).some(c => c.kind === 'package-conservation' && !c.pass));
});

test('all nine retained-record perturbations reach numerical/clock checks without replaying a guest', () => {
    const selected = [select('divider', p => p.volts === 5 && p.ohms === 1000 && p.ratio === 1),
        select('rc-lowpass', p => p.sign === 1 && p.ohms === 1000 && p.storage === 10),
        select('rl-lowpass', p => p.sign === 1 && p.ohms === 100 && p.storage === 10000000),
        select('lm741-follower', p => p.sign === 1 && p.phaseNs === 67 && p.loadOhms === 2000),
        select('adp7118-startup', p => p.microfarads === 100 && p.loadOhms === 1000 && p.inputVolts === 6)];
    const mutations = selected.flatMap(c => { const f = typedFixture(c); return retainedMutationChecks(f.capture, f.channels, c); });
    assert.deepEqual(mutations.map(m => m.name).sort(), [...REQUIRED_MUTATIONS].sort());
    assert(mutations.every(m => m.detected && m.originalReplay === false));
});

test('closed-form ADP independently satisfies the capacitor ODE and integrated output-current identity', () => {
    for (const uf of [1, 47, 100]) {
        const c = select('adp7118-startup', p => p.microfarads === uf && p.loadOhms === 1000 && p.inputVolts === 6);
        const reference = createAdpReference(c), capacitance = uf * 1e-6;
        const tau = .0003 / Math.log(9), delay = Math.round((.00008 + tau * Math.log(.9)) * 1e9) / 1e9;
        for (const t of [.0001, .0004, .001]) {
            const voltage = reference.at(t).wave.output;
            const derivative = (reference.at(t + 1e-9).wave.output - reference.at(t - 1e-9).wave.output) / 2e-9;
            const target = 5 * -Math.expm1(-(t - delay) / tau);
            const delivered = Math.min(.36, (target - voltage) / .05);
            assert(Math.abs(capacitance * derivative + voltage / 1000 - delivered) < 1e-6);
        }
        // Independent composite midpoint integral, only a pure reference check.
        let area = 0;
        const dt = .0012 / 10000;
        for (let i = 0; i < 10000; i++) area += reference.at((i + .5) * dt).wave.output * dt;
        assert(Math.abs(area / .0012 - reference.at(.0012).meters['output-mean']) < 1e-6);
    }
});

test('capture metadata rejects absent/NaN time, shifted meter windows, wrong quantities and failed budgets', () => {
    const c = select('adp7118-startup');
    const encode = capture => [...capture.prefixes, {recordType: 'summary', qualified: true,
        watchSamples: c.clock.count, report: capture.report}].map(r => JSON.stringify(r)).join('\n');
    const changes = [f => { delete f.report.scope[0].startTimeSeconds; },
        f => { f.prefixes[0].timeSeconds = NaN; },
        f => { f.report.meters[0].timeSeconds += .00001; },
        f => { f.report.meters[0].quantity = 'instant'; },
        f => { f.report.transient.work.solves = 60002; }];
    for (const change of changes) {
        const {capture} = typedFixture(c); change(capture);
        assert.throws(() => parseCapture(encode(capture), c));
    }
    const {capture} = typedFixture(c);
    capture.report.durationSeconds = 1200000 * 1e-9; // Actual scaled CLI parser's harmless binary rounding.
    assert.equal(parseCapture(encode(capture), c).report.plannedSamples, 120);
});

test('receipt reader requires exact installed runtime paths, input/CSV hashes, clock and original report', () => {
    const c = select('lm741-follower'), {capture} = typedFixture(c);
    const observed = {engine: {root: '/test/installed/bw-board', sha256: 'a'.repeat(64)},
        cli: {root: '/test/installed/bw-circuit-ui', sha256: 'b'.repeat(64)}, csvSha256: 'c'.repeat(64),
        csvBytes: 100, report: capture.report};
    const receipt = {schemaVersion: 1, kind: 'bwc-measurement-receipt', exitCode: 0,
        input: {sha256: c.input.sha256, bytes: Buffer.byteLength(c.input.text)},
        engine: {selection: 'installed package', observed: {root: observed.engine.root, jsJsonTreeSha256: observed.engine.sha256}},
        cli: {root: observed.cli.root, jsJsonTreeSha256: observed.cli.sha256}, invocation: {nodeVersion: process.version, BW_BOARD: null},
        clock: {startNs: '0', durationNs: '20000', intervalNs: '500'}, acquisition: 'watch',
        csv: {sha256: observed.csvSha256, bytes: 100}, importedCircuitSha256: 'd'.repeat(64), report: capture.report};
    assert.equal(verifyCaptureIdentity(receipt, c, observed), true);
    for (const change of [r => { r.engine.observed.root = '/test/shadow/bw-board'; },
        r => { r.engine.selection = 'BW_BOARD override'; }, r => { r.input.sha256 = '0'.repeat(64); },
        r => { r.csv.bytes++; }, r => { r.clock.startNs = '500'; }, r => { r.report.meters[0].reading.siValue = 9; }]) {
        const wrong = structuredClone(receipt); change(wrong);
        assert.throws(() => verifyCaptureIdentity(wrong, c, observed), /provenance/);
    }
});
