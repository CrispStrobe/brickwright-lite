import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const createCells=require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/source-scalar-cells.js');
const callable=require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/source-callable-cells.js');
const values=require('../overlay/scratch-vm/src/util/bw-values.js');
const signature={kind:'callable',parameters:[],result:{kind:'named',name:'number'}};
function fixture(){
    const variables={count:{type:'',value:19},fn:{type:'',value:'saved'}};
    const blocks={hat:{id:'hat',opcode:'arcade_whenSourceStarts',topLevel:true,next:'scalar'},
        scalar:{id:'scalar',opcode:'arcade_declareSourceScalar',next:'fn',fields:{TYPE:{value:'Number'}},inputs:{VARIABLE:{block:'countReporter'}}},
        fn:{id:'fn',opcode:'arcade_declareSourceCallable',next:null,inputs:{VARIABLE:{block:'fnReporter'},SIGNATURE:{block:'signature',shadow:'signature'}}},
        countReporter:{opcode:'data_variable',fields:{VARIABLE:{id:'count'}}},fnReporter:{opcode:'data_variable',fields:{VARIABLE:{id:'fn'}}},
        signature:{opcode:'text',shadow:true,fields:{TEXT:{value:JSON.stringify(signature)}}}};
    const target={id:'stage',isStage:true,variables,blocks:{_blocks:blocks,getBlock:id=>blocks[id]},lookupVariableById:id=>variables[id]};
    const runtime={targets:[target]},cells=createCells(runtime,values,null,callable);
    return {variables,blocks,target,runtime,cells,util:{target,thread:{peekStack:()=> 'fn'}}};
}
test('mixed scalar/callable source declarations commit undefined only after all bindings validate',()=>{
    const f=fixture();f.cells.initialize();
    assert.equal(values.decode(f.variables.count.value),undefined);assert.equal(values.decode(f.variables.fn.value),undefined);
    assert.equal(f.cells.typeOf(f.target,'fn'),undefined,'Callable does not widen scalar provenance');
    assert.equal(f.cells.typeOf(f.target,'count'),'Number');
    f.variables.fn.value='authored assignment';f.cells.declareAdditional({},f.util);assert.equal(f.variables.fn.value,'authored assignment');
    f.variables.fn.name='renamed';f.cells.declareAdditional({},f.util);
    f.cells.invalidate();assert.throws(()=>f.cells.declareAdditional({},f.util),/current prelude binding/);
});
test('malformed or foreign callable declarations leave every original variable value intact',()=>{
    const mutations=[
        f=>{f.blocks.signature.fields.TEXT.value='{}';},
        f=>{f.blocks.signature.fields.TEXT.value=JSON.stringify({...signature,body:'return 1'});},
        f=>{f.blocks.signature.fields.TEXT.value=JSON.stringify({...signature,result:{kind:'named',name:'any'}});},
        f=>{f.blocks.signature.shadow=false;},
        f=>{f.blocks.fn.inputs.SIGNATURE.shadow='foreign';},
        f=>{f.blocks.fnReporter.fields.VARIABLE.id='absent';},
        f=>{f.blocks.fnReporter.fields.VARIABLE.id='count';},
        f=>{f.variables.fn.type='list';},
        f=>{f.blocks.scalar.next='body';f.blocks.body={id:'body',opcode:'looks_show',next:'fn'};},
        f=>{f.blocks.fn.next='fn';}
    ];
    for(const mutate of mutations){const f=fixture();mutate(f);assert.throws(()=>f.cells.initialize());assert.equal(f.variables.count.value,19);assert.equal(f.variables.fn.value,'saved');}
});
test('edited actual IDs, signature and current declaration objects cannot reuse prelude authority',()=>{
    for(const mutate of [f=>{f.blocks.fnReporter.fields.VARIABLE.id='count';},f=>{f.blocks.signature.fields.TEXT.value=JSON.stringify({...signature,result:{kind:'named',name:'string'}});},f=>{f.blocks.fn={...f.blocks.fn};}]){
        const f=fixture();f.cells.initialize();mutate(f);assert.throws(()=>f.cells.declareAdditional({},f.util),/changed after prelude|current prelude binding/);
    }
});
