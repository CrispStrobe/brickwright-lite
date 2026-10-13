import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
const source=`let numbers=[Math.PI,Math.E,NumberFormat.UInt16LE,Math.LN2,Math.LN10,Math.LOG2E,Math.LOG10E,Math.SQRT1_2,Math.SQRT2]
let pi=numbers[0]
let e=numbers[1]
let format=numbers[2]
let ln2=numbers[3]
let ln10=numbers[4]
let log2e=numbers[5]
let log10e=numbers[6]
let sqrtHalf=numbers[7]
let sqrtTwo=numbers[8]
let incremented=numbers[0]+1
let textValues=["3.14"]
let concatenated=textValues[0]+1
function observe(value:number){return value}
pi=observe(pi)
e=observe(e)
format=observe(format)
ln2=observe(ln2)
ln10=observe(ln10)
log2e=observe(log2e)
log10e=observe(log10e)
sqrtHalf=observe(sqrtHalf)
sqrtTwo=observe(sqrtTwo)
incremented=observe(incremented)`;
const keys=['pi','e','format','ln2','ln10','log2e','log10e','sqrtHalf','sqrtTwo','incremented','concatenated'];
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(target=>Object.values(target.variables)).map(variable=>[variable.name.replace(/^Game_/,''),variable.value]));
test('numeric source constants keep their type in arrays while numeric strings stay strings',async()=>{
    const original=await runPxtArcade(source);
    const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
    const check=run=>{assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);for(const key of keys)assert.equal(values(run)[key],original[key],key);};
    try {
        const run=await runProgram(imported.code,{frames:70,storage:true});check(run);
        check(await runProgram(run.creator.decompile(),{frames:70,storage:true}));
        const exported=projectToArcade(run.creator.project);assert.deepEqual(exported.unsupported,[]);
        const roundtrip=await runPxtArcade(exported.files);for(const key of keys)assert.equal(roundtrip[key]??roundtrip['Game_'+key],original[key],key+' exported');
        const again=arcadeToPseudocode(exported.ts);assert.deepEqual(again.unsupported,[]);check(await runProgram(again.code,{frames:70,storage:true}));
        await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,70);check(run);
    }finally{clearStrayTimers();}
});
