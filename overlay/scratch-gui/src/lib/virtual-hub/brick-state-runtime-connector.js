// SPDX-License-Identifier: BSD-3-Clause
import VirtualSpikeHubState from './spike-hub-state.js';
import {encodeBrickCommand, RenodeBrickStateAdapter} from './renode-state-adapter.js';

export const MAX_PENDING_COMMANDS = 128;

// Runtime boundary: callers see neutral hub snapshots, never Renode objects.
export default class BrickStateRuntimeConnector {
    constructor ({createTransport, onState = () => {}, onLifecycle = () => {}, onGap = () => {}}) {
        if (typeof createTransport !== 'function') throw new TypeError('createTransport is required');
        Object.assign(this, {createTransport, onState, onLifecycle, onGap});
        this.generation = 0; this.pending = new Map(); this.transport = null;
    }
    connect () {
        if (this.transport) throw new Error('connector is already connected');
        this.generation += 1;
        this.state = new VirtualSpikeHubState();
        this.adapter = new RenodeBrickStateAdapter(this.state, {onGap: this.onGap});
        this.unsubscribe = this.state.subscribe(() => this.onState(this.state.snapshot()));
        const generation = this.generation;
        const transport = this.createTransport();
        this.transport = transport;
        transport.onData(chunk => {
            if (this.transport !== transport || generation !== this.generation) return;
            for (const message of this.adapter.feed(chunk)) this._handleMessage(message);
        });
        transport.onClose(() => { if (this.transport === transport) this._disconnect('transport-closed'); });
        this.onLifecycle({phase: 'connected', generation});
        return this;
    }
    disconnect () {
        const transport = this.transport;
        this._disconnect('client-disconnect');
        if (transport) transport.close();
    }
    command (command, arguments_ = {}) {
        if (!this.transport) return Promise.reject(new Error('connector is disconnected'));
        if (this.pending.size >= MAX_PENDING_COMMANDS) return Promise.reject(new Error('command queue is full'));
        const requestId = `${this.generation}:${this.nextRequestId = (this.nextRequestId || 0) + 1}`;
        const line = encodeBrickCommand({requestId, command, arguments: arguments_,
            expectedSeq: Math.max(0, this.adapter.lastSeq)});
        return new Promise((resolve, reject) => {
            this.pending.set(requestId, {resolve, reject});
            try { this.transport.send(line); } catch (error) { this.pending.delete(requestId); reject(error); }
        });
    }
    snapshot () { return this.state ? this.state.snapshot() : null; }
    _handleMessage (message) {
        if (message.type !== 'result') return;
        const waiter = this.pending.get(message.requestId);
        if (!waiter) throw new TypeError('result has unknown requestId');
        this.pending.delete(message.requestId);
        if (message.accepted) waiter.resolve(message);
        else waiter.reject(new Error(message.error || 'command rejected'));
    }
    _disconnect (reason) {
        if (!this.transport) return;
        this.transport = null;
        if (this.unsubscribe) this.unsubscribe();
        for (const {reject} of this.pending.values()) reject(new Error('connector disconnected'));
        this.pending.clear();
        this.onLifecycle({phase: 'disconnected', generation: this.generation, reason});
    }
}
