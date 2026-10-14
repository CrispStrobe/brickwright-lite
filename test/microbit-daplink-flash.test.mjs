/**
 * micro:bit V2 flashing over CMSIS-DAP / WebUSB (N9), against a MOCK DAP.
 *
 * flashDaplinkMicrobit reuses the CmsisDap + SwdMem transport flashSwdStm32
 * uses; only the flash-controller registers differ. A real board is manual and
 * recorded — this replays the CMSIS-DAP transfer sequence a fake USB device
 * captures and asserts the EXACT nRF52833 NVMC erase and program commands, so a
 * wrong register address or page size is red. It also proves the target-ID
 * check refuses by name when the part read back is not the nRF52833's.
 *
 * flasher.js is pure (it touches navigator/USB only inside the functions), so
 * this runs in node with no DOM.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {flashDaplinkMicrobit} from '../overlay/scratch-gui/src/lib/flasher.js';

// nRF52833 register addresses the algorithm must use, asserted here so a typo is
// red (these are the datasheet values, independent of the source constants).
const DHCSR = 0xe000edf0, AIRCR = 0xe000ed0c;
const NVMC_CONFIG = 0x4001e504, NVMC_ERASEPAGE = 0x4001e508;
const WEN_EEN = 2, WEN_WEN = 1, WEN_REN = 0;

/** One Intel HEX data record (addr, bytes) with its checksum, plus EOF. */
function intelHex (addr, bytes) {
    const rec = (count, a, type, data) => {
        const octs = [count, (a >> 8) & 0xff, a & 0xff, type, ...data];
        const sum = octs.reduce((s, b) => (s + b) & 0xff, 0);
        return ':' + [...octs, (-sum) & 0xff].map(b => b.toString(16).padStart(2, '0').toUpperCase()).join('');
    };
    return rec(bytes.length, addr, 0, bytes) + '\n' + ':00000001FF\n';
}

/**
 * A fake CMSIS-DAP WebUSB device. It answers the DAP protocol CmsisDap speaks
 * and records every AP memory WRITE as {addr, value}, resolving reads from a
 * tiny memory model (NVMC READY = 1, FICR.INFO.PART = `part`).
 */
function mockDap ({part = 0x52833} = {}) {
    const writes = [];
    let lastTar = 0;
    let reply = new Uint8Array([0]);
    const memRead = (addr) => (addr === 0x4001e400 ? 1 : addr === 0x10000100 ? part : 0);
    const onCmd = (data) => {
        const op = data[0];
        if (op !== 0x05) { reply = new Uint8Array([op, 0x00]); return; }   // CONNECT/SWJ/config → ack
        const req = data[3];
        const rnw = req & 0x02, apndp = req & 0x01, regA = ((req >> 2) & 0x3) << 2;
        if (!rnw) {
            const val = (data[4] | (data[5] << 8) | (data[6] << 16) | (data[7] << 24)) >>> 0;
            if (apndp && regA === 0x04) lastTar = val;                     // AP TAR
            else if (apndp && regA === 0x0c) writes.push({addr: lastTar, value: val}); // AP DRW write
            reply = new Uint8Array([op, 0x01, 0x01]);                      // count 1, ACK OK
        } else {
            let v = 0;
            if (apndp && regA === 0x0c) v = memRead(lastTar) >>> 0;        // AP DRW read
            else if (!apndp && regA === 0x00) v = 0x2ba01477;             // DP IDCODE
            else if (!apndp && regA === 0x04) v = 0xf0000000;             // DP CTRL/STAT power-ack
            reply = new Uint8Array([op, 0x01, 0x01, v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff]);
        }
    };
    const device = {
        configuration: {interfaces: [{interfaceNumber: 0, alternate: {endpoints: [
            {direction: 'out', type: 'bulk', endpointNumber: 1},
            {direction: 'in', type: 'bulk', endpointNumber: 1}
        ]}}]},
        async open () {}, async selectConfiguration () {}, async claimInterface () {}, async close () {},
        async transferOut (ep, data) { onCmd(new Uint8Array(data.buffer ? data.buffer : data)); return {status: 'ok'}; },
        async transferIn () { return {data: {buffer: reply.buffer}}; }
    };
    return {device, writes};
}

const hasWrite = (writes, addr, value) => writes.some(w => w.addr === addr && (value === undefined || w.value === value));

test('flashing an nRF52833 issues the exact NVMC erase + program sequence', async () => {
    const {device, writes} = mockDap();
    // 8 bytes at flash 0 — one page, two program words.
    const hex = intelHex(0, [0xde, 0xad, 0xbe, 0xef, 0x01, 0x02, 0x03, 0x04]);
    const r = await flashDaplinkMicrobit(device, hex);
    assert.equal(r.part, 0x52833);

    assert.ok(hasWrite(writes, DHCSR, 0xa05f0003), 'the core was not halted (DHCSR key|C_DEBUGEN|C_HALT)');
    assert.ok(hasWrite(writes, NVMC_CONFIG, WEN_EEN), 'NVMC was not put in erase mode (CONFIG=2)');
    assert.ok(hasWrite(writes, NVMC_ERASEPAGE, 0x0), 'page 0 was not erased (ERASEPAGE=0)');
    assert.ok(hasWrite(writes, NVMC_CONFIG, WEN_WEN), 'NVMC was not put in write mode (CONFIG=1)');
    assert.ok(hasWrite(writes, 0x0, 0xefbeadde), 'the first flash word was not programmed little-endian');
    assert.ok(hasWrite(writes, 0x4, 0x04030201), 'the second flash word was not programmed');
    assert.ok(hasWrite(writes, NVMC_CONFIG, WEN_REN), 'NVMC was not returned to read-only (CONFIG=0)');
    assert.ok(hasWrite(writes, AIRCR, 0x05fa0004), 'the core was not reset (AIRCR key|SYSRESETREQ)');

    // Order: erase-enable precedes the erase, write-enable precedes the words.
    const idx = (a, v) => writes.findIndex(w => w.addr === a && w.value === v);
    assert.ok(idx(NVMC_CONFIG, WEN_EEN) < idx(NVMC_ERASEPAGE, 0), 'erased before enabling erase');
    assert.ok(idx(NVMC_CONFIG, WEN_WEN) < idx(0x0, 0xefbeadde), 'programmed before enabling write');
});

test('a large image erases every 4 KiB page it touches', async () => {
    const {device, writes} = mockDap();
    // bytes at 0 and at 0x1000 -> two pages must be erased.
    const hex = intelHex(0x0000, [0xaa, 0xbb, 0xcc, 0xdd]).replace(':00000001FF\n', '')
        + intelHex(0x1000, [0x11, 0x22, 0x33, 0x44]);
    await flashDaplinkMicrobit(device, hex);
    assert.ok(hasWrite(writes, NVMC_ERASEPAGE, 0x0000), 'page at 0x0000 not erased');
    assert.ok(hasWrite(writes, NVMC_ERASEPAGE, 0x1000), 'page at 0x1000 not erased');
});

test('a target that is not an nRF52833 is refused by name — NVMC is never touched', async () => {
    const {device, writes} = mockDap({part: 0x00051822});   // an nRF51822, say
    await assert.rejects(
        () => flashDaplinkMicrobit(device, intelHex(0, [1, 2, 3, 4])),
        /not an nRF52833.*micro:bit V2 only/s,
        'the wrong target was flashed instead of refused');
    // Nothing was erased or programmed on the wrong part.
    assert.ok(!hasWrite(writes, NVMC_CONFIG, WEN_EEN) && !hasWrite(writes, NVMC_ERASEPAGE),
        'the refusal still issued NVMC erase commands — it must stop at the ID read');
});
