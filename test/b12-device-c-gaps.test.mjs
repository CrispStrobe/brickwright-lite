/**
 * Task B12: B11's remaining device-C gaps, closed upstream (sb3-creator #55,
 * bw-board #411, CrispStrobe/extensions #32) and checked here through what
 * Lite ships: the vendored sb3-creator, the vendored emu8051 build, the pinned
 * bw-board adapters and the bundled stc12 extension.
 *
 *   - 8051 tone together with print: the UART leaves Timer 1 for the part's
 *     second baud source, so the tune and the text coexist (until B12 the
 *     retarget refused the pair).
 *   - The ATtinys: print/ask over a software UART, tone on a free timer, and
 *     `chip temperature` from the on-die sensor -- one ATtiny85 program, built
 *     by avr-gcc from this emitter's C and kept as a fixture (Lite's CI has no
 *     AVR compiler; the fixture's C must still be exactly what the emitter
 *     emits, so a changed emitter fails here until the fixture is rebuilt).
 *   - `chip temperature` in the VM: the bundled stc12 reporter reads the bench.
 *   - Several I2C buses: one master per SDA/SCL pair (the end-to-end proof,
 *     two 0x50 memories on nine boards, is sb3-creator's chain-i2c).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { compileWithToolchain } from '../overlay/scratch-gui/src/lib/sdcc-wasm/compiler.js';
import SB3Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const WASM_JS = path.join(ROOT, 'overlay/scratch-gui/src/lib/emu8051/emu8051.js');
const BW = path.join(ROOT, 'node_modules/bw-board/src');
const FIXTURE = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/fixtures/b12/attiny85-serial-temp-tone.json'), 'utf8'));
const distUrl = new URL('../overlay/scratch-gui/src/lib/sdcc-wasm/dist/', import.meta.url);
const skipIfNoSdcc = fs.existsSync(fileURLToPath(new URL('sdcc.js', distUrl)))
    ? false
    : 'the GPL SDCC toolchain is not present (not tracked here; fetched from its own origin)';
const require = createRequire(import.meta.url);

// The Emscripten glue's Node branch, as in test/wasm-compiler-integration.test.mjs.
async function importFactory(name) {
    const source = await fs.promises.readFile(new URL(`${name}.js`, distUrl), 'utf8');
    const module = {exports: {}};
    const filename = fileURLToPath(new URL(`${name}.js`, distUrl));
    Function('module', 'exports', 'require', '__filename', '__dirname',
        source.replace(/export default createSDCC;\s*$/, ''))(
        module, module.exports, require, filename, path.dirname(filename));
    return module.exports;
}

async function sdccToolchain() {
    const packed = JSON.parse(await fs.promises.readFile(new URL('runtime.json', distUrl), 'utf8'));
    return {
        factories: await Promise.all(['cc1', 'sdcc', 'sdas8051', 'sdld'].map(importFactory)),
        runtime: new Map(Object.entries(packed.files).map(([name, data]) =>
            [name, Uint8Array.from(Buffer.from(data, 'base64'))])),
        resolve: (name) => pathToFileURL(fileURLToPath(new URL(name, distUrl))).href
    };
}

const emit = (src) => {
    const c = new SB3Creator();
    c.parse(src);
    return {code: c.generateC(), warnings: c._cWarnings || []};
};

/** A board that records every pin write with its time, and reads inputs high. */
function recordingBoard(temperatureC = 25) {
    const board = {
        temperatureC, tNs: 0n, writes: [],
        advanceTo(t) { board.tNs = BigInt(t); },
        setPin(name, mode, high) { board.writes.push({ t: Number(board.tNs), pin: String(name), high: !!high }); },
        readPin: () => 1, readAnalog: () => 0,
    };
    board.edges = (pin, fromMs, toMs) => {
        const w = board.writes.filter((e) => e.pin === pin && e.t >= fromMs * 1e6 && e.t < toMs * 1e6);
        let n = 0;
        for (let i = 1; i < w.length; i++) if (w[i].high !== w[i - 1].high) n++;
        return n;
    };
    return board;
}

const SIREN_PRINT = `DEVICE STC12C5A60S2
CLOCK 11059200
PIN buzzer = P1.5 TONE

WHEN flag clicked:
  set buzzer to 440 hz
  wait 1 seconds
  print "done"
  set buzzer to 0 hz
`;

test('8051: a tone and a print in one program, compiled by the app\'s route', {skip: skipIfNoSdcc, timeout: 180000}, async () => {
    assert.equal(SB3Creator.retargetPseudocode(SIREN_PRINT, 'stc89c52rc').ok, true, 'the retarget takes the pair now');
    const {code, warnings} = emit(SIREN_PRINT);
    assert.deepEqual(warnings, []);
    assert.match(code, /AUXR \|= 0x11;.*S1BRS/, 'the UART runs from the BRT');
    assert.doesNotMatch(code, /TMOD = \(TMOD & 0x0F\) \| 0x20/, 'and not from Timer 1');
    const built = await compileWithToolchain(code, {target: 'stc12c5a60s2'}, await sdccToolchain());
    assert.equal(built.success, true);
    const {default: createEmu8051} = await import(pathToFileURL(WASM_JS));
    const {createEmu8051Adapter} = await import(pathToFileURL(path.join(BW, 'emu8051-adapter.js')));
    const adapter = createEmu8051Adapter(await createEmu8051(), {part: 'stc12c5a60s2', fosc: 11059200, ports: [0, 1, 2, 3]});
    adapter.loadHex(built.hex);
    const board = recordingBoard();
    adapter.attachBoard(board);
    let out = '';
    adapter.onSerial((b) => { out += String.fromCharCode(b); });
    adapter.runNs(1_300_000_000);
    const hz = board.edges('P1.5', 200, 1000) / 2 / 0.8;
    // MEASURED 2026-10-05 on the chain boards: 437.1-440.9 Hz single-period.
    assert.ok(Math.abs(hz - 440) <= 4.4, `${hz.toFixed(1)} Hz, expected ~437-441`);
    assert.equal(out, 'done\r\n');
});

test('ATtiny85: chip temperature, a typed answer and a tone, on the pinned adapter', async () => {
    const {code, warnings} = emit(FIXTURE.program);
    assert.deepEqual(warnings, []);
    assert.equal(createHash('sha256').update(code).digest('hex'), FIXTURE.codeSha256,
        'the emitter no longer produces the C this fixture was built from -- rebuild it');
    const bytes = Buffer.from(FIXTURE.image, 'base64');
    const padded = Buffer.alloc(bytes.length + (bytes.length & 1));
    bytes.copy(padded);
    const {createAvr8jsAdapter} = await import(pathToFileURL(path.join(BW, 'avr8js-adapter.js')));
    const adapter = createAvr8jsAdapter({chip: 'attiny85', program: new Uint16Array(padded.buffer, padded.byteOffset, padded.length / 2)});
    const board = recordingBoard(31);
    adapter.attachBoard(board);
    let out = '';
    adapter.onSerial((b) => { out += String.fromCharCode(b); });
    for (let i = 0; i < 10; i++) adapter.advanceNs(10_000_000);
    assert.equal(out, 'Chip 31 C\r\nA number?\r\n', 'the bench temperature, read by the chip, over the software UART');
    assert.equal(adapter.sendSerial(Array.from('21\r', (c) => c.charCodeAt(0))), true);
    for (let i = 0; i < 100; i++) adapter.advanceNs(10_000_000);
    assert.equal(out, 'Chip 31 C\r\nA number?\r\n42\r\n');
    const t = board.tNs ? Number(board.tNs) / 1e6 : 1100;
    const hz = board.edges('PB3', t - 800, t) / 2 / 0.8;
    assert.ok(Math.abs(hz - 440) <= 4.4, `${hz.toFixed(1)} Hz on PB3, expected ~440`);
});

test('the VM: the bundled stc12 extension reads the bench temperature', () => {
    const src = fs.readFileSync(path.join(ROOT, 'overlay/scratch-vm/src/extensions/crispstrobe/stc12/index.js'), 'utf8');
    const inner = JSON.parse(src.match(/makeExt\(("(?:[^"\\]|\\.)*")\)/)[1]);
    const board = {temperatureC: 42.4, setPin() {}};
    let ext;
    const Scratch = {
        Cast: {toNumber: Number, toString: String, toBoolean: Boolean},
        BlockType: {COMMAND: 'c', REPORTER: 'r', BOOLEAN: 'b', HAT: 'h', EVENT: 'e'},
        ArgumentType: {STRING: 's', NUMBER: 'n', BOOLEAN: 'b'},
        vm: {runtime: {circuitBoard: board, on() {}, stc: {pins: []}}},
        extensions: {register: (e) => { ext = e; }, unsandboxed: true}, translate: (x) => x,
    };
    Function('Scratch', inner)(Scratch);
    assert.ok(ext.getInfo().blocks.some((b) => b.opcode === 'chiptemp'), 'the block is in the palette');
    assert.equal(ext.chiptemp(), 42);
    board.temperatureC = 25;
    assert.equal(ext.chiptemp(), 25);
});

test('chip temperature: the gallery example, and a refusal by name where there is no sensor', () => {
    const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'overlay/scratch-gui/examples/index.json'), 'utf8'));
    const entry = (Array.isArray(index) ? index : index.examples).find((e) => e.id === 'chip-thermometer');
    assert.ok(entry, 'chip-thermometer ships');
    // B13 (sb3-creator#57) gave the ATtiny88 its sensor (ADC8, 8008H Table 17-2):
    // it moved from the refusals below into the example's devices.
    assert.deepEqual([...entry.devices].sort(),
        ['arduino-nano', 'arduino-uno', 'atmega168p', 'attiny85', 'attiny88', 'pico', 'stm32f030']);
    const src = fs.readFileSync(path.join(ROOT, 'overlay/scratch-gui/examples', entry.files.program), 'utf8');
    for (const device of ['stc12c5a60s2', 'arduino-mega']) {
        const r = SB3Creator.retargetPseudocode(src, device);
        assert.equal(r.ok, false, device);
        assert.ok(r.reasons.some((w) => /chip temperature needs an on-die sensor/.test(w)), `${device}: ${r.reasons.join('; ')}`);
    }
});

test('several I2C buses: the vendored emitter gives each pair its own master', () => {
    const {code, warnings} = emit(`DEVICE STC12C5A60S2
PIN led = P1.0 OUTPUT ACTIVE LOW
PART left = AT24C02 SDA P1.6 SCL P1.7
PART right = AT24C02 SDA P3.4 SCL P3.5

WHEN flag clicked:
  store 11 at 0 in left
  store 22 at 0 in right
  print byte 0 of right
`);
    assert.deepEqual(warnings, []);
    assert.match(code, /static void bw_i2c_start\(void\)/);
    assert.match(code, /static void bw_i2c2_start\(void\)/);
    const r = SB3Creator.retargetPseudocode(`DEVICE STC12C5A60S2
PART left = AT24C02 SDA P1.6 SCL P1.7
PART right = AT24C02 SDA P3.4 SCL P3.5

WHEN flag clicked:
  store 1 at 0 in right
`, 'arduino-uno');
    assert.equal(r.ok, true);
    assert.doesNotMatch(r.pseudocode, /PART right = AT24C02 SDA A4 SCL A5/, 'the second bus stays off the hardware pair');
});
