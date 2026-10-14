import test from 'node:test';
import assert from 'node:assert/strict';
import {namedArrayItemExportAuthority} from '../overlay/scratch-gui/src/lib/bw-makecode/named-array-item-export-authority.js';
const text=value=>[1,[10,value]];
const ref=id=>[2,id];
const variable=id=>({opcode:'data_variable',fields:{VARIABLE:[id,id]}});
const assign=(id,value)=>({opcode:'data_setvariableto',fields:{VARIABLE:[id,id]},inputs:{VALUE:value}});
const named=name=>({opcode:'arrays_namedReference',inputs:{NAME:text(name)}});
const push=(name,value)=>({opcode:'arrays_push',inputs:{NAME:text(name),VALUE:value}});
const mutate=(receiver,value)=>({opcode:'arrays_mutateReference',inputs:{ARRAY:ref(receiver),OP:text('push'),VALUE:value}});
const stage=blocks=>({isStage:true,name:'Stage',variables:{alias:['alias','']},blocks});
const check=targets=>namedArrayItemExportAuthority({targets},'items',block=>block.opcode==='arrays_valueCompare');
test('scalar inputs and literal JSON aggregate parsing stay eligible',()=>{
    for(const value of ['word','[1,2]','{"x":1}','arcade:1','é雪',''])assert.equal(check([stage({push:push('items',text(value))})]).ok,true,value);
});
test('real reference reporters and unresolved value producers refuse getter export',()=>{
    for(const opcode of ['arrays_namedReference','arrays_createReference','arcade_createImage','arcade_createBuffer','arcade_createObject','arcade_callObjectMethod','arcade_callFunction']){
        const result=check([stage({value:{opcode,inputs:{NAME:text('other')}},push:push('items',ref('value'))})]);assert.equal(result.ok,false,opcode);
    }
});
test('historical stage aliases and foreign-target writes cannot launder a reference',()=>{
    const first=stage({binding:named('items'),initial:assign('alias',ref('binding')),alias:variable('alias'),rebound:assign('alias',text('different'))});
    const second={isStage:false,name:'Other',variables:{},blocks:{alias:variable('alias'),image:{opcode:'arcade_createImage'},write:mutate('alias',ref('image'))}};
    assert.equal(check([first,second]).ok,false);
    second.blocks.write.inputs.VALUE=text('safe');assert.equal(check([first,second]).ok,true);
});
test('legacy JSON reference envelopes remain unqualified while literal text remains text',()=>{
    const carrier='{"bwReference":{"kind":"array","id":"some-id","scope":"some-scope"}}';
    assert.equal(check([stage({push:push('items',text(carrier))})]).ok,false);
    assert.equal(check([stage({push:push('different',text(carrier))})]).ok,true);
});
test('cyclic variable copies terminate and retain unknown writer refusals',()=>{
    const target=stage({a:variable('alias'),copy:assign('alias',ref('a')),push:push('items',ref('a'))});
    assert.equal(check([target]).ok,true);
    target.blocks.unknown={opcode:'arcade_callObjectMethod'};target.blocks.bad=assign('alias',ref('unknown'));
    assert.equal(check([target]).ok,false);
});

test('an actual typed source reference binding never gains scalar authority from its String carrier',()=>{
    const target=stage({value:variable('alias'),push:push('items',ref('value'))});target.variables.alias[1]='arcade:1';
    assert.equal(namedArrayItemExportAuthority({targets:[target]},'items',()=>false,new Map([['alias',{type:'Sprite'}]])).ok,false);
    assert.equal(namedArrayItemExportAuthority({targets:[target]},'items',()=>false).ok,true,'unannotated literal String is still String');
});

test('prototype-sensitive native registry names stay refused rather than changing missing or deleted reads',()=>{
    for(const name of ['__proto__','constructor','toString'])assert.equal(namedArrayItemExportAuthority({targets:[stage({})]},name,()=>false).ok,false);
});

test('String addition cannot launder a reference envelope through legacy JSON input',()=>{
    const target=stage({left:{opcode:'text',fields:{TEXT:['{"bwReference":','']}},right:{opcode:'text',fields:{TEXT:['{"kind":"array"}}','']}},joined:{opcode:'arrays_valueBinary',inputs:{LEFT:ref('left'),RIGHT:ref('right'),OP:text('+')}},push:push('items',ref('joined'))});
    assert.equal(check([target]).ok,false);
});

test('numeric addition of proved primitive inputs preserves a nested alias writer without admitting opaque operands',()=>{
    const target=stage({alias:variable('alias'),sum:{opcode:'operator_add',inputs:{NUM1:[1,[4,'0']],NUM2:[1,[4,'4']]}},write:mutate('alias',ref('sum'))});
    assert.equal(check([target]).ok,true);
    target.blocks.opaque={opcode:'arcade_createImage'};
    target.blocks.sum.inputs.NUM2=ref('opaque');
    assert.equal(check([target]).ok,false);
});
