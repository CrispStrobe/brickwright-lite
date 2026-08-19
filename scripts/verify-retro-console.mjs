#!/usr/bin/env node
/**
 * Headless gate: retro-console dual-matrix faceplate.
 *
 * Loads retro-console/controller.json, simulates D-pad + button presses
 * via the panel API, and verifies BOTH matrix widgets update correctly.
 *
 * The "program" is inlined as an event-driven listener (same approach as
 * verify-controller-panel.mjs): D-pad moves a player dot on the game
 * matrix, FIRE toggles trail bits, START resets, status shows lives.
 *
 * Gate: dpad → game_screen bitmask changes; status_screen reflects lives.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

import { ControllerPanel } from '../overlay/scratch-gui/src/lib/bw-board/controller.js';

// ─── Load the controller.json ───────────────────────────────────────

function loadPanel() {
  const json = JSON.parse(readFileSync(
    join(__dirname, '../overlay/scratch-gui/examples/retro-console/controller.json'),
    'utf8',
  ));
  return ControllerPanel.fromJSON(json);
}

// ─── Simulated retro program ────────────────────────────────────────

/**
 * Attach the retro console program: D-pad moves player, FIRE toggles trail,
 * START resets, status shows lives. Drives game_screen + status_screen.
 */
function attachRetroProgram(panel) {
  const state = {
    px: 0, py: 0,
    lives: 3,
    trail: 0,
    lastDpad: 0,
    lastFire: false,
  };

  function render() {
    // Game screen: trail | player dot
    const playerBit = 1 << (state.py * 4 + state.px);
    panel.setMatrixValue('game', state.trail | playerBit);

    // Status screen: lives as top-row dots
    const lifeBar = state.lives >= 4 ? 0xF : (1 << state.lives) - 1;
    panel.setMatrixValue('status', lifeBar);
  }

  function onEvent(event, detail) {
    if (event !== 'input') return;
    const { name } = detail;

    if (name === 'pad') {
      const dpad = panel.getValue('pad');
      if (dpad !== state.lastDpad) {
        // up=1 down=2 left=4 right=8
        if ((dpad & 1) && state.py > 0) state.py--;
        if ((dpad & 2) && state.py < 3) state.py++;
        if ((dpad & 4) && state.px > 0) state.px--;
        if ((dpad & 8) && state.px < 3) state.px++;
        state.lastDpad = dpad;
        render();
      }
      return;
    }

    if (name === 'fire' && detail.pressed && !state.lastFire) {
      const bit = 1 << (state.py * 4 + state.px);
      state.trail ^= bit;
      render();
    }
    if (name === 'fire') state.lastFire = detail.pressed;

    if (name === 'start' && detail.pressed) {
      state.px = 0;
      state.py = 0;
      state.trail = 0;
      state.lives = 3;
      render();
    }
  }

  panel.addListener(onEvent);
  render(); // initial state

  return {
    state,
    dispose: () => panel.removeListener(onEvent),
  };
}

// ─── Helpers ────────────────────────────────────────────────────────

function pressButton(panel, name) {
  panel.setButtonInput(name, true);
  panel.setButtonInput(name, false);
}

function pressDpad(panel, direction) {
  panel.setDpadInput('pad', direction, true);
  panel.setDpadInput('pad', direction, false);
}

/** Count lit bits in a bitmask. */
function popcount(n) {
  let c = 0;
  while (n) { c += n & 1; n >>>= 1; }
  return c;
}

/** Check if bit at (row, col) is set in a 4-wide bitmask. */
function bitAt(mask, row, col) {
  return !!(mask & (1 << (row * 4 + col)));
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('Retro console controller.json structure', () => {
  it('loads with 5 widgets', () => {
    const panel = loadPanel();
    assert.equal(panel.getWidgetNames().length, 5);
  });

  it('has 2 matrices + 1 dpad + 2 buttons', () => {
    const panel = loadPanel();
    const types = panel.getWidgets().map(w => w.type);
    assert.equal(types.filter(t => t === 'matrix').length, 2);
    assert.equal(types.filter(t => t === 'dpad').length, 1);
    assert.equal(types.filter(t => t === 'button').length, 2);
  });

  it('game matrix is 4x4 bound to game_screen', () => {
    const panel = loadPanel();
    const w = panel.getWidget('game');
    assert.equal(w.config.rows, 4);
    assert.equal(w.config.cols, 4);
    assert.equal(w.binding.variableName, 'game_screen');
  });

  it('status matrix is 4x4 bound to status_screen', () => {
    const panel = loadPanel();
    const w = panel.getWidget('status');
    assert.equal(w.config.rows, 4);
    assert.equal(w.config.cols, 4);
    assert.equal(w.binding.variableName, 'status_screen');
  });

  it('all widgets are variable-bound', () => {
    const panel = loadPanel();
    for (const w of panel.getWidgets()) {
      assert.ok(w.binding, `${w.name} has binding`);
      assert.equal(w.binding.target, 'variable');
    }
  });
});

describe('Retro console — headless gate', () => {
  it('initial state: player at (0,0) on game, 3 lives on status', () => {
    const panel = loadPanel();
    panel.setMode('play');
    const { state, dispose } = attachRetroProgram(panel);

    const game = panel.getValue('game');
    assert.ok(bitAt(game, 0, 0), 'player dot at (0,0)');
    assert.equal(popcount(game), 1, 'only one dot on game screen');

    const status = panel.getValue('status');
    // 3 lives = bits 0,1,2 = 0b0111 = 7
    assert.equal(status, 7, 'status shows 3 lives');
    dispose();
  });

  it('dpad right moves player from (0,0) to (1,0)', () => {
    const panel = loadPanel();
    panel.setMode('play');
    const { state, dispose } = attachRetroProgram(panel);

    pressDpad(panel, 'right');
    assert.equal(state.px, 1, 'px = 1');
    assert.equal(state.py, 0, 'py = 0');

    const game = panel.getValue('game');
    assert.ok(bitAt(game, 0, 1), 'player at col 1');
    assert.ok(!bitAt(game, 0, 0), 'old position clear');
    dispose();
  });

  it('dpad down then right moves to (1,1)', () => {
    const panel = loadPanel();
    panel.setMode('play');
    const { state, dispose } = attachRetroProgram(panel);

    pressDpad(panel, 'down');
    assert.equal(state.py, 1);
    pressDpad(panel, 'right');
    assert.equal(state.px, 1);

    const game = panel.getValue('game');
    // bit at row=1, col=1 → bit index 5
    assert.ok(bitAt(game, 1, 1), 'player at (1,1)');
    assert.equal(popcount(game), 1, 'only player dot');
    dispose();
  });

  it('player clamps to grid boundaries', () => {
    const panel = loadPanel();
    panel.setMode('play');
    const { state, dispose } = attachRetroProgram(panel);

    // Try moving up from (0,0) — should stay
    pressDpad(panel, 'up');
    assert.equal(state.py, 0, 'clamped at top');
    pressDpad(panel, 'left');
    assert.equal(state.px, 0, 'clamped at left');

    // Move to bottom-right corner
    for (let i = 0; i < 5; i++) pressDpad(panel, 'right');
    for (let i = 0; i < 5; i++) pressDpad(panel, 'down');
    assert.equal(state.px, 3, 'clamped at right');
    assert.equal(state.py, 3, 'clamped at bottom');
    dispose();
  });

  it('FIRE toggles trail at current position', () => {
    const panel = loadPanel();
    panel.setMode('play');
    const { state, dispose } = attachRetroProgram(panel);

    // At (0,0), fire to mark
    pressButton(panel, 'fire');
    assert.equal(state.trail & 1, 1, 'trail bit 0 set');

    // Move right, fire again
    pressDpad(panel, 'right');
    pressButton(panel, 'fire');
    assert.equal(state.trail & 2, 2, 'trail bit 1 set');

    const game = panel.getValue('game');
    // Should show: trail (bits 0,1) + player at (1,0) = bit 1
    assert.ok(bitAt(game, 0, 0), 'trail at (0,0)');
    assert.ok(bitAt(game, 0, 1), 'player+trail at (1,0)');
    assert.equal(popcount(game), 2, '2 lit dots total');

    // Fire again at same spot toggles trail OFF
    pressButton(panel, 'fire');
    assert.equal(state.trail & 2, 0, 'trail bit 1 cleared');
    dispose();
  });

  it('START resets everything', () => {
    const panel = loadPanel();
    panel.setMode('play');
    const { state, dispose } = attachRetroProgram(panel);

    // Make some moves
    pressDpad(panel, 'right');
    pressDpad(panel, 'down');
    pressButton(panel, 'fire');

    // Reset
    pressButton(panel, 'start');
    assert.equal(state.px, 0);
    assert.equal(state.py, 0);
    assert.equal(state.trail, 0);
    assert.equal(state.lives, 3);

    const game = panel.getValue('game');
    assert.ok(bitAt(game, 0, 0), 'player back at origin');
    assert.equal(popcount(game), 1, 'only player, no trail');

    assert.equal(panel.getValue('status'), 7, 'status shows 3 lives');
    dispose();
  });

  it('both matrices update independently', () => {
    const panel = loadPanel();
    panel.setMode('play');
    const { state, dispose } = attachRetroProgram(panel);

    const gameInitial = panel.getValue('game');
    const statusInitial = panel.getValue('status');

    // Move player — only game changes
    pressDpad(panel, 'right');
    const gameAfterMove = panel.getValue('game');
    const statusAfterMove = panel.getValue('status');

    assert.notEqual(gameAfterMove, gameInitial, 'game screen changed');
    assert.equal(statusAfterMove, statusInitial, 'status unchanged by move');
    dispose();
  });

  it('dpad → game matrix face changes; status matrix updates (gate)', () => {
    const panel = loadPanel();
    panel.setMode('play');
    const { state, dispose } = attachRetroProgram(panel);

    // Sequence: move right, right, down, fire, move left
    pressDpad(panel, 'right');
    pressDpad(panel, 'right');
    pressDpad(panel, 'down');
    pressButton(panel, 'fire');
    pressDpad(panel, 'left');

    // Player should be at (1,1), trail at (2,1)
    assert.equal(state.px, 1);
    assert.equal(state.py, 1);

    const game = panel.getValue('game');
    assert.ok(bitAt(game, 1, 1), 'player at (1,1)');
    assert.ok(bitAt(game, 1, 2), 'trail at (2,1)');

    // Status still shows 3 lives
    assert.equal(panel.getValue('status'), 7, 'status: 3 lives');

    dispose();
  });
});
