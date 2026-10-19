import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runArcadeSourceCode as runProgram} from './helpers/arcade-source-program.mjs';
import {stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';

// Selected original compiler: conditional argument staging precedes accessor receiver/getter.
const source="let trace=\"\";let yes=true;function tap(n:number){trace=trace+n;return n}function pair(a:number,b:number){return a*10+b}class Box {constructor(public n:number){}get value():number{trace=trace+\"g\";return this.n}set value(v:number){trace=trace+\"s\";this.n=v}}let box=new Box(2);function receiver(){trace=trace+\"r\";return box}trace=\"\";receiver().value=pair(tap(1),yes?tap(2):tap(8));let assignmentTrace=trace;let assignmentValue=box.n;trace=\"\";receiver().value+=pair(tap(1),yes?tap(2):tap(8));let compoundTrace=trace;let compoundValue=box.n;trace=\"\";let readValue=pair(receiver().value,yes?tap(3):tap(8));let readTrace=trace;assignmentTrace=assignmentTrace+\"\";compoundTrace=compoundTrace+\"\";readTrace=readTrace+\"\";assignmentValue+=0;compoundValue+=0;readValue+=0;";
const expected={
    "assignmentTrace": "2r1s",
    "assignmentValue": 12,
    "compoundTrace": "2rg1s",
    "compoundValue": 24,
    "readTrace": "3rg",
    "readValue": 243
};

test('selected PXT accessor receivers, setters and compound reads keep actual side-effect order across authoring routes', {todo:"procedure constraint producer not yet proven \u2014 see docs/ARCADE-888-OPEN-FAILURES.md"},async()=>{
    const runs=[];
    const check=run=>{
        assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
        const vars=Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
        for(const [name,value] of Object.entries(expected))assert.equal(vars[name],value,name);
    };
    const execute=async imported=>{
        assert.deepEqual(imported.unsupported,[]);assert.deepEqual(imported.warnings,[]);
        const run=await runProgram(imported.code,{frames:12,storage:true});runs.push(run);check(run);return run;
    };
    try{
        const imported=arcadeToPseudocode(source),direct=await execute(imported);
        await execute({...imported,code:direct.creator.decompile()});
        const fresh=await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0,storage:true});runs.push(fresh);
        await fresh.vm.loadProject(Buffer.from(await(await direct.vm.saveProjectSb3()).arrayBuffer()));fresh.vm.greenFlag();await stepFrames(fresh.vm,12);check(fresh);
        const exported=projectToArcade(direct.creator.project);assert.deepEqual(exported.unsupported,[]);assert.deepEqual(exported.warnings,[]);
        const original=await runPxtArcade(exported.files,{fakeClock:true});
        for(const [name,value] of Object.entries(expected))assert.equal(original[name] ?? original['Game_'+name],value,name);
        await execute(arcadeToPseudocode(exported.files));
    }finally{runs.forEach(run=>run.vm.quit());clearStrayTimers();}
});
