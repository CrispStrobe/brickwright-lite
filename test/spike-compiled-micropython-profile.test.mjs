// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, rm, access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync, spawnSync} from 'node:child_process';

const prepare = new URL('../scripts/prepare-spike-micropython-pins.mjs', import.meta.url).pathname;
const assemble = new URL('../scripts/prepare-spike-compiled-micropython-support.mjs', import.meta.url).pathname;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const names = ['models.cs', 'program-uart.cs', 'boot-seed.bin',
    'platforms/boards/spike-prime.repl', 'platforms/boards/spike-prime-brick-devices.repl',
    'platforms/cpus/stm32f413vg.repl', 'platforms/cpus/stm32f4.repl',
    'scripts/spike-state-server.py', 'tools/spike_state_monitor_protocol.py',
    'tools/ev3_state_observer.py', 'tools/spike_arena_inputs.py', 'tools/spike_arena_mailbox.py',
    'tools/spike_nuttx_mailbox.py', 'tools/spike_program_uart.py',
    'licenses/renode-models-MIT.txt', 'licenses/brickwright-BSD-3-Clause.txt'];
async function fixture(t) {
    const root = await mkdtemp(join(tmpdir(), 'bw-compiled-micro-'));
    t.after(() => rm(root, {recursive: true, force: true}));
    const source = join(root, 'support'), repo = join(root, 'public-source'), runtime = join(root, 'renode');
    await mkdir(source); await mkdir(repo); await writeFile(runtime, 'synthetic executable, never run');
    const manifest = {};
    for (const name of names) {
        const bytes = name === 'boot-seed.bin' ? Buffer.alloc(65536) : Buffer.from(`retained ${name}`);
        await mkdir(dirname(join(source, name)), {recursive: true});
        await writeFile(join(source, name), bytes); manifest[name] = hash(bytes);
    }
    const save = () => writeFile(join(source, 'manifest.json'), JSON.stringify(manifest));
    await save();
    const modelCommit = '1'.repeat(40);
    for (const name of [...names.filter(name => name.startsWith('platforms/')), 'tools/stage_prime_micropython.py']) {
        let text = '// synthetic native platform\ncompiled: Native.PrimeModel\n';
        if (name.endsWith('stm32f413vg.repl')) text += '    PerformanceInMips: 96\n    systickFrequency: 96000000\n    frequency: 96000000\n';
        if (name.endsWith('/spike-prime.repl')) text += 'spi2:\n    DMAReceive -> dma1@3\n';
        if (name.endsWith('.py')) text = `INFRASTRUCTURE_COMMIT = "${modelCommit}"\n`;
        await mkdir(dirname(join(repo, name)), {recursive: true}); await writeFile(join(repo, name), text);
    }
    const git = args => execFileSync('git', ['-C', repo, ...args], {encoding: 'utf8'}).trim();
    git(['init', '--quiet']); git(['add', '.']);
    git(['-c', 'user.name=Profile fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'Synthetic platforms']);
    const platformCommit = git(['rev-parse', 'HEAD']);
    const output = join(root, 'compiled'), frozen = join(root, 'frozen');
    const run = (model = modelCommit, commit = platformCommit) => spawnSync(process.execPath,
        [assemble, source, repo, commit, model, runtime, output], {encoding: 'utf8'});
    const freeze = () => spawnSync(process.execPath, [prepare, output, runtime, frozen, '--resource-root', root], {encoding: 'utf8'});
    return {root, source, repo, runtime, manifest, save, platformCommit, modelCommit, output, frozen, run, freeze};
}

test('compiled profile replaces platform aliases, preserves support/attribution, and freezes an explicit native pin', async t => {
    const f = await fixture(t);
    await writeFile(join(f.source, 'application.bin'), 'not a package input');
    // Dirty working files cannot replace the explicitly selected commit.
    await writeFile(join(f.repo, 'platforms/boards/spike-prime.repl'), 'uncommitted unwanted platform');
    assert.equal(f.run().status, 0);
    const board = await readFile(join(f.output, 'platforms/boards/spike-prime.repl'), 'utf8');
    assert.match(board, /Native\.PrimeModel/); assert.match(board, /frequency: 50000000\n    bufferCapacity: 1/);
    const clock = await readFile(join(f.output, 'platforms/cpus/stm32f413vg.repl'), 'utf8');
    assert.match(clock, /PerformanceInMips: 100/); assert.match(clock, /systickFrequency: 100000000/);
    assert.doesNotMatch(clock, /96000000/);
    for (const name of names.filter(name => !name.startsWith('platforms/'))) {
        assert.equal(hash(await readFile(join(f.output, name))), f.manifest[name]);
    }
    await assert.rejects(access(join(f.output, 'application.bin')), {code: 'ENOENT'});
    assert.equal(f.freeze().status, 0);
    const pins = JSON.parse(await readFile(join(f.frozen, 'pins.json')));
    assert.equal(pins.BW_RENODE_MICROPYTHON_PROFILE_SHA256, hash(await readFile(join(f.output, 'profile.json'))));
    assert.equal(pins.BW_RENODE_SHA256, hash(await readFile(f.runtime)));
    const map = JSON.parse(await readFile(join(f.frozen, 'tauri-support-resources.json'))).bundle.resources;
    assert.equal(Object.keys(map).length, 18);
    assert.equal(map[join(f.frozen, 'profile.json')], 'frozen/profile.json');
});

for (const defect of ['runtime mismatch', 'wrong kind', 'unknown field', 'invalid model commit', 'wrong version', 'descriptor corruption', 'unlisted descriptor']) {
    test(`compiled admission rejects ${defect} before freezing output`, async t => {
        const f = await fixture(t); assert.equal(f.run().status, 0);
        const profilePath = join(f.output, 'profile.json');
        const profile = JSON.parse(await readFile(profilePath));
        if (defect === 'runtime mismatch') await writeFile(f.runtime, 'other executable');
        if (defect === 'wrong kind') profile.kind = 'source-overlay';
        if (defect === 'unknown field') profile.includeModels = true;
        if (defect === 'invalid model commit') profile.modelContractCommit = '../main';
        if (defect === 'wrong version') profile.schemaVersion = 2;
        const data = JSON.stringify(profile); await writeFile(profilePath, data);
        const manifest = JSON.parse(await readFile(join(f.output, 'manifest.json')));
        if (defect === 'unlisted descriptor') delete manifest['profile.json'];
        else if (defect !== 'descriptor corruption') manifest['profile.json'] = hash(data);
        await writeFile(join(f.output, 'manifest.json'), JSON.stringify(manifest));
        // An unlisted descriptor must not silently select legacy mode.
        assert.notEqual(f.freeze().status, 0);
        await assert.rejects(access(f.frozen), {code: 'ENOENT'});
    });
}

test('assembly rejects a different model contract and unavailable commit without output', async t => {
    const f = await fixture(t);
    assert.notEqual(f.run('2'.repeat(40)).status, 0);
    assert.notEqual(f.run(f.modelCommit, '3'.repeat(40)).status, 0);
    await assert.rejects(access(f.output), {code: 'ENOENT'});
});

test('assembly preserves an existing output and refuses corrupt retained inputs', async t => {
    const f = await fixture(t); await mkdir(f.output); await writeFile(join(f.output, 'owned.txt'), 'preserve');
    assert.notEqual(f.run().status, 0); assert.equal(await readFile(join(f.output, 'owned.txt'), 'utf8'), 'preserve');
    await rm(f.output, {recursive: true}); await writeFile(join(f.source, 'models.cs'), 'corrupt');
    assert.notEqual(f.run().status, 0); await assert.rejects(access(f.output), {code: 'ENOENT'});
});
