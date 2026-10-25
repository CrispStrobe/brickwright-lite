import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'bin/render-fpga.mjs');
const fixture = path.join(root, 'test/circuitverse/full_adder_from_half_adders.json');

test('render-fpga expands a Yosys netlist from outside the repository', () => {
    const output = fs.mkdtempSync(path.join(os.tmpdir(), 'brickwright-fpga-render-'));
    const input = path.join(output, 'hierarchy.json');
    fs.copyFileSync(fixture, input);
    const source = fs.readFileSync(input, 'utf8');
    const run = spawnSync(process.execPath, [
        cli,
        input,
        '--output', output,
        '--format', 'both',
        '--title', 'Full adder from 2 half Adders'
    ], {cwd: output, encoding: 'utf8'});
    assert.strictEqual(run.status, 0, run.stderr || run.stdout);
    assert.strictEqual(fs.readFileSync(input, 'utf8'), source, 'layout output must not overwrite the input netlist');
    assert.ok(fs.existsSync(path.join(output, 'hierarchy_layout.json')));

    const svg = fs.readFileSync(path.join(output, 'hierarchy.svg'), 'utf8');
    assert.match(svg, />Full adder from 2 half Adders<\/text>/);
    assert.strictEqual((svg.match(/class="module expanded"/g) || []).length, 2);
    assert.strictEqual((svg.match(/class="io-label /g) || []).length, 5);
    assert.doesNotMatch(svg, />const<\/text>/i);
    assert.doesNotMatch(svg, />out_/i);
    assert.match(svg, /class="wire bridge"/);
});

test('render-fpga refuses malformed JSON without overwriting its input', () => {
    const output = fs.mkdtempSync(path.join(os.tmpdir(), 'brickwright-fpga-render-bad-'));
    const input = path.join(output, 'broken.json');
    const malformed = '{"modules":';
    fs.writeFileSync(input, malformed);
    const run = spawnSync(process.execPath, [
        cli,
        input,
        '--output', output,
        '--format', 'both'
    ], {cwd: output, encoding: 'utf8'});
    assert.notStrictEqual(run.status, 0, 'malformed JSON must not look rendered');
    assert.match(run.stderr, /Invalid Yosys JSON in .*broken\.json:/);
    assert.strictEqual(fs.readFileSync(input, 'utf8'), malformed, 'the input netlist must survive the refusal');
    assert.ok(!fs.existsSync(path.join(output, 'broken_layout.json')));
    assert.ok(!fs.existsSync(path.join(output, 'broken.svg')));
});
