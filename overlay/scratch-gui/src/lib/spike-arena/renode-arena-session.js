// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {RenodeArenaBridge} from './renode-arena-bridge.js';
import {NuttXProgramClient} from '../spike-nuttx/upload-protocol.js';
/** Owns only a session it successfully started; stopping invalidates outstanding polls. */
export class RenodeArenaSession {
    constructor ({bridge, capabilities, backend = null, program = null, source = null, onOutput = () => {}, onFrame = () => {}, onError = () => {}, onStopped = () => {}, onCompleted = () => {}}) {
        this.adapter = new RenodeArenaBridge(bridge);
        this.capabilities = capabilities;
        if (backend !== null && !['guest', 'nuttx'].includes(backend)) throw new TypeError('Unknown firmware backend');
        this.backend = backend;
        if (program && source !== null) throw new TypeError('Supply one compiled program or Python source');
        this.program = program;
        this.source = source;
        this.onOutput = onOutput;
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
            await this.call('session.start', this.backend ? {backend: this.backend} : {});
            this.started = true;
            if (this.closed) return;
            const first = JSON.parse(await this.call('state.read'));
            if (this.closed) return;
            this.outputSequence = first.lifecycle?.nuttxProgramOutput?.sequence;
            this.nuttx = first.target?.firmware === 'brickwright-nuttx' &&
                first.target?.capabilities?.includes('nuttx-program/v1');
            if (this.nuttx && !this.program && this.source === null) {
                this.program = {version: 1, instructions: [[1, 0, -150, 0], [1, 1, 150, 0], [2, 2000, 0, 0], [0, 0, 0, 0]]};
            }
            if (this.source !== null && !this.nuttx) throw new Error('Embedded Python requires the full NuttX package');
            if (this.program && !this.nuttx && !first.target?.capabilities?.includes('arena-program/v1')) {
                throw new Error('This desktop package supports the demo only; rebuild with program-capable firmware');
            }
            if (this.program && !this.nuttx) {
                await this.call('arena.program.load', this.program);
                if (this.closed) return;
            }
            const inputs = this.adapter.accept(first);
            this.adapter.bridge.hubState.externalBackend = this;
            await this.call('arena.inputs.write', inputs);
            if (this.closed) return;
            await this.call('run');
            if (this.closed) return;
            if (this.nuttx && (this.program || this.source !== null)) {
                this.programClient = new NuttXProgramClient(async bytes => {
                    const frame = JSON.parse(await this.call('program.packet', {bytes: Array.from(bytes)}));
                    if (!this.closed) {
                        this.observeOutput(frame);
                        const inputs = this.adapter.accept(frame);
                        await this.call('arena.inputs.write', inputs);
                        this.onFrame(this.adapter.bridge.snapshot());
                    }
                    return new Uint8Array(frame.lifecycle?.nuttxProgramReply || []);
                }, 1);
                await this.programClient.upload(this.source === null ? this.program : this.source,
                    {python: this.source !== null});
            }
            if (!this.closed) this.schedule();
        })();
        try { await this.tail; } catch (error) { this.onError(error); await this.stop(); throw error; }
    }
    observeOutput (frame) {
        const output = frame.lifecycle?.nuttxProgramOutput;
        if (this.source === null || !output || output.sequence === this.outputSequence) return;
        if (!Number.isSafeInteger(output.sequence) || output.sequence < 0 || typeof output.text !== 'string' ||
            output.text.length > 1024 || typeof output.truncated !== 'boolean') throw new Error('Invalid firmware output');
        this.outputSequence = output.sequence;
        this.onOutput(output);
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
        this.observeOutput(frame);
        const inputs = this.adapter.accept(frame);
        await this.call('arena.inputs.write', inputs);
        if (this.closed) return;
        this.onFrame(this.adapter.bridge.snapshot());
        if (this.nuttx && (this.program || this.source !== null)) {
            const status = frame.lifecycle?.nuttxProgram;
            if (!status || ![0, 1, 2, 3, 4, 5].includes(status.state)) throw new Error('Missing full firmware program status');
            if (status.state === 5) throw new Error(`Firmware program failed (${status.error})`);
            if (status.state === 3 || status.state === 4) {
                if (status.state === 3) this.onCompleted();
                queueMicrotask(() => this.stop().catch(error => this.onError(error)));
                return;
            }
        } else if (this.program) {
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
        // Invalidate an upload now, then serialize its STOP behind the current packet.
        const stopped = this.programClient?.stop();
        if (stopped) stopped.catch(() => {});
        // Finish any request before closing; never apply its late result.
        this.stopping = (async () => {
            await this.tail.catch(() => {});
            try {
                try { if (stopped) await stopped; }
                finally { if (this.started) await this.call('session.close'); }
            }
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
