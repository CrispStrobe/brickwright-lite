import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ownedGameFiles, withRetainedTextSprite, INITIAL_SAMPLE, PRESSED_SAMPLE, RESET_SAMPLE} from './fixtures/arcade-owned-text-game.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import SB3Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';

test('owned full-game acceptance source translates without hidden unsupported elements', () => {
    const imported = arcadeToPseudocode(ownedGameFiles());
    assert.deepEqual(imported.unsupported, []);
    assert.match(imported.code, /arcade create text sprite/);
    assert.match(imported.code, /arcade register button "A"/);
    assert.equal(imported.costumes.find(costume => costume.sprite === 'hero').name, 'hero');
});

test('owned game and art run in the unchanged original Arcade with A and B', async () => {
    for (const [expected, steps] of [[INITIAL_SAMPLE, []], [PRESSED_SAMPLE, [
        {button: 5, held: true, delay: 80}, {button: 5, held: false, delay: 80}
    ]], [RESET_SAMPLE, [
        {button: 5, held: true, delay: 80}, {button: 5, held: false, delay: 80},
        {button: 6, held: true, delay: 80}, {button: 6, held: false, delay: 80}
    ]]]) {
        const result = await runPxtArcade(withRetainedTextSprite(ownedGameFiles()), {
            buttonActions: {afterGlobals: {ready: 1}, steps}, waitForGlobals: expected,
            inspectDisplay: true, waitForDisplay: true
        });
        for (const [name, value] of Object.entries(expected)) assert.equal(result[name], value, name);
        assert.equal(result.$display.screen.length, 160 * 120);
        assert.ok(result.$display.updatesAfterReady > 0);
        const labelArea = result.$display.screen.slice(16 * 160, 25 * 160);
        assert.ok(labelArea.includes(result.$display.palette[1]), 'TextSprite glyph pixels actually reach the screen');
    }
});


test('owned edited game exports to the unchanged original compiler and renders the same A action', async () => {
    const files = ownedGameFiles({message: 'PLAY', edited: true});
    const imported = arcadeToPseudocode(files); assert.deepEqual(imported.unsupported, []);
    const creator = new SB3Creator(); creator.parse(imported.code);
    for (const costume of imported.costumes) creator.applyCustomSVG(costume.sprite, costume.svg);
    const exported = projectToArcade(creator.project, {
        costumeSvg: (target, costume) => creator.assets.get(costume.assetId)?.data
    });
    assert.deepEqual(exported.unsupported, []);
    const expected = {...PRESSED_SAMPLE, heroPixel: 3};
    const options = {buttonActions: {afterGlobals: {ready: 1}, steps: [
        {button: 5, held: true, delay: 80}, {button: 5, held: false, delay: 80}
    ]}, waitForGlobals: expected, inspectDisplay: true, waitForDisplay: true};
    const first = await runPxtArcade(withRetainedTextSprite(files), options);
    const second = await runPxtArcade(withRetainedTextSprite(exported.files), options);
    for (const [name, value] of Object.entries(expected)) assert.equal(second[name], value, name);
    assert.deepEqual(second.$display.screen, first.$display.screen);
});
