/**
 * Product boundary for the Blinkenrocket-class ATtiny88 debugger.
 *
 * Upstream unit tests prove individual chip peripherals. This drives the
 * exact pinned package and the exact firmware route Brickwright ships, through
 * the public factory and DebugTarget surface the panel consumes. It prevents a
 * future generic-AVR fallback from looking healthy while using a 328P map.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {packageSourceRoot} from './helpers/package-source.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const fixture = JSON.parse(readFileSync(
    path.join(ROOT, 'test/fixtures/arduino-sketch-images.json'), 'utf8')).images.attiny88;
const BW_BOARD = packageSourceRoot('bw-board');
const bw = await import(pathToFileURL(path.join(BW_BOARD, 'index.js')).href);
(await import(pathToFileURL(path.join(BW_BOARD, 'register-all.js')).href)).registerAllDevices();

const makeTarget = async () => {
    const board = new bw.BoardImpl(5);
    board.setNetlist(
        [{id: 'mcu', kind: 'attiny88_qfn32', terminals: ['gnd']},
            {id: 'gnd', kind: 'gnd', terminals: ['gnd']}],
        [{id: 'ground', terminals: [{part: 'mcu', terminal: 'gnd'},
            {part: 'gnd', terminal: 'gnd'}]}]
    );
    board.setPower(true);
    return bw.createDebugTarget('attiny88', {
        board, hex: fixture.hex, symbols: null, clockHz: fixture.f_cpu
    });
};

test('the public factory creates the ATtiny88 target with its real chip geometry', async () => {
    const {target, adapter} = await makeTarget();
    assert.equal(adapter.chip.name, 'ATtiny88');
    assert.equal(adapter.clockHz, 8_000_000);
    assert.equal(adapter.cpu.progMem.length, 4096, '8 KiB flash is 4096 AVR words');
    assert.ok(adapter.cpu.data.length >= 0x300, 'ATtiny88 SRAM/data map is present');
    assert.deepEqual(target.readMem('code', 0, 2), Uint8Array.of(0x14, 0xc0),
        'the compiled ATTinyCore image reached flash');
});

test('the shipped ATtiny88 target exposes and performs the debugger operations the UI offers', async () => {
    const {target} = await makeTarget();
    const caps = target.capabilities();
    assert.deepEqual(caps.steps, ['insn', 'block', 'over', 'out']);
    assert.deepEqual(caps.breakpoints, ['code', 'yield', 'write']);
    assert.deepEqual(caps.writable, ['sram']);
    assert.ok(caps.events.includes('instruction'));
    assert.ok(caps.events.includes('memory'));

    target.writeMem('sram', 0x100, Uint8Array.of(7, 0));
    assert.deepEqual(target.readMem('sram', 0x100, 2), Uint8Array.of(7, 0));
    assert.deepEqual(target.writeMem('code', 0, Uint8Array.of(0)),
        {refused: 'space not writable: code'});

    const events = [];
    const halts = [];
    target.onDebugEvent(event => events.push(event));
    target.onHalt(why => halts.push(why));
    target.step('insn');
    assert.equal(target.runFor(1_000_000), 'halted');
    assert.notEqual(target.regs().pc, 0, 'one instruction advances the byte-addressed PC');
    assert.equal(halts.at(-1)?.cause, 'step');
    assert.ok(events.some(event => event.kind === 'instruction'),
        'instruction facts reach the trace/debugger stream');

    target.reset();
    const handle = target.setBreakpoint({kind: 'code', addr: 0});
    assert.equal(typeof handle, 'number');
    target.run();
    assert.equal(target.runFor(1_000_000), 'halted');
    assert.equal(halts.at(-1)?.cause, 'breakpoint');
    assert.equal(halts.at(-1)?.pc, 0);
});

test('ATtiny88 scheduler symbols drive block positions and yield breakpoints', async () => {
    const {target} = await makeTarget();
    target.setSymbols({scheduler: {tasks: [{
        name: 'main', state: {addr: 0x100, size: 2},
        yields: [{state: 7, addr: 0}]
    }]}});
    target.writeMem('sram', 0x100, Uint8Array.of(7, 0));
    assert.deepEqual(target.position(), [{task: 'main', state: 7}]);
    const handle = target.setBreakpoint({kind: 'yield', task: 'main', state: 7});
    assert.equal(typeof handle, 'number');
    const halts = [];
    target.onHalt(why => halts.push(why));
    target.run();
    assert.equal(target.runFor(1_000_000), 'halted');
    assert.equal(halts.at(-1)?.bpKind, 'yield');
    assert.equal(halts.at(-1)?.pc, 0);
});
