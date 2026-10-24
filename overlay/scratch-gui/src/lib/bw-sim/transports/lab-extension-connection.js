// SPDX-License-Identifier: BSD-3-Clause
// Connect through the loaded extension's own block primitives. Requests for the
// same provider are serialized, including cancellation cleanup, so a delayed
// old connect cannot disconnect a newer Lab connection.
const queues = new WeakMap();
const legacyQueues = new WeakMap();
const legacyState = runtime => {
    let state = legacyQueues.get(runtime);
    if (!state) { state = {tail: Promise.resolve(), failure: null}; legacyQueues.set(runtime, state); }
    return state;
};

export const labProviderRetirementFailure = vm => legacyQueues.get(vm?.runtime)?.failure || null;

// Keep the existing Bluetooth helpers intact, but order their provider work
// against virtual requests, including across replacement panes on the same VM.
// Capture predecessors before publishing this operation to avoid wait cycles.
export const serializeLabLegacyConnection = ({vm, connect, isCurrent = () => true}) => {
    const runtime = vm?.runtime;
    if (!runtime || typeof connect !== 'function') throw new TypeError('The program runtime is unavailable.');
    const state = legacyState(runtime);
    const previous = state.tail;
    const retirements = [...(queues.get(runtime)?.values() || [])].map(queue =>
        queue.ticket ? queue.ticket.cancel() : queue.tail);
    const retired = Promise.all(retirements).catch(error => { if (!state.failure) state.failure = error; throw error; });
    const ready = Promise.all([previous, retired]).then(async () => {
        if (state.failure) throw state.failure;
        if (!isCurrent()) throw abort();
        const result = await connect();
        if (!isCurrent()) throw abort();
        return result;
    });
    state.tail = ready.then(() => undefined, () => undefined);
    return ready;
};

const abort = () => new DOMException('The Robot Lab connection request was replaced.', 'AbortError');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const planFor = (id, route) => {
    if (id === 'ev3comprehensive' && ['serial', 'bridge'].includes(route)) return {
        configure: [['setMode', {MODE: route}]],
        connect: ['connect', {PARAM: route === 'bridge' ? 'ws://localhost:8080' : ''}], close: 'disconnect', status: 'isConnected'
    };
    if (id === 'legonxt' && ['serial', 'bridge'].includes(route)) return {
        configure: [['setConnectionMode', {MODE: route === 'serial' ? 'direct' : 'bridge'}]],
        connect: ['connect', {URL: route === 'bridge' ? 'ws://localhost:8765' : ''}], close: 'disconnect', status: 'isConnected'
    };
    if (id === 'spikeprime' && route === 'bridge') return {
        configure: [], connect: ['connectHubAt', {URL: 'localhost:8081'}], close: 'disconnectHub', status: 'isConnected', portReport: true
    };
    if (['legopoweredup', 'legoboostunified'].includes(id) && route === 'http') return {
        configure: [['setConnectionType', {TYPE: 'bridge'}], ['setBridgeURL', {URL: 'http://localhost:8080'}]],
        connect: ['connect', {}], close: 'disconnect', status: 'isConnected'
    };
    if (id === 'scratchtoev3' && route === 'http') return {
        configure: [['setConnectionMode', {MODE: 'http', IP: '127.0.0.1', PORT: 8080}]],
        connect: ['testConnection', {}], close: 'disableStreaming', status: null
    };
    throw new TypeError(`The ${id} extension does not support the selected Lab connection.`);
};

// timeoutMs bounds status polling only. Provider operations keep their own
// lifetimes; cancellation fences their result and serializes cleanup. The pane
// must stop clocks/invalidate routes immediately, without awaiting that cleanup
// before displaying a replacement scene.
export const createLabExtensionConnection = ({vm, extensionId, route, isCurrent = () => true,
    host = globalThis, wait = sleep, timeoutMs = 15000} = {}) => {
    const plan = planFor(extensionId, route);
    const runtime = vm?.runtime;
    if (!runtime?._primitives) throw new TypeError('The program runtime is unavailable.');
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 30000) throw new TypeError('Invalid connection status wait.');
    const primitives = new Map();
    const peripheral = plan.portReport ? runtime.peripheralExtensions?.[extensionId] : null;
    if (plan.portReport && !peripheral) throw new Error('The SPIKE extension peripheral is unavailable.');
    for (const opcode of [plan.close, plan.connect[0], ...plan.configure.map(([op]) => op), plan.status].filter(Boolean)) {
        const fn = runtime._primitives[`${extensionId}_${opcode}`];
        if (typeof fn !== 'function') throw new Error(`The ${extensionId} extension is not loaded (${opcode}).`);
        primitives.set(opcode, fn);
    }
    let byId = queues.get(runtime);
    if (!byId) { byId = new Map(); queues.set(runtime, byId); }
    if (!byId.has(extensionId)) byId.set(extensionId, {tail: Promise.resolve(), ticket: null, providerOwner: null});
    const queue = byId.get(extensionId);
    const enqueue = work => {
        const result = queue.tail.then(work);
        // Only the internal queue settles errors here. The caller's ready and
        // cancel promises retain their rejection for visible error handling.
        queue.tail = result.then(() => undefined, () => undefined);
        return result;
    };
    const previousCleanup = queue.ticket ? queue.ticket.cancel() : Promise.resolve();
    const legacy = legacyState(runtime);
    const previousLegacy = legacy.tail;
    const previousResult = previousCleanup.then(() => null, error => ({error}));
    const ticket = {active: true, cancel: null};
    queue.ticket = ticket;
    const current = () => ticket.active && queue.ticket === ticket && isCurrent() &&
        (!plan.portReport || runtime.peripheralExtensions?.[extensionId] === peripheral) &&
        [...primitives].every(([opcode, fn]) => runtime._primitives[`${extensionId}_${opcode}`] === fn);
    const invoke = async (opcode, args = {}) => {
        if (!current()) throw abort();
        const result = await primitives.get(opcode)(args, {runtime});
        if (!current()) throw abort();
        return result;
    };
    let cleanupFailure = null;
    const close = async () => {
        if (queue.providerOwner !== ticket) {
            if (cleanupFailure) throw cleanupFailure;
            return;
        }
        // Clear ownership first, including when the producer's close throws.
        queue.providerOwner = null;
        try { await primitives.get(plan.close)({}, {runtime}); }
        catch (error) { cleanupFailure = error; if (!legacy.failure) legacy.failure = error; throw error; }
    };
    let closing = null;
    ticket.cancel = () => {
        ticket.active = false;
        if (queue.ticket === ticket) queue.ticket = null;
        if (!closing) closing = enqueue(close);
        return closing;
    };
    const ready = enqueue(async () => {
        const previous = await previousResult;
        await previousLegacy;
        if (previous) throw previous.error;
        if (legacy.failure) throw legacy.failure;
        if (!current()) throw abort();
        queue.providerOwner = ticket;
        try {
            await invoke(plan.close);
            for (const [opcode, args] of plan.configure) await invoke(opcode, args);
            await invoke(...plan.connect);
            if (plan.status) {
                let connected = false;
                let elapsed = 0;
                while (elapsed <= timeoutMs) {
                    const transportConnected = await invoke(plan.status) === true;
                    // SPIKE 2.x announces its port report after opening the
                    // REPL. Until it arrives, sensor reporters return defaults
                    // (including distance 0). Read the actual consumer cache;
                    // a real zero reading is valid once the report exists.
                    const ports = plan.portReport ? peripheral.portValues : null;
                    if (!current()) throw abort();
                    const reportReady = !plan.portReport || ['A', 'B', 'C', 'D', 'E', 'F']
                        .every(port => Object.hasOwn(ports || {}, port) && typeof ports[port]?.type === 'string');
                    if (transportConnected && reportReady) { connected = true; break; }
                    if (elapsed >= timeoutMs) break;
                    const step = Math.min(50, timeoutMs - elapsed);
                    await wait(step);
                    elapsed += step;
                    if (!current()) throw abort();
                }
                if (!connected) throw new Error(`No connection from ${extensionId} to its Lab brick.`);
            } else {
                // ev3dev's test block returns translated prose, not a Boolean.
                // Check the owned endpoint's actual protocol response instead
                // of treating any nonempty error string as success.
                const response = await host.fetch('http://127.0.0.1:8080/');
                const body = await response.json();
                if (!current()) throw abort();
                if (!response.ok || body.status !== 'ev3_bridge_active') throw new Error('The Lab EV3 HTTP connection failed.');
            }
            return {extensionId, route};
        } catch (error) {
            try { await close(); }
            catch (cleanupError) { throw new AggregateError([error, cleanupError], 'Lab connection and cleanup failed'); }
            throw error;
        }
    });
    return {ready, cancel: ticket.cancel};
};
