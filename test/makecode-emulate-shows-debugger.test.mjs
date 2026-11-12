// The ▶ Run on the emulated micro:bit V2 action hands its image to the Debug
// pane. From the Code tab that pane is visible only through the stage portal,
// so the action must turn the stage circuit on and pick a stage dock. Before
// this, a fresh profile (no dock stored, circuit off the stage) left the
// pane unmounted and the queued image unread (browser gate I6).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {showDebuggerOnStage} from '../overlay/scratch-gui/src/lib/bw-debug/show-debugger-on-stage.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const harness = initial => {
    const store = new Map(Object.entries(initial));
    const events = [];
    const storage = {getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v))};
    return {store, events, storage, dispatch: (key, value) => events.push([key, value])};
};

test('a fresh profile gets the circuit on the stage and the debugger docked right', () => {
    const h = harness({});
    assert.equal(showDebuggerOnStage(h), 'right');
    assert.equal(h.store.get('bw-stage-circuit'), '1');
    assert.equal(h.store.get('bw-debug-dock'), 'right');
    assert.equal(h.store.get('bw-right-pane-hidden'), '0');
    assert.deepEqual(h.events, [['bw-right-pane-hidden', '0'], ['bw-stage-circuit', '1'], ['bw-debug-dock', 'right']]);
});

test('docks that keep the panel inside the Circuit tab are moved to the stage', () => {
    for (const dock of ['top', 'off', 'makecode', 'microbit', 'controller']) {
        const h = harness({'bw-debug-dock': dock, 'bw-stage-circuit': '0'});
        assert.equal(showDebuggerOnStage(h), 'right', dock);
        assert.equal(h.store.get('bw-stage-circuit'), '1', dock);
    }
});

test('a solo debugger stays solo', () => {
    const h = harness({'bw-debug-dock': 'solo'});
    assert.equal(showDebuggerOnStage(h), 'solo');
    assert.equal(h.store.get('bw-stage-circuit'), '1');
});

test('blocked storage still announces every setting', () => {
    const events = [];
    const throwing = {getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }};
    assert.equal(showDebuggerOnStage({storage: throwing, dispatch: (k, v) => events.push([k, v])}), 'right');
    assert.equal(events.length, 3);
});

test('the emulate action shows the debugger before it queues the image', () => {
    for (const tree of ['overlay', 'packages']) {
        const source = readFileSync(resolve(root, tree, 'scratch-gui/src/components/tw-pseudocode/pseudocode-importer.jsx'), 'utf8');
        const start = source.indexOf('async runOnEmulatedMicrobit () {');
        assert.ok(start > 0, tree);
        const body = source.slice(start, source.indexOf('\n    }\n', start));
        const show = body.indexOf('showDebuggerOnStage(');
        const queue = body.indexOf("dispatchEvent(new CustomEvent('bw-asm-rom-ready'");
        assert.ok(show > 0 && queue > show, `${tree}: showDebuggerOnStage must run before bw-asm-rom-ready`);
    }
});
