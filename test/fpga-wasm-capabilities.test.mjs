/**
 * Can this runtime run the local toolchain — asked before anything is fetched.
 *
 * Measured, not assumed: @yowasp/yosys's WebAssembly needs WasmGC, and Node 20
 * cannot load it even with --experimental-wasm-gc (the compile fails at opcode
 * 0x1f, `try_table`). The point of the probe is that the answer is a fact about
 * the runtime rather than a claim in a user agent string.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {detectWasmCapabilities, localToolchainRefusal}
    from '../overlay/scratch-gui/src/lib/bw-fpga/wasm-capabilities.js';
import {defaultCatalog, probeBackends} from '../overlay/scratch-gui/src/lib/bw-fpga/backends.js';

// Injected so both answers are testable on any runtime, including this one.
const supportsEverything = () => true;
const supportsNothing = () => false;

test('a capable runtime can run the local toolchain', () => {
    const caps = detectWasmCapabilities(supportsEverything);
    assert.equal(caps.canRunLocalToolchain, true);
    assert.deepEqual(caps.missing, []);
    assert.equal(localToolchainRefusal(caps), null);
});

test('a runtime without WasmGC is refused BY FEATURE NAME, before any download', () => {
    const caps = detectWasmCapabilities(supportsNothing);
    assert.equal(caps.canRunLocalToolchain, false);
    const r = localToolchainRefusal(caps);
    assert.equal(r.code, 'wasm-features-missing');
    assert.match(r.reason, /WasmGC/,
        'naming the feature lets a reader look it up; "unsupported browser" does not');
    assert.match(r.reason, /before the 78 MB, not after/);
});

test('this runtime is diagnosed correctly, whatever it happens to support', () => {
    // Not asserting WHICH answer — that depends where the suite runs. Asserting
    // the probe is self-consistent, which is the property that matters.
    const caps = detectWasmCapabilities();
    assert.equal(typeof caps.wasmGC, 'boolean');
    assert.equal(caps.canRunLocalToolchain, caps.wasm && caps.wasmGC && caps.exceptions);
    assert.equal(caps.missing.length === 0, caps.canRunLocalToolchain);
});

test('the selector will not offer a local backend this browser cannot run', async () => {
    // The fail-closed rule, applied one step earlier than before: not merely
    // "not downloaded" but "could never work here".
    const catalog = defaultCatalog();
    const {available, probes} = await probeBackends({catalog, localAvailable: true});
    const local = probes.find(p => p.id === 'local');
    if (detectWasmCapabilities().canRunLocalToolchain) {
        assert.ok(available.includes('local'), 'a capable runtime with it downloaded may use it');
    } else {
        assert.ok(!available.includes('local'),
            'claiming it is available where it cannot start is the lie this rule prevents');
        assert.equal(local.code, 'wasm-features-missing');
    }
});
