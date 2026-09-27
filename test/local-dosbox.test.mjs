import test from 'node:test';
import assert from 'node:assert/strict';
import {localDosboxMachine} from '../overlay/scratch-gui/src/lib/bw-machines/local-dosbox.js';
import {runMachineConfig} from '../overlay/scratch-gui/src/lib/bw-machines/run-machine.js';

const SIZE = 1000 * 4 * 17 * 512;

test('local 386 disk infers 1000/4/17 and boots through the media event', async () => {
    const cfg = localDosboxMachine({fileName: 'win311.img', byteLength: SIZE});
    const bytes = new Uint8Array(SIZE);
    const events = [];
    await runMachineConfig(cfg, {fetcher: async ref => {
        assert.equal(ref.url, 'local-media:disk');
        return {bytes};
    }, dispatch: detail => events.push(detail)});
    assert.equal(events.length, 1);
    assert.strictEqual(events[0].bytes, bytes);
    assert.deepEqual(events[0].geometry, {cylinders: 1000, heads: 4, sectors: 17});
    assert.equal(events[0].widgets[0].source, 'video');
});

test('DOSBox -size must agree with selected image', () => {
    const confText = '[cpu]\ncputype=386\n[autoexec]\nimgmount c disk.img -t hdd -size 512,17,4,615';
    assert.throws(() => localDosboxMachine({confText, fileName: 'win311.img', byteLength: SIZE}),
        /geometry does not match/);
});

test('local HDD uses the 386 AT with omitted, auto, or older DOSBox CPU settings', () => {
    for (const cpu of ['', '[cpu]\ncputype=auto\n', '[cpu]\ncputype=8086\n']) {
        const confText = `${cpu}[autoexec]\nimgmount c disk.img -t hdd -size 512,17,4,1000`;
        const cfg = localDosboxMachine({confText, fileName: 'win311.img', byteLength: SIZE});
        assert.equal(cfg.machine, 'i80386');
        assert.deepEqual(cfg.slots.hdd.geometry, {cylinders: 1000, heads: 4, sectors: 17});
    }
});

test('local HDD rejects CHS values beyond AT BIOS limits even when byte count matches', () => {
    for (const [sectors, heads, cylinders] of [[17, 4, 1025], [17, 17, 500], [64, 4, 500]]) {
        const confText = `[autoexec]\nimgmount c disk.img -t hdd -size 512,${sectors},${heads},${cylinders}`;
        assert.throws(() => localDosboxMachine({confText, fileName: 'disk.img',
            byteLength: sectors * heads * cylinders * 512}), /AT BIOS disk geometry/);
    }
});
