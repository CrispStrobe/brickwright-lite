import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,clearStrayTimers,stepFrames} from './helpers/bw-vm.mjs';
import {importGuiDependency} from './helpers/bw-integrated.mjs';
const BW=(await importGuiDependency('scratch-vm/src/util/bw-values.js')).default;
const source='let effects=0;function numberLabel():number{return 7}function otherLabel():number{return 7}function textLabel():string{return "ok"}function voidLabel():void{effects=19}let first=numberLabel;let alias=numberLabel;let other=otherLabel;let text=textLabel;let effect=voidLabel;let result=first();let message=text();effect();let same=first===alias;let distinct=first!==other;';
const snapshot=run=>{
    const variables=run.vm.runtime.targets.flatMap(target=>Object.values(target.variables));
    return Object.fromEntries(['effects','result','message','same','distinct'].map(name=>[name,BW.decode(variables.find(variable=>variable.name===name)?.value)]));
};
const expected={effects:19,result:7,message:'ok',same:true,distinct:true};
const check=run=>{assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);assert.deepEqual(snapshot(run),expected);};
const targetOf=project=>project.targets.find(target=>Object.values(target.blocks).some(block=>block.opcode==='arcade_createCallable'));

test('real declarations keep stable distinct labels through Code, same/fresh saved and current export/reimport',async()=>{
    const imported=arcadeToPseudocode({'main.ts':source});assert.deepEqual(imported.unsupported,[]);
    const runs=[];
    try{
        const first=await runProgram(imported.code,{frames:30});runs.push(first);check(first);
        const project=JSON.parse(first.vm.toJSON()),code=first.creator.decompile(project);
        const codeRun=await runProgram(code,{frames:30});runs.push(codeRun);check(codeRun);
        const saved=Buffer.from(await first.vm.saveProjectSb3().then(blob=>blob.arrayBuffer()));
        await first.vm.loadProject(saved);first.vm.greenFlag();await stepFrames(first.vm,30);check(first);
        const fresh=await runProgram('DEVICE ARCADE\nSPRITE Game:\nWHEN arcade source starts:\n  hide',{frames:1});runs.push(fresh);
        await fresh.vm.loadProject(saved);fresh.vm.greenFlag();await stepFrames(fresh.vm,30);check(fresh);
        const exported=projectToArcade(project);assert.deepEqual(exported.unsupported,[]);
        assert.match(exported.files['main.ts'],/function numberLabel\(\): number/);
        assert.doesNotMatch(exported.files['main.ts'],/=>\s*\{/);
        const reimport=arcadeToPseudocode(exported.files);assert.deepEqual(reimport.unsupported,[]);
        const replay=await runProgram(reimport.code,{frames:30});runs.push(replay);check(replay);
    }finally{for(const run of runs){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});

test('namespace labels retain actual declaration origin and aliases',async()=>{
    const imported=arcadeToPseudocode({'main.ts':'namespace own{export function read():number{return 7}}let first=own.read;let second=own.read;let result=first();let same=first===second;'});
    assert.deepEqual(imported.unsupported,[]);const runs=[];
    try{const run=await runProgram(imported.code,{frames:25});runs.push(run);assert.deepEqual(run.errors,[]);
        const vars=run.vm.runtime.targets.flatMap(t=>Object.values(t.variables));assert.equal(BW.decode(vars.find(v=>v.name==='result').value),7);assert.equal(vars.find(v=>v.name==='first').value,vars.find(v=>v.name==='second').value);
        const exported=projectToArcade(JSON.parse(run.vm.toJSON()));assert.deepEqual(exported.unsupported,[]);
        const importedAgain=arcadeToPseudocode(exported.files);assert.deepEqual(importedAgain.unsupported,[]);
        const again=await runProgram(importedAgain.code,{frames:25});runs.push(again);assert.deepEqual(again.errors,[]);
    }finally{for(const run of runs){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});

test('actual current Number body edit exports the edited declaration and reimports its new result',async()=>{
    const runs=[];
    try{const run=await runProgram(arcadeToPseudocode({'main.ts':source}).code,{frames:30});runs.push(run);
        const project=JSON.parse(run.vm.toJSON()),target=targetOf(project),proto=Object.values(target.blocks).find(block=>block.opcode==='procedures_prototype'&&block.mutation.proccode==='numberLabel');
        const literals=[];const walk=id=>{const block=target.blocks[id];for(const input of Object.values(block.inputs||{}))for(const child of input.slice(1)) {
            if(typeof child==='string')walk(child);else if(Array.isArray(child)&&child[0]===4&&Number(child[1])===7)literals.push(child);
        }if(block.next)walk(block.next);};walk(target.blocks[proto.parent].next);assert.equal(literals.length,1);literals[0][1]='11';
        const edited=await runProgram(run.creator.decompile(project),{frames:30});runs.push(edited);assert.deepEqual(edited.errors,[]);assert.equal(snapshot(edited).result,11);
        const exported=projectToArcade(project);assert.deepEqual(exported.unsupported,[]);assert.match(exported.files['main.ts'],/return \(0 \+ 11\)/);
        const imported=arcadeToPseudocode(exported.files);assert.deepEqual(imported.unsupported,[]);const replay=await runProgram(imported.code,{frames:30});runs.push(replay);assert.deepEqual(replay.errors,[]);assert.equal(snapshot(replay).result,11);
    }finally{for(const run of runs){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});

test('current incompatible body, same-signature target swap, variable ID swap and foreign writers refuse export',async()=>{
    const run=await runProgram(arcadeToPseudocode({'main.ts':source}).code,{frames:25});
    try{
        for(const mutation of ['return','label-target','variable-ID','foreign-writer','missing-service']) {
            const project=JSON.parse(run.vm.toJSON()),target=targetOf(project);
            if(mutation==='return') {
                const proto=Object.values(target.blocks).find(block=>block.opcode==='procedures_prototype'&&block.mutation.proccode==='numberLabel');
                const root=id=>{while(target.blocks[id].parent)id=target.blocks[id].parent;return id;};
                const row=Object.entries(target.blocks).find(([id,b])=>b.opcode==='arcade_returnValue'&&root(id)===proto.parent);
                const old=row[1].inputs.VALUE[1];if(typeof old==='string'){
                    const remove=id=>{const b=target.blocks[id];for(const input of Object.values(b.inputs||{}))for(const child of input.slice(1))if(typeof child==='string')remove(child);delete target.blocks[id];};remove(old);
                }row[1].inputs.VALUE=[1,[10,'incompatible current Text']];
            }
            if(mutation==='label-target') {
                const create=Object.values(target.blocks).find(b=>b.opcode==='arcade_createCallable'&&Array.isArray(b.inputs.NAME[1])&&b.inputs.NAME[1][1]==='numberLabel');assert.ok(create);create.inputs.NAME[1][1]='otherLabel';
            }
            if(mutation==='variable-ID') {
                const declarations=Object.values(target.blocks).filter(b=>b.opcode==='arcade_declareSourceCallable');assert.ok(declarations.length>1);
                const first=declarations[0].inputs.VARIABLE[1],other=declarations[1].inputs.VARIABLE[1];assert.ok(Array.isArray(first)&&Array.isArray(other));first[1]=other[1];first[2]=other[2];
            }
            if(mutation==='foreign-writer') {
                const stage=project.targets.find(t=>t.isStage),id=Object.entries(stage.variables).find(([,v])=>v[0]==='first')[0];
                project.targets.push({isStage:false,name:'Foreign',variables:{},blocks:{foreign:{opcode:'data_setvariableto',parent:null,next:null,topLevel:true,fields:{VARIABLE:['first',id]},inputs:{VALUE:[1,[10,'wrong']]}}},costumes:[],sounds:[]});
            }
            if(mutation==='missing-service') {
                const entry=Object.entries(target.blocks).find(([,b])=>b.opcode==='arcade_whenCallableDispatched');delete target.blocks[entry[1].next];delete target.blocks[entry[0]];
            }
            const exported=projectToArcade(project);assert.ok(exported.unsupported.some(text=>/Named callable current graph/.test(text)),mutation+': '+JSON.stringify(exported.unsupported));
        }
    }finally{run.vm.stopAll();run.vm.quit();clearStrayTimers();}
});

test('actual named resources refuse stopped, edited, foreign and fabricated callers and renew only on restart',async()=>{
    const imported=arcadeToPseudocode({'main.ts':source}),run=await runProgram(imported.code,{frames:25});
    try{
        const ext=run.vm.runtime._arcadeFramePhase.ext;assert.equal(ext._runtime===run.vm.runtime,true);
        const variable=()=>run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).find(v=>v.name==='first');
        const label=variable().value,target=run.vm.runtime.targets.find(t=>Object.values(t.blocks._blocks).some(b=>b.opcode==='arcade_createCallable'));
        assert.equal(ext._callableValues.hold(label),label);
        assert.throws(()=>ext._callableValues.signature(label),/no qualified class signature/,'a declaration label does not enter the deferred class Holder domain');
        assert.throws(()=>ext._callableValues.create(target,'numberLabel',{sourceModule:true,util:{runtime:run.vm.runtime,target},operationArgs:{NAME:'numberLabel'}}),/actual live declaration read/);
        run.vm.stopAll();assert.throws(()=>ext._callableValues.hold(label),/Stale|stopped|edited/);
        run.vm.greenFlag();await stepFrames(run.vm,25);assert.deepEqual(run.errors,[]);const renewed=variable().value;assert.notEqual(renewed,label);
        const literal=Object.values(target.blocks._blocks).find(b=>b.opcode==='math_number');assert.ok(literal);literal.fields.NUM.value='41';
        assert.throws(()=>ext._callableValues.hold(renewed),/stopped, foreign or edited/);
    }finally{run.vm.stopAll();run.vm.quit();clearStrayTimers();}
});

test('actual Any comparison helper preserves two real formal operands without a name-prefix grant',async()=>{
    const input='function same(left:any,right:any):boolean{return left===right}function one():number{return 7}function two():number{return 7}let first=one;let alias=one;let second=two;let equal=same(first,alias);let distinct=same(first,second);';
    const imported=arcadeToPseudocode({'main.ts':input});assert.deepEqual(imported.unsupported,[]);const runs=[];
    try{const run=await runProgram(imported.code,{frames:25});runs.push(run);assert.deepEqual(run.errors,[]);
        const values=run.vm.runtime.targets.flatMap(target=>Object.values(target.variables));assert.equal(BW.decode(values.find(v=>v.name==='equal').value),true);assert.equal(BW.decode(values.find(v=>v.name==='distinct').value),false);
        const exported=projectToArcade(JSON.parse(run.vm.toJSON()));assert.deepEqual(exported.unsupported,[]);
        const back=arcadeToPseudocode(exported.files);assert.deepEqual(back.unsupported,[]);const again=await runProgram(back.code,{frames:25});runs.push(again);assert.deepEqual(again.errors,[]);
    }finally{for(const run of runs){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});
