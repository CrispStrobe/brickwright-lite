// The headless Machine Manager CLI (scripts/machine-manager.mjs) — a smoke test
// driving its injectable I/O, so the CLI half of "one schema reused by GUI +
// CLI" (design §2) is exercised, not merely present. This is also the module
// that makes lib/bw-machines/ a LIVE consumer graph rather than test-only code.
//
// The CLI's readFile/stdout are injectable, so no process spawn and no temp
// files: fixtures are served from a Map, output collected into a string.

import {test} from 'node:test';
import assert from 'node:assert/strict';

import {run} from '../scripts/machine-manager.mjs';
import {validateMachineConfig} from '../overlay/scratch-gui/src/lib/bw-machines/machine-config.js';

/** An I/O harness: `files` served to readFile by path; stdout/stderr collected. */
function harness(files = {}) {
    const io = {
        out: '', err: '',
        readFile: path => {
            if (!(path in files)) throw new Error(`no such file: ${path}`);
            return files[path];
        }
    };
    io.stdout = s => { io.out += s; };
    io.stderr = s => { io.err += s; };
    return io;
}

const parseOut = io => JSON.parse(io.out);

const elksManifest = JSON.stringify({
    title: 'ELKS 0.9.2', machine: 'i8086', machineConfig: 'PCXT8086',
    slots: {floppy: 'fd1440-fat.img'},
    floppy: {geometry: {cylinders: 80, heads: 2, sectors: 18, bytesPerSector: 512},
        quirks: ['at-floppy-drive-type']},
    boot: true
});

test('cli validate: exit 0 for a valid config, 1 for an invalid one', async () => {
    const good = harness({'ok.json': JSON.stringify({
        title: 'ELKS', executionMode: 'functional', machine: 'i8086',
        cpu: {variant: '8086'}, slots: {floppy: {url: 'a.img'}}
    })});
    assert.equal(await run(['validate', 'ok.json'], good), 0);
    assert.equal(parseOut(good).ok, true);

    const bad = harness({'bad.json': JSON.stringify({
        executionMode: 'wired', machine: 'eater6502'   // wired, no circuit.ref
    })});
    assert.equal(await run(['validate', 'bad.json'], bad), 1);
    assert.equal(parseOut(bad).ok, false);
    assert.ok(parseOut(bad).errors.some(e => /circuit\.ref/.test(e)));
});

test('cli import-dosbox: a conf becomes a functional config', async () => {
    const conf = '[dosbox]\nmachine=svga_s3\n[cpu]\ncputype=386\n[autoexec]\nmount c ./g\nc:\nDOOM.EXE\n';
    const io = harness({'d.conf': conf});
    assert.equal(await run(['import-dosbox', 'd.conf'], io), 0);
    const cfg = parseOut(io);
    assert.equal(cfg.machine, 'i80386');
    assert.equal(cfg.slots.exe.url, 'DOOM.EXE');
});

test('cli import-manifest: a media manifest becomes a machine', async () => {
    const io = harness({'m.json': elksManifest});
    assert.equal(await run(['import-manifest', 'm.json'], io), 0);
    const cfg = parseOut(io);
    assert.equal(cfg.machine, 'i8086');
    assert.equal(cfg.machineConfig, 'PCXT8086');
    assert.equal(cfg.slots.floppy.geometry.sectors, 18);
    // the config the CLI emitted is genuinely valid (an importer bug reds here)
    assert.deepEqual(validateMachineConfig(cfg).errors, []);
});

test('cli import-repo: many manifests load into a library', async () => {
    const io = harness({
        'a.json': elksManifest,
        'b.json': JSON.stringify({title: 'F83', machine: 'i8086', slots: {com: 'f83.com'}})
    });
    assert.equal(await run(['import-repo', 'a.json', 'b.json'], io), 0);
    const res = parseOut(io);
    assert.equal(res.imported, 2);
    assert.equal(res.library.version, 1);
    assert.equal(res.library.machines.length, 2);
});

test('cli activate: prints a boot plan and the refs a real boot would fetch', async () => {
    const io = harness({'c.json': JSON.stringify({
        title: 'ELKS', executionMode: 'functional', machine: 'i8086',
        cpu: {variant: '8086'}, machineConfig: 'PCXT8086',
        slots: {floppy: {url: 'fd1440-fat.img',
            geometry: {cylinders: 80, heads: 2, sectors: 18}}}
    })});
    assert.equal(await run(['activate', 'c.json'], io), 0);
    const plan = parseOut(io);
    assert.equal(plan.mode, 'functional');
    assert.equal(plan.targetKind, 'i8086');
    assert.equal(plan.bootMedia.slot, 'floppy');
    assert.equal(plan.bootMedia.profile, 'floppy-os');
    assert.match(plan.bootMedia.bytes, /bytes>$/);       // summarized, not the image
    assert.deepEqual(plan.wouldFetch, ['fd1440-fat.img']);
});

test('cli: an unknown command prints usage and exits 2', async () => {
    const io = harness();
    assert.equal(await run(['frobnicate'], io), 2);
    assert.match(io.err, /usage:/);
});
