import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const create=require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/source-scalar-cells.js');
const types=require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/source-reference-types.js');
const undef=Object.freeze({undefined:true});
function fixture(type='Sprite') {
  const scalar={id:'scalar',type:'',value:41},ref={id:'ref',type:'',value:42},stock={id:'stock',type:'',value:43};
  const blocks={hat:{id:'hat',opcode:'arcade_whenSourceStarts',topLevel:true,next:'scalar'},
    scalar:{id:'scalar',opcode:'arcade_declareSourceScalar',next:'ref',fields:{TYPE:{value:'Boolean'}},inputs:{VARIABLE:{block:'s'}}},
    s:{id:'s',opcode:'data_variable',fields:{VARIABLE:{id:'scalar'}}},
    ref:{id:'ref',opcode:'arcade_declareSourceReference',next:'init',fields:{TYPE:{value:type}},inputs:{VARIABLE:{block:'r'}}},
    r:{id:'r',opcode:'data_variable',fields:{VARIABLE:{id:'ref'}}},init:{id:'init',opcode:'data_setvariableto'}};
  const target={id:'stage',isStage:true,isOriginal:true,variables:{scalar,ref,stock},blocks:{_blocks:blocks,getBlock:id=>blocks[id]},lookupVariableById:id=>target.variables[id]};
  const runtime={targets:[target]},host=create(runtime,{encode:v=>v===undefined?undef:v},types);
  const util=id=>({target,thread:{peekStack:()=>id}});
  return {scalar,ref,stock,blocks,target,runtime,host,util};
}
function declareClass(f) {
  const data={NAME:'Box',FIELDS:'[]',PARAMETERS:'[]',METHODS:'[]',INITIALIZER:'',CONSTRUCTOR:''};
  f.blocks.cls={id:'cls',opcode:'arcade_declareClass',fields:Object.fromEntries(Object.entries(data).map(([k,value])=>[k,{value}]))};
}
test('interleaved source reference and scalar prelude initializes actual cells atomically without reference allocation',()=>{
  for(const type of ['Sprite','Image','number[]','boolean[]','string[]','Sprite[]','Image[]','Box','Box[]']) {
    const f=fixture(type);if(type.startsWith('Box'))declareClass(f);
    f.host.initialize();assert.equal(f.scalar.value,undef);assert.equal(f.ref.value,undef);assert.equal(f.stock.value,43);
    assert.equal(f.host.typeOf(f.target,'scalar'),'Boolean');assert.equal(f.host.typeOf(f.target,'ref'),undefined);
    const alias=Object.freeze({reference:'owned'});f.ref.value=alias;f.scalar.value=false;
    f.host.declareReference({},f.util('ref'));f.host.declare({},f.util('scalar'));
    assert.equal(f.ref.value,alias);assert.equal(f.scalar.value,false);
    f.host.invalidate();assert.throws(()=>f.host.declareReference({},f.util('ref')),/current prelude/);
    f.host.initialize();assert.equal(f.ref.value,undef);assert.equal(f.stock.value,43);
  }
});
test('unknown domains, computed fields, scalar/reference duplicate and late reference fail before every write',()=>{
  const changes=[f=>f.blocks.ref.fields.TYPE.value='Any',f=>f.blocks.ref.fields.TYPE.value='Callable',
    f=>f.blocks.ref.fields.TYPE.value='Missing',f=>f.blocks.ref.fields.TYPE.value='Missing[]',
    f=>f.blocks.ref.inputs.TYPE={block:'r'},f=>f.blocks.r.fields.VARIABLE.id='scalar',
    f=>{f.blocks.scalar.next='init';f.blocks.init.next='ref';},f=>f.ref.type='list',
    f=>f.blocks.r.opcode='operator_join',f=>delete f.target.variables.ref];
  for(const change of changes){const f=fixture();change(f);assert.throws(()=>f.host.initialize());assert.equal(f.scalar.value,41);assert.equal(f.ref.value,42);assert.equal(f.stock.value,43);}
});
test('class declarations are bound by actual project metadata identity and never implicitly registered',()=>{
  for(const change of [f=>delete f.blocks.cls,f=>f.blocks.cls={...f.blocks.cls},
    f=>f.blocks.cls.fields.CONSTRUCTOR.value='changed',f=>f.target.variables.ref={...f.ref},
    f=>f.runtime.targets=[]]){
    const f=fixture('Box');declareClass(f);f.host.initialize();change(f);
    assert.throws(()=>f.host.declareReference({},f.util('ref')));
  }
  const f=fixture('Box');declareClass(f);f.blocks.clone={...f.blocks.cls,id:'clone'};
  assert.throws(()=>f.host.initialize(),/duplicate/i);assert.equal(f.scalar.value,41);
});
test('replacement targets cannot reuse declaration authority and ordinary source-independent cells stay saved',()=>{
  const f=fixture();f.host.initialize();f.host.dispose();
  f.target.variables.ref={...f.ref,value:99};f.host.initialize();
  assert.equal(f.target.variables.ref.value,undef);assert.equal(f.stock.value,43);
  assert.equal(f.ref.value,undef); // Old variable object is never mutated by replacement initialization.
  assert.throws(()=>f.host.declare({},f.util('ref')),/current command/);
});

test('invalid class descriptor schema refuses the complete mixed prelude before writes',()=>{
 for(const field of [{name:'value',type:'number',readonly:false,foreign:true},{name:'value',type:'number',readonly:false,getter:42},{name:'value',type:'number',readonly:true,getter:'read',initializer:'init'}]) {
  const f=fixture('Box');declareClass(f);f.blocks.cls.fields.FIELDS.value=JSON.stringify([field]);
  assert.throws(()=>f.host.initialize());assert.equal(f.scalar.value,41);assert.equal(f.ref.value,42);
 }
});
