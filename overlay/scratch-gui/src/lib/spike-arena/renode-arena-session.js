// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {RenodeArenaBridge} from './renode-arena-bridge.js';
import {NuttXProgramClient, encodePython, encodeInstructions} from '../spike-nuttx/upload-protocol.js';
import {validateTopology, requireSixMotorFrame, prepareSixMotorHub} from '../spike-nuttx/motor-topology.js';
import {exchangeStorage, DEFERRED_STORAGE_CAPABILITY} from '../spike-nuttx/storage-exchange.js';
/** Owns only a session it successfully started; stopping invalidates outstanding polls. */
export class RenodeArenaSession {
    constructor ({bridge, capabilities, backend = null, topology = 'default', program = null, source = null, onOutput = () => {}, onFrame = () => {}, onError = () => {}, onStopped = () => {}, onCompleted = () => {}, onProgramState = () => {}}) {
        validateTopology(topology);
        if (topology === 'six-motors' && (backend !== 'nuttx' || source === null || program || bridge?.robot?.sensors?.length !== 0)) {
            throw new Error('Six motors require own NuttX Python and a sensorless sandbox');
        }
        this.topology = topology;
        this.adapter = new RenodeArenaBridge(bridge, {allMotors: topology === 'six-motors'});
        this.capabilities = capabilities;
        if (backend !== null && !['guest', 'nuttx'].includes(backend)) throw new TypeError('Unknown firmware backend');
        this.backend = backend;
        if (program && source !== null) throw new TypeError('Supply one compiled program or Python source');
        if (source !== null) encodePython(source);
        if (program) encodeInstructions(program);
        this.program = program;
        this.source = source;
        this.onOutput = onOutput;
        this.onCompleted = onCompleted;
        this.onProgramState = onProgramState;
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
            const hub = this.adapter.bridge.hubState;
            if (hub.configurationOwner && hub.configurationOwner !== this) throw new Error('Hub configuration is owned by another session');
            // Reserve only configuration controls while startup is pending;
            // native motors and clock ownership remain unchanged until a frame.
            hub.configurationOwner = this;hub.changed();
            await this.call('session.start', this.backend ? {backend: this.backend, ...(this.topology === 'six-motors' ? {topology: this.topology} : {})} : {});
            this.started = true;
            if (this.closed) return;
            const first = JSON.parse(await this.call('state.read'));
            if (this.closed) return;
            if (this.topology === 'six-motors') {
                requireSixMotorFrame(first);
                prepareSixMotorHub(this.adapter.bridge.hubState);
            }
            this.outputSequence = first.lifecycle?.nuttxProgramOutput?.sequence;
            this.nuttx = first.target?.firmware === 'brickwright-nuttx' &&
                first.target?.capabilities?.includes('nuttx-program/v1');
            this.latestFrame = first;
            this.storageDeferred = first.target?.capabilities?.includes(DEFERRED_STORAGE_CAPABILITY);
            this.storageSupported = Boolean(this.nuttx && first.target?.capabilities?.includes('nuttx-program-storage/v1'));
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
                    if ([8, 9].includes(bytes[2]) && this.storageDeferred) {
                        return exchangeStorage({packet: bytes, initialFrame: this.latestFrame,
                            submit: async args => JSON.parse(await this.call('program.storage.submit', args)),
                            sample: async () => JSON.parse(await this.call('state.read')),
                            closed: () => this.closed,
                            onFrame: frame => {
                                this.adapter.accept(frame);
                                this.latestFrame = frame;
                                this.observeOutput(frame);
                                this.onFrame(this.adapter.bridge.snapshot());
                            }});
                    }
                    const frame = JSON.parse(await this.call('program.packet', {bytes: Array.from(bytes)}));
                    if (!this.closed) {
                        this.observeProgram(frame.lifecycle?.nuttxProgram);
                        this.observeOutput(frame);
                        const inputs = this.adapter.accept(frame);
                        this.latestFrame = frame;
                        await this.call('arena.inputs.write', inputs);
                        this.onFrame(this.adapter.bridge.snapshot());
                    }
                    return new Uint8Array(frame.lifecycle?.nuttxProgramReply || []);
                }, 1);
                this.uploading = true;
                try { await this.programClient.upload(this.source === null ? this.program : this.source,
                    {python: this.source !== null}); } finally { this.uploading = false; }
            }
            if (!this.closed) { this.schedule(); }
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
        if (this.closed || this.storageUncertain || this.storageBusy || this.uploading) return;
        clearTimeout(this.timer);
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
        this.latestFrame = frame;
        await this.call('arena.inputs.write', inputs);
        if (this.closed) return;
        this.onFrame(this.adapter.bridge.snapshot());
        if (this.nuttx && (this.program || this.source !== null)) {
            const status = frame.lifecycle?.nuttxProgram;
            if (!status || ![0, 1, 2, 3, 4, 5].includes(status.state)) throw new Error('Missing full firmware program status');
            this.observeProgram(status);
            if (status.state === 5 && this.storageSupported) { this.schedule(); return; }
            if (status.state === 5) throw new Error(`Firmware program failed (${status.error})`);
            if (status.state === 3 || status.state === 4) {
                if (status.state === 3 && !this.completed) { this.completed = true; this.onCompleted(); }
                if (this.storageSupported) { this.schedule(); return; }
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
    observeProgram (status) {
        if (!status || ![0, 1, 2, 3, 4, 5].includes(status.state)) return;
        this.programState = status.state;
        if (status.state !== 1) this.loaded = false;
        this.onProgramState(status.state, this.storageSupported, status.error ?? status.runtimeError);
    }
    async storage (operation) {
        if (!this.storageSupported || !this.programClient || this.closed) throw new Error('Program storage requires a supported live NuttX session');
        if (!['save', 'load'].includes(operation)) throw new TypeError('Unknown storage operation');
        if (this.storageUncertain) throw new Error('Program storage result is unknown; close this session before continuing');
        if (this.uploading || this.programState === 2 || this.storageBusy) throw new Error('Program storage is busy; stop the program and wait before trying again');
        this.storageBusy = true;
        clearTimeout(this.timer);
        try {
            await this.tail;
            if (this.closed) throw new Error('NuttX session is closed');
            const reply = await this.programClient[operation]();
            if (operation === 'load') this.loaded = true;
            this.observeProgram(reply);
            return reply;
        } catch (error) {
            // A correlated errno is complete. A transport/correlation failure
            // leaves persistence uncertain; do not send another program packet.
            if (this.storageDeferred && !error.reply) this.storageUncertain = true;
            throw error;
        } finally { this.storageBusy = false; this.schedule(); }
    }
    async uploadProgram (program, source = null) {
        if (source !== null) encodePython(source);
        else encodeInstructions(program);
        if (this.closed || this.storageUncertain || !this.storageSupported || !this.programClient || this.storageBusy || this.uploading) throw new Error('NuttX program is unavailable or busy');
        this.uploading = true; clearTimeout(this.timer);
        try {
            await this.tail;
            if (this.closed) throw new Error('NuttX session is closed');
            await this.programClient.stop();
            this.program = program; this.source = source; this.loaded = false; this.completed = false;
            const reply = await this.programClient.upload(source === null ? program : source, {python: source !== null});
            this.observeProgram(reply); return reply;
        } finally { this.uploading = false; this.schedule(); }
    }
    async startProgram () {
        if (this.closed || this.storageUncertain || !this.storageSupported || !this.programClient || this.uploading || this.storageBusy) throw new Error('NuttX program is unavailable or busy');
        if (!this.loaded || this.programState !== 1) throw new Error('Load the saved program to READY before running it');
        this.completed = false;
        return this.controlProgram('start');
    }
    async stopProgram () {
        if (this.closed || this.storageUncertain || !this.programClient) throw new Error('NuttX program is unavailable');
        return this.controlProgram('stop');
    }
    async controlProgram (operation) {
        if (this.storageBusy) throw new Error('NuttX program is busy');
        this.storageBusy = true; clearTimeout(this.timer);
        try { await this.tail; if (this.closed) throw new Error('NuttX session is closed'); const reply = await this.programClient[operation](); this.observeProgram(reply); return reply; }
        finally { this.storageBusy = false; this.schedule(); }
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
                if (hub.configurationOwner === this) {hub.configurationOwner = null;hub.changed();}
                if (hub.externalBackend === this) hub.externalBackend = null;
                this.onStopped();
            }
        })();
        return this.stopping;
    }
}
