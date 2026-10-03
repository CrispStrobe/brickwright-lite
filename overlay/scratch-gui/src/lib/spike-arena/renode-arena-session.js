// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {RenodeArenaBridge} from './renode-arena-bridge.js';
import {NuttXProgramClient, encodePython, encodeInstructions} from '../spike-nuttx/upload-protocol.js';
import {validateTopology, requireSixMotorFrame, prepareSixMotorHub} from '../spike-nuttx/motor-topology.js';
import {exchangeStorage, DEFERRED_STORAGE_CAPABILITY} from '../spike-nuttx/storage-exchange.js';
import {MicroPythonProgramClient, encodeSource} from '../spike-micropython/raw-repl.js';
/** Owns only a session it successfully started; stopping invalidates outstanding polls. */
export class RenodeArenaSession {
    constructor ({bridge, capabilities, backend = null, topology = 'default', program = null, source = null, onOutput = () => {}, onFrame = () => {}, onError = () => {}, onStopped = () => {}, onCompleted = () => {}, onProgramState = () => {}}) {
        validateTopology(topology);
        if (topology === 'six-motors' && (backend !== 'nuttx' || (!program && source === null) || bridge?.robot?.sensors?.length !== 0)) {
            throw new Error('Six motors require an own NuttX program and a sensorless sandbox');
        }
        this.topology = topology;
        this.adapter = new RenodeArenaBridge(bridge, {allMotors: topology === 'six-motors'});
        this.capabilities = capabilities;
        if (backend !== null && !['guest', 'nuttx', 'micropython'].includes(backend)) throw new TypeError('Unknown firmware backend');
        this.backend = backend;
        if (backend === 'micropython' && (source === null || program !== null || topology !== 'default')) {
            throw new TypeError('MicroPython requires Python source and the default topology');
        }
        if (program && source !== null) throw new TypeError('Supply one compiled program or Python source');
        if (source !== null) (backend === 'micropython' ? encodeSource : encodePython)(source);
        if (program) encodeInstructions(program, {topology});
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
            this.micropython = this.backend === 'micropython';
            if (!this.micropython && first.target?.firmware === 'micropython-prime') {
                throw new Error('MicroPython requires an explicit backend and Python source');
            }
            if (this.micropython && (first.target?.firmware !== 'micropython-prime' ||
                !Array.isArray(first.target?.capabilities) || !first.target.capabilities.includes('micropython-uart/v1') ||
                first.lifecycle?.micropythonUart?.state !== 'ready' ||
                !Number.isSafeInteger(first.lifecycle?.micropythonUart?.generation) || first.lifecycle.micropythonUart.generation <= 0)) {
                throw new Error('MicroPython firmware requires the raw REPL arena contract');
            }
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
            if (this.source !== null && !this.nuttx && !this.micropython) throw new Error('Embedded Python requires the full NuttX package');
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
            if (!this.micropython) await this.call('run');
            if (this.closed) return;
            if (this.micropython) this.executeMicroPython(first.lifecycle.micropythonUart.generation);
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
                }, 1, {topology: this.topology});
                this.uploading = true;
                try { await this.programClient.upload(this.source === null ? this.program : this.source,
                    {python: this.source !== null}); } finally { this.uploading = false; }
            }
            if (!this.closed) { this.schedule(); }
        })();
        try { await this.tail; } catch (error) { this.onError(error); await this.stop(); throw error; }
    }
    // Abort locally even if a native request is still pending. Native close is
    // idempotent here and never calls stop recursively from client cancellation.
    closeOwned () {
        if (!this.nativeClosing) this.nativeClosing = Promise.resolve().then(() => this.started && this.call('session.close'));
        return this.nativeClosing;
    }
    async uartCall (operation, args, signal) {
        signal.throwIfAborted();
        let abort;
        const canceled = new Promise((resolve, reject) => {
            abort = () => reject(signal.reason);
            signal.addEventListener('abort', abort, {once: true});
        });
        try {
            const reply = await Promise.race([Promise.resolve().then(() => {
                signal.throwIfAborted();return this.call(operation, args);
            }), canceled]);
            signal.throwIfAborted();
            // The desktop broker returns serialized semantic results. A typed
            // object is also accepted for the closed test/embedded host adapter.
            if (typeof reply === 'string') {
                if (reply.length > 32768) throw new Error('MicroPython UART reply exceeds its bound');
                return this.uartData(JSON.parse(reply));
            }
            return this.uartData(reply);
        } finally { signal.removeEventListener('abort', abort); }
    }
    uartData (reply) {
        if (!reply || typeof reply !== 'object' || Array.isArray(reply)) throw new Error('Invalid MicroPython UART reply');
        if (!Object.hasOwn(reply, 'snapshot')) return reply; // Closed embedded/test transport.
        const snapshot = reply.snapshot;
        if (Object.keys(reply).length !== 2 || !Object.hasOwn(reply, 'data') ||
            snapshot?.schemaVersion !== 1 || snapshot.type !== 'snapshot' ||
            snapshot.target?.firmware !== 'micropython-prime' ||
            snapshot.target.imageSha256 !== this.latestFrame?.target?.imageSha256 ||
            snapshot.lifecycle?.micropythonUart?.generation !== this.latestFrame?.lifecycle?.micropythonUart?.generation) {
            throw new Error('MicroPython UART attachment identity changed');
        }
        return reply.data;
    }
    executeMicroPython (generation) {
        const validObject = reply => reply && typeof reply === 'object' && !Array.isArray(reply) &&
            [Object.prototype, null].includes(Object.getPrototypeOf(reply)) && reply.generation === generation;
        const keys = (reply, allowed) => Object.keys(reply).length === allowed.length &&
            Object.keys(reply).every(key => allowed.includes(key));
        this.programClient = new MicroPythonProgramClient({
            read: async ({signal}) => {
                while (true) {
                    const reply = await this.uartCall('micropython.uart.read', {generation, maxBytes: 4096}, signal);
                    if (!validObject(reply)) throw new Error('Invalid MicroPython UART read reply');
                    if (Array.isArray(reply.bytes) && reply.bytes.length === 0 && keys(reply, ['generation', 'bytes'])) {
                        // Yield even if a native timeout reply resolves immediately,
                        // allowing GUI Stop and execution deadlines to abort the loop.
                        await this.uartWait(signal);
                        continue;
                    }
                    if (!keys(reply, ['generation', 'bytes']) || !Array.isArray(reply.bytes) ||
                        reply.bytes.length < 1 || reply.bytes.length > 4096 ||
                        !Array.from(reply.bytes).every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255)) {
                        throw new Error('Invalid MicroPython UART read reply');
                    }
                    return new Uint8Array(reply.bytes);
                }
            },
            write: async (bytes, {signal}) => {
                if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > 32) throw new Error('Invalid MicroPython UART write');
                const reply = await this.uartCall('micropython.uart.write', {generation, bytes: Array.from(bytes)}, signal);
                if (!validObject(reply) || !keys(reply, ['generation', 'count']) || reply.count !== bytes.length) {
                    throw new Error('Invalid MicroPython UART write reply');
                }
            },
            close: () => this.closeOwned()
        });
        this.execution = this.programClient.execute(this.source).then(async result => {
            if (this.closed) return;
            const text = result.stdout + result.stderr;
            this.onOutput({sequence: 1, text: text.slice(0, 1024), truncated: text.length > 1024,
                stdout: result.stdout, stderr: result.stderr});
            if (result.failed) throw new Error(`MicroPython program failed: ${result.stderr}`);
            this.completed = true;this.onCompleted();
            await this.stop();
        }).catch(async error => {
            if (!this.closed) {this.onError(error);await this.stop();}
        });
        this.execution.catch(() => {});
    }
    uartWait (signal) {
        signal.throwIfAborted();
        return new Promise((resolve, reject) => {
            const abort = () => {clearTimeout(timer);signal.removeEventListener('abort', abort);reject(signal.reason);};
            const timer = setTimeout(() => {signal.removeEventListener('abort', abort);resolve();}, 0);
            signal.addEventListener('abort', abort, {once: true});
        });
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
        else encodeInstructions(program, {topology: this.topology});
        if (this.closed || this.storageUncertain || !this.storageSupported || !this.programClient || this.storageBusy || this.uploading) throw new Error('NuttX program is unavailable or busy');
        this.uploading = true; clearTimeout(this.timer);
        try {
            await this.tail;
            if (this.closed) throw new Error('NuttX session is closed');
            if (this.topology === 'six-motors') {
                const fresh = JSON.parse(await this.call('state.read'));
                if (this.closed) throw new Error('NuttX session is closed');
                requireSixMotorFrame(fresh);
                this.adapter.accept(fresh);
                this.latestFrame = fresh;
            }
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
    get completion () { return this.stopping || this.execution || this.tail; }
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
        const stopped = this.micropython ? this.programClient?.cancel() : this.programClient?.stop();
        if (stopped) stopped.catch(() => {});
        // Finish any request before closing; never apply its late result.
        this.stopping = (async () => {
            await this.tail.catch(() => {});
            try {
                try { if (stopped) await stopped; }
                finally { if (this.started) await this.closeOwned(); }
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
