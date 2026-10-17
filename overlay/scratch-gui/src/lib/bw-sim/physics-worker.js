// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Web Worker entry for the physics simulation. Thin wrapper around
// physics/physics-host.js: forwards incoming messages to the host and posts
// replies via self.postMessage. Started by sim-lab.js's startPhysicsWorker()
// (its own chunk, bw-sim-physics-worker); the Sim Lab session drives it
// through PhysicsClient (sim-session.js).
//
// It lives beside sim-worker-protocol.js and not under physics/ because it is
// where the hub families (hubs/index.js, through the Sim Lab runner) and the
// physics are put together: physics/ itself imports no hub or route module
// (docs/ROBOT-LAB-ARCHITECTURE.md §3.6, test/bw-sim-hub-boundary.test.mjs).

import { createPhysicsHost } from './physics/physics-host.js';
import { loadJolt, createPhysicsCore } from './physics/jolt-core.js';
import { createSimRunner } from './sim-worker-protocol.js';

const host = createPhysicsHost({
    loadJolt,
    createPhysicsCore,
    createSimRunner,
    post: (m, t) => self.postMessage(m, t),
});

self.onmessage = e => host.handle(e.data);
