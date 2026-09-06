// The debugger's chip-refusal line: the first consumer of the collector.
//
// The chips on the 8086 board have always recorded what they will not do. Until
// 2026-09-05 nothing outside each chip read any of it, so a driver programming
// memory-to-memory left a precise record in a field no consumer ever asked for.
// I8086Machine.chipRefusals() collected them; this is the first thing that
// SHOWS them, which is the half that makes the collector worth having. An
// announcement with no reader is the same silence it replaced.
//
// WHAT IS GATED HERE, and why each is not the others:
//
//   1. A real 8086 program — not a poked field — reaches the panel's model. The
//      test assembles `out 08h, al` and runs it, because "the chip records it"
//      and "a program that does the thing records it" are different claims and
//      only the second is what a learner will hit.
//   2. A clean machine produces NO line. Without this, a model that returned a
//      constant row would pass (1), and the row asserted there would be evidence
//      of nothing.
//   3. The model reads ONLY chipRefusals(). Asserted by construction — a fake
//      machine that exposes the collector and NOTHING ELSE still produces the
//      line — and by source, so the panel cannot grow a shortcut into
//      machine.chips later and keep passing.
//   4. The row shape comes from the imported contract, never a retyped list.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve, dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {I8086Machine, PCXT8086, BREADBOARD8086}
    from '../overlay/scratch-gui/src/lib/bw-board/i8086-machine.js';
import {assembleRaw} from '../overlay/scratch-gui/src/lib/bw-board/i8086-asm.js';
import {chipRefusalLines, chipRefusalLine, formatAnchor, formatCount}
    from '../overlay/scratch-gui/src/lib/bw-debug/chip-refusal-lines.js';
import {ROW_FIELDS} from '../overlay/scratch-gui/src/lib/bw-board/chip-ledger.js';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Source with comments removed.
 *
 * NOT AN OPTIMISATION — the first version of the gate below failed on its own
 * documentation. The runner carries a comment saying "reaching into
 * adapter.machine.chips would work today and would quietly stop being the whole
 * story", which is exactly the sentence that should be there, and a rule
 * matching the plain text of the thing it forbids goes red on the explanation of
 * why it is forbidden. That is lego-be's twenty-second species — a rule that
 * matches its own output — reached from the other end, and the only fix that
 * does not punish writing the comment is to read code as code.
 */
const code = (text) => text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n').map(l => l.replace(/(^|[^:])\/\/.*$/, '$1')).join('\n');

/** Run a short program in the vendored machine and return it. */
function ran (source, config = PCXT8086) {
    const m = new I8086Machine(config);
    m.mem.set(assembleRaw(`${source}\n hlt\n`, 0), 0x0600);
    Object.assign(m.cpu, {cs: 0, ip: 0x0600, ss: 0, sp: 0x7000, ds: 0, es: 0, halted: false});
    let steps = 0;
    while (steps < 100_000 && !m.cpu.halted) { m.step(); steps++; }
    assert.ok(m.cpu.halted, `the program did not reach its HLT in ${steps} steps`);
    return m;
}

test('a program that asks the 8237 for a block copy produces exactly one line', () => {
    // Command register bit 0 is memory-to-memory. This is what a DMA block-copy
    // driver writes, and the 8237 stores it and behaves as though it were clear
    // — indistinguishable, from the program's side, from a chip that honoured it
    // and had nothing to do.
    const m = ran(' mov al, 01h\n out 08h, al');
    const lines = chipRefusalLines(m.chipRefusals());
    assert.equal(lines.length, 1, `expected one line, got ${JSON.stringify(lines)}`);
    const [line] = lines;
    assert.equal(line.part, 'dma1');
    assert.match(line.text, /^dma1: /, 'the line leads with the part, so a reader knows who refused');
    assert.match(line.text, /moves nothing and the temporary register reads back zero/,
        'the line carries the SYMPTOM — what the program gets instead — not only the feature. '
        + 'A line naming the gap without naming the effect tells a learner what they are looking '
        + 'at and nothing about what it did to their code.');
    assert.match(line.text, /at 08h/,
        'the line carries the address the program touched. A symptom sentence cannot be clicked; '
        + 'the debugger points at the instruction with this.');
    assert.doesNotMatch(line.text, /refusals/,
        'one occurrence must not print a count — "1 refusals" is noise that makes a real count '
        + 'harder to notice');
});

test('the ASM bench refuses through the chip it actually has', () => {
    // THE BROWSER GATE'S PROGRAM, ASSERTED IN NODE. scripts/verify-debug-chip-refusal-line.mjs
    // drives the ASM route, which boots BREADBOARD8086 — `ppi1` and `uart1`, and
    // NO DMA CONTROLLER. The 8237 the test above uses lives on PCXT8086, the
    // config the BIOS and Machine Loader routes build.
    //
    // The first version of that browser gate wrote the memory-to-memory command
    // to port 08h and waited forty seconds for a line that could never appear:
    // the port decoded to nothing, nothing refused anything, and the timeout read
    // as a broken panel rather than as a program aimed at absent hardware. This
    // assertion is here so the next config change fails in a two-second node run
    // instead of a forty-second browser one.
    const chips = Object.keys(new I8086Machine(BREADBOARD8086).chips);
    assert.deepEqual(chips.sort(), ['ppi1', 'uart1'],
        `the ASM bench's chips changed to ${chips.join(', ')} — the browser gate's program targets `
        + "ppi1's control port and must be retargeted with them");
    // ppi1 is at port 0, so its control port is 3. A0h selects mode 1 on group A:
    // what a driver writes wanting the strobed handshake, which the 8255 accepts
    // and runs as mode 0.
    const lines = chipRefusalLines(ran(' mov al, 0A0h\n out 03h, al', BREADBOARD8086).chipRefusals());
    assert.equal(lines.length, 1, `expected one line, got ${JSON.stringify(lines)}`);
    assert.equal(lines[0].part, 'ppi1');
    assert.match(lines[0].text, /waits on a bit that never moves/,
        'the symptom must say what the PROGRAM sees — a status bit that never moves — not merely '
        + 'that a mode is unmodelled');
    assert.match(lines[0].text, /at 03h/, 'the control port the mode word arrived on');
    // And the clean program the browser gate runs first must stay clean here too.
    assert.deepEqual(chipRefusalLines(ran(' mov al, 00h\n mov bl, al', BREADBOARD8086).chipRefusals()), [],
        "the browser gate's absent case produces a line on this bench, so its first assertion "
        + 'would be proving nothing');
});

test('a machine that has refused nothing produces no line at all', () => {
    // The other direction of species 1. A constant row would satisfy the test
    // above; this is what makes that row evidence of the program that caused it.
    const m = new I8086Machine(PCXT8086);
    assert.deepEqual(chipRefusalLines(m.chipRefusals()), [],
        'a fresh bench is reporting refusals, so the line above is not caused by the program '
        + 'that appears to cause it');
    // And after a program that touches nothing unmodelled.
    assert.deepEqual(chipRefusalLines(ran(' mov al, 00h').chipRefusals()), [],
        'a program that asks for nothing unmodelled produced a refusal line');
});

test('the model reads the collector and nothing else — proved by construction', () => {
    // A machine with the collector and NO chips at all. If the model reached
    // into machine.chips for any part of the line, this throws or returns
    // nothing; it returns the line, so the collector is the only input.
    const collectorOnly = {
        chipRefusals: () => [{part: 'dma1', kind: 'chip', feature: 'memory-to-memory transfer',
            symptom: 'a block copy moves nothing', count: 1, at: 0x08, ats: [0x08], atsMore: false}]
    };
    const lines = chipRefusalLines(collectorOnly.chipRefusals());
    assert.equal(lines.length, 1);
    assert.match(lines[0].text, /dma1: a block copy moves nothing — at 08h/);
});

test('the panel reaches refusals only through debugChipRefusals', () => {
    // Source, not behaviour, because the failure this catches is a FUTURE edit:
    // someone adding `runner.machine.chips.dma1.unmodelled` to the panel for one
    // more field would work, would pass every behavioural test above, and would
    // silently stop being the whole story on the next chip the board gains.
    const panel = code(readFileSync(join(repo,
        'overlay/scratch-gui/src/components/tw-pseudocode/debug-panel.jsx'), 'utf8'));
    assert.match(panel, /debugChipRefusals\(\)/,
        'the panel does not call debugChipRefusals at all, so this gate is checking nothing');
    // The stripper must strip. If it silently returned the text unchanged this
    // gate would be back to failing on comments, and if it stripped too much it
    // would pass on real code — so both directions are pinned on a fixture.
    assert.equal(code('a(); // .chips. here\nb();').includes('.chips.'), false);
    assert.equal(code('/* unmodelled */ keep();').includes('unmodelled'), false);
    assert.equal(code("const u = 'https://x/y'; // c").includes('https://x/y'), true,
        'the stripper ate a URL, so it is removing code and this gate proves nothing');
    for (const forbidden of ['chipRefusals()', '.chips.', 'unmodelled', 'lastRefusal', 'modeWarning']) {
        assert.ok(!panel.includes(forbidden),
            `debug-panel.jsx names '${forbidden}'. The panel must reach refusals only through the `
            + 'runner handle, so a chip added later arrives with no panel edit — and a panel that '
            + 'knows a chip field is a panel that has to be edited when the next chip differs.');
    }
    // And the runner's own path is the collector, not the chip map.
    const runner = code(readFileSync(join(repo,
        'overlay/scratch-gui/src/lib/bw-debug/debug-runner.js'), 'utf8'));
    assert.match(runner, /adapter\.machine\?\.chipRefusals/,
        'the runner no longer captures the collector by name');
    assert.ok(!/adapter\.machine\.chips\b/.test(runner),
        'the runner reaches into machine.chips for refusals; the collector is the only supported path');
});

test('the row shape is the imported contract, not a list retyped here', () => {
    // ROW_FIELDS is bw-board's single machine-readable copy of the shape its
    // CHIP-REFUSALS.md explains. lite restated it once, in a gate, and the fix
    // upstream was to export it — a doc is the right place to EXPLAIN a contract
    // and the wrong place to be its only machine-readable copy. So the assertion
    // is that the collector's row matches the CONTRACT, with no third list.
    assert.ok(Array.isArray(ROW_FIELDS) && ROW_FIELDS.length > 0,
        'ROW_FIELDS is not an array, so every check below is vacuous');
    const m = ran(' mov al, 01h\n out 08h, al');
    const [row] = m.chipRefusals();
    assert.deepEqual(Object.keys(row).sort(), [...ROW_FIELDS].sort(),
        'the collector row and the imported contract disagree. One of them moved without the '
        + 'other, which is the drift ROW_FIELDS exists to make impossible.');
    assert.equal(row.at, row.ats[0],
        '`at` is derived as the FIRST address, not a second claim, so the two cannot disagree');
});

test('the anchor renders the set and the count separately, and says when it truncated', () => {
    // `ats` is a set because `count` is a total. The ledger's first version kept
    // one `at` that a later address overwrote, so a feature refused at two ports
    // printed count: 2 beside ONE address — a true count next to a location that
    // quantified over less than the count did. Folding them back together in the
    // renderer would rebuild that defect one layer up.
    const base = {part: 'p', kind: 'chip', feature: 'f', symptom: 's', count: 1,
        at: 0x08, ats: [0x08], atsMore: false};
    assert.equal(formatAnchor(base), 'at 08h');
    assert.equal(formatCount(base), null, 'a single occurrence prints no count');
    assert.equal(formatAnchor({...base, ats: [0x08, 0x0b]}), 'at 08h, 0Bh');
    assert.equal(formatCount({...base, count: 3}), '3 refusals');
    assert.equal(formatAnchor({...base, ats: [0x08, 0x0b], atsMore: true}), 'at 08h, 0Bh and more',
        'AT_CAP truncation must be visible: a capped list that does not say so reads as complete, '
        + 'and a debugger showing eight ports when the program touched thirty is lying by omission');
    // null means "no anchor, render the sentence alone" — never 0. An invented
    // address points the debugger somewhere the program never touched.
    assert.equal(formatAnchor({...base, at: null, ats: []}), null);
    assert.equal(chipRefusalLine({...base, at: null, ats: []}).text, 'p: s');
});

test('a row with nothing sayable is dropped rather than rendered blank', () => {
    // "dma1: " tells a learner something is wrong and refuses to say what, and
    // reads as a rendering bug rather than a missing symptom — so it gets
    // reported to the wrong lane.
    assert.deepEqual(chipRefusalLines([{part: 'dma1', kind: 'chip', feature: null, symptom: null,
        count: 1, at: null, ats: [], atsMore: false}]), []);
    assert.equal(chipRefusalLine({part: '', symptom: 'x'}), null);
});
