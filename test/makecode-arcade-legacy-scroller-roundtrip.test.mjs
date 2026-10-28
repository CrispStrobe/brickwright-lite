import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {prepareArcadeDependencyInputs} from '../overlay/scratch-gui/src/lib/bw-makecode/dependency-project.js';
import {admitArcadeNativeSource} from '../overlay/scratch-gui/src/lib/bw-makecode/native-source-admission.js';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';

const revision='43651f88b917a98ad886fdd4c1c2ad8001ce9b9c';
const source=readFileSync(new URL('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/legacy-scroller-source/main.ts',import.meta.url),'utf8');
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
const withOriginal=files=>{
    const cfg=JSON.parse(files['pxt.json']);delete cfg.dependencies['arcade-background-scroll'];cfg.files=['legacy-scroller.ts',...cfg.files];
    return {...files,'legacy-scroller.ts':source,'pxt.json':JSON.stringify(cfg)};
};

test('exact legacy source admission preserves version, lazy offsets and package initializers across editable roundtrips',async()=>{
    const main='let back=img`1 2\n3 4`;scene.setBackgroundImage(back);scroller.scrollBackgroundWithCamera(scroller.CameraScrollMode.BothDirections);scroller.setCameraScrollingMultipliers();scroller.scrollBackgroundWithSpeed(0,0);scroller.setBackgroundScrollOffset(17,-9);let offsetX=scroller.getBackgroundXOffset();let offsetY=scroller.getBackgroundYOffset();let packageValue=packageInitialized;let done=1;done+=0;';
    const files={'main.ts':main,'pxt.json':JSON.stringify({name:'legacy-scroller-roundtrip',dependencies:{device:'*','arcade-background-scroll':`github:riknoll/arcade-background-scroll#${revision}`},files:['main.ts']})};
    const resolved={packages:{'arcade-background-scroll':{files:{'main.ts':source,'extra.ts':'let packageInitialized=7;'}}},sourceOrder:[{id:'arcade-background-scroll',file:'main.ts'},{id:'arcade-background-scroll',file:'extra.ts'}],jres:{}};
    const before=JSON.stringify(files),prepared=prepareArcadeDependencyInputs(files,resolved);assert.equal(JSON.stringify(files),before);assert.equal(prepared.provenance[0].nativeAdapter.libraryVersion,revision);assert.ok(Object.values(prepared.files).includes('let packageInitialized=7;'));
    const originalFiles=withOriginal({...files,'extra.ts':'let packageInitialized=7;'});const cfg=JSON.parse(originalFiles['pxt.json']);cfg.files.splice(1,0,'extra.ts');originalFiles['pxt.json']=JSON.stringify(cfg);
    const expected=await runPxtArcade(originalFiles);assert.equal(expected.offsetX,17);assert.equal(expected.offsetY,-9);assert.equal(expected.packageValue,7);
    const imported=arcadeToPseudocode(prepared.files);assert.deepEqual(imported.unsupported,[]);assert.match(imported.code,/arcade use background scroll version/);
    const names=['offsetX','offsetY','packageValue','done'];
    const check=run=>{assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);for(const name of names)assert.equal(values(run)[name],expected[name],name);};
    try {
        const run=await runProgram(imported.code,{frames:90,uploads:imported.costumes,storage:true});check(run);
        const archive=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());await run.vm.loadProject(archive);run.vm.greenFlag();await stepFrames(run.vm,90);check(run);
        const fresh=await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0,storage:true});fresh.vm.stopAll();await fresh.vm.loadProject(archive);fresh.vm.greenFlag();await stepFrames(fresh.vm,90);check(fresh);fresh.vm.quit?.();
        check(await runProgram(run.creator.decompile(),{frames:90,uploads:imported.costumes,storage:true}));
        const exported=projectToArcade(run.creator.project,{costumeSvg:(target,costume)=>run.creator.assets.get(costume.assetId)?.data});assert.deepEqual(exported.unsupported,[]);assert.equal(JSON.parse(exported.files['pxt.json']).dependencies['arcade-background-scroll'],`github:riknoll/arcade-background-scroll#${revision}`);assert.match(exported.ts,/scroller.getBackgroundXOffset\(\)/);assert.match(exported.ts,/scroller.setBackgroundScrollOffset\(17, -9\)/);
        const oracle=await runPxtArcade(withOriginal(exported.files));for(const name of names)assert.equal(oracle[name]??oracle['Game_'+name],expected[name],name+' exported');
        const reimported=arcadeToPseudocode(exported.files);assert.deepEqual(reimported.unsupported,[]);check(await runProgram(reimported.code,{frames:90,uploads:reimported.costumes,storage:true}));
    } finally {clearStrayTimers();}
});

test('legacy source admission refuses modifications and layer-only APIs stay diagnosed',()=>{
    assert.equal(admitArcadeNativeSource({packageId:'arcade-background-scroll',filename:'main.ts',source:source+'\n// changed'}),null);
    for(const main of ['scroller.setLayerZIndex(0,1)','scroller.setLayerImage(0,img`1`)','let x=scroller.getBackgroundXOffset(1)','scroller.scrollBackgroundWithSpeed(1,2,3)']) {
        const files={'main.ts':main,'pxt.json':JSON.stringify({dependencies:{device:'*','arcade-background-scroll':`github:riknoll/arcade-background-scroll#${revision}`},files:['main.ts']})};
        assert.ok(arcadeToPseudocode(files).unsupported.length,main);
    }
});
