// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {chmod, lstat, readdir} from 'node:fs/promises';
import {join, relative, sep} from 'node:path';

// The caller creates this owned directory exclusively. Refuse mounts that
// report fixed modes before investing in native compilation or resource copies.
export async function requireStagingModes (directory) {
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Invalid package staging directory');
    await chmod(directory, 0o700);
    if (((await lstat(directory)).mode & 0o7777) !== 0o700) {
        throw new Error('Package staging filesystem cannot preserve Unix permissions; use a POSIX staging directory');
    }
}

// Data must remain readable after dpkg assigns root ownership. Only the two
// declared native executables need execute permission; input modes and umask
// must not decide how the installed app can read its sealed resources.
export async function normalizePackageModes (root, resourceName) {
    if (typeof resourceName !== 'string' || !/^[A-Za-z0-9_-]+$/.test(resourceName)) {
        throw new Error('Invalid Linux resource directory name');
    }
    const rootInfo = await lstat(root);
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new Error('Invalid package root');
    const executablePaths = new Set(['usr/bin/brickwright-tauri', `usr/lib/${resourceName}/renode/renode`]);
    const foundExecutables = new Set();
    const visit = async file => {
        const info = await lstat(file);
        if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile())) {
            throw new Error('Package permissions require only regular files and directories');
        }
        const name = relative(root, file).split(sep).join('/');
        const executable = info.isFile() && executablePaths.has(name);
        const mode = info.isDirectory() || executable ? 0o755 : 0o644;
        await chmod(file, mode);
        if (((await lstat(file)).mode & 0o7777) !== mode) {
            throw new Error('Package staging filesystem cannot preserve Unix permissions; use a POSIX staging directory');
        }
        if (executable) foundExecutables.add(name);
        if (info.isDirectory()) for (const entry of await readdir(file)) await visit(join(file, entry));
    };
    await visit(root);
    if (foundExecutables.size !== executablePaths.size) throw new Error('Package native executable is missing');
}
