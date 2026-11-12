import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ScratchOperators=require('../packages/scratch-vm/src/blocks/scratch3_operators'),create=require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/console-inspect-values'),loan=require('../overlay/scratch-vm/src/util/bw-primitive-owner');
function fixture(initial=true,negated=false){
 const blocks={},add=(id,opcode,parent=null,inputs={},fields={})=>blocks[id]={id,opcode,parent,inputs,fields,shadow:false,topLevel:false,next:null};
 const number=(id,parent,value)=>{const b=add(id,'math_number',parent,{}, {NUM:{value:String(value)}});b.shadow=true;return b;};
 const text=(id,parent,value)=>{const b=add(id,'text',parent,{}, {TEXT:{value}});b.shadow=true;return b;};
 add('hat','arcade_whenSourceStarts').topLevel=true;blocks.hat.next='boolean';
 add('boolean','data_setvariableto','hat',{VALUE:{block:'constant'}},{VARIABLE:{id:'boolean',value:'constant'}}).next='initial';
 add('constant','arrays_valueCompare','boolean',{LEFT:{block:'left'},RIGHT:{block:'right'}},{OP:{value:'<'}});number('left','constant',initial?0:1);number('right','constant',initial?1:0);
 add('initial','arcade_setLocal','boolean',{NAME:{block:'initialName'},VALUE:{block:'globalRead'}}).next='branch';text('initialName','initial','logical');add('globalRead','data_variable','initial',{}, {VARIABLE:{id:'boolean',value:'constant'}});
 add('branch','control_if','initial',{CONDITION:{block:negated?'not':'truthy'},SUBSTACK:{block:'overwrite'}}).next='out';
 if(negated)add('not','operator_not','branch',{OPERAND:{block:'truthy'}});
 add('truthy','arrays_valueTruthy',negated?'not':'branch',{VALUE:{block:'guard'}});add('guard','arcade_getLocal','truthy',{NAME:{block:'guardName'}});text('guardName','guard','logical');
 add('overwrite','arcade_setLocal','branch',{NAME:{block:'overwriteName'},VALUE:{block:'value'}});text('overwriteName','overwrite','logical');number('value','overwrite',7);
 add('out','data_setvariableto','branch',{VALUE:{block:'finalRead'}},{VARIABLE:{id:'result',value:'result'}}).next='observe';add('finalRead','arcade_getLocal','out',{NAME:{block:'finalName'}});text('finalName','finalRead','logical');
 add('observe','data_setvariableto','out',{VALUE:{block:'inspect'}});add('inspect','arcade_inspectValue','observe',{VALUE:{block:'resultRead'},LIMIT:{block:'limit'}});add('resultRead','data_variable','inspect',{}, {VARIABLE:{id:'result',value:'result'}});number('limit','inspect',20);
 const variables={boolean:{id:'boolean',name:'constant',type:'',value:initial},result:{id:'result',name:'result',type:'',value:7}};
 const container={_blocks:blocks,getBlock:id=>blocks[id],getInputs:b=>b.inputs,_cache:{_executeCached:{}}};const target={isOriginal:true,blocks:container,variables,lookupVariableById:id=>variables[id]};
 const thread={target,blockContainer:container,peekStack:()=> 'observe',isKilled:false};const runtime=new EventEmitter();Object.assign(runtime,{targets:[target],threads:[thread],sequencer:{activeThread:thread},isActiveThread:t=>t===thread});
 const util={runtime,thread,target},args={VALUE:7,LIMIT:20};let service;const method=()=>service.inspect(args,util);runtime.getOpcodeFunction=op=>op==='arcade_inspectValue'?method:null;
 const operation={id:'inspect',opcode:'arcade_inspectValue',_argValues:args,_blockFunction:method,fields:blocks.inspect.fields,inputs:blocks.inspect.inputs};container._cache._executeCached.observe={_ops:[operation]};service=create(runtime,{referenceTypeOf:()=>undefined,typeOf:()=>undefined});
 const invokeCurrent=()=>loan.invoke(runtime,thread,container,operation,args,util,()=>service.inputDomains(args,util,['VALUE']));const invoke=()=>{service.snapshot();return invokeCurrent();};return{blocks,add,text,number,invoke,invokeCurrent,runtime,target,variables};
}
test('forced Boolean logical branches prove their overwritten numeric local at the following read',()=>{
 assert.deepEqual(fixture(true,false).invoke(),[['number']]);assert.deepEqual(fixture(false,true).invoke(),[['number']]);
 const f=fixture();f.blocks.value.opcode='operator_add';f.blocks.value.fields={};f.blocks.value.shadow=false;f.blocks.value.inputs={NUM1:{block:'zero'},NUM2:{block:'two'}};f.number('zero','value',0);f.number('two','value',2);assert.deepEqual(f.invoke(),[['number']]);
});
test('uncertain logical paths and producers do not gain Number evidence',()=>{
 const cases={
 cloud:f=>{f.variables.boolean.isCloud=true;},
 unknownWriter:f=>{f.add('unknown','control_for_each',null,{}, {VARIABLE:{id:'boolean'}});},
 interveningEffect:f=>{f.blocks.boolean.next='effect';f.add('effect','arcade_callFunction','boolean').next='initial';f.blocks.initial.parent='effect';},
 afterReadExposure:f=>{f.blocks.out.next='exposure';f.add('exposure','data_setvariableto','out',{VALUE:{block:'exposed'}}).next='observe';f.add('exposed','arcade_getLocal','exposure',{NAME:{block:'exposedName'}});f.text('exposedName','exposed','logical');f.blocks.observe.parent='exposure';},
 effectBeforeRead:f=>{f.blocks.branch.next='effect';f.add('effect','arcade_callFunction','branch').next='out';f.blocks.out.parent='effect';},
 knownNumberCall:f=>{f.blocks.value.opcode='arcade_callFunction';f.blocks.value.fields={};f.blocks.value.shadow=false;f.blocks.value.inputs={NAME:{block:'callName'},ARGS:{block:'callArgs'}};f.text('callName','value','effect');f.text('callArgs','value','[]');f.add('definition','procedures_definition',null,{custom_block:{block:'prototype'}}).topLevel=true;f.blocks.definition.next='return';f.add('prototype','procedures_prototype','definition').mutation={proccode:'effect',argumentnames:'[]'};f.add('return','arcade_returnValue','definition',{VALUE:{block:'returned'}});f.number('returned','return',7);},
 foreignWriter:f=>{f.blocks.boolean.opcode='looks_hide';const b={foreign:{id:'foreign',opcode:'data_setvariableto',fields:{VARIABLE:{id:'boolean'}},inputs:{VALUE:{block:'compare'}}},compare:{id:'compare',opcode:'arrays_valueCompare',inputs:{LEFT:{block:'x'},RIGHT:{block:'y'}},fields:{OP:{value:'<'}}},x:{id:'x',opcode:'math_number',fields:{NUM:{value:'0'}},inputs:{}},y:{id:'y',opcode:'math_number',fields:{NUM:{value:'1'}},inputs:{}}};const owner={isOriginal:true,variables:{},blocks:{_blocks:b,getBlock:id=>b[id]},lookupVariableById:id=>f.variables[id]};f.runtime.targets.push(owner);},
 falseAnd:f=>{f.blocks.left.fields.NUM.value='1';f.blocks.right.fields.NUM.value='0';},
 initialSiblingEffect:f=>{f.blocks.initial.inputs.EXTRA={block:'call'};f.add('call','arcade_callFunction','initial');},
 globalSiblingEffect:f=>{f.blocks.boolean.inputs.EXTRA={block:'call'};f.add('call','arcade_callFunction','boolean');},
 unknownGuard:f=>{f.blocks.constant.opcode='arcade_callFunction';},
 alternateGlobalWriter:f=>{f.add('other','data_setvariableto',null,{VALUE:{block:'otherValue'}},{VARIABLE:{id:'boolean'}});f.number('otherValue','other',0);},
 laterGlobalWriter:f=>{f.blocks.out.next='late';f.add('late','data_setvariableto','out',{VALUE:{block:'lateValue'}},{VARIABLE:{id:'boolean'}}).next='observe';f.number('lateValue','late',0);f.blocks.observe.parent='late';},
 branchNotImmediate:f=>{f.blocks.initial.next='middle';f.add('middle','arcade_callFunction','initial').next='branch';f.blocks.branch.parent='middle';},
 branchCallValue:f=>{f.blocks.value.opcode='arcade_callFunction';},
 beforeRead:f=>{f.blocks.out.inputs.VALUE.block='earlier';f.add('earlier','arcade_getLocal','out',{NAME:{block:'earlierName'}});f.text('earlierName','earlier','logical');f.blocks.initial.next='out';f.blocks.out.parent='initial';},
 branchExtraStatement:f=>{f.blocks.overwrite.next='extra';f.add('extra','arcade_callFunction','overwrite');},
 branchLoop:f=>{f.blocks.branch.opcode='control_repeat';},
 earlierExposure:f=>{f.add('expose','arcade_getLocal','initial',{NAME:{block:'exposeName'}});f.text('exposeName','expose','logical');f.blocks.initial.inputs.EXTRA={block:'expose'};},
 capture:f=>{f.add('captured','arcade_getCaptured',null,{NAME:{block:'capturedName'}});f.text('capturedName','captured','logical');},
 };
 for(const [name,change]of Object.entries(cases)){const f=fixture();change(f);let result;try{result=f.invoke();}catch(error){assert.match(error.message,/primitive domain evidence/,name);continue;}assert.notDeepEqual(result,[['number']],name);}
});


test('finite constant arithmetic agrees with actual Scratch operators',()=>{
 const ops=new ScratchOperators({});
 for(const [opcode,method]of [['operator_add','add'],['operator_subtract','subtract'],['operator_multiply','multiply']])for(const [x,y]of [[-3,2],[0,-0],[2.5,-0.5]]){
  const f=fixture(),actual=ops[method]({NUM1:x,NUM2:y});
  f.blocks.left.opcode=opcode;f.blocks.left.fields={};f.blocks.left.shadow=false;f.blocks.left.inputs={NUM1:{block:'x'},NUM2:{block:'y'}};f.number('x','left',x);f.number('y','left',y);f.blocks.right.fields.NUM.value=String(actual+1);assert.deepEqual(f.invoke(),[['number']]);
 }
});
test('Scratch modulo and NaN cast counterexamples remain outside the constant proof',()=>{
 const ops=new ScratchOperators({});assert.equal(ops.mod({NUM1:-1,NUM2:2}),1);assert.equal(-1%2,-1);
 assert.equal(ops.add({NUM1:ops.divide({NUM1:0,NUM2:0}),NUM2:1}),1);
 const refusal=f=>{let value;try{value=f.invoke();}catch(error){assert.match(error.message,/primitive domain evidence/);return;}assert.notDeepEqual(value,[['number']]);};
 const mod=fixture();mod.blocks.left.opcode='operator_mod';mod.blocks.left.fields={};mod.blocks.left.shadow=false;mod.blocks.left.inputs={NUM1:{block:'negative'},NUM2:{block:'modulus'}};mod.number('negative','left',-1);mod.number('modulus','left',2);mod.blocks.right.fields.NUM.value='0';refusal(mod);
 const cast=fixture(false,true);cast.blocks.left.opcode='operator_add';cast.blocks.left.fields={};cast.blocks.left.shadow=false;cast.blocks.left.inputs={NUM1:{block:'divide'},NUM2:{block:'one'}};cast.add('divide','operator_divide','left',{NUM1:{block:'zeroA'},NUM2:{block:'zeroB'}});cast.number('zeroA','divide',0);cast.number('zeroB','divide',0);cast.number('one','left',1);cast.blocks.right.fields.NUM.value='2';refusal(cast);
 const overflow=fixture();overflow.blocks.left.opcode='operator_multiply';overflow.blocks.left.fields={};overflow.blocks.left.shadow=false;overflow.blocks.left.inputs={NUM1:{block:'largeA'},NUM2:{block:'largeB'}};overflow.number('largeA','left',1e308);overflow.number('largeB','left',1e308);refusal(overflow);
});
test('cloud-state changes invalidate an already cached native domain proof',()=>{
 const f=fixture();assert.deepEqual(f.invoke(),[['number']]);f.variables.boolean.isCloud=true;assert.throws(f.invokeCurrent,/source graph changed/);
});
