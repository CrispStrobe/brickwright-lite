import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

import {
    gameTouchProfileFor,
    releaseTouchControls,
    setTouchControl
} from '../overlay/scratch-gui/src/lib/game-touch-controls.js';
import {
    getVectorArt,
    vectorArtNames
} from '../overlay/scratch-gui/src/lib/sb3-creator-vector-art.js';
import games from '../overlay/scratch-gui/src/lib/sb3-creator-game-examples.js';

const read = path => readFileSync(new URL(`../overlay/scratch-gui/src/${path}`, import.meta.url), 'utf8');

const PUBLIC_GAMES = [
    'g2048', 'sigil_grid', 'sky_skim', 'chroma_code', 'fusion_foundry', 'missile_ballet', 'orbit_ward',
    'rooftop_relay', 'twinwall', 'turbo_chicane', 'abyss_rescue', 'specter_sweep',
    'moonlight_heist', 'cloud_court', 'ember_dojo', 'lockstep_lagoon', 'rink_riot',
    'rim_reactor', 'comet_cup', 'trench_signal', 'whisker_switch', 'spiral_circuit',
    'lilyway_rescue', 'rotor_rogue', 'prism_spire', 'shard_sheriff', 'halo_foundry',
    'corridor_kestrel', 'thunder_volley', 'cascade_pair', 'mooncoil_odyssey', 'cinder_thrust'
];

test('touch profiles expose the controls each unusual game actually uses', () => {
    assert.equal(gameTouchProfileFor('cloud_court').keys.left, 'a');
    assert.equal(gameTouchProfileFor('cloud_court').keys.up, 'w');
    assert.equal(gameTouchProfileFor('twinwall').keys.leftUp, 'w');
    assert.equal(gameTouchProfileFor('twinwall').keys.rightUp, 'ArrowUp');
    assert.equal(gameTouchProfileFor('fusion_foundry').keys.action, ' ');
    assert.equal(gameTouchProfileFor('g2048').layout, 'stage');
    assert.equal(gameTouchProfileFor('sigil_grid').layout, 'stage');
    assert.equal(gameTouchProfileFor('missile_ballet').layout, 'stage');
    assert.equal(gameTouchProfileFor('breakout').layout, 'stage');
    assert.equal(gameTouchProfileFor('pong_2p').layout, 'dual');
    assert.equal(gameTouchProfileFor('pong_ai').keys.up, 'w');
    assert.equal(gameTouchProfileFor('flappy').actionLabel, 'FLAP');
    assert.equal(gameTouchProfileFor('minesweeper').keys.action, 'f');
    assert.equal(gameTouchProfileFor('sky_skim').downLabel, 'DIVE');
    assert.equal(gameTouchProfileFor('sky_skim').keys.up, 'ArrowUp');
    assert.equal(gameTouchProfileFor('rooftop_relay').upLabel, 'JUMP');
    assert.equal(gameTouchProfileFor('rooftop_relay').downLabel, 'SLIDE');
    assert.equal(gameTouchProfileFor('fusion_foundry').actionLabel, 'DROP');
    assert.equal(gameTouchProfileFor('ember_dojo').actionLabel, 'PARRY');
    assert.equal(gameTouchProfileFor('trench_signal').actionLabel, 'SONAR');
    assert.equal(gameTouchProfileFor('corridor_kestrel').actionLabel, 'SHIELD');
    assert.equal(gameTouchProfileFor('cinder_thrust').keys.action, undefined);
    for (const game of PUBLIC_GAMES) {
        assert.notEqual(gameTouchProfileFor(game).hint, 'Use the touch pad and Action button.',
            `${game}: fell through to generic controls`);
    }
    assert.equal(gameTouchProfileFor(null), null);
});

test('every public game maps each gameplay key to a real, specifically labelled touch control', () => {
    const scratchKey = {
        'left arrow': 'ArrowLeft', 'right arrow': 'ArrowRight',
        'up arrow': 'ArrowUp', 'down arrow': 'ArrowDown',
        w: 'w', a: 'a', s: 's', d: 'd'
    };

    for (const game of PUBLIC_GAMES) {
        const source = games[game];
        const profile = gameTouchProfileFor(game);
        const mapped = new Set(Object.values(profile.keys || {}));
        const used = [...source.matchAll(
            /(?:WHEN |key )(left arrow|right arrow|up arrow|down arrow|[wasd])(?: key)? pressed/g
        )].map(match => scratchKey[match[1]]);

        if (profile.layout !== 'stage') {
            for (const key of used) assert.ok(mapped.has(key), `${game}: touch controls omit ${key}`);
        }
        if (/^# CONTROLS:.*\bSpace\b/im.test(source)) {
            assert.ok(mapped.has(' '), `${game}: touch controls omit its Space action`);
            assert.notEqual(profile.actionLabel, undefined, `${game}: its Space action is still labelled ACTION`);
        }
    }
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
    assert.match(controls, /profile\.keys\.action \? button\('action'\) : null/);
    assert.match(controls, /profile\.layout === 'horizontal'/);
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

test('authored SVGs do not claim Space-only startup or mouse-only pointer input', () => {
    const assets = vectorArtNames.map(name => getVectorArt(name));

    for (const svg of assets) {
        assert.doesNotMatch(svg, /PRESS SPACE TO/);
        assert.doesNotMatch(svg, /\bMOUSE\b/);
    }

    assert.ok(assets.some(svg => svg.includes('FLAG / SPACE: DEFEND')));
    assert.ok(assets.some(svg => svg.includes('POINTER = AIM')));
});
