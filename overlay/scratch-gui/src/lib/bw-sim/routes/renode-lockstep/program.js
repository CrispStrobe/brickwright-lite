// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The user's program on the emulated SPIKE hub of the Robot Lab's firmware route
// (docs/ROBOT-LAB-SPIKE-EMULATION.md §2.6, §7.4). Two phases, as the plan has them:
//
//   upload()  BEFORE lockstep.begin, while the guest still runs free: BEGIN, CHUNK…,
//             COMMIT as NuttX program packets — the SPIKE arena's own client
//             (spike-nuttx/upload-protocol.js NuttXProgramClient, `start: false`)
//             over `renode.spike.program.packet`, whose reply the firmware writes
//             within the packet's wall-time wait. Ends with the program READY.
//   start()/stop()  INSIDE lockstep: START / STOP through
//             `renode.spike.program.control.submit`, which returns at once; the
//             firmware takes the packet during later steps and its reply appears in
//             a step snapshot (`lifecycle.nuttxProgramReply`), which observe() reads.
//
// The firmware's mailbox holds ONE request: nothing is submitted while another is
// unanswered (the state service refuses it). A reply carries no sequence, only its
// operation, so consecutive controls must differ to be told apart: START after a
// START (Run again after the program completed) first sends a STOP. stop() during an
// unanswered START waits for its reply, then stops.

import {NuttXProgramClient, encodeInstructions, encodeCommand, decodeReply, PROGRAM_OP, PROGRAM_STATE} from '../../../spike-nuttx/upload-protocol.js';
import {LOCKSTEP_OPS, parseReply} from './contract.js';

/** The program id the route uploads under (one program per session). */
export const ROUTE_PROGRAM_ID = 1;

export const PROGRAM_STATE_NAMES = Object.freeze(['empty', 'ready', 'running', 'complete', 'stopped', 'fault']);

const OP_NAME = {[PROGRAM_OP.START]: 'START', [PROGRAM_OP.STOP]: 'STOP'};

/** The firmware refused a program packet or reported a FAULT: says which, with its code. */
export class FirmwareRunError extends Error {
    constructor (message, {code, result = null, error = null} = {}) {
        super(message);
        this.name = 'FirmwareRunError';
        this.code = code;
        this.result = result;
        this.error = error;
    }
}

export class LockstepProgram {
    /**
     * @param {object} options
     * @param {{call: Function}} options.transport the route's transport (broker op names)
     * @param {{version: 1, instructions: number[][]}} options.program compileFirmwareProgram's output
     * @param {'default'|'six-motors'|'dual-ultrasonic'} [options.topology]
     * @param {number} [options.id]
     * @param {Function} [options.onChange] called after the program's state or a control changed
     */
    constructor ({transport, program, topology = 'default', id = ROUTE_PROGRAM_ID, onChange = () => {}}) {
        if (!transport || typeof transport.call !== 'function') throw new TypeError('a lockstep program needs a transport');
        // Validate (and copy) before anything is sent: a program the ABI refuses never reaches the hub.
        encodeInstructions(program, {topology});
        this.program = {version: 1, instructions: program.instructions.map(row => [...row])};
        this.key = JSON.stringify(this.program.instructions);
        this.transport = transport;
        this.topology = topology;
        this.id = id;
        this.onChange = onChange;
        /** The firmware program state (PROGRAM_STATE), as the last snapshot reported it. */
        this.state = null;
        /** The firmware's last error code (lifecycle.nuttxProgram.error) once it FAULTs. */
        this.fault = null;
        this.uploaded = false;
        /** The control submitted and not yet answered: {op, requestSeq}. */
        this.pending = null;
        /** Controls waiting for the mailbox (an unanswered one ahead of them). */
        this.queue = [];
        /** The operation of the last reply the firmware wrote (COMMIT once uploaded). */
        this.lastReplyOp = null;
        /** A refused control or a submit failure; the pane shows it. */
        this.failed = null;
        /** Every control sent, in order ([{op, requestSeq}]) — what tests and the headless proof read. */
        this.sent = [];
    }

    get stateName () {
        return this.state === null ? null : PROGRAM_STATE_NAMES[this.state];
    }

    get running () {
        return this.state === PROGRAM_STATE.RUNNING;
    }

    /** No control is waiting or unanswered. */
    get idle () {
        return !this.pending && this.queue.length === 0;
    }

    async _packet (bytes) {
        const frame = parseReply(await this.transport.call(LOCKSTEP_OPS.programPacket, {bytes: Array.from(bytes)}));
        this._readStatus(frame);
        return new Uint8Array(frame?.lifecycle?.nuttxProgramReply || []);
    }

    /** BEGIN/CHUNK/COMMIT on the free-running guest; resolves once the firmware holds the program READY. */
    async upload () {
        if (this.uploaded) throw new Error('the program is already uploaded');
        const client = new NuttXProgramClient(bytes => this._packet(bytes), this.id, {topology: this.topology});
        let committed;
        try {
            committed = await client.upload(this.program, {start: false});
        } catch (error) {
            throw new FirmwareRunError(`the emulated hub refused the program upload: ${error.message}`,
                {code: 'upload-refused', result: error.result ?? null});
        }
        if (committed.state !== PROGRAM_STATE.READY) {
            throw new FirmwareRunError(`the emulated hub did not hold the program ready (state ${PROGRAM_STATE_NAMES[committed.state]})`,
                {code: 'upload-refused'});
        }
        this.uploaded = true;
        this.state = committed.state;
        this.lastReplyOp = PROGRAM_OP.COMMIT;
        this.onChange(this);
        return committed;
    }

    /** Runs the program from its start (Run). Resolves once START is submitted or queued. */
    start () {
        if (!this.uploaded) return Promise.reject(new Error('no program is uploaded'));
        this.failed = null;
        this.fault = null;
        // The last control in line decides what precedes this START (see the header).
        const last = this.queue.at(-1) ?? this.pending?.op ?? this.lastReplyOp;
        if (last === PROGRAM_OP.START) this.queue.push(PROGRAM_OP.STOP);
        this.queue.push(PROGRAM_OP.START);
        return this._pump();
    }

    /** Stops the program (Pause / Reset). Resolves once STOP is submitted or queued; false when nothing runs. */
    stop () {
        const last = this.queue.at(-1) ?? this.pending?.op ?? null;
        if (last === PROGRAM_OP.STOP) return Promise.resolve(true);
        if (last === null && !this.running) return Promise.resolve(false);
        this.queue.push(PROGRAM_OP.STOP);
        return this._pump().then(() => true);
    }

    async _pump () {
        if (this.pending || this.queue.length === 0) return;
        const op = this.queue.shift();
        this.pending = {op, requestSeq: null};
        try {
            const reply = parseReply(await this.transport.call(LOCKSTEP_OPS.programControl,
                {bytes: Array.from(encodeCommand(op, this.id))}));
            const requestSeq = reply?.data?.requestSeq;
            if (!Number.isSafeInteger(requestSeq)) throw new Error('the emulator did not acknowledge the submission');
            this.pending.requestSeq = requestSeq;
            this.sent.push({op, requestSeq});
        } catch (error) {
            this.pending = null;
            this.queue = [];
            this.failed = new FirmwareRunError(`${OP_NAME[op]} was not accepted: ${error.message}`, {code: 'control-refused'});
            this.onChange(this);
            throw this.failed;
        }
        this.onChange(this);
    }

    _readStatus (frame) {
        const status = frame?.lifecycle?.nuttxProgram;
        if (!status || !Number.isInteger(status.state)) return;
        const before = this.state;
        this.state = status.state;
        if (status.state === PROGRAM_STATE.FAULT && before !== PROGRAM_STATE.FAULT) {
            this.fault = status.error ?? status.runtimeError ?? null;
        }
        return before !== this.state;
    }

    /** A lockstep snapshot (the driver calls this for every one it accepts). */
    observe (frame) {
        let changed = this._readStatus(frame);
        const raw = frame?.lifecycle?.nuttxProgramReply;
        if (this.pending && Array.isArray(raw) && raw.length === 20 && raw[2] === this.pending.op && raw[2] !== this.lastReplyOp) {
            const op = this.pending.op;
            this.pending = null;
            this.lastReplyOp = op;
            changed = true;
            try {
                const reply = decodeReply(new Uint8Array(raw), {op, id: this.id});
                if (reply.result !== 0) {
                    this.queue = [];
                    this.failed = new FirmwareRunError(`the firmware refused ${OP_NAME[op]} (${reply.result})`,
                        {code: 'control-refused', result: reply.result});
                }
            } catch (error) {
                this.queue = [];
                this.failed = new FirmwareRunError(`the firmware's ${OP_NAME[op]} reply was not readable: ${error.message}`, {code: 'control-refused'});
            }
            // The next control in line goes out now (between steps; the transport serializes).
            if (!this.failed && this.queue.length) this._pump().catch(() => {});
        }
        if (changed) this.onChange(this);
    }
}
