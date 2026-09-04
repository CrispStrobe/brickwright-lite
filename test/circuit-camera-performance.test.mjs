import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';

import {retainEqualPan} from '../overlay/scratch-gui/src/lib/bw-circuit-ui/interaction/transform.js';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const overlayCanvas = 'overlay/scratch-gui/src/lib/bw-circuit-ui/components/BoardCanvas.jsx';
const packageCanvas = 'packages/scratch-gui/src/lib/bw-circuit-ui/components/BoardCanvas.jsx';
const overlayTransform = 'overlay/scratch-gui/src/lib/bw-circuit-ui/interaction/transform.js';
const packageTransform = 'packages/scratch-gui/src/lib/bw-circuit-ui/interaction/transform.js';

test('idempotent fit retries retain the existing pan state reference', () => {
    const current = {x: -12.5, y: 33.25};
    assert.equal(retainEqualPan(current, {x: -12.5, y: 33.25}), current);
    const moved = {x: -12.4, y: 33.25};
    assert.equal(retainEqualPan(current, moved), moved);
});

test('fit applies zoom and pan through one React 16 update batch', () => {
    const source = read(overlayCanvas);
    assert.match(source, /import ReactDOM from 'react-dom';/);
    const applyFit = /const applyFit = React\.useCallback\(\(arr\) => \{([\s\S]*?)\n  \}, \[\]\);/.exec(source);
    assert.ok(applyFit, 'the shared fit callback remains identifiable');
    assert.match(applyFit[1], /ReactDOM\.unstable_batchedUpdates\(\(\) => \{[\s\S]*setZoom\(v\.zoom\);[\s\S]*setPan\(previous => retainEqualPan\(previous, v\.pan\)\);[\s\S]*\}\);/);
});

test('the generated package retains the camera batching contract', () => {
    assert.equal(read(packageCanvas), read(overlayCanvas));
    assert.equal(read(packageTransform), read(overlayTransform));
});
