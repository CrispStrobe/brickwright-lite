import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram, stepFrames, clearStrayTimers} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';

// This source is a BW import/authoring input. Its heterogeneous search needles
// are deliberately rejected by the selected SDK without the export bridge.
// Explicit receiver/needle/from temporaries bound this test to query export;
// unstaged nested reporter execution order is a separate importer limitation.
const source = `let actor=sprites.create(img\`2\`,SpriteKind.Player)
let texts:string[]=["1","2"]
let numbers:number[]=[1,2]
let alias=texts
let wrongText=texts.indexOf(1+0)
let wrongNumber=numbers.indexOf("1")
let removedWrong=texts.removeElement(1)
let unchangedCount=alias.length
let removedRight=texts.removeElement("1")
let remainingCount=alias.length
let sameArray=texts===alias
let picture=img\`2\`
let clone=picture.clone()
let pictures:Image[]=[picture,picture]
let pictureAlias=pictures
let samePicture=pictures.indexOf(picture)
let clonedPicture=pictures.indexOf(clone)
let wrongPicture=pictures.indexOf(1)
let removedPicture=pictures.removeElement(picture)
let remainingPicture=pictures.length
pictures[0].fill(7)
let sharedPixel=picture.getPixel(0,0)
let samePictureArray=pictureAlias===pictures
let effectTrace=""
function queryReceiver():string[]{effectTrace+="R";return texts}
function queryNeedle():number{effectTrace+="N";return 1}
function queryFrom():number{effectTrace+="F";return 0}
let receiver=queryReceiver()
let needle=queryNeedle()
let from=queryFrom()
let ordered=receiver.indexOf(needle,from)`;
const expected = {wrongText:-1,wrongNumber:-1,removedWrong:0,unchangedCount:2,
    removedRight:1,remainingCount:1,sameArray:true,samePicture:0,clonedPicture:-1,
    wrongPicture:-1,removedPicture:1,remainingPicture:1,sharedPixel:7,
    samePictureArray:true,effectTrace:'RNF',ordered:-1};
const variables = run => Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
function check(run) {
    assert.deepEqual(run.errors,[]);
    const actual=variables(run);
    for(const [key,value] of Object.entries(expected))assert.equal(actual[key],value,key);
    assert.equal(actual.texts,actual.alias);assert.equal(actual.pictures,actual.pictureAlias);
}
function evidence(name,data) {
    if(!process.env.BW_ARRAY_QUERY_EVIDENCE_DIR)return;
    fs.mkdirSync(process.env.BW_ARRAY_QUERY_EVIDENCE_DIR,{recursive:true});
    fs.writeFileSync(path.join(process.env.BW_ARRAY_QUERY_EVIDENCE_DIR,name+'.json'),JSON.stringify(data));
}
async function execute(imported,frames=60) {
    assert.deepEqual(imported.unsupported,[]);
    const run=await runProgram(imported.code,{frames,uploads:imported.costumes,storage:true});
    assert.deepEqual(run.creator.warnings,[]);return run;
}
function exportRun(run) {
    const exported=projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});
    assert.deepEqual(exported.unsupported,[]);return exported;
}
function assertTypedQueries(exported) {
    assert.match(exported.ts,/let texts: string\[\]/);
    assert.match(exported.ts,/let numbers: number\[\]/);
    assert.match(exported.ts,/let pictures: Image\[\]/);
    assert.match(exported.ts,/\.indexOf\(<any>\(/);
    assert.match(exported.ts,/\.removeElement\(<any>\(/);
    assert.doesNotMatch(exported.ts,/<any>\s*(?:texts|numbers|pictures)\b/);
}

test('heterogeneous query needles preserve typed receivers and do not become array writes',async()=>{
    const run=await execute(arcadeToPseudocode(source));
    try{check(run);assertTypedQueries(exportRun(run));}
    finally{run.vm.stopAll();run.vm.quit();clearStrayTimers();}
});

test('BW array searches retain aliases and effects through Code, saved projects and actual original export',async()=>{
    const imported=arcadeToPseudocode(source),runs=[];
    try{
        const run=await execute(imported);runs.push(run);check(run);
        const code=await execute({...imported,code:run.creator.decompile()});runs.push(code);check(code);
        const saved=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());
        run.vm.stopAll();await run.vm.loadProject(saved);run.vm.greenFlag();await stepFrames(run.vm,60);check(run);
        const fresh=await execute(imported,0);runs.push(fresh);fresh.vm.stopAll();await fresh.vm.loadProject(saved);fresh.vm.greenFlag();await stepFrames(fresh.vm,60);check(fresh);
        const exported=exportRun(code);assertTypedQueries(exported);evidence('export-files',exported.files);
        const original=await runPxtArcade(exported.files,{fakeClock:true,onCompilation:record=>evidence('export-compilation',record)});
        evidence('export-original-result',original);
        for(const [key,value]of Object.entries(expected))assert.equal(original[key]??original['Game_'+key],value,key);
        const reimport=await execute(arcadeToPseudocode(exported.files));runs.push(reimport);check(reimport);
    }finally{for(const run of runs){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});
