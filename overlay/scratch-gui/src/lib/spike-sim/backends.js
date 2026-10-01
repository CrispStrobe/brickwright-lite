// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// Backend selection and shared-world ownership; no WASM is loaded by the native route.

export const createSpikeBackend = async ({kind = 'native', hubState, arena = null, ...options} = {}) => {
    if (!hubState?.data || !hubState.backend) throw new TypeError('a virtual SPIKE hub is required');
    if (kind === 'native') return hubState.backend;
    if (kind !== 'pybricks') throw new RangeError(`unknown SPIKE backend: ${kind}`);
    const [{createPybricksHost}, {applyHubStateToSim, mirrorSimToHubState}] = await Promise.all([
        import('../pybricks-sim/pybricks-hub-host.js'), import('../pybricks-sim/pybricks-hub-bridge.js')
    ]);
    let host;
    let lastTick = null;
    let active = false;
    let runToken = null;
    let rawStop;
    const publish = () => {
        mirrorSimToHubState(host, hubState);
        applyHubStateToSim(host, hubState.data);
    };
    host = await createPybricksHost({...options, onTick: ms => {
        if (active && lastTick !== null && hubState.clockOwner === 'pybricks') {
            publish();
            const world = typeof arena === 'function' ? arena() : arena;
            if (world) world.tick(ms - lastTick);
            // Arena sensor/heading values reach the Python program before its next read.
            applyHubStateToSim(host, hubState.data);
        }
        lastTick = ms;
        if (runToken?.cancelled) rawStop?.();
        options.onTick?.(ms);
    }});
    const run = host.run.bind(host);
    rawStop = host.stop.bind(host);
    host.stop = () => {
        if (runToken) runToken.cancelled = true;
        rawStop();
    };
    const runShared = async (...args) => {
        if (hubState.clockOwner) throw new Error('the virtual SPIKE hub is already owned by a backend');
        runToken = {cancelled: false};
        const startMs = host.simulatedMs;
        hubState.backend.cancel();
        hubState.clockOwner = 'pybricks';
        hubState.externalBackend = host;
        try {
            applyHubStateToSim(host, hubState.data);
            await host.boot();
            if (runToken.cancelled) return {result: 'stopped', code: 2, simulatedMs: host.simulatedMs - startMs};
            for (const [i, port] of [...'ABCDEF'].entries()) {
                if (host.device(port).startsWith('motor')) host.setMotorAngle(port, hubState.data.motors[i].position);
            }
            lastTick = null;
            active = true;
            options.onStart?.();
            if (runToken.cancelled) return {result: 'stopped', code: 2, simulatedMs: host.simulatedMs - startMs};
            return await run(...args);
        } finally {
            active = false;
            try { publish(); } finally {
                lastTick = null;
                runToken = null;
                hubState.clockOwner = null;
                hubState.externalBackend = null;
                options.onEnd?.();
            }
        }
    };
    host.run = (...args) => {
        if (hubState.clockOwner) return Promise.reject(new Error('the virtual SPIKE hub is already owned by a backend'));
        const completion = runShared(...args);
        host.completion = completion;
        return completion;
    };
    host.kind = 'pybricks';
    host.hubState = hubState;
    host.cancel = host.stop.bind(host);
    return host;
};
