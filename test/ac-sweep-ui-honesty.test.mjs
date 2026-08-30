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

  it('the panel names the region, names BOTH methods, and exports which one ran', () => {
    // Re-aimed 2026-08-30 at bw-circuit-ui d3eb4d2 (X2.1). The old assertion looked
    // for `bw-sweep-scope-method`, and that id existed because the control WAS one
    // checkbox reading "measure like a scope would (slower)" — it named one side,
    // left the default unlabelled, and called the difference SPEED. They are two
    // different measurements: runAc linearises around the DC operating point and
    // solves the complex network once per frequency; runAcSweep drives a real sine
    // into the real nonlinear circuit and correlates. X2.1 replaced the checkbox
    // with a control that names both, so the id became `bw-sweep-method` and gained
    // `bw-sweep-method-what`, the sentence saying what each one is.
    //
    // The rename is why this test went red on the vendor, and the assertions below
    // are deliberately AIMED AT THE NEW TRUTH rather than merely renamed: a
    // one-sided control passing under a two-sided name would be the same defect
    // wearing this gate's own id.
    const panel = readFileSync(path.join(root, 'overlay/scratch-gui/src/lib/bw-circuit-ui/components/SweepPanel.jsx'), 'utf8');
    const readout = readFileSync(path.join(root, 'overlay/scratch-gui/src/lib/bw-circuit-ui/model/sweep-readout.js'), 'utf8');
    assert.match(panel, /data-testid="bw-sweep-region-warning"/);
    // The scope method keeps a STABLE identity through the data-driven METHODS
    // array -- `data-testid={m.testid}` -- so the id survived the redesign even
    // though it is no longer a literal in the markup. Both halves are asserted,
    // because either alone can go green while the button is unreachable.
    assert.match(panel, /testid:\s*'bw-sweep-scope-method'/,
      'the scope method keeps its stable test identity in the method declaration');
    assert.match(panel, /data-testid=\{m\.testid\}/,
      'the rendered method button receives the declared test identity');
    assert.match(panel, /data-testid="bw-sweep-method"/,
      'the method control is gone; a learner cannot tell which measurement ran');
    assert.match(panel, /data-testid="bw-sweep-method-what"/,
      'the method is named but not explained \u2014 "slower" was the old, wrong summary ' +
      'of a difference that is about linearisation, not speed');
    // Per-point honesty, not one banner: bw-board reports outOfLinear PER POINT
    // (spec-updates/ac-operating-region.md), and collapsing that is how a plausible
    // wrong Bode plot gets made.
    assert.match(panel, /regionSummary\(r\)/);
    assert.match(panel, /regionSummary\(bad\[0\]\)/);
    assert.match(panel, /rowIsLinear\(r\)/);
    assert.match(panel, /regionPhrase\(r, de\)/);
    assert.match(readout, /linearization_region/,
      'the CSV export drops which region each point was measured in');
  });
});
