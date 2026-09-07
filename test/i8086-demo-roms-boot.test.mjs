/**
 * EACH VENDORED DEMO ROM ACTUALLY BOOTS ON THE BOARD ITS BUTTON SELECTS.
 *
 * The sibling gate (circuit-preset-roms-resolve) proves the seven files are
 * THERE. A file being there is not the claim the UI makes: the button says "load
 * this and watch it run". Seven 32 KiB blobs of the right name that halt on the
 * first instruction would satisfy the resolve gate completely.
 *
 * So this one runs them. Each ROM is loaded onto the board its preset selects,
 * stepped for a bounded count, and checked for a FIRST OBSERVABLE taken from the
 * demo's own header comment in i8086-machine.js — what that demo is documented
 * to do, not what it happens to do today.
 *
 * MEASURED, NOT ASSUMED. Every expectation below was read off a real run before
 * it was written down; where a demo turned out to need something this bench does
 * not provide, that is recorded as a named skip rather than softened into an
 * assertion that passes on anything.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as MACHINE from '../overlay/scratch-gui/src/lib/bw-board/i8086-machine.js';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROMS = join(repo, 'overlay', 'scratch-gui', 'static', 'roms');

/**
 * Each demo, the board its preset selects, and what its bw-board header says it
 * does. `chips` is the documented part set; `observe` returns a value that must
 * become non-trivial once the demo has run.
 */
const DEMOS = [
    // `observe` returns a value that is FALSY for a machine that did not run
    // the demo, and truthy once it did. Every one was read off a real boot and
    // off a 32 KiB zero ROM before being written here -- see the mutation note
    // at the foot of this file.
    { rom: 'i8086-blink-demo.bin', board: 'BLINK8086', chips: ['ppi1'],
      why: 'drives the GPIO port',
      observe: (m) => m.chips.ppi1.control !== 0x9b && m.chips.ppi1.outB !== 0,
      saw: (m) => `control=0x${m.chips.ppi1.control.toString(16)} outB=${m.chips.ppi1.outB}`,
      expect: 'the 8255 reprogrammed away from its reset control word (0x9b) and port B driven' },

    { rom: 'i8086-keyboard-demo.bin', board: 'KBDDEMO8086', chips: ['pic1', 'ppi1', 'cga1'],
      why: 'hooks IRQ1 so scancodes can arrive',
      observe: (m) => (m.chips.pic1.imr & 0x02) === 0 && m.chips.pic1.imr !== 0,
      saw: (m) => `imr=0x${m.chips.pic1.imr.toString(16)}`,
      expect: 'IRQ1 unmasked in the PIC while the rest stay masked -- the demo hooked the keyboard' },

    { rom: 'i8086-hercules-demo.bin', board: 'HERCDEMO8086', chips: ['hgc1'],
      why: 'sets HGC graphics mode and fills the mono page',
      observe: (m) => m.displayRevision > 0, saw: (m) => `displayRevision=${m.displayRevision}`,
      expect: 'writes to the mono page bump the display revision' },

    { rom: 'i8086-vga-demo.bin', board: 'VGADEMO8086', chips: ['vga1'],
      why: 'programs mode 13h and writes the 256-colour framebuffer',
      observe: (m) => m.displayRevision > 0, saw: (m) => `displayRevision=${m.displayRevision}`,
      expect: 'framebuffer writes bump the display revision' },

    { rom: 'i8086-ega-demo.bin', board: 'EGADEMO8086', chips: ['ega1'],
      why: 'writes the 16-colour planar framebuffer',
      observe: (m) => m.displayRevision > 0, saw: (m) => `displayRevision=${m.displayRevision}`,
      expect: 'planar writes bump the display revision (the planes are not plain VRAM bytes)' },

    { rom: 'i8086-cga-gfx-demo.bin', board: 'CGADEMO8086', chips: ['cga1'],
      why: 'selects a CGA graphics mode and paints the page',
      observe: (m) => m.displayRevision > 0, saw: (m) => `displayRevision=${m.displayRevision}`,
      expect: 'page writes bump the display revision' },

    { rom: 'i8086-desk-demo.bin', board: 'DESKDEMO8086', chips: ['pic1', 'pit1', 'ppi1', 'cga1'],
      why: 'runs the timer and the keyboard together',
      observe: (m) => m.displayRevision > 0, saw: (m) => `displayRevision=${m.displayRevision}`,
      expect: 'the clock it draws bumps the display revision' },
];

const STEPS = 200_000;

/** Boot one ROM on its board and return the machine, or null if the board is absent. */
function boot(spec) {
    const board = MACHINE[spec.board];
    if (!board) return null;
    const m = new MACHINE.I8086Machine(board);
    const rom = readFileSync(join(ROMS, spec.rom));
    // `loadRom(bytes, at)` -- the machine's own loader, the one the UI's preset
    // path ends in. I guessed `loadROM`/`load` first and every boot skipped;
    // the named skip is what surfaced that, which is the argument for naming
    // them.
    if (typeof m.loadRom !== 'function') return null;
    m.loadRom(rom);
    for (let i = 0; i < STEPS; i++) m.step();
    return m;
}

test('the demo board constants the presets select all exist', () => {
    // If a board vanished, every boot below would skip and this file would be
    // green about nothing — the vacuous-pass species, guarded first.
    const missing = DEMOS.filter((d) => !MACHINE[d.board]).map((d) => d.board);
    assert.deepEqual(missing, [], `board constant(s) gone: ${missing.join(', ')}`);
    assert.ok(DEMOS.length >= 7, 'the demo table shrank below the seven ROMs vendored');
});

for (const spec of DEMOS) {
    test(`${spec.rom} boots on ${spec.board} and ${spec.why}`, (t) => {
        let m;
        try {
            m = boot(spec);
        } catch (e) {
            assert.fail(`${spec.rom} threw while booting on ${spec.board}: ${e.message}`);
        }
        if (m === null) {
            // A NAMED skip. "This bench cannot load a ROM the way the UI does"
            // is a finding about the bench, and it must not read as the demo
            // being fine.
            t.skip(`${spec.board}: no loadROM/load on the machine — NOT verified here`);
            return;
        }

        // The documented chip set is present and reachable.
        for (const c of spec.chips) {
            assert.ok(m.chips?.[c], `${spec.rom}: ${spec.board} has no ${c}, which its header names`);
        }

        // THE FIRST OBSERVABLE, and this is the assertion that carries the
        // file. Its earlier form was `assert.ok(m.cpu)` plus a refusal scan,
        // and 32 KiB OF ZEROS PASSED ALL EIGHT TESTS -- a boot gate that could
        // not tell a demo from an empty ROM. Found by running that mutation,
        // not by reading it.
        assert.ok(spec.observe(m),
            `${spec.rom}: booted on ${spec.board} but did nothing observable.\n`
            + `  expected: ${spec.expect}\n`
            + `  saw:      ${spec.saw(m)}`);

        const refusals = typeof m.chipRefusals === 'function' ? m.chipRefusals() : [];
        const fatal = refusals.filter((r) => /not a .* command|unimplemented/i.test(r.feature));
        assert.deepEqual(fatal, [],
            `${spec.rom}: the machine refused something structural while running:\n  `
            + fatal.map((r) => `${r.part}: ${r.feature}`).join('\n  '));
    });
}

/*
 * MUTATION RECORD. Replacing any one of the seven with 32 KiB of zeros turns
 * exactly that ROM's test red and leaves the other six green. Verified for
 * blink (control stays 0x9b, outB stays 0), keyboard (imr stays 0x00 so IRQ1
 * is never unmasked) and the five display demos (displayRevision stays 0).
 */
