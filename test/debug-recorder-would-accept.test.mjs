/**
 * wouldAcceptInput — the recorder's admission dry run.
 *
 * It exists so the bw-board debug bridges can ASK "may this input happen?" BEFORE
 * applying it, and get an answer that mutates nothing: a refused input then never
 * reaches the machine and never seeds the dedup map. Today NOTHING calls it — the
 * bridges that will are vendored from bw-board and land on a later pin, and the
 * provider (this recorder, lite's own) ships first. So this file is what makes it
 * not dead code: it drives every refusal condition and the accept case, proves the
 * dry run leaves the recorder untouched, and proves it and appendInput refuse the
 * SAME inputs for the SAME reasons — because if the ASK ever admitted something the
 * TELL throws on, that is worse than no ASK at all.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {RECORDER_SCHEMA, createDebugRecorder} from '../overlay/scratch-gui/src/lib/bw-debug/recorder.js';

const input = (time, producer = 'buttons', payload = {}) => ({
    schema: RECORDER_SCHEMA,
    time: {ticks: BigInt(time), domain: 'oscillator'},
    producer,
    payload
});

// Each case is a valid input with exactly one thing broken (or nothing, for the
// accept case), plus the code appendInput refuses it with. The order case needs a
// prior input, so it carries a `seed`.
const CASES = [
    {name: 'a valid input', make: () => input(10), accept: true},
    {name: 'a wrong schema', make: () => ({...input(10), schema: 99}), code: 'SCHEMA_MISMATCH'},
    {name: 'a missing time object', make: () => ({...input(10), time: undefined}), code: 'INVALID_INPUT'},
    {name: 'a non-object time', make: () => ({...input(10), time: 42}), code: 'INVALID_INPUT'},
    {name: 'an empty producer', make: () => ({...input(10), producer: ''}), code: 'INVALID_INPUT'},
    {name: 'an empty domain', make: () => ({...input(10), time: {ticks: 10n, domain: ''}}), code: 'INVALID_INPUT'},
    {name: 'an unreadable tick', make: () => ({...input(10), time: {ticks: {}, domain: 'oscillator'}}), code: 'INVALID_INPUT'},
    {name: 'a decreasing tick in a domain', seed: () => input(10), make: () => input(5), code: 'INVALID_INPUT_ORDER'}
];

test('wouldAcceptInput gives the right verdict for accept and every refusal', () => {
    for (const c of CASES) {
        const recorder = createDebugRecorder();
        if (c.seed) recorder.appendInput(c.seed());
        const verdict = recorder.wouldAcceptInput(c.make());
        if (c.accept) {
            assert.deepEqual(verdict, {accepted: true}, `${c.name} should be accepted`);
        } else {
            assert.equal(verdict.accepted, false, `${c.name} should be refused`);
            assert.equal(verdict.code, c.code, `${c.name} should refuse with ${c.code}`);
            assert.ok(typeof verdict.reason === 'string' && verdict.reason.length > 0, `${c.name} carries a reason`);
        }
    }
});

test('a wouldAcceptInput call mutates nothing — a refused dry run does not move the clock', () => {
    // The property the whole design rests on: the ASK reads lastInputTime and
    // must not touch it, or a refused input would still advance the clock and
    // suppress a later genuine one. Observed through behaviour, since the map is
    // internal: after ASKing about a HIGH tick and being told yes, and about a
    // decreasing tick and being told no, a real append at a LOW tick still lands.
    const recorder = createDebugRecorder();
    recorder.appendInput(input(10));
    assert.equal(recorder.wouldAcceptInput(input(1000)).accepted, true);   // asked, not told
    assert.equal(recorder.wouldAcceptInput(input(5)).accepted, false);     // refused, writes nothing
    // If either dry run had set lastInputTime, an append at 11 would now be
    // refused (1000 > 11) or accepted only above 1000. It is neither: the clock
    // is still at 10, so 11 lands.
    assert.doesNotThrow(() => recorder.appendInput(input(11)));
});

test('wouldAcceptInput and appendInput refuse the same inputs for the same reasons', () => {
    // Same recorder, same state: the dry run first (inert), then the real thing.
    // They share one decision function, so this cannot drift — and it is asserted
    // anyway, because the day someone edits one path this is what catches it.
    for (const c of CASES) {
        const recorder = createDebugRecorder();
        if (c.seed) recorder.appendInput(c.seed());
        const value = c.make();
        const verdict = recorder.wouldAcceptInput(value);
        let threw = null;
        try { recorder.appendInput(value); } catch (e) { threw = e; }
        assert.equal(verdict.accepted, threw === null,
            `${c.name}: dry run says accepted=${verdict.accepted} but appendInput ${threw ? 'threw' : 'succeeded'}`);
        if (threw) assert.equal(verdict.code, threw.code,
            `${c.name}: dry run code ${verdict.code} disagrees with thrown code ${threw.code}`);
    }
});
