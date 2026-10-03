#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// Freeze an already staged support profile. Never fetch or copy firmware images.
import {resolve, join, sep} from 'node:path';
import {mkdir, readFile, writeFile, copyFile, realpath, stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const [sourceArg,runtimeArg,outputArg]=process.argv.slice(2);
if (!outputArg || process.argv.length!==5) throw new Error('Usage: prepare-spike-micropython-pins.mjs SUPPORT_DIRECTORY RENODE_EXECUTABLE NEW_OUTPUT_DIRECTORY');
const source=await realpath(resolve(sourceArg)),runtime=await realpath(resolve(runtimeArg)),output=resolve(outputArg);
const names=['models.cs','program-uart.cs','boot-seed.bin',
    'platforms/boards/spike-prime.repl','platforms/boards/spike-prime-brick-devices.repl',
    'platforms/cpus/stm32f413vg.repl','platforms/cpus/stm32f4.repl',
    'scripts/spike-state-server.py','tools/spike_state_monitor_protocol.py',
    'tools/ev3_state_observer.py','tools/spike_arena_inputs.py','tools/spike_arena_mailbox.py',
    'tools/spike_nuttx_mailbox.py','tools/spike_program_uart.py',
    'licenses/renode-models-MIT.txt','licenses/brickwright-BSD-3-Clause.txt'];
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const manifestPath=join(source,'manifest.json');
if ((await stat(manifestPath)).size>65536) throw new Error('Support manifest exceeds bounds');
const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
if (!manifest || Array.isArray(manifest) || Object.keys(manifest).length!==names.length ||
    names.some(name=>!Object.hasOwn(manifest,name) || !/^[0-9a-f]{64}$/.test(manifest[name]))) {
    throw new Error('Support manifest must contain the closed MicroPython profile');
}
for (const name of names) {
    const file=await realpath(join(source,name)),meta=await stat(file);
    if (!file.startsWith(source+sep) || !meta.isFile() || meta.size>16*1024*1024 ||
        (name==='boot-seed.bin' && meta.size!==65536) || digest(await readFile(file))!==manifest[name]) {
        throw new Error('Support artifact failed verification');
    }
}
await mkdir(output); // Preserve every existing directory and package.
for (const name of names) {
    const file=join(output,name);await mkdir(resolve(file,'..'),{recursive:true});
    await copyFile(join(source,name),file);
    if (digest(await readFile(file))!==manifest[name]) throw new Error('Support artifact changed during staging');
}
await writeFile(join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
const pins={BW_RENODE_EXECUTABLE:runtime,BW_RENODE_SHA256:digest(await readFile(runtime)),
    BW_RENODE_MICROPYTHON_ROOT:output,BW_RENODE_MICROPYTHON_MANIFEST_SHA256:digest(await readFile(join(output,'manifest.json')))};
await writeFile(join(output,'pins.json'),JSON.stringify(pins,null,2)+'\n');
console.log(`Staged support profile at ${output}; firmware is supplied separately by its native owner.`);
