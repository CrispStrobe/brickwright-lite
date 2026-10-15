import test from 'node:test';
import assert from 'node:assert/strict';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
const text=value=>[1,[10,value]];
function fixture(type='String',argument=null) {
 const blocks={
  def:{opcode:'procedures_definition',topLevel:true,parent:null,next:'declare',inputs:{custom_block:[1,'proto']},fields:{}},
  proto:{opcode:'procedures_prototype',parent:'def',next:null,inputs:{arg:[1,'formal']},fields:{},mutation:{proccode:'holdText %s',argumentnames:'["thisText"]',argumentids:'["arg"]',argumentdefaults:'[""]',warp:'false'}},
  formal:{opcode:'argument_reporter_string_number',parent:'proto',shadow:true,inputs:{},fields:{VALUE:['thisText',null]}},
  declare:{opcode:'arcade_declareParameterConstraint',parent:'def',next:'display',inputs:{},fields:{PROCEDURE:['holdText %s',null],PARAMETER:['thisText',null],TYPE:[type,null]}},
  display:{opcode:'arcade_showLongText',parent:'declare',next:null,fields:{LAYOUT:['Bottom',null]},inputs:{TEXT:[1,'read']}},
  read:{opcode:'argument_reporter_string_number',parent:'display',inputs:{},fields:{VALUE:['thisText',null]}}
 };
 if(argument){blocks.hat={opcode:'event_whenflagclicked',topLevel:true,parent:null,next:'call',inputs:{},fields:{}};blocks.call={opcode:'procedures_call',parent:'hat',next:null,inputs:{arg:[1,'leaf']},fields:{},mutation:{proccode:'holdText %s',argumentids:'["arg"]'}};blocks.leaf={...argument,parent:'call',inputs:{},shadow:true};}
 return {targets:[{name:'Stage',isStage:true,blocks,variables:{},lists:{},broadcasts:{},costumes:[],sounds:[]}],extensions:['arcade']};
}
test('unused String helper retains its actual body/annotation without fabricating caller facts',()=>{
 const exported=projectToArcade(fixture());assert.deepEqual(exported.unsupported,[]);assert.deepEqual(exported.warnings,[]);
 assert.match(exported.ts,/function holdText\s*\(thisText: string\)/);assert.match(exported.ts,/game.showLongText\(thisText/);assert.doesNotMatch(exported.ts,/holdText\("/);
 const imported=arcadeToPseudocode(exported.files);assert.deepEqual(imported.unsupported,[]);assert.deepEqual(imported.warnings,[]);
});
test('physical current Number/Text callers satisfy only matching contracts',()=>{
 for(const [type,opcode,fields,pass]of [['String','text',{TEXT:['20',null]},true],['Number','math_number',{NUM:['20',null]},true],['String','math_number',{NUM:['20',null]},false],['Number','text',{TEXT:['20',null]},false]]){
  const exported=projectToArcade(fixture(type,{opcode,fields}));assert.equal(exported.unsupported.length===0,pass,JSON.stringify({type,opcode,unsupported:exported.unsupported}));
 }
});
test('current actual formal writes and stale visible declaration identity cannot silently annotate',()=>{
 for(const change of [p=>{p.targets[0].blocks.declare.fields.PARAMETER=['foreign',null];},p=>{const b=p.targets[0].blocks;b.declare.next='write';b.write={opcode:'arcade_setLocal',parent:'declare',next:'display',fields:{},inputs:{NAME:text('thisText'),VALUE:[1,[4,'20']]}};b.display.parent='write';},p=>{p.targets[0].blocks.proto.mutation.argumentids='["changed"]';}]){
  const project=fixture();change(project);assert.ok(projectToArcade(project).unsupported.some(x=>x.includes('Procedure parameter constraint')));
 }
});

test('typed formal text writes preserve physical numeric-looking text; Any does not prove inspection',()=>{
 const project=fixture(),b=project.targets[0].blocks;b.declare.next='write';b.write={opcode:'arcade_setLocal',parent:'declare',next:'display',fields:{},inputs:{NAME:text('thisText'),VALUE:[1,'text20']}};b.display.parent='write';b.text20={opcode:'text',parent:'write',shadow:true,fields:{TEXT:['20',null]},inputs:{}};
 const exported=projectToArcade(project);assert.deepEqual(exported.unsupported,[]);assert.match(exported.ts,/thisText = "20"/);
 const opaque=fixture('Any'),o=opaque.targets[0].blocks;o.display.inputs.TEXT=[1,'inspect'];o.inspect={opcode:'arcade_inspectValue',parent:'display',fields:{},inputs:{VALUE:[1,'read'],LIMIT:[1,'undef']}};o.read.parent='inspect';o.undef={opcode:'arrays_specialValue',parent:'inspect',fields:{},inputs:{KIND:text('undefined')}};
 assert.ok(projectToArcade(opaque).unsupported.some(message=>message.includes('primitive VALUE')));
});


test('current export reports extra constrained inputs instead of dropping their effects',()=>{
 for(const location of ['stock','managed','argument']){
  const project=fixture('Number',{opcode:'math_number',fields:{NUM:['20',null]}}),b=project.targets[0].blocks;
  if(location!=='stock'){
   b.call.opcode='arcade_callFunction';delete b.call.mutation;b.call.inputs={NAME:text('holdText %s'),ARGS:[1,'args']};
   b.args={opcode:'arcade_functionArgument',parent:'call',next:null,fields:{},inputs:{VALUE:[1,'leaf'],REST:text('[]')}};b.leaf.parent='args';
  }
  const owner=location==='argument'?'args':'call';b[owner].inputs.EXTRA=[1,'sideEffect'];
  b.sideEffect={opcode:'arcade_callFunction',parent:owner,next:null,fields:{},inputs:{NAME:text('sideEffect'),ARGS:text('[]')}};
  const exported=projectToArcade(project);assert.ok(exported.unsupported.some(message=>message.includes('requires exactly its actual input sockets')),JSON.stringify({location,unsupported:exported.unsupported}));
 }
});
