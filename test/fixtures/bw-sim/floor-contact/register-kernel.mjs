// SPDX-License-Identifier: BSD-3-Clause
import {register} from 'node:module';
import {MessageChannel} from 'node:worker_threads';
import {readFileSync} from 'node:fs';
const manifest = JSON.parse(readFileSync(new URL('./manifest.json', import.meta.url)));
const {port1, port2} = new MessageChannel();
globalThis.floorKernelReceipts = [];
port1.on('message', receipt => globalThis.floorKernelReceipts.push(receipt));
port1.unref();
register('./kernel-hook.mjs', import.meta.url, {data: {
    manifest, variant: process.env.BW_FLOOR_KERNEL_VARIANT,
    kernelUrl: new URL('../../../../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js', import.meta.url).href,
    port: port2
}, transferList: [port2]});
