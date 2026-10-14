// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const REQUIRED = Object.freeze([
    ['licenses/Apache-2.0.txt', 'licenses/Apache-2.0.txt'],
    ['licenses/NuttX-NOTICE.txt', 'licenses/firmware-NuttX-NOTICE.txt'],
    ['licenses/NuttX-Apps-NOTICE.txt', 'licenses/NuttX-Apps-NOTICE.txt'],
    ['licenses/Brickwright-BSD-3-Clause.txt', 'licenses/firmware-Brickwright-BSD-3-Clause.txt'],
    ['licenses/NuttX-Tickless-BSD-3-Clause.txt', 'licenses/NuttX-Tickless-BSD-3-Clause.txt']
]);
const BUNDLE = 'licenses/Simulation-Firmware-NOTICES.txt';
/** Closed notice selection; private source policy is validated, never packaged. */
export async function firmwareExtraNotices (root, read = readFile) {
    const optional = async path => {
        try { return await read(join(root, path)); }
        catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    };
    const policyBytes = await optional('policy/nuttx-backports.json');
    const bundle = await optional(BUNDLE);
    if (policyBytes === null) {
        for (const path of ['patches/nuttx-hardening/nuttx.patch', 'patches/nuttx-hardening/nuttx-apps.patch', 'tools/apply_nuttx_backports.py']) {
            if (await optional(path) !== null) throw new Error('Backport dependency requires its notice policy');
        }
        const timer = await optional('nuttx/arch/arm/src/stm32/stm32_tickless.c');
        if (timer?.includes(Buffer.from('policy/nuttx-backports.json'))) throw new Error('Backported timer requires its notice policy');
        if (bundle !== null && !bundle.toString().trim()) throw new Error('Empty simulation firmware notice bundle');
        return bundle === null ? [] : [[BUNDLE, BUNDLE]];
    }
    const policy = JSON.parse(policyBytes.toString());
    const notices = policy.required_notices;
    if (policy.schema !== 1 || !notices || Array.isArray(notices) ||
        Object.keys(notices).length !== REQUIRED.length || !REQUIRED.every(([path]) => Object.hasOwn(notices, path))) {
        throw new Error('Unsupported firmware backport notice policy');
    }
    for (const [path] of REQUIRED) {
        const content = await optional(path), digest = notices[path];
        if (!content || !content.toString().trim() || typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest) ||
            createHash('sha256').update(content).digest('hex') !== digest) throw new Error(`Missing or changed required backport notice: ${path}`);
    }
    if (!bundle || !bundle.toString().trim()) throw new Error('Backported firmware requires complete simulation notices');
    return [...REQUIRED, [BUNDLE, BUNDLE]];
}
