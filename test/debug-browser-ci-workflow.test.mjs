import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const build = read('.github/workflows/build.yml');
const focused = read('.github/workflows/debugger.yml');
const pkg = JSON.parse(read('package.json'));

test('production browser build runs both debugger journeys and retains separate evidence', () => {
    assert.equal(pkg.scripts['verify:debug-history'], 'node scripts/verify-debug-history-browser.mjs');
    assert.equal(pkg.scripts['verify:debug-inspection'], 'node scripts/verify-debug-run-to-inspection.mjs');
    for (const evidence of [
        'PROOF_URL=http://localhost:8617/ npm run verify:debug-history',
        'PROOF_URL=http://localhost:8617/ npm run verify:debug-inspection',
        "steps.debug_history.outcome != 'skipped'",
        "steps.debug_inspection.outcome != 'skipped'",
        'artifacts/debug-history-browser/*',
        'artifacts/debug-run-to-inspection/*'
    ]) assert.ok(build.includes(evidence), `missing CI evidence: ${evidence}`);
});

test('focused debugger workflow notices browser-contract changes without duplicating browser work', () => {
    assert.ok(focused.includes("'scripts/verify-debug-*.mjs'"));
    assert.ok(focused.includes("'overlay/scratch-gui/src/components/tw-pseudocode/debug-drawer.jsx'"));
    assert.doesNotMatch(focused, /playwright install|verify:debug-history|verify:debug-inspection/);
});
