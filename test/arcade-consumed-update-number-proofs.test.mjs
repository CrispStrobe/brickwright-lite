// Row 2h (consumed prefix/postfix values): the two export proofs that
// admit `pair(counter++,++counter)` and their refusal controls. The positive
// original-PXT comparison is test/makecode-arcade-update-values.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {runProgram} from './helpers/bw-vm.mjs';

const exportOf=async source=>{
    const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
    const run=await runProgram(imported.code,{frames:5,storage:true});
    try{return {run,exported:projectToArcade(run.creator.project)};}finally{run.vm.stopAll();}
};
const lit=(blocks,input)=>{const v=input?.[1];if(Array.isArray(v))return v[1];const b=blocks[v];return b?.fields?.TEXT?.[0]??b?.fields?.NUM?.[0];};

// Per call site: one `+value` call with a non-Number operand (an index read
// that may be Undefined, a Sprite property) must not void another call's proof.
test('unary-plus helper is proved per call site', async()=>{
    const source=`let rows=[[5,6]]
function row(){return rows[0]}
let oldItem=row()[0]++
let counter=3
function pair(a:number,b:number){return a*10+b}
let paired=pair(counter++,++counter)
let last=counter`;
    const expected=await runPxtArcade(source);
    const {run,exported}=await exportOf(source);run.vm.quit();
    assert.match(exported.ts,/function __bwUnaryAdd\(value: any\): number \{ return \+value \}/);
    assert.deepEqual(exported.unsupported,[]);
    const original=await runPxtArcade(exported.ts);
    for(const name of ['oldItem','paired','last'])assert.equal(original[name],expected[name],name);
});

test('unary-plus helper still refuses a possibly Undefined operand at its own call site', ()=>{
    const imported=arcadeToPseudocode(`let rows=[[5,6]]
function row(){return rows[0]}
function pair(a:number,b:number){return a*10+b}
let p=pair(+row()[3],1)`);
    assert.ok(imported.unsupported.includes('Procedure parameter constraint: pair.a requires Number from actual producers'),JSON.stringify(imported.unsupported));
});

// Native `+` whose result shares an annotation node with an Any copy target
// (the lazy `true&&counter++` choice) is a Number only from two Number operands.
const lazy=`let counter=3
let chosen=true&&counter++
function pair(a:number,b:number){return a*10+b}
let paired=pair(counter++,++counter)`;
test('dynamic plus with two proved Number operands discharges the Number formal', async()=>{
    const expected=await runPxtArcade(lazy);
    const {run,exported}=await exportOf(lazy);run.vm.quit();
    assert.deepEqual(exported.unsupported,[]);
    const original=await runPxtArcade(exported.ts);
    for(const name of ['counter','chosen','paired'])assert.equal(original[name],expected[name],name);
});

test('dynamic plus with an edited Text operand stays refused', async()=>{
    const {run}=await exportOf(lazy);
    try{
        const project=structuredClone(run.creator.project);let edited=0;
        for(const target of project.targets){
            const blocks=target.blocks||{};
            for(const block of Object.values(blocks)){
                if(block.opcode!=='arcade_setLocal'||lit(blocks,block.inputs?.NAME)!=='__bwPxtValue7')continue;
                const plus=blocks[block.inputs.VALUE[1]];
                assert.equal(plus?.fields?.OP?.[0],'+');
                const right=Object.keys(plus.inputs).find(name=>name!=='LEFT'&&name!=='OP')||'RIGHT';
                blocks['bw2hText']={opcode:'text',next:null,parent:block.inputs.VALUE[1],inputs:{},fields:{TEXT:['x',null]},shadow:true,topLevel:false};
                plus.inputs[right]=[1,'bw2hText'];edited++;
            }
        }
        assert.equal(edited,1,'actual consumer of the second consumed update');
        const exported=projectToArcade(project);
        assert.ok(exported.unsupported.includes('Procedure parameter constraint: actual current caller or writer requires Number'),JSON.stringify(exported.unsupported));
    }finally{run.vm.quit();}
});
