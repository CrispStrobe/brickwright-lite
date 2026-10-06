/**
 * Task B13 of docs/OPEN-TASKS-2026-09-29.md -- the bench temperature.
 *
 * bw-board solves the chips' on-die sensors and every temperature-dependent
 * part against board.temperatureC, and board.setTemperature(c) moves it. Until
 * B13 nothing in the app called it: `chip temperature` read 25 C on every board
 * whatever the learner did. The Circuit tab now carries a bench-temperature
 * control (lib/bench-temperature.js) and applies it to every board it shows.
 *
 * Executed here: the module against a real BoardImpl, the bundled VM reporter
 * reading a board the control moved, and the tab's wiring at the three places
 * a board can appear (the designer's board, a debug runner's, the control).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {BoardImpl} from 'bw-board';

import {
    BENCH_DEFAULT_C, BENCH_MAX_C, BENCH_MIN_C, applyBenchTemperature, clampBenchTemperature,
    loadBenchTemperature, saveBenchTemperature
} from '../overlay/scratch-gui/src/lib/bench-temperature.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const TAB = fs.readFileSync(path.join(ROOT, 'overlay/scratch-gui/src/components/tw-pseudocode/circuit-tab.jsx'), 'utf8');

/** A class method's body, `    name (args) {` to its closing brace at the same indent. */
const method = (source, header) => {
    const start = source.indexOf(`    ${header} {`);
    assert.ok(start >= 0, `method ${header} is gone`);
    return source.slice(source.indexOf('{', start) + 1, source.indexOf('\n    }\n', start));
};

const memoryStorage = () => {
    const m = new Map();
    return {getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v))};
};

test('the value: whole degrees inside the sensors\' range, and nothing for a non-number', () => {
    assert.equal(clampBenchTemperature('37'), 37);
    assert.equal(clampBenchTemperature(36.6), 37);
    assert.equal(clampBenchTemperature(-80), BENCH_MIN_C);
    assert.equal(clampBenchTemperature('200'), BENCH_MAX_C);
    for (const v of ['', '-', 'abc', null, undefined, NaN]) assert.equal(clampBenchTemperature(v), null, String(v));
});

test('the setting is the viewer\'s own, and survives storage that throws', () => {
    const s = memoryStorage();
    assert.equal(loadBenchTemperature(s), BENCH_DEFAULT_C);
    saveBenchTemperature(60, s);
    assert.equal(loadBenchTemperature(s), 60);
    const throwing = {getItem () { throw new Error('denied'); }, setItem () { throw new Error('denied'); }};
    assert.equal(loadBenchTemperature(throwing), BENCH_DEFAULT_C);
    assert.doesNotThrow(() => saveBenchTemperature(60, throwing));
});

test('a real board moves, re-solves once, and is not re-solved for the value it already has', () => {
    const board = new BoardImpl();
    assert.equal(board.temperatureC, 25, 'the engine\'s default bench');
    let solves = 0;
    const solve = board._solve.bind(board);
    board._solve = (...a) => { solves++; return solve(...a); };
    assert.equal(applyBenchTemperature(board, 60), true);
    assert.equal(board.temperatureC, 60);
    assert.equal(solves, 1);
    assert.equal(applyBenchTemperature(board, 60), false);
    assert.equal(solves, 1, 'an unchanged value is not re-applied');
    assert.equal(applyBenchTemperature(null, 60), false);
    assert.equal(applyBenchTemperature({temperatureC: 25}, 60), false, 'a board without setTemperature is left alone');
});

test('the VM: the bundled stc12 reporter reads the temperature the control set', () => {
    const src = fs.readFileSync(path.join(ROOT, 'overlay/scratch-vm/src/extensions/crispstrobe/stc12/index.js'), 'utf8');
    const inner = JSON.parse(src.match(/makeExt\(("(?:[^"\\]|\\.)*")\)/)[1]);
    const board = new BoardImpl();
    let ext;
    const Scratch = {
        Cast: {toNumber: Number, toString: String, toBoolean: Boolean},
        BlockType: {COMMAND: 'c', REPORTER: 'r', BOOLEAN: 'b', HAT: 'h', EVENT: 'e'},
        ArgumentType: {STRING: 's', NUMBER: 'n', BOOLEAN: 'b'},
        vm: {runtime: {circuitBoard: board, on () {}, stc: {pins: []}}},
        extensions: {register: (e) => { ext = e; }, unsandboxed: true}, translate: (x) => x
    };
    Function('Scratch', inner)(Scratch);
    assert.equal(ext.chiptemp(), 25, 'before: the default bench, the only value the app could show until B13');
    applyBenchTemperature(board, 60);
    assert.equal(ext.chiptemp(), 60);
    applyBenchTemperature(board, -10);
    assert.equal(ext.chiptemp(), -10);
});

test('the Circuit tab applies the setting wherever a board appears, and shows the control', () => {
    assert.match(TAB, /benchC: loadBenchTemperature\(\)/, 'the setting is loaded with the tab');
    assert.match(method(TAB, 'handleRunnerChange (runner, ui)'),
        /const board = runner\.board\(\);\s*\/\/[^\n]*\n\s*applyBenchTemperature\(board, this\.state\.benchC\);/,
        'a debug runner\'s board gets the bench temperature before anything shows it');
    const from = TAB.indexOf('onBoardReady={(board) => {');
    assert.ok(from > 0, 'onBoardReady is gone');
    const ready = TAB.slice(from, TAB.indexOf('simulationOnly=', from));
    const applied = ready.indexOf('applyBenchTemperature(board, this.state.benchC)');
    const published = ready.indexOf('vm.runtime.circuitBoard = board');
    assert.ok(applied >= 0 && published > applied, 'the designer\'s board is set before the VM can read it');
    const handler = method(TAB, 'handleBenchTemperature (value)');
    for (const reach of ['this.state.board', 'window.__board', 'vm.runtime.circuitBoard']) {
        assert.ok(handler.includes(reach), `the control reaches ${reach}`);
    }
    assert.match(handler, /for \(const board of boards\) applyBenchTemperature\(board, c\);/);
    assert.match(handler, /saveBenchTemperature\(c\)/);
    const strip = method(TAB, 'renderPanelStrip ()');
    assert.match(strip, /data-bench-temperature/);
    assert.match(strip, /onChange=\{e => \{[\s\S]*this\.handleBenchTemperature\(e\.target\.value\)/);
});
