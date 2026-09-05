import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/build.yml', import.meta.url), 'utf8');
const gate = readFileSync(new URL(
    '../scripts/verify-list-monitor-virtualization.mjs', import.meta.url), 'utf8');

test('the large-list browser proof is served by the build workflow', () => {
    assert.match(workflow,
        /name: Browser gate — a 1,000-row Scratch list stays virtualized and editable\n+\s+id: list_virtualization\n+\s+if: \$\{\{ !cancelled\(\) && steps\.serve\.outcome == 'success' \}\}\n+\s+run: PROOF_URL=http:\/\/localhost:8617\/ node scripts\/verify-list-monitor-virtualization\.mjs/);
    assert.match(workflow,
        /if: always\(\) && steps\.list_virtualization\.outcome != 'skipped'\n+\s+with:\n+\s+name: list-monitor-virtualization-proof/);
});

test('the browser proof owns the large-list and mutation seams', () => {
    assert.match(gate, /const ROW_COUNT = 1000;/);
    assert.match(gate, /\.ReactVirtualized__List/);
    assert.match(gate, /edited-row-1000/);
    assert.match(gate, /dispatchEvent\('mousedown'\)/);
});
