#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// Hosted packaging-pipeline exercise for scripts/build-spike-linux-desktop.mjs.
//
// The real inputs (the portable Renode runtime with its notice closure, the
// staged MicroPython support profile with its boot seed, and any source-built
// firmware profile) are not published by any public producer at a pinned digest,
// so a hosted runner cannot obtain them. This script stages clearly labelled
// PLACEHOLDER files with the same names and shapes instead. Everything else is
// real: the builder, its notice/inventory gates, the Rust compile of the desktop
// binary from Cargo.lock, crate-notice collection and dpkg-deb. The resulting
// package must never be uploaded, installed outside a throwaway container or
// described as a release. No firmware image is read, fetched or bundled.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir, writeFile, readFile, readdir} from 'node:fs/promises';
import {join, dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {REQUIRED_RUNTIME_NOTICES} from './lib/spike-linux-notices.mjs';

const [workArg] = process.argv.slice(2);
if (!workArg || process.argv.length !== 3) throw new Error('Usage: ci-spike-linux-package-exercise.mjs NEW_WORK_DIRECTORY');
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const work = resolve(workArg);
await mkdir(work); // A fresh directory only; never reuse an earlier exercise.
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const label = name => Buffer.from(`PLACEHOLDER ${name}: hosted packaging exercise only, not a usable component\n`);
// ELF magic only, so the builder's runtime shape check is exercised; it cannot execute.
const elf = name => Buffer.concat([Buffer.from([127, 69, 76, 70]), label(name)]);
const put = async (root, name, bytes) => {
    const file = join(root, name); await mkdir(dirname(file), {recursive: true}); await writeFile(file, bytes);
};

const support = join(work, 'support'), runtime = join(work, 'runtime'), frontend = join(work, 'frontend');
const supportNames = ['models.cs', 'program-uart.cs', 'boot-seed.bin',
    'platforms/boards/spike-prime.repl', 'platforms/boards/spike-prime-brick-devices.repl',
    'platforms/cpus/stm32f413vg.repl', 'platforms/cpus/stm32f4.repl',
    'scripts/spike-state-server.py', 'tools/spike_state_monitor_protocol.py',
    'tools/ev3_state_observer.py', 'tools/spike_arena_inputs.py', 'tools/spike_arena_mailbox.py',
    'tools/spike_nuttx_mailbox.py', 'tools/spike_program_uart.py',
    'licenses/renode-models-MIT.txt', 'licenses/brickwright-BSD-3-Clause.txt'];
const manifest = {};
for (const name of supportNames) {
    // The support verifier requires a 64 KiB seed; zeros, not a firmware-derived image.
    const bytes = name === 'boot-seed.bin' ? Buffer.alloc(65536) : label(name);
    await put(support, name, bytes); manifest[name] = sha(bytes);
}
await writeFile(join(support, 'manifest.json'), JSON.stringify(manifest));

const libraries = ['libMono.Unix.so', 'libSystem.Globalization.Native.so', 'libSystem.IO.Compression.Native.so',
    'libSystem.Native.so', 'libSystem.Net.Security.Native.so', 'libSystem.Security.Cryptography.Native.OpenSsl.so',
    'libclrjit.so', 'libcoreclr.so', 'libcoreclrtraceptprovider.so', 'libhostfxr.so', 'libhostpolicy.so',
    'libllvm-disas.so', 'libmscordaccore.so', 'libmscordbi.so'];
for (const name of ['renode', ...libraries]) await put(runtime, name, elf(name));
await put(runtime, '.renode-root', label('.renode-root'));
await put(runtime, 'scripts/monitor.py', label('scripts/monitor.py'));
for (const name of Object.keys(REQUIRED_RUNTIME_NOTICES)) await put(runtime, `licenses/${name}`, label(name));

await put(frontend, 'index.html', label('index.html'));
await put(frontend, 'capability-broker.html', label('capability-broker.html'));

const output = join(work, 'package-output');
execFileSync(process.execPath, [join(repo, 'scripts/build-spike-linux-desktop.mjs'), support, runtime, frontend, output],
    {cwd: repo, stdio: 'inherit'});

const receipt = JSON.parse(await readFile(join(output, 'package-receipt.json'), 'utf8'));
const debs = (await readdir(output)).filter(name => /^brickwright_[0-9.]+_amd64\.deb$/.test(name));
if (debs.length !== 1) throw new Error('Expected exactly one package');
if (receipt.firmwareBundled !== false || receipt.externallySuppliedFirmwareBundled !== false ||
    receipt.redistributionValidated !== false || !(receipt.crateNoticeFiles > 300)) {
    throw new Error('Unexpected package receipt');
}
// Only names, counts and digests go to the log; never file contents.
console.log(JSON.stringify({package: debs[0], sha256: receipt.sha256, binarySha256: receipt.binarySha256,
    crateNoticeFiles: receipt.crateNoticeFiles, crateLicenceFilesSupplemented: receipt.crateLicenceFilesSupplemented,
    inputs: 'placeholder runtime, support and frontend'}));
