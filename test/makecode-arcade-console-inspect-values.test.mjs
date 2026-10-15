import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const create=require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/console-inspect-values');
const loan=require('../overlay/scratch-vm/src/util/bw-primitive-owner');

function fixture(value='text',limit='20') {
    const blocks={root:{id:'root',opcode:'data_setvariableto',topLevel:true,inputs:{VALUE:{block:'inspect'}}},
        inspect:{id:'inspect',opcode:'arcade_inspectValue',parent:'root',fields:{},inputs:{VALUE:{block:'value'},LIMIT:{block:'limit'}}},
        value:{id:'value',opcode:'text',parent:'inspect',fields:{TEXT:{value}},inputs:{}},
        limit:{id:'limit',opcode:'math_number',parent:'inspect',fields:{NUM:{value:limit}},inputs:{}}};
    const container={_blocks:blocks,getBlock:id=>blocks[id],getInputs:block=>block.inputs,_cache:{_executeCached:{}}};
    const target={isOriginal:true,blocks:container};
    const thread={target,blockContainer:container,peekStack:()=> 'root',isKilled:false};
    const runtime=new EventEmitter();Object.assign(runtime,{targets:[target],threads:[thread],sequencer:{activeThread:thread},isActiveThread:t=>t===thread});
    const util={runtime,thread,target},args={VALUE:value,LIMIT:limit};
    const method=()=>service.inspect(args,util);
    runtime.getOpcodeFunction=op=>op==='arcade_inspectValue'?method:null;
    const operation={id:'inspect',opcode:'arcade_inspectValue',_argValues:args,_blockFunction:method,fields:blocks.inspect.fields,inputs:blocks.inspect.inputs};
    container._cache._executeCached.root={_ops:[operation]};
    const service=create(runtime,{referenceTypeOf:()=>undefined,typeOf:()=>undefined});service.snapshot();
    const invoke=(values=args,handler=()=>service.inspect(values,util))=>loan.invoke(runtime,thread,container,operation,args,util,handler);
    return {runtime,target,thread,util,args,blocks,container,operation,service,invoke};
}

test('primitive inspection preserves selected conversion without opaque coercion',()=>{
    for(const [value,expected]of [['',''],['猫☃','猫☃'],[-1.25,'-1.25'],[-0,'0'],[true,'true'],[false,'false'],[null,'null'],[undefined,'undefined'],[NaN,'NaN'],[Infinity,'Infinity'],[-Infinity,'-Infinity'],[{bwUndefined:true},'undefined'],[{bwNumber:'-0'},'0']])
        assert.equal(''+create.primitive(value),expected);
    let reads=0;const getter={get bwUndefined(){reads++;return true;}},custom={toString(){reads++;return 'fake';}};
    for(const value of [getter,custom,[],{bwReference:{kind:'image',id:'x'}},new String('x'),()=>3])assert.throws(()=>create.primitive(value));
    assert.equal(reads,0);
});

test('actual cached reporter accepts current literal text and preserves primitive limit semantics',()=>{
    const f=fixture('live-looking:SpriteID','0');assert.equal(f.invoke(),'live-looking:SpriteID');
    f.args.LIMIT='20';f.blocks.limit.fields.NUM.value='20';
    assert.throws(()=>f.invoke(),/source graph changed/);
    f.service.snapshot();assert.equal(f.invoke(),'live-looking:SpriteID');
    const n=fixture('-1.25');n.blocks.value.opcode='math_number';n.blocks.value.fields={NUM:{value:'-1.25'}};n.service.snapshot();
    assert.equal(n.invoke(),'-1.25');
});

test('inspection rejects direct observers, copied/sibling args, stale cache and foreign ownership',()=>{
    const f=fixture();assert.throws(()=>f.service.inspect(f.args,f.util),/primitive ownership/);
    assert.throws(()=>f.invoke({...f.args}),/primitive ownership/);
    f.operation.inputs={...f.operation.inputs};assert.throws(()=>f.invoke(),/input map differs/);
    const g=fixture();g.thread.isKilled=true;assert.throws(()=>g.invoke(),/actual cached caller/);
    const h=fixture();h.runtime.sequencer.activeThread={};assert.throws(()=>h.invoke(),/actual cached caller/);
});

test('inspection snapshots bind complete current project graphs and lifecycle',()=>{
    const f=fixture();f.blocks.value={...f.blocks.value};assert.throws(()=>f.invoke(),/source graph changed/);
    f.service.snapshot();f.operation.inputs=f.blocks.inspect.inputs;assert.equal(f.invoke(),'text');
    f.runtime.targets.push({isOriginal:true,blocks:{_blocks:{}}});assert.throws(()=>f.invoke(),/source graph changed/);
    const g=fixture();g.service.invalidate();assert.throws(()=>g.invoke(),/inactive native owner/);g.service.snapshot();assert.equal(g.invoke(),'text');
    g.service.dispose();g.service.snapshot();assert.throws(()=>g.invoke(),/inactive native owner/);
});

test('opaque input and error-observer reentry cannot obtain a String result',()=>{
    const f=fixture();f.args.VALUE={toString(){throw Error('must not run');}};
    f.invoke(f.args,()=>f.service.inspect(f.args,f.util,error=>{
        assert.match(error.message,/opaque|reference/);
        assert.throws(()=>f.service.inspect(f.args,f.util),/reentrant inspection/);
        return undefined;
    }));
    const inert=create(undefined,{});inert.snapshot();assert.throws(()=>inert.inspect({},{}),/inactive native owner/);inert.dispose();
});

test('variable producer authority rejects reference cells, foreign writers and variable replacement',()=>{
    const f=fixture();const variable={id:'v',name:'text',type:'',value:'text'};
    f.target.variables={v:variable};f.target.lookupVariableById=id=>id==='v'?variable:undefined;
    f.blocks.value.opcode='data_variable';f.blocks.value.fields={VARIABLE:{id:'v',value:'text'}};
    f.service.snapshot();assert.equal(f.invoke(),'text');
    const reference=create(f.runtime,{referenceTypeOf:()=> 'Sprite',typeOf:()=>undefined});reference.snapshot();
    assert.throws(()=>f.invoke(f.args,()=>reference.inspect(f.args,f.util)),/producer authority/);
    f.target.variables.v={...variable};assert.throws(()=>f.invoke(),/source graph changed/);
    f.target.variables.v=variable;
    const foreignBlocks={write:{id:'write',opcode:'data_setvariableto',fields:{VARIABLE:{id:'v'}},inputs:{VALUE:{block:'literal'}}},
        literal:{id:'literal',opcode:'text',fields:{TEXT:{value:'other'}},inputs:{}}};
    const foreign={isOriginal:true,variables:{},lookupVariableById:id=>id==='v'?variable:undefined,
        blocks:{_blocks:foreignBlocks,getBlock:id=>foreignBlocks[id]}};
    f.runtime.targets.push(foreign);f.service.snapshot();assert.throws(()=>f.invoke(),/producer authority/);
});

test('computed local writers and capture escapes refuse while unrelated procedure writers stay separate',()=>{
    const local=()=>{
        const f=fixture(),add=(id,opcode,inputs={},fields={})=>f.blocks[id]={id,opcode,inputs,fields};
        f.blocks.root.next='write';add('write','arcade_setLocal',{NAME:{block:'name'},VALUE:{block:'literal'}}).next='assign';
        add('name','text',{}, {TEXT:{value:'local'}});add('literal','text',{}, {TEXT:{value:'ordinary'}});
        add('assign','data_setvariableto',{VALUE:{block:'inspect'}});
        f.blocks.value.opcode='arcade_getLocal';f.blocks.value.fields={};f.blocks.value.inputs={NAME:{block:'name'}};
        return {...f,add};
    };
    const f=local();f.add('dynamic','operator_join');f.add('opaque','arcade_createSprite');
    f.add('bad','arcade_setLocal',{NAME:{block:'dynamic'},VALUE:{block:'opaque'}}).next='assign';f.blocks.write.next='bad';
    f.args.VALUE='arcade:123';f.service.snapshot();assert.throws(()=>f.invoke(),/producer authority/,'structural synthetic raw-handle probe, no issued Sprite claim');
    const sibling=local();sibling.add('other','procedures_definition',{custom_block:{block:'prototype'}}).topLevel=true;sibling.blocks.other.next='bad';
    sibling.add('prototype','procedures_prototype').mutation={proccode:'other'};
    sibling.add('bad','arcade_setLocal',{NAME:{block:'computed'},VALUE:{block:'unknown'}});sibling.add('computed','operator_join');sibling.add('unknown','arcade_createSprite');
    sibling.service.snapshot();assert.equal(sibling.invoke(),'text');
    const captured=local();captured.add('capture','arcade_registerSpriteCreated',{CAPTURES:{block:'capturedName'}}).next='assign';
    captured.add('capturedName','text',{}, {TEXT:{value:'local'}});captured.blocks.write.next='capture';captured.service.snapshot();
    assert.throws(()=>captured.invoke(),/producer authority/);
});

test('installed inspection reporter executes primitive values through Code and saved SB3',async()=>{
    const {runProgram,stepFrames,clearStrayTimers}=await import('./helpers/bw-vm.mjs');
    const code='DEVICE ARCADE\nGLOBAL textResult\nGLOBAL numberResult\nGLOBAL missingResult\nGLOBAL nullResult\nGLOBAL booleanResult\nGLOBAL trace\nGLOBAL orderedResult\nSPRITE Game:\nWHEN arcade source starts:\n  set trace to ("")\n  set orderedResult to (arcade inspect value (arcade call function "value" arguments ("[]")) limit (arcade call function "limit" arguments ("[]")))\n  set textResult to (arcade inspect value ("猫☃") limit (0))\n  set numberResult to (arcade inspect value (-1.25) limit (20))\n  set missingResult to (arcade inspect value (undefined value) limit (20))\n  set nullResult to (arcade inspect value (null value) limit (20))\n  set booleanResult to (arcade inspect value (compare value (1) op "===" with (1)) limit (20))\nDEFINE value:\n  set trace to (calculate value (trace) op "+" with ("V"))\n  arcade return value ("value")\nDEFINE limit:\n  set trace to (calculate value (trace) op "+" with ("L"))\n  arcade return value (20)\n';
    const runs=[];
    const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(target=>Object.values(target.variables)).map(variable=>[variable.name,variable.value]));
    const check=run=>{assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);const v=values(run);for(const [name,value]of Object.entries({textResult:'猫☃',numberResult:'-1.25',missingResult:'undefined',nullResult:'null',booleanResult:'true',trace:'VL',orderedResult:'value'}))assert.equal(v[name],value,name);};
    try {
        const run=await runProgram(code,{frames:3,storage:true});runs.push(run);check(run);
        const replay=await runProgram(run.creator.decompile(),{frames:3,storage:true});runs.push(replay);check(replay);
        const saved=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());run.vm.stopAll();await run.vm.loadProject(saved);run.vm.greenFlag();await stepFrames(run.vm,3);check(run);
        const fresh=await runProgram(code,{frames:0,storage:true});runs.push(fresh);fresh.vm.stopAll();await fresh.vm.loadProject(saved);fresh.vm.greenFlag();await stepFrames(fresh.vm,3);check(fresh);
    } finally {for(const run of runs){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});

test('primitive source inspection preserves effects and current export/reimport through portable projects',async()=>{
    const {arcadeToPseudocode}=await import('../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js');
    const {projectToArcade}=await import('../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js');
    const {runProgram,stepFrames,clearStrayTimers}=await import('./helpers/bw-vm.mjs');
    const source='let onlyUndefined;let emptyResult=console.inspect(onlyUndefined);let uninitialized;let initialResult=console.inspect(uninitialized);uninitialized=4;let laterNumber=console.inspect(uninitialized);uninitialized="later";let laterString=console.inspect(uninitialized);let trace="";function value(){trace+="V";return "value"}function limit(){trace+="L";return 20}let orderedResult=console.inspect(value(),limit());let booleanResult=console.inspect(true);let nullResult=console.inspect(null);let missingResult=console.inspect(undefined);let textResult=console.inspect("猫☃",0);let numberResult=console.inspect(-1.25);';
    const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);assert.deepEqual(imported.warnings,[]);
    const runs=[],check=run=>{assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);const values=Object.fromEntries(run.vm.runtime.targets.flatMap(target=>Object.values(target.variables)).map(variable=>[variable.name,variable.value]));for(const [name,value]of Object.entries({emptyResult:'undefined',initialResult:'undefined',laterNumber:'4',laterString:'later',trace:'VL',orderedResult:'value',booleanResult:'true',nullResult:'null',missingResult:'undefined',textResult:'猫☃',numberResult:'-1.25'}))assert.equal(values[name],value,name);};
    try {
        const run=await runProgram(imported.code,{frames:6,storage:true});runs.push(run);check(run);
        const replay=await runProgram(run.creator.decompile(),{frames:6,storage:true});runs.push(replay);check(replay);
        const saved=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());
        run.vm.stopAll();await run.vm.loadProject(saved);run.vm.greenFlag();await stepFrames(run.vm,6);check(run);
        const fresh=await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0,storage:true});runs.push(fresh);fresh.vm.stopAll();await fresh.vm.loadProject(saved);fresh.vm.greenFlag();await stepFrames(fresh.vm,6);check(fresh);
        const exported=projectToArcade(JSON.parse(run.vm.toJSON()));assert.deepEqual(exported.unsupported,[]);
        const reimported=arcadeToPseudocode(exported.files);assert.deepEqual(reimported.unsupported,[],exported.ts);
        const roundtrip=await runProgram(reimported.code,{frames:6,storage:true});runs.push(roundtrip);check(roundtrip);
    } finally {for(const run of runs){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});
