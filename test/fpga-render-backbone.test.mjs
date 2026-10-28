/**
 * Backbone guarantees for the schematic CLI (bin/render-fpga.mjs), pinned after
 * a full comparison against the netlistsvg oracle over 26 real netlists.
 *
 * These lock the properties that were BROKEN before that pass:
 *  - big netlists that used to CRASH (i2c_master) or TIME OUT (axis_fifo) now
 *    render a real schematic in seconds — a regression guard on the adaptive
 *    ElkJS layout + resolveBits memoisation;
 *  - a whole-CPU netlist (picorv32) degrades to an honest summary card, never a
 *    crash or a 27k-pixel monster;
 *  - bus plumbing ($slice/$concat) draws as compact bus-tap bars, not a wall of
 *    full-size SLICE/CONCAT boxes;
 *  - ports no longer print a fake "0"; sequential cells read as registers.
 *
 * It spawns the real CLI (a few seconds for the large cases), so it is its own
 * file rather than part of the fast unit suite.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'bin/render-fpga.mjs');

function render (netlist) {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-render-backbone-'));
    const run = spawnSync(process.execPath, [cli, netlist, '--output', out, '--format', 'svg'],
        {cwd: out, encoding: 'utf8', timeout: 90000});
    const base = path.basename(netlist, '.json');
    const svgPath = path.join(out, `${base}.svg`);
    const svg = fs.existsSync(svgPath) ? fs.readFileSync(svgPath, 'utf8') : '';
    return {status: run.status, svg, stderr: run.stderr};
}

const cv = name => path.join(root, 'test/circuitverse', `${name}.json`);
const rw = name => path.join(root, 'test/realworld-oracles', `${name}.json`);

test('i2c_master renders a real schematic (used to crash with a stack overflow)', () => {
    const {status, svg} = render(rw('i2c_master'));
    assert.equal(status, 0, 'the CLI must exit cleanly, not crash');
    assert.ok(svg.length > 5000, 'a real schematic, not a stub');
    assert.match(svg, /class="wire"/, 'wires are drawn');
    assert.doesNotMatch(svg, /cells<\/text>/, 'i2c is under the cap — a full render, not a placeholder');
});

test('axis_fifo renders in time (used to time out past 120s)', () => {
    const {status, svg} = render(rw('axis_fifo'));
    assert.equal(status, 0);
    assert.match(svg, /class="wire"/);
});

test('a whole-CPU netlist (picorv32) degrades to an honest summary, not a crash', () => {
    const {status, svg} = render(rw('picorv32'));
    assert.equal(status, 0, 'must not crash on a 2000-cell design');
    assert.match(svg, /cells<\/text>/, 'a summary card naming the cell count');
    assert.match(svg, /sub-module/, 'and pointing the user to a smaller view');
});

test('bus plumbing draws as compact bus-tap bars, not SLICE/CONCAT boxes', () => {
    const {status, svg} = render(cv('mux4'));
    assert.equal(status, 0);
    assert.match(svg, /class="bus-tap"/, 'compact split/join bars');
    assert.doesNotMatch(svg, />SLICE</, 'no full-size SLICE box');
    assert.doesNotMatch(svg, />CONCAT</, 'no full-size CONCAT box');
});

test('ports show no fake "0"; a flip-flop reads as a register', () => {
    const {status, svg} = render(cv('flipflop'));
    assert.equal(status, 0);
    // the only io-value text allowed is on real constants; flipflop has none
    assert.doesNotMatch(svg, /class="io-value"/, 'no hardcoded "0" in port boxes');
    assert.match(svg, />aDFF<|>DFF</, 'the register is tagged as a clocked flop');
});
