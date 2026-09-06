import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
    createFreshPicoEpoch,
    createPicoByteChannel
} from '../overlay/scratch-gui/src/lib/pico-sim-epoch.js';

function adapterFactory (created) {
    return options => {
        const adapter = {
            options,
            rp2040: {flash: new Uint8Array(8)},
            attachBoard (board) { this.board = board; },
            bootFromFlash (image) {
                this.bootImage = image;
                this.rp2040.flash.set(image);
            }
        };
        created.push(adapter);
        return adapter;
    };
}

test('a Pico reset replaces the SoC and preserves flash plus the external board', () => {
    const created = [];
    const board = {name: 'the live circuit'};
    const options = {clockHz: 125_000_000};
    const first = createFreshPicoEpoch({
        image: new Uint8Array([1, 2, 3, 4]),
        board,
        createAdapter: adapterFactory(created),
        adapterOptions: options
    });
    first.rp2040.flash[2] = 99; // a main.py filesystem write

    const second = createFreshPicoEpoch({
        previous: first,
        board,
        createAdapter: adapterFactory(created),
        adapterOptions: options
    });

    assert.notEqual(second, first, 'the old SoC was reused');
    assert.notEqual(second.rp2040, first.rp2040, 'peripherals survived reset');
    assert.equal(second.board, board, 'the external circuit board was replaced');
    assert.deepEqual([...second.rp2040.flash.slice(0, 4)], [1, 2, 99, 4]);
    first.rp2040.flash[2] = 7;
    assert.equal(second.rp2040.flash[2], 99, 'stale controller can mutate the new epoch');
    assert.equal(created.length, 2);
    assert.equal(second.options, options);
});

test('bootFromFlash owns the one required copy of the input image', () => {
    const image = new Uint8Array([8, 9]);
    const adapter = createFreshPicoEpoch({
        image,
        board: {},
        createAdapter: adapterFactory([])
    });
    image[0] = 0;
    assert.equal(adapter.rp2040.flash[0], 8);
});

test('a terminal emulator error rejects pending and future transport reads', async () => {
    const channel = createPicoByteChannel();
    const pending = channel.read();
    const failure = new Error('replacement failed');
    channel.fail(failure);
    await assert.rejects(pending, failure);
    await assert.rejects(channel.read(), failure);
});

test('an epoch transition clears stale bytes and releases its pending read', async () => {
    const channel = createPicoByteChannel();
    channel.append('old epoch');
    channel.clear();
    const waiting = channel.read();
    channel.append('new epoch');
    assert.equal(await waiting, 'new epoch');
});
