'use strict';

const OPERATIONS = Object.freeze({
    start: 'renode.spike.session.start',
    microImageChoose: 'renode.spike.micropython.image.choose',
    close: 'renode.spike.session.close',
    run: 'renode.spike.run',
    pause: 'renode.spike.pause',
    reset: 'renode.spike.reset',
    step: 'renode.spike.step',
    registers: 'renode.spike.registers.read',
    memory: 'renode.spike.memory.read',
    state: 'renode.spike.state.read',
    arenaInputs: 'renode.spike.arena.inputs.write',
    arenaProgram: 'renode.spike.arena.program.load',
    programPacket: 'renode.spike.program.packet',
    microUartRead: 'renode.spike.micropython.uart.read',
    microUartWrite: 'renode.spike.micropython.uart.write',
    microUartClose: 'renode.spike.micropython.uart.close',
    programStorageSubmit: 'renode.spike.program.storage.submit',
    setBreakpoint: 'renode.spike.breakpoint.set',
    clearBreakpoint: 'renode.spike.breakpoint.clear',
    lockstepBegin: 'renode.spike.lockstep.begin',
    lockstepStep: 'renode.spike.lockstep.step',
    lockstepEnd: 'renode.spike.lockstep.end',
    programControlSubmit: 'renode.spike.program.control.submit',
    ev3Start: 'renode.ev3.session.start',
    ev3Close: 'renode.ev3.session.close',
    ev3Run: 'renode.ev3.run',
    ev3Pause: 'renode.ev3.pause',
    ev3Reset: 'renode.ev3.reset',
    ev3Step: 'renode.ev3.step',
    ev3Registers: 'renode.ev3.registers.read',
    ev3Memory: 'renode.ev3.memory.read',
    ev3State: 'renode.ev3.state.read',
    ev3Button: 'renode.ev3.button.set',
    ev3Analog: 'renode.ev3.analog.set-channel',
    ev3SetBreakpoint: 'renode.ev3.breakpoint.set',
    ev3ClearBreakpoint: 'renode.ev3.breakpoint.clear'
});

// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// The relay deliberately returns fixed failure codes, never native exception
// text or private resource paths.
const FAILURE_CODES = new Set(['closed', 'invalid-envelope', 'replayed-request',
    'out-of-order-request', 'capacity', 'invalid-data', 'invalid-url', 'unpinned-url',
    'stale-reply', 'operation-failed', 'invalid-registration', 'unknown-worker',
    'unknown-extension', 'unknown-method', 'timeout']);

// Caller diagnostics only: native authorization and image/API checks still run
// independently and deliberately disclose no policy details. Inspect data
// properties without evaluating getters; other malformed DTOs stay with the
// closed native boundary. Run this inside the queue before reserving a request,
// so a queued mutation is checked without consuming IDs or retiring a session.
const preflightSpikeStart = args => {
    if (!args || Object.getPrototypeOf(args) !== Object.prototype) return;
    const topology = Object.getOwnPropertyDescriptor(args, 'topology');
    if (!topology || typeof topology.value !== 'string') return;
    if (!['default', 'six-motors', 'dual-ultrasonic'].includes(topology.value)) {
        throw new Error('unknown SPIKE topology');
    }
    if (topology.value !== 'default') {
        const backend = Object.getOwnPropertyDescriptor(args, 'backend');
        if (!backend || (backend.value !== 'nuttx' &&
            !(topology.value === 'six-motors' && backend.value === 'micropython'))) {
            throw new Error('custom topology requires own NuttX firmware');
        }
    }
};

const createNativeRenodeCapabilities = ({invoke} = {}) => {
    if (typeof invoke !== 'function') return null;
    let session = null;
    // Match the native relay's bounded correlation history. Renewal disposes
    // transport bookkeeping only; the managed debugger owns the emulator.
    const REQUEST_BUDGET = 512;
    let allocation = Promise.resolve();
    let dispatch = Promise.resolve();
    const reserve = () => {
        const next = allocation.then(async () => {
            if (session && (session.failed || session.nextId === REQUEST_BUDGET)) {
                const retired = session;
                if (retired.pending) await new Promise(resolve => { retired.drained = resolve; });
                await invoke('native_broker_main_teardown', {session: retired.id});
                session = null;
            }
            if (session === null) {
                session = {id: await invoke('native_broker_open'), nextId: 0, pending: 0, failed: false};
            }
            const owned = session;
            owned.pending++;
            return {owned, requestId: owned.nextId++};
        });
        // Serialize allocation and renewal. A failed open/teardown is never
        // replayed as a semantic operation or left poisoning the queue.
        allocation = next.then(() => {}, () => {});
        return next;
    };
    // BSD-3-Clause, (c) 2026 Brickwright contributors.
    // Tauri schedules async handlers independently. Keep submission and reply
    // in order so a later request cannot reach the strict relay first.
    const request = operation => args => {
        const next = dispatch.then(async () => {
            if (operation === OPERATIONS.start) preflightSpikeStart(args);
            const {owned, requestId} = await reserve();
            try {
                const raw = await invoke('native_broker_request', {session: owned.id, requestId,
                    payload: JSON.stringify({kind: 'capability', operation, args})});
                const reply = JSON.parse(raw);
                if (reply && Object.getPrototypeOf(reply) === Object.prototype &&
                    Object.keys(reply).sort().join(',') === 'code,kind,request_kind' &&
                    reply.kind === 'failure' && reply.request_kind === 'capability' &&
                    FAILURE_CODES.has(reply.code)) {
                    const error = new Error(`Firmware simulator request failed (${reply.code})`);
                    error.code = reply.code;
                    throw error;
                }
                if (!reply || Object.getPrototypeOf(reply) !== Object.prototype ||
                    reply.kind !== 'capability' || typeof reply.result !== 'string') {
                    throw new Error('Renode capability reply was malformed');
                }
                return reply.result;
            } catch (error) {
                owned.failed = true;
                throw error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'Renode operation failed');
            } finally {
                if (--owned.pending === 0) owned.drained?.();
            }
        });
        dispatch = next.then(() => {}, () => {});
        return next;
    };
    return Object.freeze(Object.fromEntries(Object.values(OPERATIONS).map(operation =>
        [operation, request(operation)])));
};

module.exports = {createNativeRenodeCapabilities, OPERATIONS};
