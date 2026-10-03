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

const createNativeRenodeCapabilities = ({invoke} = {}) => {
    if (typeof invoke !== 'function') return null;
    let session = null;
    // Match the native relay's bounded correlation history. Renewal disposes
    // transport bookkeeping only; the managed debugger owns the emulator.
    const REQUEST_BUDGET = 512;
    let allocation = Promise.resolve();
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
        // Serialize allocation and renewal, while allowing ordinary requests
        // to execute concurrently. A failed open/teardown is never replayed as
        // a semantic operation and does not poison the allocation queue.
        allocation = next.then(() => {}, () => {});
        return next;
    };
    const request = operation => async args => {
        const {owned, requestId} = await reserve();
        try {
            const raw = await invoke('native_broker_request', {session: owned.id, requestId,
                payload: JSON.stringify({kind: 'capability', operation, args})});
            const reply = JSON.parse(raw);
            if (!reply || Object.getPrototypeOf(reply) !== Object.prototype ||
                reply.kind !== 'capability' || typeof reply.result !== 'string') {
                throw new Error('Renode capability reply was malformed');
            }
            return reply.result;
        } catch (error) {
            owned.failed = true;
            throw error;
        } finally {
            if (--owned.pending === 0) owned.drained?.();
        }
    };
    return Object.freeze(Object.fromEntries(Object.values(OPERATIONS).map(operation =>
        [operation, request(operation)])));
};

module.exports = {createNativeRenodeCapabilities, OPERATIONS};
