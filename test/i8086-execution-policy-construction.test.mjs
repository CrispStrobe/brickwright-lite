import {test} from 'node:test';
import assert from 'node:assert/strict';
import {i8086Execution} from '../overlay/scratch-gui/src/lib/bw-i8086-execution.js';
import {createI8086DosBench} from '../overlay/scratch-gui/src/lib/bw-debug/i8086-dos-bench.js';
import {setI8086MemoryMode} from '../overlay/scratch-gui/src/lib/bw-i8086-preferences.js';
let available = false;
try { await import('bw-board/execution-policy'); available = true; }
catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }
const needsPackage = {skip: !available && 'Requires migrated package or explicit execution-policy-source-loader.mjs mapping'};

test('real DOS constructor admits both families and retains independent live RAM mode', needsPackage, async () => {
    try {
        i8086Execution.setPreference('auto');
        setI8086MemoryMode('optimized');
        for (const variant of ['8086', '80186']) {
            const bench = await createI8086DosBench({variant, format: 'com', bytes: Uint8Array.of(0xb8, 0, 0x4c, 0xcd, 0x21)});
            assert.equal(bench.machine.variant, variant);
            assert.equal(i8086Execution.statusFor(bench).actual.family, variant);
            assert.equal(i8086Execution.snapshot().active.actual.semantics, 'dos-services');
            setI8086MemoryMode('reference');
            i8086Execution.setPreference('wired');
            assert.ok(Object.hasOwn(bench.machine.cpu, '_rd16'), 'existing target retains fast access');
            for (let steps = 0; steps < 1000 && !bench.terminated; steps++) bench.step();
            assert.equal(bench.terminated, true);
            assert.equal(bench.exitCode, 0);
            await assert.rejects(createI8086DosBench({variant, format: 'com', bytes: Uint8Array.of(0xf4)}), /no functional substitute/);
            assert.equal(i8086Execution.snapshot().active, null);
            i8086Execution.release(bench);
            i8086Execution.setPreference('auto');
            setI8086MemoryMode('optimized');
        }
    } finally { i8086Execution.setPreference('auto'); setI8086MemoryMode('optimized'); }
});

test('real constructor rejects bad image without publishing selected status', needsPackage, async () => {
    await assert.rejects(createI8086DosBench({format: 'com', bytes: new Uint8Array()}), /empty image/);
    assert.equal(i8086Execution.snapshot().active, null);
    assert.equal(i8086Execution.snapshot().refusal.code, 'construction-failed');
});
