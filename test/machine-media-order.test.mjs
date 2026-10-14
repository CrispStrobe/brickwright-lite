import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import test from 'node:test';

const panelPath = join(import.meta.dirname, '..', 'overlay', 'scratch-gui', 'src',
    'components', 'tw-pseudocode', 'debug-panel.jsx');

const extractMachineHandler = () => {
    const source = readFileSync(panelPath, 'utf8');
    const signature = '_onMachineExtracted (e) {';
    const start = source.indexOf(signature);
    const end = source.indexOf('\n    }\n\n    /** Machine Loader', start);
    assert.ok(start >= 0 && end > start, 'machine extraction handler is missing');
    const bodyStart = start + signature.length;
    // Execute the body copied from the shipped component. A hand-written mock
    // of the rule would keep passing if the component regressed again.
    // eslint-disable-next-line no-new-func
    return new Function('e', source.slice(bodyStart, end));
};

test('building machine wiring does not discard a ROM loaded by the example', () => {
    const rom = {slot: 'rom', bytes: Uint8Array.from([0xea, 0x4c, 0x00, 0x80])};
    const panel = {
        _bootMedia: rom,
        state: {kind: 'emulator'},
        _teardownRunner () { this.tornDown = true; },
        setState (next) { this.state = {...this.state, ...next}; },
    };

    extractMachineHandler().call(panel, {
        detail: {kind: 'eater6502', config: {regions: [{kind: 'rom'}]}},
    });

    assert.equal(panel._bootMedia, rom, 'the current image must survive re-extraction');
    assert.equal(panel.tornDown, true, 'the old runner must still be replaced');
    assert.equal(panel.state.kind, 'eater6502');
    assert.deepEqual(panel.state.machineConfig, {regions: [{kind: 'rom'}]});
    assert.match(panel.state.ui.message, /loaded program ready/);
});

test('a machine with no image still asks the learner to load one', () => {
    const panel = {
        _bootMedia: null,
        state: {kind: 'emulator'},
        _teardownRunner () {},
        setState (next) { this.state = {...this.state, ...next}; },
    };

    extractMachineHandler().call(panel, {
        detail: {kind: '6502', config: {regions: []}},
    });

    assert.match(panel.state.ui.message, /load a program/);
});
