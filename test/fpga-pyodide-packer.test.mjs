/**
 * A Gowin bitstream CAN be packed in a browser runtime, and this is the gate
 * that keeps saying so.
 *
 * docs/TANG-NANO.md §8c recorded, on 2026-09-16, that there was no path from a
 * GPL-licensed core to real silicon through this app: decision 19 sends copyleft
 * to the local tier, and the local tier could not finish, because `gowin_pack`
 * is Apicula, Apicula is Python, and nothing packs a Gowin bitstream in JS or
 * WebAssembly. Pyodide was "the only route around it, and it is unproven".
 *
 * It is proven, measured 2026-09-17, and the correction is in §8c.
 *
 * WHAT IS ASSERTED, and why it is byte-identity rather than "a bitstream came
 * out". Two backends that both produce A bitstream and disagree about WHICH
 * bitstream give bug reports nobody can reproduce — the same argument
 * backends.js makes for naming the selected backend. So the recorded hashes are
 * the native packer's, produced by the real toolchain, and the browser packer
 * has to match them exactly.
 *
 * WATCH THE SIZE FIELD. Both designs pack to 4,618,782 bytes, because a Gowin
 * bitstream is a fixed-size frame image for the part. Length proves nothing
 * here; it is asserted only so that a truncated write cannot masquerade as a
 * hash mismatch, and the test below that asserts the two designs DIFFER is what
 * rules out a packer that ignores its input.
 *
 * SKIPPING IS LOUD ON PURPOSE. Pyodide is 17 MB and is not a dependency of this
 * repo, so these skip unless it has been fetched. A silent skip is how a gate
 * becomes decoration — the reason goes to stderr once, naming the command.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';

import {
    DESIGNS, FAMILY, FIXTURES, PYODIDE_ENTRY, INSTALL_HINT, packWithPyodide
} from '../scripts/probe-pyodide-packer.mjs';

const SKIP = existsSync(PYODIDE_ENTRY)
    ? false
    : `needs pyodide — run \`${INSTALL_HINT}\``;

if (SKIP) {
    process.stderr.write(`[bw gate] fpga-pyodide-packer: SKIPPING 2 tests — ${SKIP}\n`);
}

// ── these run with or without pyodide ───────────────────────────

test('the two fixtures are different designs, so a constant would not pass', () => {
    // If both fixtures packed to the same bitstream, the byte-identity tests
    // below would pass for a packer that never read its input at all.
    assert.notEqual(DESIGNS.blink.sha256, DESIGNS.counter.sha256,
        'two designs that pack identically cannot tell a real packer from a stub');
    assert.equal(DESIGNS.blink.bytes, DESIGNS.counter.bytes,
        'a Gowin bitstream is a fixed-size frame image; if this ever differs, the '
        + 'comment above about length proving nothing needs rewriting');
});

test('every fixture the probe names is actually present', () => {
    for (const [name, spec] of Object.entries(DESIGNS)) {
        const p = path.join(FIXTURES, spec.pnr);
        assert.ok(existsSync(p), `${name}: missing fixture ${spec.pnr}`);
        const json = JSON.parse(readFileSync(p, 'utf8'));
        assert.ok(json.modules, `${name}: ${spec.pnr} is not a nextpnr netlist`);
        assert.match(spec.sha256, /^[0-9a-f]{64}$/, `${name}: sha256 is not a sha256`);
    }
});

// ── these need the runtime ──────────────────────────────────────

test('gowin_pack runs in Pyodide and produces the NATIVE bitstream, byte for byte',
    {skip: SKIP}, async () => {
        for (const [name, spec] of Object.entries(DESIGNS)) {
            const r = await packWithPyodide(name);
            assert.equal(r.bytes, spec.bytes, `${name}: wrong length`);
            assert.equal(r.sha256, spec.sha256,
                `${name}: the browser packer and the native packer disagree. That is a `
                + 'real finding, not a flake — record which one the hardware accepts '
                + 'before changing this number.');
        }
    });

test('it needs no WasmGC, which is what makes the packer half testable at all',
    {skip: SKIP}, async () => {
        // The YoWASP synthesis tools need WasmGC and try_table, which Node 20
        // has neither of (lib/bw-fpga/wasm-capabilities.js). Pyodide is ordinary
        // Emscripten WebAssembly. If this ever starts failing on a runtime where
        // the packer works, the capability probe is what to look at — not this.
        const detect = await import('../overlay/scratch-gui/src/lib/bw-fpga/wasm-capabilities.js');
        const caps = detect.detectWasmCapabilities();
        assert.equal(caps.canRunLocalToolchain, false,
            'this Node build was expected to LACK WasmGC; if it has it now, this test '
            + 'no longer demonstrates what it claims and should be re-aimed');
        const r = await packWithPyodide('blink');
        assert.equal(r.sha256, DESIGNS.blink.sha256,
            'the packer ran on a runtime that cannot run the synthesis tools');
        assert.equal(FAMILY, 'GW2A-18C');
    });
