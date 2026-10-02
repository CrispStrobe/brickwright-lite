// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
/** Curated source policy is a package input, never a client capability claim. */
export async function firmwareMotorPorts (root, read = readFile) {
    let bytes;
    try { bytes = await read(join(root, 'policy/simulation-firmware-inputs.json')); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    const policy = JSON.parse(bytes.toString());
    if (policy.schema !== 1) throw new Error('Unsupported motor-port source policy');
    if (!Object.hasOwn(policy, 'capabilities')) return null;
    const capabilities = policy.capabilities;
    if (!capabilities || Array.isArray(capabilities) || typeof capabilities !== 'object') throw new Error('Invalid firmware capabilities');
    if (!Object.hasOwn(capabilities, 'motorPorts')) return null;
    if (capabilities.motorPorts !== 6) throw new Error('Unsupported firmware motor-port declaration');
    return 6;
}
