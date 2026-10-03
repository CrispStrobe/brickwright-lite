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
    const run = () => spawnSync(process.execPath, [script.pathname, source, runtime, output], {encoding: 'utf8'});
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
