// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';

export function packageModelMode (options) {
    if (options.length === 0) return 'source';
    if (options.length === 1 && options[0] === '--compiled-models') return 'compiled';
    throw new Error('Expected only optional --compiled-models');
}

export function stagePackageModels (runtime, infrastructure, output, mode) {
    if (!['source', 'compiled'].includes(mode)) throw new Error('Unknown model loading mode');
    const script = join(runtime, 'tools/stage_prime_runtime.py');
    const args = mode === 'source' ? [script, '--infrastructure', infrastructure,
        '--output', output, '--aggregate-display-clock'] : ['-c', `
import importlib.util, pathlib, shutil, sys, tempfile
script, infrastructure, output = map(pathlib.Path, sys.argv[1:])
spec = importlib.util.spec_from_file_location('brickwright_stage', script)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module.stage_compiled(infrastructure, output, True)
# Retain the source bundle and its notices for provenance/manifest verification.
# The compiled profile never loads this bundle into the already compiled Runtime.
with tempfile.TemporaryDirectory(prefix='bw-model-source-') as temporary:
    source = pathlib.Path(temporary) / 'source'
    module.stage(infrastructure, source, True)
    shutil.copyfile(source / 'models.cs', output / 'models.cs')
`, script, infrastructure, output];
    const result = spawnSync('python3', args, {stdio: 'inherit'});
    if (result.status !== 0) throw new Error('Prime model staging failed');
}

export function packageModelInclude (output, mode) {
    if (mode === 'compiled') return '';
    if (mode === 'source') return `include @${join(output, 'models.cs')}\n`;
    throw new Error('Unknown model loading mode');
}
