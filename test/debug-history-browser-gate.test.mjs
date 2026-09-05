import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

const script = readFileSync(join(import.meta.dirname, '..',
    'scripts/verify-debug-history-browser.mjs'), 'utf8');

test('CI-only browser gate proves record, checkpoint, reverse and automatic fork evidence', () => {
    for (const evidence of [
        'process.env.CI', 'BW_ALLOW_LOCAL_BROWSER_PROOF', 'data-debug-record',
        'data-debug-checkpoint', 'data-debug-restore', 'data-debug-reverse-step',
        "snap('checkpoint')", "snap('reversed')", "snap('forked')",
        'active child recording', 'report.json', 'diagnostics.length === 0'
    ]) assert.ok(script.includes(evidence), `missing browser proof evidence: ${evidence}`);
    assert.doesNotMatch(script, /waitForTimeout|setTimeout/,
        'the CI journey must poll observable state, never sleep a guessed duration');
    assert.match(script, /process\.exit\(failed \? 1 : 0\)/,
        'missing evidence and browser diagnostics must fail the CI process');
});
