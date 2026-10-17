// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The Robot Lab's "SPIKE firmware (desktop)" route, as the pane opens it
// (docs/ROBOT-LAB-SPIKE-EMULATION.md §2.4, §3): the desktop app's native
// Renode capabilities → a lockstep driver (driver.js) → one
// SpikeFirmwareVirtualHub for the model's hub → SimSession's createHub. The
// scene then runs in-thread, one physics step per lockstep exchange
// (runner.js). Desktop only: the web build has no managed Renode runtime, and
// the gate is the lockstep ops themselves (lockstepAvailable), which the
// native owner adds (brickwright-lite#1055) — until then the pane offers the
// route disabled.

import {createNativeRenodeCapabilities} from 'scratch-vm/src/extension-support/native-renode-capability.js';
import {RenodeLockstepDriver, capabilityTransport, lockstepAvailable} from './driver.js';
import {SpikeFirmwareVirtualHub} from '../../hubs/spike/spike-firmware-hub.js';

export {lockstepAvailable};

/** The desktop app's native Renode capability object, or null outside the desktop app. */
export const desktopRenodeCapabilities = (host = globalThis) => {
    const internals = host && host.__TAURI_INTERNALS__;
    return createNativeRenodeCapabilities({invoke: typeof internals?.invoke === 'function' ? internals.invoke.bind(internals) : null});
};

/**
 * Starts the emulated hub and enters lockstep; resolves to {driver, createHub} for
 * SimSession.fromText. The firmware route runs a model's (first) hub; a second hub
 * waits for the multi-hub slice (R16).
 * @param {object} options
 * @param {object} options.capabilities the native capability object (desktopRenodeCapabilities())
 * @param {object} [options.hubState] the pane's VirtualSpikeHubState, to show the hub
 * @param {'nuttx'|'micropython'} [options.backend]
 * @param {'default'|'six-motors'|'dual-ultrasonic'} [options.topology]
 */
export const openFirmwareRoute = async ({capabilities, hubState = null, backend = 'nuttx', topology = 'default'}) => {
    const transport = capabilityTransport(capabilities);
    if (!transport) throw new Error('This build has no managed Renode runtime with lockstep.');
    const driver = new RenodeLockstepDriver({transport, backend, topology});
    try {
        await driver.begin();
    } catch (error) {
        await driver.end().catch(() => {});
        throw error;
    }
    const createHub = def => {
        if (def.index > 0) throw new Error('The SPIKE firmware route runs a model with one hub.');
        return new SpikeFirmwareVirtualHub({id: def.id, driver, hubState});
    };
    return {driver, createHub};
};
