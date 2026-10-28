#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// Offline profile assembly from retained support and immutable public sources.
// This does not build a runtime, inspect an application, or certify binary origin.
import {resolve, join, dirname, sep} from 'node:path';
import {mkdir, readFile, writeFile, realpath, stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const [supportArg, repoArg, platformCommit, modelCommit, runtimeArg, outputArg] = process.argv.slice(2);
if (process.argv.length !== 8 || !/^[0-9a-f]{40}$/.test(platformCommit) ||
    !/^[0-9a-f]{40}$/.test(modelCommit)) {
    throw new Error('Usage: prepare-spike-compiled-micropython-support.mjs LEGACY_SUPPORT RUNTIME_REPOSITORY PLATFORM_COMMIT MODEL_CONTRACT_COMMIT RENODE_EXECUTABLE NEW_OUTPUT_DIRECTORY');
}
const support = await realpath(resolve(supportArg)), repo = await realpath(resolve(repoArg));
const runtime = await realpath(resolve(runtimeArg)), output = resolve(outputArg);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const names = ['models.cs', 'program-uart.cs', 'boot-seed.bin',
    'platforms/boards/spike-prime.repl', 'platforms/boards/spike-prime-brick-devices.repl',
    'platforms/cpus/stm32f413vg.repl', 'platforms/cpus/stm32f4.repl',
    'scripts/spike-state-server.py', 'tools/spike_state_monitor_protocol.py',
    'tools/ev3_state_observer.py', 'tools/spike_arena_inputs.py', 'tools/spike_arena_mailbox.py',
    'tools/spike_nuttx_mailbox.py', 'tools/spike_program_uart.py',
    'licenses/renode-models-MIT.txt', 'licenses/brickwright-BSD-3-Clause.txt'];
async function bounded(file, limit) {
    const meta = await stat(file);
    if (!meta.isFile() || meta.size > limit) throw new Error('Input is not a bounded regular file');
    return readFile(file);
}
const manifest = JSON.parse(await bounded(join(support, 'manifest.json'), 65536));
if (!manifest || Array.isArray(manifest) || Object.keys(manifest).length !== names.length ||
    names.some(name => !Object.hasOwn(manifest, name) || !/^[0-9a-f]{64}$/.test(manifest[name]))) {
    throw new Error('Expected the closed legacy support profile');
}
const files = new Map();
for (const name of names) {
    const file = await realpath(join(support, name));
    if (!file.startsWith(support + sep)) throw new Error('Support file escapes its root');
    const bytes = await bounded(file, 16 * 1024 * 1024);
    if (digest(bytes) !== manifest[name] || (name === 'boot-seed.bin' && bytes.length !== 65536)) {
        throw new Error('Support artifact failed verification');
    }
    files.set(name, bytes);
}
// No fetch or checkout: read the exact public commit, independent of dirty
// working files. Missing objects fail without lazy network acquisition.
function blob(name) {
    return execFileSync('git', ['-c', 'protocol.allow=never', '-C', repo, 'show', `${platformCommit}:${name}`],
        {maxBuffer: 2 * 1024 * 1024, env: {...process.env, GIT_NO_LAZY_FETCH: '1'}});
}
const stager = blob('tools/stage_prime_micropython.py').toString('utf8');
if (!stager.includes(`INFRASTRUCTURE_COMMIT = "${modelCommit}"`)) {
    throw new Error('Platform source and model contract disagree');
}
for (const name of names.filter(name => name.startsWith('platforms/'))) files.set(name, blob(name));
const clockName = 'platforms/cpus/stm32f413vg.repl';
let clock = files.get(clockName).toString('utf8');
if ([...clock.matchAll(/^    systickFrequency: [0-9]+$/gm)].length !== 1 ||
    clock.split('PerformanceInMips: 96').length !== 2 || !clock.includes('frequency: 96000000')) {
    throw new Error('Unexpected Prime clock profile');
}
clock = clock.replace(/^    systickFrequency: [0-9]+$/m, '    systickFrequency: 100000000')
    .replace('PerformanceInMips: 96', 'PerformanceInMips: 100')
    .replaceAll('frequency: 96000000', 'frequency: 100000000');
files.set(clockName, Buffer.from(clock));
const boardName = 'platforms/boards/spike-prime.repl';
const board = files.get(boardName).toString('utf8');
if (board.split('spi2:\n').length !== 2) throw new Error('Unexpected Prime storage profile');
files.set(boardName, Buffer.from(board.replace('spi2:\n', 'spi2:\n    frequency: 50000000\n    bufferCapacity: 1\n')));
const runtimeSha256 = digest(await bounded(runtime, 512 * 1024 * 1024));
const profile = {schemaVersion: 1, kind: 'compiled-prime-models/v1', runtimeSha256,
    platformSourceCommit: platformCommit, modelContractCommit: modelCommit};
files.set('profile.json', Buffer.from(JSON.stringify(profile, null, 2) + '\n'));
// Validate everything before creating the destination; preserve existing output.
await mkdir(output, {mode: 0o700});
const frozen = {};
for (const [name, bytes] of files) {
    const file = join(output, name);
    await mkdir(dirname(file), {recursive: true});
    await writeFile(file, bytes);
    frozen[name] = digest(bytes);
}
await writeFile(join(output, 'manifest.json'), JSON.stringify(frozen, null, 2) + '\n');
console.log('Compiled-model support assembled; application selection and qualification are separate.');
