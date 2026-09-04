import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {
    normalizeDeviceId,
    resolveExampleBench
} from '../overlay/scratch-gui/src/lib/example-bench.js';

const example = {
    id: 'comparator',
    files: {circuit: '17-comparator/circuit.json'},
    benches: {'arduino-uno': '17-comparator/circuit.arduino-uno.json'}
};

test('device ids normalize consistently across catalog and program dialects', () => {
    assert.equal(normalizeDeviceId('Arduino_Uno'), 'arduino-uno');
});

test('authored device always keeps the curated circuit', () => {
    assert.deepEqual(resolveExampleBench(example, 'arduino_uno', 'ARDUINO-UNO'), {
        path: '17-comparator/circuit.json', retargeted: false
    });
});

test('retarget uses a normalized matching bench', () => {
    assert.deepEqual(resolveExampleBench(example, 'ARDUINO_UNO', 'stc12c5a60s2'), {
        path: '17-comparator/circuit.arduino-uno.json', retargeted: true
    });
});

test('retarget refuses instead of pairing a new program with the authored circuit', () => {
    const resolved = resolveExampleBench(example, 'pico', 'stc12c5a60s2');
    assert.equal(resolved.path, null);
    assert.equal(resolved.retargeted, true);
    assert.match(resolved.error, /matching circuit bench is not available/);
});

test('device switching refuses before committing firmware when its reseated bench is unavailable', () => {
    const importer = readFileSync(resolve('overlay/scratch-gui/src/components/tw-pseudocode/pseudocode-importer.jsx'), 'utf8');
    const setDevice = importer.slice(importer.indexOf('async setDevice (deviceId)'), importer.indexOf('async setDevice (deviceId)') + 6500);
    assert.match(setDevice, /resolveExampleBench\(ex, deviceId, sourceDevice\)/);
    assert.match(setDevice, /if \(resolvedBench && resolvedBench\.error\)/);
    assert.ok(setDevice.indexOf('if (resolvedBench && resolvedBench.error)') <
        setDevice.indexOf('buffers: {...this.state.buffers, pseudocode: result.pseudocode}'));
});
