import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const read = filename => readFileSync(new URL(`../${filename}`, import.meta.url), 'utf8');

test('the Sounds route owns one retryable demand-loaded module', () => {
    const gui = read('overlay/scratch-gui/src/components/gui/gui.jsx');
    const wrapper = read('overlay/scratch-gui/src/containers/lazy-sound-tab.jsx');
    const browserGate = read('scripts/verify-sound-tab-activation.mjs');

    assert.doesNotMatch(gui, /import SoundTab from/);
    assert.match(gui, /soundsTabVisible \? <LazySoundTab vm=\{vm\} \/>/);
    assert.match(wrapper, /webpackChunkName: "sound-tab"/);
    assert.match(wrapper, /soundTabRequest = null/);
    assert.match(wrapper, /\.catch\(error => \{[\s\S]*soundTabRequest = null;[\s\S]*throw error;/);
    assert.match(wrapper, /getDerivedStateFromError/);
    assert.match(wrapper, /Retry sound editor/);
    assert.match(wrapper, /data-sound-tab-loading/);
    assert.match(browserGate, /baselineRun = 34051772854/);
    assert.match(browserGate, /relativeLimitMs = 236\.325/);
    assert.match(browserGate, /maxLongTaskMs = 100/);
    assert.match(browserGate, /minimumEncodedBytes = 20480/);
    assert.match(browserGate, /soundTabScripts\.length !== 1/);
});
