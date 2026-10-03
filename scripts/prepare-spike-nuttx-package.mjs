#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// Package only the source-built Brickwright firmware, never downloaded images.
import {resolve, join} from 'node:path';
import {mkdir, copyFile, readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {firmwareMotorPorts} from './lib/spike-nuttx-topology.mjs';
import {programStorageAbiAddress} from './lib/spike-program-storage-marker.mjs';
import {firmwareExtraNotices} from './lib/spike-firmware-notices.mjs';
import {prepareInitialFlash, initialFlashScenario, INITIAL_FLASH_FILE} from './lib/spike-initial-flash.mjs';
const args = process.argv.slice(2);
if (args.length !== 5) throw new Error('Usage: prepare-spike-nuttx-package.mjs FIRMWARE_REPO RENODE_REPO INFRASTRUCTURE_REPO RENODE_EXECUTABLE NEW_OUTPUT_DIRECTORY');
const [firmware, models, infrastructure, executable, output] = args.map(p => resolve(p));
if ([firmware, models, infrastructure, executable, output].some(p => /[\s"'@;\\]/.test(p))) throw new Error('Package paths must not contain monitor metacharacters');
const extraNotices = await firmwareExtraNotices(firmware);
const motorPorts = await firmwareMotorPorts(firmware);
const stage = spawnSync('python3', [join(models, 'tools/stage_prime_runtime.py'), '--infrastructure', infrastructure,
    '--output', output, '--aggregate-display-clock'], {stdio: 'inherit'});
if (stage.status !== 0) throw new Error('Prime model staging failed');
await mkdir(join(output, 'scripts')); await mkdir(join(output, 'tools'));
const seeded = await prepareInitialFlash(firmware, output, {required: extraNotices.some(([source]) => source === 'licenses/NuttX-Tickless-BSD-3-Clause.txt')});
const kernel = await readFile(join(firmware, 'nuttx/nuttx'));
const user = await readFile(join(firmware, 'nuttx/nuttx_user.elf'));
for (const elf of [kernel, user]) {
    if (elf.subarray(0, 6).toString('hex') !== '7f454c460101' || elf.readUInt16LE(18) !== 40) throw new Error('Expected source-built ARM ELF32');
}
const phoff = kernel.readUInt32LE(28), phsize = kernel.readUInt16LE(42), phcount = kernel.readUInt16LE(44);
let boot;
for (let i = 0; i < phcount; i++) {
    const p = phoff + i * phsize;
    if (phsize < 32 || p + phsize > kernel.length) throw new Error('Malformed kernel program headers');
    const address = kernel.readUInt32LE(p + 8), size = kernel.readUInt32LE(p + 16), offset = kernel.readUInt32LE(p + 4);
    if (kernel.readUInt32LE(p) === 1 && address <= 0x08008000 && address + size >= 0x08008008) {
        const v = offset + 0x08008000 - address;
        if (v + 8 > kernel.length) throw new Error('Truncated kernel vector');
        boot = {stack: kernel.readUInt32LE(v), reset: kernel.readUInt32LE(v + 4)};
    }
}
if (!boot || boot.stack % 8 || boot.stack <= 0x20000000 || boot.stack > 0x20020000 ||
    !(boot.reset & 1) || boot.reset < 0x08008000 || boot.reset >= 0x08060000) throw new Error('Kernel reset vector exceeds protected partition');
const nm = spawnSync('arm-none-eabi-nm', [join(firmware, 'nuttx/nuttx_user.elf')], {encoding: 'utf8'});
if (nm.status !== 0) throw new Error('Unable to resolve our firmware mailbox');
const symbol = nm.stdout.match(/^([a-fA-F0-9]+)\s+\w\s+g_bw_program_debug$/m);
const mailbox = symbol && parseInt(symbol[1], 16);
if (!mailbox || mailbox % 4 || mailbox < 0x20020000 || mailbox > 0x20040000 - 112) throw new Error('Mailbox is outside protected userspace RAM');
const outputSymbol = nm.stdout.match(/^([a-fA-F0-9]+)\s+\w\s+g_bw_python_output$/m);
const outputMailbox = outputSymbol && parseInt(outputSymbol[1], 16);
if (!outputMailbox || outputMailbox % 4 || outputMailbox < 0x20020000 || outputMailbox > 0x20040000 - 1036) throw new Error('Python output buffer exceeds userspace RAM');
const storageAddress = programStorageAbiAddress(user, nm.stdout);
// This host adapter ABI is declared by our authored state service, independent
// of the embedded firmware's storage ABI. Older service packages stay usable.
const stateService = await readFile(join(models, 'scripts/spike-state-server.py'), 'utf8');
const hostFlashCheckpointAbi = storageAddress !== null && /^FLASH_CHECKPOINT_ABI = 1$/m.test(stateService) ? 1 : null;
const copies = [['nuttx/nuttx', 'nuttx-kernel.elf', firmware], ['nuttx/nuttx_user.elf', 'nuttx-user.elf', firmware],
    ['LICENSE', 'licenses/firmware-LICENSE', firmware], ['nuttx/LICENSE', 'licenses/NuttX-Apache-2.0.txt', firmware],
    ['nuttx/NOTICE', 'licenses/NuttX-NOTICE.txt', firmware],
    ['nuttx-apps/LICENSE', 'licenses/NuttX-apps-Apache-2.0.txt', firmware],
    ['nuttx/fs/littlefs/littlefs/LICENSE.md', 'licenses/littlefs-BSD-3-Clause.txt', firmware],
    ['third_party/zephyr-host/upstream/LICENSE', 'licenses/Zephyr-Apache-2.0.txt', firmware],
    ['licenses/firmware-source-NOTICES.txt', 'licenses/firmware-source-NOTICES.txt', firmware],
    ['third_party/micropython-embed/LICENSE', 'licenses/MicroPython-MIT.txt', firmware],
    ['licenses/hubprogram-BSD-3-Clause.txt', 'licenses/hubprogram-BSD-3-Clause.txt', firmware],
    ...extraNotices.map(([source, destination]) => [source, destination, firmware]),
    ['scripts/spike-state-server.py', 'scripts/spike-state-server.py', models],
    ...['spike_arena_mailbox', 'spike_arena_inputs', 'spike_state_monitor_protocol', 'ev3_state_observer', 'spike_nuttx_mailbox']
        .map(p => [`tools/${p}.py`, `tools/${p}.py`, models])];
for (const [source, destination, root] of copies) await copyFile(join(root, source), join(output, destination));
const hash = async file => createHash('sha256').update(await readFile(file)).digest('hex');
await writeFile(join(output, 'nuttx.resc'), `include @${join(output, 'models.cs')}\nmach create\nmachine LoadPlatformDescription @${join(output, 'platforms/boards/spike-prime.repl')}\nemulation CreatePrimeElectricalPorts "machine-0"\n${seeded ? initialFlashScenario(output) : ''}`);
await writeFile(join(output, 'state-config.json'), JSON.stringify({identity: {board: 'spike-prime', firmware: 'brickwright-nuttx', transport: 'none',
    imageSha256: await hash(join(output, 'nuttx-user.elf'))}, programMailbox: mailbox, pythonOutputMailbox: outputMailbox, boot,
    ...(storageAddress === null ? {} : {programStorageAbiAddress: storageAddress}),
    ...(motorPorts === null ? {} : {motorPorts}),
    ...(hostFlashCheckpointAbi === null ? {} : {hostFlashCheckpointAbi}),
paths: {...Object.fromEntries('ABCDEF'.split('').map(p => [`port${p}`, `external:port${p}`])), display: 'sysbus.display', power: 'sysbus.power'}}, null, 2)+'\n');
const files = [...(seeded ? [INITIAL_FLASH_FILE] : []), 'models.cs', 'nuttx.resc', 'state-config.json', ...copies.map(c => c[1]),
    'licenses/renode-models-MIT.txt', 'licenses/brickwright-BSD-3-Clause.txt',
    ...['boards/spike-prime.repl', 'boards/spike-prime-brick-devices.repl', 'cpus/stm32f413vg.repl', 'cpus/stm32f4.repl'].map(p => `platforms/${p}`)];
const manifest = {};
for (const file of files) manifest[file] = await hash(join(output, file));
await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2)+'\n');
const pins = {BW_RENODE_EXECUTABLE: executable, BW_RENODE_SHA256: await hash(executable), BW_RENODE_SPIKE_ROOT: output};
for (const [key, file] of [['SCENARIO', 'nuttx.resc'], ['FIRMWARE', 'nuttx-user.elf'], ['STATE_SCRIPT', 'scripts/spike-state-server.py'], ['STATE_CONFIG', 'state-config.json'], ['MANIFEST', 'manifest.json']]) {
    pins[`BW_RENODE_SPIKE_${key}`] = join(output, file); pins[`BW_RENODE_SPIKE_${key}_SHA256`] = await hash(join(output, file));
}
const alongside = Object.fromEntries(Object.entries(pins).map(([key, value]) => [key.replace('BW_RENODE_SPIKE_', 'BW_RENODE_NUTTX_'), value]));
await writeFile(join(output, 'alongside-pins.json'), JSON.stringify(alongside, null, 2)+'\n');
await writeFile(join(output, 'pins.json'), JSON.stringify(pins, null, 2)+'\n');
console.log('Staged our full NuttX simulation package; build the desktop app with its pins.json environment.');
