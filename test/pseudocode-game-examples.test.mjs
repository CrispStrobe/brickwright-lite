import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

import SB3Creator from '../packages/scratch-gui/src/lib/sb3-creator.js';
import games from '../overlay/scratch-gui/src/lib/sb3-creator-game-examples.js';
import {runProgram, quitStrandedVMs} from './helpers/bw-vm.mjs';

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
    'rotor_rogue'
];

test.after(() => quitStrandedVMs());

test('new games are wired into the visible examples gallery', () => {
    const importer = readFileSync(new URL(
        '../overlay/scratch-gui/src/components/tw-pseudocode/pseudocode-importer.jsx', import.meta.url), 'utf8');
    for (const [name, source] of Object.entries(games)) {
        assert.ok(source.length > 0, `${name}: empty game source`);
        assert.match(importer, new RegExp(`\\['${name}',`), `${name}: missing from the Games menu`);
    }
    assert.match(importer, /\.\.\.gameExamples/, 'game module is not merged into the gallery examples');
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
        sky_skim: [/touching Hill/, /key down arrow pressed\?/, /set vy to \(abs of vy\) \+ 5/],
        chroma_code: [/LIST secret/, /set exact to 0/, /set near to 0/, /REPEAT UNTIL turn > 8 or won = 1/],
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
        rotor_rogue: [/set wind to sin of score \* speed \/ 8/, /change lift by -0\.7/, /IF abs of tilt > 48/, /change fuel by 3/]
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
