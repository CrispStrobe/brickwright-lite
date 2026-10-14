import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {importGuiDependency} from './helpers/bw-integrated.mjs';
import {runTimedArcadeProgram} from './helpers/arcade-timed-native.mjs';
const BW=(await importGuiDependency('scratch-vm/src/util/bw-values.js')).default;
const source='class State {value:number;constructor(){this.value=1}}class Holder {read:()=>number;state:State;constructor(state:State){this.state=state;this.read=()=>this.state.value}apply<T>(action:(s:State)=>T):T{return action(this.state)}}let state=new State();let holder=new Holder(state);let n=holder.apply((s:State)=>{s.value+=2;return s.value});let text=holder.apply((s:State)=>"ok");let seen=holder.read();';
const check=run=>{
    assert.deepEqual(run.creator.warnings,[]);assert.deepEqual(run.errors,[]);
    const variables=run.vm.runtime.targets.flatMap(target=>Object.values(target.variables));
    const read=name=>BW.decode(variables.find(variable=>variable.name===name).value);
    assert.deepEqual(['n','text','seen'].map(read),[3,'ok',3]);
    const heap=run.vm.runtime._arcadeFramePhase.ext._objectHeap;
    assert.equal(heap.get(read('holder'),'state'),read('state'),'callback mutation uses the same actual State allocation');
    assert.equal(heap.get(read('state'),'value'),3);
};
test('prototype class callbacks use real managed frames and invocation-local types through Code and same-VM SB3',async()=>{
    const converted=arcadeToPseudocode({'main.ts':source},{classCallablePrototype:true});
    assert.deepEqual(converted.unsupported,[]);
    assert.ok(arcadeToPseudocode({'main.ts':source}).unsupported.length,'default class callback source admission stays closed');
    const run=await runProgram(converted.code,{frames:40});
    try {
        check(run);
        const project=JSON.parse(run.vm.toJSON()),code=run.creator.decompile(project);
        const codeRun=await runProgram(code,{frames:40});
        try {check(codeRun);} finally {codeRun.vm.quit();}
        const saved=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());
        await run.vm.loadProject(saved);run.vm.greenFlag();await stepFrames(run.vm,40);check(run);
        const fresh=await runProgram('DEVICE ARCADE\nSPRITE Game:\nWHEN flag clicked:\n  hide\n',{frames:0});
        try {await fresh.vm.loadProject(saved);fresh.vm.greenFlag();await stepFrames(fresh.vm,40);check(fresh);}finally{fresh.vm.quit();}
    } finally {run.vm.quit();clearStrayTimers();}
});

test('typed generic result cells are undefined before constructors run and a copied callback retains its original receiver',async()=>{
    const extended='let early=false;'+source.replace('this.value=1','early=early || n===undefined;this.value=1')+
        'let secondState=new State();let second=new Holder(secondState);second.read=holder.read;state.value=9;let aliasSeen=second.read();let secondValue=secondState.value;';
    const converted=arcadeToPseudocode({'main.ts':extended},{classCallablePrototype:true});assert.deepEqual(converted.unsupported,[]);
    const run=await runProgram(converted.code,{frames:60});
    try {
        assert.deepEqual(run.creator.warnings,[]);assert.deepEqual(run.errors,[]);
        const read=name=>BW.decode(run.vm.runtime.targets.flatMap(target=>Object.values(target.variables)).find(value=>value.name===name).value);
        // Retain the first constructor observation across later allocations.
        assert.equal(read('early'),true);assert.equal(read('aliasSeen'),9);assert.equal(read('secondValue'),1);
    }finally{run.vm.quit();clearStrayTimers();}
});

test('actual class callback pause suspends its caller and later invocation retains String specialization',async()=>{
    const paused=source.replace('s.value+=2;','pause(40);s.value+=2;');
    const converted=arcadeToPseudocode({'main.ts':paused},{classCallablePrototype:true});assert.deepEqual(converted.unsupported,[]);
    assert.match(converted.code,/declare arcade source scalar n as Number/);
    assert.match(converted.code,/declare arcade source scalar text as String/);
    const run=await runTimedArcadeProgram(converted.code,{milliseconds:0,retainExtensionTimers:true});
    try {
        const variable=name=>run.vm.runtime.targets.flatMap(target=>Object.values(target.variables)).find(value=>value.name===name);
        assert.equal(BW.decode(variable('n').value),undefined);
        await run.clock.advanceTo(39);assert.equal(BW.decode(variable('n').value),undefined);assert.equal(BW.decode(variable('text').value),undefined);
        await run.clock.advanceTo(40);check(run);
    }finally{run.vm.quit();clearStrayTimers();}
});

test('Stop cancels the real paused class call and makes its captured receiver resource stale',async()=>{
    const paused=source.replace('s.value+=2;','pause(40);s.value+=2;');
    const converted=arcadeToPseudocode({'main.ts':paused},{classCallablePrototype:true});assert.deepEqual(converted.unsupported,[]);
    const run=await runTimedArcadeProgram(converted.code,{milliseconds:0,retainExtensionTimers:true});
    try {
        const variables=run.vm.runtime.targets.flatMap(target=>Object.values(target.variables));
        const held=variables.find(value=>value.name==='holder').value,ext=run.vm.runtime._arcadeFramePhase.ext;
        const captured=ext._objectHeap.get(held,'read');
        run.vm.stopAll();await run.clock.advanceTo(80);
        assert.throws(()=>ext._callableValues.hold(captured),/Stale or foreign callable/);
        assert.equal(BW.decode(variables.find(value=>value.name==='n').value),undefined);
        assert.equal(BW.decode(variables.find(value=>value.name==='text').value),undefined);
        assert.deepEqual(run.errors,[]);
    }finally{run.vm.quit();clearStrayTimers();}
});
