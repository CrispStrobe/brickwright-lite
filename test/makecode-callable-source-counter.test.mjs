import {test} from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runProgram,clearStrayTimers,stepFrames} from './helpers/bw-vm.mjs';
import {importGuiDependency} from './helpers/bw-integrated.mjs';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
const BW=(await importGuiDependency('scratch-vm/src/util/bw-values.js')).default;
export const counterSource='function makeCounter(start:number):()=>number {let n=start;return()=>{n+=1;return n}} let first=makeCounter(2); let alias=first; let second=makeCounter(2); let result1=first(); let result2=alias(); let result3=second(); info.setScore(result1+result2+result3);';
test('opt-in source counter uses current native captures and actual typed source variable declarations',async()=>{
    const imported=arcadeToPseudocode({'main.ts':counterSource},{callableLexicalPrototype:true});
    assert.deepEqual(imported.unsupported,[]);
    assert.match(imported.code,/arcade set captured __bwCallableCell_/);
    assert.doesNotMatch(imported.code,/^  set __bwCallableCell_/m);
    assert.equal((imported.code.match(/declare arcade source callable/g)||[]).length,3);
    const run=await runProgram(imported.code,{frames:40});
    try {
        assert.deepEqual(run.creator.warnings,[]);assert.deepEqual(run.errors,[]);
        const variables=run.vm.runtime.targets.flatMap(target=>Object.values(target.variables));
        const read=name=>variables.find(variable=>variable.name===name)?.value;
        assert.deepEqual(['result1','result2','result3'].map(name=>BW.decode(read(name))),[3,4,3]);
        assert.equal(read('first'),read('alias'));assert.notEqual(read('first'),read('second'));
        assert.equal(run.vm.runtime._arcadeFramePhase.ext._state().score,10);
    }finally{run.vm.quit();clearStrayTimers();}
});
test('bounded default source admission preserves the authored intrinsic namespace refusal',()=>{
    assert.deepEqual(arcadeToPseudocode({'main.ts':counterSource}).unsupported,[]);
    const result=arcadeToPseudocode({'main.ts':'let __bwCallables=2; '+counterSource},{callableLexicalPrototype:true});
    assert.match(result.unsupported.join(';'),/Authored __bwCallables binding conflicts/);
});

test('current source callable blocks export genuine closures and reimport their edited body',async()=>{
    const imported=arcadeToPseudocode({'main.ts':counterSource},{callableLexicalPrototype:true});
    assert.deepEqual(imported.unsupported,[]);
    assert.match(imported.code,/declare arcade source scalar result1 as Number/);
    const first=await runProgram(imported.code,{frames:40});
    try {
        const project=JSON.parse(first.vm.toJSON());
        const target=project.targets.find(target=>Object.values(target.blocks).some(block=>block.opcode==='arcade_createCallable'));
        const root=id=>{const seen=new Set();while(target.blocks[id].parent){assert.ok(!seen.has(id));seen.add(id);id=target.blocks[id].parent;}return id;};
        const prototype=Object.entries(target.blocks).find(([,block])=>block.opcode==='procedures_prototype'&&block.mutation.proccode==='__bwCallable_1');
        const capturedSet=Object.entries(target.blocks).filter(([id,block])=>block.opcode==='arcade_setCaptured'&&root(id)===prototype[1].parent);
        assert.equal(capturedSet.length,1);
        const literals=[];
        const scan=id=>{const block=target.blocks[id];for(const input of Object.values(block.inputs || {})){for(const value of input.slice(1)){if(typeof value==='string')scan(value);else if(Array.isArray(value)&&value[0]===4&&Number(value[1])===1)literals.push(value);}}};
        scan(capturedSet[0][0]);
        const increments=literals;
        assert.equal(increments.length,1,'actual current closure body has one increment literal');
        increments[0][1]='7';
        // Stable variable IDs, not metadata names, own renamed source globals.
        const alias=Object.entries(project.targets.find(target=>target.isStage).variables).find(([,value])=>value[0]==='alias');
        assert.ok(alias);alias[1][0]='renamedAlias';
        for(const block of Object.values(target.blocks)) {
            if(block.fields?.VARIABLE?.[1]===alias[0])block.fields.VARIABLE[0]='renamedAlias';
            for(const input of Object.values(block.inputs || {}))for(const value of input.slice(1))if(Array.isArray(value)&&value[0]===12&&value[2]===alias[0])value[1]='renamedAlias';
        }
        const code=first.creator.decompile(project);
        const edited=await runProgram(code,{frames:40});
        try {
            assert.deepEqual(edited.creator.warnings,[]);assert.deepEqual(edited.errors,[]);
            const values=edited.vm.runtime.targets.flatMap(target=>Object.values(target.variables));
            const read=name=>BW.decode(values.find(variable=>variable.name===name)?.value);
            assert.deepEqual(['result1','result2','result3'].map(read),[9,16,9]);
            const stale=values.find(variable=>variable.name==='first').value;
            const ext=edited.vm.runtime._arcadeFramePhase.ext;
            await edited.vm.loadProject(edited.buffer);edited.vm.greenFlag();edited.vm.quit();await stepFrames(edited.vm,40);
            assert.throws(()=>ext.holdCallable(stale),/Stale or foreign callable/);
            assert.deepEqual(['result1','result2','result3'].map(name=>BW.decode(edited.vm.runtime.targets.flatMap(target=>Object.values(target.variables)).find(variable=>variable.name===name)?.value)),[9,16,9]);
        }finally{edited.vm.quit();clearStrayTimers();}
        const exported=projectToArcade(project,{callableLexicalPrototype:true});
        assert.deepEqual(exported.unsupported,[]);
        assert.match(exported.ts,/function makeCounter\(start: number\): \(\) => number/);
        assert.match(exported.ts,/return \(\) =>/);
        assert.doesNotMatch(exported.ts,/let result1[^\n]*= 3/);
        const reimport=arcadeToPseudocode(exported.files,{callableLexicalPrototype:true});
        assert.deepEqual(reimport.unsupported,[]);
        const second=await runProgram(reimport.code,{frames:40});
        try {
            assert.deepEqual(second.errors,[]);
            const variables=second.vm.runtime.targets.flatMap(target=>Object.values(target.variables));
            const read=name=>BW.decode(variables.find(variable=>variable.name===name)?.value);
            assert.deepEqual(['result1','result2','result3'].map(read),[9,16,9]);
        }finally{second.vm.quit();clearStrayTimers();}
    }finally{first.vm.quit();clearStrayTimers();}
});

test('reserved parameter names use actual native procedure binding identities',async()=>{
    const imported=arcadeToPseudocode({'main.ts':counterSource.replaceAll('start','score')},{callableLexicalPrototype:true});
    assert.deepEqual(imported.unsupported,[]);
    const run=await runProgram(imported.code,{frames:40});
    try {
        assert.deepEqual(run.errors,[]);
        const exported=projectToArcade(JSON.parse(run.vm.toJSON()),{callableLexicalPrototype:true});
        assert.deepEqual(exported.unsupported,[]);
        assert.match(exported.ts,/function makeCounter\(score: number\)/);
        const again=arcadeToPseudocode(exported.files,{callableLexicalPrototype:true});
        assert.deepEqual(again.unsupported,[]);
        const second=await runProgram(again.code,{frames:40});
        try {
            assert.deepEqual(second.errors,[]);
            assert.equal(second.vm.runtime._arcadeFramePhase.ext._state().score,10);
        }finally{second.vm.quit();clearStrayTimers();}
    }finally{run.vm.quit();clearStrayTimers();}
});

test('actual current return and assignment edits cannot inherit old concrete signature authority',async()=>{
    const imported=arcadeToPseudocode({'main.ts':counterSource},{callableLexicalPrototype:true});
    const run=await runProgram(imported.code,{frames:40});
    try {
        for(const opcode of ['arcade_returnValue','arcade_setCaptured']) {
            const project=JSON.parse(run.vm.toJSON());
            const target=project.targets.find(target=>Object.values(target.blocks).some(block=>block.opcode==='arcade_createCallable'));
            const definition=Object.values(target.blocks).find(block=>block.opcode==='procedures_prototype'&&block.mutation.proccode==='__bwCallable_1').parent;
            const root=id=>{while(target.blocks[id].parent)id=target.blocks[id].parent;return id;};
            const entry=Object.entries(target.blocks).find(([id,block])=>block.opcode===opcode&&root(id)===definition);
            assert.ok(entry);entry[1].inputs.VALUE=[1,[10,'edited String']];
            const exported=projectToArcade(project,{callableLexicalPrototype:true});
            assert.match(exported.unsupported.join(';'),/edited current (return|assignment) differs from its concrete lexical signature/);
        }
    }finally{run.vm.quit();clearStrayTimers();}
});

test('saved resources refuse current declaration site, capture and default edits',async()=>{
    const imported=arcadeToPseudocode({'main.ts':counterSource},{callableLexicalPrototype:true});
    const run=await runProgram(imported.code,{frames:40});
    try {
        const ext=run.vm.runtime._arcadeFramePhase.ext;
        const reference=run.vm.runtime.targets.flatMap(target=>Object.values(target.variables)).find(variable=>variable.name==='first').value;
        const target=run.vm.runtime.targets.find(target=>Object.values(target.blocks._blocks).some(block=>block.opcode==='arcade_declareCallable'));
        const declaration=Object.values(target.blocks._blocks).find(block=>block.opcode==='arcade_declareCallable');
        const metadata=target.blocks.getBlock(declaration.inputs.METADATA.block),original=metadata.fields.TEXT.value;
        for(const mutate of [
            value=>{value.site='foreign_site';},
            value=>{value.plan.sites[0].captures[0].mode='value';},
            value=>{value.plan.sites[0].defaults=[{name:'foreign',value:4}];}
        ]) {
            const value=JSON.parse(original);mutate(value);metadata.fields.TEXT.value=JSON.stringify(value);
            assert.throws(()=>ext.holdCallable(reference),/metadata changed after registration/);
            assert.throws(()=>ext._callableValues.invocation(reference,[]),/metadata changed after registration/);
            metadata.fields.TEXT.value=original;
            assert.equal(ext.holdCallable(reference),reference);
        }
    }finally{run.vm.quit();clearStrayTimers();}
});

test('same-signature connected IDs cannot swap while immutable lexical envelope bindings stay unchanged',async()=>{
 const imported=arcadeToPseudocode({'main.ts':counterSource},{callableLexicalPrototype:true});
 const run=await runProgram(imported.code,{frames:40});
 try {
  const ext=run.vm.runtime._arcadeFramePhase.ext;
  const target=run.vm.runtime.targets.find(target=>Object.values(target.blocks._blocks).some(block=>block.opcode==='arcade_declareSourceCallable'));
  const declarations=Object.values(target.blocks._blocks).filter(block=>block.opcode==='arcade_declareSourceCallable');
  const reporter=block=>target.blocks.getBlock(block.inputs.VARIABLE.block);
  const a=declarations.find(block=>reporter(block).fields.VARIABLE.value==='first');
  const b=declarations.find(block=>reporter(block).fields.VARIABLE.value==='second');
  assert.ok(a&&b);const left=reporter(a),right=reporter(b),original=left.fields.VARIABLE;
  left.fields.VARIABLE=right.fields.VARIABLE;right.fields.VARIABLE=original;
  const before=run.vm.runtime.targets.flatMap(target=>Object.values(target.variables)).map(variable=>[variable,variable.value]);
  assert.throws(()=>ext._sourceScalarCells.initialize(),/binding|anchor|identity/);
  for(const [variable,value]of before)assert.equal(variable.value,value,'failed atomic prelude preserves every saved value');
  assert.match(projectToArcade(JSON.parse(run.vm.toJSON()),{callableLexicalPrototype:true}).unsupported.join(';'),/ID seal differs/);
  assert.throws(()=>run.creator.decompile(JSON.parse(run.vm.toJSON())),/ID seal changed/);
 }finally{run.vm.quit();clearStrayTimers();}
});

test('source capture cells survive scene changes and restart resets resource generations',async()=>{
    const source='function makeCounter(start:number):()=>number {let n=start;return()=>{n+=1;return n}} let first=makeCounter(2); game.pushScene(); let child=first(); game.popScene(); let parent=first(); info.setScore(child+parent);';
    const imported=arcadeToPseudocode({'main.ts':source},{callableLexicalPrototype:true});
    assert.deepEqual(imported.unsupported,[]);
    const run=await runProgram(imported.code,{frames:40});
    try {
        assert.deepEqual(run.errors,[]);
        const variables=()=>run.vm.runtime.targets.flatMap(target=>Object.values(target.variables));
        const read=name=>variables().find(variable=>variable.name===name)?.value;
        assert.deepEqual(['child','parent'].map(name=>BW.decode(read(name))),[3,4]);
        const ext=run.vm.runtime._arcadeFramePhase.ext,old=read('first');
        run.vm.stopAll();assert.throws(()=>ext.holdCallable(old),/Stale or foreign/);
        run.vm.greenFlag();run.vm.quit();await stepFrames(run.vm,40);
        assert.deepEqual(run.errors,[]);
        assert.deepEqual(['child','parent'].map(name=>BW.decode(read(name))),[3,4]);
        assert.notEqual(read('first'),old);
        assert.throws(()=>ext.holdCallable(old),/Stale or foreign/);
    }finally{run.vm.quit();clearStrayTimers();}
});
