#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Restage an EXISTING source-built NuttX package (prepare-spike-nuttx-package.mjs
// output, or the `nuttx` resources of an assembled desktop package) onto newer
// Renode-side sources, without rebuilding the firmware:
//
//   firmware, flash seed, firmware notices, state-config.json   <- BASE (unchanged bytes)
//   models.cs + platforms (source mode, stock-Renode aliases)   <- INFRASTRUCTURE via the
//                                                                  Runtime's stage_prime_runtime.py
//   state service + its helpers (incl. spike_lockstep.py)      <- RUNTIME
//
// The result loads into a stock Renode (1.16.1) that compiles models.cs at
// `include` time — no Renode fork build. Used for the Robot Lab lockstep route
// (docs/ROBOT-LAB-SPIKE-EMULATION.md §4 R13e) on hosts with no firmware toolchain.
// Writes pins.json/alongside-pins.json like prepare-spike-nuttx-package.mjs.
//
// Usage: restage-spike-nuttx-package.mjs BASE_PACKAGE RENODE_REPO INFRASTRUCTURE_REPO RENODE_EXECUTABLE NEW_OUTPUT_DIRECTORY
import {resolve, join, dirname} from 'node:path';
import {mkdir, copyFile, readFile, writeFile, readdir, access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {stagePackageModels, packageModelInclude} from './lib/spike-package-model-loading.mjs';
import {initialFlashScenario, INITIAL_FLASH_FILE} from './lib/spike-initial-flash.mjs';
import {stateServiceHelpers} from './lib/spike-state-service-helpers.mjs';

const args = process.argv.slice(2);
if (args.length !== 5) {
    throw new Error('Usage: restage-spike-nuttx-package.mjs BASE_PACKAGE RENODE_REPO INFRASTRUCTURE_REPO RENODE_EXECUTABLE NEW_OUTPUT_DIRECTORY');
}
const [base, runtime, infrastructure, executable, output] = args.map(p => resolve(p));
if ([base, runtime, infrastructure, executable, output].some(p => /[\s"'@;\\]/.test(p))) throw new Error('Package paths must not contain monitor metacharacters');
const hash = async file => createHash('sha256').update(await readFile(file)).digest('hex');
const exists = async file => access(file).then(() => true, () => false);

const baseManifest = JSON.parse(await readFile(join(base, 'manifest.json'), 'utf8'));
const config = JSON.parse(await readFile(join(base, 'state-config.json'), 'utf8'));
if (config.identity?.firmware !== 'brickwright-nuttx' || config.identity.imageSha256 !== await hash(join(base, 'nuttx-user.elf'))) {
    throw new Error('The base is not a consistent brickwright-nuttx package');
}
for (const [name, digest] of Object.entries(baseManifest)) {
    if (await hash(join(base, name)) !== digest) throw new Error(`Base package file changed: ${name}`);
}
// The firmware side, byte for byte.
const fromBase = Object.keys(baseManifest).filter(name => name === 'nuttx-kernel.elf' || name === 'nuttx-user.elf' ||
    name === INITIAL_FLASH_FILE || (name.startsWith('licenses/') &&
    !['licenses/renode-models-MIT.txt', 'licenses/brickwright-BSD-3-Clause.txt'].includes(name)));
stagePackageModels(runtime, infrastructure, output, 'source');
await mkdir(join(output, 'scripts'));
await mkdir(join(output, 'tools'));
for (const name of fromBase) {
    await mkdir(dirname(join(output, name)), {recursive: true});
    await copyFile(join(base, name), join(output, name));
}
const stateService = await readFile(join(runtime, 'scripts/spike-state-server.py'), 'utf8');
const helpers = stateServiceHelpers(stateService);
await copyFile(join(runtime, 'scripts/spike-state-server.py'), join(output, 'scripts/spike-state-server.py'));
for (const helper of helpers) await copyFile(join(runtime, helper), join(output, helper));
const seeded = fromBase.includes(INITIAL_FLASH_FILE);
await writeFile(join(output, 'nuttx.resc'), `${packageModelInclude(output, 'source')}mach create\nmachine LoadPlatformDescription @${join(output, 'platforms/boards/spike-prime.repl')}\nemulation CreatePrimeElectricalPorts "machine-0"\n${seeded ? initialFlashScenario(output) : ''}`);
await writeFile(join(output, 'state-config.json'), JSON.stringify(config, null, 2) + '\n');
const files = [...fromBase, 'models.cs', 'nuttx.resc', 'state-config.json', 'scripts/spike-state-server.py', ...helpers,
    'licenses/renode-models-MIT.txt', 'licenses/brickwright-BSD-3-Clause.txt',
    ...['boards/spike-prime.repl', 'boards/spike-prime-brick-devices.repl', 'cpus/stm32f413vg.repl', 'cpus/stm32f4.repl'].map(p => `platforms/${p}`)];
for (const file of files) if (!await exists(join(output, file))) throw new Error(`Restaged package lacks ${file}`);
const extra = (await readdir(join(output, 'licenses'))).filter(n => !files.includes(`licenses/${n}`));
if (extra.length) throw new Error(`Unexpected staged notices: ${extra.join(', ')}`);
const manifest = {};
for (const file of files) manifest[file] = await hash(join(output, file));
await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
const pins = {BW_RENODE_EXECUTABLE: executable, BW_RENODE_SHA256: await hash(executable), BW_RENODE_SPIKE_ROOT: output};
for (const [key, file] of [['SCENARIO', 'nuttx.resc'], ['FIRMWARE', 'nuttx-user.elf'], ['STATE_SCRIPT', 'scripts/spike-state-server.py'], ['STATE_CONFIG', 'state-config.json'], ['MANIFEST', 'manifest.json']]) {
    pins[`BW_RENODE_SPIKE_${key}`] = join(output, file);
    pins[`BW_RENODE_SPIKE_${key}_SHA256`] = await hash(join(output, file));
}
const alongside = Object.fromEntries(Object.entries(pins).map(([key, value]) => [key.replace('BW_RENODE_SPIKE_', 'BW_RENODE_NUTTX_'), value]));
await writeFile(join(output, 'alongside-pins.json'), JSON.stringify(alongside, null, 2) + '\n');
await writeFile(join(output, 'pins.json'), JSON.stringify(pins, null, 2) + '\n');
console.log(`Restaged ${files.length} files (firmware ${config.identity.imageSha256.slice(0, 12)}, helpers: ${helpers.map(h => h.slice(6)).join(' ')}).`);
