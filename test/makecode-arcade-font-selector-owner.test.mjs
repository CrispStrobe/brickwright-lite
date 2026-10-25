import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {VM_SRC} from './helpers/bw-extensions.mjs';
import {runArcadeSourceCode} from './helpers/arcade-source-program.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
const require=createRequire(import.meta.url);
const owner=require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/font-selector-owner.js');
const dispatch=require(VM_SRC+'/dispatch/central-dispatch.js');
function fixture(opcode='arcade_fontValue') {
    const args={FONT:'font5',...(opcode==='arcade_fontMetric'?{PROPERTY:'charHeight'}:{})};
    const fields=Object.fromEntries(Object.entries(args).map(([name,value])=>[name,{name,value}]));
    const block={id:'reporter',opcode,fields,inputs:{},parent:'command'};
    const command={id:'command',opcode:'arcade_printImageFont',inputs:{FONT:{block:'reporter'}}};
    const blocks={_blocks:{reporter:block,command},getBlock(id){return this._blocks[id];},getInputs(){return operation.inputs;},_cache:{_executeCached:{}}};
    const target={blocks},thread={target,blockContainer:blocks,isKilled:false,peekStack:()=>command.id};
    const primitive=()=>{},operation={id:block.id,opcode,_argValues:args,_blockFunction:primitive,fields:block.fields,inputs:block.inputs,mutation:block.mutation};
    blocks._cache._executeCached[command.id]={_ops:[operation]};
    const runtime={targets:[target],threads:[thread],sequencer:{activeThread:thread},isActiveThread:t=>t===thread,getOpcodeFunction:name=>name===opcode?primitive:null};
    return {args,block,command,blocks,target,thread,operation,runtime,util:{runtime,thread,target}};
}
test('cached reporter arguments select the actual Font block rather than its enclosing print',()=>{for(const opcode of ['arcade_fontValue','arcade_fontMetric']){const f=fixture(opcode);assert.equal(owner(f.runtime,f.util,f.args,opcode,Object.keys(f.args)),f.block);assert.equal(owner(f.runtime,undefined,f.args,opcode,Object.keys(f.args)),null);}});
test('fixed selector ownership refuses connected fields, copied args, changed cache and inactive foreign callers',()=>{
    const cases=[f=>{f.block.inputs.FONT={block:'computed'};},f=>{f.args={...f.args};},f=>{f.block.fields.FONT={name:'FONT',value:'font8'};},f=>{f.thread.isKilled=true;},f=>{f.runtime.threads=[];},f=>{f.util.runtime={};},f=>{f.thread.blockContainer={};},f=>{f.runtime.targets=[];},f=>{f.runtime.sequencer.activeThread={};},f=>{f.runtime.getOpcodeFunction=()=>()=>{};},f=>{f.blocks._cache._executeCached.command._ops.push(f.operation);},f=>{f.command.inputs={};},f=>{f.operation.fields={...f.block.fields};},f=>{f.blocks._blocks.reporter={...f.block,inputs:{FONT:{block:'changed'}}};}];
    for(const mutate of cases){const f=fixture();mutate(f);assert.throws(()=>owner(f.runtime,f.util,f.args,'arcade_fontValue',['FONT']),/Font fixed fields/);}
    const metric=fixture('arcade_fontMetric');metric.block.inputs.PROPERTY={block:'computed'};assert.throws(()=>owner(metric.runtime,metric.util,metric.args,'arcade_fontMetric',['FONT','PROPERTY']),/PROPERTY cannot be a connected reporter/);
});
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(target=>Object.values(target.variables).map(value=>[value.name,value.value])));
const instance=run=>{const service=Object.values(dispatch.services).find(service=>service?._inst?._runtime===run.vm.runtime&&service._inst._sdkFontValues);assert.ok(service);assert.equal(service._inst._runtime===run.vm.runtime,true);return service._inst;};
test('actual VM nested inline Font printing and metric arithmetic retain source Code export and fresh save semantics',async()=>{
    const code='DEVICE ARCADE\nGLOBAL width\nSPRITE Game:\nWHEN arcade source starts:\n  set width to (0 + (arcade font "font8" metric "charWidth"))\n';
    const run=await runArcadeSourceCode(code,{frames:2});const native=instance(run);assert.deepEqual(run.errors,[]);assert.equal(values(run).width,6);
    const source='let text="A";let pic=image.create(16,16);pic.print(text,0,image.font8.charWidth,3,image.font5);let width=image.font8.charWidth+image.font5.charHeight';
    const converted=arcadeToPseudocode(source);assert.deepEqual(converted.unsupported,[]);
    const printed=await runArcadeSourceCode(converted.code,{frames:3,uploads:converted.costumes});const printNative=instance(printed);assert.deepEqual(printed.errors,[]);assert.equal(values(printed).width,11);
    const image=printNative._image(values(printed).pic);assert.ok(image);assert.equal(image.pixels.some(value=>value===3),true);const pixels=[...image.pixels];
    const exported=projectToArcade(JSON.parse(printed.vm.toJSON()));assert.deepEqual(exported.unsupported,[]);
    const reimported=arcadeToPseudocode(exported.files);assert.deepEqual(reimported.unsupported,[]);const again=await runArcadeSourceCode(reimported.code,{frames:3,uploads:reimported.costumes});const againNative=instance(again);assert.deepEqual(again.errors,[]);assert.deepEqual([...againNative._image(values(again).pic).pixels],pixels);
    printed.vm.stopAll();await printed.vm.loadProject(printed.buffer);printed.vm.greenFlag();await (await import('./helpers/bw-vm.mjs')).stepFrames(printed.vm,3,20);assert.deepEqual(printed.errors,[]);assert.deepEqual([...printNative._image(values(printed).pic).pixels],pixels);
    run.vm.stopAll();again.vm.stopAll();printed.vm.stopAll();
});

test('actual VM refuses edited connected Font selectors before resource production',async()=>{
    for(const [opcode,selector,value] of [['arcade_fontValue','FONT','font5'],['arcade_fontMetric','PROPERTY','charWidth']]) {
        const code=opcode==='arcade_fontValue'?'DEVICE ARCADE\nGLOBAL f\nSPRITE Game:\nWHEN arcade source starts:\n  set f to (arcade font value font5)\n':'DEVICE ARCADE\nGLOBAL f\nSPRITE Game:\nWHEN arcade source starts:\n  set f to (arcade font "font8" metric "charWidth")\n';
        const run=await runArcadeSourceCode(code,{frames:1});const native=instance(run);assert.deepEqual(run.errors,[]);run.vm.stopAll();
        const target=run.vm.runtime.targets.find(target=>Object.values(target.blocks._blocks).some(block=>block.opcode===opcode));
        const reporter=Object.values(target.blocks._blocks).find(block=>block.opcode===opcode);const id='connected-font-selector';
        target.blocks.createBlock({id,opcode:'text',next:null,parent:reporter.id,inputs:{},fields:{TEXT:{name:'TEXT',value}},shadow:true,topLevel:false});
        reporter.inputs[selector]={name:selector,block:id,shadow:id};target.blocks.resetCache();
        run.vm.greenFlag();let thrown;try{await (await import('./helpers/bw-vm.mjs')).stepFrames(run.vm,2,20);}catch(error){thrown=String(error);}
        assert.equal(native._runtime===run.vm.runtime,true);assert.ok([...run.errors,thrown||''].some(error=>error.includes(selector+' cannot be a connected reporter')));run.vm.stopAll();
    }
});
