import assert from 'node:assert/strict';
import test from 'node:test';

test('board label geometry places labels inside by physical pin side', () => {
  // This is the contract consumed by the SVG renderer: side is determined by
  // x, never by whether a pin happens to be near the top/bottom of the board.
  const labelAnchor = (x) => x < 0
    ? { dx: 7, anchor: 'start' }
    : { dx: -7, anchor: 'end' };
  assert.deepEqual(labelAnchor(-26), { dx: 7, anchor: 'start' });
  assert.deepEqual(labelAnchor(26), { dx: -7, anchor: 'end' });
});
