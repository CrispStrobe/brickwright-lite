// The committed BIOS is executed here, which nothing in this repo did before.
//
// WHY THIS EXISTS, AND WHY IT IS SEPARATE FROM THE PROVENANCE GATE.
// test/i8086-bios-provenance.test.mjs proves the 64K image came from a named
// bw-board sha, assembled by the assembler this tree vendors. It says nothing
// about whether the bytes WORK, and it cannot: a hash is a hash. That gap is
// not hypothetical. Until 2026-09-06 exactly three files in the tree referenced
// the ROM -- rom-paths-exist.test.mjs (checks the string against the filesystem),
// the provenance gate (hashes it), and debug-runner.js. i8086-browser-gate is a
// SOURCE-TEXT gate: it greps verify-i8086-browser.mjs for evidence strings and
// never starts a browser. And debug-runner's ROM path is the no-media fallback,
// which its own comment calls "a path only a user takes", because the tests
// build a machine directly and the Machine Loader always supplies media.
//
// So the shipped BIOS had never been executed by anything but a user, and that
// is how it sat SEVEN bios.asm commits behind the pin with every gate green.
// This file executes it, against lite's own vendored i8086-machine.js,
// i8086-asm.js and upd765.js. Nothing here comes from bw-board.
//
// WHAT IT PINS. Two things a hash cannot see:
//
//   1. POST completes and the machine says so on the CGA text page. The screen
//      text also states the ROM's own account of its floppy support, which is
//      what made the staleness legible: the ROM lite shipped until this commit
//      said "No disk controller: INT 13h is a stub (see HOLE: FDC)" -- no
//      driver at all -- where this one says "drive A did not answer", the
//      driver having spun the motor, seeked and timed out. 24,002 instructions
//      against 1,579,840.
//
//   2. EOT TRACKS THE MEDIUM. The diskette parameter table's EOT byte is the
//      last sector the controller transfers before deciding the track ended.
//      The driver sets MT, so at EOT the chip switches heads. One table
//      describing a 360K disk therefore made a two-sector read at sector 9 of a
//      1.44M disk return sector 9 and then HEAD 1's SECTOR 1 -- with CF clear
//      and AH=00, because the controller did exactly what it was told. ELKS
//      loaded with every second sector wrong and slid into executing zeros.
//      Correct-looking, wrong data.
//
// THE MUTATION IS HISTORICAL RATHER THAN SYNTHETIC. "Pin EOT to a constant"
// is not a hypothesis here -- it is what the previous two ROMs did, and both
// were measured against this same file before it landed:
//
//   bios.asm at            INT 13h read        EOT 360K   EOT 1.44M
//   5584c3f (shipped till  FAILS cf=1 ah=20h   9          9
//     this commit)         (controller failure: no driver at all)
//   88bbdcf78 (the pin)    ok   cf=0 ah=00h    9          9   <- the ELKS bug
//   this ROM               ok   cf=0 ah=00h    9          18
//
// Either of the first two turns this file red, and for its own reason: the
// first on the read, the second on the 1.44M EOT alone.
//
// NO SYMBOLS, BY CONSTRUCTION. A gate over a committed binary must not need the
// source that built it, or it is testing the source. So POST runs with NO media
// -- which reaches HLT deterministically and attempts no boot -- and the disk is
// inserted afterwards, before the INT 13h call that makes the driver probe.
// That needs no `int19` label and no bw-board checkout.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve, dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {I8086Machine, PCXT8086} from '../overlay/scratch-gui/src/lib/bw-board/i8086-machine.js';
import {assembleRaw} from '../overlay/scratch-gui/src/lib/bw-board/i8086-asm.js';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROM = new Uint8Array(readFileSync(join(repo, 'overlay/scratch-gui/static/roms/i8086-bios.bin')));

const G360 = {cylinders: 40, heads: 2, sectors: 9, bytesPerSector: 512};
const G144 = {cylinders: 80, heads: 2, sectors: 18, bytesPerSector: 512};

/** Every sector identifiable, so a sector off the wrong head is recognisable. */
function image (g) {
    const n = g.cylinders * g.heads * g.sectors;
    const img = new Uint8Array(n * 512);
    for (let s = 0; s < n; s++) for (let i = 0; i < 512; i++) img[s * 512 + i] = ((s * 31) + i) & 0xff;
    img[510] = 0x55; img[511] = 0xaa;
    return img;
}

/**
 * POST to HLT with an empty drive. `romAt` is 0x100000 - length, the rule the
 * Machine Loader uses: the image must REACH FFFF0h, where the 8086 fetches its
 * first instruction. Passing the vector's address instead puts the ROM 64K high
 * and the machine executes open bus while reporting that it started fine.
 */
function posted () {
    const m = new I8086Machine(PCXT8086);
    m.loadRom(ROM, 0x100000 - ROM.length);
    m.reset();
    let steps = 0;
    while (steps < 3_000_000 && !m.cpu.halted) { m.step(); steps++; }
    assert.ok(m.cpu.halted,
        `POST did not reach HLT in ${steps} instructions. A ROM that never halts has not `
        + 'finished POST, and every assertion below would be reading a half-initialised machine.');
    return {m, steps};
}

/** The CGA text page as characters. This is what a user actually sees. */
const screen = (m) => {
    const vram = m.mem.subarray(0xb8000, 0xb8000 + (80 * 25 * 2));
    let out = '';
    for (let i = 0; i < vram.length; i += 2) {
        const c = vram[i];
        out += (c >= 32 && c < 127) ? String.fromCharCode(c) : ' ';
    }
    return out.replace(/\s+/g, ' ').trim();
};

/** The table INT 1Eh points at right now, which is the one the driver reads. */
const eot = (m) => m.mem[(((m.mem[0x7a] | (m.mem[0x7b] << 8)) << 4) + (m.mem[0x78] | (m.mem[0x79] << 8))) + 4];

/** Insert a medium, then make the driver probe it with a one-sector read. */
function readOneSector (m, geom) {
    m.chips.fdc1.insert(0, image(geom), geom);
    const code = assembleRaw(
        ' mov ax, 0201h\n mov cx, 0001h\n xor dx, dx\n mov bx, 5000h\n int 13h\n pushf\n pop si\n hlt\n', 0);
    m.mem.set(code, 0x0600);
    Object.assign(m.cpu, {cs: 0, ip: 0x0600, ss: 0, sp: 0x7000, ds: 0, es: 0, halted: false});
    m.cpu.flags |= 0x0200;              // the driver waits on the FDC interrupt
    let steps = 0;
    while (steps < 6_000_000 && !m.cpu.halted) { m.step(); steps++; }
    assert.ok(m.cpu.halted, `the injected INT 13h program did not reach its HLT in ${steps} steps`);
    return {cf: m.cpu.si & 1, ah: m.cpu.ax >> 8, al: m.cpu.ax & 0xff};
}

test('the committed BIOS completes POST and reports the memory it found', () => {
    const {m, steps} = posted();
    const text = screen(m);
    // Species 1: a gate whose corpus is empty passes everything. An all-zero
    // VRAM would make every `includes` below vacuously false, so the screen is
    // asserted to have content before it is asserted to have particular content.
    assert.ok(text.length > 20, `the CGA page is blank after ${steps} instructions: ${JSON.stringify(text)}`);
    assert.match(text, /640K OK/,
        `POST did not report its memory count. Screen was: ${JSON.stringify(text.slice(0, 200))}`);
});

test('the BIOS has a floppy driver, and says so by trying the drive', () => {
    const {m} = posted();
    const text = screen(m);
    // The ROM's own words about its floppy support, asserted BOTH WAYS. Checking
    // only for the good sentence would pass a ROM that printed both; checking
    // only for the absence of the bad one would pass a blank screen, which the
    // length assertion above already refuses.
    assert.doesNotMatch(text, /INT 13h is a stub/,
        'this ROM has no floppy driver at all. That sentence is what lite shipped from 2026-09-04 '
        + 'until the pin move, seven bios.asm commits after the driver was written upstream, and '
        + 'nothing noticed because nothing in this repo executed the ROM.');
    assert.match(text, /drive A did not answer/,
        'with an empty drive a BIOS that HAS a driver reports that the drive did not answer -- it '
        + 'spun the motor, seeked and timed out. Any other wording means the floppy path changed '
        + 'and this gate is now describing a ROM that no longer exists.');
});

test('a 360K disk is read, and is told EOT=9', () => {
    const {m} = posted();
    const r = readOneSector(m, G360);
    assert.equal(r.cf, 0, `the read failed: AH=${r.ah.toString(16)}h (20h is controller failure)`);
    assert.equal(r.ah, 0, `the read reported status AH=${r.ah.toString(16)}h`);
    assert.equal(eot(m), 9,
        'a nine-sector medium must still be told EOT=9. The obvious fix for the 1.44M bug -- change '
        + 'the 9 to an 18 -- breaks here, because a multi-track read REQUIRES the head switch at the '
        + 'end of a 360K track. EOT is a property of the medium, not a constant that was too small.');
});

test('a 1.44M disk is read, and is told EOT=18 — the whole bug', () => {
    const {m} = posted();
    const r = readOneSector(m, G144);
    assert.equal(r.cf, 0, `the read failed: AH=${r.ah.toString(16)}h (20h is controller failure)`);
    assert.equal(r.ah, 0, `the read reported status AH=${r.ah.toString(16)}h`);
    assert.equal(eot(m), 18,
        'a 1.44M disk was told EOT=9, so the controller switches heads at sector 9. A two-sector read '
        + 'at sector 9 then returns sector 9 and HEAD 1 SECTOR 1, with CF clear and AH=00 -- the '
        + 'controller doing exactly what it was told. This is the failure that loaded ELKS with every '
        + 'second sector wrong. It is invisible from the return status; only this byte shows it.');
});
