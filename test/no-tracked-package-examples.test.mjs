/**
 * Gallery content has one tracked source: overlay/scratch-gui/examples.
 *
 * `packages/scratch-gui` is ignored and recreated by vendor + integrate. A
 * historical force-added subset survived in Git anyway: 1,529 files, including
 * 106 whose overlay counterpart had been deleted. The production build wiped
 * them before use, while a source checkout could still observe them. Do not
 * rebuild that second, deletion-blind catalogue.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

export const trackedPackageExamples = files => files.filter(
    file => file.startsWith('packages/scratch-gui/examples/')
);

test('no gallery example is tracked under the generated packages tree', () => {
    // git is the authority under test: absence or failure throws before an
    // empty set can pass. gate-shapes-allow
    const tracked = execFileSync('git', ['ls-files'], {encoding: 'utf8'})
        .split('\n').filter(Boolean);
    assert.deepEqual(trackedPackageExamples(tracked), [],
        'packages/scratch-gui/examples is generated from overlay; untrack these files');
});

test('the generated-gallery gate detects a force-added file by name', () => {
    assert.deepEqual(trackedPackageExamples([
        'overlay/scratch-gui/examples/demo/program.bw',
        'packages/scratch-gui/examples/demo/program.bw'
    ]), ['packages/scratch-gui/examples/demo/program.bw']);
});
