import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import JSZip from 'jszip';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {VM, SB3Creator as BundledCreator, stepFrames, clearStrayTimers, INTEGRATED} from './helpers/bw-vm.mjs';
import {loadExtensionClass, bundledExtensionIds} from './helpers/bw-extensions.mjs';
import {createArcadeDiscreteTimers} from './helpers/arcade-discrete-timers.mjs';
const require = createRequire(import.meta.url);
const Creator = process.env.SB3_CREATOR_DIR ? (await import(pathToFileURL(path.join(process.env.SB3_CREATOR_DIR, 'src/utils/sb3Creator.js')).href)).default : BundledCreator;
const values = require(path.join(INTEGRATED, 'node_modules/scratch-vm/src/util/bw-values.js'));
const code = `DEVICE ARCADE
GLOBAL pending
GLOBAL before
GLOBAL pixel
GLOBAL saved
SPRITE Game:
WHEN arcade source starts:
  declare arcade source scalar before as Boolean
  declare arcade source scalar pixel as Number
  declare arcade source reference pending as "Image"
  set before to (compare value pending op "===" with (undefined value))
  wait 0.04 seconds
  set pending to (arcade new image width 1 height 1)
  arcade set image pixel pending x 0 y 0 color 3
  set pixel to (arcade image pixel pending x 0 y 0)`;
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

test('real source reference variable rename, Stop/restart and saved/fresh reload preserve identities and ordinary values',async()=>{
 const creator=new Creator();creator.parse(code);assert.deepEqual(creator.warnings,[]);
 const stage=creator.project.targets.find(t=>t.isStage);const [savedId,saved]=Object.entries(stage.variables).find(([,v])=>v[0]==='saved');saved[1]=17;
 const result=await execute(Buffer.from(await(await creator.generateSB3()).arrayBuffer()));
 try {
  assert.deepEqual(result.errors,[]);assert.equal(result.observed.before,true);assert.equal(result.observed.pixel,3);assert.equal(result.observed.saved,17);
  const live=result.vm.runtime.getTargetForStage(),variable=live.lookupVariableByNameAndType('pending',''),id=variable.id;
  result.vm.blockListener({type:'var_rename',varId:id,newName:'renamedImage'});
  assert.equal(variable.name,'renamedImage');result.vm.stopAll();result.vm.greenFlag();result.vm.quit();
  assert.equal(values.decode(variable.value),undefined);assert.equal(live.lookupVariableById(savedId).value,17);
  for(let time=80;time<=160;time+=20){await result.clock.advanceTo(time);await stepFrames(result.vm,1,20);}
  const buffer=Buffer.from(await(await result.vm.saveProjectSb3()).arrayBuffer());const zip=await JSZip.loadAsync(buffer),fresh=new Creator();fresh.project=JSON.parse(await zip.file('project.json').async('text'));
  assert.match(fresh.decompile(),/declare arcade source reference renamedImage as "Image"/);
  const fromCode=new Creator();fromCode.parse(fresh.decompile());assert.deepEqual(fromCode.warnings,[]);assert.equal(fromCode.decompile(),fresh.decompile());
  result.vm.stopAll();await result.vm.loadProject(buffer);const replaced=result.vm.runtime.getTargetForStage().lookupVariableById(id);assert.notEqual(replaced,variable);
  const clock=createArcadeDiscreteTimers();result.vm.runtime.bwArcadeProgramClock=clock;result.vm.runtime.updateCurrentMSecs=()=>{result.vm.runtime.currentMSecs=clock.now()};result.vm.greenFlag();result.vm.quit();
  assert.equal(values.decode(replaced.value),undefined);assert.equal(result.vm.runtime.getTargetForStage().lookupVariableById(savedId).value,17);
  for(let time=0;time<=60;time+=20){await clock.advanceTo(time);await stepFrames(result.vm,1,20);}
  assert.equal(result.vm.runtime.getTargetForStage().lookupVariableByNameAndType('pixel','').value,3);assert.deepEqual(result.errors,[]);
 }finally{result.vm.stopAll();result.vm.quit();clearStrayTimers();}
});
