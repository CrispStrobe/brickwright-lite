#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// Stage only our simulation guest and permitted helpers; never download images.
import {resolve, join} from 'node:path';
import {mkdir, copyFile, readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const [firmwareArg, modelsArg, renodeArg, outputArg] = process.argv.slice(2);
if (!outputArg || process.argv.length !== 6) throw new Error('Usage: prepare-spike-arena-package.mjs FIRMWARE_REPO MODELS_REPO RENODE_EXECUTABLE NEW_OUTPUT_DIRECTORY');
const [firmware, models, executable, output] = [firmwareArg, modelsArg, renodeArg, outputArg].map(p => resolve(p));
if ([firmware, models, executable, output].some(p => /[\s"'@]/.test(p))) throw new Error('Package paths must not contain whitespace or monitor metacharacters');
await mkdir(output); // Never replace an existing qualified package.
await Promise.all(['scripts','tools','licenses'].map(p => mkdir(join(output,p))));
const result = spawnSync('sh',[join(firmware,'simulation/arena-demo/build.sh'),output],{stdio:'inherit'});
if (result.status !== 0) throw new Error('Simulation guest build failed');
const copies = [['simulation/arena-demo/arena-demo.repl','arena-demo.repl',firmware],
    ['simulation/arena-demo/LICENSE','licenses/arena-BSD-3-Clause.txt',firmware],
    ['LICENSE','licenses/renode-MIT.txt',models], ['scripts/spike-state-server.py','scripts/spike-state-server.py',models],
    ...['spike_arena_mailbox','spike_arena_inputs','spike_state_monitor_protocol','ev3_state_observer'].map(p=>[`tools/${p}.py`,`tools/${p}.py`,models])];
for(const [source,destination,root] of copies) await copyFile(join(root,source),join(output,destination));
const hash = async file => createHash('sha256').update(await readFile(file)).digest('hex');
await writeFile(join(output,'arena-demo.resc'),`mach create\nmachine LoadPlatformDescription @${join(output,'arena-demo.repl')}\n`);
await writeFile(join(output,'state-config.json'),JSON.stringify({identity:{board:'spike-prime',firmware:'brickwright-arena-demo',transport:'none',imageSha256:await hash(join(output,'arena-demo.elf'))},paths:{}},null,2)+'\n');
const manifest = {};
for(const name of ['arena-demo.elf','arena-demo.resc','state-config.json',...copies.map(c=>c[1])]) manifest[name] = await hash(join(output,name));
await writeFile(join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
const pins = {BW_RENODE_EXECUTABLE:executable,BW_RENODE_SHA256:await hash(executable),BW_RENODE_SPIKE_ROOT:output};
for(const [key,file] of [['SCENARIO','arena-demo.resc'],['FIRMWARE','arena-demo.elf'],['STATE_SCRIPT','scripts/spike-state-server.py'],['STATE_CONFIG','state-config.json'],['MANIFEST','manifest.json']]) {
    pins[`BW_RENODE_SPIKE_${key}`] = join(output,file); pins[`BW_RENODE_SPIKE_${key}_SHA256`] = await hash(join(output,file));
}
await writeFile(join(output,'pins.json'),JSON.stringify(pins,null,2)+'\n');
console.log(`Staged simulation package at ${output}; build the desktop application with the environment in pins.json.`);
