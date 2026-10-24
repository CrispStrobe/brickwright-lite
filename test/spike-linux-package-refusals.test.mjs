// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// Focused G05 refusal checks for the offline Linux package builder (--prepare-only, synthetic inputs).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, rm, symlink, readdir, appendFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const script = fileURLToPath(new URL('../scripts/build-spike-linux-desktop.mjs', import.meta.url));
const skip = process.platform !== 'linux' || process.arch !== 'x64';
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
    const root = await mkdtemp(join(tmpdir(), 'bw-linux-refusal-test-'));
    const support = join(root,'support'), runtime = join(root,'runtime'), frontend = join(root,'frontend');
    for (const path of [support,runtime,frontend]) await mkdir(path);
    const manifest = {};
    for (const name of names) {
        const bytes = name === 'boot-seed.bin' ? Buffer.alloc(65536) : Buffer.from(`synthetic ${name}\n`);
        const file = join(support,name);await mkdir(join(file,'..'),{recursive:true});await writeFile(file,bytes);manifest[name]=sha(bytes);
    }
    await writeFile(join(support,'manifest.json'),JSON.stringify(manifest));
    for (const name of ['renode',...libraries]) await writeFile(join(runtime,name),Buffer.from([127,69,76,70,1]));
    await mkdir(join(runtime,'scripts'));
    await writeFile(join(runtime,'.renode-root'),'synthetic runtime root');
    await writeFile(join(runtime,'scripts/monitor.py'),'synthetic monitor helpers');
    await mkdir(join(runtime,'licenses'));await writeFile(join(runtime,'licenses/renode-license'),'synthetic MIT notice');
    await writeFile(join(frontend,'index.html'),'synthetic frontend');await writeFile(join(frontend,'capability-broker.html'),'synthetic broker');
    return {root,support,runtime,frontend};
}
const run = (f, output) => spawnSync(process.execPath,[script,f.support,f.runtime,f.frontend,output,'--prepare-only'],{encoding:'utf8'});
const withFixture = body => async () => {const f = await fixture();try {await body(f);} finally {await rm(f.root,{recursive:true,force:true});}};

test('output reached through a symlinked parent inside an input is refused before writing', {skip}, withFixture(async f => {
    for (const input of ['support','runtime','frontend']) {
        const alias = join(f.root, `alias-${input}`);await symlink(f[input], alias);
        const before = (await readdir(f[input])).sort();
        const result = run(f, join(alias, 'generated'));
        assert.notEqual(result.status, 0, `${input}: ${result.stdout}`);
        assert.match(result.stderr, /outside source and input directories/);
        assert.deepEqual((await readdir(f[input])).sort(), before, `${input} must stay unchanged`);
    }
}));

test('missing native library, empty runtime file and missing notice are refused before output', {skip}, withFixture(async f => {
    const output = join(f.root, 'refused');
    const restore = Buffer.from([127,69,76,70,1]);
    await rm(join(f.runtime,'libcoreclr.so'));
    assert.notEqual(run(f,output).status,0);await assert.rejects(readdir(output),/ENOENT/);
    await writeFile(join(f.runtime,'libcoreclr.so'),Buffer.alloc(0));
    assert.notEqual(run(f,output).status,0);await assert.rejects(readdir(output),/ENOENT/);
    await writeFile(join(f.runtime,'libcoreclr.so'),restore);
    await rm(join(f.runtime,'licenses/renode-license'));await writeFile(join(f.runtime,'licenses/other-license'),'x');
    assert.notEqual(run(f,output).status,0);await assert.rejects(readdir(output),/ENOENT/);
}));

test('runtime helper reached through a directory link escaping the runtime root is refused', {skip}, withFixture(async f => {
    const outside = join(f.root,'outside-scripts');await mkdir(outside);
    await writeFile(join(outside,'monitor.py'),'foreign helper');
    await rm(join(f.runtime,'scripts'),{recursive:true});await symlink(outside,join(f.runtime,'scripts'));
    const output = join(f.root,'refused');
    const result = run(f,output);assert.notEqual(result.status,0);assert.match(result.stderr,/escaped its root/);
    await assert.rejects(readdir(output),/ENOENT/);
}));

test('frontend links and missing broker assets are refused before output', {skip}, withFixture(async f => {
    const output = join(f.root,'refused');
    await symlink(join(f.support,'models.cs'),join(f.frontend,'leak.js'));
    assert.match(run(f,output).stderr,/Frontend links are unsupported/);await assert.rejects(readdir(output),/ENOENT/);
    await rm(join(f.frontend,'leak.js'));await rm(join(f.frontend,'capability-broker.html'));
    assert.match(run(f,output).stderr,/lacks desktop broker assets/);await assert.rejects(readdir(output),/ENOENT/);
}));

test('a tampered support artifact is refused and no compile pins or resource config are written', {skip}, withFixture(async f => {
    await appendFile(join(f.support,'models.cs'),'tampered\n');
    const output = join(f.root,'tampered');
    assert.notEqual(run(f,output).status,0);
    await assert.rejects(readFile(join(output,'compile-pins.json')),/ENOENT/);
    await assert.rejects(readFile(join(output,'tauri-config.json')),/ENOENT/);
    await assert.rejects(readFile(join(output,'build-inputs.json')),/ENOENT/);
}));

test('relocated prepared output keeps compile pins free of staging paths', {skip}, withFixture(async f => {
    const output = join(f.root,'prepared');const result = run(f,output);assert.equal(result.status,0,result.stderr);
    const pins = JSON.parse(await readFile(join(output,'compile-pins.json'),'utf8'));
    for (const [name,value] of Object.entries(pins)) {
        assert.ok(!String(value).includes(f.root), `${name} embeds a staging path`);
        assert.ok(!String(value).startsWith('/'), `${name} is absolute`);
    }
}));
