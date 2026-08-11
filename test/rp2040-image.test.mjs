import {test} from 'node:test';
import assert from 'node:assert/strict';

import {parseUf2} from '../packages/scratch-gui/src/lib/bw-board/rp2040js-adapter.js';

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
    const image = parseUf2(block);
    assert.deepEqual([...image], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3]);
});

test('Pico adapter advances time before publishing its GPIO boundary', async () => {
    const {createRp2040jsAdapter} = await import('../packages/scratch-gui/src/lib/bw-board/rp2040js-adapter.js');
    const times = [];
    const edges = [];
    const board = {
        advanceTo: t => times.push(String(t)),
        setPin: (...edge) => edges.push(edge),
        readAnalog: () => 0,
    };
    const adapter = createRp2040jsAdapter({board});
    adapter.loadProgram(Uint8Array.of(0, 0, 0, 0));
    adapter.stepInstruction();
    assert.equal(adapter.stats.instructionCount, 1);
    assert.equal(adapter.timeNs() > 0n, true);
    assert.equal(edges.length > 0, true);
    assert.equal(times.length > 0, true);
});

test('Pico adapter loads and resets from a valid Cortex-M vector table', async () => {
    const {createRp2040jsAdapter} = await import('../packages/scratch-gui/src/lib/bw-board/rp2040js-adapter.js');
    const image = new Uint8Array(32);
    const view = new DataView(image.buffer);
    view.setUint32(0, 0x20040000, true);
    view.setUint32(4, 0x10000011, true);
    const adapter = createRp2040jsAdapter();
    adapter.loadProgram(image);
    assert.equal(adapter.rp2040.core.SP, 0x20040000);
    assert.equal(adapter.rp2040.core.PC, 0x10000010);
    adapter.rp2040.core.SP = 0x20000000;
    adapter.rp2040.core.PC = 0x10000020;
    adapter.reset();
    assert.equal(adapter.rp2040.core.SP, 0x20040000);
    assert.equal(adapter.rp2040.core.PC, 0x10000010);
});

test('board pin markers preserve Arduino and Pico pin vocabularies', async () => {
    const {default: SB3Creator} = await import('../packages/scratch-gui/src/lib/sb3-creator.js');
    const creator = new SB3Creator();
    const markers = creator.stcStructMarkers({
        stc: {
            device: 'pico',
            pins: [
                {name: 'led', where: 'GP25', direction: 'output', activeLow: false},
                {name: 'button', where: 'GP14', direction: 'input', activeLow: true},
            ],
        },
    });
    assert.deepEqual(markers, [
        'scratch.device("pico", undefined)',
        'scratch.pin("led", "GP25", "output", 0)',
        'scratch.pin("button", "GP14", "input", 1)',
    ]);
});
