import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {patchExtensionPrimitiveCaches} from '../scripts/lib/extension-primitive-cache-hooks.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runArcadeSourceCode} from './helpers/arcade-source-program.mjs';
import {INTEGRATED, stepFrames, clearStrayTimers} from './helpers/bw-vm.mjs';

const values = run => Object.fromEntries(run.vm.runtime.targets.flatMap(target =>
    Object.values(target.variables)).map(variable => [variable.name, variable.value]));
const load = async source => {
    const imported = arcadeToPseudocode(source);
    assert.deepEqual(imported.unsupported, []);
    return runArcadeSourceCode(imported.code, {frames: 12});
};

test('extension cache integration is idempotent and refuses an unknown runtime layout', () => {
    const source = readFileSync(`${INTEGRATED}/node_modules/scratch-vm/src/engine/runtime.js`, 'utf8');
    assert.equal(patchExtensionPrimitiveCaches(source), source);
    assert.throws(() => patchExtensionPrimitiveCaches('class Runtime {}'), /anchor missing or ambiguous/);
});

test('actual extension refresh retires executable wrappers before notification and restart', async () => {
    let run;
    try {
        run = await load('function twice(value:number){return value+value}let result=twice(7);let inspected=console.inspect(result);');
        assert.equal(values(run).result, 14);
        assert.equal(values(run).inspected, '14');
        assert.deepEqual(run.errors, []);
        run.vm.stopAll();
        const runtime = run.vm.runtime;
        const oldFunction = runtime.getOpcodeFunction('arcade_returnValue');
        const containers = [...runtime.targets.map(target => target.blocks), runtime.flyoutBlocks, runtime.monitorBlocks];
        const oldCaches = containers.map(container => container._cache._executeCached);
        assert.ok(oldCaches.some(cache => Object.keys(cache).length));
        let notifications = 0;
        const inspect = () => {
            notifications++;
            for (const [index, container] of containers.entries()) {
                assert.notEqual(container._cache._executeCached, oldCaches[index]);
                assert.deepEqual(Object.keys(container._cache._executeCached), []);
            }
        };
        runtime.on('BLOCKSINFO_UPDATE', inspect);
        await run.vm.extensionManager.refreshBlocks({throwOnError: true});
        runtime.off('BLOCKSINFO_UPDATE', inspect);
        assert.ok(notifications > 0);
        assert.notEqual(runtime.getOpcodeFunction('arcade_returnValue'), oldFunction);
        run.vm.greenFlag();
        await stepFrames(run.vm, 12, 20);
        assert.equal(values(run).result, 14);
        assert.equal(values(run).inspected, '14');
        assert.deepEqual(run.errors, []);
    } finally {
        if (run) { run.vm.stopAll(); run.vm.quit(); }
        clearStrayTimers();
    }
});

test('refresh during an active Arcade update preserves running state and managed results', async () => {
    let run;
    try {
        run = await load('let count=0;let inspected="";function twice(value:number){return value+value}game.onUpdate(function(){count++;inspected=console.inspect(twice(count));});');
        const check = () => {
            const current = values(run);
            assert.ok(current.count > 0);
            assert.equal(current.inspected, String(current.count * 2));
            assert.deepEqual(run.errors, []);
            return current.count;
        };
        let previous = check();
        for (let index = 0; index < 3; index++) {
            await run.vm.extensionManager.refreshBlocks({throwOnError: true});
            await stepFrames(run.vm, 6, 20);
            const next = check();
            assert.ok(next > previous);
            previous = next;
        }
    } finally {
        if (run) { run.vm.stopAll(); run.vm.quit(); }
        clearStrayTimers();
    }
});
