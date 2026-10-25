// SPDX-License-Identifier: BSD-3-Clause
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const script = fileURLToPath(new URL('../scripts/verify-sim-physics.mjs', import.meta.url));
const run = (args, cwd) => spawnSync(process.execPath, [script, ...args],
    {cwd, encoding: 'utf8', timeout: 45000});

test('headless command drives the real reference model and physics worker from another directory', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'sim-physics-cli-'));
    try {
        const result = run([], cwd);
        assert.equal(result.error, undefined);
        assert.equal(result.status, 0, result.stderr);
        const report = JSON.parse(result.stdout);
        assert.equal(report.status, 'passed');
        assert.deepEqual(report.diagnostics, []);
        assert.ok(report.drive.forwardMetres > 0.3);
        assert.ok(report.drive.encoderA < 0 && report.drive.encoderB > 0);
        assert.equal(report.worker.seconds, 0.5);
        assert.equal(report.worker.measuredJointAngles.length, 2);
        assert.ok(report.worker.measuredJointAngles.every(angle => Math.abs(angle) > 0.1));
        assert.ok(Number.isFinite(report.elapsedMs) && report.elapsedMs > 0);
    } finally { rmSync(cwd, {recursive: true, force: true}); }
});

test('headless command refuses an unknown part instead of reporting a partial physical run', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'sim-physics-refused-'));
    try {
        const model = join(cwd, 'unknown.ldr');
        writeFileSync(model, '1 71 0 0 0 1 0 0 0 1 0 0 0 1 missing-part.dat\n');
        const result = run(['--model', model], cwd);
        assert.equal(result.error, undefined);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /LDraw refused:.*unknown-part/);
        assert.equal(result.stdout, '', 'a refusal must not print a successful measurement');
    } finally { rmSync(cwd, {recursive: true, force: true}); }
});

test('headless command rejects unknown or incomplete options', () => {
    for (const args of [['--model'], ['--unknown'], ['--model', 'model.ldr', 'extra']]) {
        const result = run(args, tmpdir());
        assert.equal(result.error, undefined);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /Usage: node scripts\/verify-sim-physics\.mjs/);
        assert.equal(result.stdout, '');
    }
});
