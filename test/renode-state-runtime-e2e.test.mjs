import assert from 'node:assert/strict';
import net from 'node:net';
import {once} from 'node:events';
import {test} from 'node:test';
import {createLoopbackTcpTransport, createRenodeBrickStateRuntime} from '../scripts/lib/renode-state-runtime.mjs';

const snapshot = seq => ({schemaVersion: 1, type: 'snapshot', seq, clockNs: seq * 100,
    target: {board: 'spike-prime', firmware: 'brickwright-nuttx', transport: 'none',
        imageSha256: null, capabilities: [], limitations: []},
    lifecycle: {phase: 'ready', generation: 1}, ports: [], motors: [], sensors: [],
    display: {width: 5, height: 5, pixels: Array(25).fill(seq)}, buttons: {},
    battery: {percent: 50}, power: {state: 'on'},
    imu: {acceleration: {x: 0, y: 0, z: 1}, angularVelocity: {x: 0, y: 0, z: 0}},
    audio: {active: false}, storage: {ready: true},
    bluetooth: {state: 'off', transport: 'none'}});
const line = value => `${JSON.stringify(value)}\n`;

test('host runtime handles fragmentation, results, disconnect and explicit reconnect', async t => {
    let connection = 0;
    const server = net.createServer(socket => {
        connection += 1;
        const first = line(snapshot(0));
        socket.write(first.slice(0, 13)); socket.write(first.slice(13));
        let pending = '';
        socket.on('data', chunk => {
            pending += chunk;
            if (!pending.includes('\n')) return;
            const command = JSON.parse(pending.slice(0, pending.indexOf('\n')));
            socket.write(line({schemaVersion: 1, type: 'result', requestId: command.requestId,
                accepted: true, seq: 0}));
            const update = line(snapshot(1));
            socket.write(update.slice(0, 7)); socket.write(update.slice(7));
        });
    });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    t.after(() => server.close());
    const states = [];
    const runtime = createRenodeBrickStateRuntime({endpoint: {host: '127.0.0.1',
        port: server.address().port}, onState: state => states.push(state)});
    assert.equal(runtime.snapshot(), null);
    runtime.connect();
    while (states.length < 1) await new Promise(resolve => setImmediate(resolve));
    const result = await runtime.command('power.set-battery-millivolts', {value: 7000});
    assert.equal(result.accepted, true);
    while (runtime.snapshot().neutral.seq < 1) await new Promise(resolve => setImmediate(resolve));
    assert.equal(runtime.snapshot().neutral.clockNs, 100);
    runtime.disconnect();
    runtime.connect();
    while (connection < 2 || runtime.snapshot().neutral === null) await new Promise(resolve => setImmediate(resolve));
    assert.equal(runtime.generation, 2);
    runtime.disconnect();
});

test('transport validates loopback and rejects bounded backpressure synchronously', () => {
    assert.throws(() => createLoopbackTcpTransport({host: '0.0.0.0', port: 1}), /loopback/);
    assert.throws(() => createLoopbackTcpTransport({host: 'localhost', port: 1}), /numeric/);
    assert.throws(() => createLoopbackTcpTransport({host: '127.0.0.1', port: 0}), /port/);
    class FakeSocket {
        constructor () { this.handlers = {}; this.writableLength = 900; this.destroyed = false; }
        on (name, handler) { this.handlers[name] = handler; }
        write () { throw new Error('write must not be reached'); }
        destroy () { this.destroyed = true; }
    }
    const socket = new FakeSocket();
    const transport = createLoopbackTcpTransport({host: '127.0.0.1', port: 1,
        maxBufferedBytes: 1024, createConnection: () => socket});
    assert.throws(() => transport.send('x'.repeat(125)), /backpressure/);
    transport.close();
});
