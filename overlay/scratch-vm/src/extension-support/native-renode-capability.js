'use strict';

const OPERATIONS = Object.freeze({
    start: 'renode.spike.session.start',
    close: 'renode.spike.session.close',
    run: 'renode.spike.run',
    pause: 'renode.spike.pause',
    reset: 'renode.spike.reset',
    step: 'renode.spike.step',
    registers: 'renode.spike.registers.read',
    memory: 'renode.spike.memory.read',
    state: 'renode.spike.state.read',
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
    ev3SetBreakpoint: 'renode.ev3.breakpoint.set',
    ev3ClearBreakpoint: 'renode.ev3.breakpoint.clear'
});

const createNativeRenodeCapabilities = ({invoke} = {}) => {
    if (typeof invoke !== 'function') return null;
    let session = null;
    let requestId = 0;
    const request = operation => async args => {
        try {
            if (session === null) {
                session = await invoke('native_broker_open');
                requestId = 0;
            }
            const raw = await invoke('native_broker_request', {session, requestId: requestId++,
                payload: JSON.stringify({kind: 'capability', operation, args})});
            const reply = JSON.parse(raw);
            if (!reply || Object.getPrototypeOf(reply) !== Object.prototype ||
                reply.kind !== 'capability' || typeof reply.result !== 'string') {
                throw new Error('Renode capability reply was malformed');
            }
            return reply.result;
        } catch (error) {
            session = null;
            requestId = 0;
            throw error;
        }
    };
    return Object.freeze(Object.fromEntries(Object.values(OPERATIONS).map(operation =>
        [operation, request(operation)])));
};

module.exports = {createNativeRenodeCapabilities, OPERATIONS};
