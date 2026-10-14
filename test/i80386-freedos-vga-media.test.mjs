import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDebugTarget, applyMedia} from 'bw-board';
import {localFreedosVgaMachine} from '../overlay/scratch-gui/src/lib/bw-machines/local-freedos-vga.js';
import {runMachineConfig} from '../overlay/scratch-gui/src/lib/bw-machines/run-machine.js';

const file = (name, size) => ({name, size});
const HDD_BYTES = 306 * 4 * 17 * 512;
const FLOPPY_BYTES = 80 * 2 * 15 * 512;

test('named FreeDOS VGA route carries four selected media to the board loader', async () => {
    const cfg = localFreedosVgaMachine({hdd: file('disk.img', HDD_BYTES),
        floppy: file('boot.img', FLOPPY_BYTES), bios: file('bios.rom', 65536),
        vgaRom: file('vga.rom', 38400)});
    const images = {
        hdd: new Uint8Array(HDD_BYTES), floppy: new Uint8Array(FLOPPY_BYTES),
        bios: new Uint8Array(65536), 'vga-rom': new Uint8Array(38400)
    };
    images.bios[0xfff0] = 0xea;
    images['vga-rom'][38399] = 0x5a;
    images.floppy[0] = 0xeb;
    images.hdd[0] = 0xfa;
    let detail;
    await runMachineConfig(cfg, {fetcher: async ref => ({
        bytes: images[ref.url.slice('local-media:'.length)]
    }), dispatch: value => { detail = value; }});
    assert.equal(detail.kind, 'i80386');
    assert.equal(detail.machinePreset, 'freedos-vga');
    assert.equal(detail.slotId, 'floppy');
    assert.deepEqual(detail.geometry, {cylinders: 80, heads: 2, sectors: 15,
        bytesPerSector: 512});
    assert.equal(detail.widgets[0].source, 'video');
    assert.strictEqual(detail.bytes, images.floppy);
    assert.strictEqual(detail.i80386Media.bios, images.bios);
    assert.strictEqual(detail.i80386Media['vga-rom'], images['vga-rom']);
    assert.strictEqual(detail.i80386Media.hdd, images.hdd);
    const {target, adapter} = await createDebugTarget('i80386', {
        profile: detail.machinePreset
    });
    assert.equal(adapter.machine.canTakeMouse(), true,
        'the named browser profile exposes the PS/2 mouse used by Widgets');
    const entries = {...detail.i80386Media, [detail.slotId]: detail.bytes};
    const applied = applyMedia({kind: 'i80386', adapter, machine: adapter.machine}, entries);
    assert.deepEqual(applied.errors, []);
    assert.deepEqual(applied.applied.sort(), ['bios', 'floppy', 'hdd', 'vga-rom']);
    adapter.machine.reset();
    assert.equal(adapter.machine._read386(0xffff0), 0xea);
    assert.equal(adapter.machine._read386(0xc0000 + 38399), 0x5a);
    assert.equal(adapter.machine.chips.fdc1.drives[0].image[0], 0xeb);
    assert.equal(adapter.machine.ata.mediaBytes()[0], 0xfa);
    assert.ok(target.video());
});

test('named profile refuses non-type-1 HDD and malformed floppy before boot', () => {
    assert.throws(() => localFreedosVgaMachine({hdd: file('other.img', 4 * 17 * 512)}),
        /306×4×17/);
    assert.throws(() => localFreedosVgaMachine({floppy: file('bad.img', 1474560)}),
        /360KB or 1.2MB/);
});

test('existing arbitrary-CHS DOSBox boot keeps its custom config path', async () => {
    const {localDosboxMachine} = await import('../overlay/scratch-gui/src/lib/bw-machines/local-dosbox.js');
    const cfg = localDosboxMachine({fileName: 'disk.img', byteLength: 1000 * 4 * 17 * 512});
    let detail;
    await runMachineConfig(cfg, {fetcher: async () => ({bytes: new Uint8Array(1000 * 4 * 17 * 512)}),
        dispatch: value => { detail = value; }});
    assert.equal(detail.machinePreset, null);
    assert.deepEqual(detail.geometry, {cylinders: 1000, heads: 4, sectors: 17});
});

test('legacy 386 activation does not fetch an unused companion disk', async () => {
    const {newMachineConfig} = await import('../overlay/scratch-gui/src/lib/bw-machines/machine-config.js');
    const cfg = newMachineConfig({machine: 'i80386', bios: {kind: 'bochs-lgpl'},
        slots: {hdd: {url: 'primary.img'}, floppy: {url: 'unused.img'}},
        bootOrder: ['hdd', 'floppy']});
    const fetched = [];
    await runMachineConfig(cfg, {fetcher: async ref => {
        fetched.push(ref.url);
        return {bytes: Uint8Array.of(0)};
    }, dispatch() {}});
    assert.deepEqual(fetched, ['primary.img']);
});

test('GUI event and runner preserve the named profile and all media slots', () => {
    const panel = readFileSync(new URL('../overlay/scratch-gui/src/components/tw-pseudocode/debug-panel.jsx', import.meta.url), 'utf8');
    const runner = readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-debug/debug-runner.js', import.meta.url), 'utf8');
    assert.match(panel, /machinePreset: kind === 'i80386'/);
    assert.match(panel, /i80386Media: kind === 'i80386'/);
    assert.match(runner, /profile: 'freedos-vga'/);
    assert.match(runner, /applyMedia\(\{kind: 'i80386', adapter: result.adapter, machine\}, entries\)/);
});

test('named browser run waits for attach completion and exposes a later failure', async () => {
    const cfg = localFreedosVgaMachine({floppy: file('boot.img', FLOPPY_BYTES)});
    const fetcher = async () => ({bytes: new Uint8Array(FLOPPY_BYTES)});
    let successDetail;
    await runMachineConfig(cfg, {fetcher, awaitBoot: true, dispatch: detail => {
        successDetail = detail;
        queueMicrotask(() => detail.bootCompletion.resolve());
    }});
    assert.equal(successDetail.bootCompletion, undefined,
        'the completion callback must not remain in the retained event');

    await assert.rejects(runMachineConfig(cfg, {fetcher, awaitBoot: true,
        dispatch: detail => queueMicrotask(() =>
            detail.bootCompletion.reject(new Error('VGA ROM could not attach')))}),
    /VGA ROM could not attach/);
});
