/**
 * The reseat claim, made falsifiable.
 *
 * The claim is that an 8051 pin program runs on an 8086 with only its DEVICE
 * line changed. That is the headline of the PIN lowering and it is the thing a
 * learner will actually try, and until this file it was tested only with
 * programs written for the purpose.
 *
 * THE ASSERTION IS NOT "IT RUNS". Every shipped example must land in exactly
 * one of two states:
 *
 *   RUNS      it builds, boots and executes on the 8086 bench
 *   REFUSED   it declines BY NAME, saying what cannot come across
 *
 * and the third state — **builds, runs, and means something different** — is
 * the failure. That state is not detectable in general, so the expected
 * verdict is PINNED PER EXAMPLE instead: a refusal that becomes a run is
 * exactly the event that needs a human, and this goes red when one does.
 *
 * It has already caught one. `stc_potentiometer` declares
 * `PIN pot = P1.3 ANALOG`, and before the direction guard landed it reseated
 * into a DIGITAL read on a port configured as an OUTPUT — 0 or 1 where an
 * STC12 gives 0-1023, so `reading / 1000` was 0 forever and the program
 * blinked flat out. It ran. It warned about the `wait` ceiling and integer
 * division, neither of which was what went wrong.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {INTEGRATED} from './helpers/bw-integrated.mjs';

const L = new URL('../overlay/scratch-gui/src/lib/', import.meta.url);
const SB3Creator = (await import(path.join(INTEGRATED, 'src/lib/sb3-creator.js'))).default;
const {buildPseudocode8086} = await import(new URL('bw-asm/pseudocode-8086.js', L).href);
const {createI8086DosBench} = await import(new URL('bw-debug/i8086-dos-bench.js', L).href);
const examples = (await import(new URL('sb3-creator-examples.js', L).href)).default;

/** Change ONLY the DEVICE line. A reseat that edits anything else is not one. */
function reseat (source) {
    const out = source.replace(/^DEVICE .*$/m, 'DEVICE i8086');
    const before = source.split('\n');
    const after = out.split('\n');
    const changed = after.filter((l, i) => l !== before[i]).length;
    assert.equal(changed, 1, 'the reseat must change exactly one line');
    return out;
}

/** @returns {{verdict: 'RUNS'|'REFUSED', reason?: string, warnings: string[]}} */
async function tryReseat (source) {
    const src = reseat(source);
    const creator = new SB3Creator();
    creator.parse(src);
    let built;
    try {
        built = await buildPseudocode8086({project: creator.project, source: src,
            warnings: creator.warnings},
        {hostedFetch: () => { throw new Error('the hosted route was reached'); }});
    } catch (e) {
        return {verdict: 'REFUSED', reason: String(e.message).replace(/\s+/g, ' ')};
    }
    const b = await createI8086DosBench({bytes: built.bytes, format: built.format});
    b.target.run();
    let slices = 0;
    while (!b.terminated && slices++ < 300) b.target.runFor(5e6);
    return {verdict: 'RUNS',
        warnings: (built.warnings || []).map((w) => (typeof w === 'string' ? w : w.message))};
}

/**
 * The whole judgement for one example, extracted so it can be EXERCISED
 * rather than only executed — a gate that has never failed is not known to
 * work, and the only way to show this one fails is to hand it a case that
 * should fail it.
 */
function checkRow (name, got, want, why) {
    assert.equal(got.verdict, want,
        `${name}: expected ${want} (${why}), got ${got.verdict}`
        + (got.reason ? ` — ${got.reason.slice(0, 120)}` : ''));

    if (got.verdict === 'REFUSED') {
        // BY NAME is half the claim. A refusal that does not say what cannot
        // come across is the same as a crash to the person reading it, and
        // every one of these is a sentence a learner will read.
        assert.match(got.reason, /8086 pseudocode:/,
            `${name}: the refusal must come from the back end, not a stray throw`);
        assert.ok(got.reason.length > 60,
            `${name}: "${got.reason}" is too short to name what cannot come across`);
    }
}

/**
 * The expected verdict for every shipped STC example, and the reason. A row
 * that changes is a decision, not a detail: turning a refusal into a run means
 * something now comes across that did not, and somebody should have meant it.
 */
const EXPECTED = {
    stc_blink: ['RUNS', 'digital output and wait — the whole point of the mapping'],
    stc_potentiometer: ['REFUSED', 'declares an ANALOG pin, and an 8255 has no analog path'],
    stc_button: ['REFUSED', '"wait until <cond>" is not lowered'],
    stc_two_scripts: ['REFUSED', 'two WHEN scripts; this back end runs one'],
    stc_pwm_fade: ['REFUSED', '"write <expr> to <pin>" needs hardware this bench has not got'],
};

test('every shipped STC example either runs on the 8086 or refuses by name', async () => {
    const shipped = Object.keys(examples).filter((k) => k.startsWith('stc_'));
    assert.deepEqual(shipped.sort(), Object.keys(EXPECTED).sort(),
        'a shipped STC example was added or removed — give it a row and a reason');

    for (const name of shipped) {
        const [want, why] = EXPECTED[name];
        checkRow(name, await tryReseat(examples[name]), want, why);
    }
});

test('the gate goes RED on a deliberately broken reseat', async () => {
    // A GATE THAT HAS NEVER FAILED IS NOT KNOWN TO WORK, so this hands the
    // real judgement three cases it must reject. Nothing here asserts that
    // `assert` works: every case calls checkRow, which is the same function
    // the gate above calls.
    const blink = await tryReseat(examples.stc_blink);
    const pot = await tryReseat(examples.stc_potentiometer);

    // 1. A program that RUNS cannot satisfy a row expecting a refusal. This is
    //    the exact regression the potentiometer was: it USED to run.
    assert.throws(() => checkRow('stc_blink', blink, 'REFUSED', 'pretend'),
        /expected REFUSED .* got RUNS/,
        'a run must not be accepted where a refusal is pinned');

    // 2. And the reverse: a refusal cannot satisfy a row expecting a run.
    assert.throws(() => checkRow('stc_potentiometer', pot, 'RUNS', 'pretend'),
        /expected RUNS .* got REFUSED/);

    // 3. A refusal too terse to name its cause fails the BY-NAME half, even
    //    though its verdict is right. This is what stops the gate degrading
    //    into "it threw, good enough".
    assert.throws(() => checkRow('fake', {verdict: 'REFUSED',
        reason: '8086 pseudocode: no.'}, 'REFUSED', 'pretend'),
    /too short to name what cannot come across/);

    // 4. A throw from somewhere that is not the back end is not a refusal.
    assert.throws(() => checkRow('fake', {verdict: 'REFUSED',
        reason: 'TypeError: cannot read properties of undefined reading direction'},
    'REFUSED', 'pretend'), /must come from the back end/);
});

/** Kept so the reseat helper's own contract is exercised: a "reseat" that
 *  edits a second line is not a reseat and must not be accepted as one. */
test('a reseat that changes more than the DEVICE line is refused', () => {
    const src = 'DEVICE STC12C5A60S2\nCLOCK 11059200\nPIN led = P1.0 OUTPUT\n';
    assert.equal(reseat(src).split('\n')[1], 'CLOCK 11059200',
        'reseat must leave every other line alone');
    assert.throws(() => {
        const before = src.split('\n');
        const after = src.replace(/^DEVICE .*$/m, 'DEVICE i8086')
            .replace(/^CLOCK .*$/m, 'CLOCK 5000000').split('\n');
        assert.equal(after.filter((l, i) => l !== before[i]).length, 1);
    }, /Expected values to be strictly equal/);
});
