// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {packageModelMode, stagePackageModels, packageModelInclude} from '../scripts/lib/spike-package-model-loading.mjs';

test('model loading defaults to source and compiled mode requires explicit closed option', () => {
    assert.equal(packageModelMode([]), 'source');
    assert.equal(packageModelMode(['--compiled-models']), 'compiled');
    for (const args of [['unknown'], ['--compiled-models', 'extra'], ['--compiled-models', '--compiled-models']]) {
        assert.throws(() => packageModelMode(args));
    }
    assert.equal(packageModelInclude('/package', 'source'), 'include @/package/models.cs\n');
    assert.equal(packageModelInclude('/package', 'compiled'), '');
    assert.throws(() => packageModelInclude('/package', 'unknown'));
});

test('compiled staging uses compiled platform API and retains unloaded model provenance', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bw-model-stage-control-'));
    try {
        await mkdir(join(root, 'tools'));
        // Synthetic external staging API: distinguish compiled platform types
        // from source aliases without a Runtime, compiler or firmware image.
        await writeFile(join(root, 'tools/stage_prime_runtime.py'), `
def stage_compiled(infrastructure, output, aggregate_display):
    assert aggregate_display is True
    output.mkdir()
    (output / 'platform.repl').write_text('compiled original types')
def stage(infrastructure, output, aggregate_display):
    assert aggregate_display is True
    output.mkdir()
    (output / 'platform.repl').write_text('source alias types')
    (output / 'models.cs').write_text('synthetic source provenance bytes')
`);
        const output = join(root, 'output');
        stagePackageModels(root, root, output, 'compiled');
        assert.equal(await readFile(join(output, 'platform.repl'), 'utf8'), 'compiled original types');
        assert.equal(await readFile(join(output, 'models.cs'), 'utf8'), 'synthetic source provenance bytes');
        // A second staging attempt must refuse rather than overwrite receipts.
        assert.throws(() => stagePackageModels(root, root, output, 'compiled'));
        assert.equal(await readFile(join(output, 'platform.repl'), 'utf8'), 'compiled original types');
    } finally { await rm(root, {recursive: true, force: true}); }
});
