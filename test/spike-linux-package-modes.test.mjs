// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, chmod, lstat, symlink, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {normalizePackageModes, requireStagingModes} from '../scripts/lib/spike-linux-package-modes.mjs';

const files = {
    'usr/bin/brickwright-tauri': 'synthetic app permission control',
    'usr/lib/Brickwright/renode/renode': 'synthetic runtime permission control',
    'usr/lib/Brickwright/nuttx/state-config.json': '{"synthetic":true}\n',
    'usr/lib/Brickwright/nuttx/nuttx-user.elf': 'synthetic resource permission control',
    'usr/lib/Brickwright/tools/input-script.py': 'synthetic non-executable resource',
    'DEBIAN/control': 'Package: permission-control\nVersion: 1.0\nArchitecture: all\nMaintainer: Test\nDescription: Synthetic permission control\n'
};
const permissions = async file => (await lstat(file)).mode & 0o7777;
async function fixture () {
    const root = await mkdtemp(join(tmpdir(), 'bw-package-mode-'));
    for (const [name, bytes] of Object.entries(files)) {
        const file = join(root, name);await mkdir(dirname(file), {recursive: true});await writeFile(file, bytes);
        await chmod(file, 0o600);
    }
    await chmod(join(root, 'DEBIAN'), 0o700);
    return root;
}
test('root-owned package resources stay readable without changing any bytes; only native executables are executable', {skip: process.platform !== 'linux'}, async () => {
    const root = await fixture();
    try {
        await chmod(join(root, 'usr/lib/Brickwright/tools/input-script.py'), 0o755);
        await chmod(join(root, 'usr/bin/brickwright-tauri'), 0o4755);
        await chmod(join(root, 'usr/lib/Brickwright/nuttx/state-config.json'), 0o2644);
        await normalizePackageModes(root, 'Brickwright');
        for (const [name, bytes] of Object.entries(files)) {
            assert.equal(await readFile(join(root, name), 'utf8'), bytes);
            const executable = ['usr/bin/brickwright-tauri', 'usr/lib/Brickwright/renode/renode'].includes(name);
            assert.equal(await permissions(join(root, name)), executable ? 0o755 : 0o644, name);
        }
        for (const name of ['', 'DEBIAN', 'usr/lib/Brickwright/nuttx']) assert.equal(await permissions(join(root, name)), 0o755);
        const deb = join(root, '..', root.split('/').at(-1) + '.deb');
        try {
            execFileSync('dpkg-deb', ['--build', '--root-owner-group', '--threads-max=2', root, deb], {stdio: 'pipe'});
            const archive = execFileSync('dpkg-deb', ['--contents', deb], {encoding: 'utf8'});
            assert.match(archive, /-rw-r--r-- root\/root\s+\d+ .*\.\/usr\/lib\/Brickwright\/nuttx\/state-config\.json/);
            assert.match(archive, /-rwxr-xr-x root\/root\s+\d+ .*\.\/usr\/bin\/brickwright-tauri/);
        } finally {await rm(deb, {force: true});}
    } finally {await rm(root, {recursive: true, force: true});}
});
test('package symlinks are rejected without changing their outside target', {skip: process.platform !== 'linux'}, async () => {
    const root = await fixture();const target = join(root, '..', root.split('/').at(-1) + '-outside');
    try {
        await writeFile(target, 'outside');await chmod(target, 0o600);
        await symlink(target, join(root, 'link'));
        await assert.rejects(normalizePackageModes(root, 'Brickwright'), /only regular files/);
        assert.equal(await readFile(target, 'utf8'), 'outside');assert.equal(await permissions(target), 0o600);
    } finally {await rm(root, {recursive: true, force: true});await rm(target, {force: true});}
});
test('special files and missing native executables cannot produce a qualified package', {skip: process.platform !== 'linux'}, async () => {
    const root = await fixture();
    try {
        execFileSync('mkfifo', [join(root, 'fifo')]);
        await assert.rejects(normalizePackageModes(root, 'Brickwright'), /only regular files/);
        await rm(join(root, 'fifo'));await rm(join(root, 'usr/bin/brickwright-tauri'));
        await assert.rejects(normalizePackageModes(root, 'Brickwright'), /native executable is missing/);
    } finally {await rm(root, {recursive: true, force: true});}
});
test('owned output is private and linked staging paths are refused', {skip: process.platform !== 'linux'}, async () => {
    const root = await mkdtemp(join(tmpdir(), 'bw-staging-mode-'));
    try {
        await chmod(root, 0o777);await requireStagingModes(root);assert.equal(await permissions(root), 0o700);
        await symlink(root, join(root, 'link'));
        await assert.rejects(requireStagingModes(join(root, 'link')), /Invalid package staging directory/);
        await assert.rejects(normalizePackageModes(root, '../escape'), /Invalid Linux resource directory name/);
        const file = join(root, 'ordinary-file');await writeFile(file, 'unchanged');await chmod(file, 0o600);
        await assert.rejects(normalizePackageModes(file, 'Brickwright'), /Invalid package root/);
        assert.equal(await permissions(file), 0o600);
    } finally {await rm(root, {recursive: true, force: true});}
});
