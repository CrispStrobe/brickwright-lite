'use strict';

const OPERATIONS = Object.freeze({
    start: 'renode.spike.session.start',
    close: 'renode.spike.session.close'
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
    return Object.freeze({
        [OPERATIONS.start]: request(OPERATIONS.start),
        [OPERATIONS.close]: request(OPERATIONS.close)
    });
};

module.exports = {createNativeRenodeCapabilities, OPERATIONS};
