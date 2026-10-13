import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import BW from '../overlay/scratch-vm/src/util/bw-values.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames,clearStrayTimers,projectOpcodes} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const vars=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
const bundled=JSON.parse(fs.readFileSync(new URL('../overlay/scratch-vm/src/extensions/crispstrobe/arrays/index.js',import.meta.url),'utf8').match(/makeExt\(("(?:[^"\\]|\\.)*")\)/)[1]);
const start=bundled.indexOf('  const makeValues = () => {'),end=bundled.indexOf('\n  };\n',start);
const fallback=new Function(`${bundled.slice(start,end+5)}\nreturn makeValues();`)();

test('shared and standalone Arrays numeric exponentiation preserve NaN, infinities, negative zero and coercion',()=>{
    for(const [left,right] of [[2,3],[-2,3],[-2,0.5],[0,-1],[-0,3],[-0,-3],[NaN,2],[NaN,0],[Infinity,0],[-Infinity,3],[2,Infinity],[1,Infinity],['2','3'],[null,2],[BW.UNDEFINED,2]]){
        const a=BW.decode(left),b=BW.decode(right),expected=a**b;
        assert.ok(Object.is(BW.binary(left,'**',right),expected),`${String(a)} ** ${String(b)} shared`);
        assert.ok(Object.is(fallback.binary(left,'**',right),expected),`${String(a)} ** ${String(b)} fallback`);
    }
    assert.match(bundled,/items: \["\+", "-", "\*", "\/", "%", "\*\*"\]/);
});

const source=`let trace=0
function base(){trace=trace*10+2;return 2}
function exponent(){trace=trace*10+3;return 3}
let sideEffect=base()**exponent()
let rightAssociated=2**3**2
let grouped=(2**3)**2
let fraction=16**0.5
let negative=(-2)**3
let invalid=(-2)**0.5
let nonfinite=0**(-1)
function zero(){return 0}
let negativeZero=(zero()/(-1))**3
let negativeZeroInverse=1/negativeZero
let zeroNaN=(0/0)**0
let propagatedNaN=(0/0)**2
let inverseInfinity=(1/0)**(-1)
let observations=0
function observe(value:number){observations+=1;return value}
rightAssociated=observe(rightAssociated)
grouped=observe(grouped)
fraction=observe(fraction)
negative=observe(negative)
invalid=observe(invalid)
nonfinite=observe(nonfinite)
negativeZero=observe(negativeZero)
negativeZeroInverse=observe(negativeZeroInverse)
zeroNaN=observe(zeroNaN)
propagatedNaN=observe(propagatedNaN)
inverseInfinity=observe(inverseInfinity)
let finished=1
finished+=0`;
const keys=['trace','sideEffect','rightAssociated','grouped','fraction','negative','invalid','nonfinite','negativeZero','negativeZeroInverse','zeroNaN','propagatedNaN','inverseInfinity','observations','finished'];
const expected={trace:23,sideEffect:8,rightAssociated:512,grouped:64,fraction:4,negative:-8,invalid:NaN,nonfinite:Infinity,negativeZero:-0,negativeZeroInverse:-Infinity,zeroNaN:1,propagatedNaN:NaN,inverseInfinity:0,observations:11,finished:1};
const check=values=>{for(const key of keys)assert.ok(Object.is(values[key]??values['Game_'+key],expected[key]),`${key}: ${String(values[key]??values['Game_'+key])}; ${JSON.stringify(values)}`);};

test('original exponentiation matches native execution through Code, blocks, Arcade export and fresh SB3 reload',async()=>{
    try{
        check(await runPxtArcade(source));
        const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
        assert.match(imported.code,/op "\*\*"/);assert.ok(!imported.code.includes('to the power of'));
        const ready=async run=>{const deadline=Date.now()+3000;while(vars(run).finished!==1 && Date.now()<deadline){await stepFrames(run.vm,4);await new Promise(resolve=>setTimeout(resolve,10));}assert.equal(vars(run).finished,1,JSON.stringify(vars(run)));};
        const execute=async code=>{const run=await runProgram(code,{frames:150,storage:true});await ready(run);assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);check(vars(run));return run;};
        const run=await execute(imported.code);assert.ok(projectOpcodes(run.creator.project).has('arrays_valueBinary'));assert.ok(!projectOpcodes(run.creator.project).has('planetemaths_pow'));
        await execute(run.creator.decompile());
        const exported=projectToArcade(run.creator.project);assert.deepEqual(exported.unsupported,[]);assert.match(exported.ts,/left \*\* right/);
        check(await runPxtArcade(exported.files,{waitForGlobals:{finished:1}}));
        const reimported=arcadeToPseudocode(exported.ts);assert.deepEqual(reimported.unsupported,[]);await execute(reimported.code);
        const bytes=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());await run.vm.loadProject(bytes);run.vm.greenFlag();await stepFrames(run.vm,150);await ready(run);assert.deepEqual(run.errors,[]);check(vars(run));
        const fresh=await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0,storage:true});
        assert.notEqual(fresh.vm,run.vm);await fresh.vm.loadProject(bytes);fresh.vm.greenFlag();await stepFrames(fresh.vm,150);await ready(fresh);assert.deepEqual(fresh.errors,[]);check(vars(fresh));
    }finally{clearStrayTimers();}
});

test('sprite-reference exponentiation remains a named arithmetic conversion gap',()=>{
    const imported=arcadeToPseudocode('let hero=sprites.create(img`1`,SpriteKind.Player);let result=hero**2');
    assert.ok(imported.unsupported.includes('sprite arithmetic conversion requires ToPrimitive support'));
});
