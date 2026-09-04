// THE 8086 PSEUDOCODE EXAMPLES, WHICH ARE THE ONLY WAY MOST PEOPLE WILL EVER
// REACH THIS TIER.
//
// Everything the back end can do is worth nothing to a learner who cannot
// find it. These four are the entry points, and they are gated here for the
// reason the ASM examples are: an example that ships and does not run is
// worse than no example, because it teaches that the tool is broken.
//
// The gate that matters is not "it compiles" — it is that each one is OFFERED
// in the editor's picker. `pins` shipped in the ASM example file for days
// while being reachable from nowhere, because the module that lists examples
// imported a different export.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const L = new URL('../overlay/scratch-gui/src/lib/', import.meta.url);
const SB3Creator = (await import(
    new URL('../packages/scratch-gui/src/lib/sb3-creator.js', import.meta.url).href)).default;
const EXAMPLES = (await import(new URL('sb3-creator-examples.js', L).href)).default;
const {buildPseudocode8086} = await import(new URL('bw-asm/pseudocode-8086.js', L).href);
const {createI8086DosBench} = await import(new URL('bw-debug/i8086-dos-bench.js', L).href);

const IDS = ['i8086_blink', 'i8086_keypad', 'i8086_events', 'i8086_analog'];

test('every 8086 example is OFFERED in the editor, not merely present', () => {
    // The failure this guards: shipping in the examples file and being listed
    // nowhere. It has happened once already on the ASM side.
    const importer = readFileSync(new URL(
        '../overlay/scratch-gui/src/components/tw-pseudocode/pseudocode-importer.jsx',
        import.meta.url), 'utf8');
    for (const id of IDS) {
        assert.ok(EXAMPLES[id], `${id} is missing from sb3-creator-examples.js`);
        assert.ok(importer.includes(`'${id}'`), `${id} exists but the picker does not list it`);
    }
});

for (const id of IDS) {
    test(`${id} parses clean, lowers, and runs`, async () => {
        const source = EXAMPLES[id];
        const creator = new SB3Creator();
        creator.parse(source);
        assert.deepEqual(creator.warnings || [], [],
            'a shipped example must not warn at the parser');
        const out = await buildPseudocode8086({project: creator.project, source});
        assert.ok(out.bytes.length > 0);
        const bench = await createI8086DosBench(
            {bytes: out.bytes, format: out.format, chips: out.chips});
        let n = 0;
        while (n < 3_000_000 && !bench.terminated) { bench.step(); n++; }
        assert.ok(n > 100, 'it executed something');
    });
}

test('the blink example really is the STC blink with its DEVICE line changed', () => {
    // The claim the tier rests on, asserted rather than described: the two
    // programs differ in their DEVICE line and in the two lines that are 8051
    // FACTS (an 11.0592 MHz crystal, and ACTIVE LOW for a chip that cannot
    // source current) -- not in their logic.
    // CODE ONLY. The first version of this test grepped the whole text and
    // failed on the 8086 example's own COMMENT, which explains that there is
    // no CLOCK line -- so the prose describing the absence looked like the
    // thing being absent. Comments are stripped before anything is asserted.
    const code = (t) => t.split('\n').filter(l => !/^\s*#/.test(l)).join('\n');
    const stc = code(EXAMPLES.stc_blink), i86 = code(EXAMPLES.i8086_blink);
    const body = (t) => t.split('\n')
        .filter(l => /^\s*(turn|wait|WHEN|FOREVER|REPEAT)/.test(l))
        .map(l => l.trim()).join('\n');
    assert.ok(body(i86).length > 0);
    assert.ok(body(stc).includes('turn on led1'), 'and the STC one still says what it said');
    assert.match(stc, /CLOCK 11059200/, 'the 8051 declares its crystal');
    assert.ok(!/CLOCK/.test(i86), 'and the 8086 does not, because it has no such fact');
    assert.match(stc, /ACTIVE LOW/, 'the 8051 sinks current');
    assert.ok(!/ACTIVE LOW/.test(i86), 'and the 8255 drives both ways');
});
