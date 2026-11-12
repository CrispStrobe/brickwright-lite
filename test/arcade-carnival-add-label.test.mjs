import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import SB3Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {arcadeSimAvailable, compileArcade, runArcadeSim} from '../scripts/lib/makecode-arcade-sim.mjs';
import {runProgram, clearStrayTimers} from './helpers/bw-vm.mjs';

// carnival.addLabelTo(label, area, color?) from the pinned arcade-carnival v0.0.7: a TextSprite (background 0, foreground the
// colour, 4 when none is given) centred at x 80 and y 110 (Bottom), 50 (Mid) or 20 (Top).
const SIM = arcadeSimAvailable() ? false : 'MakeCode runtime not synced (npm run sync:makecode)';
const SOURCE = `carnival.addLabelTo("Top", carnival.Areas.Top, 5)
carnival.addLabelTo("Mid", carnival.Areas.Mid)
carnival.addLabelTo("Low", carnival.Areas.Bottom, 9)
`;
const exportOf = imported => {
    const creator = new SB3Creator();
    creator.parse(imported.code);
    return projectToArcade(creator.project);
};
// The bounding box of each colour's pixels: rows and columns. Layout-independent evidence of where each label drew.
const boxes = (pixels, width) => {
    const found = {};
    pixels.forEach((color, index) => {
        if (!color) return;
        const x = index % width, y = Math.floor(index / width), box = found[color] ??= {x0: x, x1: x, y0: y, y1: y};
        box.x0 = Math.min(box.x0, x); box.x1 = Math.max(box.x1, x); box.y0 = Math.min(box.y0, y); box.y1 = Math.max(box.y1, y);
    });
    return found;
};
const EXPECTED_ROWS = {5: [20], 4: [50], 9: [110]};
const centred = found => {
    for (const [color, [row]] of Object.entries(EXPECTED_ROWS)) {
        const box = found[color];
        assert.ok(box, `colour ${color} drew`);
        assert.ok(Math.abs((box.y0 + box.y1) / 2 - row) <= 1.5, `colour ${color} centred on row ${row}: ${JSON.stringify(box)}`);
        assert.ok(Math.abs((box.x0 + box.x1) / 2 - 80) <= 1.5, `colour ${color} centred on column 80: ${JSON.stringify(box)}`);
    }
};

test('addLabelTo imports as a native word with its location and optional colour', () => {
    const imported = arcadeToPseudocode(SOURCE);
    assert.deepEqual(imported.unsupported, []);
    assert.match(imported.code, /arcade carnival add label \("Top"\) position Top color \(5\) use color 1/);
    assert.match(imported.code, /arcade carnival add label \("Mid"\) position Mid color \(0\) use color 0/);
    assert.match(imported.code, /arcade carnival add label \("Low"\) position Bottom color \(9\) use color 1/);
    const creator = new SB3Creator();
    creator.parse(imported.code);
    assert.deepEqual(creator.warnings, []);
    assert.equal(creator.project.targets.flatMap(target => Object.values(target.blocks))
        .filter(block => block.opcode === 'arcade_carnivalAddLabel').length, 3);
});

test('addLabelTo draws a text sprite at the original position and colour (4 when omitted)', async () => {
    const imported = arcadeToPseudocode(SOURCE);
    try {
        const run = await runProgram(imported.code, {frames: 6, storage: true});
        assert.deepEqual(run.errors, []);
        const frame = run.vm.runtime.bwArcadeDeviceState.sceneFrame;
        centred(boxes(frame.pixels, frame.width));
    } finally { clearStrayTimers(); }
});

test('addLabelTo exports as the same call with the carnival package and imports back identically', () => {
    const imported = arcadeToPseudocode(SOURCE);
    const exported = exportOf(imported);
    assert.deepEqual(exported.unsupported, []);
    assert.match(exported.ts, /carnival\.addLabelTo\("Top", carnival\.Areas\.Top, 5\)/);
    assert.match(exported.ts, /carnival\.addLabelTo\("Mid", carnival\.Areas\.Mid\)/);
    assert.match(exported.ts, /carnival\.addLabelTo\("Low", carnival\.Areas\.Bottom, 9\)/);
    assert.equal(JSON.parse(exported.files['pxt.json']).dependencies['arcade-carnival'], 'github:microsoft/arcade-carnival#v0.0.7');
    const back = arcadeToPseudocode(exported.ts);
    assert.deepEqual(back.unsupported, []);
    assert.equal(back.code, imported.code);
});

test('an editable colour flag exports as a conditional that keeps the colour optional', () => {
    const imported = arcadeToPseudocode('let tinted = true\ncarnival.addLabelTo("Flag", carnival.Areas.Top, 5)\n');
    const code = imported.code.replace('use color 1', 'use color (tinted)');
    assert.notEqual(code, imported.code);
    const exported = exportOf({code});
    assert.deepEqual(exported.unsupported, []);
    assert.match(exported.ts, /if \(/);
    assert.match(exported.ts, /carnival\.addLabelTo\("Flag", carnival\.Areas\.Top, 5\)/);
    assert.match(exported.ts, /carnival\.addLabelTo\("Flag", carnival\.Areas\.Top\)/);
});

test('a non-fixed location, a shadowed carnival and a wrong arity stay diagnosed', () => {
    for (const source of ['let where = carnival.Areas.Top\ncarnival.addLabelTo("x", where)',
        'carnival.addLabelTo("x")', 'carnival.addLabelTo("x", carnival.Areas.Top, 1, 2)',
        'let carnival = 0\ncarnival.addLabelTo("x", carnival.Areas.Top)']) {
        const imported = arcadeToPseudocode(source);
        assert.ok(imported.unsupported.length, source);
    }
});

test('pxt-arcade draws the labels where the VM does', {skip: SIM, timeout: 300000}, async () => {
    const exported = exportOf(arcadeToPseudocode(SOURCE));
    const run = await runArcadeSim(await compileArcade(exported.files), {ms: 600});
    assert.equal(run.error ?? null, null);
    centred(boxes(run.screen(), 160));
});
