import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';

const require = createRequire(import.meta.url);
const createMusic = require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/music.js');
const initializePxtMusic = require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/music-pxt.js');
const u16 = n => [n & 255, n >> 8 & 255];
const event = (start, end, notes) => [...u16(start), ...u16(end), notes.length, ...notes];
const instrument = [1, ...u16(10), ...u16(20), ...u16(512), ...u16(80), ...u16(1024),
    ...u16(10), ...u16(20), ...u16(0), ...u16(10), ...u16(0), 0, ...u16(0), 0, ...u16(0), 4];
const drum = [2, ...u16(400), ...u16(1024), 4, ...u16(250), ...u16(700), ...u16(50),
    4, ...u16(100), ...u16(0), ...u16(100)];
const track = (id, flags, sound, events) => [id, flags, ...u16(sound.length), ...sound,
    ...u16(events.flat().length), ...events.flat()];
const song = (tracks, bpm = 120) => new createMusic.PxtBuffer([0, ...u16(bpm), 4, 8, 1, tracks.length, ...tracks.flat()]);
const melodic = track(0, 0, instrument, [event(0, 4, [24, 28]), event(8, 12, [31]), event(24, 32, [36])]);
const drums = track(1, 1, drum, [event(0, 1, [0]), event(16, 17, [0])]);
const hexOf = bytes => Buffer.from(bytes).toString('hex');
// The original simulator allocates an additional zero instruction record for
// melodic envelopes. Compare every active byte and require the entire unused
// tail to be zero; never normalize frequency, volume, duration or waveform.
const activeInstructions = bytes => {
    let end = 0;
    while (end < bytes.length && bytes[end] !== 0) {
        assert.ok(end + 12 <= bytes.length, 'complete instruction record');
        end += 12;
    }
    assert.ok(bytes.slice(end).every(byte => byte === 0), 'only zero terminal padding may differ');
    return bytes.slice(0, end);
};

const setup = () => {
    let now = 0;
    const errors = [];
    const host = createMusic({initializePxtMusic, clock: () => now, onError: error => errors.push(error)});
    return {host, errors, advance: (end, frame = 20) => {
        while (now < end) {now = Math.min(end, now + frame); host.pump();}
    }};
};

test('song generation retains reproducible pinned instrument and sequencer code', () => {
    execFileSync(process.execPath, ['scripts/generate-arcade-music.mjs', '--check'], {stdio: 'pipe'});
});

test('native song starts real melodic/polyphonic/drum instructions and completes until-done', async () => {
    const {host, errors, advance} = setup();
    let finished = false;
    const playable = host.pxt.music.createSong(song([melodic, drums]));
    const done = host.run(host.pxt.music.play(playable, 0));
    Promise.resolve(done).then(() => {finished = true;});
    assert.equal(finished, false);
    assert.equal(host.log.length, 3, 'two melodic voices and one drum at tick zero');
    advance(500);
    assert.equal(host.log.length, 4);
    advance(1000);
    assert.equal(host.log.length, 5);
    advance(1500);
    assert.equal(host.log.length, 6);
    advance(2020);
    await done;
    assert.equal(finished, true);
    assert.equal(host.running, 0);
    assert.deepEqual(errors, []);
    assert.deepEqual(host.log.map(entry => entry.time), [0, 0, 0, 500, 1000, 1500]);
    assert.ok(host.log.every(entry => host.decodeInstructions(entry.bytes).length > 0));
});

test('tick deadlines avoid cumulative frame rounding and catch up after clock jumps', async () => {
    const {host, errors, advance} = setup();
    const events = Array.from({length: 32}, (_, tick) => event(tick, tick + 1, [24]));
    const done = host.run(host.pxt.music.play(host.pxt.music.createSong(song([track(0, 0, instrument, events)])), 0));
    advance(400, 17);
    for (const [tick, entry] of host.log.entries()) assert.ok(Math.abs(entry.time - tick * 62.5) < 17);
    advance(2000, 1600);
    advance(2017, 17);
    await done;
    assert.equal(host.log.length, 32);
    assert.equal(host.running, 0);
    assert.deepEqual(errors, []);
});

test('background returns immediately; looping replays bytes and global stop ends it', () => {
    const {host, errors, advance} = setup();
    const playable = host.pxt.music.createSong(song([melodic]));
    assert.equal(host.run(host.pxt.music.play(playable, 1)), undefined);
    advance(2020);
    assert.equal(host.running, 0);
    host.log.length = 0;
    assert.equal(host.run(host.pxt.music.play(playable, 2)), undefined);
    advance(4100);
    assert.equal(host.log.length, 6);
    assert.deepEqual(host.log.slice(0, 2).map(entry => entry.bytes), host.log.slice(4, 6).map(entry => entry.bytes));
    host.pxt.music.stopAllSounds();
    const count = host.log.length;
    advance(6200);
    assert.equal(host.log.length, count);
    assert.equal(host.running, 0);
    assert.deepEqual(errors, []);
});

test('replacement, cancellation and reset release paused callers and discard old song state', async () => {
    const {host, errors, advance} = setup();
    const playable = host.pxt.music.createSong(song([melodic]));
    const first = host.run(host.pxt.music.play(playable, 0));
    host.run(host.pxt.music.play(host.pxt.music.createSong(song([])), 1));
    advance(100);
    await first;
    assert.equal(host.log.length, 2, 'replaced melodic track never schedules its later notes');
    const second = host.run(host.pxt.music.play(host.pxt.music.createSong(song([melodic])), 0));
    host.reset();
    await second;
    assert.equal(host.running, 0);
    assert.equal(host.log.length, 0);
    const third = host.run(host.pxt.music.play(host.pxt.music.createSong(song([drums])), 0));
    advance(2120);
    await third;
    assert.equal(host.log.length, 2);
    assert.deepEqual(errors, []);
});

test('empty note tracks beside populated tracks never read their neighbours as notes', async () => {
    const {host, errors, advance} = setup();
    const done = host.run(host.pxt.music.play(host.pxt.music.createSong(song([track(0, 0, instrument, []), melodic])), 0));
    advance(2020);
    await done;
    assert.equal(host.log.length, 4);
    assert.deepEqual(errors, []);
});

test('malformed edits during playback fail visibly and release the waiting caller', async () => {
    const {host, errors, advance} = setup();
    const playable = host.pxt.music.createSong(song([melodic]));
    const done = host.run(host.pxt.music.play(playable, 0));
    playable.beatsPerMinute = 0;
    advance(100);
    await done;
    assert.equal(host.running, 0);
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /Invalid Arcade song/);
    assert.equal(host.log.length, 2, 'no invalid later notes were rendered');
});

test('malformed song streams fail before playback without changing valid song bytes', () => {
    const {host} = setup();
    const valid = song([melodic, drums]);
    const before = Array.from(valid);
    assert.equal(host.pxt.music.createSong(valid).buf, valid);
    assert.deepEqual(Array.from(valid), before);
    const bad = [];
    for (let length = 0; length < valid.length; length++) bad.push(new createMusic.PxtBuffer(valid.subarray(0, length)));
    for (const [offset, value] of [[0, 1], [1, 0], [3, 0], [4, 0], [5, 0], [8, 2], [9, 255]]) {
        const bytes = new createMusic.PxtBuffer(valid); bytes[offset] = value; bad.push(bytes);
    }
    bad.push(new createMusic.PxtBuffer([...valid, 0]));
    for (const bytes of bad) assert.throws(() => host.pxt.music.createSong(bytes), /Invalid Arcade song/);
    assert.equal(host.running, 0);
    assert.equal(host.log.length, 0);
});

const modulated = [...instrument];
// Pitch envelope, pitch/amp LFOs and nonzero release are exercised in the oracle.
modulated.splice(19, 2, ...u16(80));
modulated[21] = 5; modulated.splice(22, 2, ...u16(128));
modulated[24] = 7; modulated.splice(25, 2, ...u16(30));
for (const [name, bytes, volume = 128] of [
    ['melodic', song([melodic])], ['drums', song([drums])], ['mixed', song([melodic, drums])],
    ['modulated low-volume fast', song([track(0, 0, modulated, [event(0, 8, [24, 31]), event(16, 28, [28])])], 240), 64]
]) {
    test(`real original MakeCode ${name} song emits the same active mixer instruction bytes`, async () => {
        const source = `let done = false\nmusic.setVolume(${volume})\nmusic.play(music.createSong(hex\`${hexOf(bytes)}\`), music.PlaybackMode.UntilDone)\ndone = true`;
        const original = await runPxtArcade(source, {waitForGlobals: {done: true}, recordSongSound: true, fakeClock: true});
        const {host, errors, advance} = setup();
        host.pxt.music.setVolume(volume);
        const done = host.run(host.pxt.music.play(host.pxt.music.createSong(bytes), 0));
        advance(2020);
        await done;
        assert.deepEqual(errors, []);
        assert.ok(original.$sound.length > 0, 'the original must actually schedule sound');
        assert.deepEqual(host.log.map(entry => activeInstructions(entry.bytes)), original.$sound.map(entry => activeInstructions(entry.bytes)));
    });
}
