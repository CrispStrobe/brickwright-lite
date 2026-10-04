// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, rm, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const script = new URL('../scripts/prepare-spike-micropython-pins.mjs', import.meta.url);
const names = ['models.cs', 'program-uart.cs', 'boot-seed.bin',
    'platforms/boards/spike-prime.repl', 'platforms/boards/spike-prime-brick-devices.repl',
    'platforms/cpus/stm32f413vg.repl', 'platforms/cpus/stm32f4.repl',
    'scripts/spike-state-server.py', 'tools/spike_state_monitor_protocol.py',
    'tools/ev3_state_observer.py', 'tools/spike_arena_inputs.py', 'tools/spike_arena_mailbox.py',
    'tools/spike_nuttx_mailbox.py', 'tools/spike_program_uart.py',
    'licenses/renode-models-MIT.txt', 'licenses/brickwright-BSD-3-Clause.txt'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function fixture(t) {
    const root = await mkdtemp(join(tmpdir(), 'bw-micro-pins-'));
    t.after(() => rm(root, {recursive: true, force: true}));
    const source = join(root, 'source with spaces');
    await mkdir(source);
    const manifest = {};
    for (const name of names) {
        const bytes = name === 'boot-seed.bin' ? Buffer.alloc(65536) : Buffer.from(`synthetic ${name}`);
        await mkdir(dirname(join(source, name)), {recursive: true});
        await writeFile(join(source, name), bytes);
        manifest[name] = hash(bytes);
    }
    const runtime = join(root, 'runtime');
    await writeFile(runtime, 'synthetic runtime');
    const save = () => writeFile(join(source, 'manifest.json'), JSON.stringify(manifest));
    await save();
    const output = join(root, 'output');
    const run = (args=[]) => spawnSync(process.execPath, [script.pathname, source, runtime, output,...args], {encoding: 'utf8'});
    return {root, source, runtime, output, manifest, save, run};
}
test('pins copy only the closed support profile, never adjacent application images', async t => {
    const f = await fixture(t);
    await writeFile(join(f.source, 'application.bin'), 'private synthetic image');
    assert.equal(f.run().status, 0);
    const pins = JSON.parse(await readFile(join(f.output, 'pins.json')));
    assert.equal(pins.BW_RENODE_SHA256, hash(await readFile(f.runtime)));
    assert.equal(pins.BW_RENODE_MICROPYTHON_MANIFEST_SHA256, hash(await readFile(join(f.output, 'manifest.json'))));
    assert.equal(pins.BW_RENODE_MICROPYTHON_ROOT, f.output);
    for (const name of names) assert.equal(hash(await readFile(join(f.output, name))), f.manifest[name]);
    await assert.rejects(readFile(join(f.output, 'application.bin')), {code: 'ENOENT'});
});
for (const defect of ['corruption', 'missing', 'extra manifest image', 'short seed', 'escaping symlink']) {
    test(`rejects ${defect} before creating an output package`, async t => {
        const f = await fixture(t);
        if (defect === 'corruption') await writeFile(join(f.source, 'models.cs'), 'changed');
        if (defect === 'missing') await rm(join(f.source, 'program-uart.cs'));
        if (defect === 'extra manifest image') {f.manifest['application.bin'] = hash('image'); await f.save();}
        if (defect === 'short seed') {
            await writeFile(join(f.source, 'boot-seed.bin'), Buffer.alloc(4));
            f.manifest['boot-seed.bin'] = hash(Buffer.alloc(4)); await f.save();
        }
        if (defect === 'escaping symlink') {
            const outside = join(f.root, 'outside');
            await writeFile(outside, await readFile(join(f.source, 'models.cs')));
            await rm(join(f.source, 'models.cs')); await symlink(outside, join(f.source, 'models.cs'));
        }
        assert.notEqual(f.run().status, 0);
        await assert.rejects(readFile(join(f.output, 'manifest.json')), {code: 'ENOENT'});
    });
}
test('never replaces an existing output directory', async t => {
    const f = await fixture(t);
    await mkdir(f.output); await writeFile(join(f.output, 'owner.txt'), 'keep');
    assert.notEqual(f.run().status, 0);
    assert.equal(await readFile(join(f.output, 'owner.txt'), 'utf8'), 'keep');
    await assert.rejects(readFile(join(f.output, 'models.cs')), {code: 'ENOENT'});
});

test('resource pins contain only relative locations and support survives moving the resource tree', async t => {
    const f=await fixture(t);
    assert.equal(f.run(['--resource-root',f.root]).status,0);
    const pins=JSON.parse(await readFile(join(f.output,'pins.json')));
    assert.equal(pins.BW_RENODE_RESOURCE_EXECUTABLE,'runtime');
    assert.equal(pins.BW_RENODE_MICROPYTHON_RESOURCE_ROOT,'output');
    assert.equal(Object.hasOwn(pins,'BW_RENODE_EXECUTABLE'),false);
    assert.equal(Object.hasOwn(pins,'BW_RENODE_MICROPYTHON_ROOT'),false);
    assert.ok(!JSON.stringify(pins).includes(f.root));
    const mapping=JSON.parse(await readFile(join(f.output,'tauri-support-resources.json'))).bundle.resources;
    assert.deepEqual(Object.keys(mapping).sort(),[...names,'manifest.json'].map(name=>join(f.output,name)).sort());
    for (const name of [...names,'manifest.json']) assert.equal(mapping[join(f.output,name)],`output/${name}`);
    assert.ok(!Object.keys(mapping).some(name=>name.endsWith('/pins.json')||name.endsWith('/application.bin')));
    const {rename}=await import('node:fs/promises');
    const moved=f.root+'-moved';t.after(()=>rm(moved,{recursive:true,force:true}));
    await rename(f.root,moved);
    assert.equal(hash(await readFile(join(moved,pins.BW_RENODE_RESOURCE_EXECUTABLE))),pins.BW_RENODE_SHA256);
    assert.equal(hash(await readFile(join(moved,pins.BW_RENODE_MICROPYTHON_RESOURCE_ROOT,'manifest.json'))),pins.BW_RENODE_MICROPYTHON_MANIFEST_SHA256);
});
for (const defect of ['outside runtime','outside output','symlinked output parent','unknown mode']) {
    test(`resource mode refuses ${defect} before creating support`,async t=>{
        const f=await fixture(t);let resource=f.root;
        if (defect==='outside runtime') resource=f.source;
        if (defect==='outside output') {
            const resources=join(f.root,'resources');await mkdir(resources);
            await writeFile(join(resources,'runtime'),'synthetic runtime');
            await rm(f.runtime);await symlink(join(resources,'runtime'),f.runtime);
            resource=resources;
        }
        if (defect==='symlinked output parent') {
            const outside=await mkdtemp(join(tmpdir(),'bw-outside-'));
            t.after(()=>rm(outside,{recursive:true,force:true}));
            const link=join(f.root,'escape');await symlink(outside,link);
            const result=spawnSync(process.execPath,[script.pathname,f.source,f.runtime,join(link,'output'),'--resource-root',f.root],{encoding:'utf8'});
            assert.notEqual(result.status,0);
            await assert.rejects(readFile(join(outside,'output','manifest.json')),{code:'ENOENT'});
            return;
        }
        const args=defect==='unknown mode' ? ['--ambient-root',resource] : ['--resource-root',resource];
        assert.notEqual(f.run(args).status,0);
        await assert.rejects(readFile(join(f.output,'manifest.json')),{code:'ENOENT'});
    });
}

for (const defect of ['oversized runtime','nonregular runtime']) {
    test(`refuses ${defect} before staging`,async t=>{
        const f=await fixture(t);
        if (defect==='oversized runtime') {
            const {truncate}=await import('node:fs/promises');await truncate(f.runtime,512*1024*1024+1);
        } else {await rm(f.runtime);await mkdir(f.runtime);}
        assert.notEqual(f.run().status,0);
        await assert.rejects(readFile(join(f.output,'manifest.json')),{code:'ENOENT'});
    });
}
