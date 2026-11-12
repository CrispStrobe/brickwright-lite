import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const create=require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/console-inspect-values');
const loan=require('../overlay/scratch-vm/src/util/bw-primitive-owner');
function fixture(){
 const blocks={},add=(id,opcode,parent=null,inputs={},fields={})=>blocks[id]={id,opcode,parent,inputs,fields,shadow:false,topLevel:false,next:null};
 const number=(id,parent,value)=>{const b=add(id,'math_number',parent,{}, {NUM:{value:String(value)}});b.shadow=true;return b;};
 const text=(id,parent,value)=>{const b=add(id,'text',parent,{}, {TEXT:{value}});b.shadow=true;return b;};
 add('hat','arcade_whenSourceStarts').topLevel=true;blocks.hat.next='alloc';
 add('alloc','arcade_setLocal','hat',{NAME:{block:'allocName'},VALUE:{block:'empty'}}).next='push0';
 text('allocName','alloc','temporary');add('empty','arrays_createReference','alloc',{VALUES:{block:'emptyValues'}});text('emptyValues','empty','[]');
 for(let i=0;i<2;i++){const id='push'+i;add(id,'arrays_mutateReference',i?'push0':'alloc',{ARRAY:{block:'ref'+i},OP:{block:'op'+i},VALUE:{block:'num'+i}}).next=i?'out':'push1';add('ref'+i,'arcade_getLocal',id,{NAME:{block:'name'+i}});text('name'+i,'ref'+i,'temporary');text('op'+i,id,'push');number('num'+i,id,i+5);}
 blocks.num1.opcode='text';blocks.num1.fields={TEXT:{value:'text'}};
 add('out','data_setvariableto','push1',{VALUE:{block:'inspect'}});
 add('inspect','arcade_inspectValue','out',{VALUE:{block:'item'},LIMIT:{block:'limit'}});
 add('item','arrays_referenceItem','inspect',{ARRAY:{block:'receiver'},INDEX:{block:'index'}});
 add('receiver','arcade_getLocal','item',{NAME:{block:'receiverName'}});text('receiverName','receiver','temporary');number('index','item',0);number('limit','inspect',20);
 const container={_blocks:blocks,getBlock:id=>blocks[id],getInputs:b=>b.inputs,_cache:{_executeCached:{}}};
 const target={isOriginal:true,blocks:container};const thread={target,blockContainer:container,peekStack:()=> 'out',isKilled:false};
 const runtime=new EventEmitter();Object.assign(runtime,{targets:[target],threads:[thread],sequencer:{activeThread:thread},isActiveThread:t=>t===thread});
 const util={runtime,thread,target},args={VALUE:5,LIMIT:20};let service;
 const method=()=>service.inspect(args,util);runtime.getOpcodeFunction=op=>op==='arcade_inspectValue'?method:null;
 const operation={id:'inspect',opcode:'arcade_inspectValue',_argValues:args,_blockFunction:method,fields:blocks.inspect.fields,inputs:blocks.inspect.inputs};container._cache._executeCached.out={_ops:[operation]};
 service=create(runtime,{referenceTypeOf:()=>undefined,typeOf:()=>undefined});
 const invoke=()=>{service.snapshot();return loan.invoke(runtime,thread,container,operation,args,util,()=>service.inputDomains(args,util,['VALUE']));};
 return{blocks,add,text,number,invoke};
}
test('actual native domain query proves an in-bounds local literal-array slot',()=>{
 for(const [index,type]of [[0,'number'],[1,'string']]){const f=fixture();f.blocks.index.fields.NUM.value=String(index);assert.deepEqual(f.invoke(),[[type]]);}
 const f=fixture();f.blocks.num0.opcode='text';f.blocks.num0.fields={TEXT:{value:'text'}};assert.deepEqual(f.invoke(),[['string']]);
});
test('local positional near misses cannot gain precise Number evidence',()=>{
 const cases={
  outOfBounds:f=>{f.blocks.index.fields.NUM.value='2';},
  dynamicIndex:f=>{f.blocks.index.opcode='arcade_getLocal';},
  rewrite:f=>{f.blocks.alloc.next='rewrite';f.add('rewrite','arcade_setLocal','alloc',{NAME:{block:'rewriteName'},VALUE:{block:'other'}}).next='push0';f.text('rewriteName','rewrite','temporary');f.number('other','rewrite',3);f.blocks.push0.parent='rewrite';},
  mutation:f=>{f.blocks.op1.fields.TEXT.value='pop';},
  alias:f=>{f.blocks.ref0.parent='out';},
  call:f=>{f.blocks.num0.opcode='arcade_callFunction';},
  branch:f=>{f.blocks.push0.opcode='control_if';},
  loop:f=>{f.blocks.push0.next='push0';},
  earlyRead:f=>{f.blocks.alloc.parent='push0';f.blocks.hat.next='out';},
  capture:f=>{f.add('capture','arcade_getCaptured',null,{NAME:{block:'captureName'}});f.text('captureName','capture','temporary');},
  extraEffect:f=>{f.blocks.alloc.next='effect';f.add('effect','arcade_callFunction','alloc').next='push0';f.blocks.push0.parent='effect';},
  extraPushInput:f=>{f.blocks.push0.inputs.EXTRA={block:'effect'};f.add('effect','arcade_callFunction','push0');},
  dynamicLocalName:f=>{f.blocks.receiverName.opcode='operator_join';},
  computedElement:f=>{f.blocks.num0.opcode='operator_add';},
  disconnectedIndex:f=>{f.blocks.index.parent='other';}
 };
 for(const [name,change]of Object.entries(cases)){const f=fixture();change(f);let actual;try{actual=f.invoke();}catch(error){assert.match(error.message,/primitive domain evidence/,name);continue;}assert.notDeepEqual(actual,[['number']],name);}
});
