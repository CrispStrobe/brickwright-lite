import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

import SB3Creator from '../packages/scratch-gui/src/lib/sb3-creator.js';
import games from '../overlay/scratch-gui/src/lib/sb3-creator-game-examples.js';
import {VM, clearStrayTimers, runProgram, quitStrandedVMs} from './helpers/bw-vm.mjs';

const EXPECTED = [
    'g2048',
    'sigil_grid',
    'vector_seven',
    'reactor_ricochet',
    'flux_vault',
    'neon_circuit',
    'canal_command',
    'sky_skim',
    'chroma_code',
    'fusion_foundry',
    'missile_ballet',
    'orbit_ward',
    'rooftop_relay',
    'twinwall',
    'turbo_chicane',
    'abyss_rescue',
    'specter_sweep',
    'moonlight_heist',
    'cloud_court',
    'ember_dojo',
    'lockstep_lagoon',
    'rink_riot',
    'rim_reactor',
    'comet_cup',
    'trench_signal',
    'whisker_switch',
    'spiral_circuit',
    'lilyway_rescue',
    'rotor_rogue',
    'prism_spire',
    'shard_sheriff',
    'halo_foundry',
    'corridor_kestrel',
    'thunder_volley',
    'cascade_pair',
    'mooncoil_odyssey',
    'cinder_thrust'
];

test.after(() => quitStrandedVMs());

test('only quality-approved new games are wired into the visible examples gallery', () => {
    const importer = readFileSync(new URL(
        '../overlay/scratch-gui/src/components/tw-pseudocode/pseudocode-importer.jsx', import.meta.url), 'utf8');
    for (const [name, source] of Object.entries(games)) {
        assert.ok(source.length > 0, `${name}: empty game source`);
    }
    const approved = new Set([
        'g2048',
        'sigil_grid',
        'vector_seven',
        'reactor_ricochet',
        'flux_vault',
        'neon_circuit',
        'canal_command',
        'sky_skim', 'missile_ballet', 'orbit_ward', 'chroma_code', 'fusion_foundry', 'rooftop_relay',
        'twinwall', 'turbo_chicane', 'abyss_rescue', 'specter_sweep', 'moonlight_heist', 'cloud_court',
        'ember_dojo', 'lockstep_lagoon', 'rink_riot', 'rim_reactor', 'comet_cup', 'trench_signal',
        'whisker_switch', 'spiral_circuit', 'lilyway_rescue', 'rotor_rogue', 'prism_spire', 'shard_sheriff',
        'halo_foundry', 'corridor_kestrel', 'thunder_volley', 'cascade_pair',
        'mooncoil_odyssey', 'cinder_thrust'
    ]);
    for (const name of approved) {
        assert.match(importer, new RegExp(`\\['${name}',`), `${name}: polished game is missing from the Games menu`);
    }
    for (const name of EXPECTED.filter(name => !approved.has(name))) {
        assert.doesNotMatch(importer, new RegExp(`\\['${name}',`), `${name}: unaudited prototype is public`);
    }
    const archivedPrototypes = [
        'snake', 'snake_pro', 'breakout', 'pong_2p', 'pong_ai', 'tetris', 'sokoban', 'bomberman',
        'invaders', 'flappy', 'tictactoe', 'tictactoe_ai', 'maze', 'connect4', 'minesweeper'
    ];
    for (const name of archivedPrototypes) {
        assert.doesNotMatch(importer, new RegExp(`\\['${name}',`),
            `${name}: archived mechanics prototype leaked into the finished Games gallery`);
    }
    assert.match(importer, /\.\.\.gameExamples/, 'game module is not merged into the gallery examples');
});

test('green flag crosses every title gate in the ordinary right-hand stage', () => {
    for (const [name, source] of Object.entries(games)) {
        if (name === 'g2048') {
            assert.match(source, /wait 0\.6 seconds\n    IF started = 0 THEN:/,
                `${name}: its native green-flag start was lost`);
            continue;
        }
        assert.match(source, /GLOBAL brickwrightFlagPending/,
            `${name}: delayed green-flag start has no cancellation state`);
        assert.match(source, /WHEN flag clicked:\n    set brickwrightFlagPending to 1\n    wait 0\.6 seconds\n    IF brickwrightFlagPending = 1 THEN:\n      set brickwrightFlagPending to 0\n      broadcast "__brickwright_start_from_flag"/,
            `${name}: green flag still leaves the title screen waiting for a keyboard`);
        assert.match(source, /WHEN space key pressed:\n    IF [A-Za-z][A-Za-z0-9]* = 0 THEN:\n      set brickwrightFlagPending to 0/,
            `${name}: a real Space start does not cancel the delayed fallback`);
        assert.match(source, /WHEN I receive "__brickwright_start_from_flag":/,
            `${name}: delayed green-flag start has no receiver`);
        const bridge = source.match(/WHEN I receive "__brickwright_start_from_flag":\n((?:    .*\n?)*)/)?.[1] || '';
        assert.match(bridge, /^    IF [A-Za-z][A-Za-z0-9]* = 0 THEN:/,
            `${name}: delayed green-flag start is not guarded by the title state`);
        assert.doesNotMatch(bridge, /^    ELSE:/m,
            `${name}: delayed green-flag start copied a gameplay action`);
    }
});

test('approved games state attainable goals instead of endless survival non-goals', () => {
    for (const [name, source] of Object.entries(games)) {
        assert.match(source, /^# GOAL:/m, `${name}: no player-facing goal`);
        assert.doesNotMatch(source, /survive as long as possible/i,
            `${name}: endless survival is not an attainable finish`);
    }
});

test('green flag actually starts every game in the real Scratch VM without Space', async () => {
    for (const [name, source] of Object.entries(games)) {
        const startVariable = name === 'g2048' ? 'started' :
            source.match(/WHEN space key pressed:\n    IF ([A-Za-z][A-Za-z0-9]*) = 0 THEN:/)?.[1];
        assert.ok(startVariable, `${name}: cannot identify the title-gate state variable`);

        const creator = new SB3Creator();
        creator.parse(source);
        const vm = new VM();
        try {
            await vm.loadProject(Buffer.from(await (await creator.generateSB3()).arrayBuffer()));
            vm.start();
            vm.greenFlag();
            for (let i = 0; i < 20; i++) vm.runtime._step();
            await new Promise(resolve => setTimeout(resolve, 700));
            for (let i = 0; i < 35; i++) vm.runtime._step();
            const state = Object.values(vm.runtime.getTargetForStage().variables)
                .find(variable => variable.name === startVariable);
            assert.equal(Number(state?.value), 1,
                `${name}: green flag left the game on its title screen`);
        } finally {
            vm.quit();
            clearStrayTimers();
        }
    }
});

test('an early desktop Space start is not replayed as a gameplay action', async () => {
    const creator = new SB3Creator();
    creator.parse(games.fusion_foundry);
    const vm = new VM();
    try {
        await vm.loadProject(Buffer.from(await (await creator.generateSB3()).arrayBuffer()));
        vm.start();
        vm.greenFlag();
        for (let i = 0; i < 20; i++) vm.runtime._step();
        vm.postIOData('keyboard', {key: ' ', isDown: true});
        for (let i = 0; i < 30; i++) vm.runtime._step();
        vm.postIOData('keyboard', {key: ' ', isDown: false});

        const foundry = vm.runtime.targets.find(target => target.sprite.name === 'Foundry');
        const grid = Object.values(foundry.variables).find(variable => variable.name === 'grid');
        assert.equal(grid.value.filter(value => Number(value) > 0).length, 0,
            'the title-start key press also dropped a core');

        await new Promise(resolve => setTimeout(resolve, 700));
        for (let i = 0; i < 35; i++) vm.runtime._step();
        assert.equal(grid.value.filter(value => Number(value) > 0).length, 0,
            'the delayed green-flag bridge replayed the Space-key action');

        vm.postIOData('keyboard', {key: ' ', isDown: true});
        for (let i = 0; i < 35; i++) vm.runtime._step();
        vm.postIOData('keyboard', {key: ' ', isDown: false});
        assert.equal(grid.value.filter(value => Number(value) > 0).length, 1,
            'the first deliberate gameplay press did not drop exactly one core');
    } finally {
        vm.quit();
        clearStrayTimers();
    }
});

test('Nova Grid replaces the bare 2048 prototype with a complete reactor puzzle', () => {
    const creator = new SB3Creator();
    const project = creator.parse(games.g2048);
    assert.deepEqual(creator.errors, []);
    assert.deepEqual(creator.warnings, []);
    assert.match(games.g2048, /GOAL: forge the 2048 Nova tile/);
    assert.match(games.g2048, /CONTROLS: Arrow keys slide every tile/);
    assert.match(games.g2048, /broadcast "ignite nova grid"/);
    assert.match(games.g2048, /wait 0\.6 seconds/);
    assert.match(games.g2048, /started = 0 and mouse down\?/);
    assert.match(games.g2048, /broadcast "move nova left"/);
    assert.match(games.g2048, /change score by \(item p of linebuf\) \* chain/);
    assert.match(games.g2048, /IF empties = 0 and possible = 0 THEN:/);
    assert.match(games.g2048, /broadcast "nova forged"/);
    const stage = project.targets.find(target => target.isStage);
    assert.deepEqual(stage.costumes.map(costume => costume.name), ['backdrop1', 'intro', 'reactor']);
    const svgs = [...creator.assets.values()].filter(asset => asset.type === 'svg').map(asset => asset.data);
    assert.ok(svgs.some(svg => svg.includes('NOVA GRID')));
    assert.ok(svgs.some(svg => svg.includes('FUSE EQUAL TILES')));
    assert.ok(svgs.some(svg => svg.includes('FORGE 2048')));
});

test('Sigil Grid is a complete solo or local-duo tactics game', () => {
    const creator = new SB3Creator();
    const project = creator.parse(games.sigil_grid);
    assert.deepEqual(creator.errors, []);
    assert.deepEqual(creator.warnings, []);
    assert.match(games.sigil_grid, /GOAL: claim three aligned sigils before your rival/);
    assert.match(games.sigil_grid, /CONTROLS: tap an empty cell/);
    assert.match(games.sigil_grid, /set mode to 1/);
    assert.match(games.sigil_grid, /set mode to 2/);
    assert.match(games.sigil_grid, /DEFINE find tactic for \(mark\):/);
    assert.match(games.sigil_grid, /find tactic for 2[\s\S]*find tactic for 1/);
    assert.match(games.sigil_grid, /item 5 of board = 0/);
    assert.match(games.sigil_grid, /check line 1 5 9/);
    assert.match(games.sigil_grid, /check line 3 5 7/);
    assert.match(games.sigil_grid, /broadcast "sigil duel finished"/);
    const stage = project.targets.find(target => target.isStage);
    const board = project.targets.find(target => target.name === 'Board');
    assert.deepEqual(stage.costumes.map(costume => costume.name), ['backdrop1', 'intro', 'arena']);
    assert.deepEqual(board.costumes.map(costume => costume.name), ['costume1', 'blank', 'sun', 'moon']);
    const svgs = [...creator.assets.values()].filter(asset => asset.type === 'svg').map(asset => asset.data);
    assert.ok(svgs.some(svg => svg.includes('SIGIL GRID')));
    assert.ok(svgs.some(svg => svg.includes('THREE IN A LINE WINS')));
    assert.ok(svgs.some(svg => svg.includes('TACTICAL RIVAL')));
});

test('Sigil Grid accepts stage taps and its solo rival blocks a forced win in the real VM', async () => {
    const creator = new SB3Creator();
    creator.parse(games.sigil_grid);
    const vm = new VM();
    const stageValue = name => Object.values(vm.runtime.getTargetForStage().variables)
        .find(variable => variable.name === name);
    const tap = async (x, y) => {
        vm.postIOData('mouse', {x, y, canvasWidth: 480, canvasHeight: 360, isDown: true});
        for (let i = 0; i < 14; i++) vm.runtime._step();
        vm.postIOData('mouse', {x, y, canvasWidth: 480, canvasHeight: 360, isDown: false});
        for (let i = 0; i < 18; i++) vm.runtime._step();
        // The rival deliberately pauses to telegraph its move, then names the
        // next turn. Wait through both speech bubbles before the next tap.
        await new Promise(resolve => setTimeout(resolve, 1200));
        for (let i = 0; i < 45; i++) vm.runtime._step();
    };
    try {
        await vm.loadProject(Buffer.from(await (await creator.generateSB3()).arrayBuffer()));
        vm.start();
        vm.greenFlag();
        for (let i = 0; i < 20; i++) vm.runtime._step();
        await new Promise(resolve => setTimeout(resolve, 700));
        for (let i = 0; i < 40; i++) vm.runtime._step();

        const boardTarget = vm.runtime.targets.find(target => target.sprite.name === 'Board');
        const board = Object.values(boardTarget.variables).find(variable => variable.name === 'board');
        assert.equal(Number(stageValue('started').value), 1, 'green flag did not select solo play');
        assert.equal(Number(stageValue('active').value), 1, 'green flag did not open the board');
        assert.deepEqual(board.value.map(Number), [0, 0, 0, 0, 0, 0, 0, 0, 0]);

        await tap(154, 89); // Scratch (-86, 91): upper-left cell.
        assert.equal(Number(board.value[0]), 1, 'stage tap did not place the player sun');
        assert.equal(Number(board.value[4]), 2, 'rival did not answer with the open centre');

        board.value = [1, 1, 0, 0, 2, 0, 0, 0, 0];
        stageValue('moves').value = 3;
        stageValue('winner').value = 0;
        stageValue('turn').value = 1;
        stageValue('active').value = 1;
        await tap(154, 261); // Give the player cell 7; cells 1-2 now threaten cell 3.
        assert.equal(Number(board.value[6]), 1, 'second stage tap did not reach the intended cell');
        assert.equal(Number(board.value[2]), 2, 'rival failed to block the immediate row win');
    } finally {
        vm.quit();
        clearStrayTimers();
    }
});

test('Vector Seven is a finite paddle match with aimable, charged returns', () => {
    const creator = new SB3Creator();
    const project = creator.parse(games.vector_seven);
    assert.deepEqual(creator.errors, []);
    assert.deepEqual(creator.warnings, []);
    assert.match(games.vector_seven, /GOAL: score 7 points before the rival/);
    assert.match(games.vector_seven, /CONTROLS: drag or tap across the stage/);
    assert.match(games.vector_seven, /set hitOffset to \(ballX - playerX\) \/ 11/);
    assert.match(games.vector_seven, /IF \(rally mod 4\) = 0 THEN:/);
    assert.match(games.vector_seven, /change playerScore by 2/);
    assert.match(games.vector_seven, /IF playerScore = 7 THEN:/);
    assert.match(games.vector_seven, /IF rivalScore = 7 THEN:/);
    const stage = project.targets.find(target => target.isStage);
    assert.deepEqual(stage.costumes.map(costume => costume.name), ['backdrop1', 'intro', 'court']);
    const pulse = project.targets.find(target => target.name === 'Pulse');
    assert.deepEqual(pulse.costumes.map(costume => costume.name), ['costume1', 'charged']);
    const svgs = [...creator.assets.values()].filter(asset => asset.type === 'svg').map(asset => asset.data);
    assert.ok(svgs.some(svg => svg.includes('VECTOR SEVEN')));
    assert.ok(svgs.some(svg => svg.includes('FIRST TO 7 WINS')));
    assert.ok(svgs.some(svg => svg.includes('4TH RETURN = CHARGED 2-POINT SHOT')));
});

test('Vector Seven serves, aims, charges, and reaches seven in the real VM', async () => {
    const creator = new SB3Creator();
    creator.parse(games.vector_seven);
    const vm = new VM();
    const value = name => Object.values(vm.runtime.getTargetForStage().variables)
        .find(variable => variable.name === name);
    const step = count => { for (let i = 0; i < count; i++) vm.runtime._step(); };
    try {
        await vm.loadProject(Buffer.from(await (await creator.generateSB3()).arrayBuffer()));
        vm.start();
        vm.greenFlag();
        step(20);
        await new Promise(resolve => setTimeout(resolve, 700));
        step(45);
        assert.equal(Number(value('playing').value), 1, 'green flag did not start the finite match');
        assert.equal(Number(value('serve').value), 1, 'match did not wait in a visible serve state');

        vm.postIOData('mouse', {x: 360, y: 300, canvasWidth: 480, canvasHeight: 360, isDown: true});
        step(18);
        vm.postIOData('mouse', {x: 360, y: 300, canvasWidth: 480, canvasHeight: 360, isDown: false});
        step(20);
        assert.equal(Number(value('playerX').value), 120, 'stage drag did not move the player paddle');
        assert.equal(Number(value('serve').value), 0, 'stage tap did not launch the serve');
        assert.ok(Number(value('ballVY').value) > 0, 'serve did not travel toward the rival');

        value('ballX').value = 153;
        value('ballY').value = -130;
        value('ballVX').value = 0;
        value('ballVY').value = -5;
        value('rally').value = 0;
        step(4);
        assert.ok(Number(value('ballVX').value) > 2, 'off-centre strike did not aim the return');
        assert.ok(Number(value('ballVY').value) > 0, 'player paddle did not return the pulse');
        assert.equal(Number(value('rally').value), 1, 'return did not advance the charge counter');

        value('ballX').value = 142;
        value('ballY').value = -130;
        value('ballVX').value = 0;
        value('ballVY').value = -5;
        value('rally').value = 3;
        value('charged').value = 0;
        step(4);
        assert.equal(Number(value('rally').value), 4, 'fourth return was not counted');
        assert.equal(Number(value('charged').value), 1, 'fourth return did not become charged');

        value('playerScore').value = 5;
        value('ballX').value = 200;
        value('ballY').value = 179;
        value('ballVX').value = 0;
        value('ballVY').value = 5;
        value('serve').value = 0;
        step(5);
        assert.equal(Number(value('playerScore').value), 7, 'charged winner was not worth two points');
        assert.equal(Number(value('winner').value), 1, 'reaching seven did not declare the player');
        assert.equal(Number(value('playing').value), 0, 'match continued after its attainable finish');
    } finally {
        vm.quit();
        clearStrayTimers();
    }
});

test('Reactor Ricochet is a finite brick field with armour and collectible power cells', () => {
    const creator = new SB3Creator();
    const project = creator.parse(games.reactor_ricochet);
    assert.deepEqual(creator.errors, []);
    assert.deepEqual(creator.warnings, []);
    assert.match(games.reactor_ricochet, /GOAL: break all 20 reactor cells before three pulses escape/);
    assert.match(games.reactor_ricochet, /REPEAT 4:[\s\S]*REPEAT 5:/);
    assert.match(games.reactor_ricochet, /IF armour = 2 THEN:/);
    assert.match(games.reactor_ricochet, /broadcast "drop capacitor"/);
    assert.match(games.reactor_ricochet, /set wideTime to 8/);
    assert.match(games.reactor_ricochet, /broadcast "split reactor pulse"/);
    assert.match(games.reactor_ricochet, /IF cells = 0 THEN:/);
    const stage = project.targets.find(target => target.isStage);
    const cell = project.targets.find(target => target.name === 'Cell');
    assert.deepEqual(stage.costumes.map(costume => costume.name), ['backdrop1', 'intro', 'chamber']);
    assert.deepEqual(cell.costumes.map(costume => costume.name),
        ['costume1', 'armour', 'capacitor']);
    const svgs = [...creator.assets.values()].filter(asset => asset.type === 'svg').map(asset => asset.data);
    assert.ok(svgs.some(svg => svg.includes('REACTOR RICOCHET')));
    assert.ok(svgs.some(svg => svg.includes('CLEAR 20 CELLS')));
    assert.ok(svgs.some(svg => svg.includes('CYAN = POWER CELL')));
});

test('Reactor Ricochet builds its field, launches, splits, and consumes three lives in the real VM', async () => {
    const creator = new SB3Creator();
    creator.parse(games.reactor_ricochet);
    const vm = new VM();
    const value = name => Object.values(vm.runtime.getTargetForStage().variables)
        .find(variable => variable.name === name);
    const step = count => { for (let i = 0; i < count; i++) vm.runtime._step(); };
    try {
        await vm.loadProject(Buffer.from(await (await creator.generateSB3()).arrayBuffer()));
        vm.start();
        vm.greenFlag();
        step(20);
        await new Promise(resolve => setTimeout(resolve, 700));
        step(70);
        assert.equal(Number(value('active').value), 1, 'green flag did not ignite the chamber');
        assert.equal(Number(value('cells').value), 20, 'field did not expose its finite objective');
        assert.equal(Number(value('lives').value), 3, 'match did not begin with three pulses');
        assert.equal(vm.runtime.targets.filter(target => target.sprite.name === 'Cell').length, 21,
            'the original Cell sprite did not build exactly 20 playable clones');

        vm.postIOData('mouse', {x: 320, y: 310, canvasWidth: 480, canvasHeight: 360, isDown: true});
        step(16);
        vm.postIOData('mouse', {x: 320, y: 310, canvasWidth: 480, canvasHeight: 360, isDown: false});
        step(20);
        assert.equal(Number(value('serve').value), 0, 'stage tap did not launch the reactor pulse');
        assert.ok(Number(value('ballVY').value) > 0, 'launched pulse had no upward velocity');

        const pulsesBefore = vm.runtime.targets.filter(target => target.sprite.name === 'Pulse').length;
        vm.runtime.startHats('event_whenbroadcastreceived', {BROADCAST_OPTION: 'split reactor pulse'});
        step(12);
        assert.ok(vm.runtime.targets.filter(target => target.sprite.name === 'Pulse').length > pulsesBefore,
            'capacitor broadcast did not create a second live pulse');

        for (const remaining of [2, 1, 0]) {
            value('serve').value = 0;
            value('ballY').value = -182;
            value('ballVY').value = -5;
            step(6);
            assert.equal(Number(value('lives').value), remaining, 'escaped pulse did not consume one life');
            await new Promise(resolve => setTimeout(resolve, 650));
            step(20);
        }
        assert.equal(Number(value('active').value), 0, 'game continued after all three pulses escaped');
        assert.equal(Number(value('started').value), 0, 'finished game did not become replayable');
    } finally {
        vm.quit();
        clearStrayTimers();
    }
});

test('Flux Vault is a three-chamber push puzzle with exact occupancy rules', () => {
    const creator = new SB3Creator();
    const project = creator.parse(games.flux_vault);
    assert.deepEqual(creator.errors, []);
    assert.deepEqual(creator.warnings, []);
    assert.match(games.flux_vault, /GOAL: push all three cyan cores onto gold docks in each chamber/);
    assert.match(games.flux_vault, /LIST terrain/);
    assert.match(games.flux_vault, /LIST crates/);
    assert.match(games.flux_vault,
        /IF \(item beyondCell of terrain = 0 or item beyondCell of terrain = 2\) and occupied = 0 THEN:/);
    assert.match(games.flux_vault, /replace item crateAt of crates with beyondCell/);
    assert.match(games.flux_vault, /IF docked = 3 THEN:/);
    assert.match(games.flux_vault, /IF level = 4 THEN:/);
    assert.match(games.flux_vault, /broadcast "reset flux chamber"/);
    const stage = project.targets.find(target => target.isStage);
    const vault = project.targets.find(target => target.name === 'Vault');
    assert.deepEqual(stage.costumes.map(costume => costume.name), ['backdrop1', 'intro', 'vault']);
    assert.deepEqual(vault.costumes.map(costume => costume.name),
        ['costume1', 'wall', 'dock', 'core', 'charged', 'keeper']);
    const svgs = [...creator.assets.values()].filter(asset => asset.type === 'svg').map(asset => asset.data);
    assert.ok(svgs.some(svg => svg.includes('FLUX VAULT')));
    assert.ok(svgs.some(svg => svg.includes('CLEAR 3 CHAMBERS')));
    assert.ok(svgs.some(svg => svg.includes('CORES CANNOT BE PULLED')));
});

test('Flux Vault has a playable solution for all three chambers in the real VM', async () => {
    const creator = new SB3Creator();
    creator.parse(games.flux_vault);
    const vm = new VM();
    const value = name => Object.values(vm.runtime.getTargetForStage().variables)
        .find(variable => variable.name === name);
    const step = count => { for (let i = 0; i < count; i++) vm.runtime._step(); };
    const keys = {U: 'ArrowUp', D: 'ArrowDown', L: 'ArrowLeft', R: 'ArrowRight'};
    const play = sequence => {
        for (const move of sequence) {
            vm.postIOData('keyboard', {key: keys[move], isDown: true});
            step(8);
            vm.postIOData('keyboard', {key: keys[move], isDown: false});
            step(8);
        }
    };
    try {
        await vm.loadProject(Buffer.from(await (await creator.generateSB3()).arrayBuffer()));
        vm.start();
        vm.greenFlag();
        step(20);
        await new Promise(resolve => setTimeout(resolve, 700));
        step(50);
        assert.equal(Number(value('level').value), 1, 'green flag did not open chamber one');
        assert.equal(Number(value('active').value), 1, 'chamber one was not playable');

        play('U');
        assert.equal(Number(value('playerCell').value), 26, 'arrow input did not move exactly one grid tile');
        vm.postIOData('keyboard', {key: ' ', isDown: true});
        step(20);
        vm.postIOData('keyboard', {key: ' ', isDown: false});
        step(25);
        const vaultTarget = vm.runtime.targets.find(target => target.sprite.name === 'Vault');
        const crates = Object.values(vaultTarget.variables).find(variable => variable.name === 'crates');
        assert.equal(Number(value('playerCell').value), 34, 'RESET did not restore the keeper start');
        assert.deepEqual(crates.value.map(Number), [12, 20, 28], 'RESET did not restore all three cores');

        const solutions = ['URRRLLURRLLURR', 'RUUDRRUDDRRUU', 'RDRDLRRDRU'];
        for (let level = 1; level <= 3; level++) {
            play(solutions[level - 1]);
            await new Promise(resolve => setTimeout(resolve, 800));
            step(40);
            assert.equal(Number(value('level').value), level + 1, `chamber ${level} did not advance`);
        }
        assert.equal(Number(value('active').value), 0, 'vault remained active after chamber three');
        assert.equal(Number(value('started').value), 0, 'solved vault was not replayable');
        assert.ok(Number(value('pushes').value) >= 9, 'solutions did not register their core pushes');
    } finally {
        vm.quit();
        clearStrayTimers();
    }
});

test('Neon Circuit has three finite cross-flip boards with authored node art', () => {
    const creator = new SB3Creator();
    const project = creator.parse(games.neon_circuit);
    assert.deepEqual(creator.errors, []);
    assert.deepEqual(creator.warnings, []);
    assert.match(games.neon_circuit, /GOAL: extinguish all 25 nodes on each of 3 boards/);
    assert.match(games.neon_circuit, /DEFINE FAST flip cross \(index\):/);
    assert.match(games.neon_circuit, /flip one \(index - 5\)/);
    assert.match(games.neon_circuit, /flip one \(index \+ 5\)/);
    assert.match(games.neon_circuit, /IF lit = 0 THEN:/);
    assert.match(games.neon_circuit, /IF level = 4 THEN:/);
    const stage = project.targets.find(target => target.isStage);
    assert.deepEqual(stage.costumes.map(costume => costume.name), ['backdrop1', 'intro', 'board']);
    const svgs = [...creator.assets.values()].filter(asset => asset.type === 'svg').map(asset => asset.data);
    assert.ok(svgs.some(svg => svg.includes('NEON CIRCUIT')));
    assert.ok(svgs.some(svg => svg.includes('DARKEN ALL 25')));
});

test('Neon Circuit starts by green flag and all three known solutions finish in the real VM', async () => {
    const creator = new SB3Creator();
    creator.parse(games.neon_circuit);
    const vm = new VM();
    const value = name => Object.values(vm.runtime.getTargetForStage().variables)
        .find(variable => variable.name === name);
    const step = count => { for (let i = 0; i < count; i++) vm.runtime._step(); };
    const tap = index => {
        const row = Math.floor((index - 1) / 5);
        const col = (index - 1) % 5;
        vm.postIOData('mouse', {x: 116 + (col * 62), y: 56 + (row * 62),
            canvasWidth: 480, canvasHeight: 360, isDown: true});
        step(10);
        vm.postIOData('mouse', {x: 116 + (col * 62), y: 56 + (row * 62),
            canvasWidth: 480, canvasHeight: 360, isDown: false});
        step(10);
    };
    try {
        await vm.loadProject(Buffer.from(await (await creator.generateSB3()).arrayBuffer()));
        vm.start();
        vm.greenFlag();
        step(20);
        await new Promise(resolve => setTimeout(resolve, 700));
        step(45);
        const solutions = [[7, 9, 13, 17, 19], [1, 5, 7, 9, 13, 17, 19, 21, 25],
            [2, 4, 6, 8, 12, 14, 18, 20, 22, 24]];
        for (let level = 1; level <= 3; level++) {
            assert.equal(Number(value('level').value), level, `board ${level} did not load`);
            for (const cell of solutions[level - 1]) tap(cell);
            await new Promise(resolve => setTimeout(resolve, 700));
            step(35);
            assert.equal(Number(value('level').value), level + 1, `board ${level} solution did not advance`);
        }
        assert.equal(Number(value('lit').value), 0, 'solved circuit retained a lit node');
        assert.equal(Number(value('active').value), 0, 'circuit remained active after board three');
        assert.equal(Number(value('started').value), 0, 'solved circuit was not replayable');
    } finally {
        vm.quit();
        clearStrayTimers();
    }
});

test('Canal Command enforces the lock sequence and lifts four boats in the real VM', async () => {
    const creator = new SB3Creator();
    const project = creator.parse(games.canal_command);
    assert.deepEqual(creator.errors, []);
    assert.deepEqual(creator.warnings, []);
    assert.match(games.canal_command, /GOAL: lift 4 boats from the low canal to the high canal/);
    assert.match(games.canal_command, /lowerGate = 0 and upperGate = 0/);
    assert.match(games.canal_command, /IF faults = 3 THEN:/);
    assert.match(games.canal_command, /IF boats = 4 THEN:/);
    assert.deepEqual(project.targets.find(target => target.isStage).costumes.map(costume => costume.name),
        ['backdrop1', 'intro', 'lock']);
    const vm = new VM();
    const value = name => Object.values(vm.runtime.getTargetForStage().variables)
        .find(variable => variable.name === name);
    const step = count => { for (let i = 0; i < count; i++) vm.runtime._step(); };
    const click = async (name, delay = 0) => {
        const target = vm.runtime.targets.find(item => item.sprite.name === name);
        vm.runtime.startHats('event_whenthisspriteclicked', {}, target);
        step(35);
        if (delay) await new Promise(resolve => setTimeout(resolve, delay));
        step(35);
    };
    try {
        await vm.loadProject(Buffer.from(await (await creator.generateSB3()).arrayBuffer()));
        vm.start();
        vm.greenFlag();
        step(20);
        await new Promise(resolve => setTimeout(resolve, 700));
        step(40);
        for (let boat = 1; boat <= 4; boat++) {
            if (boat > 1) await click('PumpButton');
            await click('LowerButton', 650);
            await click('PumpButton');
            await click('UpperButton', 1200);
            assert.equal(Number(value('boats').value), boat, `boat ${boat} did not clear the upper gate`);
        }
        assert.equal(Number(value('faults').value), 0, 'legal lock sequence triggered an interlock fault');
        assert.equal(Number(value('active').value), 0, 'lock remained active after four boats');
        assert.equal(Number(value('started').value), 0, 'completed lock was not replayable');
    } finally {
        vm.quit();
        clearStrayTimers();
    }
});

test('quality-approved game has authored SVG art and explicit onboarding', () => {
    const creator = new SB3Creator();
    const project = creator.parse(games.sky_skim);
    assert.deepEqual(creator.errors, []);
    assert.deepEqual(creator.warnings, []);
    const stage = project.targets.find(target => target.isStage);
    const bird = project.targets.find(target => target.name === 'Skimmer');
    const hill = project.targets.find(target => target.name === 'Hill');
    assert.deepEqual(stage.costumes.map(costume => costume.name), ['backdrop1', 'intro', 'flight']);
    assert.equal(bird.costumes.length, 2);
    assert.equal(hill.costumes.length, 1);
    assert.match(games.sky_skim, /GOAL: complete twelve clean hill launches before three crashes/);
    assert.match(games.sky_skim, /CONTROLS:/);
    assert.match(games.sky_skim, /WHEN space key pressed:/);
    const svgs = [...creator.assets.values()].filter(asset => asset.type === 'svg').map(asset => asset.data);
    assert.ok(svgs.some(svg => svg.includes('SKYLINE SWOOP')));
    assert.ok(svgs.some(svg => svg.includes('12 CLEAN LAUNCHES WIN')));
    assert.ok(svgs.some(svg => svg.includes('GREEN FLAG STARTS FLIGHT')));
    assert.match(games.sky_skim, /change launches by 1/);
    assert.match(games.sky_skim, /IF launches = 12 THEN:/);
    assert.match(games.sky_skim, /SKYLINE MASTERED/);
});

test('Skyline Swoop clean launches build combo and the twelfth wins in the real VM', async () => {
    const creator = new SB3Creator();
    creator.parse(games.sky_skim);
    const vm = new VM();
    try {
        await vm.loadProject(Buffer.from(await (await creator.generateSB3()).arrayBuffer()));
        vm.start();
        vm.greenFlag();
        for (let i = 0; i < 25; i++) vm.runtime._step();
        const values = Object.values(vm.runtime.getTargetForStage().variables);
        const value = name => values.find(variable => variable.name === name);
        value('launches').value = 11;
        value('combo').value = 3;
        value('score').value = 50;
        value('alive').value = 1;

        vm.runtime.startHats('event_whenbroadcastreceived', {
            BROADCAST_OPTION: 'clean skyline launch'
        });
        for (let i = 0; i < 30; i++) vm.runtime._step();

        assert.equal(Number(value('launches').value), 12);
        assert.equal(Number(value('combo').value), 4);
        assert.equal(Number(value('score').value), 70);
        assert.equal(Number(value('alive').value), 0, 'the twelfth launch did not finish the flight');
    } finally {
        vm.quit();
        clearStrayTimers();
    }
});

test('second quality-approved game explains and renders its collision strategy', () => {
    const creator = new SB3Creator();
    const project = creator.parse(games.missile_ballet);
    assert.deepEqual(creator.errors, []);
    assert.deepEqual(creator.warnings, []);
    assert.match(games.missile_ballet, /GOAL: force the homing missiles across each other's paths/);
    assert.match(games.missile_ballet, /CONTROLS: move the mouse to steer/);
    assert.match(games.missile_ballet, /WHEN space key pressed:/);
    const stage = project.targets.find(target => target.isStage);
    assert.deepEqual(stage.costumes.map(costume => costume.name), ['backdrop1', 'intro', 'scramble']);
    const svgs = [...creator.assets.values()].filter(asset => asset.type === 'svg').map(asset => asset.data);
    assert.ok(svgs.some(svg => svg.includes('CONTRAIL PANIC')));
    assert.ok(svgs.some(svg => svg.includes('DESTROY 24 HOMING MISSILES')));
    assert.ok(svgs.some(svg => svg.includes('CROSS THEIR PATHS')));
    assert.match(games.missile_ballet, /change missiles by 1/);
    assert.match(games.missile_ballet, /IF missiles > 23 THEN:/);
    assert.match(games.missile_ballet, /AIRSPACE CLEARED/);
});

test('Contrail Panic ends when the final missile is destroyed in the real VM', async () => {
    const creator = new SB3Creator();
    creator.parse(games.missile_ballet);
    const vm = new VM();
    try {
        await vm.loadProject(Buffer.from(await (await creator.generateSB3()).arrayBuffer()));
        vm.start();
        vm.greenFlag();
        for (let i = 0; i < 25; i++) vm.runtime._step();
        const values = Object.values(vm.runtime.getTargetForStage().variables);
        const value = name => values.find(variable => variable.name === name);
        value('missiles').value = 23;
        value('score').value = 80;
        value('alive').value = 1;

        vm.runtime.startHats('event_whenbroadcastreceived', {
            BROADCAST_OPTION: 'missile destroyed'
        });
        for (let i = 0; i < 30; i++) vm.runtime._step();

        assert.equal(Number(value('missiles').value), 24);
        assert.equal(Number(value('score').value), 85);
        assert.equal(Number(value('alive').value), 0, 'the extraction target did not end the run');
    } finally {
        vm.quit();
        clearStrayTimers();
    }
});

test('Aegis Arc makes its circular defense state visible and start-gated', () => {
    const creator = new SB3Creator();
    const project = creator.parse(games.orbit_ward);
    assert.deepEqual(creator.errors, []);
    assert.deepEqual(creator.warnings, []);
    assert.match(games.orbit_ward, /GOAL: rebound the spark through all eight inner locks/);
    assert.match(games.orbit_ward, /CONTROLS: Left and Right rotate the cyan shield/);
    assert.match(games.orbit_ward, /broadcast "arm aegis"/);
    const stage = project.targets.find(target => target.isStage);
    assert.deepEqual(stage.costumes.map(costume => costume.name), ['backdrop1', 'briefing', 'reactor']);
    const svgs = [...creator.assets.values()].filter(asset => asset.type === 'svg').map(asset => asset.data);
    assert.ok(svgs.some(svg => svg.includes('AEGIS ARC')));
    assert.ok(svgs.some(svg => svg.includes('BREAK ALL 8 INNER LOCKS')));
    assert.ok(svgs.some(svg => svg.includes('3 ESCAPES = DEFEAT')));
});

test('Prism Lock uses clickable authored gems instead of modal number prompts', () => {
    const creator = new SB3Creator();
    const project = creator.parse(games.chroma_code);
    assert.deepEqual(creator.errors, []);
    assert.deepEqual(creator.warnings, []);
    assert.doesNotMatch(games.chroma_code, /ask .* and wait/);
    assert.match(games.chroma_code, /CONTROLS: click four gems/);
    assert.match(games.chroma_code, /WHEN sprite clicked:/);
    const stage = project.targets.find(target => target.isStage);
    const buttons = project.targets.find(target => target.name === 'GemButton');
    assert.deepEqual(stage.costumes.map(costume => costume.name), ['backdrop1', 'sealed', 'board']);
    assert.ok(Object.values(buttons.blocks).some(block => block.opcode === 'event_whenthisspriteclicked'));
    assert.deepEqual(Object.values(stage.lists).map(list => list[0]).sort(),
        ['guess', 'secret', 'usedGuess', 'usedSecret']);
    const svgs = [...creator.assets.values()].filter(asset => asset.type === 'svg').map(asset => asset.data);
    assert.ok(svgs.some(svg => svg.includes('PRISM LOCK')));
    assert.ok(svgs.some(svg => svg.includes('EXACT = RIGHT GEM + SLOT')));
    assert.ok(svgs.some(svg => svg.includes('CLICK 4 GEMS')));
});

test('Core Cascade shows its next piece, fusion ladder, and concrete Nova goal', () => {
    const creator = new SB3Creator();
    const project = creator.parse(games.fusion_foundry);
    assert.deepEqual(creator.errors, []);
    assert.deepEqual(creator.warnings, []);
    assert.match(games.fusion_foundry, /GOAL: fuse identical cores vertically until you create the white Nova core/);
    assert.match(games.fusion_foundry, /CONTROLS: Left and Right choose a shaft/);
    assert.match(games.fusion_foundry, /set nextLevel to pick random 1 to 2/);
    assert.match(games.fusion_foundry, /IF level = 5 THEN:/);
    const stage = project.targets.find(target => target.isStage);
    const foundry = project.targets.find(target => target.name === 'Foundry');
    assert.deepEqual(stage.costumes.map(costume => costume.name), ['backdrop1', 'intro', 'reactor']);
    assert.ok(foundry.costumes.some(costume => costume.name === 'core5'));
    const svgs = [...creator.assets.values()].filter(asset => asset.type === 'svg').map(asset => asset.data);
    assert.ok(svgs.some(svg => svg.includes('CORE CASCADE')));
    assert.ok(svgs.some(svg => svg.includes('NEXT CORE')));
    assert.ok(svgs.some(svg => svg.includes('CREATE THE WHITE NOVA')));
});

test('Prism Lock and Core Cascade reach their victory states in the real Scratch VM', async () => {
    const load = async source => {
        const creator = new SB3Creator();
        creator.parse(source);
        const vm = new VM();
        await vm.loadProject(Buffer.from(await (await creator.generateSB3()).arrayBuffer()));
        vm.start();
        vm.greenFlag();
        for (let i = 0; i < 20; i++) vm.runtime._step();
        vm.postIOData('keyboard', {key: ' ', isDown: true});
        for (let i = 0; i < 30; i++) vm.runtime._step();
        vm.postIOData('keyboard', {key: ' ', isDown: false});
        return vm;
    };
    const stageValue = (vm, name) => Object.values(vm.runtime.getTargetForStage().variables)
        .find(variable => variable.name === name);

    const prism = await load(games.chroma_code);
    try {
        stageValue(prism, 'secret').value = [1, 2, 3, 4];
        stageValue(prism, 'guess').value = [1, 2, 3, 4];
        stageValue(prism, 'accepting').value = 1;
        prism.runtime.startHats('event_whenbroadcastreceived', {BROADCAST_OPTION: 'gem chosen'});
        for (let i = 0; i < 45; i++) prism.runtime._step();

        assert.equal(Number(stageValue(prism, 'exact').value), 4, 'perfect code was not scored');
        assert.equal(Number(stageValue(prism, 'near').value), 0, 'exact gems were also counted as near');
        assert.equal(Number(stageValue(prism, 'won').value), 1, 'perfect code did not unseal the lock');
    } finally {
        prism.quit();
        clearStrayTimers();
    }

    const cascade = await load(games.fusion_foundry);
    try {
        const foundry = cascade.runtime.targets.find(target => target.sprite.name === 'Foundry');
        const grid = Object.values(foundry.variables).find(variable => variable.name === 'grid');
        grid.value = Array(42).fill(0);
        // A level-four core at the bottom of the selected shaft makes the
        // next level-four drop fuse into the promised white level-five Nova.
        grid.value[39] = 4;
        stageValue(cascade, 'column').value = 3;
        stageValue(cascade, 'nextLevel').value = 4;
        stageValue(cascade, 'score').value = 0;
        cascade.runtime.startHats('event_whenbroadcastreceived', {BROADCAST_OPTION: 'drop core'});
        for (let i = 0; i < 70; i++) cascade.runtime._step();

        assert.equal(Number(grid.value[39]), 5, 'matching level-four cores did not forge a Nova');
        assert.equal(grid.value.filter(value => Number(value) > 0).length, 1,
            'the consumed precursor core remained on the board');
        assert.equal(Number(stageValue(cascade, 'score').value), 550,
            'Nova fusion did not award its merge and victory score');
    } finally {
        cascade.quit();
        clearStrayTimers();
    }
});

test('Neon Relay teaches distinct jump and slide hazards and gates the run', () => {
    const creator = new SB3Creator();
    const project = creator.parse(games.rooftop_relay);
    assert.deepEqual(creator.errors, []);
    assert.deepEqual(creator.warnings, []);
    assert.match(games.rooftop_relay, /GOAL: clear thirty rooftop hazards/);
    assert.match(games.rooftop_relay, /CONTROLS: Up jumps, Down slides/);
    assert.match(games.rooftop_relay, /broadcast "start neon relay"/);
    assert.match(games.rooftop_relay, /go to x: 250 y: -96/);
    assert.match(games.rooftop_relay, /change rooftops by 1/);
    assert.match(games.rooftop_relay, /IF rooftops = 30 THEN:/);
    assert.match(games.rooftop_relay, /IF touching Runner THEN:\n      broadcast "battery collected"\n    delete this clone/);
    assert.match(games.rooftop_relay, /WHEN I receive "battery collected":\n    set overdrive to 120/);
    assert.doesNotMatch(games.rooftop_relay, /IF touching Battery THEN:/,
        'battery pickup still depends on the runner winning a scheduler race');
    const stage = project.targets.find(target => target.isStage);
    const runner = project.targets.find(target => target.name === 'Runner');
    assert.deepEqual(stage.costumes.map(costume => costume.name), ['backdrop1', 'intro', 'skyline']);
    assert.ok(runner.costumes.some(costume => costume.name === 'slide'));
    const svgs = [...creator.assets.values()].filter(asset => asset.type === 'svg').map(asset => asset.data);
    assert.ok(svgs.some(svg => svg.includes('NEON RELAY')));
    assert.ok(svgs.some(svg => svg.includes('JUMP OVER RED VENTS')));
    assert.ok(svgs.some(svg => svg.includes('SLIDE UNDER ORANGE DRONES')));
    assert.ok(svgs.some(svg => svg.includes('CLEAR 30 HAZARDS')));
});

test('Neon Relay delivers on rooftop thirty in the real Scratch VM', async () => {
    const creator = new SB3Creator();
    creator.parse(games.rooftop_relay);
    const vm = new VM();
    try {
        await vm.loadProject(Buffer.from(await (await creator.generateSB3()).arrayBuffer()));
        vm.start();
        vm.greenFlag();
        for (let i = 0; i < 25; i++) vm.runtime._step();
        const values = Object.values(vm.runtime.getTargetForStage().variables);
        const value = name => values.find(variable => variable.name === name);
        value('rooftops').value = 29;
        value('score').value = 41;

        vm.runtime.startHats('event_whenbroadcastreceived', {BROADCAST_OPTION: 'rooftop cleared'});
        for (let i = 0; i < 30; i++) vm.runtime._step();

        assert.equal(Number(value('rooftops').value), 30);
        assert.equal(Number(value('score').value), 42);
        assert.equal(Number(value('delivered').value), 1, 'the finish line did not complete the delivery');
    } finally {
        vm.quit();
        clearStrayTimers();
    }
});

test('Rift Rally exposes its dual controls, crystals, and three-escape loss condition', () => {
    const creator = new SB3Creator();
    const project = creator.parse(games.twinwall);
    assert.deepEqual(creator.errors, []);
    assert.deepEqual(creator.warnings, []);
    assert.match(games.twinwall, /GOAL: break all 24 drifting crystals before the comet escapes three times/);
    assert.match(games.twinwall, /CONTROLS: W\/S move the cyan left paddle/);
    assert.match(games.twinwall, /change lives by -1/);
    assert.match(games.twinwall, /set vx to vx \* -1/);
    assert.match(games.twinwall, /WHEN flag clicked:\n    set score to 0\n    set lives to 3\n    set bricks to 24/);
    assert.doesNotMatch(games.twinwall, /WHEN I receive "serve rift":\n    set bricks to 24/,
        'parallel start receiver still owns the win-counter reset');
    const stage = project.targets.find(target => target.isStage);
    const shifter = project.targets.find(target => target.name === 'Shifter');
    assert.ok(Object.values(shifter.variables).some(variable => variable[0] === 'drift'),
        'crystal drift is not clone-local');
    assert.ok(!Object.values(stage.variables).some(variable => variable[0] === 'drift'),
        'all crystal clones still share one global drift direction');
    assert.deepEqual(stage.costumes.map(costume => costume.name), ['backdrop1', 'intro', 'arena']);
    const svgs = [...creator.assets.values()].filter(asset => asset.type === 'svg').map(asset => asset.data);
    assert.ok(svgs.some(svg => svg.includes('RIFT RALLY')));
    assert.ok(svgs.some(svg => svg.includes('CLEAR ALL 24 DRIFTING CRYSTALS')));
    assert.ok(svgs.some(svg => svg.includes('3 ESCAPES = DEFEAT')));
});

test('Slipstream Circuit separates drafting, collisions, and skill-based checkpoint gates', () => {
    const creator = new SB3Creator();
    const project = creator.parse(games.turbo_chicane);
    assert.deepEqual(creator.errors, []);
    assert.deepEqual(creator.warnings, []);
    assert.match(games.turbo_chicane, /GOAL: drive through three green checkpoint gates/);
    assert.match(games.turbo_chicane, /CONTROLS: Left\/Right steer/);
    assert.match(games.turbo_chicane, /SPRITE Draft:/);
    assert.match(games.turbo_chicane, /IF touching Gate and gateActive = 1 THEN:/);
    assert.match(games.turbo_chicane, /IF checkpoints = 3 THEN:/);
    const stage = project.targets.find(target => target.isStage);
    assert.deepEqual(stage.costumes.map(costume => costume.name), ['backdrop1', 'intro', 'circuit']);
    const svgs = [...creator.assets.values()].filter(asset => asset.type === 'svg').map(asset => asset.data);
    assert.ok(svgs.some(svg => svg.includes('SLIPSTREAM CIRCUIT')));
    assert.ok(svgs.some(svg => svg.includes('HIT 3 GREEN CHECKPOINT GATES')));
    assert.ok(svgs.some(svg => svg.includes('CYAN WAKE = BOOST')));
});

test('Abyss Lift has a finite rescue objective and reliable clone-to-sub rescue signal', () => {
    const creator = new SB3Creator();
    const project = creator.parse(games.abyss_rescue);
    assert.deepEqual(creator.errors, []);
    assert.deepEqual(creator.warnings, []);
    assert.match(games.abyss_rescue, /GOAL: rescue six gold divers/);
    assert.match(games.abyss_rescue, /CONTROLS: hold Space to rise/);
    assert.match(games.abyss_rescue, /broadcast "diver rescued"/);
    assert.match(games.abyss_rescue, /IF rescued = 6 THEN:/);
    assert.match(games.abyss_rescue, /set ghost effect to pick random 0 to 12/);
    assert.doesNotMatch(games.abyss_rescue, /change ghost effect by 3/,
        'divers still fade completely before reaching the submarine');
    const stage = project.targets.find(target => target.isStage);
    assert.deepEqual(stage.costumes.map(costume => costume.name), ['backdrop1', 'intro', 'trench']);
    const svgs = [...creator.assets.values()].filter(asset => asset.type === 'svg').map(asset => asset.data);
    assert.ok(svgs.some(svg => svg.includes('ABYSS LIFT')));
    assert.ok(svgs.some(svg => svg.includes('RESCUE 6 GOLD DIVERS')));
    assert.ok(svgs.some(svg => svg.includes('SPACE = RISE')));
});

test('Wardlight makes the defense target clear and keeps ricochet orbs alive for real bank shots', () => {
    const creator = new SB3Creator();
    const project = creator.parse(games.specter_sweep);
    assert.deepEqual(creator.errors, []);
    assert.deepEqual(creator.warnings, []);
    assert.match(games.specter_sweep, /GOAL: banish twelve specters/);
    assert.match(games.specter_sweep, /CONTROLS: aim with the mouse and click to cast/);
    assert.match(games.specter_sweep, /REPEAT UNTIL life < 1:/);
    assert.match(games.specter_sweep, /if on edge bounce/);
    assert.doesNotMatch(games.specter_sweep, /behind the pillars/);
    assert.match(games.specter_sweep, /set ghost effect to pick random 0 to 25/);
    assert.doesNotMatch(games.specter_sweep, /change ghost effect by 4/,
        'specters still become invisible while approaching the ward');
    const stage = project.targets.find(target => target.isStage);
    assert.deepEqual(stage.costumes.map(costume => costume.name), ['backdrop1', 'intro', 'manor']);
    const svgs = [...creator.assets.values()].filter(asset => asset.type === 'svg').map(asset => asset.data);
    assert.ok(svgs.some(svg => svg.includes('WARDLIGHT')));
    assert.ok(svgs.some(svg => svg.includes('BANISH 12 SPECTERS')));
    assert.ok(svgs.some(svg => svg.includes('EDGE BOUNCES KEEP THE ORB ALIVE')));
});

test('Pantry Prowl communicates a finite stealth loop and uses motion-driven alert', () => {
    const creator = new SB3Creator();
    const project = creator.parse(games.moonlight_heist);
    assert.deepEqual(creator.errors, []);
    assert.deepEqual(creator.warnings, []);
    assert.match(games.moonlight_heist, /GOAL: steal five cheeses and return to the blue hideout/);
    assert.match(games.moonlight_heist, /CONTROLS: Arrow keys move/);
    assert.match(games.moonlight_heist, /set moving to 1/);
    assert.match(games.moonlight_heist, /IF score > 4 and touching Tunnel THEN:/);
    assert.match(games.moonlight_heist, /distance to Tunnel > 80 and distance to Cat > 70/);
    assert.match(games.moonlight_heist, /IF alert > 0\.75 THEN:/);
    assert.match(games.moonlight_heist, /broadcast "pantry over"/);
    assert.match(games.moonlight_heist, /FIVE CHEESES SAFE • GREEN FLAG FOR ANOTHER HEIST/);
    const stage = project.targets.find(target => target.isStage);
    assert.deepEqual(stage.costumes.map(costume => costume.name), ['backdrop1', 'intro', 'pantry']);
    const svgs = [...creator.assets.values()].filter(asset => asset.type === 'svg').map(asset => asset.data);
    assert.ok(svgs.some(svg => svg.includes('PANTRY PROWL')));
    assert.ok(svgs.some(svg => svg.includes('STEAL 5 CHEESES')));
    assert.ok(svgs.some(svg => svg.includes('MOVING IN MOONLIGHT RAISES ALERT')));
});

test('Nimbus Volley explains its scoring and implements an airborne spike', () => {
    const creator = new SB3Creator();
    const project = creator.parse(games.cloud_court);
    assert.deepEqual(creator.errors, []);
    assert.deepEqual(creator.warnings, []);
    assert.match(games.cloud_court, /GOAL: land the ball on the rival cloud; the first side to seven points wins/);
    assert.match(games.cloud_court, /CONTROLS: A\/D move, W jumps, and S while airborne/);
    assert.match(games.cloud_court, /set spiking to 1/);
    assert.match(games.cloud_court, /change playerScore by 1/);
    assert.match(games.cloud_court, /set vx to 3\.8 \+ \(abs of \(bx - px\) \/ 16\)/);
    assert.match(games.cloud_court, /set bx to 226/);
    assert.match(games.cloud_court, /broadcast "nimbus match over"/);
    assert.match(games.cloud_court, /STORM COURT WON • GREEN FLAG FOR A REMATCH/);
    const stage = project.targets.find(target => target.isStage);
    assert.deepEqual(stage.costumes.map(costume => costume.name), ['backdrop1', 'intro', 'court']);
    const svgs = [...creator.assets.values()].filter(asset => asset.type === 'svg').map(asset => asset.data);
    assert.ok(svgs.some(svg => svg.includes('NIMBUS VOLLEY')));
    assert.ok(svgs.some(svg => svg.includes('FIRST TO 7 WINS')));
    assert.ok(svgs.some(svg => svg.includes('S AIR SPIKE')));
});

test('Ember Parry makes its short timing window and finite duel explicit', () => {
    const creator = new SB3Creator();
    const project = creator.parse(games.ember_dojo);
    assert.deepEqual(creator.errors, []);
    assert.deepEqual(creator.warnings, []);
    assert.match(games.ember_dojo, /GOAL: reflect eight fireballs into the dragon/);
    assert.match(games.ember_dojo, /CONTROLS: Left\/Right line up with each shot/);
    assert.match(games.ember_dojo, /wait 0\.18 seconds/);
    assert.match(games.ember_dojo, /IF touching Ronin THEN:\n      IF parrying = 1 THEN:/);
    const stage = project.targets.find(target => target.isStage);
    assert.deepEqual(stage.costumes.map(costume => costume.name), ['backdrop1', 'intro', 'dojo']);
    const svgs = [...creator.assets.values()].filter(asset => asset.type === 'svg').map(asset => asset.data);
    assert.ok(svgs.some(svg => svg.includes('EMBER PARRY')));
    assert.ok(svgs.some(svg => svg.includes('REFLECT 8 FIREBALLS')));
    assert.ok(svgs.some(svg => svg.includes('SPACE = BRIEF MOON-BLADE PARRY')));
});

test('Tidegate Rush has a finish line, boost resource, hazards, and three-gate surge reward', () => {
    const creator = new SB3Creator();
    const project = creator.parse(games.lockstep_lagoon);
    assert.deepEqual(creator.errors, []);
    assert.deepEqual(creator.warnings, []);
    assert.match(games.lockstep_lagoon, /GOAL: clear eight blue gates before the 35-second tide closes/);
    assert.match(games.lockstep_lagoon, /CONTROLS: Left\/Right change lanes/);
    assert.match(games.lockstep_lagoon, /IF gates = 8 THEN:/);
    assert.match(games.lockstep_lagoon, /set surge to 3/);
    assert.match(games.lockstep_lagoon, /change charge by -1/);
    assert.equal((games.lockstep_lagoon.match(/\(pick random -1 to 1\) \* 110/g) || []).length, 2,
        'a gate spawner is not constrained to the three taught lanes');
    assert.doesNotMatch(games.lockstep_lagoon, /pick random -1 to 1 \* 110/,
        'lane multiplication is still inside the random upper bound');
    const stage = project.targets.find(target => target.isStage);
    assert.deepEqual(stage.costumes.map(costume => costume.name), ['backdrop1', 'intro', 'course']);
    const svgs = [...creator.assets.values()].filter(asset => asset.type === 'svg').map(asset => asset.data);
    assert.ok(svgs.some(svg => svg.includes('TIDEGATE RUSH')));
    assert.ok(svgs.some(svg => svg.includes('CLEAR 8 BLUE GATES')));
    assert.ok(svgs.some(svg => svg.includes('VIOLET LOCK')));
});

test('Blue-Line Breaker teaches momentum bank shots and ends after five goals', () => {
    const creator = new SB3Creator();
    const project = creator.parse(games.rink_riot);
    assert.deepEqual(creator.errors, []);
    assert.deepEqual(creator.warnings, []);
    assert.match(games.rink_riot, /GOAL: score five goals before the 40-second horn/);
    assert.match(games.rink_riot, /CONTROLS: Arrows skate with inertia/);
    assert.match(games.rink_riot, /point in direction 90 - vy \* 5/);
    assert.match(games.rink_riot, /IF goals = 5 THEN:/);
    const stage = project.targets.find(target => target.isStage);
    assert.deepEqual(stage.costumes.map(costume => costume.name), ['backdrop1', 'intro', 'rink']);
    const svgs = [...creator.assets.values()].filter(asset => asset.type === 'svg').map(asset => asset.data);
    assert.ok(svgs.some(svg => svg.includes('BLUE-LINE BREAKER')));
    assert.ok(svgs.some(svg => svg.includes('SCORE 5 BEFORE')));
    assert.ok(svgs.some(svg => svg.includes('BEND A BANK SHOT')));
});

test('Orbit Hoops separates rim collisions from clean-net scoring and has a timed target', () => {
    const creator = new SB3Creator();
    const project = creator.parse(games.rim_reactor);
    assert.deepEqual(creator.errors, []);
    assert.deepEqual(creator.warnings, []);
    assert.match(games.rim_reactor, /GOAL: reach fifteen points before the 45-second reactor cycle ends/);
    assert.match(games.rim_reactor, /IF touching Net and ballVY < 0 THEN:/);
    assert.match(games.rim_reactor, /IF touching Rim THEN:/);
    assert.match(games.rim_reactor, /IF score > 14 THEN:/);
    const stage = project.targets.find(target => target.isStage);
    assert.deepEqual(stage.costumes.map(costume => costume.name), ['backdrop1', 'intro', 'court']);
    const svgs = [...creator.assets.values()].filter(asset => asset.type === 'svg').map(asset => asset.data);
    assert.ok(svgs.some(svg => svg.includes('ORBIT HOOPS')));
    assert.ok(svgs.some(svg => svg.includes('SCORE 15 BEFORE')));
    assert.ok(svgs.some(svg => svg.includes('CLEAN NETS BUILD MULTIPLIER')));
});

test('Comet Strikers has curve-shot agency, single-count goals, and a finite match', () => {
    const creator = new SB3Creator();
    const project = creator.parse(games.comet_cup);
    assert.deepEqual(creator.errors, []);
    assert.deepEqual(creator.warnings, []);
    assert.match(games.comet_cup, /GOAL: score four goals before the 45-second match clock ends/);
    assert.match(games.comet_cup, /turn right runY \* -3 degrees/);
    assert.match(games.comet_cup, /change goals by 1/);
    assert.match(games.comet_cup, /IF goals = 4 THEN:/);
    const stage = project.targets.find(target => target.isStage);
    assert.deepEqual(stage.costumes.map(costume => costume.name), ['backdrop1', 'intro', 'pitch']);
    const svgs = [...creator.assets.values()].filter(asset => asset.type === 'svg').map(asset => asset.data);
    assert.ok(svgs.some(svg => svg.includes('COMET STRIKERS')));
    assert.ok(svgs.some(svg => svg.includes('SCORE 4 GOALS')));
    assert.ok(svgs.some(svg => svg.includes('CURVE THE SHOT')));
});

test('Echo Trench exposes its salvage target, rising threat, and cooldown-limited sonar defense', () => {
    const creator = new SB3Creator();
    const project = creator.parse(games.trench_signal);
    assert.deepEqual(creator.errors, []);
    assert.deepEqual(creator.warnings, []);
    assert.match(games.trench_signal, /GOAL: recover three cyan signal pearls/);
    assert.match(games.trench_signal, /set pulseReady to 0/);
    assert.match(games.trench_signal, /wait 0\.85 seconds/);
    assert.match(games.trench_signal, /change mineSpeed by 0\.7/);
    assert.match(games.trench_signal, /distance to Sub < 150/);
    assert.match(games.trench_signal, /set mineStun to 0\.7/);
    assert.match(games.trench_signal, /broadcast "echo trench over"/);
    assert.match(games.trench_signal, /3 SIGNAL PEARLS RECOVERED/);
    const stage = project.targets.find(target => target.isStage);
    assert.deepEqual(stage.costumes.map(costume => costume.name), ['backdrop1', 'intro', 'trench']);
    const svgs = [...creator.assets.values()].filter(asset => asset.type === 'svg').map(asset => asset.data);
    assert.ok(svgs.some(svg => svg.includes('ECHO TRENCH')));
    assert.ok(svgs.some(svg => svg.includes('RECOVER 3 SIGNAL PEARLS')));
    assert.ok(svgs.some(svg => svg.includes('1.2 SECOND RECHARGE')));
});

test('Echo Trench sonar repels the hunter and three pearl recoveries complete the dive', async () => {
    const creator = new SB3Creator();
    const project = creator.parse(games.trench_signal);
    assert.deepEqual(creator.errors, []);
    assert.deepEqual(creator.warnings, []);
    const vm = new VM();
    try {
        await vm.loadProject(Buffer.from(await (await creator.generateSB3()).arrayBuffer()));
        vm.start();
        vm.greenFlag();
        await new Promise(resolve => setTimeout(resolve, 750));
        for (let i = 0; i < 40; i++) vm.runtime._step();

        const values = Object.values(vm.runtime.getTargetForStage().variables);
        const value = name => values.find(variable => variable.name === name);
        const target = name => vm.runtime.targets.find(candidate =>
            candidate.isOriginal && candidate.sprite && candidate.sprite.name === name);
        const sub = target('Sub');
        const mine = target('HunterMine');

        assert.equal(Number(value('active').value), 1, 'green flag did not begin the dive');
        mine.setXY(sub.x + 100, sub.y);
        const beforePulseX = mine.x;
        vm.postIOData('keyboard', {key: ' ', isDown: true});
        for (let i = 0; i < 12; i++) vm.runtime._step();
        vm.postIOData('keyboard', {key: ' ', isDown: false});
        assert.ok(Number(value('mineStun').value) > 0, 'in-range sonar did not stun the hunter');
        assert.ok(Math.abs(mine.x - sub.x) > Math.abs(beforePulseX - sub.x),
            'sonar did not push the hunter away from the submarine');

        mine.setXY(210, -140);
        for (let recovered = 1; recovered <= 3; recovered++) {
            vm.runtime.startHats('event_whenbroadcastreceived', {
                BROADCAST_OPTION: 'signal pearl recovered'
            });
            await new Promise(resolve => setTimeout(resolve, 80));
            for (let i = 0; i < 25; i++) vm.runtime._step();
            assert.equal(Number(value('pearls').value), recovered,
                `pearl recovery ${recovered} was not counted`);
        }
        assert.equal(Number(value('winner').value), 1, 'three pearls did not win the dive');
        assert.equal(Number(value('active').value), 0, 'completed dive remained active');
        assert.equal(Number(value('started').value), 0, 'completed dive was not replayable');
        assert.equal(target('TrenchResult').visible, true, 'victory feedback was not shown');
    } finally {
        vm.quit();
        clearStrayTimers();
    }
});

test('Whisker Relay is an alternating courier game with a directional cargo tradeoff', () => {
    const creator = new SB3Creator();
    const project = creator.parse(games.whisker_switch);
    assert.deepEqual(creator.errors, []);
    assert.deepEqual(creator.warnings, []);
    assert.match(games.whisker_switch, /GOAL: bank six moon-cheeses/);
    assert.match(games.whisker_switch, /change banked by cargo/);
    assert.match(games.whisker_switch, /set targetHole to -1/);
    assert.match(games.whisker_switch, /change mouseX by dashX \* 55/);
    const stage = project.targets.find(target => target.isStage);
    assert.deepEqual(stage.costumes.map(costume => costume.name), ['backdrop1', 'intro', 'pantry']);
    const svgs = [...creator.assets.values()].filter(asset => asset.type === 'svg').map(asset => asset.data);
    assert.ok(svgs.some(svg => svg.includes('WHISKER RELAY')));
    assert.ok(svgs.some(svg => svg.includes('BANK 6 MOON-CHEESES')));
    assert.ok(svgs.some(svg => svg.includes('GOLD HOLE = DELIVERY TARGET')));
});

test('Helix Rush has a thirty-sector finish and readable charge-phase-jackpot loop', () => {
    const creator = new SB3Creator();
    const project = creator.parse(games.spiral_circuit);
    assert.deepEqual(creator.errors, []);
    assert.deepEqual(creator.warnings, []);
    assert.match(games.spiral_circuit, /GOAL: survive thirty sectors/);
    assert.match(games.spiral_circuit, /change sectors by 1/);
    assert.match(games.spiral_circuit, /IF sectors = 30 THEN:/);
    assert.match(games.spiral_circuit, /IF started = 1 and charge > 4 and boosting = 0 THEN:/);
    const stage = project.targets.find(target => target.isStage);
    assert.deepEqual(stage.costumes.map(costume => costume.name), ['backdrop1', 'intro', 'tube']);
    const svgs = [...creator.assets.values()].filter(asset => asset.type === 'svg').map(asset => asset.data);
    assert.ok(svgs.some(svg => svg.includes('HELIX RUSH')));
    assert.ok(svgs.some(svg => svg.includes('SURVIVE 30 SECTORS')));
    assert.ok(svgs.some(svg => svg.includes('MAGENTA GATE')));
});

test('Moonbank Hop presents distinct road and river rules with a three-crossing finish', () => {
    const creator = new SB3Creator();
    const project = creator.parse(games.lilyway_rescue);
    assert.deepEqual(creator.errors, []);
    assert.deepEqual(creator.warnings, []);
    assert.match(games.lilyway_rescue, /GOAL: reach the moon bank three times/);
    assert.match(games.lilyway_rescue, /touching CarA or touching CarB/);
    assert.match(games.lilyway_rescue, /touching LilyA or touching LilyB/);
    assert.match(games.lilyway_rescue, /IF crossings = 3 THEN:/);
    const stage = project.targets.find(target => target.isStage);
    assert.deepEqual(stage.costumes.map(costume => costume.name), ['backdrop1', 'intro', 'route']);
    const svgs = [...creator.assets.values()].filter(asset => asset.type === 'svg').map(asset => asset.data);
    assert.ok(svgs.some(svg => svg.includes('MOONBANK HOP')));
    assert.ok(svgs.some(svg => svg.includes('REACH THE MOON BANK 3 TIMES')));
    assert.ok(svgs.some(svg => svg.includes('LAND ONLY ON A MOVING LILY')));
});

test('Crosswind Courier separates distance from stunt score and rewards level landings', () => {
    const creator = new SB3Creator();
    const project = creator.parse(games.rotor_rogue);
    assert.deepEqual(creator.errors, []);
    assert.deepEqual(creator.warnings, []);
    assert.match(games.rotor_rogue, /GOAL: reach distance forty before three crashes/);
    assert.match(games.rotor_rogue, /set wind to sin of distance \* speed \/ 8/);
    assert.match(games.rotor_rogue, /IF abs of tilt < 14 THEN:/);
    assert.match(games.rotor_rogue, /IF distance > 39 THEN:/);
    const stage = project.targets.find(target => target.isStage);
    assert.deepEqual(stage.costumes.map(costume => costume.name), ['backdrop1', 'intro', 'skyroad']);
    const svgs = [...creator.assets.values()].filter(asset => asset.type === 'svg').map(asset => asset.data);
    assert.ok(svgs.some(svg => svg.includes('CROSSWIND COURIER')));
    assert.ok(svgs.some(svg => svg.includes('DELIVER 40 KM')));
    assert.ok(svgs.some(svg => svg.includes('LAND LEVEL FOR FUEL')));
});

test('Lumen Stack has a twelve-floor target and overlap-based permanent narrowing', () => {
    const creator = new SB3Creator();
    const project = creator.parse(games.prism_spire);
    assert.deepEqual(creator.errors, []);
    assert.deepEqual(creator.warnings, []);
    assert.match(games.prism_spire, /GOAL: build twelve floors before three complete misses/);
    assert.match(games.prism_spire, /change blockWidth by 0 - \(abs of \(blockX - towerX\)\)/);
    assert.match(games.prism_spire, /IF level = 12 THEN:/);
    assert.match(games.prism_spire, /IF started = 1 and dropReady = 1 THEN:/);
    const stage = project.targets.find(target => target.isStage);
    assert.deepEqual(stage.costumes.map(costume => costume.name), ['backdrop1', 'intro', 'skyline']);
    const svgs = [...creator.assets.values()].filter(asset => asset.type === 'svg').map(asset => asset.data);
    assert.ok(svgs.some(svg => svg.includes('LUMEN STACK')));
    assert.ok(svgs.some(svg => svg.includes('BUILD 12 FLOORS')));
    assert.ok(svgs.some(svg => svg.includes('ONLY THE OVERLAP SURVIVES')));
});

test('Plasma Posse requires both split pieces before advancing each of four waves', () => {
    const creator = new SB3Creator();
    const project = creator.parse(games.shard_sheriff);
    assert.deepEqual(creator.errors, []);
    assert.deepEqual(creator.warnings, []);
    assert.match(games.shard_sheriff, /GOAL: clear four plasma waves before three collisions/);
    assert.match(games.shard_sheriff, /set orbActive to 0/);
    assert.match(games.shard_sheriff, /IF shardOn = 0 and waves < 4 THEN:/);
    assert.match(games.shard_sheriff, /IF waves = 4 THEN:/);
    const stage = project.targets.find(target => target.isStage);
    assert.deepEqual(stage.costumes.map(costume => costume.name), ['backdrop1', 'intro', 'arena']);
    const svgs = [...creator.assets.values()].filter(asset => asset.type === 'svg').map(asset => asset.data);
    assert.ok(svgs.some(svg => svg.includes('PLASMA POSSE')));
    assert.ok(svgs.some(svg => svg.includes('CLEAR 4 SPLIT-ORB WAVES')));
    assert.ok(svgs.some(svg => svg.includes('POP BOTH PIECES')));
});

test('Halo Lockdown turns circular defense into a legible three-round lock hunt', () => {
    const creator = new SB3Creator();
    const project = creator.parse(games.halo_foundry);
    assert.deepEqual(creator.errors, []);
    assert.deepEqual(creator.warnings, []);
    assert.match(games.halo_foundry, /GOAL: clear all four inner locks across three increasingly fast rings/);
    assert.match(games.halo_foundry, /set locks to 4/);
    assert.match(games.halo_foundry, /IF round = 3 THEN:/);
    assert.match(games.halo_foundry, /set shieldX to sin of shieldAngle \* 205/);
    assert.match(games.halo_foundry, /set shieldY to cos of shieldAngle \* 150/);
    assert.match(games.halo_foundry, /IF touching edge THEN:\n        change lives by -1/);
    const stage = project.targets.find(target => target.isStage);
    assert.deepEqual(stage.costumes.map(costume => costume.name), ['backdrop1', 'intro', 'reactor']);
    const svgs = [...creator.assets.values()].filter(asset => asset.type === 'svg').map(asset => asset.data);
    assert.ok(svgs.some(svg => svg.includes('HALO LOCKDOWN')));
    assert.ok(svgs.some(svg => svg.includes('BREAK 4 INNER LOCKS')));
    assert.ok(svgs.some(svg => svg.includes('ROTATE THE CYAN SHIELD')));
});

test('Carrier Kestrel has inertial flight, finite shields, and a fifteen-gate finish', () => {
    const creator = new SB3Creator();
    const project = creator.parse(games.corridor_kestrel);
    assert.deepEqual(creator.errors, []);
    assert.deepEqual(creator.warnings, []);
    assert.match(games.corridor_kestrel, /GOAL: clear fifteen carrier gates before three hull breaches/);
    assert.match(games.corridor_kestrel, /set driftX to driftX \* 0\.92/);
    assert.match(games.corridor_kestrel, /set driftY to driftY \* 0\.92/);
    assert.match(games.corridor_kestrel, /change gates by 1/);
    assert.match(games.corridor_kestrel, /IF gates = 15 THEN:/);
    assert.match(games.corridor_kestrel, /shieldReady = 1 and battery > 3 and shield = 0/);
    const stage = project.targets.find(target => target.isStage);
    assert.deepEqual(stage.costumes.map(costume => costume.name), ['backdrop1', 'intro', 'corridor']);
    const svgs = [...creator.assets.values()].filter(asset => asset.type === 'svg').map(asset => asset.data);
    assert.ok(svgs.some(svg => svg.includes('CARRIER KESTREL')));
    assert.ok(svgs.some(svg => svg.includes('CLEAR 15 MOVING APERTURES')));
    assert.ok(svgs.some(svg => svg.includes('ARROWS ADD DRIFT')));
});

test('Skycourt Surge teaches its seven-point aerial duel and accelerates long rallies', () => {
    const creator = new SB3Creator();
    const project = creator.parse(games.thunder_volley);
    assert.deepEqual(creator.errors, []);
    assert.deepEqual(creator.warnings, []);
    assert.match(games.thunder_volley, /GOAL: score seven points before Nimbus does/);
    assert.match(games.thunder_volley, /CONTROLS: Left\/Right move, Up jumps, Space spikes/);
    assert.match(games.thunder_volley, /set ballVX to 8 \+ rally \/ 3/);
    assert.match(games.thunder_volley, /IF playerPoints > 6 THEN:/);
    assert.match(games.thunder_volley, /IF rivalPoints > 6 THEN:/);
    const stage = project.targets.find(target => target.isStage);
    assert.deepEqual(stage.costumes.map(costume => costume.name), ['backdrop1', 'intro', 'court']);
    const svgs = [...creator.assets.values()].filter(asset => asset.type === 'svg').map(asset => asset.data);
    assert.ok(svgs.some(svg => svg.includes('SKYCOURT SURGE')));
    assert.ok(svgs.some(svg => svg.includes('SCORE 7 BEFORE THE STORM RIVAL')));
    assert.ok(svgs.some(svg => svg.includes('SPACE SPIKES IN REACH')));
});

test('Chromafall Reactor renders every list cell and has a deterministic six-fusion goal', () => {
    const creator = new SB3Creator();
    const project = creator.parse(games.cascade_pair);
    assert.deepEqual(creator.errors, []);
    assert.deepEqual(creator.warnings, []);
    assert.match(games.cascade_pair, /GOAL: ignite six four-color fusions before any reactor column reaches ten cells/);
    assert.match(games.cascade_pair, /DEFINE FAST render reactor:/);
    assert.match(games.cascade_pair, /switch costume to \("block" join item i of colA\)/);
    assert.match(games.cascade_pair, /IF runB > 3 THEN:/);
    assert.match(games.cascade_pair, /change clears by 1/);
    assert.match(games.cascade_pair, /IF clears = 6 THEN:/);
    const stage = project.targets.find(target => target.isStage);
    assert.deepEqual(stage.costumes.map(costume => costume.name), ['backdrop1', 'intro', 'board']);
    const svgs = [...creator.assets.values()].filter(asset => asset.type === 'svg').map(asset => asset.data);
    assert.ok(svgs.some(svg => svg.includes('CHROMAFALL REACTOR')));
    assert.ok(svgs.some(svg => svg.includes('MAKE 6 FUSIONS')));
    assert.ok(svgs.some(svg => svg.includes('MATCH 4 EQUAL COLORS')));
});

test('Cratercoil paints its full list-backed trail and ends after twelve moonblooms', () => {
    const creator = new SB3Creator();
    const project = creator.parse(games.mooncoil_odyssey);
    assert.deepEqual(creator.errors, []);
    assert.deepEqual(creator.warnings, []);
    assert.match(games.mooncoil_odyssey, /GOAL: collect twelve moonblooms before three crashes/);
    assert.match(games.mooncoil_odyssey, /REPEAT length of trailX:/);
    assert.match(games.mooncoil_odyssey, /go to x: item i of trailX \* 24 y: item i of trailY \* 24/);
    assert.match(games.mooncoil_odyssey, /stamp/);
    assert.match(games.mooncoil_odyssey, /IF blooms = 12 THEN:/);
    assert.match(games.mooncoil_odyssey, /started = 1 and oxygen > 0/);
    const stage = project.targets.find(target => target.isStage);
    assert.deepEqual(stage.costumes.map(costume => costume.name), ['backdrop1', 'intro', 'moon']);
    const svgs = [...creator.assets.values()].filter(asset => asset.type === 'svg').map(asset => asset.data);
    assert.ok(svgs.some(svg => svg.includes('CRATERCOIL')));
    assert.ok(svgs.some(svg => svg.includes('COLLECT 12 MOONBLOOMS')));
    assert.ok(svgs.some(svg => svg.includes('AVOID YOUR GROWING TRAIL')));
});

test('Magma Lift has a ten-ring finish, fuel economy, and guarded crash recovery', () => {
    const creator = new SB3Creator();
    const project = creator.parse(games.cinder_thrust);
    assert.deepEqual(creator.errors, []);
    assert.deepEqual(creator.warnings, []);
    assert.match(games.cinder_thrust, /GOAL: fly through ten ember rings before three crashes or falls/);
    assert.match(games.cinder_thrust, /key up arrow pressed\? and fuel > 0/);
    assert.match(games.cinder_thrust, /touching ChargeLedge and flyerVY < 1/);
    assert.match(games.cinder_thrust, /touching BasaltTooth and invulnerable = 0/);
    assert.match(games.cinder_thrust, /change rings by 1/);
    assert.match(games.cinder_thrust, /IF rings = 10 THEN:/);
    const stage = project.targets.find(target => target.isStage);
    assert.deepEqual(stage.costumes.map(costume => costume.name), ['backdrop1', 'intro', 'cave']);
    const svgs = [...creator.assets.values()].filter(asset => asset.type === 'svg').map(asset => asset.data);
    assert.ok(svgs.some(svg => svg.includes('MAGMA LIFT')));
    assert.ok(svgs.some(svg => svg.includes('CLEAR 10 EMBER RINGS')));
    assert.ok(svgs.some(svg => svg.includes('CYAN LEDGES TO RECHARGE')));
});

test('new click and orbit controls advance in the real Scratch VM', async () => {
    const load = async source => {
        const creator = new SB3Creator();
        creator.parse(source);
        const buffer = Buffer.from(await (await creator.generateSB3()).arrayBuffer());
        const vm = new VM();
        await vm.loadProject(buffer);
        vm.start();
        vm.greenFlag();
        for (let i = 0; i < 20; i++) vm.runtime._step();
        vm.postIOData('keyboard', {key: ' ', isDown: true});
        for (let i = 0; i < 30; i++) vm.runtime._step();
        vm.postIOData('keyboard', {key: ' ', isDown: false});
        return {creator, vm};
    };
    const scalar = (vm, name) => Object.values(vm.runtime.getTargetForStage().variables)
        .find(variable => variable.name === name);

    const prism = await load(games.chroma_code);
    try {
        const {vm} = prism;
        const secret = scalar(vm, 'secret').value.slice();
        const clones = vm.runtime.targets.filter(target =>
            !target.isOriginal && target.sprite.name === 'GemButton');
        assert.equal(clones.length, 6, 'six clickable gem choices were not created');
        const cloneFor = value => clones.find(target => Object.values(target.variables)
            .some(variable => variable.name === 'gemValue' && Number(variable.value) === value));
        for (let slot = 0; slot < 4; slot++) {
            // Deliberately choose a different value in every slot, guaranteeing
            // this is a scored non-winning attempt rather than a random fluke.
            const choice = (Number(secret[slot]) % 6) + 1;
            vm.runtime.startHats('event_whenthisspriteclicked', {}, cloneFor(choice));
            for (let i = 0; i < 35; i++) vm.runtime._step();
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        assert.equal(Number(scalar(vm, 'exact').value), 0, 'clicked guess was not scored');
        await new Promise(resolve => setTimeout(resolve, 1900));
        for (let i = 0; i < 50; i++) vm.runtime._step();
        assert.equal(Number(scalar(vm, 'turn').value), 2, 'the next deduction row did not open');
        assert.equal(Number(scalar(vm, 'accepting').value), 1, 'gem buttons did not re-arm');
        assert.deepEqual(scalar(vm, 'guess').value, [], 'previous guess was not cleared');
    } finally {
        prism.vm.quit();
        clearStrayTimers();
    }

    const aegis = await load(games.orbit_ward);
    try {
        const {vm} = aegis;
        const locks = vm.runtime.targets.filter(target =>
            !target.isOriginal && target.sprite.name === 'Seal');
        assert.equal(locks.length, 8, 'eight reactor locks were not created');
        const before = Number(scalar(vm, 'angle').value);
        vm.postIOData('keyboard', {key: 'ArrowLeft', isDown: true});
        for (let i = 0; i < 20; i++) vm.runtime._step();
        vm.postIOData('keyboard', {key: 'ArrowLeft', isDown: false});
        assert.ok(Number(scalar(vm, 'angle').value) < before, 'left arrow did not rotate the shield');
    } finally {
        aegis.vm.quit();
        clearStrayTimers();
    }
});

test('new merge and runner controls change live Scratch VM state', async () => {
    // Since #34 the green flag starts every game through
    // `__brickwright_start_from_flag`, so a Space press here no longer
    // crosses a title gate — it reaches the game as a MOVE. Fusion
    // Foundry dropped a core on it and then a second on the one this test
    // sends, which is what "2 !== 1" was.
    const load = async source => {
        const creator = new SB3Creator();
        creator.parse(source);
        const buffer = Buffer.from(await (await creator.generateSB3()).arrayBuffer());
        const vm = new VM();
        await vm.loadProject(buffer);
        vm.start();
        vm.greenFlag();
        for (let i = 0; i < 20; i++) vm.runtime._step();
        // Since #34 the green flag starts every game itself, through
        // `__brickwright_start_from_flag` — but the hat waits 0.6 s first,
        // so the start has to be waited FOR rather than stepped to. This
        // used to press Space instead, which crossed a title gate that no
        // longer exists; the press now reaches the game as a MOVE, and
        // Fusion Foundry dropped a core on it and a second on the one the
        // test sends. That was "2 !== 1".
        await new Promise(resolve => setTimeout(resolve, 700));
        for (let i = 0; i < 30; i++) vm.runtime._step();
        return vm;
    };
    const stageValue = (vm, name) => Object.values(vm.runtime.getTargetForStage().variables)
        .find(variable => variable.name === name);

    const nova = await load(games.g2048);
    try {
        assert.equal(Number(stageValue(nova, 'started').value), 1,
            'the ordinary green flag left the game parked behind a Space/fullscreen gate');
        const board = nova.runtime.targets.find(target => target.sprite.name === 'Board');
        const grid = Object.values(board.variables).find(variable => variable.name === 'grid');
        grid.value = [2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        nova.postIOData('mouse', {x: 320, y: 180, canvasWidth: 480, canvasHeight: 360, isDown: true});
        for (let i = 0; i < 12; i++) nova.runtime._step();
        nova.postIOData('mouse', {x: 120, y: 180, canvasWidth: 480, canvasHeight: 360, isDown: false});
        for (let i = 0; i < 35; i++) nova.runtime._step();
        assert.equal(Number(grid.value[0]), 4, 'left swipe did not fuse equal tiles toward its edge');
        assert.equal(grid.value.filter(value => Number(value) > 0).length, 2,
            'a successful move did not leave the fused tile plus one new tile');
        assert.equal(Number(stageValue(nova, 'score').value), 4, 'fusion score was not awarded');
        assert.equal(Number(stageValue(nova, 'chain').value), 1, 'first fusion did not start the chain');
    } finally {
        nova.quit();
        clearStrayTimers();
    }

    const cascade = await load(games.fusion_foundry);
    try {
        const foundry = cascade.runtime.targets.find(target => target.sprite.name === 'Foundry');
        const grid = Object.values(foundry.variables).find(variable => variable.name === 'grid');
        assert.equal(grid.value.length, 42, 'reactor grid was not initialized');
        const beforeColumn = Number(stageValue(cascade, 'column').value);
        cascade.postIOData('keyboard', {key: 'ArrowLeft', isDown: true});
        for (let i = 0; i < 15; i++) cascade.runtime._step();
        cascade.postIOData('keyboard', {key: 'ArrowLeft', isDown: false});
        assert.equal(Number(stageValue(cascade, 'column').value), beforeColumn - 1,
            'shaft selector did not move');
        cascade.postIOData('keyboard', {key: ' ', isDown: true});
        for (let i = 0; i < 35; i++) cascade.runtime._step();
        cascade.postIOData('keyboard', {key: ' ', isDown: false});
        assert.equal(grid.value.filter(value => Number(value) > 0).length, 1,
            'Space did not drop exactly one preview core');
    } finally {
        cascade.quit();
        clearStrayTimers();
    }

    const relay = await load(games.rooftop_relay);
    try {
        const scoreBeforeBattery = Number(stageValue(relay, 'score').value);
        relay.runtime.startHats('event_whenbroadcastreceived', {BROADCAST_OPTION: 'battery collected'});
        for (let i = 0; i < 8; i++) relay.runtime._step();
        assert.equal(Number(stageValue(relay, 'score').value), scoreBeforeBattery + 5,
            'battery pickup did not award exactly five points');
        assert.ok(Number(stageValue(relay, 'overdrive').value) > 0,
            'battery pickup did not activate overdrive');
        const beforeY = Number(stageValue(relay, 'runy').value);
        relay.postIOData('keyboard', {key: 'ArrowUp', isDown: true});
        for (let i = 0; i < 12; i++) relay.runtime._step();
        relay.postIOData('keyboard', {key: 'ArrowUp', isDown: false});
        assert.ok(Number(stageValue(relay, 'runy').value) > beforeY, 'Up did not launch the runner');
        await new Promise(resolve => setTimeout(resolve, 2200));
        for (let i = 0; i < 25; i++) relay.runtime._step();
        assert.ok(relay.runtime.targets.some(target => !target.isOriginal && target.sprite.name === 'Hazard'),
            'hazard stream did not start after the onboarding gate');
    } finally {
        relay.quit();
        clearStrayTimers();
    }
});

test('dual-paddle defense and slipstream race respond in the live Scratch VM', async () => {
    const load = async source => {
        const creator = new SB3Creator();
        creator.parse(source);
        const buffer = Buffer.from(await (await creator.generateSB3()).arrayBuffer());
        const vm = new VM();
        await vm.loadProject(buffer);
        vm.start();
        vm.greenFlag();
        for (let i = 0; i < 20; i++) vm.runtime._step();
        vm.postIOData('keyboard', {key: ' ', isDown: true});
        for (let i = 0; i < 30; i++) vm.runtime._step();
        vm.postIOData('keyboard', {key: ' ', isDown: false});
        return vm;
    };
    const value = (vm, name) => Object.values(vm.runtime.getTargetForStage().variables)
        .find(variable => variable.name === name);

    const rift = await load(games.twinwall);
    try {
        assert.equal(rift.runtime.targets.filter(target =>
            !target.isOriginal && target.sprite.name === 'Shifter').length, 24,
        'the 24-crystal field was not created');
        const crystals = rift.runtime.targets.filter(target =>
            !target.isOriginal && target.sprite.name === 'Shifter');
        const firstDrift = Object.values(crystals[0].variables).find(variable => variable.name === 'drift');
        const secondDrift = Object.values(crystals[1].variables).find(variable => variable.name === 'drift');
        assert.notEqual(firstDrift, secondDrift, 'crystal clones share the same drift variable object');
        firstDrift.value = 1;
        secondDrift.value = -1;
        assert.equal(Number(firstDrift.value), 1);
        assert.equal(Number(secondDrift.value), -1, 'one crystal changed another crystal’s direction');
        rift.postIOData('keyboard', {key: 'w', isDown: true});
        rift.postIOData('keyboard', {key: 'ArrowUp', isDown: true});
        for (let i = 0; i < 12; i++) rift.runtime._step();
        rift.postIOData('keyboard', {key: 'w', isDown: false});
        rift.postIOData('keyboard', {key: 'ArrowUp', isDown: false});
        assert.ok(Number(value(rift, 'ly').value) > 0, 'W did not move the left paddle');
        assert.ok(Number(value(rift, 'ry').value) > 0, 'Up did not move the right paddle');
        value(rift, 'bx').value = 240;
        for (let i = 0; i < 8; i++) rift.runtime._step();
        assert.equal(Number(value(rift, 'lives').value), 2, 'an escaped comet did not cost one life');
    } finally {
        rift.quit();
        clearStrayTimers();
    }

    const circuit = await load(games.turbo_chicane);
    try {
        circuit.postIOData('keyboard', {key: 'ArrowLeft', isDown: true});
        for (let i = 0; i < 12; i++) circuit.runtime._step();
        circuit.postIOData('keyboard', {key: 'ArrowLeft', isDown: false});
        assert.ok(Number(value(circuit, 'lane').value) < 0, 'Left did not steer the racer');
        await new Promise(resolve => setTimeout(resolve, 2200));
        for (let i = 0; i < 25; i++) circuit.runtime._step();
        assert.ok(circuit.runtime.targets.some(target => !target.isOriginal && target.sprite.name === 'Rival'),
            'rival traffic did not start');
        assert.ok(circuit.runtime.targets.some(target => !target.isOriginal && target.sprite.name === 'Draft'),
            'the separate collectible slipstream did not spawn behind the rival');
    } finally {
        circuit.quit();
        clearStrayTimers();
    }
});

test('buoyancy and mouse-cast controls work in the live Scratch VM', async () => {
    const load = async source => {
        const creator = new SB3Creator();
        creator.parse(source);
        const buffer = Buffer.from(await (await creator.generateSB3()).arrayBuffer());
        const vm = new VM();
        await vm.loadProject(buffer);
        vm.start();
        vm.greenFlag();
        for (let i = 0; i < 20; i++) vm.runtime._step();
        vm.postIOData('keyboard', {key: ' ', isDown: true});
        for (let i = 0; i < 30; i++) vm.runtime._step();
        vm.postIOData('keyboard', {key: ' ', isDown: false});
        return vm;
    };
    const value = (vm, name) => Object.values(vm.runtime.getTargetForStage().variables)
        .find(variable => variable.name === name);

    const abyss = await load(games.abyss_rescue);
    try {
        const beforeY = Number(value(abyss, 'suby').value);
        abyss.postIOData('keyboard', {key: ' ', isDown: true});
        for (let i = 0; i < 18; i++) abyss.runtime._step();
        abyss.postIOData('keyboard', {key: ' ', isDown: false});
        assert.ok(Number(value(abyss, 'suby').value) > beforeY, 'holding Space did not add buoyancy');
        assert.equal(Number(value(abyss, 'hull').value), 3, 'the rescue began with the wrong hull count');
    } finally {
        abyss.quit();
        clearStrayTimers();
    }

    const wardlight = await load(games.specter_sweep);
    try {
        wardlight.postIOData('mouse', {x: 120, y: 60, canvasWidth: 480, canvasHeight: 360, isDown: true});
        for (let i = 0; i < 25; i++) wardlight.runtime._step();
        wardlight.postIOData('mouse', {x: 120, y: 60, canvasWidth: 480, canvasHeight: 360, isDown: false});
        assert.ok(wardlight.runtime.targets.some(target => !target.isOriginal && target.sprite.name === 'Orb'),
            'mouse click did not create a ricochet orb');
        assert.equal(Number(value(wardlight, 'ward').value), 3, 'the central ward began damaged');
    } finally {
        wardlight.quit();
        clearStrayTimers();
    }
});

test('stealth movement and aerial-spike controls work in the live Scratch VM', async () => {
    const load = async source => {
        const creator = new SB3Creator();
        creator.parse(source);
        const buffer = Buffer.from(await (await creator.generateSB3()).arrayBuffer());
        const vm = new VM();
        await vm.loadProject(buffer);
        vm.start();
        vm.greenFlag();
        for (let i = 0; i < 20; i++) vm.runtime._step();
        vm.postIOData('keyboard', {key: ' ', isDown: true});
        for (let i = 0; i < 30; i++) vm.runtime._step();
        vm.postIOData('keyboard', {key: ' ', isDown: false});
        return vm;
    };
    const value = (vm, name) => Object.values(vm.runtime.getTargetForStage().variables)
        .find(variable => variable.name === name);

    const pantry = await load(games.moonlight_heist);
    try {
        const beforeX = Number(value(pantry, 'px').value);
        pantry.postIOData('keyboard', {key: 'ArrowRight', isDown: true});
        for (let i = 0; i < 12; i++) pantry.runtime._step();
        pantry.postIOData('keyboard', {key: 'ArrowRight', isDown: false});
        assert.ok(Number(value(pantry, 'px').value) > beforeX, 'Right did not move the mouse');
        assert.ok(Number(value(pantry, 'alert').value) > 0, 'moving in the open did not raise alert');
        const target = name => pantry.runtime.targets.find(candidate =>
            candidate.isOriginal && candidate.sprite && candidate.sprite.name === name);
        const cheese = target('Cheese');
        const tunnel = target('Tunnel');
        const cat = target('Cat');
        const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
        assert.equal(Number(value(pantry, 'cheeseReady').value), 1, 'cheese spawn never armed');
        assert.ok(distance(cheese, tunnel) > 80, 'cheese spawned inside the safe hideout');
        assert.ok(distance(cheese, cat) > 70, 'cheese spawned on the cat patrol');

        value(pantry, 'score').value = 5;
        pantry.runtime.startHats('event_whenbroadcastreceived', {BROADCAST_OPTION: 'pantry won'});
        for (let i = 0; i < 30; i++) pantry.runtime._step();
        assert.equal(Number(value(pantry, 'winner').value), 1, 'safe return did not win the heist');
        assert.equal(Number(value(pantry, 'active').value), 0, 'won heist remained active');
        assert.equal(Number(value(pantry, 'started').value), 0, 'won heist was not replayable');
        assert.equal(target('PantryResult').visible, true, 'heist result was not shown');
    } finally {
        pantry.quit();
        clearStrayTimers();
    }

    const nimbus = await load(games.cloud_court);
    try {
        const floorY = Number(value(nimbus, 'py').value);
        nimbus.postIOData('keyboard', {key: 'w', isDown: true});
        for (let i = 0; i < 8; i++) nimbus.runtime._step();
        nimbus.postIOData('keyboard', {key: 'w', isDown: false});
        assert.ok(Number(value(nimbus, 'py').value) > floorY, 'W did not launch a jump');
        nimbus.postIOData('keyboard', {key: 's', isDown: true});
        for (let i = 0; i < 4; i++) nimbus.runtime._step();
        assert.equal(Number(value(nimbus, 'spiking').value), 1, 'S in the air did not arm the spike');
        nimbus.postIOData('keyboard', {key: 's', isDown: false});
        value(nimbus, 'playerScore').value = 6;
        value(nimbus, 'bx').value = 100;
        value(nimbus, 'by').value = -170;
        value(nimbus, 'vx').value = 0;
        value(nimbus, 'vy').value = -1;
        for (let i = 0; i < 12; i++) nimbus.runtime._step();
        assert.equal(Number(value(nimbus, 'playerScore').value), 7,
            'landing the seventh ball on the rival court did not win the match');
        await new Promise(resolve => setTimeout(resolve, 650));
        for (let i = 0; i < 20; i++) nimbus.runtime._step();
        assert.equal(Number(value(nimbus, 'active').value), 0, 'the seventh point did not end the match');
        assert.equal(Number(value(nimbus, 'started').value), 0, 'the finished match was not replayable');
        assert.ok(nimbus.runtime.targets.some(target =>
            target.sprite && target.sprite.name === 'NimbusResult' && target.visible),
        'the match result was not shown');
    } finally {
        nimbus.quit();
        clearStrayTimers();
    }
});

test('parry timing and hydrofoil lane-boost controls work in the live Scratch VM', async () => {
    const load = async source => {
        const creator = new SB3Creator();
        creator.parse(source);
        const buffer = Buffer.from(await (await creator.generateSB3()).arrayBuffer());
        const vm = new VM();
        await vm.loadProject(buffer);
        vm.start();
        vm.greenFlag();
        for (let i = 0; i < 20; i++) vm.runtime._step();
        vm.postIOData('keyboard', {key: ' ', isDown: true});
        for (let i = 0; i < 30; i++) vm.runtime._step();
        vm.postIOData('keyboard', {key: ' ', isDown: false});
        return vm;
    };
    const value = (vm, name) => Object.values(vm.runtime.getTargetForStage().variables)
        .find(variable => variable.name === name);

    const ember = await load(games.ember_dojo);
    try {
        const beforeX = Number(value(ember, 'heroX').value);
        ember.postIOData('keyboard', {key: 'ArrowRight', isDown: true});
        for (let i = 0; i < 8; i++) ember.runtime._step();
        ember.postIOData('keyboard', {key: 'ArrowRight', isDown: false});
        assert.ok(Number(value(ember, 'heroX').value) > beforeX, 'Right did not move the ronin');
        ember.postIOData('keyboard', {key: ' ', isDown: true});
        for (let i = 0; i < 3; i++) ember.runtime._step();
        assert.equal(Number(value(ember, 'parrying').value), 1, 'Space did not open the parry window');
        ember.postIOData('keyboard', {key: ' ', isDown: false});
    } finally {
        ember.quit();
        clearStrayTimers();
    }

    const tidegate = await load(games.lockstep_lagoon);
    try {
        const lockGate = tidegate.runtime.targets.find(target => target.sprite.name === 'LockGate');
        assert.ok([-110, 0, 110].includes(Math.round(lockGate.x)),
            `first gate spawned between lanes at x=${lockGate.x}`);
        await new Promise(resolve => setTimeout(resolve, 180));
        for (let i = 0; i < 12; i++) tidegate.runtime._step();
        tidegate.postIOData('keyboard', {key: 'ArrowRight', isDown: true});
        // The game's movement loop contains real timed waits and a glide. A
        // fixed burst of synchronous VM steps can therefore run entirely
        // while that thread is sleeping on a loaded CI worker. Keep the key
        // down and exercise the scheduler until the observable lane change
        // occurs, with a hard bound so a broken control still fails quickly.
        for (let i = 0; i < 50 && Number(value(tidegate, 'lane').value) !== 1; i++) {
            tidegate.runtime._step();
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        tidegate.postIOData('keyboard', {key: 'ArrowRight', isDown: false});
        assert.equal(Number(value(tidegate, 'lane').value), 1, 'Right did not select the next channel');
        await new Promise(resolve => setTimeout(resolve, 120));
        tidegate.postIOData('keyboard', {key: 'ArrowUp', isDown: true});
        await new Promise(resolve => setTimeout(resolve, 100));
        for (let i = 0; i < 12; i++) tidegate.runtime._step();
        tidegate.postIOData('keyboard', {key: 'ArrowUp', isDown: false});
        assert.ok(Number(value(tidegate, 'charge').value) < 100, 'Up did not spend boost charge');
        assert.equal(Number(value(tidegate, 'gates').value), 0, 'the race began with phantom cleared gates');
    } finally {
        tidegate.quit();
        clearStrayTimers();
    }
});

test('ice momentum and charge-release shooting work in the live Scratch VM', async () => {
    const load = async source => {
        const creator = new SB3Creator(); creator.parse(source);
        const vm = new VM();
        await vm.loadProject(Buffer.from(await (await creator.generateSB3()).arrayBuffer()));
        vm.start(); vm.greenFlag();
        for (let i = 0; i < 20; i++) vm.runtime._step();
        vm.postIOData('keyboard', {key: ' ', isDown: true});
        for (let i = 0; i < 20; i++) vm.runtime._step();
        vm.postIOData('keyboard', {key: ' ', isDown: false});
        return vm;
    };
    const value = (vm, name) => Object.values(vm.runtime.getTargetForStage().variables)
        .find(variable => variable.name === name);
    const rink = await load(games.rink_riot);
    try {
        rink.postIOData('keyboard', {key: 'ArrowUp', isDown: true});
        for (let i = 0; i < 10; i++) rink.runtime._step();
        rink.postIOData('keyboard', {key: 'ArrowUp', isDown: false});
        assert.ok(Number(value(rink, 'vy').value) > 0, 'Up did not create skating momentum');
        assert.ok(Number(value(rink, 'skaterY').value) > 0, 'momentum did not move the skater');
    } finally { rink.quit(); clearStrayTimers(); }

    const hoops = await load(games.rim_reactor);
    try {
        await new Promise(resolve => setTimeout(resolve, 450));
        for (let i = 0; i < 20; i++) hoops.runtime._step();
        hoops.postIOData('keyboard', {key: ' ', isDown: true});
        for (let i = 0; i < 16; i++) hoops.runtime._step();
        assert.ok(Number(value(hoops, 'charge').value) > 2, 'holding Space did not charge the shot');
        hoops.postIOData('keyboard', {key: ' ', isDown: false});
        for (let i = 0; i < 5; i++) hoops.runtime._step();
        assert.equal(Number(value(hoops, 'flying').value), 1, 'releasing Space did not launch the ball');
    } finally { hoops.quit(); clearStrayTimers(); }
});

test('curve-run and sonar-cooldown controls work in the live Scratch VM', async () => {
    const load = async source => {
        const creator = new SB3Creator(); creator.parse(source);
        const vm = new VM();
        await vm.loadProject(Buffer.from(await (await creator.generateSB3()).arrayBuffer()));
        vm.start(); vm.greenFlag();
        for (let i = 0; i < 20; i++) vm.runtime._step();
        vm.postIOData('keyboard', {key: ' ', isDown: true});
        for (let i = 0; i < 20; i++) vm.runtime._step();
        vm.postIOData('keyboard', {key: ' ', isDown: false});
        return vm;
    };
    const value = (vm, name) => Object.values(vm.runtime.getTargetForStage().variables)
        .find(variable => variable.name === name);

    const comet = await load(games.comet_cup);
    try {
        comet.postIOData('keyboard', {key: 'ArrowUp', isDown: true});
        for (let i = 0; i < 10; i++) comet.runtime._step();
        comet.postIOData('keyboard', {key: 'ArrowUp', isDown: false});
        assert.equal(Number(value(comet, 'runY').value), 4, 'Up did not create shot-curving run input');
        assert.ok(Number(value(comet, 'strikerY').value) > 0, 'Up did not move the striker');
    } finally { comet.quit(); clearStrayTimers(); }

    const trench = await load(games.trench_signal);
    try {
        await new Promise(resolve => setTimeout(resolve, 300));
        for (let i = 0; i < 10; i++) trench.runtime._step();
        assert.equal(Number(value(trench, 'pulseReady').value), 1, 'sonar never became ready');
        trench.postIOData('keyboard', {key: ' ', isDown: true});
        for (let i = 0; i < 5; i++) trench.runtime._step();
        trench.postIOData('keyboard', {key: ' ', isDown: false});
        assert.equal(Number(value(trench, 'pulseReady').value), 0, 'Space did not begin sonar cooldown');
        assert.ok(trench.runtime.targets.some(target => target.sprite.name === 'SonarRing' && target.visible),
            'Space did not reveal the sonar ring');
    } finally { trench.quit(); clearStrayTimers(); }
});

test('directional cargo dash and charged tube boost work in the live Scratch VM', async () => {
    const load = async source => {
        const creator = new SB3Creator(); creator.parse(source);
        const vm = new VM();
        await vm.loadProject(Buffer.from(await (await creator.generateSB3()).arrayBuffer()));
        vm.start(); vm.greenFlag();
        for (let i = 0; i < 20; i++) vm.runtime._step();
        vm.postIOData('keyboard', {key: ' ', isDown: true});
        for (let i = 0; i < 20; i++) vm.runtime._step();
        vm.postIOData('keyboard', {key: ' ', isDown: false});
        return vm;
    };
    const value = (vm, name) => Object.values(vm.runtime.getTargetForStage().variables)
        .find(variable => variable.name === name);

    const relay = await load(games.whisker_switch);
    try {
        relay.postIOData('keyboard', {key: 'ArrowUp', isDown: true});
        for (let i = 0; i < 6; i++) relay.runtime._step();
        relay.postIOData('keyboard', {key: 'ArrowUp', isDown: false});
        value(relay, 'cargo').value = 1;
        const beforeY = Number(value(relay, 'mouseY').value);
        relay.postIOData('keyboard', {key: ' ', isDown: true});
        for (let i = 0; i < 4; i++) relay.runtime._step();
        relay.postIOData('keyboard', {key: ' ', isDown: false});
        assert.ok(Number(value(relay, 'mouseY').value) >= beforeY + 50, 'dash ignored the last movement direction');
        assert.equal(Number(value(relay, 'cargo').value), 0, 'dash did not spend one cargo');
    } finally { relay.quit(); clearStrayTimers(); }

    const helix = await load(games.spiral_circuit);
    try {
        value(helix, 'charge').value = 6;
        helix.postIOData('keyboard', {key: ' ', isDown: true});
        for (let i = 0; i < 4; i++) helix.runtime._step();
        helix.postIOData('keyboard', {key: ' ', isDown: false});
        assert.equal(Number(value(helix, 'boosting').value), 1, 'charged Space did not begin phase boost');
        assert.equal(Number(value(helix, 'sectors').value), 0, 'the run began with phantom sectors');
    } finally { helix.quit(); clearStrayTimers(); }
});

test('grid hopping and throttle-jump controls work in the live Scratch VM', async () => {
    const load = async source => {
        const creator = new SB3Creator(); creator.parse(source);
        const vm = new VM();
        await vm.loadProject(Buffer.from(await (await creator.generateSB3()).arrayBuffer()));
        vm.start(); vm.greenFlag();
        for (let i = 0; i < 20; i++) vm.runtime._step();
        vm.postIOData('keyboard', {key: ' ', isDown: true});
        for (let i = 0; i < 20; i++) vm.runtime._step();
        vm.postIOData('keyboard', {key: ' ', isDown: false});
        return vm;
    };
    const value = (vm, name) => Object.values(vm.runtime.getTargetForStage().variables)
        .find(variable => variable.name === name);

    const moonbank = await load(games.lilyway_rescue);
    try {
        const beforeY = Number(value(moonbank, 'frogY').value);
        moonbank.postIOData('keyboard', {key: 'ArrowUp', isDown: true});
        for (let i = 0; i < 4; i++) moonbank.runtime._step();
        moonbank.postIOData('keyboard', {key: 'ArrowUp', isDown: false});
        assert.equal(Number(value(moonbank, 'frogY').value), beforeY + 45, 'Up did not hop exactly one grid row');
        assert.equal(Number(value(moonbank, 'crossings').value), 0, 'the route began with phantom crossings');
    } finally { moonbank.quit(); clearStrayTimers(); }

    const courier = await load(games.rotor_rogue);
    try {
        await new Promise(resolve => setTimeout(resolve, 240));
        for (let i = 0; i < 10; i++) courier.runtime._step();
        const beforeSpeed = Number(value(courier, 'speed').value);
        courier.postIOData('keyboard', {key: 'ArrowUp', isDown: true});
        for (let i = 0; i < 10; i++) courier.runtime._step();
        courier.postIOData('keyboard', {key: 'ArrowUp', isDown: false});
        assert.ok(Number(value(courier, 'speed').value) > beforeSpeed, 'Up did not accelerate the bike');
        courier.postIOData('keyboard', {key: ' ', isDown: true});
        for (let i = 0; i < 4; i++) courier.runtime._step();
        courier.postIOData('keyboard', {key: ' ', isDown: false});
        assert.equal(Number(value(courier, 'airborne').value), 1, 'Space did not launch the bike');
    } finally { courier.quit(); clearStrayTimers(); }
});

test('precision drop and single-lance controls work in the live Scratch VM', async () => {
    const load = async source => {
        const creator = new SB3Creator(); creator.parse(source);
        const vm = new VM();
        await vm.loadProject(Buffer.from(await (await creator.generateSB3()).arrayBuffer()));
        vm.start(); vm.greenFlag();
        for (let i = 0; i < 20; i++) vm.runtime._step();
        vm.postIOData('keyboard', {key: ' ', isDown: true});
        for (let i = 0; i < 20; i++) vm.runtime._step();
        vm.postIOData('keyboard', {key: ' ', isDown: false});
        await new Promise(resolve => setTimeout(resolve, 240));
        for (let i = 0; i < 10; i++) vm.runtime._step();
        return vm;
    };
    const value = (vm, name) => Object.values(vm.runtime.getTargetForStage().variables)
        .find(variable => variable.name === name);

    const stack = await load(games.prism_spire);
    try {
        value(stack, 'blockX').value = Number(value(stack, 'towerX').value);
        stack.postIOData('keyboard', {key: ' ', isDown: true});
        for (let i = 0; i < 8; i++) stack.runtime._step();
        stack.postIOData('keyboard', {key: ' ', isDown: false});
        assert.equal(Number(value(stack, 'level').value), 1, 'Space did not place a centred floor');
        assert.equal(Number(value(stack, 'perfect').value), 1, 'centred floor did not build perfect combo');
    } finally { stack.quit(); clearStrayTimers(); }

    const posse = await load(games.shard_sheriff);
    try {
        posse.postIOData('keyboard', {key: ' ', isDown: true});
        for (let i = 0; i < 4; i++) posse.runtime._step();
        posse.postIOData('keyboard', {key: ' ', isDown: false});
        assert.equal(Number(value(posse, 'lanceOn').value), 1, 'Space did not fire the lance');
        assert.ok(posse.runtime.targets.some(target => target.sprite.name === 'Lance' && target.visible),
            'fired lance was not visible');
        assert.equal(Number(value(posse, 'waves').value), 0, 'arena began with phantom waves');
    } finally { posse.quit(); clearStrayTimers(); }
});

test('orbital shield and inertial drone controls work in the live Scratch VM', async () => {
    const load = async source => {
        const creator = new SB3Creator(); creator.parse(source);
        const vm = new VM();
        await vm.loadProject(Buffer.from(await (await creator.generateSB3()).arrayBuffer()));
        vm.start(); vm.greenFlag();
        for (let i = 0; i < 20; i++) vm.runtime._step();
        vm.postIOData('keyboard', {key: ' ', isDown: true});
        for (let i = 0; i < 20; i++) vm.runtime._step();
        vm.postIOData('keyboard', {key: ' ', isDown: false});
        await new Promise(resolve => setTimeout(resolve, 260));
        for (let i = 0; i < 10; i++) vm.runtime._step();
        return vm;
    };
    const value = (vm, name) => Object.values(vm.runtime.getTargetForStage().variables)
        .find(variable => variable.name === name);

    const halo = await load(games.halo_foundry);
    try {
        const beforeX = Number(value(halo, 'shieldX').value);
        halo.postIOData('keyboard', {key: 'ArrowRight', isDown: true});
        for (let i = 0; i < 8; i++) halo.runtime._step();
        halo.postIOData('keyboard', {key: 'ArrowRight', isDown: false});
        assert.ok(Number(value(halo, 'shieldAngle').value) > 0, 'Right did not rotate the shield');
        assert.notEqual(Number(value(halo, 'shieldX').value), beforeX, 'shield did not follow its ellipse');
        assert.equal(Number(value(halo, 'locks').value), 4, 'ring began with the wrong lock count');
        assert.equal(Number(value(halo, 'round').value), 1, 'ring began in the wrong round');
    } finally { halo.quit(); clearStrayTimers(); }

    const kestrel = await load(games.corridor_kestrel);
    try {
        kestrel.postIOData('keyboard', {key: 'ArrowUp', isDown: true});
        kestrel.postIOData('keyboard', {key: 'ArrowRight', isDown: true});
        for (let i = 0; i < 8; i++) kestrel.runtime._step();
        kestrel.postIOData('keyboard', {key: 'ArrowUp', isDown: false});
        kestrel.postIOData('keyboard', {key: 'ArrowRight', isDown: false});
        assert.ok(Number(value(kestrel, 'driftX').value) > 0, 'Right did not add horizontal drift');
        assert.ok(Number(value(kestrel, 'driftY').value) > 0, 'Up did not add vertical drift');
        assert.ok(Number(value(kestrel, 'droneX').value) > -150, 'drone did not coast horizontally');
        assert.ok(Number(value(kestrel, 'droneY').value) > 0, 'drone did not coast vertically');
        kestrel.postIOData('keyboard', {key: ' ', isDown: true});
        for (let i = 0; i < 4; i++) kestrel.runtime._step();
        kestrel.postIOData('keyboard', {key: ' ', isDown: false});
        assert.equal(Number(value(kestrel, 'shield').value), 1, 'Space did not engage the battery shield');
        assert.equal(Number(value(kestrel, 'gates').value), 0, 'run began with phantom gates');
    } finally { kestrel.quit(); clearStrayTimers(); }
});

test('aerial movement and deterministic color fusion work in the live Scratch VM', async () => {
    const load = async source => {
        const creator = new SB3Creator(); creator.parse(source);
        const vm = new VM();
        await vm.loadProject(Buffer.from(await (await creator.generateSB3()).arrayBuffer()));
        vm.start(); vm.greenFlag();
        for (let i = 0; i < 20; i++) vm.runtime._step();
        vm.postIOData('keyboard', {key: ' ', isDown: true});
        for (let i = 0; i < 20; i++) vm.runtime._step();
        vm.postIOData('keyboard', {key: ' ', isDown: false});
        await new Promise(resolve => setTimeout(resolve, 250));
        for (let i = 0; i < 10; i++) vm.runtime._step();
        return vm;
    };
    const value = (vm, name) => Object.values(vm.runtime.getTargetForStage().variables)
        .find(variable => variable.name === name);

    const skycourt = await load(games.thunder_volley);
    try {
        skycourt.postIOData('keyboard', {key: 'ArrowRight', isDown: true});
        skycourt.postIOData('keyboard', {key: 'ArrowUp', isDown: true});
        for (let i = 0; i < 8; i++) skycourt.runtime._step();
        skycourt.postIOData('keyboard', {key: 'ArrowRight', isDown: false});
        skycourt.postIOData('keyboard', {key: 'ArrowUp', isDown: false});
        assert.ok(Number(value(skycourt, 'playerX').value) > -130, 'Right did not move Volt');
        assert.ok(Number(value(skycourt, 'playerY').value) > -125, 'Up did not launch Volt');
        assert.equal(Number(value(skycourt, 'playerPoints').value), 0, 'court began with phantom points');
    } finally { skycourt.quit(); clearStrayTimers(); }

    const reactor = await load(games.cascade_pair);
    try {
        for (let drop = 0; drop < 2; drop++) {
            value(reactor, 'colorA').value = 1;
            value(reactor, 'colorB').value = 1;
            reactor.postIOData('keyboard', {key: ' ', isDown: true});
            for (let i = 0; i < 15; i++) reactor.runtime._step();
            reactor.postIOData('keyboard', {key: ' ', isDown: false});
            await new Promise(resolve => setTimeout(resolve, 140));
            for (let i = 0; i < 15; i++) reactor.runtime._step();
        }
        assert.deepEqual(value(reactor, 'colB').value, [], 'four matching cells did not leave the lane');
        assert.equal(Number(value(reactor, 'clears').value), 1, 'four matching cells did not count as a fusion');
        assert.equal(Number(value(reactor, 'score').value), 40, 'first fusion did not score its base value');
        assert.equal(Number(value(reactor, 'combo').value), 2, 'fusion did not grow the combo multiplier');
    } finally { reactor.quit(); clearStrayTimers(); }
});

test('lunar dash and rocket thrust consume resources in the live Scratch VM', async () => {
    const load = async source => {
        const creator = new SB3Creator(); creator.parse(source);
        const vm = new VM();
        await vm.loadProject(Buffer.from(await (await creator.generateSB3()).arrayBuffer()));
        vm.start(); vm.greenFlag();
        for (let i = 0; i < 20; i++) vm.runtime._step();
        vm.postIOData('keyboard', {key: ' ', isDown: true});
        for (let i = 0; i < 20; i++) vm.runtime._step();
        vm.postIOData('keyboard', {key: ' ', isDown: false});
        await new Promise(resolve => setTimeout(resolve, 250));
        for (let i = 0; i < 10; i++) vm.runtime._step();
        return vm;
    };
    const value = (vm, name) => Object.values(vm.runtime.getTargetForStage().variables)
        .find(variable => variable.name === name);

    const coil = await load(games.mooncoil_odyssey);
    try {
        coil.postIOData('keyboard', {key: 'ArrowUp', isDown: true});
        for (let i = 0; i < 4; i++) coil.runtime._step();
        coil.postIOData('keyboard', {key: 'ArrowUp', isDown: false});
        const beforeY = Number(value(coil, 'headY').value);
        const beforeOxygen = Number(value(coil, 'oxygen').value);
        coil.postIOData('keyboard', {key: ' ', isDown: true});
        // vm.start() also owns a real-time stepping interval. Four immediate
        // manual steps raced that interval on a loaded CI runner and could
        // inspect oxygen before the key hat had run. Observe the authored
        // transition with a hard bound; still require exactly one unit, so a
        // repeated or missing dash cannot make this test green.
        for (let i = 0; i < 20 && Number(value(coil, 'oxygen').value) === beforeOxygen; i++) {
            coil.runtime._step();
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        coil.postIOData('keyboard', {key: ' ', isDown: false});
        assert.equal(Number(value(coil, 'dirY').value), 1, 'Up did not turn the coil north');
        assert.equal(Number(value(coil, 'oxygen').value), beforeOxygen - 1,
            'dash did not spend exactly one oxygen');
        assert.ok(Number(value(coil, 'headY').value) > beforeY, 'dash did not advance an extra grid cell');
        assert.ok(value(coil, 'trailX').value.length > 0, 'movement did not record a renderable trail');
    } finally { coil.quit(); clearStrayTimers(); }

    const lift = await load(games.cinder_thrust);
    try {
        value(lift, 'flyerY').value = 0;
        value(lift, 'flyerVY').value = 0;
        const beforeFuel = Number(value(lift, 'fuel').value);
        lift.postIOData('keyboard', {key: 'ArrowUp', isDown: true});
        for (let i = 0; i < 10; i++) lift.runtime._step();
        lift.postIOData('keyboard', {key: 'ArrowUp', isDown: false});
        assert.ok(Number(value(lift, 'flyerVY').value) > 0, 'Up did not overcome cave gravity');
        assert.ok(Number(value(lift, 'fuel').value) < beforeFuel, 'thrust did not consume fuel');
        assert.equal(Number(value(lift, 'rings').value), 0, 'run began with phantom rings');
        assert.equal(Number(value(lift, 'hearts').value), 3, 'run began with damaged health');
    } finally { lift.quit(); clearStrayTimers(); }
});

test('new pseudocode games compile cleanly into substantial Scratch projects', () => {
    assert.deepEqual(Object.keys(games), EXPECTED);
    for (const [name, source] of Object.entries(games)) {
        const creator = new SB3Creator();
        const project = creator.parse(source);
        const targets = project.targets.filter(target => !target.isStage);
        const blocks = project.targets.flatMap(target => Object.values(target.blocks || {}));
        const hats = blocks.filter(block => block.topLevel);

        assert.deepEqual(creator.errors, [], `${name}: compiler errors`);
        assert.deepEqual(creator.warnings, [], `${name}: compiler warnings`);
        assert.ok(targets.length >= 1, `${name}: no playable sprite`);
        assert.ok(blocks.length >= 70, `${name}: unexpectedly thin game (${blocks.length} blocks)`);
        assert.ok(hats.some(block => block.opcode === 'event_whenflagclicked'),
            `${name}: green flag cannot start the game`);
        assert.ok(blocks.some(block => block.opcode.startsWith('control_')),
            `${name}: no game loop/control flow`);
        assert.ok(blocks.some(block => block.opcode.startsWith('sensing_') ||
            block.opcode === 'event_whenkeypressed' || block.opcode === 'event_whenthisspriteclicked'),
            `${name}: no player interaction or collision sensing`);
    }
});

test('each new game keeps its signature playable mechanic', () => {
    const contracts = {
        sigil_grid: [/LIST board/, /DEFINE find tactic for \(mark\):/, /find tactic for 2/,
            /find tactic for 1/, /item 5 of board = 0/, /DEFINE place at \(r\) \(c\):/,
            /broadcast "sigil duel finished"/],
        vector_seven: [/set playerX to mouse x/, /set hitOffset to \(ballX - playerX\) \/ 11/,
            /IF \(rally mod 4\) = 0/, /change playerScore by 2/, /IF playerScore = 7/,
            /IF rivalScore = 7/, /broadcast "vector match over"/],
        reactor_ricochet: [/set cells to 20/, /LOCAL armour/, /IF armour = 2/,
            /broadcast "drop capacitor"/, /set wideTime to 8/, /broadcast "split reactor pulse"/,
            /IF cells = 0/, /change lives by -1/],
        flux_vault: [/LIST terrain/, /LIST crates/, /DEFINE FAST try move \(step\):/,
            /item beyondCell of terrain = 2\) and occupied = 0/, /replace item crateAt of crates/,
            /IF docked = 3/, /IF level = 4/, /broadcast "flux vault solved"/],
        neon_circuit: [/LIST nodes/, /DEFINE FAST flip cross \(index\):/, /flip one \(index - 5\)/,
            /flip one \(index \+ 5\)/, /IF lit = 0/, /IF level = 4/,
            /broadcast "neon circuit solved"/],
        canal_command: [/IF faults = 3/, /lowerGate = 0 and upperGate = 0/,
            /IF water = 1 and lowerGate = 0 and boatZone = 1/, /IF boats = 4/,
            /broadcast "canal command won"/],
        sky_skim: [/SHAPE art skyline-swoop\/bird/, /BACKDROP intro art skyline-swoop\/intro/,
            /touching Hill/, /key down arrow pressed\?/, /set vy to \(abs of vy\) \+ 5/,
            /change launches by 1/, /IF launches = 12 THEN:/],
        chroma_code: [/GLOBAL LIST secret/, /set exact to 0/, /set near to 0/,
            /WHEN sprite clicked:/, /add gemValue to guess/],
        fusion_foundry: [/LIST grid/, /change level by 1/, /change score by level \* chain \* 10/],
        missile_ballet: [/point towards Jet/, /IF touching Rocket/, /set shield to 1/,
            /change missiles by 1/, /IF missiles > 23 THEN:/],
        orbit_ward: [/sin of angle/, /cos of angle/, /REPEAT 8/, /IF touching Shield/],
        rooftop_relay: [/set vy to 12/, /switch costume to slide/, /set overdrive to 0/,
            /change rooftops by 1/, /IF rooftops = 30 THEN:/],
        twinwall: [/SPRITE LeftWall/, /SPRITE RightWall/, /set bricks to 24/, /change score by rally/],
        turbo_chicane: [/touching Rival/, /touching Draft/, /touching Gate/, /change checkpoints by 1/],
        abyss_rescue: [/change vy by 0.65/, /sin of timer/, /touching Sub/, /broadcast "diver rescued"/],
        specter_sweep: [/if on edge bounce/, /touching Orb/, /set ward to 3/, /change score by 1/],
        moonlight_heist: [/touching Tunnel/, /point towards Mouse/, /broadcast "new cheese"/,
            /distance to Tunnel > 80/, /broadcast "pantry over"/],
        cloud_court: [/set rally to 1/, /touching Net/, /set bx to 226/, /abs of \(bx - px\)/,
            /SPRITE CloudBot/, /broadcast "nimbus match over"/],
        ember_dojo: [/broadcast "moon parry"/, /touching Ronin/, /set parrying to 1/, /change dragonHP by -1/],
        lockstep_lagoon: [/set surge to 3/, /change charge by 25/, /change gates by 1/, /change score by 15/],
        rink_riot: [/set vx to vx \* 0\.94/, /point in direction 90 - vy \* 5/, /touching Keeper/, /change goals by 1/],
        rim_reactor: [/set ballVY to charge/, /change ballVY by -0\.55/, /touching Net/, /change score by 2 \* streak/],
        comet_cup: [/set ballSpeed to ballSpeed \* 0\.97/, /turn right runY \* -3 degrees/, /change goals by 1/, /change score by crowd \* 10/],
        trench_signal: [/change rise by 0\.08/, /broadcast "sonar pulse"/, /distance to Sub < 150/, /set mineStun to 0\.7/, /change pearls by 1/],
        whisker_switch: [/set hidden to 1/, /change scent by 3/, /change banked by cargo/, /set targetHole to -1/, /point towards Pip/],
        spiral_circuit: [/set boosting to 1/, /change charge by 4/, /change score by 25/, /change sectors by 1/, /set lane to -2/],
        lilyway_rescue: [/WHEN up arrow key pressed:/, /touching CarA or touching CarB/, /set riding to 1/, /change crossings by 1/, /IF crossings = 3/],
        rotor_rogue: [/set wind to sin of distance \* speed \/ 8/, /change lift by -0\.7/, /IF abs of tilt > 48/, /change fuel by 3/, /change distance by speed \/ 180/],
        prism_spire: [/IF \(abs of \(blockX - towerX\)\) < blockWidth/, /change blockWidth by 0 - \(abs of \(blockX - towerX\)\)/, /create clone of myself/, /IF level = 12/],
        shard_sheriff: [/set shardOn to 1/, /change shardVY by -0\.5/, /broadcast "fire lance"/, /set orbActive to 0/, /change waves by 1/],
        halo_foundry: [/set shieldX to sin of shieldAngle \* 205/, /set shieldY to cos of shieldAngle \* 150/, /change locks by -1/, /broadcast "restore locks"/, /IF round = 3/],
        corridor_kestrel: [/set driftX to driftX \* 0\.92/, /touching UpperGate or touching LowerGate/, /change battery by 4/, /set shield to 1/, /change gates by 1/],
        thunder_volley: [/change playerVY by -0\.75/, /set ballVX to 8 \+ rally \/ 3/, /change rivalPoints by 1/, /touching ThunderNet/],
        cascade_pair: [/LIST colA/, /add colorA to colA/, /set falls to length of colA/, /delete falls of colA/, /change score by 40 \* combo/],
        mooncoil_odyssey: [/LIST trailX/, /add headX to trailX/, /headX = item i of trailX/, /delete 1 of trailX/, /change snakeLength by 1/],
        cinder_thrust: [/change flyerVY by -0\.42/, /key up arrow pressed\? and fuel > 0/, /touching ChargeLedge/, /change caveSpeed by 0\.12/]
    };
    for (const [name, patterns] of Object.entries(contracts)) {
        for (const pattern of patterns) assert.match(games[name], pattern, `${name}: missing ${pattern}`);
    }
});

test('each new game packages, loads, and starts in the real Scratch VM', async () => {
    for (const [name, source] of Object.entries(games)) {
        const run = await runProgram(source, {frames: 16});
        assert.ok(run.blockCount >= 70, `${name}: blocks were lost during SB3 load`);
        assert.ok(run.threadsStarted > 0, `${name}: green flag started no scripts`);
        assert.deepEqual(run.errors, [], `${name}: Scratch VM block errors`);
        assert.ok(run.variablesChanged > 0, `${name}: startup computed no state changes`);
    }
});
