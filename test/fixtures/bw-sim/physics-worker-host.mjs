// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors

// Tiny worker for the physics-host determinism test (Node worker_threads).
// Wires the pure host to parentPort, as bw-sim/physics-worker.js wires it to self
// (with the Sim Lab runner: test/bw-sim-physics-worker-session.test.mjs).

import { parentPort } from 'node:worker_threads';
import { createPhysicsHost } from '../../../overlay/scratch-gui/src/lib/bw-sim/physics/physics-host.js';
import { loadJolt, createPhysicsCore } from '../../../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';
import { createSimRunner } from '../../../overlay/scratch-gui/src/lib/bw-sim/sim-worker-protocol.js';

const host = createPhysicsHost({
    loadJolt,
    createPhysicsCore,
    createSimRunner,
    post: (msg, transfer) => parentPort.postMessage(msg, transfer),
});

parentPort.on('message', msg => host.handle(msg));
