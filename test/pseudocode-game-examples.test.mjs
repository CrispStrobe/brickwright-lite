import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

import SB3Creator from '../packages/scratch-gui/src/lib/sb3-creator.js';
import games from '../overlay/scratch-gui/src/lib/sb3-creator-game-examples.js';
import {VM, clearStrayTimers, runProgram, quitStrandedVMs} from './helpers/bw-vm.mjs';

const EXPECTED = [
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
        'sky_skim', 'missile_ballet', 'orbit_ward', 'chroma_code', 'fusion_foundry', 'rooftop_relay'
    ]);
    for (const name of approved) {
        assert.match(importer, new RegExp(`\\['${name}',`), `${name}: polished game is missing from the Games menu`);
    }
    for (const name of EXPECTED.filter(name => !approved.has(name))) {
        assert.doesNotMatch(importer, new RegExp(`\\['${name}',`), `${name}: unaudited prototype is public`);
    }
    assert.match(importer, /\.\.\.gameExamples/, 'game module is not merged into the gallery examples');
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
    assert.match(games.sky_skim, /GOAL:/);
    assert.match(games.sky_skim, /CONTROLS:/);
    assert.match(games.sky_skim, /WHEN space key pressed:/);
    const svgs = [...creator.assets.values()].filter(asset => asset.type === 'svg').map(asset => asset.data);
    assert.ok(svgs.some(svg => svg.includes('SKYLINE SWOOP')));
    assert.ok(svgs.some(svg => svg.includes('PRESS SPACE TO FLY')));
    assert.ok(svgs.some(svg => svg.includes('CLEAN DIVE = LAUNCH + COMBO')));
});

test('second quality-approved game explains and renders its collision strategy', () => {
    const creator = new SB3Creator();
    const project = creator.parse(games.missile_ballet);
    assert.deepEqual(creator.errors, []);
    assert.deepEqual(creator.warnings, []);
    assert.match(games.missile_ballet, /GOAL: cross the paths of homing missiles/);
    assert.match(games.missile_ballet, /CONTROLS: move the mouse to steer/);
    assert.match(games.missile_ballet, /WHEN space key pressed:/);
    const stage = project.targets.find(target => target.isStage);
    assert.deepEqual(stage.costumes.map(costume => costume.name), ['backdrop1', 'intro', 'scramble']);
    const svgs = [...creator.assets.values()].filter(asset => asset.type === 'svg').map(asset => asset.data);
    assert.ok(svgs.some(svg => svg.includes('CONTRAIL PANIC')));
    assert.ok(svgs.some(svg => svg.includes('MAKE THE HOMING MISSILES HIT EACH OTHER')));
    assert.ok(svgs.some(svg => svg.includes('CROSS THEIR PATHS')));
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

test('Neon Relay teaches distinct jump and slide hazards and gates the run', () => {
    const creator = new SB3Creator();
    const project = creator.parse(games.rooftop_relay);
    assert.deepEqual(creator.errors, []);
    assert.deepEqual(creator.warnings, []);
    assert.match(games.rooftop_relay, /GOAL: survive as long as possible/);
    assert.match(games.rooftop_relay, /CONTROLS: Up jumps, Down slides/);
    assert.match(games.rooftop_relay, /broadcast "start neon relay"/);
    assert.match(games.rooftop_relay, /go to x: 250 y: -96/);
    const stage = project.targets.find(target => target.isStage);
    const runner = project.targets.find(target => target.name === 'Runner');
    assert.deepEqual(stage.costumes.map(costume => costume.name), ['backdrop1', 'intro', 'skyline']);
    assert.ok(runner.costumes.some(costume => costume.name === 'slide'));
    const svgs = [...creator.assets.values()].filter(asset => asset.type === 'svg').map(asset => asset.data);
    assert.ok(svgs.some(svg => svg.includes('NEON RELAY')));
    assert.ok(svgs.some(svg => svg.includes('JUMP OVER RED VENTS')));
    assert.ok(svgs.some(svg => svg.includes('ORANGE DRONE = SLIDE')));
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
    const stageValue = (vm, name) => Object.values(vm.runtime.getTargetForStage().variables)
        .find(variable => variable.name === name);

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
            /touching Hill/, /key down arrow pressed\?/, /set vy to \(abs of vy\) \+ 5/],
        chroma_code: [/GLOBAL LIST secret/, /set exact to 0/, /set near to 0/,
            /WHEN sprite clicked:/, /add gemValue to guess/],
        fusion_foundry: [/LIST grid/, /change level by 1/, /change score by level \* chain \* 10/],
        missile_ballet: [/point towards Jet/, /IF touching Rocket/, /set shield to 1/],
        orbit_ward: [/sin of angle/, /cos of angle/, /REPEAT 8/, /IF touching Shield/],
        rooftop_relay: [/set vy to 12/, /switch costume to slide/, /set overdrive to 0/],
        twinwall: [/SPRITE LeftWall/, /SPRITE RightWall/, /set bricks to 24/, /change score by rally/],
        turbo_chicane: [/touching Rival/, /touching Oil/, /change fuel by 18/],
        abyss_rescue: [/change vy by 0.65/, /sin of timer/, /touching Diver/],
        specter_sweep: [/if on edge bounce/, /touching Ghost/, /set ward to 3/],
        moonlight_heist: [/touching Tunnel/, /point towards Mouse/, /broadcast "new cheese"/],
        cloud_court: [/set rally to 1/, /touching Net/, /SPRITE CloudBot/],
        ember_dojo: [/broadcast "swing"/, /touching Blade/, /change dragonHP by -1/],
        lockstep_lagoon: [/set surge to 3/, /change timeLeft by 4/, /change score by 5 \* surge/],
        rink_riot: [/set vx to vx \* 0\.94/, /key space pressed\?/, /touching Keeper/, /change goals by 1/],
        rim_reactor: [/set ballVY to charge/, /change ballVY by -0\.55/, /change score by 2 \* streak/],
        comet_cup: [/set ballSpeed to ballSpeed \* 0\.97/, /turn right runY \* -3 degrees/, /change goals by crowd/],
        trench_signal: [/change rise by 0\.08/, /broadcast "sonar pulse"/, /touching SonarRing/, /change pearls by 1/],
        whisker_switch: [/set hidden to 1/, /change scent by 3/, /point towards Pip/, /change lives by -1/],
        spiral_circuit: [/set boosting to 1/, /change charge by 4/, /change score by 25/, /set lane to -2/],
        lilyway_rescue: [/WHEN up arrow key pressed:/, /touching CarA or touching CarB/, /set riding to 1/, /change crossings by 1/],
        rotor_rogue: [/set wind to sin of score \* speed \/ 8/, /change lift by -0\.7/, /IF abs of tilt > 48/, /change fuel by 3/],
        prism_spire: [/IF \(abs of \(blockX - towerX\)\) < blockWidth/, /change blockWidth by 0 - \(abs of \(blockX - towerX\)\)/, /create clone of myself/, /change score by 5 \* perfect/],
        shard_sheriff: [/set shardOn to 1/, /change shardVY by -0\.5/, /broadcast "fire lance"/, /change orbTier by -1/],
        halo_foundry: [/set shieldX to sin of shieldAngle \* 205/, /set shieldY to cos of shieldAngle \* 150/, /change locks by -1/, /broadcast "restore locks"/],
        corridor_kestrel: [/set driftX to driftX \* 0\.92/, /touching UpperGate or touching LowerGate/, /change battery by 4/, /set shield to 1/],
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
