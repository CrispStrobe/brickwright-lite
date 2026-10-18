// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// How the Robot Lab tab (components/tw-pseudocode/robot-lab-tab.jsx), the Robot Lab
// pane (sim-lab-pane.jsx) and the SPIKE arena (spike-simulator-pane.jsx) agree on who
// drives the shared virtual hub (lib/virtual-hub/shared-spike-hub.js). They load
// lazily and do not import one another; window events carry the hand-over, and this
// module (no imports, so the boot bundle stays as it was) names them.
//
// One session, one physics world: while the Robot Lab holds a session the arena
// stands aside and says so; the arena's "Use the arena here" releases the Lab.

export const ROBOT_LAB_EVENTS = {
    /** The Robot Lab opened or closed its session: detail {active: boolean}. */
    owner: 'bw-robot-lab-owner',
    /** Show the Robot Lab tab (it takes the hub). */
    open: 'bw-open-robot-lab',
    /** The arena wants the hub back: the Robot Lab closes its session. */
    release: 'bw-robot-lab-release'
};

/** Whether a Robot Lab session holds the hub now (its pane publishes window.__bwSimLab). */
export const robotLabActive = () => typeof window !== 'undefined' && Boolean(window.__bwSimLab);
