import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
const source=`let a=5.75;a|=2;let b=15;b&=6;let c=9;c^=3;let d=3;d<<=33;let e=2147483648;e>>=1;let f=4294967295;f>>>=33;
let value=1;let calls=0;function right(){value=8;calls+=1;return 2}value|=right();let result=value;
function formatDecimal(val:number){val|=0;if(val<10)return '0'+val;return val.toString()}let text=formatDecimal(12.75);
let amount=15;function change(amount:number){amount&=6;return amount}let changed=change(3);let outer=amount;`;
const expected={a:7,b:6,c:10,d:6,e:-1073741824,f:2147483647,value:3,calls:1,result:3,text:'12',amount:15,changed:2,outer:15};
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(target=>Object.values(target.variables)).map(variable=>[variable.name.replace(/^Game_/,''),variable.value]));
const check=(run,wanted)=>{const actual=values(run);for(const [name,value]of Object.entries(wanted))assert.equal(actual[name],value,name);assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);};
const sha=value=>createHash('sha256').update(value).digest('hex');

test('primitive identifier compounds preserve effects and current operand edits through every portable route',async()=>{
    // Both exact programs have separate retained selected-original executions.
    // This regression reads their byte bindings; it never replays the SDK.
    assert.equal(sha(source),'0f60c7d03e74d0f8113c1484b9d4c0ad42739b83dd51f150c479da71c2e18e38');
    const runs=[],execute=async imported=>{assert.deepEqual(imported.unsupported,[]);assert.deepEqual(imported.warnings,[]);const run=await runProgram(imported.code,{frames:35,storage:true,uploads:imported.costumes});runs.push(run);return run;};
    try {
        const imported=arcadeToPseudocode(source),run=await execute(imported);check(run,expected);
        check(await execute({...imported,code:run.creator.decompile(JSON.parse(run.vm.toJSON()))}),expected);
        const saved=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());
        run.vm.stopAll();await run.vm.loadProject(saved);run.vm.greenFlag();await stepFrames(run.vm,35);check(run,expected);
        const fresh=await execute(imported);fresh.vm.stopAll();await fresh.vm.loadProject(saved);fresh.vm.greenFlag();await stepFrames(fresh.vm,35);check(fresh,expected);
        const target=run.vm.runtime.targets.find(target=>Object.values(target.blocks._blocks).some(block=>block.opcode==='arrays_valueBinary'&&block.fields.OP?.value==='|'));
        const operator=Object.values(target.blocks._blocks).find(block=>block.opcode==='arrays_valueBinary'&&block.fields.OP?.value==='|');
        target.blocks.changeBlock({id:operator.id,element:'field',name:'OP',value:'&'});run.vm.greenFlag();await stepFrames(run.vm,35);check(run,{...expected,a:0});
        const wrapper=target.blocks.getBlock(operator.inputs.RIGHT.block),literal=target.blocks.getBlock(wrapper.inputs.NUM2.block);assert.equal(literal.opcode,'math_number');
        target.blocks.changeBlock({id:literal.id,element:'field',name:'NUM',value:'3'});run.vm.greenFlag();await stepFrames(run.vm,35);check(run,{...expected,a:1});
        const exported=projectToArcade(JSON.parse(run.vm.toJSON()));assert.deepEqual(exported.unsupported,[]);
        assert.equal(sha(exported.files['main.ts']),'34af8990e702e51e6cba496dbb5cdabc6c099f63f6f739c52fcb08ba267d1f39');
        check(await execute(arcadeToPseudocode(exported.files)),{...expected,a:1});
    } finally {for(const run of runs){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});

const captures=[['Or','|=',5.75,2,7],['And','&=',15,6,6],['Xor','^=',9,3,10],['Left','<<=',3,33,6],['Right','>>=',2147483648,1,-1073741824],['Unsigned','>>>=',4294967295,33,2147483647]];
test('all six captured compound operators retain actual factories, aliases and current-body export',async()=>{
    const source=captures.map(([name,op,seed,right])=>`function make${name}(seed:number):()=>number{let current=seed;return()=>{current${op}${right};return current}}let callback${name}=make${name}(${seed});let alias${name}=callback${name};let result${name}=alias${name}();`).join('\n');
    const wanted=Object.fromEntries(captures.map(([name,,,,result])=>['result'+name,result]));
    const runs=[],execute=async imported=>{assert.deepEqual(imported.unsupported,[]);const run=await runProgram(imported.code,{frames:35,storage:true});runs.push(run);check(run,wanted);return run;};
    try {
        const imported=arcadeToPseudocode(source),run=await execute(imported);
        await execute({...imported,code:run.creator.decompile(JSON.parse(run.vm.toJSON()))});
        const exported=projectToArcade(JSON.parse(run.vm.toJSON()));assert.deepEqual(exported.unsupported,[]);await execute(arcadeToPseudocode(exported.files));
    } finally {for(const run of runs){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});

test('compound syntax does not grant opaque operands or erase the actual factory/callback restrictions',()=>{
    for(const source of [
        'let value=sprites.create(img`1`,SpriteKind.Player);value|=1;',
        'let value:any=3;value=screen;value&=1;',
        'function bad(value:number){value^=1;return value}let result=bad(screen as any);',
        'function make(seed:number):()=>number{let value=seed;return()=>{value|=4;return value}}let input=image.create(1,1) as any;let callback=make(input);let result=callback();',
        'function make(seed:number):()=>number{let value=seed;return()=>{value|=4;return value}}let callback:()=>number;let early=typeof callback;callback=make(2);',
        'function combine(left:number,right:number){return left|right}function make(seed:number):()=>number{let value=seed;return()=>{value|=4;return value}}let callback=make(new combine(1,2));let result=callback();'
    ])assert.ok(arcadeToPseudocode(source).unsupported.length,source);
});
