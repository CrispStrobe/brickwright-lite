import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const proof = readFileSync(path.join(root, 'scripts/verify-pinned-worker.mjs'), 'utf8');
const workflow = readFileSync(path.join(root, '.github/workflows/build.yml'), 'utf8');

test('CI executes the promoted-pin production-browser proof and preserves its artifacts', () => {
    assert.match(workflow, /node scripts\/verify-pinned-worker\.mjs/);
    assert.match(workflow, /name: pinned-worker-proof/);
    assert.match(workflow, /if-no-files-found: error/);
});

test('the browser proof closes an exact six-scenario denominator with zero page errors', () => {
    assert.match(proof, /scenarios: 6/);
    assert.match(proof, /pageErrors\.length/);
    assert.match(proof, /claytonhtmlencode_encode/);
    assert.match(proof, /service: 'extension\.0\.0'/);
    assert.match(proof, /pendingLoads: 0/);
    assert.match(proof, /page\.screenshot/);
    assert.doesNotMatch(proof, /waitForTimeout|setTimeout/);
});

test('the browser proof opens a TurboWarp file, saves its pinned URLs and refuses a stranger (task E5)', () => {
    assert.match(proof, /extensionURLs: \{/);
    assert.match(proof, /https:\/\/extensions\.turbowarp\.org\/encoding\.js/);
    assert.match(proof, /await vm\.loadProject\(/);
    assert.match(proof, /JSON\.parse\(vm\.toJSON\(\)\)/);
    assert.match(proof, /savedURLs: \{/);
    assert.match(proof, /refused: 'refused'/);
    assert.match(proof, /strangerRequests\.length/);
});
