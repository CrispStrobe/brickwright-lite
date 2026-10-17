// SPDX-License-Identifier: BSD-3-Clause
// Adapt Node's message transport to the unchanged browser physics worker.
import {parentPort} from 'node:worker_threads';
if (!parentPort) throw new Error('The physics adapter must run inside a worker');
globalThis.self = {postMessage: (message, transfer) => parentPort.postMessage(message, transfer)};
await import('../../packages/scratch-gui/src/lib/bw-sim/physics/physics-worker.js');
parentPort.on('message', data => self.onmessage({data}));
