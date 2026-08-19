/**
 * Live variable binding — "show and change variable values per the widgets".
 * Input widgets WRITE a program variable on operation; display widgets READ a
 * variable and show it (polled). Tested against a mock scratch-vm stage.
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
        lookupVariableByNameAndType(name) {
            return Object.values(variables).find((v) => v.name === name) || null;
        },
    };
    return { runtime: { getTargetForStage: () => stage }, _stage: stage };
}

test('input widget WRITES its variable live (turn the knob -> variable changes)', () => {
    const vm = mockVM({ speed: 0 });
    const panel = new ControllerPanel();
    panel.addWidget('throttle', 'slider', { min: 0, max: 255, value: 0 });
    panel.bindToVariable('throttle', 'speed');
    const b = bindPanelToVariables(panel, vm, { autoPump: false });

    panel.setSliderInput('throttle', 200);           // user drags the slider
    assert.equal(vm._stage.variables.id_speed.value, 200, 'program variable updated live');

    panel.setSliderInput('throttle', 55);
    assert.equal(vm._stage.variables.id_speed.value, 55);
    b.dispose();
});

test('display widget SHOWS its variable live (program sets it -> face updates)', () => {
    const vm = mockVM({ score: 0 });
    const panel = new ControllerPanel();
    panel.addWidget('scoreboard', 'gauge', { min: 0, max: 1000, value: 0 });
    panel.bindToVariable('scoreboard', 'score');
    const b = bindPanelToVariables(panel, vm, { autoPump: false });

    vm._stage.variables.id_score.value = 750;        // program raises the score
    b.pump();                                        // one poll pass
    assert.equal(panel.getValue('scoreboard'), 750, 'gauge shows the variable');
    b.dispose();
});

test('a button widget writes 1/0 to its variable', () => {
    const vm = mockVM({ firing: 0 });
    const panel = new ControllerPanel();
    panel.addWidget('fire', 'button');
    panel.bindToVariable('fire', 'firing');
    const b = bindPanelToVariables(panel, vm, { autoPump: false });

    panel.setButtonInput('fire', true);
    assert.equal(vm._stage.variables.id_firing.value, 1);
    panel.setButtonInput('fire', false);
    assert.equal(vm._stage.variables.id_firing.value, 0);
    b.dispose();
});

test('dispose stops the live sync (no zombie writes)', () => {
    const vm = mockVM({ x: 0 });
    const panel = new ControllerPanel();
    panel.addWidget('s', 'slider', { min: 0, max: 100, value: 0 });
    panel.bindToVariable('s', 'x');
    const b = bindPanelToVariables(panel, vm, { autoPump: false });
    b.dispose();
    panel.setSliderInput('s', 99);
    assert.equal(vm._stage.variables.id_x.value, 0, 'no writes after dispose');
});

// ── Matrix display through the live variable binding — the faceplate
// triplet's read half: the program writes `screen`, the pump renders it.

test('matrix display SHOWS a variable live (bitmask pump)', () => {
    const vm = mockVM({ screen: 0 });
    const panel = new ControllerPanel();
    panel.addWidget('scr', 'matrix');
    panel.bindToVariable('scr', 'screen');
    const b = bindPanelToVariables(panel, vm, { autoPump: false });

    b.pump();
    assert.equal(panel.getValue('scr'), 0);
    vm._stage.variables.id_screen.value = 0b10001;
    b.pump();
    assert.equal(panel.getValue('scr'), 0b10001, 'bitmask pumped into the face');
    b.dispose();
});

test('sevenseg display SHOWS a variable live (numeric pump)', () => {
    const vm = mockVM({ shown: 0 });
    const panel = new ControllerPanel();
    panel.addWidget('num', 'sevenseg');
    panel.bindToVariable('num', 'shown');
    const b = bindPanelToVariables(panel, vm, { autoPump: false });
    b.pump();
    assert.equal(panel.getValue('num'), 0);
    vm._stage.variables.id_shown.value = 168;
    b.pump();
    assert.equal(panel.getValue('num'), 168, 'number pumped into the face');
    b.dispose();
});
