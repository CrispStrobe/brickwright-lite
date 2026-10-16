import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import SB3Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {adafruitToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/adafruit-translate.js';
import {adafruitPrograms} from '../scripts/lib/makecode-adafruit-corpus.mjs';
import {adafruitSimAvailable, compileAdafruit, runAdafruitSim} from '../scripts/lib/makecode-adafruit-sim.mjs';
import {runCpxExtension} from '../scripts/lib/cpx-extension-run.mjs';
import {cpxBlockProgram} from './helpers/cpx-block-program.mjs';
import {traceCpxPxtFactory, CPX_TRACE_PREFIX} from './helpers/cpx-pxt-trace.mjs';

// Retained exact observations, not a tolerance or a device timing promise.
const timingLimits = JSON.parse(readFileSync(new URL('./fixtures/cpx-makecode-timing-limits.json', import.meta.url)));


const cases = [
    {id: 'reference/light/set-all#0', lit: [100]},
    {id: 'reference/light/show-ring#1', lit: [100, 700]},
    {id: 'reference/light/graph#0', lit: [100]},
    {id: 'reference/light/set-brightness#0', inputs: [
        {t: 200, button: 'A', down: true}, {t: 300, button: 'A', down: false},
        {t: 800, button: 'B', down: true}, {t: 900, button: 'B', down: false}], lit: [100, 500, 1100]},
    {id: 'reference/light/show-animation#0', inputs: [
        {t: 200, button: 'A', down: true}, {t: 300, button: 'A', down: false}], lit: [400, 600, 900]},
    {id: 'reference/input/on-switch-moved#0', inputs: [{t: 200, switchRight: false}], lit: [400]},
    {id: 'tutorials/clap-lights#1', inputs: [{t: 200, sound: 250}], lit: [400]},
    {id: 'tutorials/siren#4', inputs: [{t: 200, gesture: 'shake'}], lit: [300, 800], sound: true},
    {id: 'projects/headlamp/code#2', inputs: [{t: 200, light: 0}], lit: [400, 800]},
    {id: 'learnsystem/beep-beep#0', inputs: [
        {t: 200, button: 'A', down: true}, {t: 300, button: 'A', down: false}], lit: [400], sound: true},
    {id: 'examples/juggle-counter#0', inputs: [
        {t: 100, button: 'A', down: true}, {t: 150, button: 'A', down: false},
        {t: 300, gesture: 'shake'}], lit: [600, 800], sound: true},
    {id: 'reference/light/set-pixel-color#0', inputs: [
        {t: 200, button: 'B', down: true}, {t: 300, button: 'B', down: false}], lit: [500]},
    {id: 'projects/star-projector/code#1', lit: [100, 2500], expectedLit: 10,
        equalColorGroups: [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]]},
    {id: 'reference/light/show-ring#2', lit: [100, 2500], expectedLit: 10,
        equalColorGroups: [[0, 4, 5, 9], [1, 3, 6, 8], [2, 7]]},
    {id: 'projects/cartoon-network/enchiridion#1', lit: [100, 2500], expectedLit: 6,
        blackPixels: [2, 4, 5, 7]}
];

for (const scenario of cases) test(`CPX ${timingLimits[scenario.id] ? 'documented runtime timing boundary' : 'translated documentation vs original simulator'}: ${scenario.id}`, async t => {
    // These are required qualification controls: missing originals must not
    // turn a changed translator into a successful skipped test.
    assert.ok(adafruitSimAvailable(), 'Pinned CPX compiler and simulator are required (sync:makecode)');
    const source = adafruitPrograms().find(p => p.id === scenario.id);
    assert.ok(source, `Original documentation program disappeared: ${scenario.id}`);
    const translated = adafruitToPseudocode(source.ts);
    assert.deepEqual(translated.unsupported, [], translated.code);
    const creator = new SB3Creator();
    const project = creator.parse(translated.code);
    assert.deepEqual(creator.warnings, [], translated.code);
    const driver = cpxBlockProgram(project);
    const opts = {ms: 3000, at: [50, 100, 300, 400, 500, 600, 700, 800, 900, 1100, 1500, 2500],
        inputs: scenario.inputs || []};
    const compiled = await compileAdafruit(source.ts);
    const original = await runAdafruitSim(compiled, opts);
    const actual = await runCpxExtension(driver.drive, {...opts, onHat: driver.onHat});
    assert.equal(original.error, null, `Original simulator failed: ${original.error}`);
    assert.equal(actual.error, null, `Translated block/extension driver failed: ${actual.error}`);
    // Retain all differences before the first assertion stops this case. The
    // original strict comparisons below remain intact during diagnosis.
    const differences = opts.at.filter(t => JSON.stringify(actual.frames[t]) !== JSON.stringify(original.frames[t]))
        .map(t => ({t, original: original.frames[t], translated: actual.frames[t]}));
    const toneDifference = JSON.stringify(actual.tones) !== JSON.stringify(original.tones);
    // Frame observer output as test diagnostics; raw stdout shares the
    // runner's serialized transport and can hide the file's test results.
    if (differences.length || toneDifference) t.diagnostic('CPX comparison diagnostic ' + JSON.stringify({
        id: scenario.id, frames: differences,
        ...(toneDifference ? {originalTones: original.tones, translatedTones: actual.tones} : {})
    }));
    if (differences.length || toneDifference) {
        // This separately named instrumented derivative is diagnostic only.
        // Existing helpers, original source, snapshots and assertions stay put.
        // It forwards the real factory/callbacks and emits observer records via
        // the existing collector; the selected original has no serial calls.
        assert.doesNotMatch(source.ts, /\b(?:serial|console)\./);
        const instrumented = traceCpxPxtFactory(compiled);
        assert.equal(instrumented.split(compiled).length, 2, 'Original compiler factory bytes appear exactly once');
        const observed = await runAdafruitSim(instrumented, opts);
        const trace = observed.serial.filter(row => row.text.startsWith(CPX_TRACE_PREFIX))
            .map(row => ({collectedAt: row.t, ...JSON.parse(row.text.slice(CPX_TRACE_PREFIX.length))}));
        const sha256 = value => createHash('sha256').update(value).digest('hex');
        const traceSha256 = sha256(JSON.stringify(trace));
        t.diagnostic('CPX original-boundary trace header ' + JSON.stringify({id: scenario.id,
            diagnosticDerivative: true, originalSourceSha256: sha256(source.ts),
            originalFactorySha256: sha256(compiled), instrumentedFactorySha256: sha256(instrumented),
            error: observed.error, records: trace.length, traceSha256}));
        for (const [index, event] of trace.entries()) t.diagnostic('CPX original-boundary trace event ' +
            JSON.stringify({id: scenario.id, index, event}));
        t.diagnostic('CPX original-boundary trace complete ' + JSON.stringify({id: scenario.id,
            records: trace.length, traceSha256}));
        assert.equal(observed.error, null, `Diagnostic derivative failed: ${observed.error}`);
        assert.ok(trace.length > 0, 'The real original boundaries must produce observer records');
        assert.deepEqual(observed.frames, original.frames, 'Observer must preserve every original captured frame');
        assert.deepEqual(observed.tones, original.tones, 'Observer must preserve every original queued tone');
        assert.deepEqual(observed.serial.filter(row => !row.text.startsWith(CPX_TRACE_PREFIX)), original.serial,
            'Observer lines cannot replace original program serial output');
    }
    if (scenario.expectedLit !== undefined) for (const t of scenario.lit) {
        const pixels = original.frames[t];
        assert.equal(pixels.length, 10, 'Original CPX ring must have ten pixels');
        assert.equal(pixels.filter(color => color !== 0).length, scenario.expectedLit,
            `${scenario.id} must illuminate the authored number of pixels at ${t}ms`);
        if (scenario.blackPixels) assert.deepEqual(pixels.flatMap((color, index) => color === 0 ? [index] : []),
            scenario.blackPixels, 'Original black pixel positions must retain the authored pattern');
        if (scenario.equalColorGroups) {
            for (const group of scenario.equalColorGroups) assert.equal(new Set(group.map(index => pixels[index])).size, 1,
                'Repeated original pattern colors must agree');
            assert.equal(new Set(scenario.equalColorGroups.map(group => pixels[group[0]])).size,
                scenario.equalColorGroups.length, 'Distinct authored colors cannot collapse to one');
        }
    }
    const timingLimit = timingLimits[scenario.id];
    if (timingLimit) assert.deepEqual({id: scenario.id, frames: differences,
        ...(toneDifference ? {originalTones: original.tones, translatedTones: actual.tones} : {})},
    timingLimit, 'The documented boundary must retain every exact original/translated difference');
    for (const t of opts.at) {
        const capturedLimit = timingLimit?.frames.find(frame => frame.t === t);
        if (capturedLimit) {
            assert.deepEqual(original.frames[t], capturedLimit.original, `${scenario.id} retained original ring at ${t}ms`);
            assert.deepEqual(actual.frames[t], capturedLimit.translated, `${scenario.id} retained native ring at ${t}ms`);
        } else assert.deepEqual(actual.frames[t], original.frames[t], `${scenario.id} ring at ${t}ms`);
    }
    for (const t of scenario.lit) assert.ok(original.frames[t].some(v => v !== 0), `${scenario.id} original must light pixels at ${t}ms`);
    if (scenario.sound) assert.ok(original.tones.length > 0, `${scenario.id} original must produce tones`);
    if (timingLimit?.originalTones) {
        assert.deepEqual(original.tones, timingLimit.originalTones, `${scenario.id} retained original ordered tones`);
        assert.deepEqual(actual.tones, timingLimit.translatedTones, `${scenario.id} retained native ordered tones`);
    } else assert.deepEqual(actual.tones, original.tones, `${scenario.id} ordered tone timing/frequencies`);
});
