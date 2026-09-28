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
    const fn = source.indexOf('async function attachLabwiredTarget');
    assert.ok(fn >= 0, 'attachLabwiredTarget exists');
    const end = source.indexOf('async function ', fn + 1);
    const body = source.slice(fn, end);
    const start = body.indexOf("if (lwAdapter && typeof lwAdapter.feedSerial === 'function')");
    const stop = body.indexOf('// `target` and `session` are the RUNNER');
    assert.ok(start >= 0 && stop > start, 'the RX block sits in attachLabwiredTarget, before target/session');
    return new Function('lwAdapter', 'runner', body.slice(start, stop));
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
