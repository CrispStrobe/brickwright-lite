// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/** Connect a simulator route exclusively to its shared virtual hub.
 * The chooser's virtualOnly flag instructs the Bluetooth shim to fail closed.
 * Disconnecting first also prevents reuse of a physical peripheral session.
 */
export async function connectVirtualSpike ({host = globalThis, hubState, connected, disconnect, connect,
    timeoutMs = 5000}) {
    if (!hubState) throw new Error('The shared virtual SPIKE hub is unavailable.');
    const previous = host.__brickwrightChooseVirtualBluetooth;
    let selected = false;
    const chooser = candidates => {
        const candidate = candidates.find(item => item.hubState === hubState);
        if (!candidate) throw new Error('The shared virtual SPIKE device is unavailable.');
        selected = true;
        return candidate;
    };
    chooser.virtualOnly = true;
    host.__brickwrightChooseVirtualBluetooth = chooser;
    try {
        if (connected()) {
            await disconnect();
            if (connected()) throw new Error('Could not disconnect the previous SPIKE connection.');
        }
        await connect();
        const started = Date.now();
        while (!connected() && Date.now() - started < timeoutMs) {
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        if (!selected || !connected()) throw new Error('No connection to the shared virtual SPIKE hub.');
    } finally {
        host.__brickwrightChooseVirtualBluetooth = previous;
    }
}
