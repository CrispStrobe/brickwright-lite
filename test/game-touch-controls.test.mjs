import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

import {
    gameTouchProfileFor,
    releaseTouchControls,
    setTouchControl
} from '../overlay/scratch-gui/src/lib/game-touch-controls.js';

const read = path => readFileSync(new URL(`../overlay/scratch-gui/src/${path}`, import.meta.url), 'utf8');

test('touch profiles expose the controls each unusual game actually uses', () => {
    assert.equal(gameTouchProfileFor('cloud_court').keys.left, 'a');
    assert.equal(gameTouchProfileFor('cloud_court').keys.up, 'w');
    assert.equal(gameTouchProfileFor('twinwall').keys.leftUp, 'w');
    assert.equal(gameTouchProfileFor('twinwall').keys.rightUp, 'ArrowUp');
    assert.equal(gameTouchProfileFor('fusion_foundry').keys.action, ' ');
    assert.equal(gameTouchProfileFor('g2048').layout, 'stage');
    assert.equal(gameTouchProfileFor('missile_ballet').layout, 'stage');
    assert.equal(gameTouchProfileFor('breakout').layout, 'stage');
    assert.equal(gameTouchProfileFor('pong_2p').layout, 'dual');
    assert.equal(gameTouchProfileFor('pong_ai').keys.up, 'w');
    assert.equal(gameTouchProfileFor('flappy').actionLabel, 'FLAP');
    assert.equal(gameTouchProfileFor('minesweeper').keys.action, 'f');
    assert.equal(gameTouchProfileFor('sky_skim').downLabel, 'DIVE');
    assert.equal(gameTouchProfileFor('sky_skim').keys.up, 'ArrowUp');
    assert.equal(gameTouchProfileFor(null), null);
});

test('game selection publishes controls and the right pane mounts them beside the stage', () => {
    const importer = read('components/tw-pseudocode/pseudocode-importer.jsx');
    const gui = read('components/gui/gui.jsx');
    const controls = read('components/tw-pseudocode/game-touch-controls.jsx');
    assert.match(importer, /runtime\.bwGameControlKey = gameKey \|\| null/);
    assert.match(importer, /this\.gameKeyForSource\(saved\.code\)/);
    assert.match(importer, /detail: \{key: 'bw-right-pane-hidden', value: '0'\}/);
    assert.match(importer, /BW_GAME_CONTROLS_CHANGED/);
    assert.match(gui, /<GameTouchControls gameKey=\{gameControlKey\} vm=\{vm\}/);
    assert.match(controls, /setTouchControl\(vm, profile, heldRef\.current, control, isDown\)/);
    assert.match(controls, /onPointerCancel=\{\(\) => onUp\(control\)\}/);
    assert.match(controls, /window\.addEventListener\('blur', releaseAll\)/);
    assert.match(controls, /navigator\.maxTouchPoints > 0/);
});

test('touch presses use Scratch keyboard IO and cannot leave duplicate or stuck keys', () => {
    const events = [];
    const vm = {postIOData: (device, data) => events.push({device, ...data})};
    const held = new Set();
    const profile = gameTouchProfileFor('cloud_court');

    assert.equal(setTouchControl(vm, profile, held, 'left', true), true);
    assert.equal(setTouchControl(vm, profile, held, 'left', true), false);
    assert.equal(setTouchControl(vm, profile, held, 'up', true), true);
    assert.deepEqual(events, [
        {device: 'keyboard', key: 'a', isDown: true},
        {device: 'keyboard', key: 'w', isDown: true}
    ]);

    releaseTouchControls(vm, profile, held);
    assert.deepEqual(events.slice(2), [
        {device: 'keyboard', key: 'a', isDown: false},
        {device: 'keyboard', key: 'w', isDown: false}
    ]);
    assert.equal(held.size, 0);
});
