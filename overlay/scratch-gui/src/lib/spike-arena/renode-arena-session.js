// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {RenodeArenaBridge} from './renode-arena-bridge.js';
/** Owns only a session it successfully started; stopping invalidates outstanding polls. */
export class RenodeArenaSession {
    constructor ({bridge, capabilities, program = null, onFrame = () => {}, onError = () => {}, onStopped = () => {}, onCompleted = () => {}}) {
        this.adapter = new RenodeArenaBridge(bridge);
        this.capabilities = capabilities;
        this.program = program;
        this.onCompleted = onCompleted;
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
            if (this.program && !first.target?.capabilities?.includes('arena-program/v1')) {
                throw new Error('This desktop package supports the demo only; rebuild with program-capable firmware');
            }
            if (this.program) {
                await this.call('arena.program.load', this.program);
                if (this.closed) return;
            }
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
        if (this.program) {
            const status = frame.lifecycle?.arenaProgram;
            if (!status || ![0, 1, 2, 3].includes(status.status)) throw new Error('Missing firmware program status');
            if (status.status === 3) throw new Error(`Firmware program failed (guest error ${status.error})`);
            if (status.status === 2) {
                this.onCompleted();
                // Poll must return before stop waits for the owned request tail.
                queueMicrotask(() => this.stop().catch(error => this.onError(error)));
                return;
            }
        }
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
