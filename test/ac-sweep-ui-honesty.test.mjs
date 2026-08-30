import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { BoardImpl } from '../overlay/scratch-gui/src/lib/bw-board/board.js';
import { createSweepRun, netlistOf } from '../overlay/scratch-gui/src/lib/bw-circuit-ui/model/sweep-protocol.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function railedBench() {
  const parts = [
    { id: 'GND', kind: 'gnd', params: {}, terminals: ['gnd'] },
    { id: 'V1', kind: 'vsource', params: { volts: 1 }, terminals: ['pos', 'neg'] },
    { id: 'U1', kind: 'opamp', params: { gain: 10, railHigh: 3, railLow: -3 }, terminals: ['inp', 'inn', 'out'] },
    { id: 'RL', kind: 'resistor', params: { ohms: 1000 }, terminals: ['a', 'b'] },
  ];
  const nets = [
    { id: 'n_gnd', terminals: [
      { part: 'GND', terminal: 'gnd' }, { part: 'V1', terminal: 'neg' },
      { part: 'U1', terminal: 'inn' }, { part: 'RL', terminal: 'b' },
    ] },
    { id: 'n_in', terminals: [{ part: 'V1', terminal: 'pos' }, { part: 'U1', terminal: 'inp' }] },
    { id: 'n_out', terminals: [{ part: 'U1', terminal: 'out' }, { part: 'RL', terminal: 'a' }] },
  ];
  const board = new BoardImpl(5);
  board.setNetlist(parts, nets);
  return board;
}

describe('the vendored analytical AC contract reaches the UI', () => {
  it('defaults to runAc, preserves the bias, and carries the named rail region', () => {
    const live = railedBench();
    const run = createSweepRun({ BoardImpl }, {
      mode: 'bode', netlist: netlistOf(live),
      params: { sourceId: 'V1', inNet: 'n_in', outNet: 'n_out', fFrom: 10, fTo: 1000, pointsPerDecade: 2 },
    });
    const first = run.next();
    assert.equal(first.done, false);
    assert.ok(first.row.magDb < -170, `a railed output is small-signal dead, got ${first.row.magDb} dB`);
    assert.deepEqual(first.row.outOfLinear, [{ part: 'U1', kind: 'opamp', region: 'high' }]);
    assert.equal(live.parts.find(p => p.id === 'V1').params.volts, 1, 'the live board remains untouched');
  });

  it('the panel names the region, offers the scope comparison, and exports it', () => {
    const panel = readFileSync(path.join(root, 'overlay/scratch-gui/src/lib/bw-circuit-ui/components/SweepPanel.jsx'), 'utf8');
    const readout = readFileSync(path.join(root, 'overlay/scratch-gui/src/lib/bw-circuit-ui/model/sweep-readout.js'), 'utf8');
    assert.match(panel, /data-testid="bw-sweep-region-warning"/);
    assert.match(panel, /data-testid="bw-sweep-scope-method"/);
    assert.match(panel, /regionSummary\(r\)/);
    assert.match(readout, /linearization_region/);
  });
});
