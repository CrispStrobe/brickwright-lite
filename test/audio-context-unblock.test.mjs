/**
 * The Firefox boot hang.
 *
 * Firefox does not settle `decodeAudioData` while the AudioContext is
 * suspended — no resolve, no reject. Project load awaits its sounds, so the
 * editor never appears. Chromium decodes happily, which is why `verify-gui`
 * (Chromium) reported a healthy app for a site that was dead in Firefox.
 *
 * These tests hold the wrapper to the two things that make it work: it must
 * still look like the promise-form decoder to scratch-audio, and a decode that
 * never settles must become a rejection rather than a hang.
 */

import {test} from 'node:test';
import assert from 'node:assert/strict';

import unblockAudio, {
    boundDecodeAudioData, resumeOnGesture, DECODE_TIMEOUT_MS
} from '../overlay/scratch-gui/src/lib/audio-context-unblock.js';

/** A context whose decodeAudioData never settles — i.e. Firefox, suspended. */
const hangingContext = () => ({
    state: 'suspended',
    resumed: 0,
    resume () {
        this.resumed++;
        this.state = 'running';
        return Promise.resolve();
    },
    decodeAudioData (buffer) { // eslint-disable-line no-unused-vars
        return new Promise(() => {}); // never settles: the bug, exactly
    }
});

test('scratch-audio still sees a promise-form decoder', () => {
    // AudioEngine picks promise vs callback by reading .length. A wrapper
    // declared (buffer, ok, fail) would be handed callbacks and never see them,
    // so this is a real contract, not a style point.
    const ctx = hangingContext();
    boundDecodeAudioData(ctx);
    assert.equal(ctx.decodeAudioData.length, 1,
        'the wrapper must declare exactly one parameter');
});

test('a decode that never settles rejects instead of hanging', async () => {
    const ctx = hangingContext();
    boundDecodeAudioData(ctx, 40);
    await assert.rejects(ctx.decodeAudioData(new ArrayBuffer(8)), /did not settle/);
});

test('a decode that resolves is passed straight through', async () => {
    const ctx = hangingContext();
    ctx.decodeAudioData = buffer => Promise.resolve({sample: buffer.byteLength});
    boundDecodeAudioData(ctx, 40);
    assert.deepEqual(await ctx.decodeAudioData(new ArrayBuffer(8)), {sample: 8});
});

test('the callback form settles the promise too', async () => {
    const ctx = hangingContext();
    ctx.decodeAudioData = function (buffer, ok) {
        setTimeout(() => ok({viaCallback: true}), 1);
        // Callback-only implementations return undefined.
    };
    boundDecodeAudioData(ctx, 200);
    assert.deepEqual(await ctx.decodeAudioData(new ArrayBuffer(4)), {viaCallback: true});
});

test('a synchronous throw becomes a rejection, not an exception', async () => {
    const ctx = hangingContext();
    ctx.decodeAudioData = () => {
        throw new Error('bad data');
    };
    boundDecodeAudioData(ctx, 200);
    await assert.rejects(ctx.decodeAudioData(new ArrayBuffer(4)), /bad data/);
});

test('wrapping twice does not stack timeouts', () => {
    const ctx = hangingContext();
    boundDecodeAudioData(ctx, 40);
    const once = ctx.decodeAudioData;
    boundDecodeAudioData(ctx, 40);
    assert.equal(ctx.decodeAudioData, once, 'the second wrap must be a no-op');
});

test('a suspended context is resumed without waiting for a gesture', () => {
    const ctx = hangingContext();
    resumeOnGesture(ctx);
    assert.equal(ctx.resumed, 1);
    assert.equal(ctx.state, 'running');
});

test('a running context is left alone', () => {
    const ctx = hangingContext();
    ctx.state = 'running';
    resumeOnGesture(ctx);
    assert.equal(ctx.resumed, 0);
});

test('a context that refuses to resume does not throw into the caller', () => {
    const ctx = hangingContext();
    ctx.resume = () => {
        throw new Error('NotAllowedError');
    };
    assert.doesNotThrow(() => resumeOnGesture(ctx));
});

test('the default export applies both defences, and tolerates no context', () => {
    const engine = {audioContext: hangingContext()};
    assert.equal(unblockAudio(engine), engine);
    assert.equal(engine.audioContext.state, 'running');
    assert.equal(engine.audioContext.decodeAudioData.__bwBounded, true);
    assert.doesNotThrow(() => unblockAudio({}));
    assert.doesNotThrow(() => unblockAudio(null));
});

test('the timeout is a deadlock detector, not a performance budget', () => {
    // A tight budget would silently replace slow-but-real sounds with silence.
    assert.ok(DECODE_TIMEOUT_MS >= 3000, `${DECODE_TIMEOUT_MS}ms is too tight`);
});
