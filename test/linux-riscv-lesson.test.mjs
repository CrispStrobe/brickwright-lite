// The "Linux on RISC-V" lesson, headless: the offer (a Machine Manager row with
// a licence line and a source link), the pins (two raw.githubusercontent URLs at
// a 40-hex media-lab commit, two SHA-256s), the refusal (a byte that does not
// hash to its pin is refused BY SLOT NAME before anything boots), and the
// hand-off (activate → run-machine → the media-load event carries the kernel as
// `bytes` and the initramfs as `linuxInitrd`, for debug-runner's
// attachRiscV32Linux). Then bw-board's own half, the one debug-runner drives:
// createDebugTarget('riscv32', {linux}) under a debug session, console input in
// and out. The live boot of the real kernel in a browser is the CP/M + Linux
// Machine Manager gate (scripts/verify-cpm-system.mjs, build.yml).

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

import {
    lessonMachines, lessonT, LESSON_STRINGS, LINUX_RISCV_MEDIA, LINUX_DOWNLOAD_BYTES, mediaSize
} from '../overlay/scratch-gui/src/lib/bw-machines/lessons.js';
import {validateMachineConfig, MACHINE_KINDS} from '../overlay/scratch-gui/src/lib/bw-machines/machine-config.js';
import {activateConfig, defaultImageFetcher} from '../overlay/scratch-gui/src/lib/bw-machines/activate.js';
import {runMachineConfig} from '../overlay/scratch-gui/src/lib/bw-machines/run-machine.js';
import {t as statusT, STRINGS} from '../overlay/scratch-gui/src/lib/bw-debug/runner-status-l10n.js';
import {createDebugTarget, createDebugSession} from 'bw-board';
import {LINUX_BOOT_PHASES} from 'bw-board/riscv32-linux-session.js';
import {assembleRiscv} from 'bw-board/riscv-asm.js';

const sha = b => createHash('sha256').update(b).digest('hex');
const lesson = () => lessonMachines('en')[0];

test('the lesson is a valid riscv32 machine whose two slots are pinned media-lab URLs', () => {
    const {config} = lesson();
    assert.ok(MACHINE_KINDS.includes('riscv32'));
    assert.deepEqual(validateMachineConfig(config), {ok: true, errors: []});
    assert.equal(config.machine, 'riscv32');
    assert.deepEqual(config.bootOrder, ['kernel', 'initrd']);
    const RAW = /^https:\/\/raw\.githubusercontent\.com\/CrispStrobe\/brickwright-media-lab\/([0-9a-f]{40})\/riscv32-linux\/[\w.]+$/;
    for (const slot of ['kernel', 'initrd']) {
        const ref = config.slots[slot];
        const m = RAW.exec(ref.url);
        assert.ok(m, `${slot} is fetched from a commit-addressed media-lab URL: ${ref.url}`);
        assert.equal(m[1], LINUX_RISCV_MEDIA.commit);
        assert.match(ref.sha256, /^[0-9a-f]{64}$/, `${slot} carries a SHA-256 pin`);
        assert.equal(ref.sha256, LINUX_RISCV_MEDIA[slot].sha256);
    }
    assert.equal(mediaSize(LINUX_DOWNLOAD_BYTES), '7.5 MB');
});

test('the offer travels with the binary: GPL/LGPL licence line and the source link, in EN and DE', () => {
    for (const loc of ['en', 'de']) {
        const row = lessonMachines(loc)[0];
        assert.match(row.licence, /GPL-2\.0/);
        assert.match(row.licence, /LGPL-2\.1/);
        assert.match(row.licence, /brickwright-media-lab/);
        assert.match(row.licence, /7\.5 MB/);
        assert.equal(row.source, 'https://github.com/CrispStrobe/brickwright-media-lab/releases/tag/riscv32-linux-v1');
    }
    assert.deepEqual(Object.keys(LESSON_STRINGS.de).sort(), Object.keys(LESSON_STRINGS.en).sort());
    for (const k of Object.keys(LESSON_STRINGS.en)) {
        assert.notEqual(lessonT('de', k, {title: 'x', size: 'y', reason: 'z'}),
            lessonT('en', k, {title: 'x', size: 'y', reason: 'z'}), `${k} is translated`);
    }
    assert.equal(lessonMachines('de')[0].config.title, 'Linux auf RISC-V');
});

test('activate hands the kernel and the initramfs to the boot path', async () => {
    const seen = [];
    const fetcher = async ref => {
        seen.push(ref.url.split('/').pop());
        return {bytes: new TextEncoder().encode(`bytes:${ref.url.split('/').pop()}`)};
    };
    const events = [];
    const {activated, detail} = await runMachineConfig(lesson().config, {fetcher, dispatch: d => events.push(d)});
    assert.deepEqual(seen, ['Image', 'initramfs.cpio'], 'both images fetched, the kernel first');
    assert.equal(activated.targetKind, 'riscv32');
    assert.equal(activated.bootMedia.profile, 'linux', 'a kernel slot selects the Linux boot');
    assert.equal(detail.kind, 'riscv32');
    assert.equal(new TextDecoder().decode(detail.bytes), 'bytes:Image');
    assert.equal(new TextDecoder().decode(detail.linuxInitrd), 'bytes:initramfs.cpio');
    assert.equal(events.length, 1);
});

test('a byte that does not hash to its pin is refused BY SLOT NAME before anything boots', async () => {
    const good = new Uint8Array([1, 2, 3]);
    const cfg = structuredClone(lesson().config);
    cfg.slots.kernel.sha256 = sha(good);
    const realFetch = globalThis.fetch;
    // The production fetcher (network → Web Crypto → compare), with the network
    // stubbed: the kernel arrives intact, the initramfs arrives one byte off.
    globalThis.fetch = async url => ({
        ok: true, status: 200,
        arrayBuffer: async () => (/Image$/.test(url) ? good : new Uint8Array([9])).buffer
    });
    const events = [];
    try {
        await assert.rejects(
            () => runMachineConfig(cfg, {fetcher: defaultImageFetcher, dispatch: d => events.push(d)}),
            e => {
                assert.match(e.message, /^initrd: sha256 mismatch for https:\/\/raw\.githubusercontent\.com\/.*\/initramfs\.cpio: expected d71915ba/);
                return true;
            });
    } finally {
        globalThis.fetch = realFetch;
    }
    assert.deepEqual(events, [], 'nothing was handed to the boot path');
});

test('the status line has every Linux boot phase bw-board reports, in EN and DE', () => {
    for (const phase of ['starting', ...LINUX_BOOT_PHASES.map(p => p.id)]) {
        for (const loc of ['en', 'de']) {
            const s = statusT(loc, `linux.phase.${phase}`);
            assert.notEqual(s, `linux.phase.${phase}`, `${loc} has linux.phase.${phase}`);
        }
    }
    assert.match(statusT('en', 'linux.booting', {phase: 'x', percent: 42}), /42%/);
    assert.match(statusT('de', 'linux.ready'), /bwb#/);
    assert.ok(STRINGS.de['linux.ready']);
});

test('bw-board\'s linux target under a debug session: boots, reports progress, echoes the console', async () => {
    // A stand-in kernel (S-mode, bare): prints what the real boot prints, then
    // echoes the UART — the half debug-runner's attachRiscV32Linux drives.
    const RAM = 0x80000000;
    const asm = assembleRiscv(`
        .text
_start: lui s0, 0x10000
        la a0, msg
puts:   lbu t0, 0(a0)
        beqz t0, echo
        sb t0, 0(s0)
        addi a0, a0, 1
        j puts
echo:   lbu t1, 5(s0)
        andi t1, t1, 1
        beqz t1, echo
        lbu t2, 0(s0)
        sb t2, 0(s0)
        j echo
        .data
msg:    .string "Linux version 6.1.0\\nRun /init as init process\\nBWB-LINUX-USERSPACE-UP\\nbwb# "
`, {textBase: RAM, dataBase: RAM + 0x1000});
    assert.ok(asm.ok);
    const kernel = new Uint8Array(0x2000);
    for (const {addr, bytes} of asm.image.segments) kernel.set(bytes, addr - RAM);
    const {target, adapter} = await createDebugTarget('riscv32', {linux: {kernel}});
    assert.ok(target && typeof target.onHalt === 'function', 'a DebugTarget, so createDebugSession can drive it');
    let out = '';
    adapter.onSerial(b => { out += String.fromCharCode(b); });
    const session = createDebugSession(target, {onChange () {}});
    session.start();
    for (let i = 0; i < 50 && !target.linuxProgress().ready; i++) session.pump();
    assert.deepEqual(target.linuxProgress(), {phase: 'prompt', percent: 100, ready: true});
    for (const ch of 'ls\r') target.sendSerial(ch.charCodeAt(0));
    for (let i = 0; i < 20 && !out.endsWith('ls\r'); i++) session.pump();
    assert.ok(out.endsWith('bwb# ls\r'), JSON.stringify(out.slice(-12)));
});

test('the GPL-in-build guard refuses a Linux Image or an initramfs under ANY name, and passes a clean tree', async () => {
    const {mkdtempSync, writeFileSync, mkdirSync, rmSync} = await import('node:fs');
    const {tmpdir} = await import('node:os');
    const {join} = await import('node:path');
    const {spawnSync} = await import('node:child_process');
    const guard = new URL('../scripts/verify-no-gpl-in-build.mjs', import.meta.url).pathname;
    const dir = mkdtempSync(join(tmpdir(), 'bw-gpl-guard-'));
    try {
        mkdirSync(join(dir, 'static'));
        writeFileSync(join(dir, 'index.html'), '<!doctype html>');
        writeFileSync(join(dir, 'static', 'app.js'), 'console.log(1)');
        const clean = spawnSync(process.execPath, [guard, dir], {encoding: 'utf8'});
        assert.equal(clean.status, 0, clean.stderr);
        // A RISC-V Image header (magic "RSC\x05" at 0x38), renamed innocently.
        const image = new Uint8Array(128);
        image.set([0x52, 0x53, 0x43, 0x05], 0x38);
        writeFileSync(join(dir, 'static', 'data.bin'), image);
        writeFileSync(join(dir, 'static', 'blob'), '070701000000000000');
        const dirty = spawnSync(process.execPath, [guard, dir], {encoding: 'utf8'});
        assert.equal(dirty.status, 1);
        assert.match(dirty.stderr, /static\/data\.bin — a RISC-V Linux kernel Image \(GPL-2\.0\)/);
        assert.match(dirty.stderr, /static\/blob — a cpio archive \(an initramfs/);
    } finally {
        rmSync(dir, {recursive: true, force: true});
    }
});
