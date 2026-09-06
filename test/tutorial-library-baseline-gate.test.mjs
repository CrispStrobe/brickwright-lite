import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const gate = readFileSync(new URL('../scripts/verify-tutorial-library-lazy.mjs', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../.github/workflows/build.yml', import.meta.url), 'utf8');

test('tutorial baseline gate preserves five cold same-probe samples and both deep links', () => {
    assert.match(gate, /brickwright\/tutorial-library-lazy\/v1/);
    assert.match(gate, /const repetitions = 5/);
    assert.match(gate, /serviceWorkers: 'block'/);
    assert.match(gate, /context\.route\('\*\*\/\*'/);
    assert.match(gate, /tutorial=getStarted/);
    assert.match(gate, /tutorial=all/);
    assert.match(gate, /median\(samples\.map/);
    assert.match(gate, /absoluteLimitMs = 1000/);
    assert.match(gate, /maxLongTaskMs = 100/);
    assert.match(gate, /PerformanceObserver/);
    assert.match(gate, /finally \{/);
    assert.match(gate, /process\.once\('SIGTERM'/);
    assert.match(gate, /if \(image\.complete\) return image\.naturalWidth > 0/);
    assert.equal(gate.match(/await waitForCard\(session\.page, DECK_ID, 1\);/g)?.length, 1,
        'next waits for the second card exactly once');
});

test('baseline mode records topology red and skips impossible failure cases without awaiting them', () => {
    assert.match(gate, /TUTORIAL_LIBRARY_EAGER_BASELINE/);
    assert.match(gate, /the tutorial body has the candidate named-chunk topology/);
    assert.match(gate, /if \(eagerBaseline\) \{[\s\S]*failureRetry = \{skipped: true/);
    assert.match(gate, /staleClose = \{skipped: true/);
    assert.match(gate, /eager baseline has no tutorial chunk request to abort/);
    assert.match(gate, /\/chunks\\\/tutorial-library\\\.js/);
});

test('candidate branch of the same gate specifies dedupe, retry and stale-close evidence', () => {
    assert.match(gate, /card-to-library reopening deduplicates/);
    assert.match(gate, /tutorial-library-retry/);
    assert.match(gate, /session\.chunkRequests\.length === 2/);
    assert.match(gate, /tutorial-library-loading/);
    assert.match(gate, /tutorial-library-cancel/);
    assert.match(gate, /prevents stale completion from reopening tutorial UI/);
});

test('workflow runs the bounded baseline on light and always preserves its artifact', () => {
    const start = workflow.indexOf('- name: Browser gate — tutorial decks and cards load on demand and retry');
    assert.ok(start > 0, 'tutorial gate step exists');
    const block = workflow.slice(start, workflow.indexOf('\n      - name:', start + 10));
    assert.match(block, /id: tutorial_library_lazy/);
    assert.match(block, /timeout-minutes: 3/);
    assert.match(block, /matrix\.shard == 'light'/);
    assert.match(block, /timeout --signal=TERM --kill-after=10s 2m/);
    assert.match(block, /TUTORIAL_LIBRARY_EAGER_BASELINE=1/);
    assert.match(block, /verify-tutorial-library-lazy\.mjs/);
    assert.match(block, /if: always\(\) && steps\.tutorial_library_lazy\.outcome != 'skipped' && matrix\.shard == 'light'/);
    assert.match(block, /name: tutorial-library-lazy-proof/);
    assert.match(block, /path: artifacts\/tutorial-library-lazy\/\*/);
    assert.match(block, /if-no-files-found: error/);
});
