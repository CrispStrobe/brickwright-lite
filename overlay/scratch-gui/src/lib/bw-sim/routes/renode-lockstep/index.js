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
// native owner adds (brickwright-lite#1055); the emulated hub's own `lockstep/v1`
// capability is checked natively at `lockstep.begin` and again by readSnapshot.
//
// One Renode session per app (plan §2.7): the route claims the shared hub's
// `configurationOwner` before it starts the emulator, as the SPIKE arena's
// RenodeArenaSession does, so neither can start while the other owns it; the
// claim is released when the driver ends.
//
// The program (§2.6, §7.4): the pane compiles the VM's blocks with the SPIKE
// arena's firmware-program compiler (compileRouteProgram) and hands the result to
// the route, which uploads it before lockstep.begin and STARTs/STOPs it inside
// lockstep (program.js). The route itself is route.js, over any transport — the
// headless real-Renode proof (scripts/verify-sim-lab-renode-lockstep.mjs) opens it
// with its own state-service transport; this file adds only the desktop's.

import {createNativeRenodeCapabilities} from 'scratch-vm/src/extension-support/native-renode-capability.js';
import {capabilityTransport, lockstepAvailable} from './driver.js';
import {openLockstepRoute, compileRouteProgram} from './route.js';

export {lockstepAvailable, compileRouteProgram};

/**
 * Whether the pane offers the firmware route: the desktop runtime has the lockstep ops,
 * and no session has shown that the packaged Renode runtime lacks `lockstep/v1` (only a
 * running target can say; once one has, the route stays "not available" for this pane).
 */
export const firmwareRouteReady = (capabilities, {unsupported = false} = {}) =>
    !unsupported && lockstepAvailable(capabilities);

/** The desktop app's native Renode capability object, or null outside the desktop app. */
export const desktopRenodeCapabilities = (host = globalThis) => {
    const internals = host && host.__TAURI_INTERNALS__;
    return createNativeRenodeCapabilities({invoke: typeof internals?.invoke === 'function' ? internals.invoke.bind(internals) : null});
};

/**
 * Starts the emulated hub, uploads the program and enters lockstep, over the desktop's
 * native capabilities; see route.js openLockstepRoute for the options and the result.
 * @param {object} options
 * @param {object} options.capabilities the native capability object (desktopRenodeCapabilities())
 */
export const openFirmwareRoute = ({capabilities, ...options}) => {
    const transport = capabilityTransport(capabilities);
    if (!transport) return Promise.reject(new Error('This build has no managed Renode runtime with lockstep.'));
    return openLockstepRoute({transport, ...options});
};
