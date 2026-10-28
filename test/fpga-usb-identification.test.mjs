import test from 'node:test';
import assert from 'node:assert/strict';

import {describeUsbDevice, identifyTangNanoTransport, inspectGrantedUsbDevices}
    from '../overlay/scratch-gui/src/lib/bw-fpga/usb-identification.js';

test('0403:6010 identifies an FT2232-compatible protocol, never physical silicon', () => {
    const result = identifyTangNanoTransport({vendorId: 0x0403, productId: 0x6010});
    assert.equal(result.match, 'compatible');
    assert.equal(result.protocol, 'ft2232-compatible');
    assert.equal(result.physicalBridge, 'unknown');
});

test('manufacturer and product strings are evidence, not a silicon inference', () => {
    const result = identifyTangNanoTransport({
        vendorId: 0x0403,
        productId: 0x6010,
        manufacturerName: 'SIPEED',
        productName: 'FactoryAIOT Pro JTAG Debugger'
    });
    assert.equal(result.physicalBridge, 'unknown');
    assert.deepEqual(result.evidence, [
        'VID 0x0403',
        'PID 0x6010',
        'manufacturer SIPEED',
        'product FactoryAIOT Pro JTAG Debugger'
    ]);
});

test('broader picker identities remain ambiguous rather than becoming Tang boards', () => {
    for (const descriptor of [
        {vendorId: 0x0403, productId: 0x6011},
        {vendorId: 0x33aa, productId: 0x1234}
    ]) {
        const result = identifyTangNanoTransport(descriptor);
        assert.equal(result.match, 'ambiguous');
        assert.equal(result.protocol, null);
        assert.equal(result.physicalBridge, 'unknown');
    }
});

test('unrelated and incomplete descriptors are unsupported and normalized', () => {
    const descriptor = describeUsbDevice({vendorId: 0x0627, productId: 1, manufacturerName: ''});
    assert.deepEqual(descriptor, {
        vendorId: 0x0627,
        productId: 1,
        manufacturerName: null,
        productName: null,
        serialNumber: null
    });
    assert.equal(identifyTangNanoTransport(descriptor).match, 'unsupported');
    assert.equal(identifyTangNanoTransport({}).physicalBridge, 'unknown');
});

test('granted-device inspection calls getDevices only', async () => {
    const calls = [];
    const poison = () => { throw new Error('a state-changing USB method was called'); };
    const device = {
        vendorId: 0x0403,
        productId: 0x6010,
        manufacturerName: 'SIPEED',
        open: poison,
        selectConfiguration: poison,
        claimInterface: poison,
        controlTransferOut: poison,
        transferOut: poison
    };
    const usb = {
        getDevices: async () => {
            calls.push('getDevices');
            return [device];
        },
        requestDevice: poison
    };
    const result = await inspectGrantedUsbDevices(usb);
    assert.deepEqual(calls, ['getDevices']);
    assert.equal(result.ok, true);
    assert.equal(result.devices[0].protocol, 'ft2232-compatible');
    assert.equal(result.devices[0].physicalBridge, 'unknown');
});

test('inspection refuses by name without WebUSB and reports enumeration errors', async () => {
    assert.deepEqual(await inspectGrantedUsbDevices(null), {
        ok: false,
        code: 'no-webusb',
        reason: 'This environment cannot enumerate already-authorized WebUSB devices.'
    });
    const failed = await inspectGrantedUsbDevices({
        getDevices: async () => { throw new Error('permission database unavailable'); }
    });
    assert.equal(failed.ok, false);
    assert.equal(failed.code, 'enumeration-failed');
    assert.match(failed.reason, /permission database unavailable/);
});
