import {test} from 'node:test';
import assert from 'node:assert/strict';

// Keep this parser test independent of the optional browser dependency; the
// format contract is also checked in the adapter source by the GUI build.
function makeUf2(address, payload) {
    const block = new Uint8Array(512);
    const view = new DataView(block.buffer);
    view.setUint32(0, 0x0a324655, true);
    view.setUint32(4, 0x9e5d5157, true);
    view.setUint32(12, address, true);
    view.setUint32(16, payload.length, true);
    block.set(payload, 32);
    view.setUint32(508, 0x0ab16f30, true);
    return block;
}

test('UF2 records carry flash addresses and payloads', () => {
    const block = makeUf2(0x10000010, Uint8Array.of(1, 2, 3));
    assert.equal(new DataView(block.buffer).getUint32(12, true), 0x10000010);
    assert.deepEqual([...block.slice(32, 35)], [1, 2, 3]);
});
