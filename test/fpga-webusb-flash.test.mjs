/**
 * The WebUSB flashing SCAFFOLD. The one property that must never regress: it does
 * not pretend to flash. Everything else is the foundation (support detection, the
 * device picker) that has to be right before the real flasher is written.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {webUsbSupported, requestBoard, flashOverWebUsb, TANG_NANO_USB_FILTERS}
    from '../overlay/scratch-gui/src/lib/bw-fpga/webusb-flash.js';

test('flashOverWebUsb NEVER claims success — it is not implemented', async () => {
    const r = await flashOverWebUsb();
    assert.equal(r.ok, false, 'a scaffold that returned ok:true would be a lie about the hardware');
    assert.equal(r.code, 'not-implemented');
    // it must point at the routes that DO flash, so a caller degrades honestly
    assert.match(r.reason, /bw-fpga flash|openFPGALoader/);
});

test('webUsbSupported reflects navigator.usb', () => {
    // Injected, not swapped on the global: Node 22 ships a read-only `navigator`.
    assert.equal(webUsbSupported({usb: {}}), true);
    assert.equal(webUsbSupported({}), false);
    assert.equal(webUsbSupported(null), false);
});

test('requestBoard refuses by name where there is no WebUSB', async () => {
    const r = await requestBoard(null);
    assert.equal(r.ok, false);
    assert.equal(r.code, 'no-webusb');
});

test('requestBoard returns the picked device, and offers the Tang Nano filters', async () => {
    let seenFilters = null;
    const usb = {requestDevice: async ({filters}) => { seenFilters = filters; return {id: 'dev'}; }};
    const r = await requestBoard(usb);
    assert.equal(r.ok, true);
    assert.deepEqual(r.device, {id: 'dev'});
    assert.ok(seenFilters.length >= 1 && seenFilters.every(f => 'vendorId' in f),
        'the picker must be scoped to Tang Nano bridges');
});

test('a cancelled picker is a named refusal, not a throw', async () => {
    const usb = {requestDevice: async () => { throw new Error('No device selected.'); }};
    const r = await requestBoard(usb);
    assert.equal(r.ok, false);
    assert.equal(r.code, 'no-device');
    assert.match(r.reason, /No device/);
});

test('the filter list is non-empty and frozen (a starting set, kept honest)', () => {
    assert.ok(TANG_NANO_USB_FILTERS.length >= 1);
    assert.ok(Object.isFrozen(TANG_NANO_USB_FILTERS));
    assert.ok(TANG_NANO_USB_FILTERS.every(f => typeof f.vendorId === 'number'));
});
