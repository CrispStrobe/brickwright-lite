/** Checkpoint honesty against the real vendored emu8051 WASM. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const WASM_JS = path.join(ROOT, 'overlay/scratch-gui/src/lib/emu8051/emu8051.js');
const DEBUG_JS = path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-board/emu8051-debug.js');
const have = existsSync(WASM_JS) && existsSync(DEBUG_JS);
if (!have) console.log('# SKIP: the vendored emu8051 WASM is not present');

const CLOCK_HZ = 11059200;
const PROGRAM = ':0800000075300075304280FEEE\n:00000001FF\n';

async function fixture() {
    const {default: createEmu8051} = await import(WASM_JS);
    const {createEmu8051DebugTarget} = await import(DEBUG_JS);
    const wasm = await createEmu8051();
    wasm._emu_init(1);
    wasm._emu_set_fosc(CLOCK_HZ);
    const target = createEmu8051DebugTarget(wasm, {clockHz: CLOCK_HZ});
    wasm.ccall('emu_load_hex', 'number', ['string', 'number'], [PROGRAM, PROGRAM.length]);
    target.reset();
    return target;
}

function settle(target) {
    for (let i = 0; i < 4096 && target.state() === 'running'; i++) target.runFor(1000);
    assert.equal(target.state(), 'halted');
}

function visibleState(target) {
    return {
        regs: target.regs(),
        iram: [...target.readMem('iram', 0, 256)],
        sfr: [...target.readMem('sfr', 0x80, 128)],
        xram: [...target.readMem('xram', 0, 256)],
        timeNs: target.timeNs()
    };
}

function digest(value) {
    const text = JSON.stringify(value, (_key, item) =>
        typeof item === 'bigint' ? `0x${item.toString(16)}` : item);
    return createHash('sha256').update(text).digest('hex');
}

test('8051 declines checkpoint capability and names every opaque mutable class', async () => {
    if (!have) return;
    const target = await fixture();
    const caps = target.capabilities();
    assert.deepEqual(caps.recording, []);
    assert.deepEqual(caps.extensions.checkpoint, {
        supported: false,
        code: 'incomplete-snapshot-abi',
        missing: [
            'cpu-in-flight-microstate', 'program-time', 'timer-and-interrupt-internals',
            'uart-queues', 'external-input-latches'
        ]
    });
    assert.equal(target.saveState, undefined,
        'generic machine snapshot callers must not mistake a refusal for saved state');
    assert.equal(target.loadState, undefined);
    assert.deepEqual(target.captureCheckpoint(), target.captureCheckpoint(),
        'the refusal itself has a stable serializable shape');
    assert.match(target.captureCheckpoint().refused, /native complete-state WASM ABI/);
});

test('checkpoint capture/restore refusals neither inspect snapshots nor mutate real emulator state', async () => {
    if (!have) return;
    const target = await fixture();
    target.step('insn', 1);
    settle(target);
    const before = visibleState(target);
    const save = target.captureCheckpoint();
    const hostileSnapshot = new Proxy({}, {get() { throw new Error('partial snapshot was inspected'); }});
    const restore = target.restoreCheckpoint(hostileSnapshot);
    assert.equal(save.code, 'incomplete-snapshot-abi');
    assert.equal(restore.code, 'incomplete-snapshot-abi');
    assert.equal(restore.operation, 'restore');
    assert.deepEqual(visibleState(target), before);
});

test('refused checkpoint calls leave subsequent recorded replay hashes unchanged', async () => {
    if (!have) return;
    const run = async interfere => {
        const target = await fixture();
        const events = [];
        target.onDebugEvent(event => events.push(event));
        if (interfere) {
            target.captureCheckpoint();
            target.restoreCheckpoint({partial: new Uint8Array([1, 2, 3])});
        }
        for (let i = 0; i < 3; i++) {
            target.step('insn', 1);
            settle(target);
        }
        return digest(events);
    };
    assert.equal(await run(true), await run(false),
        'a refused restore must not perturb deterministic continuation or its event trace');
});
