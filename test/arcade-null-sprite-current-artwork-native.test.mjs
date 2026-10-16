import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import JSZip from 'jszip';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {svgToPixels} from '../overlay/scratch-gui/src/lib/bw-makecode/pixel-image.js';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {VM_SRC} from './helpers/bw-extensions.mjs';
const require=createRequire(import.meta.url),BW=require(VM_SRC+'/util/bw-values');
const exceptions=require(VM_SRC+'/util/bw-arcade-exceptions'),dispatch=require(VM_SRC+'/dispatch/central-dispatch');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function record(label,value){
    // Root's bounded packet supplies its own private output directory. Normal
    // repository test runs do not create artifacts in an inferred location.
    const directory=process.env.BW_NULL_ARTWORK_EVIDENCE;
    if(directory)fs.writeFileSync(path.join(directory,label+'.json'),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
}
function cell(run,name){
    const matches=run.vm.runtime.targets.filter(target=>target.isOriginal!==false).flatMap(target=>Object.entries(target.variables).filter(([,variable])=>variable.name===name).map(([id,variable])=>({id,target:target.id,variable})));
    assert.equal(matches.length,1,'one current variable cell '+name);
    return matches[0];
}
const value=(run,name)=>BW.decode(cell(run,name).variable.value);
const source=`let receiver:Sprite=null;let made:Sprite=null;let after=0;let result=0;let independent=0;
game.onUpdate(function(){independent+=1});
controller.A.onEvent(ControllerButtonEvent.Pressed,function(){
made=sprites.create(img\`1\`,SpriteKind.Projectile);
result=receiver.x;made.setPosition(10,20);made.vy=-200;after=1;
});`;
function artwork(svg){const image=svgToPixels(svg);assert.ok(image,'actual indexed SVG');return{width:image.width,height:image.height,pixels:Array.from(image.pixels),sha256:sha(Buffer.from(svg))};}
function onePixel(svg){const image=artwork(svg);assert.equal(image.width,1);assert.equal(image.height,1);assert.deepEqual(image.pixels,[1]);return image;}
function actor(run){
    const actualCell=cell(run,'made'),handle=BW.decode(actualCell.variable.value);
    assert.equal(typeof handle,'string','actual managed Sprite handle, not absent/Undefined');assert.ok(handle.length);
    const service=run.vm.extensionManager._loadedExtensions.get('arcade'),ext=dispatch.services[service]?._inst;
    assert.ok(ext,'current registered Arcade instance');
    const sprite=ext._spriteValues.get(handle);assert.ok(sprite,'handle is allocated in this instance');
    assert.equal(sprite.id,handle);assert.equal(ext._state().sprites[handle],sprite,'same live scene actor');assert.notEqual(sprite._destroyed,true);
    const clone=ext._state().spriteTargets[handle];assert.ok(clone,'current actor clone');
    const costume=clone.getCostumes()[clone.currentCostume];assert.ok(costume?.asset?.data,'actual storage-backed actor art');
    const svg=Buffer.from(costume.asset.data).toString('utf8'),image=onePixel(svg);
    const observed={cell:{id:actualCell.id,target:actualCell.target,name:actualCell.variable.name},handle,
        x:sprite.x,y:sprite.y,vx:sprite.vx,vy:sprite.vy,ax:sprite.ax,ay:sprite.ay,flags:sprite.flags,width:sprite.width,height:sprite.height,
        image,costume:{assetId:costume.assetId,md5ext:costume.md5ext,name:costume.name},mask:Array.from(sprite.mask||[])};
    // An odd one-pixel constructor has a half-pixel center. Do not replace its
    // authored art with an even default image to obtain integer coordinates.
    assert.equal(observed.x,79.5);assert.equal(observed.y,59.5);assert.equal(observed.vx,0);assert.equal(observed.vy,0);assert.equal(observed.ax,0);assert.equal(observed.ay,0);assert.equal(observed.flags,0);
    assert.equal(observed.width,1);assert.equal(observed.height,1);assert.deepEqual(observed.mask,[1]);
    return observed;
}
async function trigger(run,label){
    const signals=[],atFault=[],observerErrors=[];const listener=error=>{signals.push(error);try{atFault.push(actor(run));}catch(failure){observerErrors.push({name:failure.name,message:failure.message,stack:failure.stack});}};
    run.vm.runtime.on('BLOCKS_ERROR',listener);
    try{
        await stepFrames(run.vm,3);const prior=value(run,'independent');
        run.vm.postIOData('keyboard',{key:' ',isDown:true});await stepFrames(run.vm,8);
        run.vm.postIOData('keyboard',{key:' ',isDown:false});await stepFrames(run.vm,3);
        record(label+'-raw-observation',{project:JSON.parse(run.vm.toJSON()),signals:signals.map(error=>({name:error.name,message:error.message})),atFault,observerErrors,calls:[...run.calls],errors:run.errors});
        assert.deepEqual(observerErrors,[],'passive fault observer retained actual actor/image');
        assert.equal(signals.length,1);assert.ok(signals[0] instanceof TypeError);
        const diagnostic=exceptions.diagnostic(run.vm.runtime,signals[0]);assert.equal(diagnostic?.kind,'primitive-fault');assert.match(diagnostic.message,/Expected type Sprite but received type null/);
        const block=run.vm.runtime.targets.flatMap(target=>Object.values(target.blocks._blocks)).find(node=>node.id===diagnostic.block);assert.equal(block?.opcode,'arcade_spriteProperty');
        assert.equal(value(run,'after'),0);assert.equal(value(run,'result'),0);
        const factories=['arcade_createSprite','arcade_createImageSprite','arcade_createOwnedImageSprite'];
        assert.equal(factories.reduce((count,opcode)=>count+(run.calls.get(opcode)||0),0),1,'one actual current creation operation');
        assert.equal(run.calls.get('arcade_setSpritePosition')||0,0);assert.equal(run.calls.get('arcade_setSpriteProperty')||0,0);assert.equal(run.calls.get('arcade_setSpriteFlag')||0,0);
        assert.equal(run.calls.get('arcade_spriteProperty'),1);assert.ok(value(run,'independent')>prior);assert.ok(run.errors.some(message=>message.includes('Expected type Sprite but received type null')));
        const after=actor(run);assert.deepEqual(after,atFault[0],'same actor/pixels unaffected by fault or later callback frames');
        record(label+'-fault',{diagnostic,error:{name:signals[0].name,message:signals[0].message},atFault:atFault[0],after,calls:[...run.calls],errors:run.errors});
    }finally{run.vm.runtime.removeListener('BLOCKS_ERROR',listener);}
}
async function currentArchive(run,label){
    const project=JSON.parse(run.vm.toJSON()),bytes=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()),zip=await JSZip.loadAsync(bytes),saved=JSON.parse(await zip.file('project.json').async('text'));
    const images=new Map(),inventory=[];
    for(const target of project.targets)for(const costume of target.costumes||[]){
        assert.equal(costume.dataFormat,'svg','this authored fixture has only actual SVG assets');
        const member=zip.file(costume.md5ext);assert.ok(member,'current saved asset '+costume.md5ext);const svg=await member.async('text');
        const same=saved.targets.find(item=>item.id===target.id);assert.ok(same?.costumes.some(item=>item.assetId===costume.assetId&&item.md5ext===costume.md5ext),'current graph and saved graph join by target/asset');
        if(images.has(costume.assetId))assert.equal(images.get(costume.assetId),svg,'duplicate asset identity has exact same bytes');
        images.set(costume.assetId,svg);inventory.push({target:target.name,assetId:costume.assetId,md5ext:costume.md5ext,name:costume.name,svg,...artwork(svg)});
    }
    record(label+'-archive',{project,saved,sb3SHA256:sha(bytes),inventory});
    return{project,bytes,images,inventory};
}
function currentUploads(archive){
    return archive.project.targets.filter(target=>!target.isStage).flatMap(target=>(target.costumes||[]).map((costume,index)=>{
        const svg=archive.images.get(costume.assetId);assert.equal(typeof svg,'string');return{sprite:target.name,name:costume.name,svg,mode:index?'add':'replace'};
    }));
}

test('current artwork survives source/Code/same and fresh SB3/current export with the physical null x failure',async()=>{
    const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);assert.equal(imported.costumes.length,1);onePixel(imported.costumes[0].svg);record('source-import',{source,...imported});const runs=[];
    try{
        const first=await runProgram(imported.code,{frames:0,uploads:imported.costumes,storage:true});runs.push(first);assert.deepEqual(first.creator.warnings,[]);await trigger(first,'source');
        const archive=await currentArchive(first,'source'),code=first.creator.decompile(archive.project);record('code-feedback',{code});
        const codeRun=await runProgram(code,{frames:0,uploads:currentUploads(archive),storage:true});runs.push(codeRun);assert.deepEqual(codeRun.creator.warnings,[]);await trigger(codeRun,'code');await currentArchive(codeRun,'code');
        first.vm.stopAll();await first.vm.loadProject(archive.bytes);first.calls.clear();first.errors.length=0;first.vm.greenFlag();await trigger(first,'same-sb3');await currentArchive(first,'same-sb3');
        const fresh=await runProgram('DEVICE ARCADE\nSPRITE Game:\nWHEN arcade source starts:\n  hide',{frames:0,storage:true});runs.push(fresh);
        fresh.vm.stopAll();await fresh.vm.loadProject(archive.bytes);fresh.calls.clear();fresh.errors.length=0;fresh.vm.greenFlag();await trigger(fresh,'fresh-sb3');
        const current=await currentArchive(fresh,'fresh-sb3');
        const exported=projectToArcade(current.project,{costumeSvg:(_target,costume)=>{assert.ok(current.images.has(costume.assetId),'export reads actual CURRENT saved asset');return current.images.get(costume.assetId);}});
        record('current-export',exported);assert.deepEqual(exported.unsupported,[]);assert.deepEqual(exported.warnings,[]);
        const again=arcadeToPseudocode(exported.files);record('current-reimport',again);assert.deepEqual(again.unsupported,[]);assert.equal(again.costumes.length,1);onePixel(again.costumes[0].svg);
        const replay=await runProgram(again.code,{frames:0,uploads:again.costumes,storage:true});runs.push(replay);assert.deepEqual(replay.creator.warnings,[]);await trigger(replay,'current-reimport');await currentArchive(replay,'current-reimport');
    }finally{for(const run of runs){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});

test('physical nonnull getters return expected values through actual renamed variable IDs',async()=>{
    const source='let receiver=sprites.create(img`1`,SpriteKind.Player);receiver.setPosition(12,34);let x=receiver.x;let y=receiver.y;let width=receiver.width;let height=receiver.height;let after=1;';
    const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);assert.equal(imported.costumes.length,1);onePixel(imported.costumes[0].svg);record('nonnull-import',{source,...imported});let run;
    try{
        run=await runProgram(imported.code,{frames:16,uploads:imported.costumes,storage:true});assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
        const mapping={x:'x_',y:'y_',width:'width',height:'height',after:'after'},expected={x:12,y:34,width:1,height:1,after:1},observed={};
        assert.equal(run.vm.runtime.targets.filter(target=>target.isOriginal!==false).flatMap(target=>Object.values(target.variables)).some(variable=>variable.name==='x'||variable.name==='y'),false,'reserved names are not silently mistaken for variable cells');
        for(const[name,normalized]of Object.entries(mapping)){
            const actual=cell(run,normalized);observed[name]={id:actual.id,target:actual.target,normalized,value:BW.decode(actual.variable.value)};assert.equal(observed[name].value,expected[name]);
        }
        record('nonnull-values',{mapping,observed,calls:[...run.calls],errors:run.errors});await currentArchive(run,'nonnull');
    }finally{if(run){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});
