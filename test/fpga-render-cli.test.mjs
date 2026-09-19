import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const yosys = spawnSync('yosys', ['-V'], {encoding: 'utf8'});

test('render-fpga expands a small hierarchy without orphan constants or duplicate I/O labels', {
    skip: yosys.error ? 'Yosys is not installed' : false
}, () => {
    const output = fs.mkdtempSync(path.join(os.tmpdir(), 'brickwright-fpga-render-'));
    const run = spawnSync(process.execPath, [
        'bin/render-fpga.mjs',
        'test/circuitverse/full_adder_from_half_adders.v',
        '--output', output,
        '--format', 'svg',
        '--title', 'Full adder from 2 half Adders'
    ], {encoding: 'utf8'});
    assert.strictEqual(run.status, 0, run.stderr || run.stdout);

    const svg = fs.readFileSync(path.join(output, 'full_adder_from_half_adders.svg'), 'utf8');
    assert.match(svg, />Full adder from 2 half Adders<\/text>/);
    assert.strictEqual((svg.match(/class="module expanded"/g) || []).length, 2);
    assert.strictEqual((svg.match(/class="io-label /g) || []).length, 5);
    assert.doesNotMatch(svg, />const<\/text>/i);
    assert.doesNotMatch(svg, />out_/i);
    assert.match(svg, /class="wire bridge"/);
});
