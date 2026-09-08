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

export const trackedPackageExamples = files => files.filter(
    file => file.startsWith('packages/scratch-gui/examples/')
);

test('no gallery example is tracked under the generated packages tree', () => {
    // Git is the authority under test. A missing or failing executable throws;
    // it cannot be mistaken for an empty successful census. gate-shapes-allow
    const tracked = execFileSync('git',
        ['ls-files', 'packages/scratch-gui/examples/'], {encoding: 'utf8'})
        .split('\n').filter(Boolean);
    assert.deepEqual(trackedPackageExamples(tracked), [],
        'packages/scratch-gui/examples is generated; untrack these files');
});

test('the generated-gallery gate detects a force-added path by name', () => {
    assert.deepEqual(trackedPackageExamples([
        'overlay/scratch-gui/examples/demo/program.bw',
        'packages/scratch-gui/examples/demo/program.bw'
    ]), ['packages/scratch-gui/examples/demo/program.bw']);
});
