/**
 * A program that cannot make a sound must SAY it cannot, where the silence happens.
 *
 * The owner reported 07-buzzer-siren as broken and believed it had once worked.
 * Measured instead of argued: the example is correct, the referee emits tone
 * events at 440 and 880 Hz on schedule, and the emitted program calls
 * `_board().setTone(...)`. **No board in this repository defines `setTone`.**
 * The board offers `buzzerTone()`, a READER that measures a square wave the
 * circuit already carries; nothing writes a tone into it. So on the 8051 the
 * note never sounds — and the compiled-C path agrees, emitting `tone_set` only
 * when the core is AVR.
 *
 * That is the documented gap, not a regression. Its whole text lived in a help
 * panel a user has to open, which is why the owner spent an evening believing
 * the example had broken. The fix is not tone support (that is another lane's
 * work) — it is that the program says so at generation time.
 *
 * The two drivers also disagreed about the same silence: the JS one guarded on
 * `b.setTone` and skipped, the Python one called it unguarded and would raise
 * AttributeError. Same program, silent in one language and a crash in the other.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';

const {SOURCE, REPO: ROOT} = await import('./helpers/bw-integrated.mjs');
const SB3Creator = (await import(path.join(SOURCE, 'src', 'lib', 'sb3-creator.js'))).default;

const compile = id => {
    const creator = new SB3Creator();
    creator.parse(readFileSync(path.join(ROOT, `overlay/scratch-gui/examples/${id}/program.bw`), 'utf8'));
    const out = creator.generatePython(creator.project, {driver: 'simulator'});
    return {creator, code: Array.isArray(out) ? out.join('\n') : String(out.code || out)};
};

test('a TONE pin on a target with no tone driver warns, in the program, naming what does work', () => {
    const {creator} = compile('07-buzzer-siren');
    const tone = creator.warnings.filter(w => /tone/i.test(w));
    assert.equal(tone.length, 1, `expected exactly one tone warning, got ${tone.length}: ${tone.join(' | ')}`);
    assert.match(tone[0], /SILENT/, 'the warning must say the program makes no sound');
    assert.match(tone[0], /8051|Pico/, 'the warning must name the targets that cannot');
    assert.match(tone[0], /AVR|Arduino/, 'the warning must name the target that can');
    assert.match(tone[0], /nothing is broken in your program/i,
        'the owner believed the example had broken; the warning must say it has not');
});

test('a program with no TONE pin gets no such warning (mutation)', () => {
    const {creator} = compile('12-dual-blink');
    assert.deepEqual(creator.warnings.filter(w => /tone/i.test(w)), [],
        'a program that never mentions tone must not be warned about it');
});

test('the silence is real: no board defines setTone, so the emitted call lands nowhere', () => {
    // If this ever fails, tone gained a driver and the warning above is stale —
    // which is the good outcome, and this names it rather than leaving the
    // warning to rot.
    const board = readFileSync(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-board/board.js'), 'utf8');
    assert.doesNotMatch(board, /^\s*setTone\s*\(/m,
        'the board now defines setTone — tone may work; re-measure and drop the warning');
    assert.match(board, /^\s*buzzerTone\s*\(/m,
        'buzzerTone is the reader the board does offer; its absence would change this diagnosis');
});

test('both language drivers treat the missing board method the same way', () => {
    const {code} = compile('07-buzzer-siren');
    assert.match(code, /hasattr\(b, "setTone"\)/,
        'the Python driver must guard, or the same program is silent in JS and a crash in Python');
    const source = readFileSync(path.join(ROOT, 'overlay/scratch-gui/src/lib/sb3-creator.js'), 'utf8');
    assert.match(source, /if \(p && b && b\.setTone\) b\.setTone\(/,
        'the JS driver guard moved; the two drivers must stay symmetric');
});

test('the compiled-C path agrees: tone_set is emitted for AVR only', () => {
    const source = readFileSync(path.join(ROOT, 'overlay/scratch-gui/src/lib/sb3-creator.js'), 'utf8');
    assert.match(source, /this\._cUses\.tone && this\._core === 'avr'/,
        'the C emitter no longer restricts tone_set to AVR — re-measure the gap');
});
