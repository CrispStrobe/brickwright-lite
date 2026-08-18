import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Import the data-model modules (no DOM dependency)
import { ControllerPanel, WIDGET_TYPES } from '../overlay/scratch-gui/src/lib/bw-board/controller.js';
import { bindPanelToBoard, createControllerDriver } from '../overlay/scratch-gui/src/lib/bw-board/controller-binding.js';

describe('ControllerPanel — joystick widget', () => {

  it('adds a joystick widget with default state', () => {
    const panel = new ControllerPanel();
    const w = panel.addWidget('joy1', 'joystick');
    assert.equal(w.type, 'joystick');
    assert.equal(w.state.x, 0);
    assert.equal(w.state.y, 0);
    assert.deepEqual(panel.getWidgetNames(), ['joy1']);
  });

  it('setJoystickInput clamps to -100..100', () => {
    const panel = new ControllerPanel();
    panel.addWidget('joy1', 'joystick');
    panel.setJoystickInput('joy1', 150, -200);
    const w = panel.getWidget('joy1');
    assert.equal(w.state.x, 100);
    assert.equal(w.state.y, -100);
  });

  it('setJoystickInput rounds to integers', () => {
    const panel = new ControllerPanel();
    panel.addWidget('joy1', 'joystick');
    panel.setJoystickInput('joy1', 33.7, -66.2);
    const w = panel.getWidget('joy1');
    assert.equal(w.state.x, 34);
    assert.equal(w.state.y, -66);
  });
});

describe('ControllerPanel — program-facing API', () => {

  it('getValue returns joystick magnitude', () => {
    const panel = new ControllerPanel();
    panel.addWidget('joy1', 'joystick');
    panel.setJoystickInput('joy1', 60, 80);
    // magnitude = sqrt(60^2 + 80^2) = sqrt(3600 + 6400) = 100
    assert.equal(panel.getValue('joy1'), 100);
  });

  it('getX/getY return joystick axes', () => {
    const panel = new ControllerPanel();
    panel.addWidget('joy1', 'joystick');
    panel.setJoystickInput('joy1', -42, 73);
    assert.equal(panel.getX('joy1'), -42);
    assert.equal(panel.getY('joy1'), 73);
  });

  it('getX/getY return 0 for non-joystick widgets', () => {
    const panel = new ControllerPanel();
    panel.addWidget('slider1', 'slider', { min: 0, max: 100 });
    assert.equal(panel.getX('slider1'), 0);
    assert.equal(panel.getY('slider1'), 0);
  });

  it('createControllerDriver proxies panel methods', () => {
    const panel = new ControllerPanel();
    panel.addWidget('joy1', 'joystick');
    panel.setJoystickInput('joy1', 50, -25);
    const driver = createControllerDriver(panel);
    assert.equal(driver.controllerX('joy1'), 50);
    assert.equal(driver.controllerY('joy1'), -25);
    assert.equal(typeof driver.controllerValue('joy1'), 'number');
    assert.equal(driver.controllerPressed('joy1'), false);
    assert.deepEqual(driver.controllerWidgets(), ['joy1']);
  });
});

describe('ControllerPanel — persistence (toJSON / fromJSON)', () => {

  it('round-trips joystick widget with binding', () => {
    const panel = new ControllerPanel();
    panel.addWidget('joy1', 'joystick', {}, { x: 10, y: 20 });
    panel.bindToPart('joy1', 'pot1', 'x');

    const json = panel.toJSON();
    assert.equal(json.version, 1);
    assert.equal(json.widgets.length, 1);
    assert.equal(json.widgets[0].name, 'joy1');
    assert.equal(json.widgets[0].type, 'joystick');
    assert.deepEqual(json.widgets[0].binding, { target: 'part', partId: 'pot1', param: 'x' });

    const restored = ControllerPanel.fromJSON(json);
    assert.deepEqual(restored.getWidgetNames(), ['joy1']);
    const w = restored.getWidget('joy1');
    assert.equal(w.type, 'joystick');
    assert.equal(w.layout.x, 10);
    assert.equal(w.layout.y, 20);
    assert.deepEqual(w.binding, { target: 'part', partId: 'pot1', param: 'x' });
  });

  it('round-trips multiple widgets', () => {
    const panel = new ControllerPanel();
    panel.addWidget('joy1', 'joystick');
    panel.addWidget('btn1', 'button', { toggle: true });
    panel.addWidget('slider1', 'slider', { min: 0, max: 255, value: 128 });

    const json = panel.toJSON();
    const restored = ControllerPanel.fromJSON(json);
    assert.deepEqual(restored.getWidgetNames(), ['joy1', 'btn1', 'slider1']);
    assert.equal(restored.getWidget('btn1').config.toggle, true);
    assert.equal(restored.getWidget('slider1').config.max, 255);
  });
});

describe('ControllerPanel — world-facing binding (board.setControl)', () => {

  it('joystick bound to part calls board.setControl on input', () => {
    const panel = new ControllerPanel();
    panel.addWidget('joy1', 'joystick');
    panel.bindToPart('joy1', 'pot1', 'x');

    // Mock board
    const calls = [];
    const mockBoard = {
      setControl(partId, value) { calls.push({ partId, value }); },
    };

    const binding = bindPanelToBoard(panel, mockBoard);

    // Initial sync should push current value (x=0 → mapped to 0.5)
    binding.sync();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].partId, 'pot1');
    // joystick x=0 → (0 + 100) / 200 = 0.5
    assert.equal(calls[0].value, 0.5);

    // Move joystick
    panel.setJoystickInput('joy1', 100, 0);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].partId, 'pot1');
    // joystick x=100 → (100 + 100) / 200 = 1.0
    assert.equal(calls[1].value, 1.0);

    // Move to negative
    panel.setJoystickInput('joy1', -100, 0);
    assert.equal(calls.length, 3);
    // joystick x=-100 → (-100 + 100) / 200 = 0.0
    assert.equal(calls[2].value, 0.0);

    binding.dispose();
    // After dispose, no more calls
    panel.setJoystickInput('joy1', 50, 0);
    assert.equal(calls.length, 3);
  });

  it('joystick Y axis binding works via param="y"', () => {
    const panel = new ControllerPanel();
    panel.addWidget('joy1', 'joystick');
    panel.bindToPart('joy1', 'pot2', 'y');

    const calls = [];
    const mockBoard = {
      setControl(partId, value) { calls.push({ partId, value }); },
    };

    const binding = bindPanelToBoard(panel, mockBoard);
    panel.setJoystickInput('joy1', 0, 75);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].partId, 'pot2');
    // joystick y=75 → (75 + 100) / 200 = 0.875
    assert.equal(calls[0].value, 0.875);

    binding.dispose();
  });

  it('program-bound widget does NOT call board.setControl', () => {
    const panel = new ControllerPanel();
    panel.addWidget('joy1', 'joystick');
    panel.bindToProgram('joy1');

    const calls = [];
    const mockBoard = {
      setControl(partId, value) { calls.push({ partId, value }); },
    };

    const binding = bindPanelToBoard(panel, mockBoard);
    binding.sync();
    panel.setJoystickInput('joy1', 50, 50);
    assert.equal(calls.length, 0);

    binding.dispose();
  });
});

describe('ControllerPanel — mode switching', () => {

  it('edit/play mode toggle works', () => {
    const panel = new ControllerPanel();
    assert.equal(panel.mode, 'edit');
    panel.setMode('play');
    assert.equal(panel.mode, 'play');
    panel.setMode('edit');
    assert.equal(panel.mode, 'edit');
  });

  it('rejects invalid mode', () => {
    const panel = new ControllerPanel();
    assert.throws(() => panel.setMode('invalid'), /Invalid mode/);
  });

  it('momentary buttons reset on entering play mode', () => {
    const panel = new ControllerPanel();
    panel.addWidget('btn1', 'button', { toggle: false });
    // Manually set pressed
    panel.getWidget('btn1').state.pressed = true;
    panel.setMode('play');
    assert.equal(panel.getWidget('btn1').state.pressed, false);
  });
});

describe('ControllerPanel — widget CRUD', () => {

  it('removeWidget removes it', () => {
    const panel = new ControllerPanel();
    panel.addWidget('joy1', 'joystick');
    panel.removeWidget('joy1');
    assert.deepEqual(panel.getWidgetNames(), []);
  });

  it('renameWidget preserves state and binding', () => {
    const panel = new ControllerPanel();
    panel.addWidget('joy1', 'joystick');
    panel.setJoystickInput('joy1', 42, -17);
    panel.bindToPart('joy1', 'pot1', 'x');
    panel.renameWidget('joy1', 'joystick_left');
    assert.deepEqual(panel.getWidgetNames(), ['joystick_left']);
    const w = panel.getWidget('joystick_left');
    assert.equal(w.state.x, 42);
    assert.equal(w.state.y, -17);
    assert.equal(w.binding.partId, 'pot1');
  });

  it('duplicate name throws', () => {
    const panel = new ControllerPanel();
    panel.addWidget('joy1', 'joystick');
    assert.throws(() => panel.addWidget('joy1', 'button'), /already exists/);
  });

  it('getWidgetsByType filters correctly', () => {
    const panel = new ControllerPanel();
    panel.addWidget('joy1', 'joystick');
    panel.addWidget('btn1', 'button');
    panel.addWidget('joy2', 'joystick');
    assert.deepEqual(panel.getWidgetsByType('joystick'), ['joy1', 'joy2']);
    assert.deepEqual(panel.getWidgetsByType('button'), ['btn1']);
  });
});

// ─── D-pad widget tests ───────────────────────────────────────────────────

describe('ControllerPanel — D-pad widget', () => {

  it('adds a dpad with default state (all directions false)', () => {
    const panel = new ControllerPanel();
    const w = panel.addWidget('dpad1', 'dpad');
    assert.equal(w.type, 'dpad');
    assert.equal(w.state.up, false);
    assert.equal(w.state.down, false);
    assert.equal(w.state.left, false);
    assert.equal(w.state.right, false);
  });

  it('setDpadInput sets direction state', () => {
    const panel = new ControllerPanel();
    panel.addWidget('dpad1', 'dpad');
    panel.setDpadInput('dpad1', 'up', true);
    panel.setDpadInput('dpad1', 'right', true);
    const w = panel.getWidget('dpad1');
    assert.equal(w.state.up, true);
    assert.equal(w.state.right, true);
    assert.equal(w.state.down, false);
    assert.equal(w.state.left, false);
  });

  it('setDpadInput rejects invalid direction', () => {
    const panel = new ControllerPanel();
    panel.addWidget('dpad1', 'dpad');
    assert.throws(() => panel.setDpadInput('dpad1', 'diagonal', true), /Invalid D-pad direction/);
  });

  it('getValue returns bitmask (up=1, down=2, left=4, right=8)', () => {
    const panel = new ControllerPanel();
    panel.addWidget('dpad1', 'dpad');
    assert.equal(panel.getValue('dpad1'), 0);
    panel.setDpadInput('dpad1', 'up', true);
    assert.equal(panel.getValue('dpad1'), 1);
    panel.setDpadInput('dpad1', 'right', true);
    assert.equal(panel.getValue('dpad1'), 1 | 8); // 9
    panel.setDpadInput('dpad1', 'down', true);
    assert.equal(panel.getValue('dpad1'), 1 | 2 | 8); // 11
  });

  it('getX returns -1/0/1 for dpad left/right', () => {
    const panel = new ControllerPanel();
    panel.addWidget('dpad1', 'dpad');
    assert.equal(panel.getX('dpad1'), 0);
    panel.setDpadInput('dpad1', 'right', true);
    assert.equal(panel.getX('dpad1'), 1);
    panel.setDpadInput('dpad1', 'left', true);
    assert.equal(panel.getX('dpad1'), 0); // both pressed = 0
    panel.setDpadInput('dpad1', 'right', false);
    assert.equal(panel.getX('dpad1'), -1);
  });

  it('getY returns -1/0/1 for dpad up/down', () => {
    const panel = new ControllerPanel();
    panel.addWidget('dpad1', 'dpad');
    assert.equal(panel.getY('dpad1'), 0);
    panel.setDpadInput('dpad1', 'up', true);
    assert.equal(panel.getY('dpad1'), 1);
    panel.setDpadInput('dpad1', 'down', true);
    assert.equal(panel.getY('dpad1'), 0); // both pressed = 0
    panel.setDpadInput('dpad1', 'up', false);
    assert.equal(panel.getY('dpad1'), -1);
  });

  it('isPressed returns true if any direction pressed', () => {
    const panel = new ControllerPanel();
    panel.addWidget('dpad1', 'dpad');
    assert.equal(panel.isPressed('dpad1'), false);
    panel.setDpadInput('dpad1', 'left', true);
    assert.equal(panel.isPressed('dpad1'), true);
    panel.setDpadInput('dpad1', 'left', false);
    assert.equal(panel.isPressed('dpad1'), false);
  });

  it('dpad resets on entering play mode', () => {
    const panel = new ControllerPanel();
    panel.addWidget('dpad1', 'dpad');
    panel.getWidget('dpad1').state.up = true;
    panel.getWidget('dpad1').state.right = true;
    panel.setMode('play');
    const w = panel.getWidget('dpad1');
    assert.equal(w.state.up, false);
    assert.equal(w.state.right, false);
  });

  it('dpad persists via toJSON/fromJSON', () => {
    const panel = new ControllerPanel();
    panel.addWidget('dpad1', 'dpad', {}, { x: 5, y: 10 });
    panel.bindToPart('dpad1', 'switch1', 'x');
    const json = panel.toJSON();
    const restored = ControllerPanel.fromJSON(json);
    const w = restored.getWidget('dpad1');
    assert.equal(w.type, 'dpad');
    assert.equal(w.layout.x, 5);
    assert.deepEqual(w.binding, { target: 'part', partId: 'switch1', param: 'x' });
  });
});

describe('ControllerPanel — D-pad world-facing binding', () => {

  it('dpad bound to part calls board.setControl on direction press', () => {
    const panel = new ControllerPanel();
    panel.addWidget('dpad1', 'dpad');
    panel.bindToPart('dpad1', 'switch1', 'x');

    const calls = [];
    const mockBoard = { setControl(partId, value) { calls.push({ partId, value }); } };
    const binding = bindPanelToBoard(panel, mockBoard);

    panel.setDpadInput('dpad1', 'right', true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].partId, 'switch1');
    // right pressed, no left → x = (1 + 1) / 2 = 1.0
    assert.equal(calls[0].value, 1.0);

    panel.setDpadInput('dpad1', 'right', false);
    assert.equal(calls.length, 2);
    // neither → x = (0 + 1) / 2 = 0.5
    assert.equal(calls[1].value, 0.5);

    binding.dispose();
  });

  it('dpad y-axis binding works', () => {
    const panel = new ControllerPanel();
    panel.addWidget('dpad1', 'dpad');
    panel.bindToPart('dpad1', 'pot1', 'y');

    const calls = [];
    const mockBoard = { setControl(partId, value) { calls.push({ partId, value }); } };
    const binding = bindPanelToBoard(panel, mockBoard);

    panel.setDpadInput('dpad1', 'up', true);
    assert.equal(calls[0].value, 1.0); // (1 + 1) / 2

    panel.setDpadInput('dpad1', 'down', true);
    assert.equal(calls[1].value, 0.5); // both pressed, (0 + 1) / 2

    binding.dispose();
  });
});

// ─── Button widget tests ──────────────────────────────────────────────────

describe('ControllerPanel — button widget', () => {

  it('momentary button press/release', () => {
    const panel = new ControllerPanel();
    panel.addWidget('btn1', 'button');
    panel.setButtonInput('btn1', true);
    assert.equal(panel.isPressed('btn1'), true);
    assert.equal(panel.getValue('btn1'), 1);
    panel.setButtonInput('btn1', false);
    assert.equal(panel.isPressed('btn1'), false);
    assert.equal(panel.getValue('btn1'), 0);
  });

  it('toggle button toggles on press, ignores release', () => {
    const panel = new ControllerPanel();
    panel.addWidget('btn1', 'button', { toggle: true });
    panel.setButtonInput('btn1', true);  // press → on
    assert.equal(panel.isPressed('btn1'), true);
    panel.setButtonInput('btn1', false); // release → still on
    assert.equal(panel.isPressed('btn1'), true);
    panel.setButtonInput('btn1', true);  // press again → off
    assert.equal(panel.isPressed('btn1'), false);
  });

  it('button world-facing binding calls setControl', () => {
    const panel = new ControllerPanel();
    panel.addWidget('btn1', 'button');
    panel.bindToPart('btn1', 'sw1');

    const calls = [];
    const mockBoard = { setControl(partId, value) { calls.push({ partId, value }); } };
    const binding = bindPanelToBoard(panel, mockBoard);

    panel.setButtonInput('btn1', true);
    assert.equal(calls[0].value, 1);
    panel.setButtonInput('btn1', false);
    assert.equal(calls[1].value, 0);

    binding.dispose();
  });
});

// ─── Slider widget tests ─────────────────────────────────────────────────

describe('ControllerPanel — slider widget', () => {

  it('slider input clamps to range', () => {
    const panel = new ControllerPanel();
    panel.addWidget('s1', 'slider', { min: 10, max: 50 });
    panel.setSliderInput('s1', 100);
    assert.equal(panel.getValue('s1'), 50);
    panel.setSliderInput('s1', -5);
    assert.equal(panel.getValue('s1'), 10);
    panel.setSliderInput('s1', 30);
    assert.equal(panel.getValue('s1'), 30);
  });

  it('slider world-facing binding normalizes to 0..1', () => {
    const panel = new ControllerPanel();
    panel.addWidget('s1', 'slider', { min: 0, max: 200 });
    panel.bindToPart('s1', 'pot1');

    const calls = [];
    const mockBoard = { setControl(partId, value) { calls.push({ partId, value }); } };
    const binding = bindPanelToBoard(panel, mockBoard);

    panel.setSliderInput('s1', 100);
    assert.equal(calls[0].value, 0.5); // 100/200

    panel.setSliderInput('s1', 200);
    assert.equal(calls[1].value, 1.0);

    panel.setSliderInput('s1', 0);
    assert.equal(calls[2].value, 0.0);

    binding.dispose();
  });
});

// ─── Dial widget tests ────────────────────────────────────────────────────

describe('ControllerPanel — dial widget', () => {

  it('dial input clamps to range', () => {
    const panel = new ControllerPanel();
    panel.addWidget('d1', 'dial', { min: 0, max: 360 });
    panel.setSliderInput('d1', 400);
    assert.equal(panel.getValue('d1'), 360);
    panel.setSliderInput('d1', -10);
    assert.equal(panel.getValue('d1'), 0);
  });

  it('dial world-facing binding normalizes to 0..1', () => {
    const panel = new ControllerPanel();
    panel.addWidget('d1', 'dial', { min: 0, max: 360 });
    panel.bindToPart('d1', 'pot2');

    const calls = [];
    const mockBoard = { setControl(partId, value) { calls.push({ partId, value }); } };
    const binding = bindPanelToBoard(panel, mockBoard);

    panel.setSliderInput('d1', 180);
    assert.equal(calls[0].value, 0.5); // 180/360

    binding.dispose();
  });
});

// ─── Project persistence round-trip ──────────────────────────────────────────
// Simulates the gui.jsx save/restore path: panel → toJSON → stc.controller →
// project load → fromJSON → replace widgets in a live panel.

describe('ControllerPanel — project persistence round-trip', () => {

  /** The same restore logic gui.jsx uses on PROJECT_LOADED. */
  function restoreIntoPanel(livePanel, controllerData) {
    const restored = ControllerPanel.fromJSON(controllerData);
    for (const name of livePanel.getWidgetNames()) {
      livePanel.removeWidget(name);
    }
    for (const w of restored.getWidgets()) {
      const added = livePanel.addWidget(w.name, w.type, w.config, w.layout);
      if (w.binding) added.binding = { ...w.binding };
    }
  }

  it('save → load restores all widget types with bindings', () => {
    // Build a panel with one of each widget type, each bound to a part
    const original = new ControllerPanel();
    original.addWidget('slider1', 'slider', { min: 0, max: 255, value: 128 }, { x: 10, y: 20 });
    original.bindToPart('slider1', 'pot1');
    original.addWidget('btn1', 'button', { toggle: true }, { x: 50, y: 20 });
    original.bindToPart('btn1', 'led1');
    original.addWidget('dpad1', 'dpad', {}, { x: 10, y: 80 });
    original.bindToPart('dpad1', 'switch1', 'x');
    original.addWidget('dial1', 'dial', { min: 0, max: 360 }, { x: 50, y: 80 });
    original.bindToPart('dial1', 'pot2');
    original.addWidget('joy1', 'joystick', {}, { x: 90, y: 50 });
    original.bindToPart('joy1', 'pot3', 'y');

    // Simulate project save: toJSON → stored in stc.controller
    const savedData = original.toJSON();

    // Simulate project load: restore into a fresh live panel
    const livePanel = new ControllerPanel();
    // Pre-populate with a stale widget to verify it gets replaced
    livePanel.addWidget('stale', 'button');
    restoreIntoPanel(livePanel, savedData);

    // Stale widget should be gone
    assert.equal(livePanel.getWidget('stale'), null);

    // All original widgets present with correct types and bindings
    assert.deepEqual(livePanel.getWidgetNames(), ['slider1', 'btn1', 'dpad1', 'dial1', 'joy1']);

    const s = livePanel.getWidget('slider1');
    assert.equal(s.type, 'slider');
    assert.equal(s.config.max, 255);
    assert.equal(s.layout.x, 10);
    assert.deepEqual(s.binding, { target: 'part', partId: 'pot1', param: null });

    const b = livePanel.getWidget('btn1');
    assert.equal(b.type, 'button');
    assert.equal(b.config.toggle, true);
    assert.deepEqual(b.binding, { target: 'part', partId: 'led1', param: null });

    const d = livePanel.getWidget('dpad1');
    assert.equal(d.type, 'dpad');
    assert.deepEqual(d.binding, { target: 'part', partId: 'switch1', param: 'x' });

    const dl = livePanel.getWidget('dial1');
    assert.equal(dl.type, 'dial');
    assert.equal(dl.config.max, 360);

    const j = livePanel.getWidget('joy1');
    assert.equal(j.type, 'joystick');
    assert.deepEqual(j.binding, { target: 'part', partId: 'pot3', param: 'y' });
  });

  it('restored panel bindings drive board.setControl', () => {
    // Build, serialize, restore
    const original = new ControllerPanel();
    original.addWidget('slider1', 'slider', { min: 0, max: 100 });
    original.bindToPart('slider1', 'pot1');
    const savedData = original.toJSON();

    const livePanel = new ControllerPanel();
    restoreIntoPanel(livePanel, savedData);

    // Bind to a mock board and verify inputs still drive it
    const calls = [];
    const mockBoard = { setControl(partId, value) { calls.push({ partId, value }); } };
    const binding = bindPanelToBoard(livePanel, mockBoard);

    livePanel.setSliderInput('slider1', 50);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].partId, 'pot1');
    assert.equal(calls[0].value, 0.5); // 50/100 normalized

    binding.dispose();
  });

  it('double restore does not duplicate widgets', () => {
    const original = new ControllerPanel();
    original.addWidget('btn1', 'button');
    const savedData = original.toJSON();

    const livePanel = new ControllerPanel();
    restoreIntoPanel(livePanel, savedData);
    restoreIntoPanel(livePanel, savedData); // restore again

    assert.deepEqual(livePanel.getWidgetNames(), ['btn1']);
  });

  it('corrupt/empty data does not crash fromJSON', () => {
    const livePanel = new ControllerPanel();
    livePanel.addWidget('safe', 'button');

    // fromJSON with bad data should throw; gui.jsx catches these
    assert.throws(() => ControllerPanel.fromJSON(null));
    assert.throws(() => ControllerPanel.fromJSON({}));

    // Panel should be untouched
    assert.deepEqual(livePanel.getWidgetNames(), ['safe']);
  });
});

// ─── Demo fixture: slider + toggle-button bound to parts ─────────────────────

describe('ControllerPanel — demo fixture (brightness slider + on/off button)', () => {

  const demoData = JSON.parse(
    readFileSync(join(__dirname, 'fixtures', 'controller-demo-panel.json'), 'utf8')
  );

  it('loads from the fixture JSON', () => {
    const panel = ControllerPanel.fromJSON(demoData);
    assert.deepEqual(panel.getWidgetNames(), ['brightness', 'onoff']);
    assert.equal(panel.getWidget('brightness').type, 'slider');
    assert.equal(panel.getWidget('onoff').type, 'button');
    assert.equal(panel.getWidget('onoff').config.toggle, true);
  });

  it('slider drives pot1, button drives led1 via board.setControl', () => {
    const panel = ControllerPanel.fromJSON(demoData);
    const calls = [];
    const mockBoard = { setControl(partId, value) { calls.push({ partId, value }); } };
    const binding = bindPanelToBoard(panel, mockBoard);

    // Slide brightness to 50% (128 out of 255)
    panel.setSliderInput('brightness', 128);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].partId, 'pot1');
    assert.ok(Math.abs(calls[0].value - 128 / 255) < 0.01);

    // Toggle the button on
    panel.setButtonInput('onoff', true);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].partId, 'led1');
    assert.equal(calls[1].value, 1);

    // Toggle it off (press again to toggle)
    panel.setButtonInput('onoff', true);
    assert.equal(calls.length, 3);
    assert.equal(calls[2].value, 0);

    binding.dispose();
  });

  it('round-trips through save → load preserving bindings', () => {
    const panel = ControllerPanel.fromJSON(demoData);
    // Modify a value
    panel.setSliderInput('brightness', 200);

    // Save → load
    const saved = panel.toJSON();
    const restored = ControllerPanel.fromJSON(saved);

    assert.deepEqual(restored.getWidgetNames(), ['brightness', 'onoff']);
    assert.deepEqual(
      restored.getWidget('brightness').binding,
      { target: 'part', partId: 'pot1', param: null }
    );
    assert.deepEqual(
      restored.getWidget('onoff').binding,
      { target: 'part', partId: 'led1', param: null }
    );
  });
});
