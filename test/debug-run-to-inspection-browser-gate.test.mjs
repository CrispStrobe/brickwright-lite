import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source = readFileSync(new URL('../scripts/verify-debug-run-to-inspection.mjs', import.meta.url), 'utf8');

test('browser proof drives existing run-to and selected-inspection controls', () => {
    for (const selector of ['data-run-to-address', 'data-debug-record', 'data-debug-timeline-refresh',
        'data-debug-timeline-latest', 'data-debug-selected-inspection', 'data-debug-selected-registers',
        'data-debug-selected-disassembly', 'data-debug-selected-memory']) assert.ok(source.includes(selector), selector);
    assert.match(source, /dialog\.accept\(\)/);
    assert.match(source, /data-debug-phase[^]*paused/);
    assert.match(source, /instruction\\\/retire/);
});

test('browser proof is CI-friendly and always writes success or failure evidence', () => {
    assert.doesNotMatch(source, /waitForTimeout|setTimeout/);
    assert.match(source, /process\.env\.CI/);
    assert.match(source, /BW_ALLOW_LOCAL_BROWSER_PROOF/);
    assert.match(source, /process\.env\.PROOF_URL/);
    assert.match(source, /01-run-to-paused\.png/);
    assert.match(source, /02-synchronized-selected-panes\.png/);
    assert.match(source, /failure\.png/);
    assert.match(source, /report\.json/);
    assert.match(source, /diagnostics\.length > 0/);
    assert.match(source, /process\.exit\(didFail \? 1 : 0\)/);
});
