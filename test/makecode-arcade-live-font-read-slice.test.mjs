import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {VM_SRC,loadExtensionClass,bundledExtensionIds} from './helpers/bw-extensions.mjs';
const require=createRequire(import.meta.url),dispatch=require(VM_SRC+'/dispatch/central-dispatch.js');
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runArcadeSourceCode} from './helpers/arcade-source-program.mjs';
import {VM,stepFrames} from './helpers/bw-vm.mjs';
const source=`let small=image.font5
let normal=image.font8
let alias=normal
let wide=image.getFontForText("一")
let double=image.scaledFont(normal,2.9)
let smallWidth=small.charWidth
let normalHeight=normal.charHeight
let doubleWidth=double.charWidth
let multiplier=double.multiplier
let data=normal.data
let scaledData=double.data
let dataLength=data.length
let sameFont=alias===normal
let sharedData=data===scaledData
let fontPicture=image.create(32,24)
fontPicture.print("A",0,0,17,small)
fontPicture.print("A",8,0,3,double)
fontPicture.printCenter("一",12,5,wide)
let fontMissingPicture=image.create(32,24)
fontMissingPicture.print("😀",0,0,11,wide)`;
const expected=JSON.parse(readFileSync(new URL('./fixtures/arcade/live-font-pixels.json',import.meta.url)));
const owners=new WeakMap();
function observe(run){
    // Capture the actual instance immediately; service labels are shared across VMs.
    const label=run.vm.extensionManager._loadedExtensions.get('arcade');
    let native=owners.get(run.vm);if(!native){native=dispatch.services[label]?._inst;assert.equal(native?._runtime===run.vm.runtime,true,'actual Font/image owner belongs to this VM');owners.set(run.vm,native);}
    assert.equal(native._runtime===run.vm.runtime,true,'captured owner belongs to this VM');
    const variables=new Map(run.vm.runtime.targets.flatMap(target=>Object.values(target.variables).map(variable=>[variable.name,variable.value])));
    const pictures={};
    for(const name of ['fontPicture','fontMissingPicture']){const body=native._image(variables.get(name));pictures[name]={width:body.width,height:body.height,pixels:[...body.pixels]};}
    return {variables,native,pictures};
}
async function loadSaved(buffer){
    const vm=new VM(),manager=vm.extensionManager,load=manager.loadExtensionURL.bind(manager),ids=bundledExtensionIds(),errors=[];
    manager.loadExtensionURL=id=>{if(!ids.has(id))return load(id);if(!manager.isExtensionLoaded(id))manager._loadedExtensions.set(id,manager._registerInternalExtension(new(loadExtensionClass(ids.get(id)))(vm.runtime)));return Promise.resolve();};
    vm.runtime.on('BLOCKS_ERROR',error=>errors.push(String(error)));vm.on('BLOCKS_ERROR',error=>errors.push(String(error)));
    await vm.loadProject(buffer);vm.runtime.bwArcadeFrameAuthority='manual';vm.start();vm.greenFlag();vm.quit();await stepFrames(vm,1,20);
    return {vm,errors};
}
test('candidate Font source fields and printing preserve original pixels through actual Code and export/reimport',async()=>{
    const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
    const run=await runArcadeSourceCode(imported.code,{frames:1});
    try{
        assert.deepEqual(run.errors,[]);const {variables,pictures}=observe(run);
        for(const name of ['fontPicture','fontMissingPicture'])assert.deepEqual(pictures[name],expected[name],name);
        for(const[name,value]of [['smallWidth',6],['normalHeight',8],['doubleWidth',12],['multiplier',2],['dataLength',5272],['sameFont',true],['sharedData',true]])assert.equal(variables.get(name),value,name);
        const saved=run.vm.toJSON(),savedBuffer=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());
        await run.vm.loadProject(savedBuffer);run.vm.greenFlag();await stepFrames(run.vm,1,20);
        assert.deepEqual(run.errors,[],'same VM errors');const same=observe(run);for(const name of ['fontPicture','fontMissingPicture'])assert.deepEqual(same.pictures[name],expected[name],name+' same VM SB3');
        const fresh=await loadSaved(savedBuffer);try{assert.deepEqual(fresh.errors,[]);const state=observe(fresh);for(const name of ['fontPicture','fontMissingPicture'])assert.deepEqual(state.pictures[name],expected[name],name+' fresh VM SB3');}finally{fresh.vm.quit();}
        const exported=projectToArcade(JSON.parse(saved));assert.deepEqual(exported.unsupported,[]);
        assert.match(exported.files['main.ts'],/image\.scaledFont/);assert.match(exported.files['main.ts'],/\.printCenter\(/);
        const reimport=arcadeToPseudocode(exported.files['main.ts']);assert.deepEqual(reimport.unsupported,[]);
        const second=await runArcadeSourceCode(reimport.code,{frames:1});
        try{assert.deepEqual(second.errors,[]);const observation=observe(second),after=observation.variables;for(const name of ['fontPicture','fontMissingPicture'])assert.deepEqual(observation.pictures[name],expected[name],name);for(const name of ['smallWidth','normalHeight','doubleWidth','multiplier','dataLength','sameFont','sharedData'])assert.equal(after.get(name),variables.get(name),name);}finally{second.vm.quit();}
        const target=run.vm.runtime.targets.find(target=>Object.values(target.blocks._blocks).some(block=>block.opcode==='arcade_scaleFont'));
        const blocks=target.blocks._blocks;
        const change=(id,name,value)=>target.blocks.changeBlock({id,element:'field',name,value});
        const fontEntry=Object.entries(blocks).find(([,block])=>block.opcode==='arcade_fontValue' && block.fields.FONT?.value==='font8');
        const scaleEntry=Object.entries(blocks).find(([,block])=>block.opcode==='arcade_scaleFont');
        const textEntry=Object.entries(blocks).find(([,block])=>block.opcode==='arcade_printImageFont' && blocks[block.inputs.TEXT?.block]?.fields.TEXT?.value==='A');
        assert.ok(fontEntry);assert.ok(scaleEntry);assert.ok(textEntry);
        change(fontEntry[0],'FONT','font5');
        change(scaleEntry[1].inputs.SIZE.block,'NUM','3');
        change(textEntry[1].inputs.TEXT.block,'TEXT','B');
        run.vm.greenFlag();await stepFrames(run.vm,1,20);assert.deepEqual(run.errors,[]);
        const edited=observe(run);assert.equal(edited.variables.get('normalHeight'),5);assert.equal(edited.variables.get('doubleWidth'),18);assert.equal(edited.variables.get('multiplier'),3);assert.equal(edited.variables.get('dataLength'),904);
        assert.notDeepEqual(edited.pictures.fontPicture,expected.fontPicture,'real character/font/size edits change the image');
        const changedExport=projectToArcade(JSON.parse(run.vm.toJSON()));assert.deepEqual(changedExport.unsupported,[]);
        assert.match(changedExport.files['main.ts'],/normal = image.font5/);assert.match(changedExport.files['main.ts'],/scaledFont\(normal, 3\)/);assert.match(changedExport.files['main.ts'],/\.print\("B"/);
        const changedImport=arcadeToPseudocode(changedExport.files['main.ts']);assert.deepEqual(changedImport.unsupported,[]);
        const changedRun=await runArcadeSourceCode(changedImport.code,{frames:1});
        try{assert.deepEqual(changedRun.errors,[]);assert.deepEqual(observe(changedRun).pictures,edited.pictures);}finally{changedRun.vm.quit();}
    }finally{run.vm.quit();}
});
