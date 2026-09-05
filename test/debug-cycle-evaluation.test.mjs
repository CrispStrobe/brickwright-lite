import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const evaluation = readFileSync(new URL('../docs/CYCLE-ACCURATE-CORE-EVALUATION.md', import.meta.url), 'utf8');

test('cycle-core decisions are pinned, fidelity-gated, and assigned to hosted CI', () => {
    for (const evidence of [
        'ca7d7ddd3ba77b48685d24120cf413ea53786767',
        'b6cc506e7c2f7b2b14cce6e98d0463467eb8c4d6',
        '294a2c4ab2c35ed13e79642046ab8865c98e9317',
        'aea84484abc79d09639d855b7b0ab32bc9e4dbeb',
        'mid-instruction', 'GitHub Actions', 'never silently fall back'
    ]) assert.ok(evaluation.includes(evidence), `missing cycle evaluation evidence: ${evidence}`);
    assert.match(evaluation, /do not vendor the whole machine now/i);
    assert.match(evaluation, /keep cycle\/reverse-cycle controls unavailable/i);
});
