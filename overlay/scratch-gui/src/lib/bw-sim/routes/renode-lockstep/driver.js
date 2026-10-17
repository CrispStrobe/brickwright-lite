// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The lockstep client for an emulated SPIKE hub (docs/ROBOT-LAB-SPIKE-EMULATION.md
// §2.4): ONE exchange per physics step, begin/end around them, and the checks
// that keep the two clocks one clock (contract.js). It talks to a TRANSPORT —
// {call(operation, args) → Promise<reply>} — never to Tauri directly:
//
//   - capabilityTransport(capabilities) (below) is the desktop one: the broker
//     functions native-renode-capability.js builds, keyed by operation name;
//     it exists once the native owner adds the lockstep ops (brickwright-lite#1055);
//   - tests use an in-process fake that models a SPIKE firmware
//     (test/bw-sim-renode-lockstep-fake.mjs).
//
// One request in flight at a time; a failed or desynchronised step fails the
// driver for good (`failed`), so the next call refuses instead of guessing.

import {LOCKSTEP_OPS, QUANTA_US, LockstepContractError, LockstepDesyncError, parseReply, readSnapshot,
    readStepFrame, frameIdentity, stepRequest} from './contract.js';

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * A transport over the native broker's capability object
 * ({'renode.spike.lockstep.step': args => Promise, …}); null when it lacks the lockstep ops.
 */
export const capabilityTransport = capabilities => {
    if (!lockstepAvailable(capabilities)) return null;
    return {
        call (operation, args) {
            const handler = capabilities[operation];
            if (typeof handler !== 'function') return Promise.reject(new LockstepContractError(`the desktop runtime has no '${operation}'`));
            return handler(args);
        }
    };
};

/** Whether a native capability object can run lockstep at all (the pane's gate). */
export const lockstepAvailable = capabilities => Boolean(capabilities) &&
    [LOCKSTEP_OPS.begin, LOCKSTEP_OPS.step, LOCKSTEP_OPS.end].every(op => typeof capabilities[op] === 'function');

export class RenodeLockstepDriver {
    /**
     * @param {object} options
     * @param {{call: Function}} options.transport
     * @param {'nuttx'|'micropython'} [options.backend]
     * @param {'default'|'six-motors'|'dual-ultrasonic'} [options.topology]
     * @param {number} [options.quantumUs] 5000 (one physics step) or 10000
     * @param {boolean} [options.manageSession] start/close the Renode session around lockstep
     *        (the existing session.start/close ops); false when a caller already owns it
     */
    constructor ({transport, backend = 'nuttx', topology = 'default', quantumUs = 5000, manageSession = true}) {
        if (!transport || typeof transport.call !== 'function') throw new TypeError('a lockstep transport needs call(operation, args)');
        if (!QUANTA_US.includes(quantumUs)) throw new TypeError(`quantumUs must be one of ${QUANTA_US.join(', ')}`);
        this.transport = transport;
        this.backend = backend;
        this.topology = topology;
        this.quantumUs = quantumUs;
        this.manageSession = manageSession;
        /** The begin frame's clock: the emulator's virtual time at Lab time 0. */
        this.t0Ns = null;
        this.clockNs = null;
        this.seq = -1;
        this.identity = null;
        /** The last accepted snapshot. */
        this.frame = null;
        /** Ports of the emulated hub ([{id, attached, kind}], from the begin frame). */
        this.ports = [];
        this.state = 'idle';
        this.failed = null;
        this._busy = false;
        /** Exchanges done and the wall time they took (the real-time factor's denominator). */
        this.stats = {exchanges: 0, exchangeMs: 0, maxExchangeMs: 0};
    }

    get began () {
        return this.state === 'running';
    }

    async _call (operation, args) {
        return parseReply(await this.transport.call(operation, args));
    }

    /** Starts the session (if managed), pauses the machine into lockstep and records t0. */
    async begin () {
        if (this.state !== 'idle') throw new Error(`lockstep begin: the driver is ${this.state}`);
        this.state = 'beginning';
        try {
            if (this.manageSession) {
                await this._call(LOCKSTEP_OPS.sessionStart, {backend: this.backend, ...(this.topology !== 'default' ? {topology: this.topology} : {})});
                this.sessionOpen = true;
            }
            const frame = readSnapshot(await this._call(LOCKSTEP_OPS.begin, {quantumUs: this.quantumUs}));
            this.frame = frame;
            this.t0Ns = this.clockNs = frame.clockNs;
            this.seq = frame.seq;
            this.identity = frameIdentity(frame);
            this.ports = frame.ports.map(p => ({...p}));
            this.state = 'running';
            return frame;
        } catch (error) {
            this.failed = error;
            this.state = 'failed';
            throw error;
        }
    }

    /**
     * One exchange: the inputs at t_k in, the emulator runs [t_k, t_k + quantum], the
     * drives over that quantum out.
     * @param {{shafts: object[], sensors: object[], hub?: object, motorPorts: string[]}} inputs
     * @returns {Promise<{clockNs, seq, drives, motors, frame}>}
     */
    async step ({shafts, sensors, hub, motorPorts}) {
        if (this.failed) throw this.failed;
        if (this.state !== 'running') throw new Error(`lockstep step: the driver is ${this.state}`);
        if (this._busy) throw new Error('lockstep step: one exchange is already in flight');
        const expectClockNs = this.clockNs + this.quantumUs * 1000;
        const request = stepRequest({quantumUs: this.quantumUs, expectClockNs: this.clockNs, shafts, sensors, hub});
        this._busy = true;
        const started = now();
        try {
            const reply = await this._call(LOCKSTEP_OPS.step, request);
            if (this.state !== 'running') throw new Error('lockstep step: the session ended during the exchange');
            const read = readStepFrame(reply, {expectClockNs, lastSeq: this.seq, identity: this.identity,
                quantumUs: this.quantumUs, motorPorts});
            this.clockNs = read.clockNs;
            this.seq = read.seq;
            this.frame = read.frame;
            const ms = now() - started;
            this.stats.exchanges++;
            this.stats.exchangeMs += ms;
            this.stats.maxExchangeMs = Math.max(this.stats.maxExchangeMs, ms);
            return read;
        } catch (error) {
            // Desync, contract breach, transport failure: the emulator's state is no longer
            // the Lab's. Fail closed (§2.7).
            this.failed = error;
            this.state = 'failed';
            throw error;
        } finally {
            this._busy = false;
        }
    }

    /** Leaves lockstep and closes the session (if managed). Safe to call twice. */
    async end () {
        if (this.state === 'ended') return;
        const wasRunning = this.state === 'running' || this.state === 'failed';
        this.state = 'ended';
        const errors = [];
        if (wasRunning && this.t0Ns !== null) {
            try { await this._call(LOCKSTEP_OPS.end, {}); } catch (error) { errors.push(error); }
        }
        if (this.sessionOpen) {
            this.sessionOpen = false;
            try { await this._call(LOCKSTEP_OPS.sessionClose, {}); } catch (error) { errors.push(error); }
        }
        if (errors.length) throw errors[0];
    }
}

export {LockstepContractError, LockstepDesyncError};
