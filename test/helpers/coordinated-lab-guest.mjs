// SPDX-License-Identifier: BSD-3-Clause
import {createLabConnectionCoordinator} from '../../overlay/scratch-gui/src/lib/bw-sim/transports/lab-connection-coordinator.js';

// These existing headless guests advance one shared fake clock and the actual
// VM/Jolt world explicitly. The production coordinator still selects providers,
// owns cancellation and calls the actual VM greenFlag; no block is replaced.
export const guestCoordinator = (getVM, clock) => createLabConnectionCoordinator({
    getVM, host: globalThis, navigatorHost: globalThis.navigator,
    stopClock: () => {}, stopProgram: vm => vm?.stopAll(), startClock: () => {},
    wait: ms => clock.advance(ms)
});

export const startCoordinatedGuest = async (coordinator, clock) => {
    let done = false;
    let error = null;
    const running = coordinator.run().then(() => { done = true; }, caught => { error = caught; done = true; });
    for (let i = 0; i < 800 && !done; i++) await clock.advance(25);
    if (!done) throw new Error('the coordinated program did not start in 20 seconds of simulated time');
    await running;
    if (error) throw error;
};
