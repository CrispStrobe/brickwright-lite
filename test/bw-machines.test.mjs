// Machine Manager foundation (design §8 steps 1–2) — the headless spine, tested
// framework-free with node:test. No React, no DOM: the modules under
// lib/bw-machines/ are plain ES modules, so this drives the SAME functions the
// GUI and CLI will call (design §2: "one schema … reused by GUI + CLI + a Node
// test, so a bad config is rejected the same everywhere").
//
// The imports come from overlay/ (the source of truth); overlay-packages-pairs
// keeps the packages/ mirror byte-identical.

import {test} from 'node:test';
import assert from 'node:assert/strict';

import {
    validateMachineConfig, normalizeMachineConfig, newMachineConfig,
    EXECUTION_MODES, MACHINE_KINDS
} from '../overlay/scratch-gui/src/lib/bw-machines/machine-config.js';
import {
    createMemoryMachineStore, createIndexedDbMachineStore, indexedDbAvailable
} from '../overlay/scratch-gui/src/lib/bw-machines/machine-store.js';
import {
    fromDosboxConf, fromMediaManifest, fromManifestRepo
} from '../overlay/scratch-gui/src/lib/bw-machines/importers.js';
import {
    activateConfig
} from '../overlay/scratch-gui/src/lib/bw-machines/activate.js';

// ── Fixtures ─────────────────────────────────────────────────────────────────

/** An i8086 floppy OS, shaped like the media-lab ELKS manifest once imported. */
const elksConfig = () => newMachineConfig({
    title: 'ELKS 0.9.2',
    executionMode: 'functional',
    machine: 'i8086',
    machineConfig: 'PCXT8086',
    slots: {
        floppy: {
            url: 'fd1440-fat.img', sha256: null,
            geometry: {cylinders: 80, heads: 2, sectors: 18, bytesPerSector: 512}
        }
    },
    quirks: ['at-floppy-drive-type']
});

/** A free-386 machine: FreeDOS HD + user-supplied AT/VGA BIOS ROMs. */
const freedos386Config = () => newMachineConfig({
    title: 'FreeDOS on the free 386',
    executionMode: 'functional',
    machine: 'i80386',
    bios: {kind: 'bochs-lgpl'},
    video: {kind: 'vga', optionRom: 'seavgabios-lgpl'},
    slots: {
        hdd: {url: 'https://ex/freedos-hd.img', sha256: null},
        bios: {url: 'https://ex/bochs-bios.bin', sha256: null},
        'vga-rom': {url: 'https://ex/seavgabios.bin', sha256: null}
    },
    bootOrder: ['hdd']
});

/** A stub fetcher: bytes derived from the url, so a test can tell which ref was
 *  fetched. Returns no sha256 (a stub is trusted; production computes+verifies). */
const stubFetcher = () => {
    const seen = [];
    const fetcher = async ref => {
        seen.push(ref.url);
        return {bytes: new TextEncoder().encode(`bytes:${ref.url}`)};
    };
    return {fetcher, seen};
};

const decode = bytes => new TextDecoder().decode(bytes);

// ── 1. validate / normalize ──────────────────────────────────────────────────

test('normalize fills defaults and is idempotent', () => {
    const once = normalizeMachineConfig({machine: 'i8086', slots: {floppy: 'a.img'}});
    // a bare-string slot becomes a {url,sha256,geometry} reference
    assert.deepEqual(once.slots.floppy, {url: 'a.img', sha256: null, geometry: null});
    // cpu.variant derived from the kind
    assert.equal(once.cpu.variant, '8086');
    // executionMode defaults to functional; bootOrder derived from the slots
    assert.equal(once.executionMode, 'functional');
    assert.deepEqual(once.bootOrder, ['floppy']);
    // idempotent: normalizing again changes nothing
    assert.deepEqual(normalizeMachineConfig(once), once);
});

test('newMachineConfig mints a stable id and round-trips through JSON', () => {
    const cfg = newMachineConfig({machine: 'i8086', slots: {floppy: 'a.img'}});
    assert.equal(typeof cfg.id, 'string');
    assert.ok(cfg.id.length > 0);
    // A minted config normalizes to itself (no lossy fields).
    assert.deepEqual(normalizeMachineConfig(cfg), cfg);
    // Survives a JSON round-trip unchanged (the store's export/import contract).
    assert.deepEqual(JSON.parse(JSON.stringify(cfg)), cfg);
});

test('validate accepts a functional OS config', () => {
    const {ok, errors} = validateMachineConfig(elksConfig());
    assert.deepEqual(errors, []);
    assert.ok(ok);
});

test('validate rejects an unknown executionMode', () => {
    const {ok, errors} = validateMachineConfig(
        normalizeMachineConfig({machine: 'i8086', slots: {floppy: 'a.img'}, executionMode: 'turbo'}));
    // normalize would coerce 'turbo' to functional, so assert on the raw object:
    const raw = {...elksConfig(), executionMode: 'turbo'};
    const res = validateMachineConfig(raw);
    assert.equal(res.ok, false);
    assert.ok(res.errors.some(e => /executionMode/.test(e)));
    // sanity: the normalized fallback is a valid mode
    assert.ok(EXECUTION_MODES.includes(normalizeMachineConfig(raw).executionMode));
    void ok; void errors;
});

test('executionMode gating: a wired config without a circuit ref is rejected', () => {
    const wiredNoCircuit = newMachineConfig({
        title: 'breadboard CPU', executionMode: 'wired', machine: 'eater6502'
    });
    const res = validateMachineConfig(wiredNoCircuit);
    assert.equal(res.ok, false);
    assert.ok(res.errors.some(e => /circuit\.ref/.test(e)), res.errors.join(';'));

    const wiredWithCircuit = newMachineConfig({
        title: 'Eater 6502 + LCD', executionMode: 'wired', machine: 'eater6502',
        circuit: {ref: 'circuits/eater-6502-lcd', cpuPart: 'w65c02'}
    });
    assert.deepEqual(validateMachineConfig(wiredWithCircuit).errors, []);
});

test('executionMode gating: an i80386 without a BIOS source is rejected', () => {
    const noBios = newMachineConfig({
        title: '386', executionMode: 'functional', machine: 'i80386',
        slots: {hdd: {url: 'hd.img'}}
    });
    const res = validateMachineConfig(noBios);
    assert.equal(res.ok, false);
    assert.ok(res.errors.some(e => /BIOS/.test(e)), res.errors.join(';'));
    // With a BIOS source it passes.
    assert.deepEqual(validateMachineConfig(freedos386Config()).errors, []);
});

test('validate rejects a functional config with no bootable slot and a slot with no url', () => {
    const noSlots = newMachineConfig({machine: 'i8086', executionMode: 'functional'});
    assert.equal(validateMachineConfig(noSlots).ok, false);

    const badSlot = normalizeMachineConfig({machine: 'i8086', slots: {floppy: {sha256: 'x'}}});
    const res = validateMachineConfig(badSlot);
    assert.equal(res.ok, false);
    assert.ok(res.errors.some(e => /no url/.test(e)));
});

test('MACHINE_KINDS and EXECUTION_MODES are the shared vocabularies', () => {
    assert.ok(MACHINE_KINDS.includes('i8086') && MACHINE_KINDS.includes('i80386'));
    assert.deepEqual([...EXECUTION_MODES].sort(), ['auto', 'functional', 'wired']);
});

// ── 2. in-memory store CRUD + export/import ───────────────────────────────────

test('memory store: CRUD, duplicate, export/import round-trip', async () => {
    const store = createMemoryMachineStore();
    assert.deepEqual(await store.list(), []);

    const a = await store.put(elksConfig());
    const b = await store.put(freedos386Config());
    assert.equal((await store.list()).length, 2);

    // get returns a clone, not the stored object
    const gotA = await store.get(a.id);
    assert.deepEqual(gotA, a);
    gotA.title = 'mutated';
    assert.equal((await store.get(a.id)).title, 'ELKS 0.9.2');

    // put rejects an invalid config the same way validate does
    await assert.rejects(() => store.put({executionMode: 'wired', machine: 'eater6502'}),
        /invalid machine config/);

    // duplicate mints a new id and a "(copy)" title
    const copy = await store.duplicate(a.id);
    assert.notEqual(copy.id, a.id);
    assert.match(copy.title, /\(copy\)$/);
    assert.equal((await store.list()).length, 3);

    // remove
    assert.equal(await store.remove(b.id), true);
    assert.equal(await store.remove('nope'), false);
    assert.equal((await store.list()).length, 2);

    // export → import into a fresh store reproduces the library
    const dump = await store.export();
    assert.equal(dump.version, 1);
    const fresh = createMemoryMachineStore();
    const imported = await fresh.import(dump);
    assert.equal(imported.length, 2);
    const ids = new Set((await fresh.list()).map(m => m.id));
    assert.ok(ids.has(a.id) && ids.has(copy.id));

    // import also accepts a bare array
    const fresh2 = createMemoryMachineStore();
    await fresh2.import(dump.machines);
    assert.equal((await fresh2.list()).length, 2);
});

test('memory store: seed preloads configs', async () => {
    const store = createMemoryMachineStore([elksConfig()]);
    assert.equal((await store.list()).length, 1);
});

test('store interface: memory and indexeddb impls share the method surface', () => {
    const mem = createMemoryMachineStore();
    const surface = ['list', 'get', 'put', 'remove', 'duplicate', 'export', 'import', 'clear'];
    for (const m of surface) assert.equal(typeof mem[m], 'function', m);
    // In Node there is no IndexedDB; the browser store guards rather than throws
    // on import, and constructing it fails loudly (not a ReferenceError).
    assert.equal(indexedDbAvailable(undefined), false);
    assert.throws(() => createIndexedDbMachineStore(), /IndexedDB is unavailable/);
});

// ── 3. importers ──────────────────────────────────────────────────────────────

test('fromDosboxConf maps machine/cpu/autoexec onto a functional config', () => {
    const conf = [
        '[dosbox]',
        'machine = svga_s3',
        '[cpu]',
        'core = normal',
        'cputype = 386',
        'cycles = fixed 3000',
        '[autoexec]',
        'mount c ./game',
        'c:',
        'DOOM.EXE',
        ''
    ].join('\n');
    const cfg = fromDosboxConf(conf);
    assert.equal(cfg.executionMode, 'functional');
    assert.equal(cfg.machine, 'i80386');       // cputype 386 → the 386 tier
    assert.equal(cfg.cpu.variant, '80386');
    assert.ok(cfg.slots.exe, 'the launched .exe becomes the exe slot');
    assert.equal(cfg.slots.exe.url, 'DOOM.EXE');
    assert.equal(cfg.provenance.source, 'dosbox-conf');
    assert.equal(cfg.provenance.dosbox.cycles, 'fixed 3000');
    assert.equal(cfg.provenance.dosbox.mounts.c, './game');
    assert.equal(typeof cfg.id, 'string');

    // A CGA machine drops to the XT preset and the 8086 tier.
    const xt = fromDosboxConf('[dosbox]\nmachine=cga\n[autoexec]\nFOO.COM\n');
    assert.equal(xt.machine, 'i8086');
    assert.equal(xt.provenance.dosbox.preset, 'xt');
    assert.ok(xt.slots.com && xt.slots.com.url === 'FOO.COM');
});

test('fromMediaManifest turns a brickwright-media.json into a machine', () => {
    // The real ELKS manifest shape: {slot: filename} strings + a sibling floppy
    // block for geometry/quirks (NOT the doc's {url,sha256,geometry} slot).
    const manifest = {
        title: 'ELKS 0.9.2',
        machine: 'i8086',
        machineConfig: 'PCXT8086',
        slots: {floppy: 'fd1440-fat.img'},
        floppy: {
            geometry: {cylinders: 80, heads: 2, sectors: 18, bytesPerSector: 512},
            quirks: ['at-floppy-drive-type']
        },
        boot: true,
        notes: 'GPL-2 kernel; fetched, never re-hosted.'
    };
    const cfg = fromMediaManifest(manifest, {source: 'projects/elks', baseUrl: 'https://cdn/elks'});
    assert.equal(cfg.machine, 'i8086');
    assert.equal(cfg.executionMode, 'functional');
    assert.equal(cfg.machineConfig, 'PCXT8086');            // carried verbatim
    // filename → url under the project base; geometry folded from the floppy block
    assert.equal(cfg.slots.floppy.url, 'https://cdn/elks/fd1440-fat.img');
    assert.equal(cfg.slots.floppy.geometry.sectors, 18);
    assert.deepEqual(cfg.quirks, ['at-floppy-drive-type']);
    assert.equal(cfg.provenance.source, 'projects/elks');
    assert.equal(cfg.provenance.notes, manifest.notes);
    // the imported config is valid and activatable
    assert.deepEqual(validateMachineConfig(cfg).errors, []);
});

test('fromMediaManifest keeps an inline Eater 6502 machineConfig object', () => {
    const manifest = {
        title: 'Bad Apple (Ben Eater 6502)',
        machine: 'eater6502',
        machineConfig: {
            clockHz: 5000000,
            regions: [{kind: 'ram', start: 0, end: 16383}, {kind: 'rom', start: 32768, end: 65535}],
            chips: [{kind: 'via', name: 'via1', at: 24576}]
        },
        slots: {rom: 'player.hex', 'sd-image': 'sd-image.bin'},
        entry: 6144
    };
    const cfg = fromMediaManifest(manifest);
    assert.equal(typeof cfg.machineConfig, 'object');
    assert.equal(cfg.machineConfig.chips[0].kind, 'via');
    assert.ok(cfg.slots.rom && cfg.slots['sd-image']);
    assert.deepEqual(validateMachineConfig(cfg).errors, []);
});

test('fromManifestRepo bulk-imports many manifests and reports bad entries', () => {
    const entries = [
        {path: 'projects/elks/brickwright-media.json', manifest: {
            title: 'ELKS', machine: 'i8086', machineConfig: 'PCXT8086',
            slots: {floppy: 'elks.img'}, floppy: {geometry: {cylinders: 80}, quirks: []}
        }},
        {path: 'projects/f83/brickwright-media.json', manifest: {
            title: 'F83', machine: 'i8086', slots: {com: 'f83.com'}
        }},
        {path: 'projects/broken/brickwright-media.json', manifest: null}
    ];
    const {configs, errors} = fromManifestRepo(entries, {baseUrl: 'https://cdn'});
    assert.equal(configs.length, 2);
    assert.equal(errors.length, 1);
    assert.match(errors[0].path, /broken/);
    // per-project base url: the file resolves under its own project dir
    const elks = configs.find(c => c.title === 'ELKS');
    assert.equal(elks.slots.floppy.url, 'https://cdn/projects/elks/elks.img');
    // every good config is valid
    for (const c of configs) assert.deepEqual(validateMachineConfig(c).errors, []);
});

// ── 4. activate ───────────────────────────────────────────────────────────────

test('activate: functional i8086 floppy → the floppy-OS bootMedia', async () => {
    const {fetcher, seen} = stubFetcher();
    const result = await activateConfig(elksConfig(), {fetcher});
    assert.equal(result.mode, 'functional');
    assert.equal(result.targetKind, 'i8086');
    assert.equal(result.bootMedia.slot, 'floppy');
    assert.equal(result.bootMedia.profile, 'floppy-os');      // selects debug-runner's floppy branch
    assert.equal(result.bootMedia.geometry.sectors, 18);
    assert.equal(decode(result.bootMedia.bytes), 'bytes:fd1440-fat.img');
    // 'PCXT8086' is a preset name, not a {regions,chips} object → not a machineConfig
    assert.equal(result.machineConfig, null);
    assert.equal(result.machinePreset, 'PCXT8086');
    assert.deepEqual(result.quirks, ['at-floppy-drive-type']);
    // the createDebugRunner-facing subset is exactly {targetKind, machineConfig, bootMedia}
    assert.deepEqual(Object.keys(result.debugRunnerOptions).sort(),
        ['bootMedia', 'machineConfig', 'targetKind']);
    // only the boot image was fetched (images fetched only on activation)
    assert.deepEqual(seen, ['fd1440-fat.img']);
});

test('activate: functional 386 → hdd bootMedia + resolved BIOS/VGA media', async () => {
    const {fetcher, seen} = stubFetcher();
    const result = await activateConfig(freedos386Config(), {fetcher});
    assert.equal(result.mode, 'functional');
    assert.equal(result.targetKind, 'i80386');
    assert.equal(result.bootMedia.slot, 'hdd');
    assert.equal(decode(result.bootMedia.bytes), 'bytes:https://ex/freedos-hd.img');
    // the 386's extra boot media are resolved too (bw-board marks bios required)
    assert.equal(decode(result.media.bios.bytes), 'bytes:https://ex/bochs-bios.bin');
    assert.equal(decode(result.media['vga-rom'].bytes), 'bytes:https://ex/seavgabios.bin');
    // honest about the not-yet-wired 386 boot branch in lite
    assert.ok(result.warnings.some(w => /i80386 boot is not yet wired/.test(w)));
    // all three images fetched
    assert.equal(seen.length, 3);
});

test('activate: an inline machineConfig passes straight through to createDebugRunner', async () => {
    const {fetcher} = stubFetcher();
    const cfg = newMachineConfig({
        title: 'Bad Apple', machine: 'eater6502',
        machineConfig: {clockHz: 5000000, chips: [{kind: 'via', name: 'via1'}]},
        slots: {rom: {url: 'player.hex'}}
    });
    const result = await activateConfig(cfg, {fetcher});
    assert.equal(result.targetKind, 'eater6502');
    assert.equal(result.machineConfig.chips[0].kind, 'via');   // the {chips} object survives
    assert.equal(result.machinePreset, null);
});

test('activate: a wired config returns a circuit descriptor and fetches nothing', async () => {
    const {fetcher, seen} = stubFetcher();
    const cfg = newMachineConfig({
        title: 'Eater 6502 + HD44780', executionMode: 'wired', machine: 'eater6502',
        circuit: {ref: 'circuits/eater-lcd', cpuPart: 'w65c02'}
    });
    const result = await activateConfig(cfg, {fetcher});
    assert.equal(result.mode, 'wired');
    assert.equal(result.circuit.ref, 'circuits/eater-lcd');
    assert.equal(result.bootMedia, undefined);
    assert.deepEqual(seen, []);                                  // no image fetch for wired
});

test('activate: an invalid config is refused before any fetch', async () => {
    const {fetcher, seen} = stubFetcher();
    await assert.rejects(
        () => activateConfig({executionMode: 'wired', machine: 'eater6502'}, {fetcher}),
        /cannot activate an invalid config/);
    assert.deepEqual(seen, []);
});

test('activate: sha256 mismatch from a verifying fetcher is fatal', async () => {
    const cfg = newMachineConfig({
        title: 'pinned', machine: 'i8086',
        slots: {floppy: {url: 'a.img', sha256: 'deadbeef'}}
    });
    // a fetcher that returns a DIFFERENT sha than the ref declares
    const fetcher = async () => ({bytes: new Uint8Array([1, 2, 3]), sha256: 'feedface'});
    await assert.rejects(() => activateConfig(cfg, {fetcher}), /sha256 mismatch/);
});
