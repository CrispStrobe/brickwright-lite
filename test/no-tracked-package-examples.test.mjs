/**
 * Gallery content has one tracked source: overlay/scratch-gui/examples.
 *
 * `packages/scratch-gui` is generated. `scripts/vendor.mjs` calls freshDir()
 * to wipe that directory before extracting upstream, so removing these
 * force-added copies changes nothing that ships. Keep the generated tree out
 * of Git so deleted overlay examples cannot survive there as orphans.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

export const trackedPackageExamples = files => files.filter(
    file => file.startsWith('packages/scratch-gui/examples/')
);

export const listTrackedPackageExamples = (repoRoot = ROOT) => {
    // Pin the command to the repository root: Git resolves a relative pathspec
    // from cwd, so an unpinned call made from test/ returns an empty success.
    // Git is deliberately the tracked-file authority under test.
    const tracked = execFileSync('git',
        ['ls-files', 'packages/scratch-gui/examples/'],
        {cwd: repoRoot, encoding: 'utf8'}).split('\n').filter(Boolean);
    return trackedPackageExamples(tracked);
};

test('no gallery example is tracked under the generated packages tree', () => {
    // Git is the authority under test. A missing or failing executable throws;
    // it cannot be mistaken for an empty successful census. gate-shapes-allow
    assert.deepEqual(listTrackedPackageExamples(), [],
        'packages/scratch-gui/examples is generated; untrack these files');
});

test('the generated-gallery gate detects a force-added path by name', () => {
    assert.deepEqual(trackedPackageExamples([
        'overlay/scratch-gui/examples/demo/program.bw',
        'packages/scratch-gui/examples/demo/program.bw'
    ]), ['packages/scratch-gui/examples/demo/program.bw']);
});

test('the Git census remains rooted when its caller starts in a subdirectory', () => {
    const repo = mkdtempSync(path.join(tmpdir(), 'bw-package-examples-gate-'));
    const nested = path.join(repo, 'test');
    const tracked = 'packages/scratch-gui/examples/demo/program.bw';
    const prior = process.cwd();
    try {
        mkdirSync(path.join(repo, path.dirname(tracked)), {recursive: true});
        mkdirSync(nested);
        writeFileSync(path.join(repo, tracked), 'demo\n');
        // The fixture needs a real index; Git is the authority this test fires.
        execFileSync('git', ['init', '-q'], {cwd: repo});
        // Force-add reproduces the exact historical ownership mistake.
        execFileSync('git', ['add', '-f', '--', tracked], {cwd: repo});
        process.chdir(nested);
        assert.deepEqual(listTrackedPackageExamples(repo), [tracked]);
    } finally {
        process.chdir(prior);
        rmSync(repo, {recursive: true, force: true});
    }
});
