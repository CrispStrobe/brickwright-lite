// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, symlinkSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const publicRoot = fileURLToPath(new URL('../', import.meta.url));
const helper = new URL('../scripts/lib/private-spike-evidence.mjs', import.meta.url).href;
const run = directory => {
    const env = {...process.env}; delete env.BW_SPIKE_EVIDENCE_DIR;
    if (directory !== undefined) env.BW_SPIKE_EVIDENCE_DIR = directory;
    return spawnSync(process.execPath, ['--input-type=module', '-e',
        `const {privateSpikeEvidenceDirectory}=await import(${JSON.stringify(helper)}); privateSpikeEvidenceDirectory();`],
    {env, encoding: 'utf8'});
};
test('SPIKE captures require an explicit private output directory', () => {
    const result = run(); assert.equal(result.status, 1); assert.match(result.stderr, /Set BW_SPIKE_EVIDENCE_DIR/);
});
test('SPIKE captures reject directories inside the public checkout', () => {
    const result = run(publicRoot); assert.equal(result.status, 1); assert.match(result.stderr, /outside this public repository/);
});
test('SPIKE captures reject external symlinks pointing into the public checkout', () => {
    const temp = mkdtempSync(join(tmpdir(), 'spike-private-output-'));
    try {
        const link = join(temp, 'public-link'); symlinkSync(publicRoot, link, 'dir');
        const result = run(link); assert.equal(result.status, 1); assert.match(result.stderr, /symlink into this public repository/);
    } finally { rmSync(temp, {recursive: true, force: true}); }
});
test('SPIKE captures accept an explicitly configured external archive directory', () => {
    const temp = mkdtempSync(join(tmpdir(), 'spike-private-output-'));
    try { assert.equal(run(temp).status, 0); } finally { rmSync(temp, {recursive: true, force: true}); }
});
