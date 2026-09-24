/**
 * The C tab's ▶ Run sketch on the AVR boards — a hand-written Arduino sketch,
 * compiled as real C++ by stc-compiler's `arduino` route and booted on the
 * board's own engine through the debug panel's firmware path.
 *
 * Three layers, each with its own evidence:
 *
 *   1. THE ROUTE (lib/bw-debug/arduino-sketch.js), driven with a fake compile:
 *      which boards it serves and on which engine, what it sends, how a
 *      refusal is told apart from a dead network, and which clock the image is
 *      simulated at.
 *
 *   2. THE ENGINES. Real sketch images, compiled by the service and kept in
 *      test/fixtures/arduino-sketch-images.json, run on the PINNED bw-board
 *      exactly as attachAvr8js runs a firmware image: createDebugTarget(kind,
 *      {hex, symbols: null, clockHz}). The Uno must print what its C++ says
 *      over the USART; the ATtinys have no USART, so their LED must blink at
 *      the rate the sketch asks for -- at their 8 MHz crystal, which is why the
 *      firmware carries its clock.
 *
 *   3. THE WIRING, by source: the button is gated by the route's own table,
 *      the compile is the component's one hosted compile, the panel boots the
 *      image as firmware on the named engine, and a firmware image with no
 *      symbols and a project with no pins reach the AVR attach without
 *      throwing.
 *
 * And one HELD GAP: the Mega is left out of the route because the pinned
 * bw-board cannot run a compiled Mega program (see the test's message). The
 * test asserts it is STILL broken, so the pin bump that fixes it goes red here
 * and says what to do.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {packageSourceRoot} from './helpers/package-source.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(REPO, 'overlay/scratch-gui/src');
const read = rel => readFileSync(path.join(SRC, rel), 'utf8');

const route = await import(pathToFileURL(path.join(SRC, 'lib/bw-debug/arduino-sketch.js')).href);
const {arduinoSketchExamplesFor} =
    await import(pathToFileURL(path.join(SRC, 'lib/bw-asm/examples.js')).href);
const fixtures = JSON.parse(readFileSync(
    path.join(REPO, 'test/fixtures/arduino-sketch-images.json'), 'utf8')).images;

const b64 = s => Buffer.from(s, 'latin1').toString('base64');

// --------------------------------------------------------------- the route

test('the route serves the Uno/Nano family and the ATtinys, each on its own engine', () => {
    const table = Object.fromEntries(Object.entries(route.ARDUINO_SKETCH_BOARDS)
        .map(([id, b]) => [id, `${b.target}|${b.kind}|${b.clockHz}`]));
    assert.deepEqual(table, {
        'arduino-uno': 'arduino-uno|avr8js|16000000',
        'arduino-nano': 'arduino-nano|avr8js|16000000',
        atmega328p: 'atmega328p|avr8js|16000000',
        atmega168p: 'atmega168p|avr8js|16000000',
        attiny85: 'attiny85|attiny85|8000000',
        attiny88: 'attiny88|attiny88|8000000'
    });
    assert.equal(route.sketchBoardFor('ARDUINO-UNO').kind, 'avr8js', 'lookup is case-insensitive');
    for (const other of ['stc12c5a60s2', 'pico', 'riscv32', 'i8086', '', null]) {
        assert.equal(route.sketchBoardFor(other), null, `${other} must not get a sketch button`);
    }
});

test('the engine for each board is the one the debug panel picks for that device', () => {
    // debug-panel's syncDeviceKind: device-specific kinds first, else the
    // 'arduino' core's avr8js. A sketch must land where a blocks program for
    // the same board would, not on whatever the panel was last left on.
    const panel = read('components/tw-pseudocode/debug-panel.jsx');
    for (const [id, b] of Object.entries(route.ARDUINO_SKETCH_BOARDS)) {
        const specific = new RegExp(`['"]?${id}['"]?: '([a-z0-9]+)'`).exec(
            panel.slice(panel.indexOf('const DEVICE_TO_KIND'), panel.indexOf('const CORE_TO_KIND')));
        assert.equal(b.kind, specific ? specific[1] : 'avr8js', `${id}: route and panel disagree`);
    }
});

test('a build asks the one hosted compile for an arduino-language hex', async () => {
    const calls = [];
    const hex = ':00000001FF\n';
    const built = await route.requestSketchBuild({
        source: 'void setup(){}\nvoid loop(){}\n', device: 'arduino-nano',
        compile: async (...args) => {
            calls.push(args);
            return {base64: b64(':020000000C94FF\n' + hex), f_cpu: 16000000,
                prototypes: ['void setup();', 'void loop();'], libraries: ['Wire'], log: ''};
        }
    });
    assert.deepEqual(calls, [['void setup(){}\nvoid loop(){}\n', 'arduino-nano', 'hex', 'arduino']]);
    assert.equal(built.kind, 'avr8js');
    assert.equal(built.bytes, 2, 'bytes counts data records, not text');
    assert.deepEqual(built.libraries, ['Wire']);
    assert.deepEqual(route.sketchFirmware(built),
        {name: 'sketch.hex', bytes: null, text: built.hex, fCpu: 16000000});
});

test('the board\'s crystal wins over the clock the image reports, and a mismatch is kept', async () => {
    // Simulating at the image's own F_CPU makes a mis-built image look right:
    // built for 11 MHz, run at 11 MHz, every delay exact. The board's crystal
    // is what the silicon would run it at.
    const built = await route.requestSketchBuild({
        source: 'x', device: 'attiny85',
        compile: async () => ({base64: b64(':00000001FF\n'), f_cpu: 11059200})
    });
    assert.equal(built.clockHz, 8000000);
    assert.equal(built.builtForHz, 11059200);
    assert.equal(route.sketchFirmware(built).fCpu, 8000000);
});

test('a refusal is the sketch\'s; a dead network is not', async () => {
    const refused = new Error('main.ino:4:3: error: \'nope\' was not declared in this scope');
    refused.log = 'full compiler log';
    await assert.rejects(
        route.requestSketchBuild({source: 'x', device: 'atmega328p', compile: async () => { throw refused; }}),
        e => e.reason === 'source' && /main\.ino:4/.test(e.message) && e.log === 'full compiler log');
    await assert.rejects(
        route.requestSketchBuild({source: 'x', device: 'atmega328p',
            compile: async () => { throw new TypeError('Failed to fetch'); }}),
        e => e.reason === 'transport');
    await assert.rejects(
        route.requestSketchBuild({source: 'x', device: 'atmega328p',
            compile: async () => ({base64: b64('not hex')})}),
        e => e.reason === 'transport' && /not Intel HEX/.test(e.message));
    await assert.rejects(
        route.requestSketchBuild({source: 'x', device: 'pico', compile: async () => ({})}),
        e => e.reason === 'transport');
});

test('the starters: Serial sketches only where there is a USART', () => {
    const uno = arduinoSketchExamplesFor('arduino-uno');
    assert.ok(uno.length >= 4 && uno.some(e => e.serial));
    for (const ex of uno) {
        assert.match(ex.source, /void setup\s*\(/, `${ex.id} has no setup()`);
        assert.match(ex.source, /void loop\s*\(/, `${ex.id} has no loop()`);
        assert.ok(ex.label && ex.labelDe, `${ex.id} is not in both locales`);
    }
    const tiny = arduinoSketchExamplesFor('attiny85');
    assert.ok(tiny.length >= 1 && tiny.every(e => !e.serial && !/Serial\./.test(e.source)),
        'an ATtiny has no hardware USART; its starters must not print');
    assert.deepEqual(arduinoSketchExamplesFor('stc12c5a60s2'), []);
    assert.deepEqual(arduinoSketchExamplesFor('arduino-mega'), [],
        'the starters follow the route table, which does not serve the Mega yet');
});

// ------------------------------------------------------------- the engines

const BW_BOARD = packageSourceRoot('bw-board');
const bw = await import(pathToFileURL(path.join(BW_BOARD, 'index.js')).href);
(await import(pathToFileURL(path.join(BW_BOARD, 'register-all.js')).href)).registerAllDevices();

/** Boot a fixture image exactly as attachAvr8js boots firmware: no symbols. */
async function boot (fixtureId, kind, clockHz) {
    const board = new bw.BoardImpl();
    board.setNetlist([{id: 'u1', kind: 'mcu', terminals: ['gnd']}, {id: 'g1', kind: 'gnd', terminals: ['gnd']}],
        [{id: 'n1', terminals: [{part: 'u1', terminal: 'gnd'}, {part: 'g1', terminal: 'gnd'}]}]);
    board.setPower(true);
    const {target, adapter} = await bw.createDebugTarget(kind,
        {board, hex: fixtures[fixtureId].hex, symbols: null, clockHz});
    let serial = '';
    if (adapter.onSerial) adapter.onSerial(byte => { serial += String.fromCharCode(byte); });
    bw.createDebugSession(target, {onChange: () => {}}).start();
    return {adapter, serial: () => serial};
}

test('an Uno sketch using a class, String, F() and a late-defined function prints over Serial', async () => {
    const fx = fixtures['arduino-uno'];
    assert.match(fx.source, /class Counter/);
    assert.ok(fx.prototypes.includes('void report(int v);'), 'the fixture no longer exercises prototypes');
    const b = route.sketchBoardFor('arduino-uno');
    const {adapter, serial} = await boot('arduino-uno', b.kind, b.clockHz);
    for (let i = 0; i < 25; i++) adapter.advanceNs(10_000_000);   // 250 ms
    const lines = serial().split('\r\n');
    assert.deepEqual(lines.slice(0, 3), ['hello from C++', 'n=20 pi=3.142', 'n=21 pi=3.142'],
        `the Uno said ${JSON.stringify(serial().slice(0, 80))}`);
});

for (const [id, portB, ledBit] of [['attiny85', 0x38, 1], ['attiny88', 0x25, 5]]) {
    test(`an ${id} sketch blinks at its 8 MHz crystal, and would run double-speed at the default`, async () => {
        const edges = async clockHz => {
            const {adapter} = await boot(id, route.sketchBoardFor(id).kind, clockHz);
            let last = null;
            let n = 0;
            for (let i = 0; i < 100; i++) {                            // 1 s
                adapter.advanceNs(10_000_000);
                const bit = (adapter.cpu.data[portB] >> ledBit) & 1;
                if (last !== null && bit !== last) n++;
                last = bit;
            }
            return n;
        };
        // delay(100) on, delay(100) off: ten edges a second.
        const atCrystal = await edges(route.sketchBoardFor(id).clockHz);
        assert.ok(atCrystal >= 8 && atCrystal <= 11, `${atCrystal} edges in 1 s at 8 MHz`);
        // The control: the runner's 16 MHz default. This is the timing the
        // firmware's fCpu exists to prevent.
        const atDefault = await edges(16000000);
        assert.ok(atDefault >= 17, `${atDefault} edges at 16 MHz -- the control did not separate`);
    });
}

test('HELD GAP: the pinned bw-board cannot run a compiled Mega program, so the Mega is not offered', async () => {
    assert.equal(route.sketchBoardFor('arduino-mega'), null);
    assert.equal(route.sketchBoardFor('atmega2560'), null);
    const {adapter, serial} = await boot('arduino-mega', 'atmega2560', 16000000);
    for (let i = 0; i < 25; i++) adapter.advanceNs(10_000_000);
    assert.ok(!serial().includes('hello from C++'),
        'THE MEGA RUNS NOW. The pinned bw-board has the ATmega2560 data-space fix ' +
        '(SRAM 0x200-0x21FF; the stack at RAMEND used to fall off the end). Add ' +
        "'arduino-mega' and 'atmega2560' (kind 'atmega2560', 16 MHz) to " +
        'ARDUINO_SKETCH_BOARDS, turn this into an ordinary Serial test like the ' +
        'Uno\'s, and drop the note in arduino-sketch.js.');
});

// ------------------------------------------------------------- the wiring

test('the C tab ▶ is gated by the route table and uses the one hosted compile', () => {
    const src = read('components/tw-pseudocode/pseudocode-importer.jsx');
    assert.match(src, /this\.state\.lang === 'c' && sketchBoardFor\(this\.currentDevice\(\)\) \?/,
        'the button must be gated by the route\'s own table, not a device list in the JSX');
    assert.match(src, /data-testid="bw-run-arduino-sketch"/);
    assert.match(src, /data-testid="bw-arduino-sketch-examples"/);
    const handler = src.slice(src.indexOf('async runSketchOnAvr ()'));
    const body = handler.slice(0, handler.indexOf('\n    /**'));
    assert.match(body, /await this\.hostedCompileC\(code, target, format, language\)/,
        'the sketch must compile through hostedCompileC, not a fetch of its own');
    assert.doesNotMatch(body, /fetch\(/);
    assert.match(body, /format: 'avr-sketch'/);
    assert.match(body, /firmware: sketchFirmware\(built\)/);
    assert.match(body, /kind: built\.kind/);
    assert.match(src, /async hostedCompileC \(code, target, format, language = 'c'\)/);
    for (const key of ['runSketch', 'runSketchTitle', 'runSketchBuilding', 'runSketchBuilt',
        'runSketchRefused', 'runSketchUnavailable', 'runSketchEmpty', 'runSketchClockMismatch']) {
        assert.equal(src.split(`${key}:`).length - 1, 2, `${key} is not in both locales`);
    }
});

test('the debug panel boots a sketch as firmware, on the engine the route named', () => {
    const src = read('components/tw-pseudocode/debug-panel.jsx');
    assert.match(src, /if \(format === 'avr-sketch'\) return this\._runSketch\(e\.detail\);/);
    const body = src.slice(src.indexOf('    _runSketch (detail) {'));
    const fn = body.slice(0, body.indexOf('\n    }\n') + 6);
    assert.match(fn, /this\._userFirmware = firmware;/);
    assert.match(fn, /kind: kind \|\| this\.state\.kind/);
    assert.match(fn, /this\.onStart\(\)/);
});

test('the AVR attach survives firmware with no symbols and a project with no pins', () => {
    const src = read('lib/bw-debug/debug-runner.js');
    assert.match(src, /f_cpu: fw\.fCpu \|\| null, format: 'ihx'/,
        'a firmware image\'s own clock must reach the engine');
    const attach = src.slice(src.indexOf('async function attachAvr8js('),
        src.indexOf('async function attachRp2040js('));
    assert.match(attach, /pins: \(declared && declared\.pins\) \|\| \[\]/,
        'inferNetlist reads stc.pins unguarded');
    assert.match(attach, /\(symbols && symbols\.variables \|\| \[\]\)/,
        'symbols.variables threw on every firmware image');
    assert.doesNotMatch(attach, /\(symbols\.variables \|\| \[\]\)/);
});
