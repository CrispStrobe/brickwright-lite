// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, rm, symlink, readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const script = fileURLToPath(new URL('../scripts/build-spike-linux-desktop.mjs', import.meta.url));
const names = ['models.cs','program-uart.cs','boot-seed.bin','platforms/boards/spike-prime.repl',
    'platforms/boards/spike-prime-brick-devices.repl','platforms/cpus/stm32f413vg.repl','platforms/cpus/stm32f4.repl',
    'scripts/spike-state-server.py','tools/spike_state_monitor_protocol.py','tools/ev3_state_observer.py',
    'tools/spike_arena_inputs.py','tools/spike_arena_mailbox.py','tools/spike_nuttx_mailbox.py','tools/spike_program_uart.py',
    'licenses/renode-models-MIT.txt','licenses/brickwright-BSD-3-Clause.txt'];
const libraries = ['libMono.Unix.so','libSystem.Globalization.Native.so','libSystem.IO.Compression.Native.so',
    'libSystem.Native.so','libSystem.Net.Security.Native.so','libSystem.Security.Cryptography.Native.OpenSsl.so',
    'libclrjit.so','libcoreclr.so','libcoreclrtraceptprovider.so','libhostfxr.so','libhostpolicy.so',
    'libllvm-disas.so','libmscordaccore.so','libmscordbi.so'];
const sha = value => createHash('sha256').update(value).digest('hex');
async function fixture () {
    const root = await mkdtemp(join(tmpdir(), 'bw-linux-resource-test-'));
    const support = join(root,'support'), runtime = join(root,'runtime'), frontend = join(root,'frontend');
    for (const path of [support,runtime,frontend]) await mkdir(path);
    const manifest = {};
    for (const name of names) {
        const bytes = name === 'boot-seed.bin' ? Buffer.alloc(65536) : Buffer.from(`synthetic ${name}\n`);
        const file = join(support,name);await mkdir(join(file,'..'),{recursive:true});await writeFile(file,bytes);manifest[name]=sha(bytes);
    }
    await writeFile(join(support,'manifest.json'),JSON.stringify(manifest));
    for (const name of ['renode',...libraries]) await writeFile(join(runtime,name),Buffer.from([127,69,76,70,1]));
    await mkdir(join(runtime,'licenses'));await writeFile(join(runtime,'licenses/renode-license'),'synthetic MIT notice');
    await writeFile(join(frontend,'index.html'),'synthetic frontend');await writeFile(join(frontend,'capability-broker.html'),'synthetic broker');
    return {root,support,runtime,frontend};
}
const run = (f, output) => spawnSync(process.execPath,[script,f.support,f.runtime,f.frontend,output,'--prepare-only'],{encoding:'utf8'});
test('offline preparation closes resources, keeps firmware out and preserves an existing output', {skip:process.platform!=='linux'||process.arch!=='x64'}, async()=>{
    const f=await fixture();try {
        await mkdir(join(f.runtime,'tests'));await writeFile(join(f.runtime,'tests/private-input.bin'),'must never copy');
        const output=join(f.root,'prepared');const result=run(f,output);assert.equal(result.status,0,result.stderr);
        const layout=JSON.parse(await readFile(join(output,'install-layout.json'),'utf8'));
        assert.equal(layout.resourceDirectory,'usr/lib/Brickwright');
        assert.equal(layout.executable,'usr/bin/brickwright-tauri');
        const native=JSON.parse(await readFile(join(output,'native-source-inputs.json'),'utf8'));
        assert.ok(native.files['apps/tauri/src-tauri/src/main.rs']);
        const pins=JSON.parse(await readFile(join(output,'compile-pins.json'),'utf8'));
        assert.equal(pins.BW_RENODE_RESOURCE_EXECUTABLE,'renode/renode');assert.equal(pins.BW_RENODE_MICROPYTHON_RESOURCE_ROOT,'micropython');
        assert.deepEqual((await readdir(join(output,'resources/renode'))).sort(),['renode','licenses',...libraries].sort());
        const config=JSON.parse(await readFile(join(output,'tauri-config.json'),'utf8'));
        assert.equal(Object.values(config.bundle.resources).length,17+15+1);
        assert.ok(Object.values(config.bundle.resources).every(name=>!name.includes('private-input')));
        const inputs=JSON.parse(await readFile(join(output,'build-inputs.json'),'utf8'));assert.equal(inputs.redistributionValidated,false);
        const before=await readFile(join(output,'compile-pins.json'));assert.notEqual(run(f,output).status,0);
        assert.deepEqual(await readFile(join(output,'compile-pins.json')),before);
    } finally {await rm(f.root,{recursive:true,force:true});}
});
test('runtime links and non-ELF inputs are rejected before creating an output', {skip:process.platform!=='linux'||process.arch!=='x64'},async()=>{
    const f=await fixture();try {
        await rm(join(f.runtime,'renode'));await symlink(join(f.frontend,'index.html'),join(f.runtime,'renode'));
        const output=join(f.root,'refused');assert.notEqual(run(f,output).status,0);
        await assert.rejects(readFile(join(output,'build-inputs.json')),/ENOENT/);
        await rm(join(f.runtime,'renode'));await writeFile(join(f.runtime,'renode'),'not executable');
        assert.notEqual(run(f,output).status,0);await assert.rejects(readFile(join(output,'build-inputs.json')),/ENOENT/);
    } finally {await rm(f.root,{recursive:true,force:true});}
});
