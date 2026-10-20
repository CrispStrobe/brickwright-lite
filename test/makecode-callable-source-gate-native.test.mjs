import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {callableSourceGate} from '../overlay/scratch-gui/src/lib/bw-makecode/callable-source-gate.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,clearStrayTimers} from './helpers/bw-vm.mjs';
import {importGuiDependency} from './helpers/bw-integrated.mjs';
const BW=(await importGuiDependency('scratch-vm/src/util/bw-values.js')).default;
test('eligible numeric callable variants preserve aliases and bodies through native export and reimport',async()=>{
    for(const [factory,param,local,initial,increment]of [['advance','initial','total',3,2],['nextValue','score','current',8,7]]) {
        const source=`function ${factory}(${param}:number):()=>number {let ${local}=${param};return()=>{${local}+=${increment};return ${local}}} let a=${factory}(${initial});let alias=a;let b=${factory}(${initial});let resultAlpha=a();let resultBeta=alias();let resultGamma=b();info.setScore(resultAlpha+resultBeta+resultGamma);`;
        assert.deepEqual(callableSourceGate(parseMakeCodeTs(source,{retainCallableMetadata:true,parameterDefaults:true})),{eligible:true,unsupported:[]});
        const imported=arcadeToPseudocode({'main.ts':source},{callableLexicalPrototype:true});
        assert.deepEqual(imported.unsupported,[]);
        const expected=[initial+increment,initial+increment*2,initial+increment];
        const run=await runProgram(imported.code,{frames:40});
        try {
            assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
            const values=run.vm.runtime.targets.flatMap(target=>Object.values(target.variables));
            const read=name=>values.find(value=>value.name===name).value;
            assert.deepEqual(['resultAlpha','resultBeta','resultGamma'].map(name=>BW.decode(read(name))),expected);
            assert.equal(read('a'),read('alias'));assert.notEqual(read('a'),read('b'));
            const exported=projectToArcade(JSON.parse(run.vm.toJSON()),{callableLexicalPrototype:true});
            assert.deepEqual(exported.unsupported,[]);
            assert.deepEqual(callableSourceGate(parseMakeCodeTs(exported.ts,{retainCallableMetadata:true,parameterDefaults:true})),{eligible:true,unsupported:[]});
            assert.match(exported.ts,new RegExp(`function ${factory}\\(`));
            const reimport=arcadeToPseudocode(exported.files,{callableLexicalPrototype:true});
            assert.deepEqual(reimport.unsupported,[]);
            const second=await runProgram(reimport.code,{frames:40});
            try {
                assert.deepEqual(second.errors,[]);
                const actual=second.vm.runtime.targets.flatMap(target=>Object.values(target.variables));
                assert.deepEqual(['resultAlpha','resultBeta','resultGamma'].map(name=>BW.decode(actual.find(value=>value.name===name).value)),expected);
            }finally{second.vm.quit();clearStrayTimers();}
        }finally{run.vm.quit();clearStrayTimers();}
    }
});

test('structural helper eligibility remains independent of helper spelling in real native export',async()=>{
    const source='function combine(left:any,right:any):any{return left+right}function progress(seed:number):()=>number{let value:number=undefined;value=seed;return()=>{value=combine(value,7);return value}}let first=progress(2);let alias=first;let result=alias();info.setScore(result);';
    assert.equal(callableSourceGate(parseMakeCodeTs(source,{retainCallableMetadata:true,parameterDefaults:true})).eligible,true);
    const imported=arcadeToPseudocode({'main.ts':source},{callableLexicalPrototype:true});
    assert.deepEqual(imported.unsupported,[]);
    const run=await runProgram(imported.code,{frames:40});
    try {
        assert.deepEqual(run.errors,[]);
        assert.equal(run.vm.runtime._arcadeFramePhase.ext._state().score,9);
        const exported=projectToArcade(JSON.parse(run.vm.toJSON()),{callableLexicalPrototype:true});
        assert.deepEqual(exported.unsupported,[]);
        const project=JSON.parse(run.vm.toJSON());
        const target=project.targets.find(target=>Object.values(target.blocks).some(block=>block.opcode==='arcade_setLocal'));
        const initial=Object.entries(target.blocks).find(([,block])=>block.opcode==='arcade_setLocal'&&
            target.blocks[block.inputs.VALUE?.[1]]?.opcode==='arrays_specialValue');
        assert.ok(initial);
        const initializedWrite=initial[1].next;
        for(const mutation of ['missingWrite','repeatedUndefined','capturedUndefined']) {
            const changed=structuredClone(project),current=changed.targets.find(row=>row.name===target.name);
            if(mutation==='missingWrite') {
                current.blocks[initial[0]].next=current.blocks[initializedWrite].next;
                current.blocks[current.blocks[initializedWrite].next].parent=initial[0];
                delete current.blocks[initializedWrite];
            } else {
                const destination=mutation==='repeatedUndefined'?initializedWrite:
                    Object.entries(current.blocks).find(([,block])=>block.opcode==='arcade_setCaptured')[0];
                const value=structuredClone(current.blocks[current.blocks[initial[0]].inputs.VALUE[1]]);
                value.parent=destination;
                current.blocks.guardUndefined=value;
                current.blocks[destination].inputs.VALUE=[3,'guardUndefined',[4,'0']];
            }
            assert.match(projectToArcade(changed,{callableLexicalPrototype:true}).unsupported.join(';'),/initialization|assignment differs/);
        }
        const reimport=arcadeToPseudocode(exported.files,{callableLexicalPrototype:true});
        assert.deepEqual(reimport.unsupported,[]);
    }finally{run.vm.quit();clearStrayTimers();}
});
