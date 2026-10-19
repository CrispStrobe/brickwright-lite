// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Connect a Scratch-Link-BT extension (the stock `ev3`, `legonxt`, `ev3comprehensive`) to a
// virtual brick of the BT-classic registry (bt-classic-registry.js) — the Robot Lab's Run for an
// EV3 or NXT scene. A local adapter: the plan's `connectVirtualHub({extensionId, hubState})`
// (docs/ROBOT-LAB-HUBS-PLAN.md P0) is being written for the BLE hubs in a parallel lane; when it
// lands, this becomes its BT-classic branch (docs/ROBOT-LAB-EV3-NXT.md "Merge notes").
//
// Two shapes of extension:
//   a peripheral extension (registered with the runtime: `ev3`, `legonxt`) is scanned and
//     connected as the GUI's connection dialog would — scan, wait for the virtual brick in the
//     peripheral list, connect to it by id;
//   ev3comprehensive keeps its own connection (a mode and a connect block): its own blocks set
//     it to Scratch Link and connect it, and it finds the brick by its name ("…EV3…").
// Either way the extension's own code dials Scratch Link; nothing of it is replaced.

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * @param {object} options
 * @param {object} options.vm the Scratch VM
 * @param {string} options.extensionId 'ev3' | 'legonxt' | 'ev3comprehensive'
 * @param {string} options.peripheralId the virtual brick's id in the registry
 * @param {number} [options.timeoutMs]
 * @param {(ms: number) => Promise} [options.wait] how to wait (tests pass their clock's)
 */
export async function connectVirtualBtHub ({vm, extensionId, peripheralId, timeoutMs = 5000, wait = sleep}) {
    const runtime = vm.runtime;
    const deadline = async (done, what, poll = null) => {
        for (let waited = 0; waited < timeoutMs; waited += 50) {
            if (poll) await poll();
            if (done()) return;
            await wait(50);
        }
        if (!done()) throw new Error(`${extensionId}: ${what}`);
    };
    if (extensionId === 'ev3comprehensive') {
        // Its own blocks, as a program would use them: set the connection mode, connect, ask.
        const call = (opcode, args = {}) => {
            const fn = runtime._primitives[`ev3comprehensive_${opcode}`];
            if (typeof fn !== 'function') throw new Error('ev3comprehensive is not loaded');
            return fn(args, {runtime});
        };
        await call('disconnect');
        await call('setMode', {MODE: 'scratchlink'});
        await call('connect', {PARAM: ''});
        // docs/ROBOT-LAB-EV3-NXT.md "Known open": its isConnected() reads a flag its Scratch Link backend
        // never sets, so this waits in vain until the extension is fixed upstream.
        let connected = false;
        await deadline(() => connected, 'no connection to the virtual EV3', async () => { connected = Boolean(await call('isConnected')); });
        return;
    }
    const peripheral = runtime.peripheralExtensions && runtime.peripheralExtensions[extensionId];
    if (!peripheral) throw new Error(`${extensionId} is not loaded`);
    if (vm.getPeripheralIsConnected(extensionId)) {
        vm.disconnectPeripheral(extensionId);
        await deadline(() => !vm.getPeripheralIsConnected(extensionId), 'the previous connection did not close');
    }
    let listed = false;
    const onList = list => { if (list && list[peripheralId]) listed = true; };
    runtime.on('PERIPHERAL_LIST_UPDATE', onList);
    try {
        vm.scanForPeripheral(extensionId);
        await deadline(() => listed, 'the virtual brick was not discovered');
        vm.connectPeripheral(extensionId, peripheralId);
        await deadline(() => vm.getPeripheralIsConnected(extensionId), 'no connection to the virtual brick');
    } finally {
        runtime.removeListener('PERIPHERAL_LIST_UPDATE', onList);
    }
}
