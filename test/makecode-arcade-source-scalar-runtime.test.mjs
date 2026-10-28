import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import JSZip from 'jszip';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {VM, SB3Creator as BundledCreator, stepFrames, clearStrayTimers, INTEGRATED} from './helpers/bw-vm.mjs';
import {loadExtensionClass, bundledExtensionIds} from './helpers/bw-extensions.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {compile} from '../scripts/lib/pxt-node.mjs';
import {createArcadeDiscreteTimers} from './helpers/arcade-discrete-timers.mjs';
const require = createRequire(import.meta.url);
const Creator = process.env.SB3_CREATOR_DIR ? (await import(pathToFileURL(path.join(process.env.SB3_CREATOR_DIR, 'src/utils/sb3Creator.js')).href)).default : BundledCreator;
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
    const Storage=require(path.join(INTEGRATED,'node_modules/scratch-storage/dist/node/scratch-storage.js'));
    vm.attachStorage(new Storage());
    await vm.loadProject(buffer);
    const clock = createArcadeDiscreteTimers(); vm.runtime.bwArcadeProgramClock = clock;
    vm.runtime.updateCurrentMSecs = () => {vm.runtime.currentMSecs = clock.now();};
    vm.runtime.bwArcadeFrameAuthority = 'manual'; vm.start(); vm.greenFlag(); vm.quit();
    for (let time = 0; time <= 60; time += 20) {await clock.advanceTo(time); await stepFrames(vm, 1, 20);}
    return {vm, clock, errors, observed: Object.fromEntries(vm.runtime.targets.flatMap(target => Object.values(target.variables)).map(variable => [variable.name, values.decode(variable.value)]))};
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

test('selected original scalar defaults and undefined increment survive export without weakening Boolean types', async () => {
    const source = `function readUndefined(){return lateBoolean===undefined}
function readFalse(){return lateBoolean===false}
let beforeUndefined=readUndefined()
let beforeFalse=readFalse()
let lateBoolean:boolean
let declaredUndefined=lateBoolean===undefined
lateBoolean=false
let afterFalse=lateBoolean===false
let count:number
count++
let countIsNaN=count!==count`;
    const original = await runPxtArcade(source,{fakeClock:true});
    const imported = arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
    assert.match(imported.code,/declare arcade source scalar lateBoolean as Boolean/);
    assert.doesNotMatch(imported.code,/set lateBoolean to \(0\)/);
    const creator = new Creator();creator.parse(imported.code);assert.deepEqual(creator.warnings,[]);
    const exported = projectToArcade(creator.project);assert.deepEqual(exported.unsupported,[]);
    assert.match(exported.ts,/let lateBoolean: boolean(?:\n|\r)/);
    assert.doesNotMatch(exported.ts,/let lateBoolean: any|let lateBoolean: number/);
    const originalExport = await runPxtArcade(exported.files,{fakeClock:true});
    const expected = {beforeUndefined:true,beforeFalse:false,declaredUndefined:true,afterFalse:true,countIsNaN:true};
    const reimport = arcadeToPseudocode(exported.files);assert.deepEqual(reimport.unsupported,[]);
    const again = new Creator();again.parse(reimport.code);assert.deepEqual(again.warnings,[]);
    for (const candidate of [creator,again]) {
        const result = await execute(Buffer.from(await(await candidate.generateSB3()).arrayBuffer()));
        try {assert.deepEqual(result.errors,[]);for(const [name,value]of Object.entries(expected)){assert.equal(original[name],value,name);assert.equal(originalExport[name],value,name);assert.equal(result.observed[name],value,name);}}
        finally{result.vm.stopAll();result.vm.quit();clearStrayTimers();}
    }
    for(const suffix of ['let wrong=[1][lateBoolean]','function numberOnly(value:number){};numberOnly(lateBoolean)']) {
        const files={...exported.files,'main.ts':exported.ts+'\n'+suffix};
        const rejected=await compile('arcade',files);assert.equal(rejected.success,false,'Boolean cells must retain original numeric typing rejection');
    }
});

test('real Blockly variable rename and project replacement retain IDs without changing ordinary saved values', async () => {
    const creator = new Creator();creator.parse(code.replace('GLOBAL lateBoolean','GLOBAL ordinarySaved\nGLOBAL lateBoolean'));
    const stage = creator.project.targets.find(target=>target.isStage);
    const [savedId,saved] = Object.entries(stage.variables).find(([,variable])=>variable[0]==='ordinarySaved');saved[1]=17;
    const result = await execute(Buffer.from(await(await creator.generateSB3()).arrayBuffer()));
    try {
        const liveStage = result.vm.runtime.getTargetForStage();
        assert.equal(liveStage.lookupVariableById(savedId).value,17);
        const variable = liveStage.lookupVariableByNameAndType('lateBoolean','');
        const id = variable.id;
        result.vm.blockListener({type:'var_rename',varId:id,newName:'renamedBoolean'});
        assert.equal(variable.name,'renamedBoolean');
        result.vm.stopAll();result.vm.greenFlag();result.vm.quit();
        assert.equal(values.decode(variable.value),undefined);
        assert.equal(liveStage.lookupVariableById(savedId).value,17);
        for(let time=80;time<=140;time+=20){await result.clock.advanceTo(time);await stepFrames(result.vm,1,20);}
        assert.equal(variable.value,false);
        const buffer = Buffer.from(await(await result.vm.saveProjectSb3()).arrayBuffer());
        const zip=await JSZip.loadAsync(buffer),savedCreator=new Creator();
        savedCreator.project=JSON.parse(await zip.file('project.json').async('text'));
        assert.match(savedCreator.decompile(),/declare arcade source scalar renamedBoolean as Boolean/);
        const fromRenamedCode=new Creator();fromRenamedCode.parse(savedCreator.decompile());
        assert.deepEqual(fromRenamedCode.warnings,[]);
        assert.equal(fromRenamedCode.decompile(),savedCreator.decompile());
        result.vm.stopAll();await result.vm.loadProject(buffer);
        assert.notEqual(result.vm.runtime.getTargetForStage().lookupVariableById(id),variable);
        const clock = createArcadeDiscreteTimers();result.vm.runtime.bwArcadeProgramClock=clock;
        result.vm.runtime.updateCurrentMSecs=()=>{result.vm.runtime.currentMSecs=clock.now();};
        result.vm.greenFlag();result.vm.quit();
        assert.equal(values.decode(result.vm.runtime.getTargetForStage().lookupVariableById(id).value),undefined);
        assert.equal(result.vm.runtime.getTargetForStage().lookupVariableById(savedId).value,17);
        assert.deepEqual(result.errors,[]);
    } finally {result.vm.stopAll();result.vm.quit();clearStrayTimers();}
});

test('constructor and registered creation callback read the source cell before its later initializer', async () => {
    // Independently authored fixture; the selected original execution establishes
    // undefined reads in both callbacks and constructors before the declaration.
    const source=`let constructorUndefined=false
let constructorFalse=false
let callbackUndefined=false
let callbackFalse=false
let callbackCount=0
class Probe {
    constructor(){constructorUndefined=lateBoolean===undefined;constructorFalse=lateBoolean===false}
}
let probe=new Probe()
sprites.onCreated(SpriteKind.Player,function(sprite){
    callbackCount++
    callbackUndefined=lateBoolean===undefined
    callbackFalse=lateBoolean===false
})
let actor=sprites.create(img\`1\`,SpriteKind.Player)
pause(20)
let lateBoolean=false
let afterFalse=lateBoolean===false
`;
    const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
    const creator=new Creator();creator.parse(imported.code);assert.deepEqual(creator.warnings,[]);
    for(const upload of imported.costumes || [])creator.addCustomSVGCostume(upload.sprite,upload.svg,upload.name);
    const result=await execute(Buffer.from(await(await creator.generateSB3()).arrayBuffer()));
    try {
        assert.deepEqual(result.errors,[]);
        const expected={constructorUndefined:true,constructorFalse:false,callbackUndefined:true,callbackFalse:false,callbackCount:1,afterFalse:true};
        for(const [name,value]of Object.entries(expected))assert.equal(result.observed[name],value,name);
    } finally {result.vm.stopAll();result.vm.quit();clearStrayTimers();}
});
