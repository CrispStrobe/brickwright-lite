import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const create=require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/console-inspect-values');
const loan=require('../overlay/scratch-vm/src/util/bw-primitive-owner');

// These are current VM block records, passed through the real native ownership
// loan and inputDomains entry. They exercise source proof, not a guest VM.
function fixture(accessor=false){
 const blocks={},add=(id,opcode,parent=null,inputs={},fields={})=>blocks[id]={id,opcode,parent,inputs,fields,shadow:false,topLevel:false,next:null};
 const text=(id,parent,value)=>{const b=add(id,'text',parent,{}, {TEXT:{value}});b.shadow=true;return b;};
 const number=(id,parent,value)=>{const b=add(id,'math_number',parent,{}, {NUM:{value:String(value)}});b.shadow=true;return b;};
 const value=(node,key,content)=>{node.inputs[key]={block:node.id+key};return text(node.id+key,node.id,content);};
 const local=(id,parent,name)=>{const b=add(id,'arcade_getLocal',parent);value(b,'NAME',name);return b;};
 const procedure=(id,code,params)=>{const root=add(id,'procedures_definition');root.topLevel=true;root.inputs.custom_block={block:id+'proto'};add(id+'proto','procedures_prototype',id).mutation={proccode:code,argumentnames:JSON.stringify(params),argumentids:JSON.stringify(params)};return root;};
 const selfWrite=(id,root,field,arg)=>{const b=add(id,'arcade_setObjectField',root.id,{OBJECT:{block:id+'self'},VALUE:{block:id+'value'}});value(b,'FIELD',field);local(id+'self',id,'self');local(id+'value',id,arg);root.next=id;return b;};
 const ctor='Box.ctor %s %s',getter='Box.get %s',setter='Box.set %s %s';
 const fields=[{name:'n',type:'number',readonly:false,parameterProperty:true},...(accessor?[{name:'value',type:'number',readonly:false,getter,setter:{procedure:setter,parameters:[{name:'v',type:'number',optional:false}]}}]:[])];
 add('hat','arcade_whenSourceStarts').topLevel=true;blocks.hat.next='decl';
 const decl=add('decl','arcade_declareClass','hat');decl.next='alloc';
 for(const [key,val] of Object.entries({NAME:'Box',FIELDS:JSON.stringify(fields),PARAMETERS:JSON.stringify([{name:'n',type:'number',optional:false}]),METHODS:'[]',INITIALIZER:'',CONSTRUCTOR:ctor}))value(decl,key,val);
 const alloc=add('alloc','data_setvariableto','decl',{VALUE:{block:'new'}},{VARIABLE:{id:'box'}});alloc.next=accessor?'dispatch':'out';
 const object=add('new','arcade_createObject','alloc',{ARGS:{block:'arg'}});value(object,'CLASS','Box');
 const arg=add('arg','arcade_functionArgument','new',{VALUE:{block:'one'}});value(arg,'REST','[]');number('one','arg',1);
 const constructor=procedure('ctor',ctor,['self','n']);selfWrite('init',constructor,'n','n');
 if(accessor){
  const get=procedure('get',getter,['self']);get.next='ret';add('ret','arcade_returnValue','get',{VALUE:{block:'backing'}});
  const backing=add('backing','arcade_objectField','ret',{OBJECT:{block:'getself'}});value(backing,'FIELD','n');local('getself','backing','self');
  const set=procedure('set',setter,['self','v']);selfWrite('setn',set,'n','v');
  const dispatch=add('dispatch','arcade_setObjectField','alloc',{OBJECT:{block:'dispatchbox'},VALUE:{block:'two'}});value(dispatch,'FIELD','value');dispatch.next='out';add('dispatchbox','data_variable','dispatch',{}, {VARIABLE:{id:'box'}});number('two','dispatch',2);
 }
 add('out','data_setvariableto',accessor?'dispatch':'alloc',{VALUE:{block:'inspect'}});
 add('inspect','arcade_inspectValue','out',{VALUE:{block:'read'},LIMIT:{block:'limit'}});number('limit','inspect',20);
 const read=add('read','arcade_objectField','inspect',{OBJECT:{block:'boxread'}});value(read,'FIELD',accessor?'value':'n');add('boxread','data_variable','read',{}, {VARIABLE:{id:'box'}});
 const variable={id:'box',name:'box',type:'',value:null},container={_blocks:blocks,getBlock:id=>blocks[id],getInputs:b=>b.inputs,_cache:{_executeCached:{}}};
 const target={isOriginal:true,blocks:container,variables:{box:variable},lookupVariableById:id=>id==='box'?variable:undefined};
 const thread={target,blockContainer:container,peekStack:()=> 'out',isKilled:false},runtime=new EventEmitter();
 Object.assign(runtime,{targets:[target],threads:[thread],sequencer:{activeThread:thread},isActiveThread:t=>t===thread});
 const util={runtime,thread,target},args={VALUE:2,LIMIT:20};let service;
 const method=()=>service.inspect(args,util);runtime.getOpcodeFunction=op=>op==='arcade_inspectValue'?method:null;
 const operation={id:'inspect',opcode:'arcade_inspectValue',_argValues:args,_blockFunction:method,fields:blocks.inspect.fields,inputs:blocks.inspect.inputs};container._cache._executeCached.out={_ops:[operation]};
 service=create(runtime,{referenceTypeOf:()=>undefined,typeOf:()=>undefined});
 const query=(requests=['VALUE'])=>{service.snapshot();return loan.invoke(runtime,thread,container,operation,args,util,()=>service.inputDomains(args,util,requests));};
 return {blocks,add,text,number,value,local,procedure,query,runtime,target,fields,decl,ctor,setter};
}

test('constructor backing fields and getter/setter dispatch use actual Number producers',()=>{
 assert.deepEqual(fixture().query(),[['number']]);const f=fixture(true);assert.deepEqual(f.query(),[['number']]);
 assert.deepEqual(f.query([{procedure:f.setter,formal:'v'}]),[['number']]);
 assert.throws(()=>f.query([{procedure:f.ctor,formal:'n'}]),/primitive domain evidence/);
});

test('class Number annotations never replace actual Text or Boolean constructor/setter values',()=>{
 for(const accessor of [false,true])for(const type of ['string','boolean']){
  const f=fixture(accessor),node=f.blocks[accessor?'two':'one'];
  if(type==='string'){node.opcode='text';node.fields={TEXT:{value:'x'}};}else{node.opcode='operator_equals';node.fields={};node.inputs={OPERAND1:{block:'b1'},OPERAND2:{block:'b2'}};f.number('b1',node.id,1);f.number('b2',node.id,1);}
  const result=f.query()[0];assert.ok(result.includes(type));assert.notDeepEqual(result,['number']);
  if(accessor)assert.deepEqual(f.query([{procedure:f.setter,formal:'v'}]),[[type]]);
 }
});

test('unproven writers, read-before-construction and uncertain dispatch remain refused',()=>{
 const cases={
  nativeProcedureCollision:f=>{const code='__bwClass_Sprite_constructor %s %s';f.blocks.declCONSTRUCTOR.fields.TEXT.value=code;f.blocks.ctorproto.mutation.proccode=code;},
  invalidFieldType:f=>{f.fields[0].type='bad type';f.blocks.declFIELDS.fields.TEXT.value=JSON.stringify(f.fields);},
  missingReadonly:f=>{delete f.fields[0].readonly;f.blocks.declFIELDS.fields.TEXT.value=JSON.stringify(f.fields);},
  invalidClassName:f=>{f.blocks.declNAME.fields.TEXT.value='bad name';f.blocks.newCLASS.fields.TEXT.value='bad name';},
  ownedBridgeClassCollision:f=>{f.blocks.declNAME.fields.TEXT.value='__bwOwnedSDKSprite';f.blocks.newCLASS.fields.TEXT.value='__bwOwnedSDKSprite';},
  intrinsicCollision:f=>{f.blocks.declNAME.fields.TEXT.value='Sprite';f.blocks.newCLASS.fields.TEXT.value='Sprite';},
  throwingConstructorLiteralGetter:f=>{f.blocks.init.opcode='arcade_throwValue';f.blocks.init.inputs={VALUE:{block:'thrown'}};f.text('thrown','init','construction failed');f.blocks.ret.inputs.VALUE={block:'literalGetter'};f.number('literalGetter','ret',9);},
  tooManyArguments:f=>{const rest=f.add('extraArg','arcade_functionArgument','arg',{VALUE:{block:'extraValue'}});f.value(rest,'REST','[]');f.number('extraValue','extraArg',2);f.blocks.arg.inputs.REST={block:'extraArg'};},
  declarationAfterAllocation:f=>{f.blocks.hat.next='alloc';f.blocks.alloc.parent='hat';f.blocks.alloc.next='decl';f.blocks.decl.parent='alloc';f.blocks.decl.next='dispatch';f.blocks.dispatch.parent='decl';},
  malformedArguments:f=>{f.blocks.arg.opcode='operator_join';},
  dynamicField:f=>{delete f.blocks.readFIELD.fields.TEXT;},
  unknownWriter:f=>{const w=f.add('opaque','arcade_setObjectField');f.value(w,'FIELD','n');w.inputs.OBJECT={block:'opaqueReceiver'};f.text('opaqueReceiver','opaque','unknown');w.inputs.VALUE={block:'opaqueValue'};f.number('opaqueValue','opaque',5);},
  beforeConstruct:f=>{f.blocks.decl.next='out';f.blocks.out.parent='decl';f.blocks.out.next='alloc';f.blocks.alloc.parent='out';f.blocks.alloc.next=null;},
  readInsideConstructor:f=>{f.blocks.one.opcode='arcade_objectField';f.blocks.one.fields={};f.blocks.one.inputs={OBJECT:{block:'earlyself'}};f.value(f.blocks.one,'FIELD','n');f.local('earlyself','one','self');},
  overwrittenSelf:f=>{const b=f.add('overwriteSelf','arcade_setLocal','get',{VALUE:{block:'overwriteSelfValue'}});f.value(b,'NAME','self');f.text('overwriteSelfValue','overwriteSelf','text');f.blocks.get.next='overwriteSelf';b.next='ret';f.blocks.ret.parent='overwriteSelf';},
  unknownSelfWriter:f=>{const b=f.add('overwriteSelf','arcade_setLocal','set',{VALUE:{block:'overwriteSelfValue'}});f.value(b,'NAME','self');f.text('overwriteSelfValue','overwriteSelf','text');f.blocks.set.next='overwriteSelf';b.next='setn';f.blocks.setn.parent='overwriteSelf';},
  missingBackingWriter:f=>{f.blocks.ctor.next=null;},
  setterDuringConstruction:f=>{const b=f.add('earlySet','arcade_setObjectField','ctor',{OBJECT:{block:'earlySetself'},VALUE:{block:'earlySetvalue'}});f.local('earlySetself','earlySet','self');f.number('earlySetvalue','earlySet',9);f.value(b,'FIELD','value');b.next='init';f.blocks.init.parent='earlySet';f.blocks.ctor.next='earlySet';},
  conditionalConstruction:f=>{f.blocks.init.opcode='control_if';},
  inheritance:f=>{f.blocks.decl.opcode='arcade_declareSubclass';f.value(f.blocks.decl,'BASE','Other');},
  duplicateClass:f=>{const b=f.add('other','arcade_declareClass');for(const [name,slot]of Object.entries(f.blocks.decl.inputs))f.value(b,name,f.blocks[slot.block].fields.TEXT.value);},
  unfinishedReceiverEscapes:f=>{f.blocks.init.inputs.VALUE={block:'selfEscape'};f.local('selfEscape','init','self');},
  dynamicDispatch:f=>{delete f.blocks.dispatchFIELD.fields.TEXT;},
  foreignWriter:f=>{f.runtime.targets.push({isOriginal:true,blocks:{_blocks:{writer:{opcode:'arcade_setObjectField'}}}});},
  laterReset:f=>{const b=f.add('reset','data_setvariableto','out',{VALUE:{block:'lateNull'}},{VARIABLE:{id:'box'}});f.blocks.out.next='reset';f.add('lateNull','arrays_specialValue','reset',{}, {KIND:{value:'null'}});},
 };
 for(const [label,change]of Object.entries(cases)){const f=fixture(true);change(f);assert.throws(()=>f.query(),/primitive domain evidence/,label);}
});

test('an ordinary explicit setter caller cannot disappear behind field-assignment dispatch',()=>{
 const f=fixture(true),call=f.add('direct','arcade_callFunction','out',{ARGS:{block:'directArg'}});f.value(call,'NAME',f.setter);f.blocks.out.next='direct';
 const arg=f.add('directArg','arcade_functionArgument','direct',{VALUE:{block:'directSelf'},REST:{block:'directRest'}});f.add('directSelf','data_variable','directArg',{}, {VARIABLE:{id:'box'}});
 const rest=f.add('directRest','arcade_functionArgument','directArg',{VALUE:{block:'bad'}});f.value(rest,'REST','[]');f.text('bad','directRest','text');
 assert.throws(()=>f.query(),/primitive domain evidence/);
});

test('setter local writers cannot replace missing field dispatch and retain every domain',()=>{
 const f=fixture(true),writer=f.add('localWrite','arcade_setLocal','set',{VALUE:{block:'localValue'}});
 f.value(writer,'NAME','v');f.text('localValue','localWrite','text');
 f.blocks.set.next='localWrite';writer.next='setn';f.blocks.setn.parent='localWrite';
 const request={procedure:f.setter,formal:'v'};
 assert.deepEqual(new Set(f.query([request])[0]),new Set(['number','string']));
 // A local writer proves a possible value, but never proves an invocation.
 delete f.blocks.dispatch;f.blocks.alloc.next='out';f.blocks.out.parent='alloc';
 assert.throws(()=>f.query([request]),/primitive domain evidence/);
});

test('bounded declaration admission agrees with the genuine heap schema on supported descriptors',()=>{
 const heap=require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/object-heap');
 for(const type of ['number','boolean','string','any']){
  const f=fixture(true);for(const field of f.fields)field.type=type;f.blocks.declFIELDS.fields.TEXT.value=JSON.stringify(f.fields);
  const spec={name:'Box',fields:f.fields,parameters:[{name:'n',type:'number',optional:false}],methods:[],initializer:'',constructor:f.ctor};
  assert.doesNotThrow(()=>heap(null,null).register(spec));assert.deepEqual(f.query(),[['number']]);
 }
 const changes=[spec=>{spec.name='bad name';},spec=>{spec.fields[0].type='bad type';},spec=>{delete spec.fields[0].readonly;},
  spec=>{spec.fields[0].unexpected=true;},spec=>{spec.parameters[0].optional='false';},spec=>{spec.parameters[0].name='bad name';},
  spec=>{spec.parameters[0].default=3;},spec=>{spec.fields[1].setter.parameters=[];},spec=>{spec.fields[1].setter.parameters[0].optional=true;},
  spec=>{spec.fields[1].readonly=true;},spec=>{spec.fields[1].initializer='1';},spec=>{spec.fields[1].getter='';}];
 for(const change of changes){const f=fixture(true),spec={name:'Box',fields:f.fields,parameters:[{name:'n',type:'number',optional:false}],methods:[],initializer:'',constructor:f.ctor};change(spec);
  assert.throws(()=>heap(null,null).register(spec));
  for(const [key,value]of Object.entries({NAME:spec.name,FIELDS:JSON.stringify(spec.fields),PARAMETERS:JSON.stringify(spec.parameters)}))f.blocks['decl'+key].fields.TEXT.value=value;
  f.blocks.newCLASS.fields.TEXT.value=spec.name;assert.throws(()=>f.query(),/primitive domain evidence/);
 }
});

test('a raw field read before the sole allocation gains no completed-instance evidence',()=>{
 const f=fixture();f.blocks.decl.next='out';f.blocks.out.parent='decl';f.blocks.out.next='alloc';f.blocks.alloc.parent='out';f.blocks.alloc.next=null;
 assert.throws(()=>f.query(),/primitive domain evidence/);
});

test('constructor source arithmetic stays pure and retains actual operand domains',()=>{
 const compound=(operation='+')=>{
  const f=fixture(),expr=f.add('arithmetic','arrays_valueBinary','init',{LEFT:{block:'initvalue'},RIGHT:{block:'constant'}});
  f.value(expr,'OP',operation);f.number('constant','arithmetic',2);
  f.blocks.initvalue.parent='arithmetic';f.blocks.init.inputs.VALUE={block:'arithmetic'};
  return f;
 };
 for(const operation of ['+','-','*']){
  assert.deepEqual(compound(operation).query(),[['number']]);
  const f=compound(operation);delete f.blocks.arithmetic.inputs.OP;f.blocks.arithmetic.fields={OP:{value:operation}};
  assert.deepEqual(f.query(),[['number']]);
 }
 const text=compound();text.blocks.one.opcode='text';text.blocks.one.fields={TEXT:{value:'x'}};
 assert.deepEqual(text.query(),[['string']]);
 for(const change of [
  f=>{f.blocks.arithmeticOP.fields.TEXT.value='/';},
  f=>{delete f.blocks.arithmeticOP.fields.TEXT;},
  f=>{f.blocks.arithmetic.inputs.EXTRA={block:'extraCall'};f.add('extraCall','arcade_callFunction','arithmetic');},
  f=>{f.blocks.arithmetic.fields={OP:{value:'+'}};f.blocks.arithmeticOP.opcode='arcade_callFunction';},
  f=>{f.blocks.arithmeticOP.inputs.EXTRA={block:'extraCall'};f.add('extraCall','arcade_callFunction','arithmeticOP');},
  f=>{f.blocks.arithmeticOP.next='extraCall';f.add('extraCall','arcade_callFunction','arithmeticOP');},
  f=>{f.blocks.arithmeticOP.shadow=false;},
  f=>{f.blocks.arithmetic.fields={OP:{value:'+'}};},
  f=>{f.blocks.initvalue.inputs.EXTRA={block:'extraCall'};f.add('extraCall','arcade_callFunction','initvalue');},
  f=>{f.blocks.initvalueNAME.inputs.EXTRA={block:'extraCall'};f.add('extraCall','arcade_callFunction','initvalueNAME');},
  f=>{f.blocks.initvalue.fields={NAME:{value:'n'}};f.blocks.initvalueNAME.opcode='arcade_callFunction';},
  f=>{f.blocks.initvalue.parent='init';},
  f=>{f.blocks.initvalueNAME.parent='init';},
  f=>{f.blocks.init.inputs.EXTRA={block:'extraCall'};f.add('extraCall','arcade_callFunction','init');},
  f=>{f.blocks.initFIELD.inputs.EXTRA={block:'extraCall'};f.add('extraCall','arcade_callFunction','initFIELD');},
  f=>{f.blocks.initself.inputs.EXTRA={block:'extraCall'};f.add('extraCall','arcade_callFunction','initself');},
  f=>{f.blocks.initselfNAME.inputs.EXTRA={block:'extraCall'};f.add('extraCall','arcade_callFunction','initselfNAME');},
  f=>{f.blocks.init.parent='hat';},
  f=>{f.blocks.init.fields={FIELD:{value:'n'}};f.blocks.initFIELD.opcode='arcade_callFunction';},
  f=>{f.blocks.initvalue.opcode='arcade_callFunction';f.blocks.initvalue.inputs={};f.value(f.blocks.initvalue,'NAME','opaque');},
  f=>{f.blocks.initvalue.opcode='arcade_objectField';f.blocks.initvalue.inputs={OBJECT:{block:'unfinished'}};f.value(f.blocks.initvalue,'FIELD','n');f.local('unfinished','initvalue','self');},
  f=>{f.blocks.initvalue.inputs.NAME.block='selfName';f.text('selfName','initvalue','self');}
 ]){const f=compound();change(f);assert.throws(()=>f.query(),/primitive domain evidence/);}
});


test('constructor unary Number operations require a closed operation and pure owned operand',()=>{
 const unary=(operation='~',fixed=false)=>{
  const f=fixture(),expr=f.add('unary','arrays_valueUnary','init',{VALUE:{block:'initvalue'}});
  if(fixed)expr.fields={OP:{value:operation}};else f.value(expr,'OP',operation);
  f.blocks.initvalue.parent='unary';f.blocks.init.inputs.VALUE={block:'unary'};
  return f;
 };
 for(const operation of ['+','-','~'])for(const fixed of [false,true])
  assert.deepEqual(unary(operation,fixed).query(),[['number']]);
 const ordinaryActual=()=>{
  const f=unary(),fn=f.procedure('source','source',[]);fn.next='sourceReturn';
  f.add('sourceReturn','arcade_returnValue','source',{VALUE:{block:'sourceValue'}});f.number('sourceValue','sourceReturn',3);
  f.blocks.one.opcode='arcade_callFunction';f.blocks.one.fields={};f.blocks.one.inputs={};
  f.value(f.blocks.one,'NAME','source');f.value(f.blocks.one,'ARGS','[]');return f;
 };
 const variableActual=(local=false)=>{
  const f=unary(),writer=f.add('sourceWriter',local?'arcade_setLocal':'data_setvariableto','decl',{VALUE:{block:'sourceValue'}},local?{}:{VARIABLE:{id:'source'}});
  f.number('sourceValue','sourceWriter',3);writer.next='alloc';f.blocks.decl.next='sourceWriter';f.blocks.alloc.parent='sourceWriter';
  f.blocks.one.opcode=local?'arcade_getLocal':'data_variable';f.blocks.one.fields=local?{}:{VARIABLE:{id:'source'}};f.blocks.one.inputs={};
  if(local){f.value(writer,'NAME','source');f.value(f.blocks.one,'NAME','source');}
  else{const lookup=f.target.lookupVariableById,variable={id:'source',name:'source',type:'',value:0};f.target.variables.source=variable;f.target.lookupVariableById=id=>id==='source'?variable:lookup(id);}
  return f;
 };
 for(const prepare of [ordinaryActual,variableActual,()=>variableActual(true)])assert.deepEqual(prepare().query(),[['number']]);
 for(const change of [
  f=>{f.blocks.arg.parent='alloc';},f=>{f.blocks.one.parent='new';},
  f=>{f.blocks.argREST.parent='new';},
  f=>{f.blocks.arg.inputs.EXTRA={block:'extra'};f.number('extra','arg',3);},
  f=>{f.blocks.arg.fields.VALUE={value:'masked'};},
 ]){const f=unary();change(f);assert.throws(()=>f.query(),/primitive domain evidence/);}
 for(const change of [
  f=>{f.blocks.sourceValue.parent='source';},
  f=>{f.blocks.sourceReturn.parent='out';},
  f=>{f.blocks.sourceReturn.inputs.EXTRA={block:'extra'};f.number('extra','sourceReturn',3);},
  f=>{f.blocks.sourceReturn.fields.VALUE={value:'masked'};},
  f=>{f.blocks.oneARGS.parent='arg';},
 ]){const f=ordinaryActual();change(f);assert.throws(()=>f.query(),/primitive domain evidence/);}
 for(const local of [false,true])for(const change of [
  f=>{f.blocks.sourceValue.parent='decl';},
  f=>{f.blocks.sourceWriter.parent='out';},
  f=>{f.blocks.sourceWriter.inputs.EXTRA={block:'extra'};f.number('extra','sourceWriter',3);},
  f=>{f.blocks.sourceWriter.fields.VALUE={value:'masked'};},
 ]){const f=variableActual(local);change(f);assert.throws(()=>f.query(),/primitive domain evidence/);}
 for(const kind of ['NaN','Infinity','-0','undefined']){
  const f=unary();f.blocks.one.opcode='arrays_specialValue';f.blocks.one.fields={KIND:{value:kind}};
  assert.throws(()=>f.query(),/primitive domain evidence/);
 }
 for(const operation of ['~','+','-']){
  const f=unary();f.blocks.one.opcode='arrays_valueUnary';f.blocks.one.fields={};
  f.value(f.blocks.one,'OP',operation);f.blocks.one.inputs.VALUE={block:'opaque'};
  const opaque=f.add('opaque','arrays_createReference','one');f.value(opaque,'VALUES','[]');
  assert.throws(()=>f.query(),/primitive domain evidence/);
 }
 // Number is an actual-formal obligation, even for unary operations which
 // could convert other primitive values. Opaque actuals must never borrow it.
 for(const change of [
  f=>{f.blocks.one.opcode='text';f.blocks.one.fields={TEXT:{value:'x'}};},
  f=>{f.blocks.one.opcode='arrays_specialValue';f.blocks.one.fields={KIND:{value:'undefined'}};},
  f=>{f.blocks.one.opcode='arrays_specialValue';f.blocks.one.fields={KIND:{value:'null'}};},
  f=>{f.blocks.one.opcode='operator_equals';f.blocks.one.fields={};f.blocks.one.inputs={OPERAND1:{block:'boolA'},OPERAND2:{block:'boolB'}};f.number('boolA','one',1);f.number('boolB','one',1);},
  f=>{f.blocks.one.opcode='arrays_createReference';f.blocks.one.fields={};f.value(f.blocks.one,'VALUES','[]');},
  f=>{f.blocks.one.opcode='arcade_createObject';f.blocks.one.fields={};f.value(f.blocks.one,'CLASS','Box');f.value(f.blocks.one,'ARGS','[]');},
 ])for(const nested of [false,true]){
  const f=unary();change(f);
  if(nested){const binary=f.add('nested','arrays_valueBinary','unary',{LEFT:{block:'initvalue'},RIGHT:{block:'constant'}});f.value(binary,'OP','*');f.number('constant','nested',2);f.blocks.initvalue.parent='nested';f.blocks.unary.inputs.VALUE={block:'nested'};}
  assert.throws(()=>f.query(),/primitive domain evidence/);
 }
 for(const change of [
  f=>{f.blocks.unaryOP.fields.TEXT.value='typeof';},
  f=>{f.blocks.unaryOP.fields.TEXT.value='!';},
  f=>{delete f.blocks.unaryOP.fields.TEXT;},
  f=>{f.blocks.unary.inputs.EXTRA={block:'hidden'};f.add('hidden','arcade_callFunction','unary');},
  f=>{f.blocks.unary.fields={OP:{value:'~'}};},
  f=>{f.blocks.unaryOP.opcode='arcade_callFunction';},
  f=>{f.blocks.unaryOP.inputs.EXTRA={block:'hidden'};f.add('hidden','arcade_callFunction','unaryOP');},
  f=>{f.blocks.unaryOP.fields.EXTRA={value:'hidden'};},
  f=>{f.blocks.unaryOP.parent='init';},
  f=>{f.blocks.unaryOP.shadow=false;},
  f=>{f.blocks.unaryOP.next='hidden';f.add('hidden','arcade_callFunction','unaryOP');},
  f=>{f.blocks.unary.parent='ctor';},
  f=>{f.blocks.initvalue.parent='init';},
  f=>{f.blocks.unary.next='hidden';f.add('hidden','arcade_callFunction','unary');},
  f=>{f.blocks.initvalue.opcode='arcade_callFunction';},
  f=>{f.blocks.initvalueNAME.fields.TEXT.value='self';},
  f=>{f.blocks.initvalue.inputs.EXTRA={block:'hidden'};f.add('hidden','arcade_callFunction','initvalue');},
  f=>{f.blocks.initvalueNAME.inputs.EXTRA={block:'hidden'};f.add('hidden','arcade_callFunction','initvalueNAME');},
  f=>{f.blocks.initvalue.opcode='arcade_objectField';f.blocks.initvalue.inputs={};},
 ]){const f=unary();change(f);assert.throws(()=>f.query(),/primitive domain evidence/);}
 for(const change of [
  f=>{f.blocks.unary.fields.OP.value='typeof';},
  f=>{f.blocks.unary.fields.EXTRA={value:'hidden'};},
  f=>{f.blocks.unary.inputs.OP={block:'hidden'};f.add('hidden','arcade_callFunction','unary');},
 ]){const f=unary('~',true);change(f);assert.throws(()=>f.query(),/primitive domain evidence/);}
});
