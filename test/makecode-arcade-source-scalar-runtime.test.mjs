import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {VM, stepFrames, clearStrayTimers, INTEGRATED} from './helpers/bw-vm.mjs';
import {loadExtensionClass, bundledExtensionIds} from './helpers/bw-extensions.mjs';
import {createArcadeDiscreteTimers} from './helpers/arcade-discrete-timers.mjs';
const require = createRequire(import.meta.url);
const Creator = (await import(pathToFileURL(path.join(process.env.SB3_CREATOR_DIR, 'src/utils/sb3Creator.js')).href)).default;
const values = require(path.join(INTEGRATED, 'node_modules/scratch-vm/src/util/bw-values.js'));
const code = `DEVICE ARCADE
GLOBAL lateBoolean
GLOBAL beforeUndefined
GLOBAL beforeFalse
GLOBAL afterFalse
SPRITE Game:
WHEN arcade source starts:
  declare arcade source scalar lateBoolean as Boolean
  declare arcade source scalar beforeUndefined as Boolean
  declare arcade source scalar beforeFalse as Boolean
  declare arcade source scalar afterFalse as Boolean
  set beforeUndefined to (compare value lateBoolean op "===" with (undefined value))
  set beforeFalse to (compare value lateBoolean op "===" with (compare value 1 op "<" with 0))
  wait 0.02 seconds
  set lateBoolean to (compare value 1 op "<" with 0)
  set afterFalse to (compare value lateBoolean op "===" with (compare value 1 op "<" with 0))`;
async function execute(buffer) {
    const vm = new VM(), ids = bundledExtensionIds(), manager = vm.extensionManager;
    const load = manager.loadExtensionURL.bind(manager), errors = [];
    manager.loadExtensionURL = id => {
        if (!ids.has(id)) return load(id);
        if (!manager.isExtensionLoaded(id)) {
            manager._loadedExtensions.set(id, manager._registerInternalExtension(new (loadExtensionClass(ids.get(id)))(vm.runtime)));
        }
        return Promise.resolve();
    };
    vm.runtime.on('BLOCKS_ERROR', error => errors.push(String(error)));
    await vm.loadProject(buffer);
    const clock = createArcadeDiscreteTimers(); vm.runtime.bwArcadeProgramClock = clock;
    vm.runtime.updateCurrentMSecs = () => {vm.runtime.currentMSecs = clock.now();};
    vm.runtime.bwArcadeFrameAuthority = 'manual'; vm.start(); vm.greenFlag(); vm.quit();
    for (let time = 0; time <= 60; time += 20) {await clock.advanceTo(time); await stepFrames(vm, 1, 20);}
    return {vm, errors, observed: Object.fromEntries(vm.runtime.targets.flatMap(target => Object.values(target.variables)).map(variable => [variable.name, values.decode(variable.value)]))};
}
test('source scalar prelude and real initializer survive Code and fresh VM load', async () => {
    const creator = new Creator(); creator.parse(code); assert.deepEqual(creator.warnings, []);
    const again = new Creator(); again.parse(creator.decompile()); assert.deepEqual(again.warnings, []);
    assert.equal(again.decompile(), creator.decompile());
    for (const candidate of [creator, again]) {
        const result = await execute(Buffer.from(await (await candidate.generateSB3()).arrayBuffer()));
        try {
            assert.deepEqual(result.errors, []);
            for (const [name, expected] of Object.entries({beforeUndefined: true, beforeFalse: false, afterFalse: true, lateBoolean: false})) assert.equal(result.observed[name], expected, name);
            result.vm.stopAll(); result.vm.greenFlag(); result.vm.quit();
            assert.equal(values.decode(result.vm.runtime.getTargetForStage().lookupVariableByNameAndType('lateBoolean', '').value), undefined);
        } finally {result.vm.quit(); clearStrayTimers();}
    }
});
