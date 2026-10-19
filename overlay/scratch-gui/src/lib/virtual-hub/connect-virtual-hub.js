// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Connect a program route exclusively to ONE virtual hub (docs/ROBOT-LAB-HUBS-PLAN.md P0):
// the generalisation of connectVirtualSpike for every hub family the Robot Lab offers over
// a radio — SPIKE Prime (its own GATT service), LWP3 hubs (Boost, Powered Up, Technic,
// SPIKE Essential) and the WeDo 2.0 Smart Hub, over Web Bluetooth (web-bluetooth-shim.js)
// or a Scratch Link BLE socket (scratch-link-ble.js).
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
 */
export async function connectVirtualHub ({host = globalThis, extensionId = 'the extension', hubState, connected, disconnect,
    connect, timeoutMs = 5000, wait = ms => new Promise(resolve => setTimeout(resolve, ms))}) {
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
