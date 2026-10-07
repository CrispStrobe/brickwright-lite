import test from 'node:test';
import assert from 'node:assert/strict';
import SB3Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {ARCADE_PALETTE, pixelsToSvg} from '../overlay/scratch-gui/src/lib/bw-makecode/pixel-image.js';
import {compile} from '../scripts/lib/pxt-node.mjs';
import {runArcadeSim} from '../scripts/lib/makecode-arcade-sim.mjs';
import {AUTHORED_CORNERS, backgroundPixels} from './fixtures/arcade-background-artwork.mjs';

test('Scratch Stage transparency retains its white matte through original Arcade execution', async () => {
    const creator = new SB3Creator();
    creator.parse('DEVICE ARCADE\nBACKDROP art\nWHEN flag clicked:\n  switch backdrop to "art"\n');
    assert.deepEqual(creator.warnings, []);
    const svg = pixelsToSvg({width: 160, height: 120, pixels: backgroundPixels(AUTHORED_CORNERS)}, {scale: 3});
    const exported = projectToArcade(creator.project, {costumeSvg: (target, costume) => costume.name === 'art' ? svg : null});
    assert.deepEqual(exported.unsupported, []);
    const execute = async ts => {
        const compiled = await compile('arcade', {...exported.files, 'main.ts': ts});
        assert.equal(compiled.success, true, JSON.stringify(compiled.diagnostics));
        const run = await runArcadeSim(compiled.outfiles['binary.js'], {ms: 1000});
        assert.equal(run.error, null);
        return run.screen();
    };
    const expected = backgroundPixels(AUTHORED_CORNERS).map(colour => colour || 1);
    assert.deepEqual(await execute(exported.ts), expected);
    const mutant = exported.ts.replace('scene.setBackgroundColor(1)', 'scene.setBackgroundColor(0)');
    assert.notEqual(mutant, exported.ts);
    assert.notDeepEqual(await execute(mutant), expected, 'removing the Stage matte must change actual original pixels');
});

test('native Arcade scene primitives retain their own default background', () => {
    const creator = new SB3Creator();
    creator.parse('DEVICE ARCADE\nWHEN flag clicked:\n  arcade set background color to 0\n');
    assert.deepEqual(creator.warnings, []);
    const exported = projectToArcade(creator.project);
    assert.deepEqual(exported.unsupported, []);
    assert.doesNotMatch(exported.ts, /scene\.setBackgroundColor\(1\)/);
    assert.match(exported.ts, /scene\.setBackgroundColor\(0\)/);
});

test('value-only Arcade projects do not acquire a Stage matte without backdrop graphics', () => {
    const creator = new SB3Creator();
    creator.parse('DEVICE ARCADE\nGLOBAL value = 3\n');
    const exported = projectToArcade(creator.project);
    assert.doesNotMatch(exported.ts, /scene\.setBackgroundColor\(1\)/);
});

for (const callbackOnly of [false, true]) {
    test(`Stage matte follows custom palette white (${callbackOnly ? 'background callback' : 'backdrop scripts'})`, () => {
        const creator = new SB3Creator();
        creator.parse('DEVICE ARCADE\nBACKDROP art\n' +
            (callbackOnly ? '' : 'WHEN flag clicked:\n  switch backdrop to "art"\n') +
            'SPRITE Player:\n  WHEN flag clicked:\n    show\n');
        assert.deepEqual(creator.warnings, []);
        const palette = [...ARCADE_PALETTE];
        palette[1] = '#123456';
        palette[15] = '#ffffff';
        const options = {
            costumePalette: () => palette,
            costumeSvg: () => pixelsToSvg({width: 1, height: 1, pixels: [1]}),
            stageBackground: () => ({width: 160, height: 120, pixels: new Uint8Array(19200)})
        };
        const exported = projectToArcade(creator.project, options);
        assert.match(exported.ts, /scene\.setBackgroundColor\(15\)/);
        assert.equal(JSON.parse(exported.files['pxt.json']).palette[15], '#ffffff');
        assert.deepEqual(exported.warnings, []);
        palette[15] = '#eeeeee';
        const quantized = projectToArcade(creator.project, options);
        assert.match(quantized.ts, /scene\.setBackgroundColor\(15\)/);
        assert.ok(quantized.warnings.includes('Stage white matte quantized to the nearest opaque project palette colour'));
    });
}
