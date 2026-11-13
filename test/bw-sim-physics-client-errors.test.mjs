// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors

import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {setImmediate} from 'node:timers/promises';
import {PhysicsClient} from '../overlay/scratch-gui/src/lib/bw-sim/physics/physics-client.js';

// Exercise each supported Worker/port interface without loading a physics engine.
const ports = {
    browser() {
        const port = new EventTarget();
        port.sent = [];
        port.postMessage = message => port.sent.push(message);
        port.reply = message => port.dispatchEvent(new MessageEvent('message', {data: message}));
        // A browser messageerror is a MessageEvent, usually without a message field.
        port.decodeError = () => port.dispatchEvent(new MessageEvent('messageerror', {data: null}));
        return port;
    },
    node() {
        const port = new EventEmitter();
        port.sent = [];
        port.postMessage = message => port.sent.push(message);
        port.reply = message => port.emit('message', message);
        port.decodeError = () => port.emit('messageerror', new Error('cannot deserialize reply'));
        return port;
    },
    property() {
        const port = {sent: []};
        port.postMessage = message => port.sent.push(message);
        port.reply = message => port.onmessage({data: message});
        port.decodeError = () => port.onmessageerror?.(new MessageEvent('messageerror'));
        return port;
    }
};

for (const [kind, makePort] of Object.entries(ports)) {
    test(`${kind}: unreadable reply rejects pending and future physics requests`, async () => {
        const port = makePort();
        const client = new PhysicsClient(port);
        const outcomes = [];
        const track = promise => promise.then(
            value => outcomes.push({value}),
            error => outcomes.push({error})
        );
        const pending = [track(client.simLoad({mechanism: {}})), track(client.simBatch({scene: 1, steps: 1}))];
        port.decodeError();
        // Drain promise reactions from the async public methods without a timeout.
        await setImmediate();
        assert.equal(outcomes.length, 2, 'both pending requests must settle after an unreadable reply');
        assert.ok(outcomes.every(outcome => outcome.error instanceof Error));
        assert.equal(outcomes[0].error, outcomes[1].error);
        assert.match(outcomes[0].error.message, kind === 'node' ? /cannot deserialize reply/ : /physics worker failed/);

        // A late success cannot revive a failed request or the worker connection.
        for (const message of port.sent) port.reply({id: message.id, type: 'sim-loaded', t: 0});
        await Promise.all(pending);
        assert.equal(outcomes.length, 2);
        await assert.rejects(client.simBatch({scene: 1, steps: 1}), error => error === outcomes[0].error);
        assert.equal(port.sent.length, 2, 'failed connection must not post later requests');
    });

    test(`${kind}: readable physics replies still resolve`, async () => {
        const port = makePort();
        const client = new PhysicsClient(port);
        const loaded = client.simLoad({mechanism: {}});
        port.reply({id: port.sent[0].id, type: 'sim-loaded', t: 0, bodies: [], joints: []});
        assert.equal((await loaded).t, 0);
        const batch = client.simBatch({scene: 1, steps: 1});
        port.reply({id: port.sent[1].id, type: 'sim-frames', t: 0.005, frames: []});
        assert.equal((await batch).t, 0.005);
    });
}
