// The vendored FREE 386 firmware is executed here — the browser-side counterpart
// to bw-board's reproducible ROM-free 386 qualification
// (scripts/run-i80386-free-bios-freedos.mjs).
//
// WHY THIS EXISTS. The fully-free 386 tier is reached in lite's GUI through
// debug-runner's attachI80386: it builds the experimental 80386 AT machine on
// ONLY the vendored LGPL firmware — the Bochs legacy BIOS and the LGPL VGABios,
// static/roms/free-386-bochs-bios.rom + free-386-vgabios-lgpl.bin — with NO
// proprietary IBM 5170 ROM anywhere, and mirrors the VGA frame into the Widgets
// pane via runner.video(). A provenance hash proves the two binaries are the
// LGPL firmware; it says nothing about whether they WORK. This file runs them.
//
// WHAT IT PINS, which a hash cannot see:
//   1. The two binaries ARE the LGPL Bochs BIOS / VGABios (sha-256), so lite
//      ships the free firmware and not something else.
//   2. Constructed through the SAME factory the runner uses
//      (createDebugTarget('i80386')), on the SAME config attachI80386 builds
//      (FreeDOS-VGA preset, the C000h option-ROM window widened to 40K for the
//      38400-byte VGABios), the machine POSTs: the CPU leaves the reset vector,
//      the free VGABios executes and writes its banner to the VGA text page, and
//      the debug target's video() returns a real framebuffer — which is exactly
//      what the Widgets-pane video mirror renders.
//   3. It uses ONLY the vendored firmware. AT_BIOS_ROM / VGA_BIOS_ROM are
//      deleted from the environment here; the boot must not need them.
//   4. The target advertises a scancode keyboard and accepts a key, so the
//      declared keyboard widget can steer it.
//
// NO BOOT MEDIA, BY CONSTRUCTION. With no floppy/hard disk inserted the BIOS
// POSTs, runs the VGABios, and reaches a deterministic wait (HLT) — it attempts
// no boot. A full FreeDOS boot to a prompt is bw-board's CLI qualification (it
// needs the external, GPL-mixed FreeDOS image, not vendored); this gate needs
// no external input and no bw-board checkout.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve, dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createDebugTarget} from 'bw-board';
import {PCAT80386_EXPERIMENTAL_4M_HDD_FREEDOS_VGA} from 'bw-board/experimental/i80386-at-machine.js';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const romsDir = join(repo, 'overlay/scratch-gui/static/roms');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

// The pinned identities of the redistributable LGPL firmware — the same two the
// bw-board free-BIOS receipt binds. If lite ever ships different bytes under
// these names, this fails before it ever boots them.
const BIOS = new Uint8Array(readFileSync(join(romsDir, 'free-386-bochs-bios.rom')));
const VGA = new Uint8Array(readFileSync(join(romsDir, 'free-386-vgabios-lgpl.bin')));
const EXPECTED_BIOS_SHA = '6481181809b58a9f805346a7ecf9bebdaf5b322c32825fb49ee89da51552c4ac';
const EXPECTED_VGA_SHA = '76af53f14955df3edd6365daa64393e91fafe55241c2c00384ff05b740431da1';

/** The config attachI80386 builds: the FreeDOS-VGA preset with the C000h option
 *  ROM window widened to 40K (the VGABios is 38400 bytes) and 6-cycle pacing. */
function freeConfig() {
    const base = PCAT80386_EXPERIMENTAL_4M_HDD_FREEDOS_VGA;
    return {
        ...base,
        functionalInstructionCycles: 6,
        regions: [
            ...base.regions.filter(r => !(r.kind === 'rom' && r.start === 0xc0000)),
            {kind: 'rom', start: 0xc0000, end: 0xc9fff},
        ],
    };
}

/** Row 0 of the VGA text page (B8000), printable characters only. */
function textRow0(machine) {
    let s = '';
    for (let x = 0; x < 80; x++) {
        const ch = machine._read386(0xb8000 + x * 2) & 0xff;
        s += (ch >= 32 && ch <= 126) ? String.fromCharCode(ch) : ' ';
    }
    return s;
}

test('the two vendored binaries are the LGPL Bochs BIOS and VGABios', () => {
    assert.equal(BIOS.length, 0x10000, 'the Bochs legacy BIOS is a 64K image');
    assert.equal(VGA.length, 38400, 'the LGPL VGABios is 38400 bytes');
    assert.equal(sha256(BIOS), EXPECTED_BIOS_SHA);
    assert.equal(sha256(VGA), EXPECTED_VGA_SHA);
});

test('the free-386 POSTs on the vendored LGPL firmware alone — no IBM AT ROM', async () => {
    // The boot must use ONLY the vendored firmware. Prove it by removing the
    // private oracle from the environment for the duration.
    const savedAt = process.env.AT_BIOS_ROM, savedVga = process.env.VGA_BIOS_ROM;
    delete process.env.AT_BIOS_ROM; delete process.env.VGA_BIOS_ROM;
    try {
        const {target, adapter} = await createDebugTarget('i80386', {config: freeConfig()});
        const machine = adapter.machine;

        // Firmware at its three aliases, exactly as attachI80386 does it.
        machine.loadRom(BIOS, 0xf0000);
        machine.loadRom(BIOS, 0xff0000);
        machine.loadRom(VGA, 0xc0000);
        machine.reset();

        const cpu = machine.cpu;
        // The AT reset vector: F000:FFF0, first byte a far JMP (0xEA).
        assert.equal(cpu.cs >>> 0, 0xf000);
        assert.equal(cpu.eip >>> 0, 0xfff0);
        assert.equal(machine._read386(0xffff0) & 0xff, 0xea, 'reset vector is a far JMP');

        // POST. Step until the machine reaches its no-media wait (HLT) or a
        // generous cap; the VGABios writes its banner along the way.
        let bannerSeen = false, steps = 0;
        const MAX = 4_000_000;
        for (; steps < MAX; steps++) {
            machine.step();
            if (!bannerSeen && steps % 20000 === 0 && /VGABios/i.test(textRow0(machine))) bannerSeen = true;
            if (cpu.halted && bannerSeen) break;
        }

        // The CPU actually executed — it left the reset vector.
        assert.ok(!(cpu.cs >>> 0 === 0xf000 && cpu.eip >>> 0 === 0xfff0),
            'the CPU never advanced off the reset vector — the BIOS did not execute');
        // The FREE VGABios ran and announced itself on the VGA text page.
        assert.ok(bannerSeen, `the VGABios banner never appeared on B8000 (row0=${JSON.stringify(textRow0(machine))})`);

        // video() — the exact call the Widgets-pane mirror pumps — returns a
        // real framebuffer, not a refusal.
        const frame = target.video();
        assert.ok(frame && typeof frame === 'object' && !frame.unsupported,
            `video() did not return a framebuffer: ${JSON.stringify(frame)}`);
        assert.ok((frame.width | 0) > 0 && (frame.height | 0) > 0,
            `video() framebuffer has no dimensions: ${JSON.stringify({width: frame.width, height: frame.height})}`);

        // The keyboard widget can steer it: the target advertises a scancode
        // keyboard and accepts a key.
        const caps = target.capabilities();
        assert.ok(Array.isArray(caps.keys) && caps.keys.includes('scancode'),
            `the 386 target does not advertise a scancode keyboard: ${JSON.stringify(caps.keys)}`);
        assert.equal(target.keyIn(0x1e), true, 'the 386 target refused a scancode');
    } finally {
        if (savedAt !== undefined) process.env.AT_BIOS_ROM = savedAt;
        if (savedVga !== undefined) process.env.VGA_BIOS_ROM = savedVga;
    }
});
