import assert from 'node:assert/strict';
import test from 'node:test';
import { createHitTest, partBounds } from '../overlay/scratch-gui/src/lib/bw-circuit-ui/interaction/hittest.js';

test('breadboard bounds are selectable in model space', () => {
  const board = { id: 'bb1', kind: 'breadboard', params: {}, x: 470, y: 300 };
  const hit = createHitTest(() => [board], () => [], () => []);
  assert.equal(hit.partAt(470, 300), 'bb1');
  const b = partBounds(board);
  assert.deepEqual(b, { minX: 5, minY: 145, maxX: 935, maxY: 455 });
});

test('half and mini breadboards use the same bounds contract', () => {
  for (const size of ['half', 'mini']) {
    const board = { id: size, kind: 'breadboard', params: { size }, x: 200, y: 200 };
    const hit = createHitTest(() => [board], () => [], () => []);
    assert.equal(hit.partAt(200, 200), size);
    const b = partBounds(board);
    assert.ok(b.maxX > b.minX && b.maxY > b.minY);
  }
});

test('Arduino footprints are hittable even without rendered DOM', () => {
  for (const kind of ['arduino_uno', 'arduino_nano']) {
    const board = { id: kind, kind, x: 300, y: 240 };
    const hit = createHitTest(() => [board], () => [], () => []);
    assert.equal(hit.partAt(300, 240), kind);
  }
});

test('STC12 footprint uses the compact DIP geometry', () => {
  const b = partBounds({ id: 'chip', kind: 'mcu', x: 300, y: 240 });
  assert.deepEqual(b, { minX: 160, minY: 184.5, maxX: 440, maxY: 295.5 });
  const rotated = partBounds({ id: 'chip', kind: 'mcu', x: 300, y: 240, seat: { rot: 1 } });
  assert.deepEqual(rotated, { minX: 244.5, minY: 100, maxX: 355.5, maxY: 380 });
});
