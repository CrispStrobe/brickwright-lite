import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compareSandbox} from '../overlay/scratch-gui/src/lib/bw-i8086-lab/benchmark.js';
import {getI8086MemoryMode, setI8086MemoryMode, withI8086MemoryPreference} from '../overlay/scratch-gui/src/lib/bw-i8086-preferences.js';
import {createI8086Adapter} from '../overlay/scratch-gui/src/lib/bw-board/i8086-adapter.js';
import {BREADBOARD8086} from '../overlay/scratch-gui/src/lib/bw-board/i8086-machine.js';
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

test('reference preference reaches machines built through a RESOLVING caller, and is reported either way', async () => {
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
        // THE CALLER RESOLVES, SO THIS CALLER RESOLVES. The adapter used to
        // apply the preference itself, reaching out of the vendored tree to do
        // it; that reach was removed and resolution moved to the call site.
        // `createI8086Adapter()` with no config therefore gets the unresolved
        // default ON PURPOSE -- this test previously asserted the opposite and
        // was describing the old contract.
        const after = createI8086Adapter({config: withI8086MemoryPreference({...BREADBOARD8086})});
        const dos = await createI8086DosBench({format: 'com', bytes: new Uint8Array([0xb8,0,0x4c,0xcd,0x21])});
        assert.equal(Object.hasOwn(after.machine.cpu, '_rd16'), false,
            'a resolving caller gets the reference path');
        assert.equal(Object.hasOwn(dos.machine.cpu, '_rd16'), false,
            'and so does the DOS bench, which resolves at its own call site');
        assert.equal(Object.hasOwn(before.machine.cpu, '_rd16'), true,
            'while a target built before the preference changed is untouched');

        // AND THE MODE IS REPORTED, WHICH IS WHAT MAKES THE SEAM SAFE. A seam
        // is acceptable when the absence is declared and not when it is quiet:
        // without this, a caller that forgot to resolve would be handed the
        // optimized accessors it asked not to have and could not tell. The
        // unresolved default is asserted too, so the report is shown to
        // DISTINGUISH the two rather than to be a constant.
        assert.equal(after.fastWordAccess, false,
            'the resolved adapter reports the reference path');
        const unresolved = createI8086Adapter();
        assert.equal(unresolved.fastWordAccess, true,
            'and an unresolved caller is told it got the fast path, rather than left to guess');
        assert.equal(unresolved.fastWordAccess, Object.hasOwn(unresolved.machine.cpu, '_rd16'),
            'the report agrees with the effect on the unresolved path too');
        assert.throws(() => setI8086MemoryMode('wasm'), /Unknown/);
        setI8086MemoryMode('optimized');
        assert.ok(Object.hasOwn(createI8086Adapter().machine.cpu, '_rd16'));
    } finally {
        setI8086MemoryMode('optimized');
        if (storage) Object.defineProperty(globalThis, 'localStorage', storage);
        else delete globalThis.localStorage;
    }
});

test('sandbox rejects a Wasm backend that claims execution without computing', async () => {
    const Instance = WebAssembly.Instance;
    try {
        WebAssembly.Instance = class { constructor () { this.exports = {run: () => {}}; } };
        await assert.rejects(compareSandbox({cycles: 100000}), /Correctness mismatch: wasm/);
    } finally { WebAssembly.Instance = Instance; }
});
