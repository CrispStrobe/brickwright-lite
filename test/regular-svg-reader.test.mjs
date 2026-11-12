import test from 'node:test';
import assert from 'node:assert/strict';
import {readLinearSvgPath, assertRadialShape} from '../scripts/lib-regular-svg.mjs';

test('independent SVG reader handles relative/implicit coordinates, lines and transforms', () => {
    const square = readLinearSvgPath('M1,1 3,1 v2 h-2 z', [2, 0, 0, 2, 4, 6]);
    assert.deepEqual(square, [[6, 8], [10, 8], [10, 12], [6, 12]]);
    assertRadialShape(square, 4);
    assert.deepEqual(readLinearSvgPath('m1e1 0 l0 10 -10 0 0 -10 z'), [[10, 0], [10, 10], [0, 10], [0, 0]]);
});

test('reader refuses stretched geometry, curves, open paths and multiple subpaths', () => {
    assert.throws(() => assertRadialShape(readLinearSvgPath('M0 0h20v10h-20z'), 4));
    for (const path of ['M0 0L1 1', 'M0 0C1 1 2 2 3 3z', 'M0 0?L1 1z', 'M0 0L1 1z M2 2L3 3z', 'M0z']) {
        assert.throws(() => readLinearSvgPath(path));
    }
    assert.throws(() => assertRadialShape([[0, 0], [0, 0], [0, 0]], 3));
});
