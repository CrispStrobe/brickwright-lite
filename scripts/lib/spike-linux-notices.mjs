// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// G05 notice gates for the offline Linux package builder. Notice retention only;
// these checks do not establish licence clearance or redistribution validation.
import {createHash} from 'node:crypto';
import {copyFile, lstat, mkdir, readdir, realpath} from 'node:fs/promises';
import {dirname, join, sep} from 'node:path';

// Supplied Renode distribution notices that cover the native files the builder installs.
export const REQUIRED_RUNTIME_NOTICES = Object.freeze({
    'renode-license': 'renode (Renode, MIT)',
    'tlib-license': 'renode translation library (tlib, libqemu-derived, LGPL-2.1)',
    'dotnet-runtime-0-license': '.NET runtime libraries (libcoreclr, libclrjit, libhostfxr, libhostpolicy, libSystem.*, libmscord*)',
    'dotnet-runtime-1-license': '.NET runtime third-party notices',
    'mono-unix-pinned-license': 'libMono.Unix.so',
    'libllvm-disas-license': 'libllvm-disas.so',
    'llvm-license': 'libllvm-disas.so (LLVM, Apache-2.0 WITH LLVM-exception)'
});

export function requireRuntimeNotices (names) {
    const missing = Object.keys(REQUIRED_RUNTIME_NOTICES).filter(name => !names.includes(name));
    if (missing.length) throw new Error(`Runtime notice closure lacks required notices: ${missing.join(', ')}`);
}

export const lockDigest = text => createHash('sha256').update(text).digest('hex');

export function requireInventoryForLock (inventory, lockText) {
    if (inventory?.cargoLockSha256 !== lockDigest(lockText)) {
        throw new Error('Linux crate inventory does not match Cargo.lock; run scripts/gen-spike-linux-crate-inventory.mjs');
    }
}

const LICENCE_FILE = /^(LICEN[CS]E|COPYING|COPYRIGHT|NOTICE|UNLICENSE)([-._][A-Za-z0-9._-]*)?$/i;

/**
 * Copy each linked crate's own top-level licence/notice files into
 * destination/<name>-<version>/. Crates without such files must be exactly the
 * reviewed list; any other gap refuses the package.
 */
export async function collectCrateNotices ({packages, inventory, destination, reviewedAbsent}) {
    const byKey = new Map(packages.map(p => [`${p.name}@${p.version}`, p]));
    const absent = [], copied = [];
    for (const crate of inventory.linked) {
        const key = `${crate.name}@${crate.version}`, pkg = byKey.get(key);
        if (!pkg?.manifest_path) throw new Error(`Linked crate ${key} has no local source`);
        const root = await realpath(dirname(pkg.manifest_path));
        const files = (await readdir(root, {withFileTypes: true}))
            .filter(entry => entry.isFile() && LICENCE_FILE.test(entry.name)).map(entry => entry.name).sort();
        if (!files.length) { absent.push(key); continue; }
        const target = join(destination, `${crate.name}-${crate.version}`);
        await mkdir(target, {recursive: true});
        for (const name of files) {
            const source = join(root, name), info = await lstat(source);
            if (!info.isFile() || info.size === 0 || info.size > 1024 * 1024) throw new Error(`Invalid crate notice ${key}/${name}`);
            if (!(await realpath(source)).startsWith(root + sep)) throw new Error(`Crate notice escaped its source ${key}`);
            await copyFile(source, join(target, name));
            copied.push(`${crate.name}-${crate.version}/${name}`);
        }
    }
    const expected = [...reviewedAbsent].sort(), actual = absent.sort();
    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
        throw new Error(`Crates without licence files differ from the reviewed list: ${actual.filter(k => !expected.includes(k)).concat(expected.filter(k => !actual.includes(k))).join(', ')}`);
    }
    return {copied, absent: actual};
}
