/**
 * The JavaScript half of `platform.kind.read`.
 *
 * CP3-D1 asks that JavaScript and Rust return the same platform result "without exposing a
 * reusable invoke handle". This is the seam where that is decided, so the shape matters more
 * than the code:
 *
 *   - The editor reaches the operation through the EXISTING broker transport
 *     (`native_broker_open` / `native_broker_request`), not through a native command of its own.
 *     The semantic commands stay bound to the broker label, which is what
 *     `tauri-broker-topology` asserts and what the whole lane exists to establish. A direct
 *     main-label command would have been a smaller diff and a second path to the executor.
 *   - The request names an OPERATION and nothing else. The broker realm chooses the resource and
 *     mints the lease, so this side cannot widen the request, and never holds a lease it could
 *     replay. There is no handle here to reuse: every call is one round trip.
 *   - Outside Tauri there is no `invoke`, this factory returns null, the operation stays UNWIRED,
 *     and `CapabilityBroker` refuses it as `unavailable-operation`. A browser build fails closed
 *     without a branch anywhere claiming to answer for a boundary it does not have.
 */

const OPERATION = 'platform.kind.read';

/**
 * @param {{invoke: ?Function}} options the host's `invoke`, or null outside the desktop app
 * @returns {?Function} a CapabilityBroker handler, or null when there is no native boundary
 */
const createNativePlatformCapability = ({invoke} = {}) => {
    if (typeof invoke !== 'function') return null;

    let session = null;
    let nextRequestId = 0;

    return async args => {
        // On ANY failure the session is dropped so the next call opens a fresh one. Deliberately
        // no retry inside a call: a refusal and a dead session are indistinguishable from here,
        // and retrying a refusal would spend a second lease on a request already denied once.
        try {
            if (session === null) {
                session = await invoke('native_broker_open');
                nextRequestId = 0;
            }
            const raw = await invoke('native_broker_request', {
                session,
                requestId: nextRequestId++,
                payload: JSON.stringify({kind: 'capability', operation: OPERATION, args})
            });
            const reply = JSON.parse(raw);
            if (!reply || Object.getPrototypeOf(reply) !== Object.prototype ||
                reply.kind !== 'capability' || typeof reply.result !== 'string') {
                throw new Error('Capability reply was not a capability result');
            }
            return reply.result;
        } catch (error) {
            session = null;
            nextRequestId = 0;
            throw error;
        }
    };
};

module.exports = {createNativePlatformCapability, OPERATION};
