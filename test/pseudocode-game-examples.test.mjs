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
        'sky_skim', 'missile_ballet', 'orbit_ward', 'chroma_code', 'fusion_foundry', 'rooftop_relay',
        'twinwall', 'turbo_chicane', 'abyss_rescue', 'specter_sweep', 'moonlight_heist', 'cloud_court',
        'ember_dojo', 'lockstep_lagoon', 'rink_riot', 'rim_reactor', 'comet_cup', 'trench_signal'
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

test('Rift Rally exposes its dual controls, crystals, and three-escape loss condition', () => {
    const creator = new SB3Creator();
    const project = creator.parse(games.twinwall);
    assert.deepEqual(creator.errors, []);
    assert.deepEqual(creator.warnings, []);
    assert.match(games.twinwall, /GOAL: break all 24 drifting crystals before the comet escapes three times/);
    assert.match(games.twinwall, /CONTROLS: W\/S move the cyan left paddle/);
    assert.match(games.twinwall, /change lives by -1/);
    assert.match(games.twinwall, /set vx to vx \* -1/);
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
        for (let i = 0; i < 12; i++) tidegate.runtime._step();
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
