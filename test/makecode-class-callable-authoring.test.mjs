import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,clearStrayTimers} from './helpers/bw-vm.mjs';
import {importGuiDependency} from './helpers/bw-integrated.mjs';
const BW=(await importGuiDependency('scratch-vm/src/util/bw-values.js')).default;
import {source} from './fixtures/arcade-class-callable-source.mjs';
const check=(run,expected)=>{
    assert.deepEqual(run.creator.warnings,[]);assert.deepEqual(run.errors,[]);
    const variables=run.vm.runtime.targets.flatMap(target=>Object.values(target.variables));
    const read=name=>BW.decode(variables.find(value=>value.name===name).value);
    assert.deepEqual(['n','text','seen'].map(read),[expected,'ok',expected]);
    const heap=run.vm.runtime._arcadeFramePhase.ext._objectHeap;
    assert.equal(heap.get(read('holder'),'state'),read('state'));assert.equal(heap.get(read('state'),'value'),expected);
};
test('class prototype export renders current typed closures and reimports an actual callback edit',async()=>{
    const converted=arcadeToPseudocode({'main.ts':source},{classCallablePrototype:true});assert.deepEqual(converted.unsupported,[]);
    const run=await runProgram(converted.code,{frames:40});
    try{
        check(run,3);
        const project=JSON.parse(run.vm.toJSON());
        const initial=projectToArcade(project,{classCallablePrototype:true});assert.deepEqual(initial.unsupported,[]);
        assert.match(initial.ts,/apply<T>\(action: \(s: State\) => T\): T/);
        assert.match(initial.ts,/let __bwPxtValue1: State = new State\(\)/);
        assert.doesNotMatch(initial.ts,/_na|let __bwObject\w+: any/);
        const reimport=arcadeToPseudocode(initial.files,{classCallablePrototype:true});assert.deepEqual(reimport.unsupported,[]);
        const replay=await runProgram(reimport.code,{frames:60});try{check(replay,3);}finally{replay.vm.quit();}
        const blocks=project.targets.flatMap(target=>Object.values(target.blocks));
        const mutation=blocks.find(block=>{
            if(block.opcode!=='arrays_valueBinary'||block.fields.OP?.[0]!=='+')return false;
            const target=project.targets.find(target=>Object.values(target.blocks).includes(block));
            const right=target.blocks[block.inputs.RIGHT?.[1]];return right?.opcode==='operator_add'&&right.inputs.NUM2?.[1]?.[1]==='2';
        });assert.ok(mutation);
        const target=project.targets.find(target=>Object.values(target.blocks).includes(mutation));
        const right=target.blocks[mutation.inputs.RIGHT[1]];assert.equal(right.opcode,'operator_add');assert.equal(right.inputs.NUM2[1][1],'2');
        right.inputs.NUM2[1][1]='7';
        const editedCode=run.creator.decompile(project),edited=await runProgram(editedCode,{frames:60});
        try{
            check(edited,8);
            const exported=projectToArcade(JSON.parse(edited.vm.toJSON()),{classCallablePrototype:true});assert.deepEqual(exported.unsupported,[]);
            assert.match(exported.ts,/\(0 \+ 7\)/);
            const again=arcadeToPseudocode(exported.files,{classCallablePrototype:true});assert.deepEqual(again.unsupported,[]);
            const final=await runProgram(again.code,{frames:80});try{check(final,8);}finally{final.vm.quit();}
        }finally{edited.vm.quit();}
    }finally{run.vm.quit();clearStrayTimers();}
});
test('only a finished v2 declaration-owner factory gains managed void dispatch',()=>{
    const wrapped=source.slice(0,source.indexOf('n+=0;')).replace('let n=holder.apply','function factory(){let n=holder.apply').replace('let seen=holder.read();','let seen=holder.read();}factory();')+'function innocent(){let number=1;}innocent();';
    const converted=arcadeToPseudocode({'main.ts':wrapped},{classCallablePrototype:true});assert.deepEqual(converted.unsupported,[]);
    assert.match(converted.code,/arcade call function "factory" arguments/);
    assert.match(converted.code,/CALL: \(innocent\)/);
    assert.doesNotMatch(converted.code,/arcade call function "innocent"/);
    const plain=arcadeToPseudocode({'main.ts':'function __bwStartup(){let number=1;}__bwStartup();'});
    assert.deepEqual(plain.unsupported,[]);assert.doesNotMatch(plain.code,/arcade call function "__bwStartup"/);
});
test('managed void factory discard never overwrites authored formal or local cells',async()=>{
    const declarations=source.slice(0,source.indexOf('let state='));
    const body='function factory(){let state=new State();let holder=new Holder(state);let value=holder.apply((s:State)=>s.value);}'
        +'let formalSeen=0;let suffixSeen=0;let localSeen=0;'
        +'function caller(__bwDiscardCallableFactoryResult:number){factory();formalSeen=__bwDiscardCallableFactoryResult;}'
        +'function suffixCaller(__bwDiscardCallableFactoryResult1:number){factory();suffixSeen=__bwDiscardCallableFactoryResult1;}'
        +'function localCaller(){let __bwDiscardCallableFactoryResult1=41;factory();localSeen=__bwDiscardCallableFactoryResult1;}'
        +'caller(41);suffixCaller(42);localCaller();';
    const converted=arcadeToPseudocode({'main.ts':declarations+body},{classCallablePrototype:true});assert.deepEqual(converted.unsupported,[]);
    assert.doesNotMatch(converted.code,/arcade set local __bwDiscardCallableFactoryResult(?:1)? to \(arcade call function "factory"/);
    const run=await runProgram(converted.code,{frames:60});
    try{
        assert.deepEqual(run.creator.warnings,[]);assert.deepEqual(run.errors,[]);
        const variables=run.vm.runtime.targets.flatMap(target=>Object.values(target.variables));
        for(const [name,value] of [['formalSeen',41],['suffixSeen',42],['localSeen',41]])assert.equal(BW.decode(variables.find(cell=>cell.name===name).value),value,name);
    }finally{run.vm.quit();clearStrayTimers();}
});

test('ordinary object discard preserves an authored method parameter',async()=>{
    const input='class Box {value:number;constructor(){this.value=1;}change(__bwDiscardObjectResult:number){this.value+=2;return __bwDiscardObjectResult;}localChange(){let __bwDiscardObjectResult1=42;this.value+=2;return __bwDiscardObjectResult1;}}let box=new Box();let result=box.change(41);let localResult=box.localChange();';
    const converted=arcadeToPseudocode({'main.ts':input});assert.deepEqual(converted.unsupported,[]);
    const run=await runProgram(converted.code,{frames:40});
    try{assert.deepEqual(run.errors,[]);const cell=run.vm.runtime.targets.flatMap(target=>Object.values(target.variables)).find(value=>value.name==='result');assert.equal(BW.decode(cell.value),41);const localCell=run.vm.runtime.targets.flatMap(target=>Object.values(target.variables)).find(value=>value.name==='localResult');assert.equal(BW.decode(localCell.value),42);const exported=projectToArcade(JSON.parse(run.vm.toJSON()));assert.deepEqual(exported.unsupported,[]);assert.match(exported.ts,/return __bwDiscardObjectResult/);}finally{run.vm.quit();clearStrayTimers();}
});

test('stored callable discard preserves an authored formal and inherited initializers roundtrip',async()=>{
    const declarations=source.slice(0,source.indexOf('let state='));
    const input=declarations+'let state=new State();let holder=new Holder(state);let kept=0;let localKept=0;function localCaller(){let __bwDiscardCallableResult1=42;holder.read();localKept=__bwDiscardCallableResult1;}function caller(__bwDiscardCallableResult:number){holder.read();kept=__bwDiscardCallableResult;}caller(41);localCaller();';
    const converted=arcadeToPseudocode({'main.ts':input},{classCallablePrototype:true});assert.deepEqual(converted.unsupported,[]);
    const run=await runProgram(converted.code,{frames:50});
    try{assert.deepEqual(run.errors,[]);const cell=run.vm.runtime.targets.flatMap(target=>Object.values(target.variables)).find(value=>value.name==='kept');assert.equal(BW.decode(cell.value),41);const localCell=run.vm.runtime.targets.flatMap(target=>Object.values(target.variables)).find(value=>value.name==='localKept');assert.equal(BW.decode(localCell.value),42);}finally{run.vm.quit();clearStrayTimers();}
    const inherited='class Base {value:number=2;constructor(){}}class Child extends Base {other:number=3;constructor(){super();}}let child=new Child();let total=child.value+child.other;';
    const code=arcadeToPseudocode({'main.ts':inherited});assert.deepEqual(code.unsupported,[]);
    const initial=await runProgram(code.code,{frames:40});
    try{assert.deepEqual(initial.errors,[]);const exported=projectToArcade(JSON.parse(initial.vm.toJSON()));assert.deepEqual(exported.unsupported,[]);const again=arcadeToPseudocode(exported.files);assert.deepEqual(again.unsupported,[]);const replay=await runProgram(again.code,{frames:40});try{assert.deepEqual(replay.errors,[]);const cell=replay.vm.runtime.targets.flatMap(target=>Object.values(target.variables)).find(value=>value.name==='total');assert.equal(BW.decode(cell.value),5);}finally{replay.vm.quit();}}finally{initial.vm.quit();clearStrayTimers();}
});

test('composed numeric default admission keeps the stored class callback profile explicitly gated',async()=>{
    const closed=arcadeToPseudocode({'main.ts':source});assert.notEqual(closed.unsupported.length,0);
    const prototype=arcadeToPseudocode({'main.ts':source},{classCallablePrototype:true});assert.deepEqual(prototype.unsupported,[]);
    const run=await runProgram(prototype.code,{frames:40});
    try{const project=JSON.parse(run.vm.toJSON());assert.notEqual(projectToArcade(project).unsupported.length,0);assert.deepEqual(projectToArcade(project,{classCallablePrototype:true}).unsupported,[]);}finally{run.vm.quit();clearStrayTimers();}
});
