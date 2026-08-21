import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

const root = resolve(new URL('..', import.meta.url).pathname);
const cases = [
    ['overlay/scratch-gui/examples/01-blink/circuit.pico.json', '01-blink-circuit.pico.svg'],
    ['overlay/scratch-gui/examples/10-motor-speed/circuit.pico.json', '10-motor-speed-circuit.pico.svg'],
    ['overlay/scratch-gui/examples/08-led-chaser-595/circuit.pico.json', '08-led-chaser-595-circuit.pico.svg'],
    ['overlay/scratch-gui/examples/z80-pd-bench/circuit.json', 'z80-pd-bench-circuit.svg'],
];

test('reviewed schematic SVGs remain byte-for-byte deterministic', () => {
    const out = mkdtempSync(join(tmpdir(), 'brickwright-schematic-baselines-'));
    try {
        for (const [source, filename] of cases) {
            const run = spawnSync(process.execPath, [
                'scripts/render-schematic.mjs', '--circuit', source, '--out', out,
            ], {cwd: root, encoding: 'utf8'});
            assert.equal(run.status, 0, `${source}: ${run.stderr || run.stdout}`);
            const actual = readFileSync(join(out, filename), 'utf8');
            const reviewed = readFileSync(join(root, 'docs', 'schematic-baselines', filename), 'utf8');
            assert.equal(actual, reviewed, `${filename} changed; inspect PNG/SVG before accepting it`);
        }
    } finally {
        rmSync(out, {recursive: true, force: true});
    }
});
