import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames,quitStrandedVMs,clearStrayTimers} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import BW from '../overlay/scratch-vm/src/util/bw-values.js';

const source=`let trace=0;
function text():string {trace=trace*10+1;return "123";}
function index():number {trace=trace*10+2;return 1;}
function before():number {trace=trace*10+3;return 0;}
let n=text().length;let c=text().charAt(index());let basicTrace=trace;
trace=0;let nested=(""+before())+text().charAt(index());let nestedTrace=trace;
trace=0;let skipped=false?text().charAt(index()):"safe";let chosen=true?text().charAt(index()):"bad";let lazyTrace=trace;
trace=0;let i=0;while(text().charAt(index())==="2" && i<2){i++;continue;}let loopTrace=trace;
trace=0;let staged=text().charAt(index()===1?1:0);let stagedTrace=trace;
let receiver="abc";function changingIndex():number {receiver="xyz";return 1;}
let captured=receiver.charAt(changingIndex());
let at=1;function changingText():string {at=2;return "abc";}
let changed=changingText().charAt(at);
let negative="abc".charAt(-1);let outside="abc".charAt(99);`;
const expected={n:3,c:'2',basicTrace:112,nested:'02',nestedTrace:312,skipped:'safe',chosen:'2',lazyTrace:12,
    i:2,loopTrace:121212,staged:'2',stagedTrace:21,captured:'b',changed:'c',negative:'',outside:''};
const select=values=>Object.fromEntries(Object.keys(expected).map(key=>[key,values[key]]));
const translate=source=>{const result=arcadeToPseudocode(source);assert.deepEqual(result.unsupported,[]);return result.code;};
const check=run=>{
    assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
    const values=Object.fromEntries(run.vm.runtime.targets.flatMap(target=>Object.values(target.variables)).map(v=>[v.name.replace(/^(?:Game_)+/,''),BW.decode(v.value)]));
    assert.deepEqual(select(values),expected);
};

test('charAt matches actual PXT receiver/index staging through VM, export/reimport and fresh SB3', {timeout:180000},async()=>{
    let run;
    try {
        const original=await runPxtArcade(source,{fakeClock:true,waitForGlobals:{stagedTrace:21}});
        assert.deepEqual(select(original),expected);
        let current=source;
        for(let generation=0;generation<3;generation++) {
            run=await runProgram(translate(current),{frames:30,storage:true,countExtensionCalls:false});check(run);
            const output=projectToArcade(JSON.parse(run.vm.toJSON()));assert.deepEqual(output.unsupported,[]);
            const saved=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());run.vm.quit();run=null;
            const pxt=await runPxtArcade(output.files,{fakeClock:true,waitForGlobals:{stagedTrace:21}});assert.deepEqual(select(pxt),expected);
            run=await runProgram('DEVICE ARCADE\nSPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0,storage:true,countExtensionCalls:false});
            run.vm.stopAll();await run.vm.loadProject(saved);run.vm.greenFlag();await stepFrames(run.vm,30);check(run);run.vm.quit();run=null;
            current=output.files;
        }
    } finally {run?.vm.quit();quitStrandedVMs();clearStrayTimers();}
});

test('charAt keeps omitted-index VM semantics',async()=>{
    let run;
    try {
        run=await runProgram(translate('let c="abc".charAt();'),{frames:20,countExtensionCalls:false});
        assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
        const value=run.vm.runtime.targets.flatMap(target=>Object.values(target.variables)).find(v=>v.name==='c');
        assert.equal(BW.decode(value.value),'a');
    } finally {run?.vm.quit();quitStrandedVMs();clearStrayTimers();}
});
