import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// The labwired attach used to wire serial OUTPUT only: no `runner.sendSerial`,
// so the Debug panel (which asks for it as a capability) hid its input line
// while the adapter could feed the engine's UART all along. This runs the
// attach's own RX block — cut out of the source, not restated here — against a
// recording adapter, so it holds what the code does, not that a word appears.
const source = readFileSync(new URL(
    '../overlay/scratch-gui/src/lib/bw-debug/debug-runner.js', import.meta.url), 'utf8');

function labwiredRxBlock() {
    // Every labwired attach (the bench one and firmware-only) ends in this
    // shared finisher, so the RX block lives there once.
    const fn = source.indexOf('function finishLabwiredAttach (');
    assert.ok(fn >= 0, 'finishLabwiredAttach exists');
    const end = source.indexOf('\n    }\n', fn);
    const body = source.slice(fn, end);
    const start = body.indexOf("if (lwAdapter && typeof lwAdapter.feedSerial === 'function')");
    const stop = body.indexOf('// `target` and `session` are the RUNNER');
    assert.ok(start >= 0 && stop > start, 'the RX block sits in finishLabwiredAttach, before target/session');
    for (const caller of ['async function attachLabwiredTarget', 'async function attachLabwiredFirmwareOnly']) {
        const at = source.indexOf(caller);
        const next = source.indexOf('\n    }\n', at);
        assert.match(source.slice(at, next), /return finishLabwiredAttach\(/, `${caller} ends in the shared finisher`);
    }
    return new Function('lwAdapter', 'runner', 'lwTarget', body.slice(start, stop));
}

test('labwired attach exposes sendSerial that feeds the adapter byte by byte', () => {
    const fed = [];
    const runner = {};
    labwiredRxBlock()({feedSerial: b => fed.push(b)}, runner);
    assert.equal(typeof runner.sendSerial, 'function');
    runner.sendSerial('hi\r');
    runner.sendSerial(0x141);
    assert.deepEqual(fed, [0x68, 0x69, 0x0d, 0x41], 'a typed line byte by byte, then one masked byte');
});

test('an adapter without feedSerial leaves no input line from an earlier attach', () => {
    const runner = {sendSerial: () => { throw new Error('stale input line from a previous engine'); }};
    labwiredRxBlock()({onSerial() {}}, runner);
    assert.equal('sendSerial' in runner, false);
    labwiredRxBlock()(null, runner);
    assert.equal('sendSerial' in runner, false);
});

test('with a target that records input, bytes go through the target (so replay can put them back)', () => {
    const viaTarget = [];
    const viaAdapter = [];
    const runner = {};
    labwiredRxBlock()({feedSerial: b => viaAdapter.push(b)}, runner, {feedSerial: b => viaTarget.push(b)});
    runner.sendSerial('ok');
    assert.deepEqual(viaTarget, [0x6f, 0x6b]);
    assert.deepEqual(viaAdapter, [], 'not fed twice');
});

test('RTT / semihosting lines land in the console, labelled, buffered per channel', () => {
    const start = source.indexOf("if (lwAdapter && typeof lwAdapter.onTrace === 'function')");
    const stop = source.indexOf('// RX into the program', start);
    assert.ok(start >= 0 && stop > start, 'the trace block sits before the RX block in the finisher');
    let cb;
    const serialLines = [];
    new Function('lwAdapter', 'serialLines', source.slice(start, stop))({onTrace: f => { cb = f; }}, serialLines);
    const bytes = s => Uint8Array.from(s, c => c.charCodeAt(0));
    cb('rtt', bytes('hel'));
    cb('semihosting', bytes('ok\r\n'));
    cb('rtt', bytes('lo\nx'));
    assert.deepEqual(serialLines, ['[semihosting] ok', '[rtt] hello'], 'a partial RTT line waits for its newline');
});

test('a board with a display gets runner.video; anything else clears a stale one', () => {
    const frame = {width: 128, height: 64, rgba: new Uint8ClampedArray(4), frame: 1, signal: true};
    const runner = {};
    labwiredRxBlock()({feedSerial() {}}, runner, {video: () => frame});
    assert.equal(runner.video(), frame);
    const stale = {video: () => 'old machine'};
    labwiredRxBlock()({feedSerial() {}}, stale, {video: () => null});
    assert.equal('video' in stale, false, 'a target with nothing to draw removes the old screen');
});
