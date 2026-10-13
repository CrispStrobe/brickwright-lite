/**
 * The Lite-native bwgpio extension (overlay/scratch-vm/.../crispstrobe/bwgpio):
 * generic GPIO pins that render in the palette and, when a green-flag script
 * runs them, drive the Widgets pane's GPIO strip through the same bw-fpga-leds /
 * bw-fpga-output events the Forth-on-DOS run's onPortAccess bridge dispatches
 * (pseudocode-importer.jsx). This holds:
 *   1. getInfo declares `setpin` (command) and `readpin` (reporter), each backed
 *      by a real method — a block with no implementation loads and does nothing;
 *   2. `setpin` dispatches bw-fpga-leds {pins} and bw-fpga-output {leds:[{pin,high}]};
 *   3. `readpin` returns the last value written to a pin (0 until driven);
 *   4. a value of 0 is low, any non-zero is high, and the pin index is clamped 0-7.
 * The text ⇄ Forth round-trip is held in code-tab-forth.test.mjs; that the
 * bundle is classified and loads is held in bundled-extensions-match-upstream.
 *
 * Self-contained: the extension is evaluated with tiny stubs for the scratch-vm
 * support modules, so this runs without the integrated VM tree (the shared
 * helper's loadExtensionClass needs `npm run integrate` first). The stubs match
 * the only surface the extension touches (ArgumentType/BlockType constants,
 * Cast.toNumber, formatMessage.setup().locale).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXT = path.join(ROOT, 'overlay/scratch-vm/src/extensions/crispstrobe/bwgpio/index.js');

const STUBS = {
    'argument-type': {STRING: 'string', NUMBER: 'number'},
    'block-type': {COMMAND: 'command', REPORTER: 'reporter'},
    cast: {toNumber: v => { const n = Number(v); return Number.isFinite(n) ? n : 0; }},
    'format-message': Object.assign(() => '', {setup: () => ({locale: 'en'})})
};
const loadExtClass = () => {
    const module_ = {exports: {}};
    // eslint-disable-next-line no-new-func
    new Function('require', 'module', 'exports',
        fs.readFileSync(EXT, 'utf8'))(spec => STUBS[path.basename(spec)], module_, module_.exports);
    return module_.exports;
};

// The extension reaches for the browser's window/CustomEvent; stub them so a
// node run can observe what it dispatches, and restore afterwards.
const withWindow = fn => {
    const events = [];
    const priorWindow = globalThis.window;
    const priorCE = globalThis.CustomEvent;
    globalThis.CustomEvent = class { constructor (type, init) { this.type = type; this.detail = init && init.detail; } };
    globalThis.window = {dispatchEvent: ev => { events.push(ev); return true; }};
    try { return fn(events); } finally {
        if (priorWindow === undefined) delete globalThis.window; else globalThis.window = priorWindow;
        if (priorCE === undefined) delete globalThis.CustomEvent; else globalThis.CustomEvent = priorCE;
    }
};

const Cls = loadExtClass();

test('bwgpio: every declared opcode has a matching method', () => {
    const inst = new Cls({});
    const info = inst.getInfo();
    assert.equal(info.id, 'bwgpio');
    const opcodes = (info.blocks || []).map(b => b.opcode).sort();
    assert.deepEqual(opcodes, ['readpin', 'setpin']);
    for (const op of opcodes) assert.equal(typeof inst[op], 'function', `opcode "${op}" has no method`);
    // The pin menu is the numeric strip 0-7.
    assert.deepEqual(info.menus.pins.items, ['0', '1', '2', '3', '4', '5', '6', '7']);
});

test('bwgpio: setpin lights the GPIO strip and records the level', () => withWindow(events => {
    const ext = new Cls({});
    ext.setpin({PIN: '3', VALUE: 1});
    const leds = events.find(e => e.type === 'bw-fpga-leds');
    const out = events.find(e => e.type === 'bw-fpga-output');
    assert.ok(leds && leds.detail.pins.includes(3), 'bw-fpga-leds did not list pin 3');
    assert.ok(out && out.detail.leds[0].pin === 3 && out.detail.leds[0].high === true, 'bw-fpga-output not high on pin 3');
    assert.equal(ext.readpin({PIN: '3'}), 1);
    // A later pin accumulates into the strip; 0 is low.
    ext.setpin({PIN: '5', VALUE: 0});
    const leds2 = events.filter(e => e.type === 'bw-fpga-leds').pop();
    assert.deepEqual(leds2.detail.pins, [3, 5]);
    const out2 = events.filter(e => e.type === 'bw-fpga-output').pop();
    assert.equal(out2.detail.leds[0].high, false);
    assert.equal(ext.readpin({PIN: '5'}), 0);
}));

test('bwgpio: readpin is 0 until the pin is driven, and an arbitrary value survives', () => withWindow(() => {
    const ext = new Cls({});
    assert.equal(ext.readpin({PIN: '2'}), 0);
    ext.setpin({PIN: '2', VALUE: 42});
    assert.equal(ext.readpin({PIN: '2'}), 42);
}));

test('bwgpio: the pin index is clamped to 0-7', () => withWindow(() => {
    const ext = new Cls({});
    ext.setpin({PIN: '99', VALUE: 1});   // -> pin 7
    ext.setpin({PIN: '-4', VALUE: 1});   // -> pin 0
    assert.equal(ext.readpin({PIN: '7'}), 1);
    assert.equal(ext.readpin({PIN: '0'}), 1);
}));
