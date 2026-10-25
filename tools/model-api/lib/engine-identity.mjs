// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Identity of the physics engine package the worker actually has installed: its own package.json
// version, the lockfile entry it was installed from, and the SHA-256 of the entry module that
// jolt-core selects (SIMD or baseline). An unreadable install is reported unavailable, never guessed.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function engineAssetIdentity({root, simd}) {
    const entry = simd ? 'wasm-simd-compat' : 'wasm-compat';
    try {
        const dir = new URL('packages/scratch-gui/node_modules/jolt-physics/', root);
        const pkg = JSON.parse(readFileSync(new URL('package.json', dir), 'utf8'));
        const lock = JSON.parse(readFileSync(new URL('packages/scratch-gui/package-lock.json', root), 'utf8')).packages?.['node_modules/jolt-physics'] ?? {};
        const target = pkg.exports?.['./' + entry]?.default;
        if (typeof pkg.version !== 'string' || typeof target !== 'string' || !target.startsWith('./') || target.includes('..')) throw Error('unrecognised package');
        return {available: true, package: 'jolt-physics', version: pkg.version, entry, entrySha256: sha256(readFileSync(new URL(target, dir))),
            lockVersion: typeof lock.version === 'string' ? lock.version : null, lockResolved: typeof lock.resolved === 'string' ? lock.resolved : null,
            lockIntegrity: typeof lock.integrity === 'string' ? lock.integrity : null, versionMatchesLock: lock.version === pkg.version};
    } catch {
        return {available: false, package: 'jolt-physics', entry, reason: 'engine-package-unreadable'};
    }
}
