import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(new URL('../.github/workflows/vendor-freshness.yml', import.meta.url), 'utf8');
const concurrency = /^concurrency:\n(?<body>(?:  .+\n)+)/m.exec(workflow)?.groups.body ?? '';

test('vendor freshness preserves every non-PR verdict while superseding stale PR commits', () => {
    assert.ok(concurrency, 'vendor-freshness.yml has no top-level concurrency block');
    assert.match(concurrency, /group:.*github\.event_name\s*==\s*'pull_request'.*github\.event\.pull_request\.number.*github\.run_id/,
        'non-PR vendor runs need a unique run-id group; a shared ref/sha group replaces pending verdicts');
    assert.doesNotMatch(concurrency, /github\.ref/,
        'grouping push runs by ref recreates the measured pending-run starvation');
    assert.match(concurrency,
        /cancel-in-progress:\s*\$\{\{\s*github\.event_name\s*==\s*'pull_request'\s*\}\}/,
        'only superseded pull-request runs may be cancelled');
});
