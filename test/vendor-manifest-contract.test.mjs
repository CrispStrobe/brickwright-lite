import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';

test('circuit UI sync preserves the manifest that guards local divergence', () => {
    const script = readFileSync('scripts/sync-bw-circuit-ui.mjs', 'utf8');
    assert.match(script, /const KEEP = new Set\(\[[^\]]*'\.vendor-manifest\.json'/,
        'sync cleanup must not delete the manifest it just wrote');
    assert.ok(existsSync('overlay/scratch-gui/src/lib/bw-circuit-ui/.vendor-manifest.json'),
        'the current vendored tree includes its divergence manifest');
});
