// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The hub families the Robot Lab can run (registry/hubs.js;
// docs/ROBOT-LAB-ARCHITECTURE.md §6.2). One line per family: its module is
// its HubProfile plus its VirtualHub adapter. A hub part's metadata names
// its profile (PartMeta v2 `hubProfile`; v1: `hub.profile`); a part without one
// is SPIKE Prime, the only family before R1. The RCX (hubs/rcx/) runs NQC programs
// in the clean-room bytecode VM (docs/ROBOT-LAB-RCX.md).

import {HubRegistry} from '../registry/hubs.js';
import {spikePrimeHub} from './spike/spike-virtual-hub.js';
import {rcxHub} from './rcx/rcx-virtual-hub.js';
import {labDirectHub} from './lab-direct/lab-direct-hub.js';
import {ev3Hub} from './ev3/ev3-virtual-hub.js';
import {nxtHub} from './nxt/nxt-virtual-hub.js';
// LWP3 hubs (BOOST Move Hub, Powered Up City Hub, Technic Hub, SPIKE Essential; docs/LWP3-VIRTUAL-HUB-NOTES.md).
import {lwp3Hubs} from './lwp3/lwp3-virtual-hub.js';
// The WeDo 2.0 Smart Hub: its own GATT protocol, no motor controller (hubs/wedo2/).
import {wedo2Hub} from './wedo2/wedo2-virtual-hub.js';

/** The profile a hub part without a profile in its metadata is (contracts.js, so the compiler may read it too). */
export {DEFAULT_HUB_PROFILE} from '../contracts.js';

/** The Robot Lab's own hub for a model with no hub part (hubs/lab-direct): no part carries it. */
export {LAB_DIRECT_ID} from './lab-direct/lab-direct-hub.js';

export const hubRegistry = new HubRegistry([
    spikePrimeHub,
    rcxHub,
    labDirectHub,
    // MINDSTORMS EV3 (hubs/ev3/): direct commands over the Scratch Link BT-classic registry.
    ev3Hub,
    // MINDSTORMS NXT (hubs/nxt/): direct-command telegrams over the same registry.
    nxtHub,
    ...lwp3Hubs,
    wedo2Hub
]);
