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
    // THE SIGNATURE AND THE DEP ARRAY ARE NOT THE CLAIM. This required
    // exactly `(arr) => {` and `}, []);`, and `perf(react): attribute circuit
    // update sources` (20a7832da) legitimately made it
    // `(arr, reason = 'programmatic')` with `[performanceProbe]`. The batching
    // contract below -- one React update for both zoom and pan -- was
    // untouched, and lite's suite went red for a parameter name.
    //
    // Same species as the browser gate's false red an hour earlier
    // (GATES-THAT-CANNOT-FAIL 1, running backwards): a source-text match that
    // tracks SPELLING rather than behaviour. A red everyone learns to explain
    // away is how a real one hides, so the match is now on what is asserted --
    // that the callback exists and what its body does -- and not on how it is
    // parameterised or what it depends on.
    const applyFit = /const applyFit = React\.useCallback\(\(arr[^)]*\) => \{([\s\S]*?)\n  \}, \[[^\]]*\]\);/.exec(source);
    assert.ok(applyFit, 'the shared fit callback remains identifiable');
    assert.match(applyFit[1], /ReactDOM\.unstable_batchedUpdates\(\(\) => \{[\s\S]*setZoom\(v\.zoom\);[\s\S]*setPan\(previous => retainEqualPan\(previous, v\.pan\)\);[\s\S]*\}\);/);
});

test('the generated package retains the camera batching contract', () => {
    assert.equal(read(packageCanvas), read(overlayCanvas));
    assert.equal(read(packageTransform), read(overlayTransform));
});
