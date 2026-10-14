/**
 * The consolidated FPGA browser drive (scripts/verify-fpga-surface.mjs) exists
 * and is safe to run against ANY build: it needs a flag-on build to verify, and
 * SKIPS (exit 0) on a flag-off one rather than failing — the same present-or-skip
 * discipline as the ngspice oracle. Source-text, so it costs nothing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, '..', 'scripts/verify-fpga-surface.mjs'), 'utf8');

test('the FPGA surface drive skips a flag-off build instead of failing', () => {
    assert.match(src, /no ⬢ FPGA tab — this is a flag-off build/, 'it detects the absent surface');
    assert.match(src, /process\.exit\(0\)/, 'and exits 0 (skip), safe on any build');
});

test('it enables the FPGA opt-in, drives real surfaces, and gates on failures', () => {
    assert.match(src, /localStorage\.setItem\('bw-fpga-enabled', '1'\)/, 'it turns the tab on');
    assert.match(src, /PROOF_URL/, 'it honours the repo verify convention (PROOF_URL)');
    assert.match(src, /process\.exit\(failures\.length \? 1 : 0\)/, 'a failed check fails the process');
    // it looks at the features that only a browser can confirm
    for (const probe of ['bw-fpga-rf-pinmap', 'bw-fpga-rf-mmio', 'bw-fpga-rf-run', 'bw-fpga-palette']) {
        assert.match(src, new RegExp(probe), `drives ${probe}`);
    }
    assert.match(src, /artifacts\/fpga-surface|'fpga-surface'/, 'it saves screenshots for a human LOOK');
});
