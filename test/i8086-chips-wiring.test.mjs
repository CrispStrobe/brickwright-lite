// THE HARDWARE A PROGRAM ASKS FOR HAS TO SURVIVE FOUR HOPS TO REACH THE BOARD.
//
// `buildPseudocode8086` returns `chips` — an ADC0809 for an ANALOG pin, a PIC
// and an IRQ0-wired timer for a second script. Between there and the machine
// it passes through a CustomEvent, a handler that destructures a fixed field
// list, a second handler that destructures another one, and the runner. Every
// one of those is a place a new field is dropped SILENTLY: nothing throws,
// nothing warns, and the program reaches a board without its hardware.
//
// That is not hypothetical. The field was added to the build and to the bench
// on 2026-09-04 and reached NEITHER through the GUI, because three hops in
// between had never heard of it — a scheduled program built from the editor
// would have found no clock and spun in every `wait`.
//
// These are source-text assertions, which is a weak form of test. They are
// here because the alternative is mounting three React components to prove
// that a destructure names a field, and because the failure they guard has no
// other symptom at this layer: the runtime check catches it, but only after
// the learner has already seen the program fail.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = (p) => readFileSync(new URL(`../overlay/scratch-gui/src/${p}`, import.meta.url), 'utf8');

test('the build RETURNS the chips it asked for', () => {
    const src = read('lib/bw-asm/pseudocode-8086.js');
    assert.match(src, /adc0809/, 'an ANALOG pin adds a converter');
    assert.match(src, /kind: 'pic'/, 'a scheduled program adds an interrupt controller');
    assert.match(src, /irq: 0/, 'and rewires the timer to drive it');
    assert.match(src, /\n\s+chips,/, 'and buildPseudocode8086 returns them');
});

test('every hop between the build and the board names `chips`', () => {
    // hop 1: the editor dispatches it with the ROM
    assert.match(read('components/tw-pseudocode/pseudocode-importer.jsx'),
        /chips: out\.chips/, 'the importer puts it on the event');
    // hops 2 and 3: two separate destructures, and BOTH must list it
    const panel = read('components/tw-pseudocode/debug-panel.jsx');
    assert.match(panel, /const \{rom, target, slotId, profile, chips\}/,
        'the rom-ready handler destructures it');
    assert.match(panel, /const \{slotId, bytes, kind, profile, name, romAt, chips\}/,
        'and so does the media loader — a fixed field list drops anything not named');
    assert.match(panel, /chips: chips \|\| null/, 'and it reaches the boot media');
    // hop 4: the runner puts it on the machine
    assert.match(read('lib/bw-debug/debug-runner.js'), /chips: bootMedia\.chips/,
        'and the runner hands it to the bench');
});

test('the bench merges requested chips BY NAME, not by appending', () => {
    // A scheduled program asks for a `pit1` wired to IRQ0 and the preset
    // already has a `pit1` without one. Two chips of the same name at the same
    // port is not a board.
    const bench = read('lib/bw-debug/i8086-dos-bench.js');
    assert.match(bench, /filter\(\s*\(c\) => !chips\.some\(\(x\) => x\.name === c\.name\)\)/,
        'the preset entry of the same name is replaced');
});
