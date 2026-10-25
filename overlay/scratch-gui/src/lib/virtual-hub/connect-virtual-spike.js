// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/** Connect a simulator route exclusively to its shared virtual SPIKE hub.
 * The chooser's virtualOnly flag instructs the Bluetooth shim to fail closed.
 * Disconnecting first also prevents reuse of a physical peripheral session.
 * The general form, for every hub family, is connectVirtualHub (connect-virtual-hub.js).
 */
import {connectVirtualHub} from './connect-virtual-hub.js';

export async function connectVirtualSpike ({host = globalThis, hubState, connected, disconnect, connect,
    timeoutMs = 5000}) {
    if (!hubState) throw new Error('The shared virtual SPIKE hub is unavailable.');
    try {
        await connectVirtualHub({host, extensionId: 'SPIKE', hubState, connected, disconnect, connect, timeoutMs});
    } catch (error) {
        // The messages the SPIKE routes have always shown.
        if (/not among the offered/.test(error.message)) throw new Error('The shared virtual SPIKE device is unavailable.');
        if (/Could not disconnect/.test(error.message)) throw new Error('Could not disconnect the previous SPIKE connection.');
        if (/No connection from/.test(error.message)) throw new Error('No connection to the shared virtual SPIKE hub.');
        throw error;
    }
}
