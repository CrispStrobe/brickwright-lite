import test from 'node:test';
import fs from 'node:fs';
import crypto from 'node:crypto';
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
import {liveFontMetricsCase} from './fixtures/arcade-live-font-metrics-case.mjs';
import {importGuiDependency} from './helpers/bw-integrated.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
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
    const dispatch=(await importGuiDependency('scratch-vm/src/dispatch/central-dispatch.js')).default;
    const native=dispatch.services[vm.extensionManager._loadedExtensions.get('arcade')]._inst;
    const raw=Object.fromEntries(vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
    const image=native._image(raw.surface);assert.ok(image);
    const captured={width:image.width,height:image.height,pixels:Array.from(image.pixels)};
    return {vm, native, clock, errors, captured, observed: Object.fromEntries(vm.runtime.targets.flatMap(target => Object.values(target.variables)).map(variable => [variable.name, values.decode(variable.value)]))};
}

function upload(creator,imports){for(const costume of imports.costumes||[]){
 if(costume.mode==='add'){
  const target=creator.project.targets.find(t=>!t.isStage&&t.name===costume.sprite),slot=target?target.costumes.findIndex((c,i)=>i>0&&c.name===costume.name):-1;
  assert.equal(creator.addCustomSVGCostume(costume.sprite,costume.svg,costume.name),true);
  if(slot>0){const filled=target.costumes.pop(),[declared]=target.costumes.splice(slot,1,filled);if(declared?.assetId&&!target.costumes.some(c=>c.assetId===declared.assetId))creator.assets.delete(declared.assetId);}
 }else assert.equal(creator.applyCustomSVG(costume.sprite,costume.svg),true);
}}

async function check(buffer,expected,image) {
 const result=await execute(buffer);
 try {assert.deepEqual(result.errors,[]);assert.deepEqual(result.captured,image);for(const[name,value]of Object.entries(expected))assert.equal(Object.hasOwn(result.observed,name)?result.observed[name]:result.observed['Game_'+name],value,name);return Buffer.from(await(await result.vm.saveProjectSb3()).arrayBuffer());}
 finally{result.vm.stopAll();result.vm.quit();clearStrayTimers();}
}
const evidence=(label,data)=>{if(process.env.BW_FONT_METRICS_EVIDENCE_DIR){const dir=process.env.BW_FONT_METRICS_EVIDENCE_DIR;fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,label+'.json'),JSON.stringify(data));}};
async function original(label,input){return runPxtArcade(input,{fakeClock:true,inspectImageGlobals:['surface'],onCompilation:r=>evidence(label+'-compilation',r)}).then(result=>{evidence(label+'-result',result);return result;});}
const imageOf=result=>result.$images.surface||result.$images.Game_surface;
async function exportCreator(creator,assets){return projectToArcade(creator.project,{costumeSvg:(target,costume)=>assets.get(costume.assetId)});}
test('live font metrics retain all pixels and fixed-field edits through actual authoring routes',async()=>{
 const fixture=liveFontMetricsCase,baseline=await original('source-original',fixture.source);for(const[k,v]of Object.entries(fixture.expected))assert.equal(baseline[k],v);
 const image=imageOf(baseline);assert.equal(image.pixels.length,19200);assert.ok(image.pixels.includes(4),'original Unicode font produced authored ink');
 const imported=arcadeToPseudocode(fixture.source);assert.deepEqual(imported.unsupported,[]);
 const creator=new Creator();creator.parse(imported.code);assert.deepEqual(creator.warnings,[]);upload(creator,imported);
 const saved=await check(Buffer.from(await(await creator.generateSB3()).arrayBuffer()),fixture.expected,image);
 const fromCode=new Creator();fromCode.parse(creator.decompile());assert.deepEqual(fromCode.warnings,[]);assert.equal(fromCode.decompile(),creator.decompile());upload(fromCode,imported);
 await check(Buffer.from(await(await fromCode.generateSB3()).arrayBuffer()),fixture.expected,image);await check(saved,fixture.expected,image);
 const zip=await JSZip.loadAsync(saved),fresh=new Creator();fresh.project=JSON.parse(await zip.file('project.json').async('text'));
 const svg=new Map();for(const target of fresh.project.targets)for(const costume of target.costumes||[])if(costume.dataFormat==='svg')svg.set(costume.assetId,await zip.file(costume.md5ext).async('text'));
 const exported=await exportCreator(fresh,svg);assert.deepEqual(exported.unsupported,[]);evidence('baseline-export-files',exported.files);
 const reference=await original('baseline-export-original',exported.files);for(const[k,v]of Object.entries(fixture.expected))assert.equal(reference[k]??reference['Game_'+k],v);assert.deepEqual(imageOf(reference),image);
 const restored=arcadeToPseudocode(exported.files);assert.deepEqual(restored.unsupported,[]);const reimport=new Creator();reimport.parse(restored.code);upload(reimport,restored);await check(Buffer.from(await(await reimport.generateSB3()).arrayBuffer()),fixture.expected,image);
 const metric=fresh.project.targets.flatMap(t=>Object.values(t.blocks)).find(b=>b.opcode==='arcade_fontMetric'&&b.fields.FONT?.[0]==='font5'&&b.fields.PROPERTY?.[0]==='charHeight');assert.ok(metric);metric.fields.FONT[0]='font8';metric.fields.PROPERTY[0]='charWidth';
 const editedExport=await exportCreator(fresh,svg);assert.deepEqual(editedExport.unsupported,[]);evidence('edited-export-files',editedExport.files);
 const editedOriginal=await original('edited-export-original',editedExport.files),editedExpected={...fixture.expected,h5:6};for(const[k,v]of Object.entries(editedExpected))assert.equal(editedOriginal[k]??editedOriginal['Game_'+k],v);
 const editedCode=new Creator();editedCode.parse(fresh.decompile());assert.deepEqual(editedCode.warnings,[]);upload(editedCode,imported);const editedSaved=await check(Buffer.from(await(await editedCode.generateSB3()).arrayBuffer()),editedExpected,imageOf(editedOriginal));await check(editedSaved,editedExpected,imageOf(editedOriginal));
 const editedImport=arcadeToPseudocode(editedExport.files);assert.deepEqual(editedImport.unsupported,[]);const editedRestore=new Creator();editedRestore.parse(editedImport.code);upload(editedRestore,editedImport);await check(Buffer.from(await(await editedRestore.generateSB3()).arrayBuffer()),editedExpected,imageOf(editedOriginal));
});

test('actual VM font objects survive scene ownership and reset on restart and same-VM reload',async()=>{
 const imported=arcadeToPseudocode(liveFontMetricsCase.source),creator=new Creator();creator.parse(imported.code);upload(creator,imported);
 const buffer=Buffer.from(await(await creator.generateSB3()).arrayBuffer()),run=await execute(buffer);
 try{
  const old=run.native._pxtText();old.image.font5.charHeight=9;assert.equal(run.native.fontMetric({FONT:'font5',PROPERTY:'charHeight'}),9);
  await run.native.pushScene({});await run.native.popScene({});assert.equal(run.native._pxtText(),old);
  const restart=async()=>{const clock=createArcadeDiscreteTimers();run.vm.runtime.bwArcadeProgramClock=clock;run.vm.runtime.updateCurrentMSecs=()=>{run.vm.runtime.currentMSecs=clock.now();};run.vm.greenFlag();for(let time=0;time<=100;time+=20){await clock.advanceTo(time);await stepFrames(run.vm,1,20);}};
  run.vm.stopAll();await restart();assert.notEqual(run.native._pxtText(),old);assert.equal(run.native.fontMetric({FONT:'font5',PROPERTY:'charHeight'}),5);
  const saved=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());run.native._pxtText().image.font5.charHeight=11;run.vm.stopAll();await run.vm.loadProject(saved);await restart();assert.equal(run.native.fontMetric({FONT:'font5',PROPERTY:'charHeight'}),5);assert.deepEqual(run.errors,[]);
 }finally{run.vm.stopAll();run.vm.quit();clearStrayTimers();}
});

test('malformed font selectors remain diagnostic on original export',()=>{
 for(const invalid of ['connected','font','property']){
  const imported=arcadeToPseudocode(liveFontMetricsCase.source),creator=new Creator();creator.parse(imported.code);upload(creator,imported);
  const block=creator.project.targets.flatMap(t=>Object.values(t.blocks)).find(b=>b.opcode==='arcade_fontMetric');assert.ok(block);
  if(invalid==='connected')block.inputs.FONT=[3,'unknown',[10,'font5']];else if(invalid==='font')block.fields.FONT[0]='custom';else block.fields.PROPERTY[0]='data';
  const result=projectToArcade(creator.project);assert.ok(result.unsupported.some(d=>String(typeof d==='string'?d:JSON.stringify(d)).includes('font')));
 }
});
