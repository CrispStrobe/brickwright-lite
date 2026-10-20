// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The ONE virtual SPIKE hub state the SPIKE arena (right pane) and the Robot Lab
// (its own editor tab) share: the app's (render-gui.jsx publishes it as
// window.__brickwrightVirtualSpike.hubState, the one the Bluetooth emulator talks
// to), else one made here once per page. Two surfaces asking separately must get
// the same object, or a program connected through one would drive a hub the other
// never sees.
//
// Which surface drives it is decided by the Robot Lab tab (lib/robot-lab-events.js): while
// the Robot Lab is open the arena stands aside, so there is one physics world.

import VirtualSpikeHubState from './spike-hub-state.js';

let fallback = null;

/** @returns {VirtualSpikeHubState} the page's shared virtual SPIKE hub state */
export const sharedSpikeHubState = () => {
    const app = typeof window !== 'undefined' && window.__brickwrightVirtualSpike && window.__brickwrightVirtualSpike.hubState;
    if (app) return app;
    if (!fallback) fallback = new VirtualSpikeHubState();
    return fallback;
};
