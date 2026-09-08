import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

import {
    CIRCUIT_DEBUGGER_VIEW,
    setCircuitView,
    showCircuitDebugger
} from '../overlay/scratch-gui/src/lib/bw-debug/debug-view.js';

class TestEvent {
    constructor (type, init) {
        this.type = type;
        this.detail = init.detail;
    }
}

const harness = ({storageFailure = false} = {}) => {
    const writes = [];
    const events = [];
    return {
        writes,
        events,
        options: {
            storage: {setItem (key, value) {
                if (storageFailure) throw new Error('storage denied');
                writes.push([key, value]);
            }},
            eventTarget: {dispatchEvent: event => events.push(event)},
            EventClass: TestEvent
        }
    };
};

const pairedSource = relative => [
    readFileSync(new URL(`../overlay/scratch-gui/src/${relative}`, import.meta.url)),
    readFileSync(new URL(`../packages/scratch-gui/src/${relative}`, import.meta.url))
];

test('all three debugger-discoverability sources are byte-identical in both tracked trees', () => {
    for (const relative of [
        'components/stage-header/stage-header.jsx',
        'components/tw-pseudocode/pseudocode-importer.jsx',
        'lib/bw-debug/debug-view.js'
    ]) {
        const [overlay, packaged] = pairedSource(relative);
        assert.equal(Buffer.compare(overlay, packaged), 0, `${relative} mirror differs`);
    }
});

test('showCircuitDebugger publishes the complete existing right-pane transaction', () => {
    const h = harness();
    showCircuitDebugger(h.options);
    const expected = Object.entries(CIRCUIT_DEBUGGER_VIEW);
    assert.deepEqual(h.writes, expected);
    assert.deepEqual(h.events.map(event => [event.type, event.detail.key, event.detail.value]),
        expected.map(([key, value]) => ['bw-settings-change', key, value]));
});

test('private-storage failure does not prevent the live debugger request', () => {
    const h = harness({storageFailure: true});
    showCircuitDebugger(h.options);
    assert.deepEqual(h.writes, []);
    assert.deepEqual(h.events.map(event => [event.detail.key, event.detail.value]),
        Object.entries(CIRCUIT_DEBUGGER_VIEW));
});

test('the shared circuit-view transaction preserves non-debugger views', () => {
    const h = harness();
    setCircuitView({fullWidth: false, dock: 'top'}, h.options);
    assert.deepEqual(Object.fromEntries(h.writes), {
        'bw-hide-stage': '0',
        'bw-right-pane-hidden': '0',
        'bw-debug-dock': 'top',
        'bw-stage-circuit': '0',
        'bw-circuit-theme': 'light'
    });
});

test('the Code entry point requests the owner; it does not construct debugger state', () => {
    const importer = readFileSync(new URL(
        '../overlay/scratch-gui/src/components/tw-pseudocode/pseudocode-importer.jsx', import.meta.url), 'utf8');
    const stageHeader = readFileSync(new URL(
        '../overlay/scratch-gui/src/components/stage-header/stage-header.jsx', import.meta.url), 'utf8');
    const helper = readFileSync(new URL(
        '../overlay/scratch-gui/src/lib/bw-debug/debug-view.js', import.meta.url), 'utf8');
    assert.equal((importer.match(/data-testid="bw-open-circuit-debugger"/g) || []).length, 1);
    assert.match(importer, /onClick=\{\(\) => showCircuitDebugger\(\)\}/);
    assert.match(stageHeader, /import \{setCircuitView\} from '..\/..\/lib\/bw-debug\/debug-view\.js'/);
    assert.doesNotMatch(importer, /createDebugRunner|<DebugPanel|createPortal|debugState\s*[:=]/);
    assert.doesNotMatch(helper, /createDebugRunner\s*\(|<DebugPanel|ReactDOM|connect\s*\(/);
});

test('the hosted Code-entry proof selects the real DebugPanel marker', () => {
    const panel = readFileSync(new URL(
        '../overlay/scratch-gui/src/components/tw-pseudocode/debug-panel.jsx', import.meta.url), 'utf8');
    const browser = readFileSync(new URL(
        '../scripts/verify-debug-dock.mjs', import.meta.url), 'utf8');
    assert.match(panel, /<div data-debug-panel data-debug-phase=\{phase\}/,
        'DebugPanel must publish the marker and phase consumed by the hosted proof');
    assert.match(browser, /host\.querySelector\('\[data-debug-panel\]'\)/);
    assert.match(browser, /host\.querySelectorAll\('\[data-debug-panel\]'\)\.length/,
        'the single-panel assertion must count real panels inside the persistent host');
    assert.match(browser, /\[data-debug-panel\] \[data-debug-run\]:visible/);
    assert.match(browser, /phase === 'running' \|\| phase === 'error'/,
        'the hosted proof must stop early on a terminal build error');
    assert.match(browser, /\{timeout: 60000\}/,
        'hosted compilation gets a bounded minute before the proof diagnoses it');
    assert.match(browser, /phase: panel\?\.dataset\.debugPhase \|\| null/);
    assert.match(browser, /panelText: panel\?\.innerText\?\.trim\(\)\.slice\(0, 4000\) \|\| null/,
        'failure evidence must report bounded visible panel text without guessing at nested status markup');
    assert.doesNotMatch(browser, /panel\?\.querySelector\('strong'\)/,
        'nested debugger tools also contain strong elements and are not the phase status');
    assert.match(browser, /runDisabled: panel\?\.querySelector\('\[data-debug-run\]'\)\?\.disabled \?\? null/);
    assert.match(browser, /startState\.phase === 'running'/,
        'diagnostic capture must not weaken the required running outcome');
    assert.doesNotMatch(browser, /\[data-debugger-panel\]/,
        'the CircuitDesigner wrapper is absent from the solo Code view');
});
