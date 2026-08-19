/**
 * Controller panel — END-TO-END proof it does what it shall.
 *
 * The model + world-facing binding have unit tests; this proves the FULL LOOPS
 * a real session exercises, through the ACTUAL interfaces (the Scratch extension
 * a running program calls, and the runtime handoff the GUI tab uses):
 *
 *   1. user operates a widget  → a running PROGRAM reads the live value
 *      (through ControllerExtension.controllerX/Value/Pressed, not the model)
 *   2. a PROGRAM drives a widget → the panel updates (setWidget, animation)
 *   3. the GUI wiring: the extension resolves the panel from
 *      vm.runtime.controllerPanel — the exact handoff the host tab performs
 *   4. the COMPLETE two-way loop: one widget, read program-facing AND driving
 *      a hardware part world-facing at the same time — the Mindstorms contract.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ControllerPanel } from '../overlay/scratch-gui/src/lib/bw-board/controller.js';
import { ControllerExtension } from '../overlay/scratch-gui/src/lib/bw-board/controller-extension.js';
import { bindPanelToBoard } from '../overlay/scratch-gui/src/lib/bw-board/controller-binding.js';

describe('Controller E2E — a running program reads a live widget', () => {
  it('joystick: operating it changes what controllerX/Y report', () => {
    const panel = new ControllerPanel();
    panel.addWidget('joy1', 'joystick');
    const ext = new ControllerExtension();
    ext.setPanel(panel);

    assert.equal(ext.controllerX({ NAME: 'joy1' }), 0, 'starts centered');
    panel.setJoystickInput('joy1', 100, -100);            // user pushes the stick
    assert.equal(ext.controllerX({ NAME: 'joy1' }), 100, 'program sees live X');
    assert.equal(ext.controllerY({ NAME: 'joy1' }), -100, 'program sees live Y');
  });

  it('slider: controllerValue tracks the slider live', () => {
    const panel = new ControllerPanel();
    panel.addWidget('speed', 'slider');
    const ext = new ControllerExtension();
    ext.setPanel(panel);
    panel.setSliderInput('speed', 75);
    assert.equal(ext.controllerValue({ NAME: 'speed' }), 75);
  });

  it('button: controllerPressed tracks the button live', () => {
    const panel = new ControllerPanel();
    panel.addWidget('fire', 'button');
    const ext = new ControllerExtension();
    ext.setPanel(panel);
    assert.equal(ext.controllerPressed({ NAME: 'fire' }), false);
    panel.setButtonInput('fire', true);
    assert.equal(ext.controllerPressed({ NAME: 'fire' }), true);
  });

  it('no panel → blocks return safe defaults, never throw', () => {
    const ext = new ControllerExtension();
    assert.equal(ext.controllerX({ NAME: 'x' }), 0);
    assert.equal(ext.controllerPressed({ NAME: 'x' }), false);
  });
});

describe('Controller E2E — a program drives a widget (animation)', () => {
  it('setWidget moves the slider the panel reports', () => {
    const panel = new ControllerPanel();
    panel.addWidget('bar', 'slider');
    const ext = new ControllerExtension();
    ext.setPanel(panel);
    ext.setWidget({ NAME: 'bar', VALUE: 42 });
    assert.equal(panel.getValue('bar'), 42, 'the program moved the widget');
    assert.equal(ext.controllerValue({ NAME: 'bar' }), 42);
  });
});

describe('Controller E2E — the GUI handoff (vm.runtime.controllerPanel)', () => {
  it('the extension resolves the panel the host tab writes to the runtime', () => {
    const panel = new ControllerPanel();
    panel.addWidget('joy1', 'joystick');
    const ext = new ControllerExtension();
    // The host tab component writes the panel onto vm.runtime; the extension
    // has no explicit panel, so it must fall back to the runtime.
    ext._runtime = { controllerPanel: panel };
    panel.setJoystickInput('joy1', -50, 0);
    assert.equal(ext.controllerX({ NAME: 'joy1' }), -50, 'resolved via runtime handoff');
  });
});

describe('Controller E2E — the complete two-way loop', () => {
  it('one slider: read by a program AND driving a hardware part at once', () => {
    const panel = new ControllerPanel();
    panel.addWidget('throttle', 'slider');
    panel.bindToPart('throttle', 'pot1', 'value');   // world-facing

    const calls = [];
    const board = { setControl(partId, value) { calls.push({ partId, value }); } };
    const binding = bindPanelToBoard(panel, board);
    binding.sync();

    const ext = new ControllerExtension();            // program-facing
    ext.setPanel(panel);

    // User drags the slider to 80.
    panel.setSliderInput('throttle', 80);

    // (a) a running program reads it:
    assert.equal(ext.controllerValue({ NAME: 'throttle' }), 80, 'program sees 80');
    // (b) the hardware part is driven (slider 0..100 -> setControl):
    const last = calls[calls.length - 1];
    assert.equal(last.partId, 'pot1', 'the bound part was driven');
    assert.ok(last.value > 0, `part got a live value (${last.value})`);

    binding.dispose();
  });
});
