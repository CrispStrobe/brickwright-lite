#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// Freeze an already staged support profile. Never fetch or copy firmware images.
import {resolve, join, sep, relative, dirname, basename} from 'node:path';
import {mkdir, readFile, writeFile, copyFile, realpath, stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const [sourceArg,runtimeArg,outputArg,mode,resourceArg]=process.argv.slice(2);
if (!outputArg || !([5,7].includes(process.argv.length)) ||
    (process.argv.length===7 && (mode!=='--resource-root' || !resourceArg))) {
    throw new Error('Usage: prepare-spike-micropython-pins.mjs SUPPORT_DIRECTORY RENODE_EXECUTABLE NEW_OUTPUT_DIRECTORY [--resource-root NATIVE_RESOURCE_DIRECTORY]');
}
const source=await realpath(resolve(sourceArg)),runtime=await realpath(resolve(runtimeArg)),output=resolve(outputArg);
const resourceRoot=resourceArg ? await realpath(resolve(resourceArg)) : null;
const resourcePath=file=>{
    const value=relative(resourceRoot,file).split(sep).join('/');
    if (value.length>1024 || value.split('/').some(part=>!part || part==='.' || part==='..') ||
        /[\\:;'"\x00-\x1f\x7f-\x9f]/.test(value)) throw new Error('Invalid relative resource path');
    return value;
};
const runtimeMeta=await stat(runtime);
if (!runtimeMeta.isFile() || runtimeMeta.size>512*1024*1024) throw new Error('Runtime must be a bounded regular file');
// Resolve the output parent before writing, so a symlink cannot escape resources.
const runtimeRelative=resourceRoot ? resourcePath(runtime) : null;
const supportRelative=resourceRoot ? resourcePath(join(await realpath(dirname(output)),basename(output))) : null;
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
const locations=resourceRoot ? {BW_RENODE_RESOURCE_EXECUTABLE:runtimeRelative,
    BW_RENODE_MICROPYTHON_RESOURCE_ROOT:supportRelative} : {BW_RENODE_EXECUTABLE:runtime,BW_RENODE_MICROPYTHON_ROOT:output};
const pins={...locations,BW_RENODE_SHA256:digest(await readFile(runtime)),
    BW_RENODE_MICROPYTHON_MANIFEST_SHA256:digest(await readFile(join(output,'manifest.json')))};
await writeFile(join(output,'pins.json'),JSON.stringify(pins,null,2)+'\n');
if (resourceRoot) {
    const resources=Object.fromEntries([...names,'manifest.json'].map(name=>
        [join(output,name),`${supportRelative}/${name}`]));
    await writeFile(join(output,'tauri-support-resources.json'),JSON.stringify({bundle:{resources}},null,2)+'\n');
}
console.log(`Staged support profile at ${output}; firmware is supplied separately by its native owner.`);
