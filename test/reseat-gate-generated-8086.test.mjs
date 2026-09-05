/**
 * Option 3 of the reseat gate: the 8086 program is GENERATED from pseudocode,
 * not hand-asserted.
 *
 * The bw-board reseat gate proves a reseated CIRCUIT runs the same program the
 * 6502 original does. But its 8086 program was a hand-written ROM held constant
 * — "equivalent to the 6502 program" was an assertion no test checked. This
 * lives in lite (not bw-board) because it is the one place buildPseudocode8086
 * and the vendored bw-board gate coexist without a dependency cycle: it compiles
 * a walking-bit PORT program to 8086 machine code, runs THAT on the reseated
 * circuit, and gates the result against the 6502 baseline. The 8086 program's
 * equivalence is now generated, not asserted.
 *
 * The 6502 back end does not exist (RESEAT-GATE.md), so the 6502 baseline is
 * still hand-written — one end generated is the ceiling until it does.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { INTEGRATED, REPO } from './helpers/bw-integrated.mjs';

const SB3Creator = (await import(path.join(INTEGRATED, 'src/lib/sb3-creator.js'))).default;
const { buildPseudocode8086 } = await import(path.join(INTEGRATED, 'src/lib/bw-asm/pseudocode-8086.js'));
const { extract8086Machine } = await import(path.join(INTEGRATED, 'src/lib/bw-board/i8086-extract.js'));
const { I8086Machine } = await import(path.join(INTEGRATED, 'src/lib/bw-board/i8086-machine.js'));
const { extract6502Machine } = await import(path.join(INTEGRATED, 'src/lib/bw-board/m6502-extract.js'));
const { M6502Machine } = await import(path.join(INTEGRATED, 'src/lib/bw-board/m6502-machine.js'));
const { reseatGate } = await import(path.join(INTEGRATED, 'src/lib/bw-board/reseat-gate.js'));

const FIX = path.join(REPO, 'test/fixtures/reseat');
const GALLERY = JSON.parse(readFileSync(path.join(FIX, 'e4-via-blink.json'), 'utf8'));
const RESEATED = JSON.parse(readFileSync(path.join(FIX, 'e4-reseated-8086.json'), 'utf8'));

// The GENERATED 8086 program: a walking bit on PORT leds = P2 (→ 8255 port B).
// Changing only the DEVICE line reseats it; the 6502 baseline below is the same
// walk hand-written, because there is no 6502 back end to lower this to.
// FOREVER, so the walk repeats continuously like the 6502 baseline's JMP loop —
// without it the program runs the eight LEDs once and falls off the end (the CPU
// then executes past the code and the observable picks up a stray 0x00), which
// is a program-structure difference, not a reseat one. Matching structure on
// both ends is what makes the comparison about the reseat.
const WALKING_BIT = `DEVICE i8086
PORT leds = P2 OUTPUT
GLOBAL b
WHEN flag clicked:
  FOREVER:
    set b to 1
    REPEAT 8:
      set leds to b
      change b by b
`;

// ---- the 6502 original (hand-written walking bit on the VIA's port B) --------
function build6502Original() {
    const cfg = extract6502Machine(GALLERY);
    assert.ok(cfg.ok, 'e4-via-blink extracts to a 6502 machine');
    cfg.clockHz = 1_000_000;
    const via = cfg.chips.find((c) => c.kind === 'via').at;
    const lo = (a) => a & 0xff, hi = (a) => (a >> 8) & 0xff;
    const prog = [
        0xa9, 0xff, 0x8d, lo(via + 2), hi(via + 2), 0xa9, 0x01, 0x8d, lo(via), hi(via),
        0xa0, 0x00, 0xc8, 0xd0, 0xfd, 0x0a, 0xd0, 0xf5, 0xa9, 0x01, 0x4c, 0x07, 0x80,
    ];
    const rom = new Uint8Array(0x8000);
    rom.set(prog, 0); rom[0x7ffc] = 0x00; rom[0x7ffd] = 0x80;
    const m = new M6502Machine(cfg); m.loadRom(rom); m.reset();
    return m;
}
const read6502PortB = (m) => ({ out: m.chips.via1._pbOut(), dir: m.chips.via1.ddrb });

// ---- the reseated 8086, running the GENERATED program ------------------------
async function reseated8086Generated() {
    const creator = new SB3Creator();
    creator.parse(WALKING_BIT);
    const built = await buildPseudocode8086({ project: creator.project, source: WALKING_BIT });
    assert.equal(built.format, 'com', 'the lowering emits a DOS .COM');
    const romBytes = new Uint8Array(built.bytes);

    const cfg = extract8086Machine(RESEATED);
    assert.ok(cfg.ok, `reseated circuit extracts: ${(cfg.reasons || []).join('; ')}`);
    const ppiName = cfg.chips.find((c) => c.kind === 'ppi').name;
    const build = () => {
        const m = new I8086Machine(cfg);
        m.reset();
        // A .COM loads at CS:0100; enter there with the segments a .COM expects.
        // Bare-metal is enough — a walking bit is pure PORT I/O plus a stack.
        m.mem.set(romBytes, 0x100);
        m.cpu.cs = 0; m.cpu.ip = 0x100; m.cpu.ds = 0; m.cpu.es = 0; m.cpu.ss = 0; m.cpu.sp = 0xFFFE;
        return m;
    };
    const read = (m) => ({ out: m.chips[ppiName].outB, dir: m.chips[ppiName].dirB });
    return { build, read, steps: 40_000, port: 'B', bytes: romBytes.length };
}

test('option 3: the GENERATED 8086 program walks the reseated circuit like the 6502 baseline', async () => {
    const reseat = await reseated8086Generated();
    assert.ok(reseat.bytes > 0, 'buildPseudocode8086 produced a non-empty ROM');
    assert.equal(reseat.port, 'B', 'the pseudocode PORT lowered to the 8255 port the reseat wired the LEDs to');

    const r = reseatGate(
        { build: build6502Original, read: read6502PortB, steps: 6000 },
        reseat,
    );
    assert.equal(r.verdict, 'MATCH', r.reason);
    assert.deepEqual(r.expected, [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80],
        'the 6502 baseline walks the eight LEDs');
    assert.deepEqual(r.actual, r.expected,
        'the GENERATED 8086 program walks the SAME eight LEDs on the reseated circuit — equivalence generated, not asserted');
});
