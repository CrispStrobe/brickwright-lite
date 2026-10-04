// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// Freeze only already staged, closed source-build profiles. Never fetch images.
import {readFile, writeFile, mkdir, lstat, realpath} from 'node:fs/promises';
import {join, dirname, relative, sep, resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {initialFlashScenario,initialFlashResourceScenario} from './spike-initial-flash.mjs';
const shared = ['state-config.json','scripts/spike-state-server.py',
    'tools/spike_state_monitor_protocol.py','tools/ev3_state_observer.py',
    'tools/spike_arena_inputs.py','tools/spike_arena_mailbox.py'];
export const profileFiles = Object.freeze({
    guest: [...shared,'arena-demo.elf','arena-demo.repl','arena-demo.resc',
        'licenses/renode-MIT.txt','licenses/arena-BSD-3-Clause.txt'],
    nuttx: [...shared,'nuttx-kernel.elf','nuttx-user.elf','nuttx.resc','models.cs',
        'platforms/boards/spike-prime.repl','platforms/boards/spike-prime-brick-devices.repl',
        'platforms/cpus/stm32f413vg.repl','platforms/cpus/stm32f4.repl','tools/spike_nuttx_mailbox.py',
        'licenses/renode-models-MIT.txt','licenses/brickwright-BSD-3-Clause.txt',
        'licenses/firmware-LICENSE','licenses/NuttX-Apache-2.0.txt','licenses/NuttX-NOTICE.txt',
        'licenses/NuttX-apps-Apache-2.0.txt','licenses/littlefs-BSD-3-Clause.txt',
        'licenses/Zephyr-Apache-2.0.txt','licenses/firmware-source-NOTICES.txt',
        'licenses/MicroPython-MIT.txt','licenses/hubprogram-BSD-3-Clause.txt']
});
const backport = ['licenses/Apache-2.0.txt','licenses/firmware-NuttX-NOTICE.txt',
    'licenses/NuttX-Apps-NOTICE.txt','licenses/firmware-Brickwright-BSD-3-Clause.txt',
    'licenses/NuttX-Tickless-BSD-3-Clause.txt','licenses/Simulation-Firmware-NOTICES.txt'];
const optional = {guest:['tools/spike_nuttx_mailbox.py','tools/spike_program_uart.py'],
    nuttx:[...backport,'initial-flash.bin','tools/spike_program_uart.py']};
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const bounded = async (root,name,limit) => {
    const path=join(root,name), meta=await lstat(path), actual=await realpath(path);
    if (!meta.isFile() || meta.isSymbolicLink() || (meta.size===0 || meta.size>limit) || !actual.startsWith(root+sep)) {
        throw new Error('Profile artifact must be a confined bounded regular file');
    }
    const bytes=await readFile(path);
    if (bytes.length>limit) throw new Error('Profile artifact changed beyond bounds');
    return bytes;
};
export async function freezeResourceProfile (kind, sourceArg, outputArg, resourceArg) {
    if (!Object.hasOwn(profileFiles,kind)) throw new Error('Unknown source-build profile');
    const source=await realpath(sourceArg), resources=await realpath(resourceArg), output=resolve(outputArg);
    const destination=join(await realpath(dirname(output)),output.split(sep).at(-1));
    const location=relative(resources,destination).split(sep).join('/');
    if (location.split('/').some(p=>!p || p==='.' || p==='..') || /[\\:;'"\x00-\x1f\x7f-\x9f]/.test(location)
        || output===source || output.startsWith(source+sep)) throw new Error('Invalid profile resource destination');
    const sourceManifestBytes=await bounded(source,'manifest.json',65536);
    const original=JSON.parse(sourceManifestBytes.toString());
    const required=profileFiles[kind], allowed=[...required,...optional[kind]];
    if (!original || Array.isArray(original) || typeof original!=='object' ||
        required.some(n=>!Object.hasOwn(original,n)) ||
        Object.entries(original).some(([n,h])=>!allowed.includes(n) || !/^[a-f0-9]{64}$/.test(h))) {
        throw new Error('Incomplete or unknown source-build profile manifest');
    }
    const files={};
    for (const [name,hash] of Object.entries(original)) {
        const bytes=await bounded(source,name,16*1024*1024);
        if (sha(bytes)!==hash) throw new Error('Source-build profile digest mismatch');
        files[name]=bytes;
    }
    if (files['scripts/spike-state-server.py'].includes('from spike_program_uart import') && !files['tools/spike_program_uart.py']) {
        throw new Error('Missing program UART helper');
    }
    if (backport.some(n=>files[n]) && (!backport.every(n=>files[n]) || !files['initial-flash.bin'])) {
        throw new Error('Incomplete firmware backport notices or flash seed');
    }
    if (files['initial-flash.bin'] && files['initial-flash.bin'].length!==8192) throw new Error('Invalid initial flash geometry');
    const firmware=kind==='guest'?'arena-demo.elf':'nuttx-user.elf';
    const config=JSON.parse(files['state-config.json'].toString());
    if (config.identity?.firmware!==(kind==='guest'?'brickwright-arena-demo':'brickwright-nuttx') ||
        config.identity.imageSha256!==original[firmware]) throw new Error('Source-build firmware identity mismatch');
    for (const name of kind==='guest'?[firmware]:['nuttx-kernel.elf',firmware]) {
        const elf=files[name];
        if (elf.length<52 || elf.subarray(0,6).toString('hex')!=='7f454c460101' || elf.readUInt16LE(18)!==40) {
            throw new Error('Source-build profile must contain ARM ELF32');
        }
    }
    const scenario=kind==='guest'?'arena-demo.resc':'nuttx.resc';
    const expected=kind==='guest'?`mach create\nmachine LoadPlatformDescription @${join(source,'arena-demo.repl')}\n`:
        `include @${join(source,'models.cs')}\nmach create\nmachine LoadPlatformDescription @${join(source,'platforms/boards/spike-prime.repl')}\nemulation CreatePrimeElectricalPorts "machine-0"\n${files['initial-flash.bin']?initialFlashScenario(source):''}`;
    const portable=kind==='guest'?'mach create\nmachine LoadPlatformDescription @arena-demo.repl\n':
        `include @models.cs\nmach create\nmachine LoadPlatformDescription @platforms/boards/spike-prime.repl\nemulation CreatePrimeElectricalPorts "machine-0"\n${files['initial-flash.bin']?initialFlashResourceScenario():''}`;
    // Accept only the exact authored templates, never arbitrary monitor rewriting.
    if (![expected,portable].includes(files[scenario].toString())) throw new Error('Unknown source-build scenario template');
    files[scenario]=Buffer.from(portable);
    await mkdir(output); // Preserve every existing output, even incomplete packages.
    const manifest={},mapping={};
    for (const [name,bytes] of Object.entries(files)) {
        const path=join(output,name);await mkdir(dirname(path),{recursive:true});await writeFile(path,bytes);
        manifest[name]=sha(bytes);mapping[path]=`${location}/${name}`;
    }
    const manifestBytes=Buffer.from(JSON.stringify(manifest,null,2)+'\n');
    await writeFile(join(output,'manifest.json'),manifestBytes);mapping[join(output,'manifest.json')]=`${location}/manifest.json`;
    const prefix=kind==='guest'?'BW_RENODE_SPIKE':'BW_RENODE_NUTTX';
    const pins={[`${prefix}_RESOURCE_ROOT`]:location};
    for (const [key,name] of [['SCENARIO',scenario],['FIRMWARE',firmware],['STATE_SCRIPT','scripts/spike-state-server.py'],
        ['STATE_CONFIG','state-config.json'],['MANIFEST','manifest.json']]) {
        pins[`${prefix}_${key}_SHA256`]=name==='manifest.json'?sha(manifestBytes):manifest[name];
    }
    return {pins,resources:mapping,sourceManifestSha256:sha(sourceManifestBytes),manifest};
}
