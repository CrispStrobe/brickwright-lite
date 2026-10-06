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

// The chip path, end to end: an ATtiny88 program built by avr-gcc from the C the
// vendored emitter produces (Lite's CI has no AVR compiler, so it is kept as a
// fixture; a changed emitter fails the hash check until it is rebuilt). The bench
// control moves the board; the chip's own sensor reads it; a name typed while the
// other script prints arrives whole (sb3-creator#57's full-duplex software UART).
test('ATtiny88: the chip reads the bench the control set, and a line typed during printing arrives', async () => {
    const {createHash} = await import('node:crypto');
    const {pathToFileURL} = await import('node:url');
    const {default: SB3Creator} = await import('../overlay/scratch-gui/src/lib/sb3-creator.js');
    const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/fixtures/b13/attiny88-temp-duplex.json'), 'utf8'));
    const c = new SB3Creator();
    c.parse(fixture.program);
    const code = c.generateC();
    assert.deepEqual(c._cWarnings || [], []);
    assert.equal(createHash('sha256').update(code).digest('hex'), fixture.codeSha256,
        'the emitter no longer produces the C this fixture was built from -- rebuild it');
    const bytes = Buffer.from(fixture.image, 'base64');
    const padded = Buffer.alloc(bytes.length + (bytes.length & 1));
    bytes.copy(padded);
    const {createAvr8jsAdapter} = await import(pathToFileURL(path.join(ROOT, 'node_modules/bw-board/src/avr8js-adapter.js')));
    // The board surface the adapter reads, with BoardImpl's setTemperature contract.
    const board = {
        temperatureC: 25, tNs: 0n,
        setTemperature (t) { board.temperatureC = t; },
        advanceTo (t) { board.tNs = BigInt(t); }, setPin () {}, readPin: () => 1, readAnalog: () => 0
    };
    assert.equal(applyBenchTemperature(board, 60), true);
    const adapter = createAvr8jsAdapter({chip: 'attiny88', program: new Uint16Array(padded.buffer, padded.byteOffset, padded.length / 2)});
    adapter.attachBoard(board);
    let out = '';
    adapter.onSerial((b) => { out += String.fromCharCode(b); });
    for (let i = 0; i < 30; i++) adapter.advanceNs(10_000_000);
    // 230 / 300 / 370 LSB at -40 / 25 / 85 C (8008H Table 17-2); the emitted C
    // turns counts back into degrees with that line.
    assert.match(out, /^Chip 60 C\r\nName\?\r\n/, JSON.stringify(out.slice(0, 40)));
    const before = out.length;
    assert.equal(adapter.sendSerial(Array.from('Ada\r', (ch) => ch.charCodeAt(0))), true);
    for (let i = 0; i < 20; i++) adapter.advanceNs(10_000_000);
    assert.ok(out.length > before + 50, 'the other script kept printing while the name came in');
    assert.match(out, /\r\nHi Ada\r\n/, 'the typed line arrived whole');
});
