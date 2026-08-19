/**
 * A WORKED faceplate example, proven end-to-end — the template for a triplet's
 * "code loop" side (the fleet clones this shape; the peer's micro:bit triplet is
 * the "widget + circuit + gate" side).
 *
 * A thermostat faceplate, built from EXISTING widgets so it works today:
 *   - slider  "setpoint"  → writes variable `setpoint`   (INPUT)
 *   - button  "heater"    → writes variable `heater`     (INPUT)
 *   - gauge   "temp"      ← reads  variable `temp`        (DISPLAY)
 * and a program (the WHEN-loop, simulated as a tick fn) that reads the inputs
 * and writes the display variable. Operating the panel drives the program;
 * the program drives the face. That is the whole device-faceplate contract.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ControllerPanel } from '../overlay/scratch-gui/src/lib/bw-board/controller.js';
import { bindPanelToVariables } from '../overlay/scratch-gui/src/lib/bw-board/controller-binding.js';

function mockVM(vars) {
    const variables = {};
    for (const [name, value] of Object.entries(vars)) variables['id_' + name] = { name, value };
    const stage = {
        variables,
        lookupVariableByNameAndType: (name) =>
            Object.values(variables).find((v) => v.name === name) || null,
    };
    const V = (n) => variables['id_' + n];
    return { vm: { runtime: { getTargetForStage: () => stage } }, get: (n) => V(n).value, set: (n, x) => { V(n).value = x; } };
}

// Build the thermostat faceplate: three placed widgets, three variable bindings.
function buildFaceplate() {
    const panel = new ControllerPanel();
    panel.addWidget('setpoint', 'slider', { min: 0, max: 40, value: 20 }, { x: 10, y: 10 });
    panel.addWidget('heater', 'button', { toggle: true }, { x: 10, y: 70 });
    panel.addWidget('temp', 'gauge', { min: 0, max: 40, value: 20 }, { x: 120, y: 10 });
    panel.bindToVariable('setpoint', 'setpoint');
    panel.bindToVariable('heater', 'heater');
    panel.bindToVariable('temp', 'temp');
    return panel;
}

// The program: one WHEN-loop tick. Heater on + below setpoint -> warm up a step.
function thermostatTick(io) {
    const t = Number(io.get('temp'));
    const target = Number(io.get('setpoint'));
    const on = Number(io.get('heater')) >= 1;
    let nt = t;
    if (on && t < target) nt = Math.min(target, t + 5);
    else if (!on && t > 0) nt = Math.max(0, t - 2);
    io.set('temp', nt);
}

test('faceplate: operating the panel drives the program, the program drives the face', () => {
    const io = mockVM({ setpoint: 20, heater: 0, temp: 20 });
    const panel = buildFaceplate();
    const b = bindPanelToVariables(panel, io.vm, { autoPump: false });

    // The user raises the setpoint and switches the heater ON — INPUT widgets.
    panel.setSliderInput('setpoint', 35);
    panel.setButtonInput('heater', true);
    assert.equal(io.get('setpoint'), 35, 'slider wrote the program variable');
    assert.equal(io.get('heater'), 1, 'button wrote the program variable');

    // The program runs a few ticks — temp climbs toward the setpoint.
    for (let i = 0; i < 4; i++) thermostatTick(io);
    assert.ok(io.get('temp') >= 35, `temp warmed to setpoint (${io.get('temp')})`);

    // The DISPLAY widget shows the program's value live (one poll pass).
    b.pump();
    assert.equal(panel.getValue('temp'), io.get('temp'), 'gauge face shows the live temp');

    // Switch the heater OFF (a toggle button flips on each press) -> the
    // program cools -> the face follows.
    panel.setButtonInput('heater', true);           // second press toggles it off
    assert.equal(io.get('heater'), 0, 'toggle button turned the heater off');
    for (let i = 0; i < 3; i++) thermostatTick(io);
    b.pump();
    assert.ok(panel.getValue('temp') < 35, 'face reflects the program cooling');
    b.dispose();
});

test('faceplate: the whole panel round-trips through the project (toJSON/fromJSON)', () => {
    const panel = buildFaceplate();
    const json = panel.toJSON();
    const restored = ControllerPanel.fromJSON(json);
    // widgets, layouts and variable bindings all survive
    assert.deepEqual(restored.getWidgetNames().sort(), ['heater', 'setpoint', 'temp']);
    const sp = restored.getWidget('setpoint');
    assert.equal(sp.binding.target, 'variable');
    assert.equal(sp.binding.variableName, 'setpoint');
    assert.equal(sp.layout.x, 10);
});
