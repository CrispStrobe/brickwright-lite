import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {validateSoundTabReceipt} from '../scripts/lib/sound-tab-probe.mjs';

const read = filename => readFileSync(new URL(`../${filename}`, import.meta.url), 'utf8');

test('the Sounds route owns one retryable demand-loaded module', () => {
    const gui = read('overlay/scratch-gui/src/components/gui/gui.jsx');
    const wrapper = read('overlay/scratch-gui/src/containers/lazy-sound-tab.jsx');
    const sharedAudio = read('packages/scratch-gui/src/lib/audio/shared-audio-context.js');
    const browserGate = read('scripts/verify-sound-tab-activation.mjs');
    const receiptGate = read('scripts/lib/sound-tab-probe.mjs');

    assert.doesNotMatch(gui, /import SoundTab from/);
    assert.match(gui, /soundsTabVisible \? <LazySoundTab vm=\{vm\} \/>/);
    assert.match(wrapper, /webpackChunkName: "sound-tab"/);
    assert.match(wrapper, /export const preloadSoundTab = loadSoundTab/);
    assert.match(gui, /onFocus=\{preloadSoundTab\}/);
    assert.match(gui, /onMouseEnter=\{preloadSoundTab\}/);
    assert.match(wrapper, /soundTabRequest = null/);
    assert.match(wrapper, /\.catch\(error => \{[\s\S]*soundTabRequest = null;[\s\S]*throw error;/);
    assert.match(wrapper, /getDerivedStateFromError/);
    assert.match(wrapper, /Retry sound editor/);
    assert.match(wrapper, /data-sound-tab-loading/);
    assert.match(sharedAudio,
        /if \(!AUDIO_CONTEXT && initAudioContext\) \{\s*return initAudioContext\(\);/,
        'a module loaded after the opening gesture must initialize audio on first use');
    assert.match(browserGate, /baselineRun = 34055140364/);
    assert.match(browserGate, /relativeLimitMs = 150/);
    assert.match(browserGate, /121\.6–136\.4 ms/);
    assert.match(browserGate, /maxLongTaskMs = 100/);
    assert.match(browserGate, /minimumEncodedBytes = 20480/);
    assert.match(receiptGate, /soundTabScripts\.length !== 1/);
    assert.match(browserGate, /\[role="tab"\]\:visible/);
    assert.match(browserGate, /getAttribute\('aria-controls'\)/);
    assert.doesNotMatch(browserGate, /querySelector\(`\[role="tab"\]\[aria-controls=/,
        'a DOM id must not be interpolated into a CSS selector');
    assert.match(browserGate, /panel\.locator\('button\[aria-label="Choose a Sound"\]'\)\.first\(\)/);
    assert.match(browserGate, /receipt\.failure = failure/);
    assert.match(browserGate, /diagnosticError: String/);
    assert.match(browserGate, /writeFile\(path\.join\(output, 'receipt\.json'\)/);
    assert.match(browserGate, /receipt\.causalEncodedBytes = receipt\.scripts\.reduce/);
    assert.equal((browserGate.match(/requestAnimationFrame\(\(\) => requestAnimationFrame/g) || []).length, 1,
        'receipt collection must own the one two-frame settle; a second wait inflates measured latency');
});

const validReceipt = () => ({
    errors: [], failure: null, loadError: null,
    tab: {visible: true, exactName: true, ariaControls: 'sound-panel'},
    panel: {id: 'sound-panel', selected: true, soundControls: 5},
    durationMs: 200, relativeLimitMs: 236.325, absoluteLimitMs: 1000,
    longTasks: [], maxLongTaskMs: 100,
    scripts: [{name: 'sound-tab.js', encodedBodySize: 21000}],
    soundTabScripts: [{name: 'sound-tab.js', encodedBodySize: 21000}],
    causalEncodedBytes: 21000, minimumEncodedBytes: 20480
});

test('Sound receipt validation is mutation-sensitive to binding and complete causal payload', () => {
    assert.deepEqual(validateSoundTabReceipt(validReceipt()), []);
    const displaced = validReceipt();
    displaced.panel.id = 'other-panel';
    assert.match(validateSoundTabReceipt(displaced).join('\n'), /aria-controls/);
    const unnamed = validReceipt();
    unnamed.soundTabScripts = [];
    assert.match(validateSoundTabReceipt(unnamed).join('\n'), /one named sound-tab script/);
    const unrelatedPayload = validReceipt();
    unrelatedPayload.causalEncodedBytes = 999999;
    unrelatedPayload.soundTabScripts[0].encodedBodySize = 20479;
    assert.match(validateSoundTabReceipt(unrelatedPayload).join('\n'), /sound-tab moved only/);
    const timedOut = validReceipt();
    timedOut.failure = {stage: 'activate', message: 'timeout'};
    assert.match(validateSoundTabReceipt(timedOut).join('\n'), /activate: timeout/);
    for (const [field, value] of [
        ['durationMs', null], ['relativeLimitMs', Number.NaN],
        ['absoluteLimitMs', undefined], ['minimumEncodedBytes', 0]
    ]) {
        const malformed = validReceipt();
        malformed[field] = value;
        assert.match(validateSoundTabReceipt(malformed).join('\n'), new RegExp(field));
    }
    const malformedArrays = validReceipt();
    malformedArrays.scripts = null;
    malformedArrays.longTasks = [{ms: Number.NaN}];
    assert.match(validateSoundTabReceipt(malformedArrays).join('\n'), /causal scripts/);
    assert.match(validateSoundTabReceipt(malformedArrays).join('\n'), /long-task measurements/);
    const negativeMeasurements = validReceipt();
    negativeMeasurements.durationMs = -1;
    negativeMeasurements.causalEncodedBytes = -1;
    negativeMeasurements.longTasks = [{ms: -1}];
    negativeMeasurements.scripts = [{name: 'other.js', encodedBodySize: -1}];
    negativeMeasurements.soundTabScripts[0].encodedBodySize = -1;
    const negativeFailures = validateSoundTabReceipt(negativeMeasurements).join('\n');
    assert.match(negativeFailures, /durationMs/);
    assert.match(negativeFailures, /causalEncodedBytes/);
    assert.match(negativeFailures, /long-task measurements/);
    assert.match(negativeFailures, /causal scripts/);
    assert.match(negativeFailures, /named sound-tab encoded size/);
});
