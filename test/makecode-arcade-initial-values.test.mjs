import test from 'node:test';
import assert from 'node:assert/strict';
import SB3Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {compile} from '../scripts/lib/pxt-node.mjs';
import {runArcadeSim} from '../scripts/lib/makecode-arcade-sim.mjs';

test('export retains saved scalar values before the first flag script', async () => {
    const creator = new SB3Creator();
    creator.parse('DEVICE ARCADE\nGLOBAL text = "saved text"\nGLOBAL count = 42\nWHEN flag clicked:\n  arcade log (text)\n  arcade log (count)\n');
    assert.deepEqual(creator.warnings, []);
    const exported = projectToArcade(creator.project);
    assert.deepEqual(exported.unsupported, []);
    assert.match(exported.ts, /let text = "saved text"/);
    assert.match(exported.ts, /let count = 42/);
    const compiled = await compile('arcade', exported.files);
    assert.equal(compiled.success, true, JSON.stringify(compiled.diagnostics));
    const run = await runArcadeSim(compiled.outfiles['binary.js'], {ms: 100});
    assert.equal(run.error, null);
    assert.ok(run.serial.some(entry => String(entry.text).includes('saved text')));
    assert.ok(run.serial.some(entry => String(entry.text).includes('42')));
});


test('saved zero remains observable before text and Boolean assignment without numeric inference', async () => {
    const creator = new SB3Creator();
    creator.parse('DEVICE ARCADE\nGLOBAL text\nGLOBAL flag\nWHEN flag clicked:\n  arcade log (text)\n  arcade log (flag)\n  set text to "changed"\n  set flag to (compare value 1 op "===" with 1)\n  arcade log (text)\n  arcade log (flag)\n');
    assert.deepEqual(creator.warnings, []);
    const exported = projectToArcade(creator.project);
    assert.deepEqual(exported.unsupported, []);
    assert.match(exported.ts, /let text: any = 0/);
    assert.match(exported.ts, /let flag: any = 0/);
    const compiled = await compile('arcade', exported.files);
    assert.equal(compiled.success, true, JSON.stringify(compiled.diagnostics));
    const run = await runArcadeSim(compiled.outfiles['binary.js'], {ms: 100});
    assert.equal(run.error, null);
    assert.deepEqual(run.serial.map(entry => String(entry.text).trim()), ['0','0','changed','true']);
});
