/**
 * stc12live control writes — the host->chip primitive the tethered Controller
 * panel drives a real STC12 with. Encodes LIVE_CMD_WRITE(space, addr_hi,
 * addr_lo, data...) per live-proto.h. We eval the extension source with a mock
 * Scratch, capture the registered instance, and mock _exchange to assert the
 * exact (cmd, payload) a WRITE sends — no serial hardware needed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bundleSource } from '../scripts/spike/bundled-upstream.mjs';

// The body used to be sliced from between the first and last backtick, which
// assumed the bundle was `makeExt(`…`)`. It is `makeExt("…")` now, and more to
// the point a test should not know which: that encoding ended the template
// early twice — 711e4744f and 2258847c1 are both "URGENT/fix: a backtick broke
// the build". bundleSource asks the module what it holds instead of reading
// its punctuation, so this no longer has an opinion about either.
const body = bundleSource('stc12live');

function loadInstance() {
    let inst = null;
    const Scratch = {
        extensions: { register(x) { inst = x; }, unsandboxed: true },
        translate: (o) => (o && o.default) || o,
        BlockType: {}, ArgumentType: {}, TargetType: {},
    };
    // eslint-disable-next-line no-new-func
    new Function('Scratch', body)(Scratch);
    return inst;
}

test('setBit encodes LIVE_CMD_WRITE to the BIT space (0x03, [4, hi, lo, 1])', async () => {
    const ext = loadInstance();
    ext._connected = true;
    ext._capabilities = { writable: 0xff };   // all spaces writable
    let sent = null;
    ext._exchange = (cmd, payload) => { sent = { cmd, payload }; return Promise.resolve([]); };

    await ext.setBit(0x0090, true);
    assert.equal(sent.cmd, 0x03, 'LIVE_CMD_WRITE');
    assert.deepEqual(sent.payload, [4, 0x00, 0x90, 1], 'space=BIT, addr, data=on');

    await ext.setBit(0x0090, false);
    assert.deepEqual(sent.payload, [4, 0x00, 0x90, 0], 'off');
});

test('writeSfr encodes to the SFR space; writeMem splits a 16-bit address', async () => {
    const ext = loadInstance();
    ext._connected = true;
    ext._capabilities = { writable: 0xff };
    let sent = null;
    ext._exchange = (cmd, payload) => { sent = { cmd, payload }; return Promise.resolve([]); };

    await ext.writeSfr(0x80, 0xAA);            // P0 register := 0xAA
    assert.deepEqual(sent.payload, [2, 0x00, 0x80, 0xAA]);

    await ext.writeMem(3, 0x1234, [0xDE, 0xAD]); // XRAM, split addr, two bytes
    assert.deepEqual(sent.payload, [3, 0x12, 0x34, 0xDE, 0xAD]);
});

test('a write to a non-writable space fails loudly, not silently', async () => {
    const ext = loadInstance();
    ext._connected = true;
    ext._capabilities = { writable: 0b00000 };  // nothing writable
    ext._exchange = () => Promise.resolve([]);
    await assert.rejects(() => ext.setBit(0x90, true), /not writable/);
});

test('a write while disconnected refuses', async () => {
    const ext = loadInstance();
    ext._connected = false;
    await assert.rejects(() => ext.setBit(0x90, true), /not connected/);
});
