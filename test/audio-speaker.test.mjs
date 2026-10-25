// The machine audio speaker (design §4.5): a machine's audio() (array of
// {hz,on} voices) plays through Web Audio. Driven with a FAKE AudioContext so
// the per-frame voice→oscillator logic is proven with no browser audio.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
    createMachineAudioSpeaker
} from '../overlay/scratch-gui/src/lib/bw-machines/audio-speaker.js';

/** A hand-driven scheduler so the speaker's rAF loop steps deterministically. */
function manualScheduler() {
    let pending = null;
    return {
        schedule: cb => { pending = cb; return 1; },
        cancel: () => { pending = null; },
        flush: () => { const cb = pending; pending = null; if (cb) cb(); }
    };
}

/** A fake AudioContext that records the oscillators/gains it creates. */
function fakeAudioContext() {
    const oscillators = [];
    const gains = [];
    const param = () => { let v = 0; return {get value() { return v; }, set value(x) { v = x; }}; };
    return {
        state: 'running',
        destination: {},
        createOscillator() {
            const o = {type: '', frequency: param(), started: false,
                connect() {}, start() { this.started = true; }, stop() {}};
            oscillators.push(o); return o;
        },
        createGain() { const g = {gain: param(), connect() {}}; gains.push(g); return g; },
        oscillators, gains
    };
}

test('each on-voice plays at its hz (square); off voices are silenced', () => {
    const ctx = fakeAudioContext();
    let voices = [{hz: 440, on: true}];
    const sched = manualScheduler();
    const spk = createMachineAudioSpeaker({
        audioFn: () => voices, ctx, gain: 0.1,
        schedule: sched.schedule, cancel: sched.cancel
    });
    spk.start();
    sched.flush();
    assert.equal(ctx.oscillators.length, 1, 'one oscillator per voice');
    assert.equal(ctx.oscillators[0].type, 'square');
    assert.ok(ctx.oscillators[0].started);
    assert.equal(ctx.oscillators[0].frequency.value, 440);
    assert.equal(ctx.gains[0].gain.value, 0.1, 'gated on');

    voices = [{hz: 0, on: false}];      // machine went silent
    sched.flush();
    assert.equal(ctx.gains[0].gain.value, 0, 'silenced');

    voices = [{hz: 880, on: true}];     // new note, same voice reused
    sched.flush();
    assert.equal(ctx.oscillators.length, 1, 'voice reused, not recreated');
    assert.equal(ctx.oscillators[0].frequency.value, 880);

    spk.stop();
    assert.equal(ctx.gains[0].gain.value, 0, 'stop silences');
    assert.equal(spk.running, false);
});

test('a two-voice machine drives two oscillators; a dropped voice is silenced', () => {
    const ctx = fakeAudioContext();
    let voices = [{hz: 262, on: true}, {hz: 330, on: true}];
    const sched = manualScheduler();
    const spk = createMachineAudioSpeaker({audioFn: () => voices, ctx, gain: 0.2,
        schedule: sched.schedule, cancel: sched.cancel});
    spk.start(); sched.flush();
    assert.equal(ctx.oscillators.length, 2);
    assert.equal(ctx.oscillators[1].frequency.value, 330);
    // second voice drops out of the report
    voices = [{hz: 262, on: true}];
    sched.flush();
    assert.equal(ctx.gains[1].gain.value, 0, 'the vanished voice is silenced');
    spk.stop();
});

test('the speaker survives a null or throwing audio()', () => {
    const ctx = fakeAudioContext();
    let mode = 'null';
    const sched = manualScheduler();
    const spk = createMachineAudioSpeaker({
        audioFn: () => { if (mode === 'throw') throw new Error('torn down'); return mode === 'null' ? null : [{hz: 220, on: true}]; },
        ctx, schedule: sched.schedule, cancel: sched.cancel
    });
    spk.start();
    assert.doesNotThrow(() => sched.flush());   // null → nothing created
    assert.equal(ctx.oscillators.length, 0);
    mode = 'throw';
    assert.doesNotThrow(() => sched.flush());   // swallowed
    mode = 'play';
    sched.flush();
    assert.equal(ctx.oscillators.length, 1);
    spk.stop();
});
