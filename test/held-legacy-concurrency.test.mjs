import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {assertHeldLegacyConcurrency, heldLegacyPolicy, modelWorkflowBeforeHeldLegacyConcurrency}
    from './helpers/held-legacy-concurrency.mjs';

for (const name of ['model-measurements', 'cycle-core-qualification']) {
    test(`${name}: only the exact held concurrency mapping is admitted`, () => {
        const source = readFileSync(new URL(`../.github/workflows/${name}.yml`, import.meta.url), 'utf8');
        assertHeldLegacyConcurrency(source);
        for (const changed of [
            source.replace('concurrency:', 'unreviewed-concurrency:'),
            source.replace('concurrency:', '  concurrency:'),
            source + '\nconcurrency:\n',
            source + '\n  concurrency:\n',
            source.replace('concurrency:\n', 'concurrency:\n  extra-policy: true\n'),
            source.replace(heldLegacyPolicy, heldLegacyPolicy + '\n  extra-policy: true\n'),
            source.replace(heldLegacyPolicy, heldLegacyPolicy + '\n# continuation\n\n  extra-policy: true\n'),
            source.replace('${{ github.workflow }}', 'other-workflow'),
            source.replace('${{ github.ref }}', '${{ github.sha }}'),
            source.replace('${{ github.ref }}', '${{ github.run_id }}'),
            source.replace('${{ github.ref }}', "${{ github.ref }}${{ format('-manual-{0}', github.run_id) }}"),
            source.replace("github.ref_type != 'tag'", "github.ref_type == 'tag'"),
            source.replace("github.event_name == 'push'", "github.event_name == 'workflow_dispatch'"),
            source.replace("github.event_name == 'pull_request'", "github.event_name == 'pull_request_target'"),
            source.replace(/^  cancel-in-progress:.*$/m, '  cancel-in-progress: true'),
            source.replace(/^  cancel-in-progress:.*$/m, '  cancel-in-progress: false'),
        ]) {
            assert.notEqual(changed, source, 'every counterfactual changes actual held source');
            assert.throws(() => assertHeldLegacyConcurrency(changed), 'held policy drift refuses');
        }
    });
}

test('held model projection preserves every unrelated template byte and its original insertion boundary', () => {
    const source = readFileSync(new URL('../.github/workflows/model-measurements.yml', import.meta.url), 'utf8');
    const template = readFileSync(new URL('../tools/model-api/worker-workflow.yml', import.meta.url), 'utf8');
    assert.equal(modelWorkflowBeforeHeldLegacyConcurrency(source), template);
    for (const change of [
        s => s.replace('contents: read', 'contents: write'),
        s => s.replace('persist-credentials: false', 'persist-credentials: true'),
        s => s.replace('--network=none', '--network=host'),
        s => s.replace('retention-days: 1', 'retention-days: 2'),
        s => s + '# unrelated drift\n',
    ]) {
        const changed = change(source);
        assert.notEqual(changed, source);
        assert.notEqual(modelWorkflowBeforeHeldLegacyConcurrency(changed), template);
    }
    const without = source.replace(heldLegacyPolicy + '\n', '');
    const moved = heldLegacyPolicy + '\n' + without;
    assertHeldLegacyConcurrency(moved);
    assert.throws(() => modelWorkflowBeforeHeldLegacyConcurrency(moved), 'relocated policy refuses projection');
});
