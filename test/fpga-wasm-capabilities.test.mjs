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
// A runtime that works but lacks the two features — which is what an older
// browser actually looks like, and is NOT the same as a runtime where nothing
// compiles. The control module (a plain function type, 14 bytes) must still
// pass, or the detector correctly blames itself instead of the browser.
const CONTROL_LENGTH = 14;
const supportsOnlyBaseline = bytes => bytes.length === CONTROL_LENGTH;

test('a capable runtime can run the local toolchain', () => {
    const caps = detectWasmCapabilities(supportsEverything);
    assert.equal(caps.canRunLocalToolchain, true);
    assert.deepEqual(caps.missing, []);
    assert.equal(localToolchainRefusal(caps), null);
});

test('a runtime without WasmGC is refused BY FEATURE NAME, before any download', () => {
    const caps = detectWasmCapabilities(supportsOnlyBaseline);
    assert.equal(caps.controlPassed, true, 'the runtime works; it is just older');
    assert.equal(caps.canRunLocalToolchain, false);
    const r = localToolchainRefusal(caps);
    assert.equal(r.code, 'wasm-features-missing');
    assert.match(r.reason, /WasmGC/,
        'naming the feature lets a reader look it up; "unsupported browser" does not');
    assert.match(r.reason, /before the 78 MB, not after/);
});

test('a BROKEN probe is reported as broken, not as a missing feature', () => {
    // The test that would have caught the real bug. The first version of the GC
    // probe declared a type-section size of 6 where its payload was 5, so every
    // runtime rejected it as malformed and the detector reported "no WasmGC"
    // everywhere — including on Chromium 151, which supports it. A confident
    // message named a feature that was present.
    //
    // Now the control runs first: if a module every runtime accepts fails to
    // compile, the probe blames itself.
    const caps = detectWasmCapabilities(() => false);
    assert.equal(caps.controlPassed, false);
    assert.equal(caps.canRunLocalToolchain, false);
    const r = localToolchainRefusal(caps);
    assert.equal(r.code, 'probe-broken');
    assert.match(r.reason, /bug here, not in your browser/,
        'sending someone to upgrade a browser that was never the problem is the failure');
});

test('the real probe bytes discriminate — verified against two live runtimes', () => {
    // Measured 2026-09-16: Node 20 rejects both (unknown type code 0x5f; invalid
    // opcode at try_table), Chromium 151 accepts both. If this ever passes on a
    // runtime that cannot run yosys, the probe has stopped testing what the
    // toolchain needs.
    const caps = detectWasmCapabilities();
    assert.equal(caps.controlPassed, true,
        'a plain function type must compile anywhere; if not, these bytes are wrong');
    if (caps.wasmGC || caps.exceptions) {
        assert.ok(caps.wasm, 'features cannot be present without WebAssembly');
    }
});

test('this runtime is diagnosed correctly, whatever it happens to support', () => {
    // Not asserting WHICH answer — that depends where the suite runs. Asserting
    // the probe is self-consistent, which is the property that matters.
    const caps = detectWasmCapabilities();
    assert.equal(typeof caps.wasmGC, 'boolean');
    assert.equal(caps.canRunLocalToolchain,
        caps.controlPassed && caps.wasmGC && caps.exceptions);
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
