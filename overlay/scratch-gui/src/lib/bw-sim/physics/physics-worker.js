// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Web Worker entry for the physics simulation. Thin wrapper around
// physics-host.js: forwards incoming messages to the host and posts
// replies via self.postMessage. Started by physics-client.js's
// startPhysicsWorker() (its own chunk, bw-sim-physics-worker); the Sim Lab
// session drives it through PhysicsClient (sim-session.js).

import { createPhysicsHost } from './physics-host.js';
import { loadJolt, createPhysicsCore } from './jolt-core.js';
import { createSimRunner } from './sim-worker-protocol.js';

const host = createPhysicsHost({
    loadJolt,
    createPhysicsCore,
    createSimRunner,
    post: (m, t) => self.postMessage(m, t),
});

self.onmessage = e => host.handle(e.data);
