#!/usr/bin/env node
/**
 * Headless gate: Lego hub virtual face faceplate.
 *
 * Loads lego-hub-face/controller.json, simulates the program advancing
 * (writes matrix bitmask + gauge variables), and verifies all four
 * display widgets reflect the values.
 *
 * Gate: program tick → matrix face changes; all three gauges update.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

import { ControllerPanel } from '../overlay/scratch-gui/src/lib/bw-board/controller.js';

// ─── Precomputed rotation frames (must match program.bw TABLE) ──────

// Frame 0: vertical bar col 2: bits 2,7,12,17,22
const FRAME_0 = (1<<2)|(1<<7)|(1<<12)|(1<<17)|(1<<22);  // 4329604
// Frame 1: diagonal \: bits 0,6,12,18,24
const FRAME_1 = (1<<0)|(1<<6)|(1<<12)|(1<<18)|(1<<24);  // 17043521
// Frame 2: horizontal bar row 2: bits 10,11,12,13,14
const FRAME_2 = (1<<10)|(1<<11)|(1<<12)|(1<<13)|(1<<14); // 31744
// Frame 3: diagonal /: bits 4,8,12,16,20
const FRAME_3 = (1<<4)|(1<<8)|(1<<12)|(1<<16)|(1<<20);  // 1118480
const FRAMES = [FRAME_0, FRAME_1, FRAME_2, FRAME_3];

// ─── Load the controller.json ───────────────────────────────────────

function loadPanel() {
  const json = JSON.parse(readFileSync(
    join(__dirname, '../overlay/scratch-gui/examples/lego-hub-face/controller.json'),
    'utf8',
  ));
  return ControllerPanel.fromJSON(json);
}

// ─── Simulated hub program ──────────────────────────────────────────

/**
 * Simulate one program tick: advance frame counter, compute motor sweep,
 * distance, colour, and write all four display widgets.
 */
function attachHubProgram(panel) {
  const state = {
    frame: 0,
    sweep: 0,
    sweepDir: 3,
  };

  function tick() {
    // Matrix: rotate through 4 frames
    panel.setMatrixValue('lights', FRAMES[state.frame % 4]);

    // Motor sweep: -180 → +180 → -180
    state.sweep += state.sweepDir;
    if (state.sweep > 180) { state.sweepDir = -3; state.sweep = 180; }
    if (state.sweep < -180) { state.sweepDir = 3; state.sweep = -180; }
    panel.setGaugeValue('motor', state.sweep);

    // Distance: triangle wave 10..190
    panel.setGaugeValue('distance', 100 + state.sweep * 90 / 180);

    // Colour: cycle 0..10
    panel.setGaugeValue('colour', state.frame % 11);

    state.frame++;
  }

  return { state, tick };
}

/** Count lit bits in a bitmask. */
function popcount(n) {
  let c = 0;
  while (n) { c += n & 1; n >>>= 1; }
  return c;
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('Lego hub face controller.json structure', () => {
  it('loads with 4 widgets', () => {
    const panel = loadPanel();
    assert.equal(panel.getWidgetNames().length, 4);
  });

  it('has 1 matrix + 3 gauges', () => {
    const panel = loadPanel();
    const types = panel.getWidgets().map(w => w.type);
    assert.equal(types.filter(t => t === 'matrix').length, 1);
    assert.equal(types.filter(t => t === 'gauge').length, 3);
  });

  it('matrix is 5x5 bound to hub_matrix', () => {
    const panel = loadPanel();
    const w = panel.getWidget('lights');
    assert.equal(w.config.rows, 5);
    assert.equal(w.config.cols, 5);
    assert.equal(w.binding.variableName, 'hub_matrix');
  });

  it('motor gauge: -180..180, bound to motor_angle', () => {
    const panel = loadPanel();
    const w = panel.getWidget('motor');
    assert.equal(w.config.min, -180);
    assert.equal(w.config.max, 180);
    assert.equal(w.binding.variableName, 'motor_angle');
  });

  it('distance gauge: 0..200, bound to dist_cm', () => {
    const panel = loadPanel();
    const w = panel.getWidget('distance');
    assert.equal(w.config.min, 0);
    assert.equal(w.config.max, 200);
    assert.equal(w.binding.variableName, 'dist_cm');
  });

  it('colour gauge: 0..10, bound to colour_id', () => {
    const panel = loadPanel();
    const w = panel.getWidget('colour');
    assert.equal(w.config.min, 0);
    assert.equal(w.config.max, 10);
    assert.equal(w.binding.variableName, 'colour_id');
  });

  it('all widgets are variable-bound', () => {
    const panel = loadPanel();
    for (const w of panel.getWidgets()) {
      assert.ok(w.binding, `${w.name} has binding`);
      assert.equal(w.binding.target, 'variable');
    }
  });
});

describe('Lego hub face — headless gate', () => {
  it('tick 0: matrix shows frame 0 (vertical bar, 5 dots)', () => {
    const panel = loadPanel();
    panel.setMode('play');
    const { tick } = attachHubProgram(panel);

    tick();
    const mat = panel.getValue('lights');
    assert.equal(mat, FRAME_0, `frame 0 = ${FRAME_0}`);
    assert.equal(popcount(mat), 5, '5 lit dots');
  });

  it('tick 1: matrix advances to frame 1 (diagonal, 5 dots)', () => {
    const panel = loadPanel();
    panel.setMode('play');
    const { tick } = attachHubProgram(panel);

    tick(); // frame 0
    tick(); // frame 1
    assert.equal(panel.getValue('lights'), FRAME_1);
  });

  it('4 ticks cycle through all 4 frames', () => {
    const panel = loadPanel();
    panel.setMode('play');
    const { tick } = attachHubProgram(panel);

    const seen = [];
    for (let i = 0; i < 4; i++) {
      tick();
      seen.push(panel.getValue('lights'));
    }
    assert.deepEqual(seen, FRAMES, 'all 4 rotation frames in order');
  });

  it('frame 4 wraps back to frame 0', () => {
    const panel = loadPanel();
    panel.setMode('play');
    const { tick } = attachHubProgram(panel);

    for (let i = 0; i < 5; i++) tick();
    assert.equal(panel.getValue('lights'), FRAME_0, 'wraps to frame 0');
  });

  it('motor gauge sweeps positively on first ticks', () => {
    const panel = loadPanel();
    panel.setMode('play');
    const { tick } = attachHubProgram(panel);

    tick();
    const v1 = panel.getValue('motor');
    assert.equal(v1, 3, 'first tick: sweep = 3');

    tick();
    const v2 = panel.getValue('motor');
    assert.equal(v2, 6, 'second tick: sweep = 6');
  });

  it('motor gauge clamps at 180 and reverses', () => {
    const panel = loadPanel();
    panel.setMode('play');
    const { state, tick } = attachHubProgram(panel);

    // Fast-forward near the boundary
    state.sweep = 178;
    tick(); // sweep += 3 → 181 → clamped to 180
    assert.equal(panel.getValue('motor'), 180, 'clamped at 180');
    assert.equal(state.sweepDir, -3, 'direction reversed');
  });

  it('distance gauge tracks the sweep', () => {
    const panel = loadPanel();
    panel.setMode('play');
    const { tick } = attachHubProgram(panel);

    tick();
    // sweep=3, dist = 100 + 3*90/180 = 100 + 1.5 = 101.5 → clamped to range
    const dist = panel.getValue('distance');
    assert.ok(dist > 100, `distance > 100 after first tick: ${dist}`);
  });

  it('colour gauge cycles 0..10', () => {
    const panel = loadPanel();
    panel.setMode('play');
    const { tick } = attachHubProgram(panel);

    const colours = [];
    for (let i = 0; i < 12; i++) {
      tick();
      colours.push(panel.getValue('colour'));
    }
    // Frames 0..10 → colours 0..10; frame 11 → 0 again
    assert.deepEqual(colours, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 0]);
  });

  it('program advances → matrix + all gauges update (full gate)', () => {
    const panel = loadPanel();
    panel.setMode('play');
    const { tick } = attachHubProgram(panel);

    // Record initial state
    const matBefore = panel.getValue('lights');
    const motorBefore = panel.getValue('motor');

    // Advance 3 ticks
    tick(); tick(); tick();

    const matAfter = panel.getValue('lights');
    const motorAfter = panel.getValue('motor');
    const distAfter = panel.getValue('distance');
    const colourAfter = panel.getValue('colour');

    // Matrix changed (frame 2 ≠ initial 0)
    assert.equal(matAfter, FRAME_2, 'matrix at frame 2');
    assert.notEqual(matAfter, matBefore, 'matrix changed from initial');

    // Motor advanced (3 ticks × 3°/tick = 9°)
    assert.equal(motorAfter, 9, 'motor at 9°');

    // Distance > 100 (positive sweep side)
    assert.ok(distAfter > 100, `distance > 100: ${distAfter}`);

    // Colour = frame 2 mod 11 = 2
    assert.equal(colourAfter, 2, 'colour = 2');
  });
});
