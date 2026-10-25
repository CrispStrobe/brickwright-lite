// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Connect a program route exclusively to ONE virtual hub (docs/ROBOT-LAB-HUBS-PLAN.md P0):
// the generalisation of connectVirtualSpike for every hub family the Robot Lab offers over
// a radio — SPIKE Prime (its own GATT service), LWP3 hubs (Boost, Powered Up, Technic,
// SPIKE Essential) and the WeDo 2.0 Smart Hub, over Web Bluetooth (web-bluetooth-shim.js)
// or a Scratch Link BLE socket (scratch-link-ble.js) — and, given a `peripheralId` and the `vm`, the
// MINDSTORMS bricks over Scratch Link Bluetooth Classic (bt-classic-registry.js; docs/ROBOT-LAB-EV3-NXT.md):
//
//   a peripheral extension (registered with the runtime: the stock `ev3`, `legonxt`) is scanned and
//     connected as the GUI's connection dialog would — scan, wait for the virtual brick in the
//     peripheral list, connect to it by id;
//   ev3comprehensive keeps its own connection (a mode and a connect block): its own blocks set it to
//     Scratch Link and connect it, and it finds the brick by its name ("…EV3…").
// Either way the extension's own code dials Scratch Link; nothing of it is replaced.
//
// While `connect()` runs, a virtualOnly chooser is installed: every requestDevice / Scratch
// Link connect the extension makes is offered the registered virtual peripherals, and the
// chooser takes the one whose `hubState` is the hub asked for — never a real device, never
// another virtual hub. Disconnecting first also prevents reuse of a peripheral session the
// extension held before (a real hub, or a hub of the previous scene).

/**
 * @param {object} options
 * @param {object} [options.host] the window (globalThis)
 * @param {string} [options.extensionId] for messages ('legopoweredup', 'wedo2unified', …)
 * @param {object} options.hubState the protocol state the wanted peripheral carries as `hubState`
 * @param {() => boolean} options.connected whether the extension reports a connection
 * @param {() => Promise|void} options.disconnect
 * @param {() => Promise|void} options.connect starts the extension's own connection
 * @param {number} [options.timeoutMs]
 * @param {Function} [options.wait] (ms) => Promise: how to wait between polls (default: the host's setTimeout)
 * @param {object} [options.vm] BT classic: the Scratch VM
 * @param {string} [options.peripheralId] BT classic: the virtual brick's id in the registry (then hubState,
 *        connected, disconnect and connect are not used: the extension's own scan/connect is)
 */
export async function connectVirtualHub ({host = globalThis, extensionId = 'the extension', hubState, connected, disconnect,
    connect, timeoutMs = 5000, wait = ms => new Promise(resolve => setTimeout(resolve, ms)), vm = null, peripheralId = null}) {
    if (peripheralId) {
        await connectVirtualBtClassic({vm, extensionId, peripheralId, timeoutMs, wait});
        return;
    }
    if (!hubState) throw new Error(`The virtual hub for ${extensionId} is unavailable.`);
    const previous = host.__brickwrightChooseVirtualBluetooth;
    let selected = false;
    const chooser = candidates => {
        const candidate = candidates.find(item => item.hubState === hubState);
        if (!candidate) throw new Error(`The virtual hub for ${extensionId} is not among the offered devices.`);
        selected = true;
        return candidate;
    };
    chooser.virtualOnly = true;
    host.__brickwrightChooseVirtualBluetooth = chooser;
    try {
        if (connected()) {
            await disconnect();
            if (connected()) throw new Error(`Could not disconnect the previous ${extensionId} connection.`);
        }
        await connect();
        const started = Date.now();
        while (!connected() && Date.now() - started < timeoutMs) await wait(50);
        if (!selected || !connected()) throw new Error(`No connection from ${extensionId} to its virtual hub.`);
    } finally {
        host.__brickwrightChooseVirtualBluetooth = previous;
    }
}

// ---- BT classic (the EV3, the NXT) ------------------------------------------------------------

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * @param {object} options
 * @param {object} options.vm the Scratch VM
 * @param {string} options.extensionId 'ev3' | 'legonxt' | 'ev3comprehensive'
 * @param {string} options.peripheralId the virtual brick's id in the registry
 * @param {number} [options.timeoutMs]
 * @param {(ms: number) => Promise} [options.wait] how to wait (tests pass their clock's)
 */
async function connectVirtualBtClassic ({vm, extensionId, peripheralId, timeoutMs = 5000, wait = sleep}) {
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
