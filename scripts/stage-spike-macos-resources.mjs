#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// Stage the SPIKE runtime for the macOS app bundle as Tauri resources:
//   resources/renode/  multi-file Renode layout from renode-spike-prime's
//                      macos-spike-renode.yml (host `renode`, tlib/, licenses/)
//   resources/nuttx/   own source-built NuttX profile, frozen by
//                      scripts/lib/spike-resource-profile.mjs
// Writes tauri-config.json (bundle.resources only) and compile-pins.json (the
// BW_RENODE_* compile-time pins the supervisor verifies). Refuses layouts that are
// single-file, lack the shipped tlib or the .NET notices, or still carry
// Packet.Net / ensurepip. Never fetches anything. Inventory, not clearance.
import {createHash} from 'node:crypto';
import {cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {freezeResourceProfile} from './lib/spike-resource-profile.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const exists = async path => { try { await lstat(path); return true; } catch { return false; } };

export const REQUIRED_LAYOUT = ['renode', '.renode-root', 'Renode.dll', 'Infrastructure.dll', 'libcoreclr.dylib',
    'tlib/translate-arm-m-le.so', 'licenses/renode-license', 'licenses/tlib-license',
    'licenses/dotnet-runtime-0-license', 'licenses/dotnet-runtime-1-license'];
export const FORBIDDEN_LAYOUT = ['PacketDotNet.dll', 'Lib/ensurepip'];

/** Validate a SPIKE Renode layout directory; returns the problems found (empty when valid). */
export async function checkRenodeLayout (layout) {
    const problems = [];
    for (const name of REQUIRED_LAYOUT) if (!await exists(join(layout, name))) problems.push(`missing ${name}`);
    for (const name of FORBIDDEN_LAYOUT) if (await exists(join(layout, name))) problems.push(`unexpected ${name}`);
    if (await exists(join(layout, 'renode'))) {
        const host = await readFile(join(layout, 'renode'));
        // A single-file .NET bundle carries its managed payload inside the host.
        if (host.length > 4 * 1024 * 1024) problems.push('renode host looks like a single-file bundle');
        const magic = host.readUInt32LE(0);
        if (![0xfeedfacf, 0xcafebabe, 0xbebafeca].includes(magic)) problems.push('renode host is not Mach-O');
    }
    return problems;
}

/**
 * The package producer writes absolute monitor paths of the machine that staged it
 * (a Linux runner). Relocate a copy to this machine: replace exactly that producer
 * root in nuttx.resc and update only that file's manifest digest. Returns the copy
 * and both digests; the frozen profile then rewrites the scenario to its portable form.
 */
export async function relocateNuttxPackage (source) {
    const scenario = (await readFile(join(source, 'nuttx.resc'), 'utf8'));
    const match = /^machine LoadPlatformDescription @(\/[^\n]*)\/platforms\/boards\/spike-prime\.repl$/m.exec(scenario);
    if (!match) throw new Error('Package scenario has no absolute producer root');
    const copy = join(await mkdtemp(join(tmpdir(), 'bw-spike-nuttx-')), 'package');
    await cp(source, copy, {recursive: true});
    const local = await realpath(copy);
    const relocated = scenario.split(match[1] + '/').join(local + '/');
    await writeFile(join(copy, 'nuttx.resc'), relocated);
    const manifest = JSON.parse(await readFile(join(copy, 'manifest.json'), 'utf8'));
    const before = manifest['nuttx.resc'];
    if (before !== sha(Buffer.from(scenario))) throw new Error('Package scenario digest mismatch before relocation');
    manifest['nuttx.resc'] = sha(Buffer.from(relocated));
    await writeFile(join(copy, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    return {copy: local, producerRoot: match[1], scenarioSha256: {producer: before, relocated: manifest['nuttx.resc']}};
}

export async function stage (layoutArg, nuttxArg, outputArg) {
    const layout = await realpath(layoutArg), nuttx = await realpath(nuttxArg), output = resolve(outputArg);
    const problems = await checkRenodeLayout(layout);
    if (problems.length) throw new Error(`Invalid SPIKE Renode layout: ${problems.join(', ')}`);
    if (await exists(output)) throw new Error('Output directory must not exist');
    const resources = join(output, 'resources');
    await mkdir(resources, {recursive: true});
    await cp(layout, join(resources, 'renode'), {recursive: true, preserveTimestamps: true, verbatimSymlinks: true});
    const relocated = await relocateNuttxPackage(nuttx);
    const frozen = await freezeResourceProfile('nuttx', relocated.copy, join(resources, 'nuttx'), resources);
    const host = await readFile(join(resources, 'renode', 'renode'));
    const pins = {BW_RENODE_RESOURCE_EXECUTABLE: 'renode/renode', BW_RENODE_SHA256: sha(host), ...frozen.pins};
    const config = {bundle: {resources: {[`${join(resources, 'renode')}/`]: 'renode/', ...frozen.resources}}};
    const files = (await readdir(join(resources, 'renode'), {recursive: true})).length;
    await writeFile(join(output, 'tauri-config.json'), JSON.stringify(config, null, 2) + '\n');
    await writeFile(join(output, 'compile-pins.json'), JSON.stringify(pins, null, 2) + '\n');
    await writeFile(join(output, 'stage-receipt.json'), JSON.stringify({schemaVersion: 1, scope: 'macos-spike-staging',
        redistributionValidated: false, renodeHostSha256: pins.BW_RENODE_SHA256, renodeEntries: files,
        nuttxSourceManifestSha256: frozen.sourceManifestSha256, nuttxRelocation: relocated}, null, 2) + '\n');
    return {pins, config};
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const args = process.argv.slice(2);
    if (args.length !== 3) { console.error('usage: stage-spike-macos-resources.mjs RENODE_LAYOUT NUTTX_PACKAGE NEW_OUTPUT_DIR'); process.exit(2); }
    const {pins} = await stage(...args);
    console.log(JSON.stringify(pins, null, 2));
}
