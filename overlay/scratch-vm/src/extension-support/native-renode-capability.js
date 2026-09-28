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
    clearBreakpoint: 'renode.spike.breakpoint.clear'
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
