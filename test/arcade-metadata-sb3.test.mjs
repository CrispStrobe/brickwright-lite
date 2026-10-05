import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import JSZip from 'jszip';
import {REPO, VM} from './helpers/bw-vm.mjs';
import {importGuiDependency} from './helpers/bw-integrated.mjs';

test('Arcade original files survive CLI conversion and a native .sb3 save/reload', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-arcade-source-'));
    const file = path.join(dir, 'game.sb3');
    const source = path.join(REPO, 'test/fixtures/makecode/arcade-assets.hex');
    const result = spawnSync(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
        path.join(REPO, 'scripts/makecode.mjs'), 'to-sb3', source, '-o', file],
    {cwd: REPO, encoding: 'utf8', timeout: 120000});
    assert.equal(result.status, 0, result.stderr);
    const original = JSON.parse(await (await JSZip.loadAsync(fs.readFileSync(file)))
        .file('project.json').async('string'));
    assert.equal(original.bwMakeCode.version, 1);
    assert.equal(original.bwMakeCode.target, 'arcade');
    assert.match(original.bwMakeCode.files['main.ts'], /sprites\.create/);

    const Storage = (await importGuiDependency('scratch-storage/dist/node/scratch-storage.js')).default;
    const vm = new VM();
    vm.attachStorage(new Storage());
    try {
        await vm.loadProject(fs.readFileSync(file));
        assert.equal(vm.runtime.bwMakeCode.files['main.ts'], original.bwMakeCode.files['main.ts']);
        const saved = await vm.saveProjectSb3();
        const after = JSON.parse(await (await JSZip.loadAsync(await saved.arrayBuffer()))
            .file('project.json').async('string'));
        assert.deepEqual(after.bwMakeCode, original.bwMakeCode);
    } finally {
        vm.quit();
        fs.rmSync(dir, {recursive: true, force: true});
    }
});
