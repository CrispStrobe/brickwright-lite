import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compareSandbox} from '../overlay/scratch-gui/src/lib/bw-i8086-lab/benchmark.js';
import {getI8086MemoryMode, setI8086MemoryMode, withI8086MemoryPreference} from '../overlay/scratch-gui/src/lib/bw-i8086-preferences.js';
import {createI8086Adapter} from '../overlay/scratch-gui/src/lib/bw-board/i8086-adapter.js';
import {createI8086DosBench} from '../overlay/scratch-gui/src/lib/bw-debug/i8086-dos-bench.js';

for (const workload of ['registers','mixed','strings']) test(`sandbox ${workload}: real backends match and execute`, async () => {
    const report = await compareSandbox({workload, cycles: 100000});
    assert.deepEqual(report.rows.map(row => row.mode), ['js','decoded','wasm']);
    for (const row of report.rows) {
        assert.equal(row.correctness, 'matched');
        assert.equal(row.samples.length, 3);
        assert.ok(row.medianMs > 0);
        assert.deepEqual(row.samples[0].state, report.rows[0].samples[0].state);
    }
    if (workload === 'registers') {
        const wasm = report.rows[2].samples[0].stats;
        assert.ok(wasm.compilations > 0 && wasm.loopIterations > 0, 'must execute compiled Wasm');
    }
});

test('sandbox rejects arbitrary inputs, supports cancellation and reports absent Wasm', async () => {
    await assert.rejects(compareSandbox({workload: '__proto__'}), /Unknown bundled/);
    await assert.rejects(compareSandbox({cycles: Infinity}), /Invalid bounded/);
    const controller = new AbortController();
    await assert.rejects(compareSandbox({signal: controller.signal, onProgress: () => controller.abort()}), /cancelled/);
    const wasm = globalThis.WebAssembly;
    try {
        globalThis.WebAssembly = undefined;
        const report = await compareSandbox({cycles: 20000});
        assert.deepEqual(report.unavailable, ['wasm']);
        assert.deepEqual(report.rows.map(row => row.mode), ['js','decoded']);
    } finally { globalThis.WebAssembly = wasm; }
});

test('reference preference affects new DOS and board machines, never existing targets', async () => {
    const storage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {configurable: true,
        value: {getItem: () => 'garbage', setItem: () => { throw new Error('denied'); }}});
    try {
        assert.equal(getI8086MemoryMode(), 'optimized');
        const before = createI8086Adapter();
        assert.ok(Object.hasOwn(before.machine.cpu, '_rd16'));
        assert.equal(setI8086MemoryMode('reference'), false);
        assert.equal(getI8086MemoryMode(), 'reference');
        const config = Object.freeze({fastWords: true});
        assert.equal(withI8086MemoryPreference(config).fastWords, false);
        assert.equal(config.fastWords, true);
        const after = createI8086Adapter();
        const dos = await createI8086DosBench({format: 'com', bytes: new Uint8Array([0xb8,0,0x4c,0xcd,0x21])});
        assert.equal(Object.hasOwn(after.machine.cpu, '_rd16'), false);
        assert.equal(Object.hasOwn(dos.machine.cpu, '_rd16'), false);
        assert.equal(Object.hasOwn(before.machine.cpu, '_rd16'), true);
        assert.throws(() => setI8086MemoryMode('wasm'), /Unknown/);
        setI8086MemoryMode('optimized');
        assert.ok(Object.hasOwn(createI8086Adapter().machine.cpu, '_rd16'));
    } finally {
        setI8086MemoryMode('optimized');
        if (storage) Object.defineProperty(globalThis, 'localStorage', storage);
        else delete globalThis.localStorage;
    }
});
