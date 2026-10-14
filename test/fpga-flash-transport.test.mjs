/**
 * TN4 native flash transport — fail-closed, and unit-testable without Tauri.
 *
 * Flashing needs the native app and a board on USB, so the JS half is exercised
 * with an injected invoke: the point under test is that a "Flash to board"
 * affordance is offered ONLY when the native side actually implements it, and
 * that the flash call names the right command and device.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';

import {probeFlash, flashBitstream, inTauri}
    from '../overlay/scratch-gui/src/lib/bw-fpga/fpga-tauri-transport.js';

test('in a browser (no Tauri) flashing is unavailable, and says why', async () => {
    assert.equal(inTauri(), false, 'the test runtime is not Tauri');
    const r = await probeFlash();               // no invokeImpl -> no Tauri
    assert.equal(r.available, false);
    assert.match(r.reason, /browser can only download/);
});

test('available only when the native side answers the probe true', async () => {
    const yes = await probeFlash({invokeImpl: async () => true});
    assert.equal(yes.available, true);
    const no = await probeFlash({invokeImpl: async () => false});
    assert.equal(no.available, false);
    assert.match(no.reason, /does not offer/);
});

test('an app without the command (probe throws) is unavailable, not a crash', async () => {
    const r = await probeFlash({invokeImpl: async () => { throw new Error('unknown command'); }});
    assert.equal(r.available, false);
    assert.match(r.reason, /does not expose/);
});

test('the probe names the device it is asking about', async () => {
    let askedWith = null;
    await probeFlash({invokeImpl: async (cmd, args) => { askedWith = {cmd, args}; return true; }});
    assert.equal(askedWith.cmd, 'fpga_flash_available');
    assert.equal(askedWith.args.device, 'tangnano20k');
});

test('flashBitstream calls the openFPGALoader command with the device and bytes', async () => {
    let call = null;
    const res = await flashBitstream('QUFBQQ==', {invokeImpl: async (cmd, args) => { call = {cmd, args}; return 'done'; }});
    assert.equal(res, 'done');
    assert.equal(call.cmd, 'fpga_flash_bitstream');
    assert.equal(call.args.device, 'tangnano20k');
    assert.equal(call.args.bitstreamBase64, 'QUFBQQ==');
});

test('flashing nothing is refused before it reaches the native side', async () => {
    let called = false;
    await assert.rejects(
        flashBitstream('', {invokeImpl: async () => { called = true; return 'x'; }}),
        /nothing to flash/);
    assert.equal(called, false);
});
