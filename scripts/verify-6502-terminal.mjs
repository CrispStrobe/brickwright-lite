#!/usr/bin/env node
/**
 * Headless gate: 6502 serial terminal faceplate.
 *
 * Proves the bidirectional loop: keyboard input → variable → program
 * processes → terminal output → variable → terminal face updates.
 * Exercises terminal + keyboard widget types end to end.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

import { ControllerPanel, WIDGET_TYPES } from '../overlay/scratch-gui/src/lib/bw-board/controller.js';
import { bindPanelToVariables } from '../overlay/scratch-gui/src/lib/bw-board/controller-binding.js';

// ── Helpers ─────────────────────────────────────────────────────────────

function loadPanel() {
  const json = JSON.parse(readFileSync(
    join(__dirname, '../overlay/scratch-gui/examples/6502-terminal/controller.json'),
    'utf8',
  ));
  return ControllerPanel.fromJSON(json);
}

/** Minimal VM mock with stage variables for bindPanelToVariables. */
function createMockVM() {
  const vars = {};
  return {
    runtime: {
      getTargetForStage() {
        return {
          variables: vars,
          lookupVariableByNameAndType(name) {
            for (const id of Object.keys(vars)) {
              if (vars[id].name === name) return vars[id];
            }
            return null;
          },
        };
      },
    },
    setVar(name, value) {
      for (const id of Object.keys(vars)) {
        if (vars[id].name === name) { vars[id].value = value; return; }
      }
      const id = 'v_' + name;
      vars[id] = { name, value, type: '' };
    },
    getVar(name) {
      for (const id of Object.keys(vars)) {
        if (vars[id].name === name) return vars[id].value;
      }
      return undefined;
    },
  };
}

/**
 * Simulate the terminal program: reads serial_in, echoes to serial_out,
 * accumulates a line buffer, processes commands on newline.
 */
function attachProgram(panel, vm) {
  let line = '';
  let serialOut = '6502 Terminal Ready\n> ';
  vm.setVar('serial_out', serialOut);
  vm.setVar('serial_in', '');

  function onEvent(event, detail) {
    if (event !== 'input') return;
    const w = panel.getWidget(detail.name);
    if (!w || w.type !== 'keyboard') return;

    const ch = w.state.value;
    if (!ch) return;

    // Echo the character
    serialOut += ch;
    line += ch;

    // On newline, process command
    if (ch === '\n') {
      const cmd = line.trim();
      if (cmd === 'hello') serialOut += 'Hello, world!\n';
      else if (cmd === 'help') serialOut += 'Commands: hello, help, clear\n';
      else if (cmd === 'clear') { serialOut = '> '; line = ''; vm.setVar('serial_out', serialOut); return; }
      line = '';
      serialOut += '> ';
    }

    vm.setVar('serial_out', serialOut);
  }

  panel.addListener(onEvent);
  return () => panel.removeListener(onEvent);
}

// ── Tests: Widget types ─────────────────────────────────────────────────

describe('terminal + keyboard widget types', () => {

  it('TERMINAL and KEYBOARD are in WIDGET_TYPES', () => {
    assert.equal(WIDGET_TYPES.TERMINAL, 'terminal');
    assert.equal(WIDGET_TYPES.KEYBOARD, 'keyboard');
  });

  it('terminal widget has correct defaults', () => {
    const panel = new ControllerPanel();
    const w = panel.addWidget('t', 'terminal');
    assert.equal(w.type, 'terminal');
    assert.equal(w.state.text, '');
    assert.equal(w.config.rows, 8);
    assert.equal(w.config.cols, 40);
  });

  it('keyboard widget has correct defaults', () => {
    const panel = new ControllerPanel();
    const w = panel.addWidget('k', 'keyboard');
    assert.equal(w.type, 'keyboard');
    assert.equal(w.state.value, '');
  });

  it('setTerminalText sets text and trims to rows', () => {
    const panel = new ControllerPanel();
    panel.addWidget('t', 'terminal', { rows: 3 });
    const lines = 'line1\nline2\nline3\nline4\nline5';
    panel.setTerminalText('t', lines);
    const text = panel.getWidget('t').state.text;
    assert.equal(text.split('\n').length, 3, 'trimmed to 3 rows');
    assert.ok(text.includes('line5'), 'keeps most recent lines');
    assert.ok(!text.includes('line1'), 'older lines scrolled off');
  });

  it('setKeyboardInput sets value and emits input', () => {
    const panel = new ControllerPanel();
    panel.addWidget('k', 'keyboard');
    const events = [];
    panel.addListener((ev, d) => { if (ev === 'input') events.push(d); });
    panel.setKeyboardInput('k', 'A');
    assert.equal(panel.getWidget('k').state.value, 'A');
    assert.equal(events.length, 1);
    assert.equal(events[0].value, 'A');
  });

  it('getValue returns text for terminal and value for keyboard', () => {
    const panel = new ControllerPanel();
    panel.addWidget('t', 'terminal');
    panel.addWidget('k', 'keyboard');
    panel.setTerminalText('t', 'output');
    panel.setKeyboardInput('k', 'X');
    assert.equal(panel.getValue('t'), 'output');
    assert.equal(panel.getValue('k'), 'X');
  });

  it('terminal round-trips through JSON', () => {
    const panel = new ControllerPanel();
    panel.addWidget('t', 'terminal', { rows: 6, cols: 30 });
    const json = panel.toJSON();
    const restored = ControllerPanel.fromJSON(json);
    const w = restored.getWidget('t');
    assert.equal(w.type, 'terminal');
    assert.equal(w.config.rows, 6);
    assert.equal(w.config.cols, 30);
  });

  it('keyboard round-trips through JSON', () => {
    const panel = new ControllerPanel();
    panel.addWidget('k', 'keyboard');
    const json = panel.toJSON();
    const restored = ControllerPanel.fromJSON(json);
    assert.equal(restored.getWidget('k').type, 'keyboard');
  });
});

// ── Tests: Binding pump ─────────────────────────────────────────────────

describe('terminal pump + keyboard binding', () => {

  it('terminal is a display — pump reads variable into widget', () => {
    const panel = new ControllerPanel();
    panel.addWidget('t', 'terminal');
    panel.bindToVariable('t', 'serial_out');
    panel.setMode('play');

    const vm = createMockVM();
    vm.setVar('serial_out', 'Hello\nWorld');
    const binding = bindPanelToVariables(panel, vm, { autoPump: false });

    binding.pump();
    assert.equal(panel.getWidget('t').state.text, 'Hello\nWorld');
    binding.dispose();
  });

  it('keyboard is an input — setKeyboardInput writes variable', () => {
    const panel = new ControllerPanel();
    panel.addWidget('k', 'keyboard');
    panel.bindToVariable('k', 'serial_in');
    panel.setMode('play');

    const vm = createMockVM();
    vm.setVar('serial_in', '');
    const binding = bindPanelToVariables(panel, vm, { autoPump: false });

    panel.setKeyboardInput('k', 'Z');
    assert.equal(vm.getVar('serial_in'), 'Z', 'keyboard writes to variable');
    binding.dispose();
  });

  it('pump regression: display with isDisplay but no pump branch never updates', () => {
    // This is the exact gap that bit sevenseg/oled — add terminal to pump
    const panel = new ControllerPanel();
    panel.addWidget('t', 'terminal');
    panel.bindToVariable('t', 'data');
    panel.setMode('play');

    const vm = createMockVM();
    vm.setVar('data', 'first');
    const binding = bindPanelToVariables(panel, vm, { autoPump: false });

    binding.pump();
    assert.equal(panel.getWidget('t').state.text, 'first');

    vm.setVar('data', 'first\nsecond');
    binding.pump();
    assert.equal(panel.getWidget('t').state.text, 'first\nsecond', 'updates on variable change');

    // Same value → no spurious update
    const events = [];
    panel.addListener((ev) => { if (ev === 'input') events.push(true); });
    binding.pump();
    assert.equal(events.length, 0, 'no update when variable unchanged');

    binding.dispose();
  });
});

// ── Tests: 6502 terminal faceplate ──────────────────────────────────────

describe('6502 terminal controller.json structure', () => {

  it('loads from JSON with 2 widgets', () => {
    const panel = loadPanel();
    assert.equal(panel.getWidgetNames().length, 2);
  });

  it('has 1 terminal + 1 keyboard', () => {
    const panel = loadPanel();
    const widgets = panel.getWidgets();
    assert.equal(widgets.filter(w => w.type === 'terminal').length, 1);
    assert.equal(widgets.filter(w => w.type === 'keyboard').length, 1);
  });

  it('terminal is variable-bound to serial_out', () => {
    const panel = loadPanel();
    const t = panel.getWidget('screen');
    assert.equal(t.binding.target, 'variable');
    assert.equal(t.binding.variableName, 'serial_out');
  });

  it('keyboard is variable-bound to serial_in', () => {
    const panel = loadPanel();
    const k = panel.getWidget('kbd');
    assert.equal(k.binding.target, 'variable');
    assert.equal(k.binding.variableName, 'serial_in');
  });
});

// ── Tests: Bidirectional loop ───────────────────────────────────────────

describe('6502 terminal — bidirectional loop', () => {

  it('typing a char reaches the terminal via the program', () => {
    const panel = loadPanel();
    panel.setMode('play');
    const vm = createMockVM();
    const dispose = attachProgram(panel, vm);
    const binding = bindPanelToVariables(panel, vm, { autoPump: false });

    // Type 'A'
    panel.setKeyboardInput('kbd', 'A');
    binding.pump();

    const termText = panel.getWidget('screen').state.text;
    assert.ok(termText.includes('A'), `terminal shows typed char: ${termText.slice(-30)}`);

    binding.dispose();
    dispose();
  });

  it('typing hello + Enter → Hello, world! response', () => {
    const panel = loadPanel();
    panel.setMode('play');
    const vm = createMockVM();
    const dispose = attachProgram(panel, vm);
    const binding = bindPanelToVariables(panel, vm, { autoPump: false });

    for (const ch of 'hello\n') {
      panel.setKeyboardInput('kbd', ch);
    }
    binding.pump();

    const termText = panel.getWidget('screen').state.text;
    assert.ok(termText.includes('Hello, world!'), `response on terminal: ${termText.slice(-60)}`);

    binding.dispose();
    dispose();
  });

  it('typing help + Enter → shows command list', () => {
    const panel = loadPanel();
    panel.setMode('play');
    const vm = createMockVM();
    const dispose = attachProgram(panel, vm);
    const binding = bindPanelToVariables(panel, vm, { autoPump: false });

    for (const ch of 'help\n') {
      panel.setKeyboardInput('kbd', ch);
    }
    binding.pump();

    const termText = panel.getWidget('screen').state.text;
    assert.ok(termText.includes('Commands:'), `help output: ${termText.slice(-80)}`);

    binding.dispose();
    dispose();
  });

  it('typing clear + Enter → resets terminal', () => {
    const panel = loadPanel();
    panel.setMode('play');
    const vm = createMockVM();
    const dispose = attachProgram(panel, vm);
    const binding = bindPanelToVariables(panel, vm, { autoPump: false });

    // Type some text first
    for (const ch of 'hello\n') {
      panel.setKeyboardInput('kbd', ch);
    }
    // Then clear
    for (const ch of 'clear\n') {
      panel.setKeyboardInput('kbd', ch);
    }
    binding.pump();

    const termText = panel.getWidget('screen').state.text;
    assert.ok(!termText.includes('Hello, world!'), 'Hello cleared');
    assert.ok(termText.includes('>'), 'prompt visible after clear');

    binding.dispose();
    dispose();
  });

  it('terminal scrolls to configured rows', () => {
    const panel = new ControllerPanel();
    panel.addWidget('t', 'terminal', { rows: 3 });
    panel.setTerminalText('t', 'L1\nL2\nL3\nL4\nL5');
    const text = panel.getWidget('t').state.text;
    const lines = text.split('\n');
    assert.equal(lines.length, 3, 'only 3 lines visible');
    assert.equal(lines[0], 'L3');
    assert.equal(lines[2], 'L5');
  });
});

describe('6502 terminal in examples/index.json', () => {

  it('registered with correct id and files', () => {
    const index = JSON.parse(readFileSync(
      join(__dirname, '../overlay/scratch-gui/examples/index.json'), 'utf8'));
    const entry = index.find(e => e.id === '6502-terminal');
    assert.ok(entry, 'entry exists');
    assert.equal(entry.kind, 'program');
    assert.ok(entry.files.program.includes('6502-terminal/program.bw'));
    assert.ok(entry.files.controller.includes('6502-terminal/controller.json'));
    assert.ok(entry.files.intro.includes('6502-terminal/intro.md'));
    assert.ok(entry.files.introDE.includes('6502-terminal/intro.de.md'));
  });
});
