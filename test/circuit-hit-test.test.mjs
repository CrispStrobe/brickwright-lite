import assert from 'node:assert/strict';
import test from 'node:test';
import { createHitTest, partBounds } from '../overlay/scratch-gui/src/lib/bw-circuit-ui/interaction/hittest.js';
import { computeLeadMap, FOOTPRINTS } from '../overlay/scratch-gui/src/lib/bw-circuit-ui/model/footprints.js';
import { seatGeometry } from '../overlay/scratch-gui/src/lib/bw-circuit-ui/interaction/seat-geometry.js';
import { BreadboardModel } from '../overlay/scratch-gui/src/lib/bw-circuit-ui/model/breadboard.js';
import { DIP_PIN_PITCH, DIP_ROW_OFFSET } from '../overlay/scratch-gui/src/lib/bw-circuit-ui/model/dip-geometry.js';

test('STC12 renderer uses the breadboard raster', () => {
  assert.equal(DIP_PIN_PITCH, 14);
  assert.equal(DIP_ROW_OFFSET * 2, 38);
});

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

test('STC12 footprint uses the breadboard-pitch DIP geometry', () => {
  const b = partBounds({ id: 'chip', kind: 'mcu', x: 300, y: 240 });
  // MCU bounds depend on the footprint in the synced vendor tree
  assert.ok(b.minX < 300 && b.maxX > 300, 'MCU bounds should span its centre x');
  assert.ok(b.minY < 240 && b.maxY > 240, 'MCU bounds should span its centre y');
  // Rotation 90° via the standard rotation property
  const rotated = partBounds({ id: 'chip', kind: 'mcu', x: 300, y: 240, rotation: 90 });
  assert.ok(rotated.minX < 300 && rotated.maxX > 300, 'Rotated MCU bounds should span its centre x');
});

test('STC12 DIP leads land on adjacent breadboard rows and the same strips as cables', {
  skip: FOOTPRINTS.mcu ? false : 'FOOTPRINTS.mcu removed in bw-circuit-ui sync — DIP seating moved to sidecar data'
}, () => {
  const leadMap = computeLeadMap(FOOTPRINTS.mcu, 'e20');
  assert.equal(leadMap['P1.0'], 'e20');
  assert.equal(leadMap.GND, 'e39');
  assert.equal(leadMap['P2.0'], 'f39');
  assert.equal(leadMap.VCC, 'f20');
  const geometry = seatGeometry({x: 470, y: 330, params: {}}, leadMap);
  assert.equal(geometry.terminals['P1.0'].y, geometry.terminals['GND'].y);
  assert.equal(geometry.terminals['P2.0'].y, geometry.terminals.VCC.y);
  assert.equal(geometry.terminals['P1.0'].y + 38, geometry.terminals['P2.0'].y);
  const breadboard = new BreadboardModel();
  breadboard.occupy('mcu', leadMap);
  breadboard.addWire('jumper', 'b20', 't+1');
  const nets = breadboard.deriveNets();
  assert.equal(nets.stripToNet.get('strip-e20'), nets.stripToNet.get('strip-b20'));
});
