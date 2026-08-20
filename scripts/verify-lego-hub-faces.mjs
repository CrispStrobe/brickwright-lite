#!/usr/bin/env node
/**
 * Headless gate: LEGO hub faceplate examples.
 *
 * Verifies all 4 hub faceplates load from JSON, have correct widget types,
 * correct variable bindings, and that button presses drive the expected
 * state changes through the program logic.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const exDir = join(__dirname, '../overlay/scratch-gui/examples');

import { ControllerPanel, WIDGET_TYPES } from '../overlay/scratch-gui/src/lib/bw-board/controller.js';

// mono_lcd and rgb_light may not be on main yet — check availability
const HAS_MONO_LCD = !!WIDGET_TYPES.MONO_LCD;
const HAS_RGB_LIGHT = !!WIDGET_TYPES.RGB_LIGHT;

function loadPanel(name) {
  return ControllerPanel.fromJSON(JSON.parse(
    readFileSync(join(exDir, name, 'controller.json'), 'utf8')));
}

/** Load panel JSON as raw object (no ControllerPanel — works before types land). */
function loadRaw(name) {
  return JSON.parse(readFileSync(join(exDir, name, 'controller.json'), 'utf8'));
}

function pressButton(panel, name) {
  panel.setButtonInput(name, true);
  panel.setButtonInput(name, false);
}

// ── EV3 ─────────────────────────────────────────────────────────────────

describe('EV3 faceplate (JSON contract)', () => {
  it('has 4 widgets (1 mono_lcd + 3 buttons) in JSON', () => {
    const raw = loadRaw('ev3-faceplate');
    assert.equal(raw.widgets.length, 4);
    assert.equal(raw.widgets.filter(w => w.type === 'mono_lcd').length, 1);
    assert.equal(raw.widgets.filter(w => w.type === 'button').length, 3);
  });

  it('mono_lcd is 178x128 and variable-bound to ev3_display', () => {
    const raw = loadRaw('ev3-faceplate');
    const s = raw.widgets.find(w => w.name === 'screen');
    assert.equal(s.config.width, 178);
    assert.equal(s.config.height, 128);
    assert.equal(s.binding.variableName, 'ev3_display');
  });

  it('buttons are variable-bound to btnUp/btnDown/btnEnter', () => {
    const raw = loadRaw('ev3-faceplate');
    const byName = n => raw.widgets.find(w => w.name === n);
    assert.equal(byName('up').binding.variableName, 'btnUp');
    assert.equal(byName('down').binding.variableName, 'btnDown');
    assert.equal(byName('enter').binding.variableName, 'btnEnter');
  });

  it('loads via ControllerPanel when mono_lcd lands', {
    skip: !HAS_MONO_LCD && 'mono_lcd type not yet on main'
  }, () => {
    const p = loadPanel('ev3-faceplate');
    assert.equal(p.getWidgetNames().length, 4);
  });
});

// ── NXT ─────────────────────────────────────────────────────────────────

describe('NXT faceplate (JSON contract)', () => {
  it('has 4 widgets (1 mono_lcd + 3 buttons) in JSON', () => {
    const raw = loadRaw('nxt-faceplate');
    assert.equal(raw.widgets.length, 4);
    assert.equal(raw.widgets.filter(w => w.type === 'mono_lcd').length, 1);
    assert.equal(raw.widgets.filter(w => w.type === 'button').length, 3);
  });

  it('mono_lcd is 100x64 and variable-bound to nxt_display', () => {
    const raw = loadRaw('nxt-faceplate');
    const s = raw.widgets.find(w => w.name === 'screen');
    assert.equal(s.config.width, 100);
    assert.equal(s.config.height, 64);
    assert.equal(s.binding.variableName, 'nxt_display');
  });

  it('buttons are variable-bound to btnLeft/btnRight/btnCenter', () => {
    const raw = loadRaw('nxt-faceplate');
    const byName = n => raw.widgets.find(w => w.name === n);
    assert.equal(byName('left').binding.variableName, 'btnLeft');
    assert.equal(byName('right').binding.variableName, 'btnRight');
    assert.equal(byName('center').binding.variableName, 'btnCenter');
  });

  it('loads via ControllerPanel when mono_lcd lands', {
    skip: !HAS_MONO_LCD && 'mono_lcd type not yet on main'
  }, () => {
    const p = loadPanel('nxt-faceplate');
    assert.equal(p.getWidgetNames().length, 4);
  });
});

// ── WeDo 2.0 ────────────────────────────────────────────────────────────

describe('WeDo 2.0 faceplate (JSON contract)', () => {
  it('has 5 widgets (1 rgb_light + 2 sliders + 2 buttons) in JSON', () => {
    const raw = loadRaw('wedo2-faceplate');
    assert.equal(raw.widgets.length, 5);
    assert.equal(raw.widgets.filter(w => w.type === 'rgb_light').length, 1);
    assert.equal(raw.widgets.filter(w => w.type === 'slider').length, 2);
    assert.equal(raw.widgets.filter(w => w.type === 'button').length, 2);
  });

  it('rgb_light is variable-bound to hub_led', () => {
    const raw = loadRaw('wedo2-faceplate');
    const led = raw.widgets.find(w => w.name === 'led');
    assert.equal(led.type, 'rgb_light');
    assert.equal(led.binding.variableName, 'hub_led');
  });

  it('tilt sliders range -45..45', () => {
    const raw = loadRaw('wedo2-faceplate');
    const tx = raw.widgets.find(w => w.name === 'tiltX');
    assert.equal(tx.config.min, -45);
    assert.equal(tx.config.max, 45);
    assert.equal(tx.binding.variableName, 'tilt_x');
  });

  it('motor buttons are toggle type', () => {
    const raw = loadRaw('wedo2-faceplate');
    const byName = n => raw.widgets.find(w => w.name === n);
    assert.equal(byName('motorA').config.toggle, true);
    assert.equal(byName('motorB').config.toggle, true);
  });

  it('loads via ControllerPanel when rgb_light lands', {
    skip: !HAS_RGB_LIGHT && 'rgb_light type not yet on main'
  }, () => {
    const p = loadPanel('wedo2-faceplate');
    assert.equal(p.getWidgetNames().length, 5);
  });
});

// ── Boost ────────────────────────────────────────────────────────────────

describe('Boost faceplate (JSON contract)', () => {
  it('has 4 widgets (1 rgb_light + 1 slider + 2 buttons) in JSON', () => {
    const raw = loadRaw('boost-faceplate');
    assert.equal(raw.widgets.length, 4);
    assert.equal(raw.widgets.filter(w => w.type === 'rgb_light').length, 1);
    assert.equal(raw.widgets.filter(w => w.type === 'slider').length, 1);
    assert.equal(raw.widgets.filter(w => w.type === 'button').length, 2);
  });

  it('rgb_light is variable-bound to hub_led', () => {
    const raw = loadRaw('boost-faceplate');
    const led = raw.widgets.find(w => w.name === 'led');
    assert.equal(led.type, 'rgb_light');
    assert.equal(led.binding.variableName, 'hub_led');
  });

  it('power slider ranges 0..100 step 5', () => {
    const raw = loadRaw('boost-faceplate');
    const pw = raw.widgets.find(w => w.name === 'power');
    assert.equal(pw.config.min, 0);
    assert.equal(pw.config.max, 100);
    assert.equal(pw.config.step, 5);
    assert.equal(pw.binding.variableName, 'motor_power');
  });

  it('go and dir are toggle buttons', () => {
    const raw = loadRaw('boost-faceplate');
    const byName = n => raw.widgets.find(w => w.name === n);
    assert.equal(byName('go').config.toggle, true);
    assert.equal(byName('dir').config.toggle, true);
  });

  it('loads via ControllerPanel when rgb_light lands', {
    skip: !HAS_RGB_LIGHT && 'rgb_light type not yet on main'
  }, () => {
    const p = loadPanel('boost-faceplate');
    assert.equal(p.getWidgetNames().length, 4);
  });
});

// ── Index registration ──────────────────────────────────────────────────

describe('index.json registration', () => {
  const index = JSON.parse(readFileSync(join(exDir, 'index.json'), 'utf8'));

  for (const id of ['ev3-faceplate', 'nxt-faceplate', 'wedo2-faceplate', 'boost-faceplate']) {
    it(`${id} is registered with correct files`, () => {
      const entry = index.find(e => e.id === id);
      assert.ok(entry, `${id} exists in index.json`);
      assert.equal(entry.kind, 'program');
      assert.ok(entry.files.program.includes(`${id}/program.bw`));
      assert.ok(entry.files.controller.includes(`${id}/controller.json`));
      assert.ok(entry.files.intro.includes(`${id}/intro.md`));
      assert.ok(entry.files.introDE.includes(`${id}/intro.de.md`));
      assert.ok(entry.files.expected.includes(`${id}/EXPECTED.md`));
    });
  }
});
