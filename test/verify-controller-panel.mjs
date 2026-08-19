/**
 * Headless gate: calculator faceplate via controller panel.
 *
 * Loads the calculator controller.json, clicks digit+op+= buttons
 * via the panel API, and verifies the OLED widget shows the running
 * expression and result.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

import { ControllerPanel, WIDGET_TYPES } from '../overlay/scratch-gui/src/lib/bw-board/controller.js';

// ── Helpers ─────────────────────────────────────────────────────────────

function loadCalcPanel() {
  const json = JSON.parse(readFileSync(
    join(__dirname, '../overlay/scratch-gui/examples/mb05-faceplate-calc/controller.json'),
    'utf8',
  ));
  return ControllerPanel.fromJSON(json);
}

/**
 * Simulate the calculator program: listen for button presses via events,
 * build expression, evaluate on =, update the OLED display.
 * Returns a dispose function.
 */
function attachCalcProgram(panel, state) {
  const BUTTON_MAP = {
    btn0: '0', btn1: '1', btn2: '2', btn3: '3', btn4: '4',
    btn5: '5', btn6: '6', btn7: '7', btn8: '8', btn9: '9',
    btnDot: '.', btnAdd: ' + ', btnSub: ' - ', btnMul: ' * ', btnDiv: ' / ',
  };

  function onEvent(event, detail) {
    if (event !== 'input' || !detail.pressed) return;
    const { name } = detail;

    if (name === 'btnEq') {
      try {
        const result = Function('"use strict"; return (' + state.expression + ')')();
        state.result = String(result);
        panel.setOledText('display', state.expression + '\n= ' + state.result);
      } catch {
        panel.setOledText('display', 'Error');
      }
      return;
    }

    if (name === 'btnC') {
      state.expression = '';
      state.result = '';
      panel.setOledText('display', 'Ready');
      return;
    }

    if (BUTTON_MAP[name] !== undefined) {
      state.expression += BUTTON_MAP[name];
      panel.setOledText('display', state.expression);
    }
  }

  panel.addListener(onEvent);
  return () => panel.removeListener(onEvent);
}

/** Simulate pressing a button widget (momentary: press then release). */
function pressButton(panel, name) {
  panel.setButtonInput(name, true);
  panel.setButtonInput(name, false);
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('OLED widget type', () => {

  it('OLED is in WIDGET_TYPES', () => {
    assert.equal(WIDGET_TYPES.OLED, 'oled');
  });

  it('addWidget creates oled with default state', () => {
    const panel = new ControllerPanel();
    const w = panel.addWidget('disp', 'oled');
    assert.equal(w.type, 'oled');
    assert.equal(w.state.text, '');
    assert.equal(w.config.rows, 4);
    assert.equal(w.config.cols, 21);
  });

  it('setOledText sets text content', () => {
    const panel = new ControllerPanel();
    panel.addWidget('disp', 'oled');
    panel.setOledText('disp', 'Hello\nWorld');
    assert.equal(panel.getWidget('disp').state.text, 'Hello\nWorld');
  });

  it('getOledRows returns padded rows', () => {
    const panel = new ControllerPanel();
    panel.addWidget('disp', 'oled');
    panel.setOledText('disp', 'Line1\nLine2');
    const rows = panel.getOledRows('disp');
    assert.equal(rows.length, 4);
    assert.equal(rows[0].length, 21);
    assert.ok(rows[0].startsWith('Line1'));
    assert.ok(rows[1].startsWith('Line2'));
    assert.equal(rows[2].trim(), '');  // empty rows
    assert.equal(rows[3].trim(), '');
  });

  it('getValue returns text string for oled', () => {
    const panel = new ControllerPanel();
    panel.addWidget('disp', 'oled');
    panel.setOledText('disp', 'test');
    assert.equal(panel.getValue('disp'), 'test');
  });

  it('oled emits input event on text change', () => {
    const panel = new ControllerPanel();
    panel.addWidget('disp', 'oled');
    const events = [];
    panel.addListener((ev, detail) => { if (ev === 'input') events.push(detail); });
    panel.setOledText('disp', 'hello');
    assert.equal(events.length, 1);
    assert.equal(events[0].text, 'hello');
  });

  it('oled round-trips through JSON', () => {
    const panel = new ControllerPanel();
    panel.addWidget('disp', 'oled', { rows: 4, cols: 21 });
    panel.setOledText('disp', 'Saved');
    const json = panel.toJSON();
    const restored = ControllerPanel.fromJSON(json);
    const w = restored.getWidget('disp');
    assert.equal(w.type, 'oled');
    assert.equal(w.config.rows, 4);
    assert.equal(w.config.cols, 21);
  });
});

describe('Calculator faceplate controller.json', () => {

  it('loads from JSON with 18 widgets', () => {
    const panel = loadCalcPanel();
    const names = panel.getWidgetNames();
    assert.equal(names.length, 18, `expected 18 widgets, got ${names.length}: ${names.join(', ')}`);
  });

  it('has 17 buttons + 1 oled', () => {
    const panel = loadCalcPanel();
    const buttons = panel.getWidgets().filter(w => w.type === 'button');
    const oleds = panel.getWidgets().filter(w => w.type === 'oled');
    assert.equal(buttons.length, 17);
    assert.equal(oleds.length, 1);
  });

  it('all buttons are variable-bound', () => {
    const panel = loadCalcPanel();
    for (const w of panel.getWidgets()) {
      if (w.type === 'button') {
        assert.ok(w.binding, `${w.name} has binding`);
        assert.equal(w.binding.target, 'variable', `${w.name} is variable-bound`);
      }
    }
  });

  it('oled display is variable-bound to oled_text', () => {
    const panel = loadCalcPanel();
    const oled = panel.getWidget('display');
    assert.ok(oled);
    assert.equal(oled.binding.target, 'variable');
    assert.equal(oled.binding.variableName, 'oled_text');
  });
});

describe('Calculator faceplate — headless sim', () => {

  it('pressing 1 + 2 = shows expression and result on OLED', () => {
    const panel = loadCalcPanel();
    panel.setMode('play');
    const state = { expression: '', result: '' };
    const dispose = attachCalcProgram(panel, state);

    pressButton(panel, 'btn1');
    assert.equal(state.expression, '1');

    pressButton(panel, 'btnAdd');
    assert.equal(state.expression, '1 + ');

    pressButton(panel, 'btn2');
    assert.equal(state.expression, '1 + 2');

    pressButton(panel, 'btnEq');
    assert.equal(state.result, '3');

    const oled = panel.getWidget('display');
    assert.ok(oled.state.text.includes('1 + 2'), `expression on OLED: ${oled.state.text}`);
    assert.ok(oled.state.text.includes('= 3'), `result on OLED: ${oled.state.text}`);
    dispose();
  });

  it('pressing C clears and shows Ready', () => {
    const panel = loadCalcPanel();
    panel.setMode('play');
    const state = { expression: '', result: '' };
    const dispose = attachCalcProgram(panel, state);

    pressButton(panel, 'btn5');
    assert.equal(state.expression, '5');

    pressButton(panel, 'btnC');
    assert.equal(state.expression, '');
    assert.equal(panel.getWidget('display').state.text, 'Ready');
    dispose();
  });

  it('6 * 7 = 42', () => {
    const panel = loadCalcPanel();
    panel.setMode('play');
    const state = { expression: '', result: '' };
    const dispose = attachCalcProgram(panel, state);

    pressButton(panel, 'btn6');
    pressButton(panel, 'btnMul');
    pressButton(panel, 'btn7');
    pressButton(panel, 'btnEq');

    assert.equal(state.result, '42');
    const oled = panel.getWidget('display');
    assert.ok(oled.state.text.includes('6 * 7'));
    assert.ok(oled.state.text.includes('= 42'));
    dispose();
  });

  it('decimal: 3.14 + 2.86 = 6', () => {
    const panel = loadCalcPanel();
    panel.setMode('play');
    const state = { expression: '', result: '' };
    const dispose = attachCalcProgram(panel, state);

    for (const btn of ['btn3', 'btnDot', 'btn1', 'btn4', 'btnAdd', 'btn2', 'btnDot', 'btn8', 'btn6']) {
      pressButton(panel, btn);
    }
    pressButton(panel, 'btnEq');

    assert.equal(state.result, '6');
    assert.ok(panel.getWidget('display').state.text.includes('= 6'));
    dispose();
  });

  it('OLED rows are readable via getOledRows', () => {
    const panel = loadCalcPanel();
    panel.setMode('play');
    const state = { expression: '', result: '' };
    const dispose = attachCalcProgram(panel, state);

    pressButton(panel, 'btn9');
    pressButton(panel, 'btnAdd');
    pressButton(panel, 'btn1');
    pressButton(panel, 'btnEq');

    const rows = panel.getOledRows('display');
    assert.equal(rows.length, 4);
    assert.ok(rows[0].trimEnd().includes('9 + 1'), `row 0: "${rows[0].trimEnd()}"`);
    assert.ok(rows[1].trimEnd().includes('= 10'), `row 1: "${rows[1].trimEnd()}"`);
    dispose();
  });
});
