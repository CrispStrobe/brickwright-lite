// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
export const INITIAL_FLASH_FILE = 'initial-flash.bin';
/** Only the trusted firmware source tool creates this empty LittleFS prefix. */
export async function prepareInitialFlash (firmware, output, {required = false, read = readFile, run = spawnSync} = {}) {
    const tool = join(firmware, 'tools/make_simulation_littlefs_seed.py');
    let source;
    try { source = await read(tool); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (!source) {
        if (required) throw new Error('Backported firmware requires its source-generated initial flash formatter');
        return false;
    }
    if (!source.length) throw new Error('Empty initial flash formatter');
    const file = join(output, INITIAL_FLASH_FILE);
    const result = run('python3', [tool, file], {stdio: 'inherit', env: {...process.env, TMPDIR: output}});
    if (result.status !== 0) throw new Error('Source-generated initial flash formatter failed');
    const seed = await read(file);
    if (seed.length !== 8192) throw new Error('Initial flash prefix must be exactly 8192 bytes');
    return true;
}
export function initialFlashScenario (output) {
    if (/[\s"'@;\\]/.test(output)) throw new Error('Unsafe trusted initial flash package path');
    // Runs in the pinned scenario before kernel boot; no packet or client path.
    return `python "from System.IO import File; seed=File.ReadAllBytes('${join(output, INITIAL_FLASH_FILE)}'); assert len(seed)==8192; self.Machine['sysbus.spi2.primeStorageMux.primeStorage'].UnderlyingMemory.WriteBytes(0x100000,seed)"\n`;
}
/** Renode's monitor origin follows the included scenario, unlike process cwd. */
export function initialFlashResourceScenario () {
    return `python "from System.IO import File, Path; seed=File.ReadAllBytes(Path.Combine(variables['ORIGIN'],'${INITIAL_FLASH_FILE}')); assert len(seed)==8192; self.Machine['sysbus.spi2.primeStorageMux.primeStorage'].UnderlyingMemory.WriteBytes(0x100000,seed)"\n`;
}
