import test from 'node:test';
import assert from 'node:assert/strict';
import {runTimedArcadeProgram,restartTimedArcadeRun} from './helpers/arcade-timed-native.mjs';
import {clearStrayTimers} from './helpers/bw-vm.mjs';
import BWValues from '../overlay/scratch-vm/src/util/bw-values.js';
import {importGuiDependency} from './helpers/bw-integrated.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {SB3Creator, projectOpcodes} from './helpers/bw-vm.mjs';
import {compile, hasRuntime} from '../scripts/lib/pxt-node.mjs';

test('Arcade splash with a subtitle survives Code, Blocks, and PXT export', async () => {
    const imported = arcadeToPseudocode('game.splash("Ready", "Press A")');
    assert.deepEqual(imported.unsupported, []);
    assert.match(imported.code, /arcade splash \(?"Ready"\)? subtitle \(?"Press A"\)?/);
    const creator = new SB3Creator();
    creator.parse(imported.code);
    assert.deepEqual(creator.warnings, []);
    assert.ok(projectOpcodes(creator.project).has('arcade_splash'));
    assert.match(creator.decompile(), /arcade splash \(?"Ready"\)? subtitle \(?"Press A"\)?/);
    const exported = projectToArcade(creator.project);
    assert.deepEqual(exported.unsupported, []);
    assert.match(exported.ts, /game\.splash\("Ready", "Press A"\)/);
    assert.doesNotMatch(exported.ts, /sprites\.create\(/);
    if (hasRuntime('arcade')) {
        const compiled = await compile('arcade', exported.files);
        assert.equal(compiled.success, true, JSON.stringify(compiled.diagnostics));
    }
});

test('Arcade splash waits for real controller dismissal before the next source dialog', async () => {
    const imported=arcadeToPseudocode('let first=0;let second=0;game.splash("First");first=1;game.splash("Second","Subtitle");second=1');
    assert.deepEqual(imported.unsupported,[]);
    const run=await runTimedArcadeProgram(imported.code,{milliseconds:0,storage:true,uploads:imported.costumes});
    const runtime=run.vm.runtime;
    const dispatch=(await importGuiDependency('scratch-vm/src/dispatch/central-dispatch.js')).default;
    const native=dispatch.services[run.vm.extensionManager._loadedExtensions.get('arcade')]._inst;
    assert.equal(native._runtime,runtime);
    const values=()=>Object.fromEntries(runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),BWValues.decode(v.value)]));
    const advance=()=>run.clock.advanceTo(run.clock.now()+60);
    // Production keyboard edges drive the registered native controller path.
    const edge=held=>run.vm.postIOData('keyboard',{key:' ',isDown:held});
    try {
        await advance();assert.equal(runtime.bwArcadeDialogOpen,true);assert.equal(values().first,0);assert.equal(values().second,0);
        assert.equal(native._nativeTextDialogs.length,1);assert.equal(native._nativeTextDialogs[0].title,'First');assert.equal(native._sceneStack.length,1);
        edge(false);await advance();edge(true);await advance();edge(false);await advance();
        assert.equal(values().first,1);assert.equal(values().second,0);assert.equal(runtime.bwArcadeDialogOpen,true);
        assert.equal(native._nativeTextDialogs.length,1);assert.equal(native._nativeTextDialogs[0].title,'Second');assert.equal(native._nativeTextDialogs[0].subtitle,'Subtitle');assert.equal(native._sceneStack.length,1);
        edge(true);await advance();edge(false);await advance();
        assert.equal(values().second,1);assert.equal(runtime.bwArcadeDialogOpen,false);assert.equal(native._nativeTextDialogs.length,0);assert.equal(native._sceneStack.length,0);assert.deepEqual(run.errors,[]);
    } finally {run.vm.stopAll();run.vm.quit();clearStrayTimers();}
});

test('Arcade long text keeps its layout through Code, Blocks, runtime, and PXT export', async () => {
    const imported = arcadeToPseudocode('game.showLongText("Read this", DialogLayout.Right)');
    assert.deepEqual(imported.unsupported, []);
    assert.match(imported.code, /arcade long text \(?"Read this"\)? layout "Right"/);
    const creator = new SB3Creator();
    creator.parse(imported.code);
    assert.deepEqual(creator.warnings, []);
    assert.ok(projectOpcodes(creator.project).has('arcade_showLongText'));
    assert.match(creator.decompile(), /arcade long text \(?"Read this"\)? layout "Right"/);
    const exported = projectToArcade(creator.project);
    assert.deepEqual(exported.unsupported, []);
    assert.match(exported.ts, /game\.showLongText\("Read this", DialogLayout\.Right\)/);
    if (hasRuntime('arcade')) {
        const compiled = await compile('arcade', exported.files);
        assert.equal(compiled.success, true, JSON.stringify(compiled.diagnostics));
    }
    const run=await runTimedArcadeProgram(arcadeToPseudocode('let done=0;game.showLongText("Read this",DialogLayout.Right);done=1').code,{milliseconds:0,storage:true});
    const runtime=run.vm.runtime;
    const dispatch=(await importGuiDependency('scratch-vm/src/dispatch/central-dispatch.js')).default;
    const native=dispatch.services[run.vm.extensionManager._loadedExtensions.get('arcade')]._inst;
    assert.equal(native._runtime,runtime);
    const advance=()=>run.clock.advanceTo(run.clock.now()+60);
    // Production keyboard edges drive the registered native controller path.
    const edge=held=>run.vm.postIOData('keyboard',{key:' ',isDown:held});
    const done=()=>BWValues.decode(runtime.targets.flatMap(t=>Object.values(t.variables)).find(v=>v.name.replace(/^Game_/,'')==='done')?.value);
    try {
        await advance();assert.equal(native._nativeTextDialogs[0].layout,'Right');assert.equal(done(),0);
        edge(false);await advance();edge(true);await advance();edge(false);await advance();
        assert.equal(done(),1);assert.equal(runtime.bwArcadeDialogOpen,false);assert.deepEqual(run.errors,[]);
    } finally {run.vm.stopAll();run.vm.quit();clearStrayTimers();}
});


test('concurrent source splash dialogs use actual scene ownership and Stop/restart cancels old continuations', async () => {
    const imported=arcadeToPseudocode('let first=0;let second=0;control.runInParallel(function(){game.splash("First");first=1});control.runInParallel(function(){game.splash("Second");second=1})');
    assert.deepEqual(imported.unsupported,[]);
    const run=await runTimedArcadeProgram(imported.code,{milliseconds:0,storage:true,uploads:imported.costumes});
    const runtime=run.vm.runtime;
    const dispatch=(await importGuiDependency('scratch-vm/src/dispatch/central-dispatch.js')).default;
    const native=dispatch.services[run.vm.extensionManager._loadedExtensions.get('arcade')]._inst;
    assert.equal(native._runtime,runtime);
    const values=()=>Object.fromEntries(runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),BWValues.decode(v.value)]));
    const advance=()=>run.clock.advanceTo(run.clock.now()+60);
    // Production keyboard edges drive the registered native controller path.
    const edge=held=>run.vm.postIOData('keyboard',{key:' ',isDown:held});
    const dismiss=async()=>{edge(false);await advance();edge(true);await advance();edge(false);await advance();};
    try {
        await advance();assert.equal(native._nativeTextDialogs.length,2);assert.equal(native._sceneStack.length,2);
        assert.deepEqual(native._nativeTextDialogs.map(dialog=>dialog.title).sort(),['First','Second']);
        assert.equal(values().first,0);assert.equal(values().second,0);
        // Concurrent native dialogs are scene-owned: dismiss the actual top scene, not a browser FIFO.
        const current=native._nativeTextDialogs.find(dialog=>dialog.owner===native._state());assert.ok(current);
        const firstClosed=current.title==='First'?'first':'second',stillBlocked=current.title==='First'?'second':'first';
        await dismiss();assert.equal(current.closed,true);assert.equal(values()[firstClosed],1);assert.equal(values()[stillBlocked],0);
        assert.equal(native._nativeTextDialogs.length,1);assert.equal(native._sceneStack.length,1);
        await dismiss();assert.equal(values().first,1);assert.equal(values().second,1);assert.equal(native._nativeTextDialogs.length,0);assert.equal(native._sceneStack.length,0);
        run.clock=await restartTimedArcadeRun(run,0);await advance();
        const old=native._nativeTextDialogs.slice();assert.equal(old.length,2);const oldState=native._state();
        run.vm.stopAll();await advance();assert.ok(old.every(dialog=>dialog.closed));assert.equal(native._nativeTextDialogs.length,0);assert.equal(native._userControllerEvents,true);
        assert.equal(values().first,0);assert.equal(values().second,0,'Stop cancels rather than executing the old source continuation');
        run.clock=await restartTimedArcadeRun(run,0);await advance();
        assert.equal(native._nativeTextDialogs.length,2);assert.notEqual(native._state(),oldState);
        assert.ok(native._nativeTextDialogs.every(dialog=>!old.includes(dialog)&&!old.some(previous=>previous.owner===dialog.owner)));
        assert.equal(values().first,0);assert.equal(values().second,0);assert.deepEqual(run.errors,[]);
    } finally {run.vm.stopAll();run.vm.quit();clearStrayTimers();}
});
