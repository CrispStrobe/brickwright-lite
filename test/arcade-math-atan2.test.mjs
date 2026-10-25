import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {loadExtensionClass,stubRuntime,VM_SRC} from './helpers/bw-extensions.mjs';
import {runProgram,stepFrames,clearStrayTimers,quitStrandedVMs} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade,projectJsonToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';

const require=createRequire(import.meta.url),values=require(VM_SRC+'/util/bw-values.js');
const make=()=>new(loadExtensionClass('arcade'))(stubRuntime());
const vars=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(target=>Object.values(target.variables))
    .map(variable=>[variable.name.replace(/^Game_/,''),values.decode(variable.value)]));
const clean=result=>{assert.deepEqual(result.unsupported,[]);assert.deepEqual(result.warnings||[],[]);};
const ownedVMs=new Set();
const runOwned=async(...args)=>{const run=await runProgram(...args);ownedVMs.add(run.vm);return run;};
const dispose=()=>{
    try{for(const vm of ownedVMs){try{vm.stopAll();}finally{vm.quit();}}}
    finally{ownedVMs.clear();quitStrandedVMs();clearStrayTimers();}
};

test('atan2 runtime preserves radians, argument order, primitive conversion, signed zero and nonfinite values',()=>{
    const extension=make();
    for(const [y,x]of [[1,1],[1,-1],[-1,-1],[-1,1],[1,0],[0,-1],[-0,1],[-0,-1],
        [Infinity,Infinity],[-Infinity,-Infinity],[NaN,1],[1,NaN],['2','-3'],[null,1],[undefined,1],[true,false]]){
        const actual=values.decode(extension.mathBinary({OP:'atan2',A:values.encode(y),B:values.encode(x)}));
        assert.ok(Object.is(actual,Math.atan2(y,x)),`atan2(${String(y)},${String(x)}): ${String(actual)}`);
    }
    const blocks={reporter:{inputs:{A:{block:'y',shadow:'y'},B:{block:'x',shadow:'x'}}},
        y:{opcode:'math_number'},x:{opcode:'math_number'}};
    const util={target:{blocks:{getBlock:id=>blocks[id]}},thread:{peekStack:()=> 'reporter'}};
    assert.ok(Object.is(values.decode(extension.mathBinary({OP:'atan2',A:'-0',B:'1'},util)),-0));
    assert.throws(()=>extension.mathBinary({OP:'atan2',A:{},B:1}),/needs a primitive value/);
    assert.throws(()=>extension.mathBinary({OP:'unknown',A:1,B:2}),/not implemented/);
});

test('atan2 has a fixed visible operation and explicit arity, namespace and reference diagnostics',()=>{
    const menu=make().getInfo().menus.mathOperations;
    assert.equal(menu.acceptReporters,false);
    assert.deepEqual(menu.items,['min','max','randomRange','atan2']);
    const standalone=arcadeToPseudocode('let angle=Math.atan2(1,-1)');clean(standalone);
    assert.match(standalone.code,/WHEN arcade source starts/);
    for(const source of ['let angle=Math.atan2()','let angle=Math.atan2(1)',
        'let angle=Math.atan2(1,2,3)','let Math={atan2:1};let angle=Math.atan2(1,2)']){
        assert.ok(arcadeToPseudocode(source).unsupported.length,source);
    }
    for(const source of ['let angle=Math.atan2([1],1)',
        'let list=[1];let angle=Math.atan2(list,1)',
        'let angle=Math.atan2({value:1},1)','let angle=Math.atan2(img`1`,1)']){
        assert.ok(arcadeToPseudocode(source).unsupported.includes('Math.atan2 reference argument conversion is not implemented'),source);
    }
});

const source=`let order=0
function first(){order=order*10+1;return 2}
function second(){order=order*10+2;return -3}
let sideEffect=Math.atan2(first(),second())
let q1=Math.atan2(1,1)
let q2=Math.atan2(1,-1)
let q3=Math.atan2(-1,-1)
let q4=Math.atan2(-1,1)
let axis=Math.atan2(1,0)
let origin=Math.atan2(0,0)
let positivePi=Math.atan2(0,-1)
let infinity=Infinity
let negativeZero=-1/infinity
let signed=Math.atan2(negativeZero,1)
let signedInverse=1/signed
let negativePi=Math.atan2(negativeZero,-1)
let infiniteAngle=Math.atan2(infinity,infinity)
let notANumber=Math.atan2(NaN,1)
let folded=Math.atan2(-0,1)
let foldedSign=1/folded===-Infinity
let samples=[Math.atan2(1,1),Math.atan2(-1,-1)]
let sampled=samples[1]
let finished=1
finished+=0`;
const expected={order:12,sideEffect:Math.atan2(2,-3),q1:Math.PI/4,q2:3*Math.PI/4,
    q3:-3*Math.PI/4,q4:-Math.PI/4,axis:Math.PI/2,origin:0,positivePi:Math.PI,
    infinity:Infinity,negativeZero:-0,signed:-0,signedInverse:-Infinity,negativePi:-Math.PI,
    infiniteAngle:Math.PI/4,notANumber:NaN,folded:0,foldedSign:false,sampled:-3*Math.PI/4,finished:1};
const check=snapshot=>{for(const [key,value]of Object.entries(expected)){
    assert.ok(Object.is(snapshot[key],value),`${key}: ${String(snapshot[key])} expected ${String(value)}`);
}};

test('actual original and exported PXT agree with native atan2 through Code and same/fresh saved projects',async()=>{
    try{
        check(await runPxtArcade(source,{waitForGlobals:{finished:1}}));
        const imported=arcadeToPseudocode(source);clean(imported);assert.match(imported.code,/arcade math atan2/);
        const ready=async run=>{
            const deadline=Date.now()+3000;
            while(vars(run).finished!==1&&Date.now()<deadline){await stepFrames(run.vm,4);await new Promise(resolve=>setTimeout(resolve,10));}
            assert.equal(vars(run).finished,1);assert.deepEqual(run.errors,[]);check(vars(run));
        };
        const execute=async code=>{const run=await runOwned(code,{frames:120,storage:true});await ready(run);return run;};
        const first=await execute(imported.code);await execute(first.creator.decompile());
        const exported=projectToArcade(first.creator.project);clean(exported);assert.match(exported.ts,/Math\.atan2/);
        check(await runPxtArcade(exported.files,{waitForGlobals:{finished:1}}));
        const reimported=arcadeToPseudocode(exported.files);clean(reimported);const importedRun=await execute(reimported.code);
        const secondExport=projectJsonToArcade(JSON.stringify(importedRun.creator.project));clean(secondExport);
        check(await runPxtArcade(secondExport.files,{waitForGlobals:{finished:1}}));
        const thirdImport=arcadeToPseudocode(secondExport.files);clean(thirdImport);await execute(thirdImport.code);
        const bytes=Buffer.from(await(await first.vm.saveProjectSb3()).arrayBuffer());
        await first.vm.loadProject(bytes);first.vm.greenFlag();await stepFrames(first.vm,120);await ready(first);
        const fresh=await runOwned('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0,storage:true});
        assert.notEqual(fresh.vm,first.vm);await fresh.vm.loadProject(bytes);fresh.vm.greenFlag();await stepFrames(fresh.vm,120);await ready(fresh);
    }finally{dispose();}
});

test('editing the actual operation in Code changes native computation and current export',async()=>{
    try{
        const imported=arcadeToPseudocode('let result=Math.atan2(1,-1);let finished=1;finished+=0');clean(imported);
        const first=await runOwned(imported.code,{frames:120});assert.deepEqual(first.errors,[]);
        assert.equal(vars(first).result,Math.atan2(1,-1));
        const code=first.creator.decompile(),edited=code.replace('arcade math atan2','arcade math max');assert.notEqual(code,edited);
        const next=await runOwned(edited,{frames:120});assert.deepEqual(next.errors,[]);assert.equal(vars(next).result,1);
        const out=projectToArcade(next.creator.project);clean(out);assert.match(out.ts,/Math\.max/);assert.doesNotMatch(out.ts,/Math\.atan2/);
        assert.equal((await runPxtArcade(out.files,{waitForGlobals:{finished:1}})).result,1);
    }finally{dispose();}
});
