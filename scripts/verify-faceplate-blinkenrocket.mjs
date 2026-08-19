#!/usr/bin/env node
/**
 * Headless gate: Blinkenrocket animation faceplate.
 *
 * Loads the blinkenrocket controller.json, presses next/prev buttons
 * via the panel API, and verifies the matrix face updates with the
 * correct animation frame bitmask on each step.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

import { ControllerPanel } from '../overlay/scratch-gui/src/lib/bw-board/controller.js';

// ── Animation frames (decimal bitmasks, 4×8 row-major) ─────────────────
// These must match program.bw's f0–f7 values.
const FRAMES = [
  268734480,   // f0: arrow right
  268734472,   // f1: arrow left
  473759542,   // f2: heart
  403715096,   // f3: diamond
  2863311530,  // f4: checker
  2113601406,  // f5: ring
  4294967295,  // f6: all on
  0,           // f7: all off
];

function loadPanel() {
  const json = JSON.parse(readFileSync(
    join(__dirname, '../overlay/scratch-gui/examples/blinkenrocket-animation/controller.json'),
    'utf8',
  ));
  return ControllerPanel.fromJSON(json);
}

/**
 * Attach a headless stand-in for program.bw: listens for button events,
 * steps frame counter, writes the matrix bitmask.
 */
function attachProgram(panel, state) {
  function onEvent(event, detail) {
    if (event !== 'input' || !detail.pressed) return;
    const { name } = detail;

    if (name === 'next') {
      state.frame = (state.frame + 1) % FRAMES.length;
      panel.setMatrixValue('scr', FRAMES[state.frame]);
    } else if (name === 'prev') {
      state.frame = (state.frame + FRAMES.length - 1) % FRAMES.length;
      panel.setMatrixValue('scr', FRAMES[state.frame]);
    }
  }
  panel.addListener(onEvent);
  // Set initial frame
  panel.setMatrixValue('scr', FRAMES[state.frame]);
  return () => panel.removeListener(onEvent);
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('Blinkenrocket controller.json structure', () => {

  it('loads from JSON with 3 widgets', () => {
    const panel = loadPanel();
    const names = panel.getWidgetNames();
    assert.equal(names.length, 3, `expected 3 widgets, got ${names.length}`);
  });

  it('has 1 matrix + 2 buttons', () => {
    const panel = loadPanel();
    const widgets = panel.getWidgets();
    const matrices = widgets.filter(w => w.type === 'matrix');
    const buttons = widgets.filter(w => w.type === 'button');
    assert.equal(matrices.length, 1, '1 matrix display');
    assert.equal(buttons.length, 2, '2 buttons');
  });

  it('matrix is 4×8 = 32 dots (maximum for bitmask)', () => {
    const panel = loadPanel();
    const scr = panel.getWidget('scr');
    assert.equal(scr.config.rows, 4);
    assert.equal(scr.config.cols, 8);
    assert.ok(scr.config.rows * scr.config.cols <= 32, 'rows*cols <= 32 for bitmask');
  });

  it('matrix is variable-bound to screen', () => {
    const panel = loadPanel();
    const scr = panel.getWidget('scr');
    assert.equal(scr.binding.target, 'variable');
    assert.equal(scr.binding.variableName, 'screen');
  });

  it('buttons are variable-bound to btnPrev/btnNext', () => {
    const panel = loadPanel();
    const prev = panel.getWidget('prev');
    const next = panel.getWidget('next');
    assert.equal(prev.binding.target, 'variable');
    assert.equal(prev.binding.variableName, 'btnPrev');
    assert.equal(next.binding.target, 'variable');
    assert.equal(next.binding.variableName, 'btnNext');
  });
});

describe('Blinkenrocket animation — headless sim', () => {

  it('initial frame is frame 0 (arrow right)', () => {
    const panel = loadPanel();
    panel.setMode('play');
    const state = { frame: 0 };
    const dispose = attachProgram(panel, state);

    assert.equal(panel.getValue('scr'), FRAMES[0]);
    dispose();
  });

  it('pressing next advances to frame 1', () => {
    const panel = loadPanel();
    panel.setMode('play');
    const state = { frame: 0 };
    const dispose = attachProgram(panel, state);

    panel.setButtonInput('next', true);
    panel.setButtonInput('next', false);

    assert.equal(state.frame, 1);
    assert.equal(panel.getValue('scr'), FRAMES[1]);
    dispose();
  });

  it('pressing next 3 times reaches frame 3 (diamond)', () => {
    const panel = loadPanel();
    panel.setMode('play');
    const state = { frame: 0 };
    const dispose = attachProgram(panel, state);

    for (let i = 0; i < 3; i++) {
      panel.setButtonInput('next', true);
      panel.setButtonInput('next', false);
    }

    assert.equal(state.frame, 3);
    assert.equal(panel.getValue('scr'), FRAMES[3]);
    dispose();
  });

  it('pressing prev from frame 0 wraps to frame 7 (all off)', () => {
    const panel = loadPanel();
    panel.setMode('play');
    const state = { frame: 0 };
    const dispose = attachProgram(panel, state);

    panel.setButtonInput('prev', true);
    panel.setButtonInput('prev', false);

    assert.equal(state.frame, 7);
    assert.equal(panel.getValue('scr'), FRAMES[7]);
    assert.equal(panel.getValue('scr'), 0, 'all-off frame is 0');
    dispose();
  });

  it('pressing next wraps from frame 7 to frame 0', () => {
    const panel = loadPanel();
    panel.setMode('play');
    const state = { frame: 0 };
    const dispose = attachProgram(panel, state);

    // Go to frame 7
    for (let i = 0; i < 7; i++) {
      panel.setButtonInput('next', true);
      panel.setButtonInput('next', false);
    }
    assert.equal(state.frame, 7);

    // Next wraps to 0
    panel.setButtonInput('next', true);
    panel.setButtonInput('next', false);
    assert.equal(state.frame, 0);
    assert.equal(panel.getValue('scr'), FRAMES[0]);
    dispose();
  });

  it('full cycle: next through all 8 frames returns to start', () => {
    const panel = loadPanel();
    panel.setMode('play');
    const state = { frame: 0 };
    const dispose = attachProgram(panel, state);

    const seen = [panel.getValue('scr')];
    for (let i = 0; i < 8; i++) {
      panel.setButtonInput('next', true);
      panel.setButtonInput('next', false);
      seen.push(panel.getValue('scr'));
    }

    // 9 values: f0, f1, ..., f7, f0 again
    assert.equal(seen.length, 9);
    assert.equal(seen[0], seen[8], 'cycle returns to start');
    // All 8 intermediate frames are distinct
    const unique = new Set(seen.slice(0, 8));
    assert.equal(unique.size, 8, `8 distinct frames, got ${unique.size}`);
    dispose();
  });

  it('prev then next returns to the same frame', () => {
    const panel = loadPanel();
    panel.setMode('play');
    const state = { frame: 0 };
    const dispose = attachProgram(panel, state);

    // Advance to frame 3
    for (let i = 0; i < 3; i++) {
      panel.setButtonInput('next', true);
      panel.setButtonInput('next', false);
    }
    const valAt3 = panel.getValue('scr');

    // Go back
    panel.setButtonInput('prev', true);
    panel.setButtonInput('prev', false);

    // Come forward again
    panel.setButtonInput('next', true);
    panel.setButtonInput('next', false);

    assert.equal(panel.getValue('scr'), valAt3, 'back-and-forth returns to same frame');
    dispose();
  });

  it('all-on frame lights all 32 dots', () => {
    const panel = loadPanel();
    panel.setMode('play');
    const state = { frame: 0 };
    const dispose = attachProgram(panel, state);

    // Go to frame 6 (all on)
    for (let i = 0; i < 6; i++) {
      panel.setButtonInput('next', true);
      panel.setButtonInput('next', false);
    }

    const v = panel.getValue('scr');
    // All 32 bits set: the mask for 32 cells is 0xFFFFFFFF, which is
    // stored as -1 (signed 32-bit) by the bitwise AND in setMatrixValue.
    assert.equal(v, 0xFFFFFFFF | 0, 'all 32 dots lit');
    dispose();
  });
});

describe('Blinkenrocket in examples/index.json', () => {

  it('registered with correct id and files', () => {
    const index = JSON.parse(readFileSync(
      join(__dirname, '../overlay/scratch-gui/examples/index.json'), 'utf8'));
    const entry = index.find(e => e.id === 'blinkenrocket-animation');
    assert.ok(entry, 'entry exists in index.json');
    assert.equal(entry.kind, 'program');
    assert.ok(entry.files.program.includes('blinkenrocket-animation/program.bw'));
    assert.ok(entry.files.controller.includes('blinkenrocket-animation/controller.json'));
    assert.ok(entry.files.intro.includes('blinkenrocket-animation/intro.md'));
    assert.ok(entry.files.introDE.includes('blinkenrocket-animation/intro.de.md'));
  });
});
