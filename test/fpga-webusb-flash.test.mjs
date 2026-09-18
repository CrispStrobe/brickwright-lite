/**
 * The WebUSB flashing SCAFFOLD. The one property that must never regress: it does
 * not pretend to flash. Everything else is the foundation (support detection, the
 * device picker) that has to be right before the real flasher is written.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {webUsbSupported, requestBoard, flashOverWebUsb, TANG_NANO_USB_FILTERS,
    readGowinBitstream, GOWIN_MAGIC}
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

test('readGowinBitstream accepts a real-shaped .fs (padding ones, then the magic)', () => {
    const fs = '1111\n' + GOWIN_MAGIC + '\n0000111100001111\n';
    const r = readGowinBitstream(fs);
    assert.equal(r.ok, true);
    assert.equal(r.magicAt, 4, 'four ones of padding precede the magic');
    assert.equal(r.bits, 4 + GOWIN_MAGIC.length + 16, 'whitespace is ignored, all bits counted');
});

test('readGowinBitstream REFUSES what is not a Gowin bitstream — the board must never be handed it', () => {
    assert.equal(readGowinBitstream('').code, 'empty');
    assert.equal(readGowinBitstream('not a bitstream at all 0101').code, 'not-gowin');
    // magic present but the preamble is not all ones = malformed
    assert.equal(readGowinBitstream('1101' + GOWIN_MAGIC).code, 'bad-preamble');
});

test('the magic is 0xA5C3', () => {
    assert.equal(parseInt(GOWIN_MAGIC, 2), 0xA5C3);
    assert.equal(GOWIN_MAGIC.length, 16);
});
