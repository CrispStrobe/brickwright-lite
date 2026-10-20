import {test} from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,clearStrayTimers,stepFrames} from './helpers/bw-vm.mjs';
import {importGuiDependency} from './helpers/bw-integrated.mjs';
const BW=(await importGuiDependency('scratch-vm/src/util/bw-values.js')).default;
const source='function advance(initial:number):()=>number{let total=initial;return()=>{total+=2;return total}}let first=advance(3);let alias=first;let second=advance(3);let outputAlpha=first();let outputBeta=alias();let outputGamma=second();info.setScore(outputAlpha+outputBeta+outputGamma);';

test('default numeric callable admission preserves aliases and current export through fresh Code and SB3',async()=>{
    const imported=arcadeToPseudocode({'main.ts':source});
    assert.deepEqual(imported.unsupported,[]);
    const run=await runProgram(imported.code,{frames:40});
    try {
        assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
        const check=(vm,expected=[5,7,5])=>{
            const variables=vm.runtime.targets.flatMap(target=>Object.values(target.variables));
            const read=name=>variables.find(value=>value.name===name).value;
            assert.deepEqual(['outputAlpha','outputBeta','outputGamma'].map(name=>BW.decode(read(name))),expected);
            assert.equal(read('first'),read('alias'));assert.notEqual(read('first'),read('second'));
        };
        check(run.vm);
        await run.vm.loadProject(run.buffer);run.vm.greenFlag();run.vm.quit();await stepFrames(run.vm,40);
        check(run.vm);assert.deepEqual(run.errors,[]);
        const project=JSON.parse(run.vm.toJSON());
        const replay=await runProgram(run.creator.decompile(project),{frames:40});
        try{assert.deepEqual(replay.errors,[]);check(replay.vm);}finally{replay.vm.quit();clearStrayTimers();}
        const target=project.targets.find(row=>Object.values(row.blocks).some(block=>block.opcode==='arcade_setCaptured'));
        const setter=Object.values(target.blocks).find(block=>block.opcode==='arcade_setCaptured');
        const literals=[];
        const scan=id=>{const block=target.blocks[id];for(const input of Object.values(block.inputs || {}))for(const value of input.slice(1)){if(typeof value==='string')scan(value);else if(Array.isArray(value)&&value[0]===4&&Number(value[1])===2)literals.push(value);}};
        scan(setter.inputs.VALUE[1]);assert.equal(literals.length,1);
        literals[0][1]='5';
        const editedReplay=await runProgram(run.creator.decompile(project),{frames:40});
        try{assert.deepEqual(editedReplay.errors,[]);check(editedReplay.vm,[8,13,8]);}finally{editedReplay.vm.quit();clearStrayTimers();}
        const exported=projectToArcade(project);
        assert.deepEqual(exported.unsupported,[]);
        assert.match(exported.ts,/function advance\(/);
        assert.match(exported.ts,/=>/);
        const reimport=arcadeToPseudocode(exported.files);
        assert.deepEqual(reimport.unsupported,[]);
        const fresh=await runProgram(reimport.code,{frames:40});
        try{assert.deepEqual(fresh.errors,[]);check(fresh.vm,[8,13,8]);}finally{fresh.vm.quit();clearStrayTimers();}
        const malformed=structuredClone(project);
        const declaration=malformed.targets.flatMap(target=>Object.values(target.blocks)).find(block=>block.opcode==='arcade_declareCallable');
        assert.ok(declaration);
        declaration.inputs.METADATA=[1,[10,'{}']];
        assert.ok(projectToArcade(malformed).unsupported.length);
    }finally{run.vm.quit();clearStrayTimers();}
});

test('default admission preserves diagnostics for adjacent broader callables and ordinary source behavior',()=>{
    for(const refused of [source.replace('initial:number','initial:number=2'),source.replace('return()=>','return function()'),source+'controller.A.onEvent(ControllerButtonEvent.Pressed,()=>{info.setScore(2)});']) {
        assert.ok(arcadeToPseudocode({'main.ts':refused}).unsupported.length,refused);
    }
    const ordinary=arcadeToPseudocode({'main.ts':'let scoreValue=3;info.setScore(scoreValue);'});
    assert.deepEqual(ordinary.unsupported,[]);
    assert.doesNotMatch(ordinary.code,/declare arcade source callable|arcade declare callable/);
});
