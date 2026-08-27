import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

import {gameTouchProfileFor} from '../overlay/scratch-gui/src/lib/game-touch-controls.js';

const read = path => readFileSync(new URL(`../overlay/scratch-gui/src/${path}`, import.meta.url), 'utf8');

test('touch profiles expose the controls each unusual game actually uses', () => {
    assert.equal(gameTouchProfileFor('cloud_court').keys.left, 'a');
    assert.equal(gameTouchProfileFor('cloud_court').keys.up, 'w');
    assert.equal(gameTouchProfileFor('twinwall').keys.leftUp, 'w');
    assert.equal(gameTouchProfileFor('twinwall').keys.rightUp, 'ArrowUp');
    assert.equal(gameTouchProfileFor('fusion_foundry').keys.action, ' ');
    assert.equal(gameTouchProfileFor('g2048').layout, 'stage');
    assert.equal(gameTouchProfileFor('missile_ballet').layout, 'stage');
    assert.equal(gameTouchProfileFor(null), null);
});

test('game selection publishes controls and the right pane mounts them beside the stage', () => {
    const importer = read('components/tw-pseudocode/pseudocode-importer.jsx');
    const gui = read('components/gui/gui.jsx');
    const controls = read('components/tw-pseudocode/game-touch-controls.jsx');
    assert.match(importer, /runtime\.bwGameControlKey = gameKey \|\| null/);
    assert.match(importer, /BW_GAME_CONTROLS_CHANGED/);
    assert.match(gui, /<GameTouchControls gameKey=\{gameControlKey\} vm=\{vm\}/);
    assert.match(controls, /vm\.postIOData\('keyboard', \{key, isDown\}\)/);
    assert.match(controls, /onPointerCancel=\{\(\) => onUp\(control\)\}/);
    assert.match(controls, /window\.addEventListener\('blur', releaseAll\)/);
    assert.match(controls, /navigator\.maxTouchPoints > 0/);
});
