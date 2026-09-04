// SPDX-License-Identifier: Apache-2.0
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

if (!globalThis.btoa) globalThis.btoa = value => Buffer.from(value, 'binary').toString('base64');
if (!globalThis.atob) globalThis.atob = value => Buffer.from(value, 'base64').toString('binary');

const here = dirname(fileURLToPath(import.meta.url));
const modulePath = resolve(here, '../overlay/scratch-gui/src/lib/virtual-hub/spike-classic-scratch-link.js');
const {VirtualSpikeClassicSocket} = await import(modulePath);
const wait = () => new Promise(resolvePromise => queueMicrotask(resolvePromise));

test('implements Scratch Link discovery, connect, and base64 RFCOMM', async () => {
    const socket = new VirtualSpikeClassicSocket('ws://127.0.0.1:20111/scratch/bt');
    const messages = [];
    socket.onmessage = event => messages.push(JSON.parse(event.data));
    await wait();
    assert.equal(socket.readyState, 1);
    socket.send(JSON.stringify({jsonrpc: '2.0', id: 1, method: 'discover', params: {}}));
    await wait();
    assert.equal(messages[0].id, 1);
    assert.equal(messages[1].method, 'didDiscoverPeripheral');
    socket.send(JSON.stringify({jsonrpc: '2.0', id: 2, method: 'connect', params: {
        peripheralId: 'brickwright-virtual-spike-classic'
    }}));
    assert.equal(socket.state.connected, true);

    const command = Buffer.from('import hub\r\nprint("PYTHON_AVAILABLE")\r\n').toString('base64');
    socket.send(JSON.stringify({jsonrpc: '2.0', id: 3, method: 'send', params: {
        message: command, encoding: 'base64'
    }}));
    const received = messages.find(message => message.method === 'didReceiveMessage');
    assert.equal(Buffer.from(received.params.message, 'base64').toString(), 'PYTHON_AVAILABLE\r\n');
});

test('translates bounded motor REPL and stops motors on close', async () => {
    const socket = new VirtualSpikeClassicSocket('ws://127.0.0.1:20111/scratch/bt');
    await wait();
    const message = Buffer.from('hub.port.C.motor.pwm(-50)\r\n').toString('base64');
    socket.send(JSON.stringify({jsonrpc: '2.0', id: 1, method: 'send', params: {
        message, encoding: 'base64'
    }}));
    assert.deepEqual(socket.state.ports[2], [48, [-50, 0, 0, -50]]);
    socket.close();
    assert.equal(socket.state.ports[2][1][0], 0);
});
