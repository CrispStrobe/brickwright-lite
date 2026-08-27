import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

import SB3Creator from '../packages/scratch-gui/src/lib/sb3-creator.js';
import games from '../overlay/scratch-gui/src/lib/sb3-creator-game-examples.js';
import {VM, clearStrayTimers, runProgram, quitStrandedVMs} from './helpers/bw-vm.mjs';

const EXPECTED = [
    'g2048',
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
        assert.match(source, /WHEN flag clicked:\n    wait 0\.6 seconds\n    broadcast "__brickwright_start_from_flag"/,
            `${name}: green flag still leaves the title screen waiting for a keyboard`);
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
    const stage = project.targets.find(target => target.isStage);
    assert.deepEqual(stage.costumes.map(costume => costume.name), ['backdrop1', 'intro', 'trench']);
    const svgs = [...creator.assets.values()].filter(asset => asset.type === 'svg').map(asset => asset.data);
    assert.ok(svgs.some(svg => svg.includes('ECHO TRENCH')));
    assert.ok(svgs.some(svg => svg.includes('RECOVER 3 SIGNAL PEARLS')));
    assert.ok(svgs.some(svg => svg.includes('1.2 SECOND RECHARGE')));
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
    const load = async (source, pressSpace = true) => {
        const creator = new SB3Creator();
        creator.parse(source);
        const buffer = Buffer.from(await (await creator.generateSB3()).arrayBuffer());
        const vm = new VM();
        await vm.loadProject(buffer);
        vm.start();
        vm.greenFlag();
        for (let i = 0; i < 20; i++) vm.runtime._step();
        if (pressSpace) {
            vm.postIOData('keyboard', {key: ' ', isDown: true});
            for (let i = 0; i < 30; i++) vm.runtime._step();
            vm.postIOData('keyboard', {key: ' ', isDown: false});
        }
        return vm;
    };
    const stageValue = (vm, name) => Object.values(vm.runtime.getTargetForStage().variables)
        .find(variable => variable.name === name);

    const nova = await load(games.g2048, false);
    try {
        await new Promise(resolve => setTimeout(resolve, 700));
        for (let i = 0; i < 30; i++) nova.runtime._step();
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
        moonlight_heist: [/touching Tunnel/, /point towards Mouse/, /broadcast "new cheese"/],
        cloud_court: [/set rally to 1/, /touching Net/, /SPRITE CloudBot/],
        ember_dojo: [/broadcast "moon parry"/, /touching Ronin/, /set parrying to 1/, /change dragonHP by -1/],
        lockstep_lagoon: [/set surge to 3/, /change charge by 25/, /change gates by 1/, /change score by 15/],
        rink_riot: [/set vx to vx \* 0\.94/, /point in direction 90 - vy \* 5/, /touching Keeper/, /change goals by 1/],
        rim_reactor: [/set ballVY to charge/, /change ballVY by -0\.55/, /touching Net/, /change score by 2 \* streak/],
        comet_cup: [/set ballSpeed to ballSpeed \* 0\.97/, /turn right runY \* -3 degrees/, /change goals by 1/, /change score by crowd \* 10/],
        trench_signal: [/change rise by 0\.08/, /broadcast "sonar pulse"/, /touching SonarRing/, /set pulseReady to 0/, /change pearls by 1/],
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
