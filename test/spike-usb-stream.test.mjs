import test from 'node:test';
import assert from 'node:assert/strict';
import {compileSpikeUsbLine, runSpikeUsbBridge} from '../overlay/scratch-gui/src/lib/spike-usb-stream.js';

test('SPIKE USB pseudocode compiles motor steps and rejects sensor ports', () => {
    const types = {A: 75, B: 63, F: 38};
    const speeds = {A: 30, F: 30};
    assert.equal(compileSpikeUsbLine('DEVICE SPIKE', speeds, types), null);
    assert.equal(compileSpikeUsbLine('WHEN flag clicked:', speeds, types), null);
    assert.deepEqual(compileSpikeUsbLine('set motor speed F 25', speeds, types), ["print('SPEED F 25')", 0]);
    assert.deepEqual(compileSpikeUsbLine('run motor F backward 0.6 seconds', speeds, types), [
        'import time; hub.port.F.motor.pwm(-25); time.sleep_ms(600); hub.port.F.motor.float()', 0.6
    ]);
    assert.throws(() => compileSpikeUsbLine('start motor B forward', speeds, types), /not a motor/);
    assert.throws(() => compileSpikeUsbLine('run motor A forward 11 seconds', speeds, types), /at most 10/);
    assert.throws(() => compileSpikeUsbLine('display text "x"; import os', speeds, types), /Unsupported/);
});

test('SPIKE USB WLAN route hands the source and token to the native app', async () => {
    const previous = globalThis.window;
    let call;
    globalThis.window = {__TAURI__: {core: {invoke: async (...args) => {
        call = args;
        return {firmware: '3.2.36', ports: {F: 38}, lines: []};
    }}}};
    try {
        const result = await runSpikeUsbBridge('start motor F forward', 'http://mac.local:8765', 'secret');
        assert.equal(result.ports.F, 38);
        assert.deepEqual(call, ['spike_usb_bridge_run', {
            url: 'http://mac.local:8765', token: 'secret', source: 'start motor F forward'
        }]);
    } finally {
        globalThis.window = previous;
    }
});
