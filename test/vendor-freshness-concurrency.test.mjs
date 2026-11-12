import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {assertReviewedConcurrency} from './helpers/reviewed-concurrency-projections.mjs';

const workflow = readFileSync(new URL('../.github/workflows/vendor-freshness.yml', import.meta.url), 'utf8');

test('vendor freshness uses the reviewed workflow/ref push and PR supersession policy', () => {
    assertReviewedConcurrency(workflow);
});

test('workflow concurrency rejects policy drift instead of accepting a loose cancellation match', () => {
    for (const mutation of [
        workflow.replace('concurrency:', 'unreviewed-concurrency:'),
        workflow + '\nconcurrency:\n',
        workflow.replace('concurrency:\n', 'concurrency:\n  extra-policy: true\n'),
        workflow.replace('concurrency:\n', 'concurrency:\n\n  extra-policy: true\n'),
        workflow.replace('concurrency:\n', 'concurrency:\n# comment\n\n  extra-policy: true\n'),
        workflow.replace('${{ github.workflow }}', '${{ github.run_id }}'),
        workflow.replace('${{ github.ref }}', '${{ github.sha }}'),
        workflow.replace("github.ref_type != 'tag'", "github.ref_type == 'tag'"),
        workflow.replace("github.event_name == 'push'", "github.event_name == 'schedule'"),
        workflow.replace("github.event_name == 'pull_request'", "github.event_name == 'pull_request_target'"),
    ]) assert.throws(() => assertReviewedConcurrency(mutation));
});
