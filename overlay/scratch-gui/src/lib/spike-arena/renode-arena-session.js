// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {RenodeArenaBridge} from './renode-arena-bridge.js';
/** Owns only a session it successfully started; stopping invalidates outstanding polls. */
export class RenodeArenaSession {
    constructor ({bridge, capabilities, onFrame = () => {}, onError = () => {}, onStopped = () => {}}) {
        this.adapter = new RenodeArenaBridge(bridge);
        this.capabilities = capabilities;
        this.onFrame = onFrame;
        this.onError = onError;
        this.onStopped = onStopped;
        this.closed = false;
        this.started = false;
        this.tail = Promise.resolve();
    }
    call (operation, args = {}) {
        const handler = this.capabilities?.[`renode.spike.${operation}`];
        if (typeof handler !== 'function') throw new Error('The desktop simulation runtime is unavailable');
        return handler(args);
    }
    async start () {
        this.tail = (async () => {
            await this.call('session.start');
            this.started = true;
            if (this.closed) return;
            const first = JSON.parse(await this.call('state.read'));
            if (this.closed) return;
            const inputs = this.adapter.accept(first);
            this.adapter.bridge.hubState.externalBackend = this;
            await this.call('arena.inputs.write', inputs);
            if (this.closed) return;
            await this.call('run');
            if (!this.closed) this.schedule();
        })();
        try { await this.tail; } catch (error) { this.onError(error); await this.stop(); throw error; }
    }
    schedule () {
        this.timer = setTimeout(() => {
            this.tail = this.poll();
            this.tail.catch(async error => {
                this.onError(error); await this.stop();
            }).catch(() => {});
        }, 50);
    }
    async poll () {
        const frame = JSON.parse(await this.call('state.read'));
        if (this.closed) return;
        const inputs = this.adapter.accept(frame);
        await this.call('arena.inputs.write', inputs);
        if (this.closed) return;
        this.onFrame(this.adapter.bridge.snapshot());
        this.schedule();
    }
    get completion () { return this.stopping || this.tail; }
    cancel () {
        const result = this.stop();
        result.catch(error => this.onError(error));
        return result;
    }
    async stop () {
        if (this.stopping) return this.stopping;
        this.closed = true;
        clearTimeout(this.timer);
        // Finish any request before closing; never apply its late result.
        this.stopping = (async () => {
            await this.tail.catch(() => {});
            try { if (this.started) await this.call('session.close'); }
            catch (error) { this.onError(error); throw error; }
            finally {
                this.adapter.close();
                const hub = this.adapter.bridge.hubState;
                if (hub.externalBackend === this) hub.externalBackend = null;
                this.onStopped();
            }
        })();
        return this.stopping;
    }
}
