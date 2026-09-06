import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const read = filename => readFileSync(new URL(`../${filename}`, import.meta.url), 'utf8');

test('the connection modal owns one retryable demand-loaded route', () => {
    const gui = read('overlay/scratch-gui/src/components/gui/gui.jsx');
    const wrapper = read('overlay/scratch-gui/src/containers/lazy-connection-modal.jsx');
    const modal = read('packages/scratch-gui/src/containers/connection-modal.jsx');
    const browserGate = read('scripts/verify-connection-modal-activation.mjs');

    assert.doesNotMatch(gui, /import ConnectionModal from/);
    assert.match(gui, /connectionModalVisible \? \([\s\S]*<LazyConnectionModal[\s\S]*vm=\{vm\}/);
    assert.match(wrapper, /webpackChunkName: "connection-modal"/);
    assert.equal((wrapper.match(/webpackChunkName:/g) || []).length, 1,
        'opening the modal should require one activation request');
    assert.match(wrapper, /connectionModalRequest = null/);
    assert.match(wrapper, /\.catch\(error => \{[\s\S]*connectionModalRequest = null;[\s\S]*throw error;/);
    assert.match(wrapper, /getDerivedStateFromError/);
    assert.match(wrapper, /data-connection-modal-loading/);
    assert.match(wrapper, /data-connection-modal-load-error/);
    assert.match(wrapper, /closeConnectionModal/);
    assert.match(wrapper, /id="connectionModal"/);
    assert.match(modal, /from '\.\.\/lib\/microbit-update'/,
        'the updater stays in the modal chunk so WebUSB starts directly from its user gesture');
    assert.match(browserGate, /baselineRun = 34056846253/);
    assert.match(browserGate, /relativeLimitMs = 105\.92/);
    assert.match(browserGate, /maxLongTaskMs = 100/);
    assert.match(browserGate, /connectionModalScripts\.length !== 1/);
    assert.match(browserGate, /reopening the Connection modal downloaded its module again/);
    assert.match(browserGate, /navigator\.userActivation\?\.isActive === true/);
    assert.match(browserGate, /firmware failure\/retry did not retain transient WebUSB activation/);
    assert.match(browserGate, /Retry connection tools/);
    assert.match(browserGate, /closing before Connection-modal resolution left stale UI/);
});
