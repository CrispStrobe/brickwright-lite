/**
 * Task F10 of docs/OPEN-TASKS-2026-09-29.md -- an imported MakeCode project
 * keeps its own files in the saved .sb3, marked stale once the program changes
 * (owner decision 2026-10-12).
 *
 * The parked WIP stored the files (`bwMakeCode`, version 1) and nothing more,
 * so after any edit they described a different program. Here the record carries
 * a fingerprint of the program it was imported as (blocks, names, assets --
 * not positions, not runtime state), taken by the VM at the first load, and
 * every export uses the original only while the fingerprint still matches.
 *
 * Re-ported from the WIP's test of the same name (CLI to-sb3, then a native
 * save/reload keeps the files), plus: running the game does not make it stale;
 * editing a block does, and the CLI export then comes from the blocks.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import JSZip from 'jszip';
import {REPO, VM, stepFrames} from './helpers/bw-vm.mjs';
import {importGuiDependency} from './helpers/bw-integrated.mjs';

const original = createRequire(import.meta.url)(
    path.join(REPO, 'overlay/scratch-vm/src/serialization/bw-makecode-original.js'));
const CLI = path.join(REPO, 'scripts/makecode.mjs');
const run = (...args) => spawnSync(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', CLI, ...args],
    {cwd: REPO, encoding: 'utf8', timeout: 180000});
const projectJson = async bytes => JSON.parse(await (await JSZip.loadAsync(bytes)).file('project.json').async('string'));

async function savedProject (vm) {
    return new Uint8Array(await (await vm.saveProjectSb3()).arrayBuffer());
}

test('the fingerprint is over the program, not where blocks sit or what the game did', () => {
    const json = {targets: [{name: 'Stage', isStage: true, blocks: {}, variables: {v1: ['score', 0]}, lists: {}, broadcasts: {},
        costumes: [{name: 'bg', assetId: 'a1', dataFormat: 'svg'}], sounds: []},
    {name: 'hero', isStage: false, x: 0, y: 0, variables: {}, lists: {}, broadcasts: {}, costumes: [], sounds: [],
        blocks: {b1: {opcode: 'event_whenflagclicked', next: 'b2', parent: null, inputs: {}, fields: {}, topLevel: true, x: 10, y: 20},
            b2: {opcode: 'motion_movesteps', next: null, parent: 'b1', inputs: {STEPS: [1, [4, '10']]}, fields: {}, topLevel: false}}}],
    extensions: []};
    const fp = original.fingerprint(json);
    const moved = structuredClone(json);
    moved.targets[1].blocks.b1.x = 300;                 // dragged
    moved.targets[1].x = 120;                           // the game moved the sprite
    moved.targets[0].variables.v1[1] = 42;              // and changed the score
    assert.equal(original.fingerprint(moved), fp, 'positions and runtime state are not the program');
    const edited = structuredClone(json);
    edited.targets[1].blocks.b2.inputs.STEPS = [1, [4, '11']];
    assert.notEqual(original.fingerprint(edited), fp, 'a changed block input is');
    const renamed = structuredClone(json);
    renamed.targets[0].variables.v1[0] = 'points';
    assert.notEqual(original.fingerprint(renamed), fp, 'a renamed variable is');
});

test('Arcade original files survive CLI conversion and a native .sb3 save/reload, fingerprinted at the first load', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-arcade-source-'));
    const file = path.join(dir, 'game.sb3');
    const result = run('to-sb3', path.join(REPO, 'test/fixtures/makecode/arcade-assets.hex'), '-o', file);
    assert.equal(result.status, 0, result.stderr);
    const imported = await projectJson(fs.readFileSync(file));
    assert.equal(imported.bwMakeCode.version, 2);
    assert.equal(imported.bwMakeCode.target, 'arcade');
    assert.match(imported.bwMakeCode.files['main.ts'], /sprites\.create/);
    assert.equal(imported.bwMakeCode.fingerprint, null, 'the importer cannot fingerprint the VM\'s serialization');

    const Storage = (await importGuiDependency('scratch-storage/dist/node/scratch-storage.js')).default;
    const vm = new VM();
    vm.attachStorage(new Storage());
    try {
        await vm.loadProject(fs.readFileSync(file));
        assert.equal(vm.runtime.bwMakeCode.files['main.ts'], imported.bwMakeCode.files['main.ts']);
        assert.match(vm.runtime.bwMakeCode.fingerprint, /^[0-9a-f]{16}$/, 'fingerprinted by the first load');
        const saved = await projectJson(await savedProject(vm));
        assert.deepEqual(saved.bwMakeCode.files, imported.bwMakeCode.files);
        assert.equal(original.original(saved).status, 'current');

        // Running the game is not an edit.
        vm.start();
        vm.greenFlag();
        await stepFrames(vm, 30);
        vm.stopAll();
        assert.equal(original.original(JSON.parse(vm.toJSON())).status, 'current', 'still current after a run');

        // A saved, unchanged project exports the original files.
        const unchanged = path.join(dir, 'unchanged.sb3');
        fs.writeFileSync(unchanged, await savedProject(vm));
        const ts = path.join(dir, 'unchanged.ts');
        const out = run('to-ts', unchanged, '-o', ts, '--target', 'arcade');
        assert.equal(out.status, 0, out.stderr);
        assert.equal(fs.readFileSync(ts, 'utf8'), imported.bwMakeCode.files['main.ts'], 'the original main.ts, byte for byte');
    } finally {
        vm.quit();
        fs.rmSync(dir, {recursive: true, force: true});
    }
});

test('an edited project keeps the original for reference, marked stale, and exports from the blocks', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-arcade-stale-'));
    const file = path.join(dir, 'game.sb3');
    assert.equal(run('to-sb3', path.join(REPO, 'test/fixtures/makecode/arcade-assets.hex'), '-o', file).status, 0);
    const Storage = (await importGuiDependency('scratch-storage/dist/node/scratch-storage.js')).default;
    const vm = new VM();
    vm.attachStorage(new Storage());
    try {
        await vm.loadProject(fs.readFileSync(file));
        // Edit the program: delete one script's top block.
        const sprite = vm.runtime.targets.find(t => !t.isStage && Object.keys(t.blocks._blocks).length);
        assert.ok(sprite, 'a sprite with scripts');
        const top = Object.values(sprite.blocks._blocks).find(b => b.topLevel);
        sprite.blocks.deleteBlock(top.id);
        const saved = await savedProject(vm);
        const json = await projectJson(saved);
        assert.equal(original.original(json).status, 'stale');
        assert.ok(json.bwMakeCode.files['main.ts'], 'kept for reference');

        const stale = path.join(dir, 'stale.sb3');
        fs.writeFileSync(stale, saved);
        const ts = path.join(dir, 'stale.ts');
        const out = run('to-ts', stale, '-o', ts, '--target', 'arcade');
        assert.equal(out.status, 0, out.stderr);
        assert.match(out.stderr, /no longer matches this program/);
        assert.notEqual(fs.readFileSync(ts, 'utf8'), json.bwMakeCode.files['main.ts'], 'regenerated from the blocks');
    } finally {
        vm.quit();
        fs.rmSync(dir, {recursive: true, force: true});
    }
});

test('the Code tab records the original only for an unedited import, and its exports ask whether it is current', () => {
    const src = fs.readFileSync(path.join(REPO, 'overlay/scratch-gui/src/components/tw-pseudocode/pseudocode-importer.jsx'), 'utf8');
    assert.match(src, /import makeCodeOriginal from 'scratch-vm\/src\/serialization\/bw-makecode-original\.js';/);
    assert.match(src, /source === this\._makeCodeImportedCode\) \{\s*creator\.project\.bwMakeCode = makeCodeOriginal\.record\(/,
        'a build of edited code must not carry files that describe the import');
    assert.match(src, /this\._makeCodeImportedCode = res\.kind === 'makecode' && res\.lang === 'pseudocode' \? res\.code : null;/);
    const subject = src.slice(src.indexOf('    async makeCodeSubject () {'), src.indexOf('    makeCodeRunOffered ('));
    assert.match(subject, /original\.status === 'current'\) return \{files: original\.files/);
    assert.match(subject, /original\.status !== 'stale'\) return imported;/, 'a stale import never stands in for the program');
    const arcade = src.slice(src.indexOf('    async exportArcade () {'), src.indexOf('    async exportMakeCodeSource () {'));
    assert.match(arcade, /original\.status === 'current' && original\.target === 'arcade' \?/);
});
