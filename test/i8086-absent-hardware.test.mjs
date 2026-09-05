// EVERY FEATURE THAT REQUESTS HARDWARE MUST NOTICE WHEN IT IS ABSENT.
//
// This is a contract, not a collection. Three times in one afternoon a
// feature of this back end ran happily on a board that did not have the chip
// it asked for, and produced a plausible result:
//
//   an ANALOG pin with no ADC0809    printed 1020 of 1023  (open bus, scaled)
//   an Ethernet example with no NIC  printed "the card heard its own frame"
//   a scheduled program with no PIC  spun in every `wait`, forever
//
// None of them failed. Open bus answers FFh, which is a truthful report of an
// undriven wire and is indistinguishable from data: FFh reads as ready, as
// full scale, and as every status bit set. The fallback is CORRECT, which is
// exactly what makes the dead feature invisible.
//
// THE RULE: a feature that asks for hardware must probe for a state the
// absent hardware CANNOT PRODUCE, and refuse if it does not find it.
//
//   ADC      -> EOC goes LOW while converting; open bus can only read high
//   NE2000   -> the PROM holds 'WW' (57h) at offset 28; FFh is not 57h
//   scheduler-> the tick count advances; a dead timer leaves it at zero
//
// Where no such state exists, the feature genuinely cannot tell itself from
// its own absence, and that is worth knowing before it ships rather than
// after a learner has believed a number.
//
// AND THE COROLLARY, WHICH IS A DESIGN RULE RATHER THAN A TEST — lego-a4's,
// after correcting a reading of mine that was wrong on this exact axis.
//
// I had claimed a missing table entry and a missing chip were the same defect
// at different layers. They are not. A table lookup returns `undefined`, and
// no legitimate cycle count collides with it: the absence is UNFORGEABLE by
// construction, which is why that layer needs only a counter while this one
// needs EOC, a PROM signature and an advancing tick. Open bus can forge
// `ready`. A missing key cannot forge a value.
//
//   **DO NOT MANUFACTURE FORGEABILITY.**
//
// A fallback that substitutes a PLAUSIBLE value destroys the only signal the
// layer had. Return the null and count the miss, and a counter suffices;
// substitute the nearest reasonable answer and you are back to needing a
// probe for a state that no longer exists.
//
// This is uncomfortable because most fallbacks are written precisely to
// smooth over an absence — and smoothing is exactly what removes the tell.
// `chip.read() ?? 0` is the shape to be suspicious of.
//
// A NEW FEATURE THAT REQUESTS A CHIP BELONGS IN THIS FILE. If you cannot
// write the case, you have not found the unforgeable state yet.
import {test} from 'node:test';
import assert from 'node:assert/strict';

const L = new URL('../overlay/scratch-gui/src/lib/', import.meta.url);
const SB3Creator = (await import(
    new URL('../packages/scratch-gui/src/lib/sb3-creator.js', import.meta.url).href)).default;
const {buildPseudocode8086} = await import(new URL('bw-asm/pseudocode-8086.js', L).href);
const {createI8086DosBench} = await import(new URL('bw-debug/i8086-dos-bench.js', L).href);

/** Build a pseudocode program, then run it on a board WITHOUT what it asked for. */
async function runStarved (lines, cap = 3_000_000) {
    const source = lines.join('\n');
    const creator = new SB3Creator();
    creator.parse(source);
    assert.deepEqual(creator.warnings || [], [], 'the program itself is valid');
    const out = await buildPseudocode8086({project: creator.project, source});
    assert.ok(out.chips && out.chips.length,
        'the build asked for hardware — otherwise this case proves nothing');
    // Deliberately no `chips`: the requested board is not provided.
    const bench = await createI8086DosBench({bytes: out.bytes, format: out.format});
    let n = 0;
    while (n < cap && !bench.terminated) { bench.step(); n++; }
    return {out, bench, screen: bench.screenText().filter(Boolean).join(' '), steps: n};
}

test('ANALOG with no converter refuses, and does NOT report a reading', async () => {
    const r = await runStarved(['DEVICE i8086', 'PIN pot = P1.3 ANALOG',
        'WHEN flag clicked:', '  say (read pot)']);
    assert.match(r.screen, /no converter answered/);
    // The specific number matters: FFh scaled by four is 1020, and that is
    // what it printed before the probe existed.
    assert.ok(!/\b1020\b/.test(r.screen), 'no fictional reading');
    assert.ok(r.bench.terminated, 'and it stops rather than carrying on');
});

test('a scheduled program with no timer refuses, and does not spin forever', async () => {
    const r = await runStarved([
        'DEVICE i8086',
        'WHEN flag clicked:', '  wait 0.1 secs', '  say "late"',
        'WHEN flag clicked:', '  say "early"']);
    assert.match(r.screen, /timer never ticked/);
    assert.ok(r.bench.terminated,
        'it exits — the failure it replaces was an infinite spin on a blank screen');
});

test('the chips a build requests are the chips it is starved of', async () => {
    // Guards the case where a feature stops requesting hardware at all: the
    // program would then run on the default board and every case above would
    // pass vacuously, because there would be nothing absent.
    const analog = new SB3Creator();
    const aSrc = 'DEVICE i8086\nPIN pot = P1.3 ANALOG\nWHEN flag clicked:\n  say (read pot)\n';
    analog.parse(aSrc);
    const a = await buildPseudocode8086({project: analog.project, source: aSrc});
    assert.deepEqual(a.chips.map(c => c.kind), ['adc0809']);

    const sched = new SB3Creator();
    const sSrc = 'DEVICE i8086\nWHEN flag clicked:\n  say "a"\nWHEN flag clicked:\n  say "b"\n';
    sched.parse(sSrc);
    const s = await buildPseudocode8086({project: sched.project, source: sSrc});
    assert.deepEqual(s.chips.map(c => c.kind), ['pic', 'pit'],
        'a second script asks for an interrupt controller and an IRQ0 timer');
});
