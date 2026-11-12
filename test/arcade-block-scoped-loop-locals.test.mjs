import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram, stepFrames, clearStrayTimers} from './helpers/bw-vm.mjs';
import {createArcadeDiscreteTimers} from './helpers/arcade-discrete-timers.mjs';
import SB3Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';

// Block-scoped `let` counters of different callbacks are different variables in PXT, and none of them is the program's own
// `index`. Each callback run owns its counter (an Arcade local), so concurrently paused loops cannot corrupt one another.
const SOURCE = `let index = 0
let first = 0
let second = 0
game.onUpdate(function () {
    index += 1
})
controller.A.onEvent(ControllerButtonEvent.Pressed, function () {
    for (let index = 0; index <= 2; index++) {
        pause(40)
        first += 1
    }
})
controller.B.onEvent(ControllerButtonEvent.Pressed, function () {
    for (let index = 0; index <= 4; index++) {
        pause(25)
        second += 1
    }
})
`;
const exportOf = imported => {
    const creator = new SB3Creator();
    creator.parse(imported.code);
    return projectToArcade(creator.project, {costumeSvg: (target, costume) => creator.assets.get(costume.assetId)?.data});
};

test('each callback counter is a local of its own run, not the program variable of that name', () => {
    const imported = arcadeToPseudocode(SOURCE);
    assert.deepEqual(imported.unsupported, []);
    const handlers = imported.code.split(/\n(?=WHEN )/).filter(part => /button handler/.test(part));
    assert.equal(handlers.length, 2);
    for (const handler of handlers) {
        assert.match(handler, /arcade set local index to/);
        assert.doesNotMatch(handler, /^\s*set index to/m, 'the counter is never written as the shared variable');
        assert.match(handler, /compare value \(arcade local index\)/);
    }
    assert.match(imported.code, /^WHEN arcade update handler[^\n]*\n\s+set index to/m);
});

test('the exporter restores the original name as a local of each callback and keeps the global', () => {
    const exported = exportOf(arcadeToPseudocode(SOURCE));
    assert.deepEqual(exported.unsupported, []);
    const text = exported.files['main.ts'];
    assert.equal((text.match(/^let index: number$/gm) || []).length, 1, 'one program variable');
    assert.equal((text.match(/^\s+let index: number = 0$/gm) || []).length, 2, 'one local per callback');
    for (const handler of text.split('controller.').slice(1)) {
        assert.doesNotMatch(handler.split('game.')[0], /_\d|index\d/);
    }
});

test('a counter the body never reads is still the run\'s own local', () => {
    const imported = arcadeToPseudocode(`let n = 0
let i = 0
controller.A.onEvent(ControllerButtonEvent.Pressed, function () {
    for (let i = 0; i < 3; i++) {
        n += 1
    }
})
`);
    assert.deepEqual(imported.unsupported, []);
    const handler = imported.code.split(/\n(?=WHEN )/).find(part => /button handler/.test(part));
    assert.match(handler, /arcade set local i to/);
    assert.doesNotMatch(handler, /^\s*set i to/m);
});

test('concurrent callbacks that share a counter name run their own loops to the end', async () => {
    const imported = arcadeToPseudocode(SOURCE.replace(/controller\.[AB]\.onEvent\(ControllerButtonEvent\.Pressed, function \(\) \{/g, 'forever(function () {')
        .replace(/(first \+= 1\n    \}|second \+= 1\n    \})/g, '$1\n    pause(100000)'));
    assert.deepEqual(imported.unsupported, []);
    const run = await runProgram(imported.code, {frames: 0, frameAuthority: 'timed'});
    const clock = createArcadeDiscreteTimers();
    try {
        run.vm.stopAll();
        run.vm.runtime.bwArcadeProgramClock = clock;
        run.vm.runtime.updateCurrentMSecs = () => { run.vm.runtime.currentMSecs = clock.now(); };
        run.vm.greenFlag();
        await stepFrames(run.vm, 1, 0);
        await clock.advanceTo(1000);
        const values = Object.fromEntries(run.vm.runtime.targets.flatMap(t => Object.values(t.variables))
            .map(v => [v.name.replace(/^Game_/, ''), v.value]));
        assert.equal(values.first, 3);
        assert.equal(values.second, 5);
        assert.deepEqual(run.errors, []);
    } finally {
        run.vm.stopAll();
        run.vm.quit();
        clearStrayTimers();
    }
});
