import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

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
