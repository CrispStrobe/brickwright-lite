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
// unanswered (the state service refuses it). Legacy packages distinguish replies
// by operation; coherent packages additionally bind the real request/reply sequence.
// Preserve alternating controls for both routes: START after a
// START (Run again after the program completed) first sends a STOP. stop() during an
// unanswered START waits for its reply, then stops.

import {NuttXProgramClient, encodeInstructions, encodePython, encodeCommand, decodeReply, PROGRAM_OP, PROGRAM_STATE} from '../../../spike-nuttx/upload-protocol.js';
import {LOCKSTEP_OPS, parseReply} from './contract.js';

/** The program id the route uploads under (one program per session). */
export const ROUTE_PROGRAM_ID = 1;

export const PROGRAM_STATE_NAMES = Object.freeze(['empty', 'ready', 'running', 'complete', 'stopped', 'fault']);

export const PUBLICATION_CAPABILITY = 'nuttx-program-publication/v1';
const publicationSequence = value => Number.isInteger(value) && value > 0 && value <= 0xffffffff && value % 2 === 0;

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
     * @param {string|null} [options.pythonSource] own-NuttX embedded Python, mutually exclusive with program
     * @param {{version: 1|2, instructions: number[][]}} options.program compileFirmwareProgram's output
     * @param {'default'|'six-motors'|'dual-ultrasonic'} [options.topology]
     * @param {number} [options.id]
     * @param {Function} [options.onChange] called after the program's state or a control changed
     */
    constructor ({transport, program = null, pythonSource = null, topology = 'default', id = ROUTE_PROGRAM_ID, onChange = () => {}}) {
        if (!transport || typeof transport.call !== 'function') throw new TypeError('a lockstep program needs a transport');
        // Validate (and copy) before anything is sent: a program the ABI refuses never reaches the hub.
        if ((program !== null) === (pythonSource !== null)) throw new TypeError('provide exactly one compiled program or Python source');
        this.python = pythonSource !== null;
        if (this.python) {
            encodePython(pythonSource);
            this.program = pythonSource;
            this.key = `python:${pythonSource}`;
        } else {
            encodeInstructions(program, {topology});
            this.program = {version: program.version, instructions: program.instructions.map(row => [...row])};
            this.key = JSON.stringify(this.program.instructions);
        }
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
        /** Real Runtime metadata; legacy compiled packages retain their old contract. */
        this.coherentPublications = false;
        this.stateFresh = false;
        this.lastPublication = null;
        this.statusBarrier = null;
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
        const advertised = frame?.target?.capabilities?.includes(PUBLICATION_CAPABILITY) === true;
        if (this.coherentPublications && !advertised) throw new Error('program publication capability disappeared');
        if (this.python && !advertised) throw new Error('embedded Python requires coherent program publications');
        this.coherentPublications = advertised;
        this._readStatus(frame);
        return new Uint8Array(frame?.lifecycle?.nuttxProgramReply || []);
    }

    /** BEGIN/CHUNK/COMMIT on the free-running guest; resolves once the firmware holds the program READY. */
    async upload () {
        if (this.uploaded) throw new Error('the program is already uploaded');
        const client = new NuttXProgramClient(bytes => this._packet(bytes), this.id, {topology: this.topology});
        let committed;
        try {
            committed = await client.upload(this.program, {python: this.python, start: false});
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
        if (this.coherentPublications) {
            // COMMIT also acknowledges before the status publication refreshes.
            // Keep its real READY state across an unchanged begin snapshot.
            this.stateFresh = false;
            this.statusBarrier = {floor: this.lastPublication};
        }
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
            if (!Number.isSafeInteger(requestSeq) || (this.coherentPublications && !publicationSequence(requestSeq))) throw new Error('the emulator did not acknowledge the submission');
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

    _publication (frame) {
        const status = frame?.lifecycle?.nuttxProgram;
        if (status === undefined) return null;
        const sequence = status.publicationSeq;
        if (!publicationSequence(sequence) || !Number.isInteger(status.state) || status.state < 0 || status.state > 5) {
            throw new FirmwareRunError('invalid coherent program status', {code: 'publication-invalid'});
        }
        if (this.lastPublication !== null && sequence < this.lastPublication) {
            throw new FirmwareRunError('program publication reset or wrapped; open a new session', {code: 'publication-reset'});
        }
        this.lastPublication = sequence;
        return sequence;
    }

    _readStatus (frame, publication = undefined) {
        const status = frame?.lifecycle?.nuttxProgram;
        this.stateFresh = false;
        if (this.coherentPublications) {
            const sequence = publication === undefined ? this._publication(frame) : publication;
            if (sequence === null) return false;
            if (this.statusBarrier) {
                if (this.statusBarrier.floor === null) {
                    this.statusBarrier.floor = sequence;
                    return false;
                }
                if (sequence <= this.statusBarrier.floor) return false;
                this.statusBarrier = null;
            }
        }
        if (!status || !Number.isInteger(status.state)) return false;
        const before = this.state;
        this.state = status.state;
        this.stateFresh = true;
        if (status.state === PROGRAM_STATE.FAULT && before !== PROGRAM_STATE.FAULT) {
            this.fault = status.error ?? status.runtimeError ?? null;
        }
        return before !== this.state;
    }

    /** A lockstep snapshot (the driver calls this for every one it accepts). */
    observe (frame) {
        const publication = this.coherentPublications ? this._publication(frame) : undefined;
        let acknowledged = false;
        let changed = false;
        const raw = frame?.lifecycle?.nuttxProgramReply;
        if (this.pending && Array.isArray(raw) && raw.length === 20 && raw[2] === this.pending.op && raw[2] !== this.lastReplyOp &&
            (!this.coherentPublications || (publicationSequence(this.pending.requestSeq) &&
                frame.lifecycle.nuttxProgramReplySeq === this.pending.requestSeq))) {
            const op = this.pending.op;
            this.pending = null;
            this.lastReplyOp = op;
            changed = true;
            try {
                if (raw.some(value => !Number.isInteger(value) || value < 0 || value > 255)) throw new Error('reply bytes out of range');
                const reply = decodeReply(new Uint8Array(raw), {op, id: this.id});
                if (reply.result !== 0) {
                    this.queue = [];
                    this.failed = new FirmwareRunError(`the firmware refused ${OP_NAME[op]} (${reply.result})`,
                        {code: 'control-refused', result: reply.result});
                } else if (this.coherentPublications) {
                    // ACK state is genuine but may precede the status refresh. Never
                    // let this frame's old COMPLETE/STOPPED undo a new START.
                    this.state = reply.state;
                    this.stateFresh = false;
                    this.statusBarrier = {floor: publication};
                    acknowledged = true;
                }
            } catch (error) {
                this.queue = [];
                this.failed = new FirmwareRunError(`the firmware's ${OP_NAME[op]} reply was not readable: ${error.message}`, {code: 'control-refused'});
            }
            // The next control in line goes out now (between steps; the transport serializes).
            if (!this.failed && this.queue.length) this._pump().catch(() => {});
        }
        if (!acknowledged) changed = this._readStatus(frame, publication) || changed;
        if (changed) this.onChange(this);
    }
}
