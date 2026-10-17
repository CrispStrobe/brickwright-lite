// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The hub families the Robot Lab can run (registry/hubs.js;
// docs/ROBOT-LAB-ARCHITECTURE.md §6.2). One line per family: its module is
// its HubProfile plus its VirtualHub adapter. A hub part's metadata names
// its profile (PartMeta v2 `hubProfile`; v1: `hub.profile`); a part without one
// is SPIKE Prime, the only family before R1.

import {HubRegistry} from '../registry/hubs.js';
import {spikePrimeHub} from './spike/spike-virtual-hub.js';

/** The profile a hub part without a profile in its metadata is (contracts.js, so the compiler may read it too). */
export {DEFAULT_HUB_PROFILE} from '../contracts.js';

export const hubRegistry = new HubRegistry([
    spikePrimeHub
]);
