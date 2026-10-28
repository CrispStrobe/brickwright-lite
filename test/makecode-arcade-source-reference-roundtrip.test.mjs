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
import {referenceCases} from './fixtures/arcade-source-reference-cases.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {compile} from '../scripts/lib/pxt-node.mjs';
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
    for (let time = 0; time <= 100; time += 20) {await clock.advanceTo(time); await stepFrames(vm, 1, 20);}
    return {vm, clock, errors, observed: Object.fromEntries(vm.runtime.targets.flatMap(target => Object.values(target.variables)).map(variable => [variable.name, values.decode(variable.value)]))};
}

function upload(creator,imports){for(const costume of imports.costumes||[])assert.equal(costume.mode==='add'?creator.addCustomSVGCostume(costume.sprite,costume.svg,costume.name):creator.applyCustomSVG(costume.sprite,costume.svg),true,'actual retained artwork '+costume.sprite);}
async function check(buffer,expected) {
 const result=await execute(buffer);
 try {assert.deepEqual(result.errors,[]);for(const[name,value]of Object.entries(expected))assert.equal(Object.hasOwn(result.observed,name)?result.observed[name]:result.observed['Game_'+name],value,name);return Buffer.from(await(await result.vm.saveProjectSb3()).arrayBuffer());}
 finally{result.vm.stopAll();result.vm.quit();clearStrayTimers();}
}
for(const[name,fixture]of Object.entries(referenceCases))test('finite reference authoring and original export: '+name,async()=>{
 const imported=arcadeToPseudocode(fixture.source);assert.deepEqual(imported.unsupported,[]);
 const creator=new Creator();creator.parse(imported.code);assert.deepEqual(creator.warnings,[]);upload(creator,imported);
 const saved=await check(Buffer.from(await(await creator.generateSB3()).arrayBuffer()),fixture.expected);
 const fromCode=new Creator();fromCode.parse(creator.decompile());assert.deepEqual(fromCode.warnings,[]);assert.equal(fromCode.decompile(),creator.decompile());upload(fromCode,imported);
 await check(Buffer.from(await(await fromCode.generateSB3()).arrayBuffer()),fixture.expected);
 await check(saved,fixture.expected);
 const zip=await JSZip.loadAsync(saved),fresh=new Creator();fresh.project=JSON.parse(await zip.file('project.json').async('text'));
 const svg=new Map();for(const target of fresh.project.targets)for(const costume of target.costumes||[])if(costume.dataFormat==='svg')svg.set(costume.assetId,await zip.file(costume.md5ext).async('text'));
 const exported=projectToArcade(fresh.project,{costumeSvg:(target,costume)=>svg.get(costume.assetId)});assert.deepEqual(exported.unsupported,[]);
 const original=await runPxtArcade(exported.files,{fakeClock:true});
 for(const[key,value]of Object.entries(fixture.expected))assert.equal(Object.hasOwn(original,key)?original[key]:original['Game_'+key],value,key+' original export');
 const restored=arcadeToPseudocode(exported.files);assert.deepEqual(restored.unsupported,[]);const reimport=new Creator();reimport.parse(restored.code);assert.deepEqual(reimport.warnings,[]);upload(reimport,restored);
 await check(Buffer.from(await(await reimport.generateSB3()).arrayBuffer()),fixture.expected);
 if(['sprite','image','array','class','never-instantiated-class','namespace-class','returned-reference'].includes(name)) {
  assert.match(exported.ts,/let pending: (?:Sprite|Image|number\[\]|Box|__bwNamespace_N_Box)(?:\r?\n|$)/);
  const files={...exported.files,'main.ts':exported.ts+'\nfunction __bwReferenceRequiresNumber(value:number){}\n__bwReferenceRequiresNumber(pending)\n'};
  const rejected=await compile('arcade',files);assert.equal(rejected.success,false,'reference cells retain original numeric typing rejection');
 }
});
