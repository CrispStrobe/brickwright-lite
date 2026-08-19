#!/usr/bin/env node
/**
 * Headless gate: Spike Prime hub virtual face faceplate.
 *
 * Loads lego-hub-face/controller.json, simulates the program advancing
 * (writes matrix bitmask + gauge variables), and verifies all four
 * display widgets reflect the values.
 *
 * Variable names match the spikeprime extension's block opcodes:
 *   spike_display     <- displayImage
 *   spike_position_A  <- getPosition A
 *   spike_distance_D  <- getDistance D
 *   spike_color_C     <- getColor C
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

// ─── Precomputed display frames (must match program.bw TABLE) ───────

// heart:  01101 11111 11111 01110 00100
const FRAME_HEART = 0b01101_11111_11111_01110_00100;   // 14679492
// smiley: 11111 10001 00000 10001 01110
const FRAME_SMILEY = 0b11111_10001_00000_10001_01110;  // 33063470
// X:      10001 01010 00100 01010 10001
const FRAME_X = 0b10001_01010_00100_01010_10001;       // 18157905
// bar:    00000 00000 11111 00000 00000
const FRAME_BAR = 0b00000_00000_11111_00000_00000;     // 31744
const FRAMES = [FRAME_HEART, FRAME_SMILEY, FRAME_X, FRAME_BAR];

// ─── Load the controller.json ───────────────────────────────────────

function loadPanel() {
  const json = JSON.parse(readFileSync(
    join(__dirname, '../overlay/scratch-gui/examples/lego-hub-face/controller.json'),
    'utf8',
  ));
  return ControllerPanel.fromJSON(json);
}

// ─── Simulated hub program ──────────────────────────────────────────

function attachHubProgram(panel) {
  const state = { frame: 0, sweep: 0, sweepDir: 3 };

  function tick() {
    panel.setMatrixValue('display', FRAMES[state.frame % 4]);

    state.sweep += state.sweepDir;
    if (state.sweep > 180) { state.sweepDir = -3; state.sweep = 180; }
    if (state.sweep < -180) { state.sweepDir = 3; state.sweep = -180; }
    panel.setGaugeValue('motorA', state.sweep);

    panel.setGaugeValue('distD', 100 + state.sweep * 90 / 180);
    panel.setGaugeValue('colorC', state.frame % 11);

    state.frame++;
  }

  return { state, tick };
}

function popcount(n) {
  let c = 0;
  while (n) { c += n & 1; n >>>= 1; }
  return c;
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('Spike Prime face controller.json structure', () => {
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

  it('matrix is 5x5 bound to spike_display', () => {
    const panel = loadPanel();
    const w = panel.getWidget('display');
    assert.equal(w.config.rows, 5);
    assert.equal(w.config.cols, 5);
    assert.equal(w.binding.variableName, 'spike_display');
  });

  it('motor gauge: port A, -180..180, bound to spike_position_A', () => {
    const panel = loadPanel();
    const w = panel.getWidget('motorA');
    assert.equal(w.config.min, -180);
    assert.equal(w.config.max, 180);
    assert.equal(w.binding.variableName, 'spike_position_A');
  });

  it('distance gauge: port D, 0..200, bound to spike_distance_D', () => {
    const panel = loadPanel();
    const w = panel.getWidget('distD');
    assert.equal(w.config.min, 0);
    assert.equal(w.config.max, 200);
    assert.equal(w.binding.variableName, 'spike_distance_D');
  });

  it('color gauge: port C, 0..10, bound to spike_color_C', () => {
    const panel = loadPanel();
    const w = panel.getWidget('colorC');
    assert.equal(w.config.min, 0);
    assert.equal(w.config.max, 10);
    assert.equal(w.binding.variableName, 'spike_color_C');
  });

  it('all widgets are variable-bound', () => {
    const panel = loadPanel();
    for (const w of panel.getWidgets()) {
      assert.ok(w.binding, `${w.name} has binding`);
      assert.equal(w.binding.target, 'variable');
    }
  });
});

describe('Spike Prime face — headless gate', () => {
  it('tick 0: matrix shows heart pattern', () => {
    const panel = loadPanel();
    panel.setMode('play');
    const { tick } = attachHubProgram(panel);

    tick();
    assert.equal(panel.getValue('display'), FRAME_HEART);
    assert.equal(popcount(FRAME_HEART), 17, 'heart has 17 lit LEDs');
  });

  it('tick 1: matrix advances to smiley', () => {
    const panel = loadPanel();
    panel.setMode('play');
    const { tick } = attachHubProgram(panel);

    tick(); tick();
    assert.equal(panel.getValue('display'), FRAME_SMILEY);
  });

  it('4 ticks cycle through heart → smiley → X → bar', () => {
    const panel = loadPanel();
    panel.setMode('play');
    const { tick } = attachHubProgram(panel);

    const seen = [];
    for (let i = 0; i < 4; i++) {
      tick();
      seen.push(panel.getValue('display'));
    }
    assert.deepEqual(seen, FRAMES);
  });

  it('frame 4 wraps back to heart', () => {
    const panel = loadPanel();
    panel.setMode('play');
    const { tick } = attachHubProgram(panel);

    for (let i = 0; i < 5; i++) tick();
    assert.equal(panel.getValue('display'), FRAME_HEART);
  });

  it('motor A gauge sweeps positively', () => {
    const panel = loadPanel();
    panel.setMode('play');
    const { tick } = attachHubProgram(panel);

    tick();
    assert.equal(panel.getValue('motorA'), 3);
    tick();
    assert.equal(panel.getValue('motorA'), 6);
  });

  it('motor A gauge clamps at 180 and reverses', () => {
    const panel = loadPanel();
    panel.setMode('play');
    const { state, tick } = attachHubProgram(panel);

    state.sweep = 178;
    tick();
    assert.equal(panel.getValue('motorA'), 180);
    assert.equal(state.sweepDir, -3);
  });

  it('distance D gauge tracks the sweep', () => {
    const panel = loadPanel();
    panel.setMode('play');
    const { tick } = attachHubProgram(panel);

    tick();
    assert.ok(panel.getValue('distD') > 100);
  });

  it('color C gauge cycles 0..10', () => {
    const panel = loadPanel();
    panel.setMode('play');
    const { tick } = attachHubProgram(panel);

    const colours = [];
    for (let i = 0; i < 12; i++) {
      tick();
      colours.push(panel.getValue('colorC'));
    }
    assert.deepEqual(colours, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 0]);
  });

  it('program advances → matrix + all gauges update (full gate)', () => {
    const panel = loadPanel();
    panel.setMode('play');
    const { tick } = attachHubProgram(panel);

    tick(); tick(); tick();

    assert.equal(panel.getValue('display'), FRAME_X, 'matrix at X');
    assert.equal(panel.getValue('motorA'), 9, 'motor at 9°');
    assert.ok(panel.getValue('distD') > 100, 'distance > 100');
    assert.equal(panel.getValue('colorC'), 2, 'color = 2');
  });
});
