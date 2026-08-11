import assert from 'node:assert/strict';
import test from 'node:test';
import { bbFootprint } from '../overlay/scratch-gui/src/lib/bw-circuit-ui/interaction/breadboard-snap.js';

test('breadboard visual footprint follows full, half, and mini sizes', () => {
  assert.deepEqual(bbFootprint({ params: {} }), { w: 922, h: 310 });
  assert.deepEqual(bbFootprint({ params: { size: 'half' } }), { w: 460, h: 310 });
  assert.deepEqual(bbFootprint({ params: { size: 'mini' } }), { w: 278, h: 218 });
});
