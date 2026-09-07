import assert from 'node:assert/strict';
import {test} from 'node:test';
import Connector, {MAX_PENDING_COMMANDS} from '../overlay/scratch-gui/src/lib/virtual-hub/brick-state-runtime-connector.js';

const fixture = seq => ({schemaVersion: 1, type: 'snapshot', seq, clockNs: seq * 10,
    target: {board: 'spike-prime', firmware: 'brickwright-nuttx', transport: 'none', imageSha256: null, capabilities: [], limitations: []},
    lifecycle: {phase: 'ready', generation: 1}, ports: [], motors: [], sensors: [],
    display: {width: 5, height: 5, pixels: Array(25).fill(seq)}, buttons: {}, battery: {percent: 50}, power: {state: 'on'},
    imu: {acceleration: {x: 0, y: 0, z: 1}, angularVelocity: {x: 0, y: 0, z: 0}},
    audio: {active: false}, storage: {ready: true}, bluetooth: {state: 'off', transport: 'none'}});
class Transport {
    constructor () { this.sent = []; }
    onData (callback) { this.data = callback; } onClose (callback) { this.closed = callback; }
    send (line) { this.sent.push(line); } close () {} emit (value) { this.data(`${JSON.stringify(value)}\n`); }
}
test('publishes plain state without Renode objects', () => {
    const states = []; const transport = new Transport();
    const connector = new Connector({createTransport: () => transport, onState: state => states.push(state)}).connect();
    transport.emit(fixture(0));
    assert.equal(connector.snapshot().neutral.seq, 0); assert.equal(states.at(-1).firmwareTarget, 'brickwright');
    assert.equal(Object.hasOwn(states.at(-1), 'machine'), false);
});
test('correlates accepted and rejected bounded commands', async () => {
    const transport = new Transport(); const connector = new Connector({createTransport: () => transport}).connect();
    transport.emit(fixture(0));
    const accepted = connector.command('lpf2.detach', {port: 'A'}); const sent = JSON.parse(transport.sent[0]);
    transport.emit({schemaVersion: 1, type: 'result', requestId: sent.requestId, accepted: true});
    assert.equal((await accepted).accepted, true);
    const rejected = connector.command('unsupported'); const second = JSON.parse(transport.sent[1]);
    transport.emit({schemaVersion: 1, type: 'result', requestId: second.requestId, accepted: false, error: 'unknown command'});
    await assert.rejects(rejected, /unknown command/);
    for (let i = 0; i < MAX_PENDING_COMMANDS; i++) connector.command('queued').catch(() => {});
    await assert.rejects(connector.command('overflow'), /queue is full/); connector.disconnect();
});
test('reconnect ignores stale transport data and advances generation', async () => {
    const transports = []; const lifecycle = [];
    const connector = new Connector({createTransport: () => { const t = new Transport(); transports.push(t); return t; }, onLifecycle: x => lifecycle.push(x)}).connect();
    const pending = connector.command('queued'); connector.disconnect(); await assert.rejects(pending, /disconnected/);
    connector.connect(); transports[0].emit(fixture(0)); assert.equal(connector.snapshot().neutral, null);
    transports[1].emit(fixture(0)); assert.equal(connector.snapshot().neutral.seq, 0); assert.equal(lifecycle.at(-1).generation, 2);
});
