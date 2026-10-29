import test from 'node:test';
import assert from 'node:assert/strict';
import {createProjectJsonSnapshot} from '../overlay/scratch-gui/src/lib/bw-makecode/project-json-snapshot.js';
import {createArrayReferenceExportAuthority} from '../overlay/scratch-gui/src/lib/bw-makecode/array-reference-export-authority.js';

// Independent physical graph of a reimported creation callback. No generated
// name or source marker supplies a value, receiver or reset certificate.
function fixture(which='first',other='actor'){
 const blocks={},target={isStage:true,name:'Stage',variables:{out:['out',0]},blocks};
 const project={targets:[target],extensions:['arcade','arrays'],extensionURLs:{arrays:'https://crispstrobe.github.io/extensions/CrispStrobe/arrays.js'}};
 let serial=0;
 const node=(opcode,inputs={},fields={})=>{
  const id='b'+(++serial),n=blocks[id]={opcode,next:null,parent:null,shadow:false,topLevel:false,inputs:{},fields};
  for(const [key,value]of Object.entries(inputs)){
   n.inputs[key]=typeof value==='string'?[2,value]:[1,value];
   if(typeof value==='string')blocks[value].parent=id;
  }
  return id;
 };
 const text=value=>[10,value],local=name=>node('arcade_getLocal',{NAME:text(name)});
 const set=(name,value)=>node('arcade_setLocal',{NAME:text(name),VALUE:value});
 const hat=node('arcade_whenRegisteredCreated',{TOKEN:text('observed')});blocks[hat].topLevel=true;
 const nullValue=node('arrays_specialValue',{}, {KIND:['null',null]}),reset=set('refs',nullValue);
 const event=node('arcade_eventSprite',{}, {WHICH:[which,null]}),copy=set(other,event);
 const kind=node('arcade_spriteKindValue',{NAME:text('Player')}),snapshot=node('arcade_spritesOfKind',{KIND:kind}),overwrite=set('refs',snapshot);
 const read=node('arrays_referenceItem',{ARRAY:local('refs'),INDEX:[4,'0']}),store=node('data_setvariableto',{VALUE:read},{VARIABLE:['out','out']});
 const chain=[hat,reset,copy,overwrite,store];
 for(let i=0;i+1<chain.length;i++){blocks[chain[i]].next=chain[i+1];blocks[chain[i+1]].parent=chain[i];}
 return {project,blocks,node,hat,reset,copy,event,kind,snapshot,overwrite,read,store};
}
const query=f=>{
 const project=createProjectJsonSnapshot(JSON.stringify(f.project)),target=project.targets[0];
 return {project,target,node:target.blocks[f.read],proof:createArrayReferenceExportAuthority(project)};
};
const decision=q=>q.proof.validateInput(q.target,q.node);
const good=f=>{const q=query(f);assert.deepEqual(decision(q),{ok:true});return q;};
const bad=f=>assert.equal(decision(query(f)).ok,false);

test('a fixed event read into a different private local may precede the definite Array overwrite',()=>{
 for(const which of ['first','second'])for(const name of ['actor','renamed'])good(fixture(which,name));
});
test('a primitive literal written to a different local may precede the Array overwrite',()=>{
 for(const value of [[4,'7'],[10,'text']]){
  const f=fixture();delete f.blocks[f.event];f.blocks[f.copy].inputs.VALUE=[1,value];good(f);
 }
 const f=fixture();delete f.blocks[f.event];f.blocks[f.copy].inputs.VALUE=[1,[12,'out','out']];bad(f);
});
test('physical literal shadows have the same bounded effect as inline literals',()=>{
 for(const [opcode,field,value] of [['text','TEXT','hello'],['math_number','NUM','7']]){
  const f=fixture();f.blocks[f.event].opcode=opcode;f.blocks[f.event].fields={[field]:[value,null]};f.blocks[f.event].shadow=true;f.blocks[f.copy].inputs.VALUE=[1,f.event];good(f);
 }
 const f=fixture();f.blocks[f.event].opcode='text';f.blocks[f.event].fields={TEXT:[{},null]};f.blocks[f.event].shadow=true;f.blocks[f.copy].inputs.VALUE=[1,f.event];bad(f);
});

function traceFixture(){
 const f=fixture(),{blocks,node,copy,overwrite}=f;
 const target=f.project.targets[0];target.variables.trace=['trace',''];
 const value=node('arrays_valueBinary',{LEFT:[12,'trace','trace'],RIGHT:[10,'H']},{OP:['+',null]});
 const write=node('data_setvariableto',{VALUE:value},{VARIABLE:['trace','trace']});
 blocks[copy].next=write;blocks[write].parent=copy;blocks[write].next=overwrite;blocks[overwrite].parent=write;
 return {...f,trace:value,traceWrite:write};
}
function otherTraceWriter(f,value=[10,'C'],opcode='data_setvariableto'){
 const hat=f.node('arcade_whenSourceStarts'),write=f.node(opcode,{VALUE:value},{VARIABLE:['trace','trace']});
 f.blocks[hat].topLevel=true;f.blocks[hat].next=write;f.blocks[write].parent=hat;return write;
}
test('closed primitive global trace writes may precede a definite private Array overwrite',()=>{
 good(traceFixture());
 const source=traceFixture();source.blocks[source.trace].opcode='arcade_sourceValueBinary';good(source);
 const f=traceFixture(),other=f.node('operator_add',{NUM1:[12,'trace','trace'],NUM2:[10,'C']});
 otherTraceWriter(f,other);good(f);
 const shadow=traceFixture();shadow.blocks[shadow.trace].inputs.RIGHT=[1,shadow.event];
 shadow.blocks[shadow.event]={...shadow.blocks[shadow.event],opcode:'text',parent:shadow.trace,shadow:true,fields:{TEXT:['H',null]}};
 shadow.blocks[shadow.copy].inputs.VALUE=[1,[4,'7']];good(shadow);
});
test('the primitive trace invariant checks every initial value and physical writer',()=>{
 let f=traceFixture();f.project.targets[0].variables.trace[1]=[];bad(f);
 f=traceFixture();otherTraceWriter(f,f.node('arrays_createReference',{VALUES:[10,'[]']}));bad(f);
 f=traceFixture();otherTraceWriter(f,[10,'C'],'data_changevariableby');bad(f);
 f=traceFixture();const orphan=otherTraceWriter(f);delete f.blocks[f.blocks[orphan].parent];f.blocks[orphan].parent=null;bad(f);
 f=traceFixture();otherTraceWriter(f,f.node('arcade_getLocal',{NAME:[10,'refs']}));bad(f);
 f=traceFixture();otherTraceWriter(f,f.node('arcade_callFunction',{NAME:[10,'foreign'],ARGS:[10,'[]']}));bad(f);
});
test('cyclic primitive global dependencies close only when every writer preserves them',()=>{
 const make=()=>{const f=traceFixture();f.project.targets[0].variables.second=['second',0];
  f.blocks[f.trace].inputs.LEFT=[1,[12,'second','second']];
  const sum=f.node('arrays_valueBinary',{LEFT:[12,'trace','trace'],RIGHT:[10,'C']},{OP:['+',null]});
  const hat=f.node('arcade_whenSourceStarts'),write=f.node('data_setvariableto',{VALUE:sum},{VARIABLE:['second','second']});
  f.blocks[hat].topLevel=true;f.blocks[hat].next=write;f.blocks[write].parent=hat;return f;};
 good(make());const f=make();otherTraceWriter(f,f.node('arrays_createReference',{VALUES:[10,'[]']}));bad(f);
});
test('trace effects refuse cloud external and writable monitor sources',()=>{
 let f=traceFixture();f.project.targets[0].variables.trace.push(true);bad(f);
 f=traceFixture();f.project.extensions.push('foreign');bad(f);
 f=traceFixture();f.project.extensionURLs.arcade='https://example.invalid/foreign.js';bad(f);
 f=traceFixture();f.node('foreign_mutateGlobals');bad(f);
 f=traceFixture();f.project.monitors=[{id:'trace',opcode:'data_variable',mode:'slider',visible:true}];bad(f);
 f=traceFixture();f.blocks[f.traceWrite].fields.VARIABLE=['different','trace'];bad(f);
});
test('trace effects do not admit local reads properties coercing values or Array receivers',()=>{
 let f=traceFixture();const local=f.node('arcade_getLocal',{NAME:[10,'refs']});
 f.blocks[f.trace].inputs.RIGHT=[2,local];f.blocks[local].parent=f.trace;bad(f);
 f=traceFixture();const field=f.node('arcade_objectField',{OBJECT:[12,'out','out'],FIELD:[10,'value']});
 f.blocks[f.trace].inputs.RIGHT=[2,field];f.blocks[field].parent=f.trace;bad(f);
 f=traceFixture();f.blocks[f.trace].fields.OP=['==',null];bad(f);
 f=traceFixture();good(f);delete f.blocks[f.blocks[f.read].inputs.ARRAY[1]];
 f.blocks[f.read].inputs.ARRAY=[1,[12,'trace','trace']];bad(f);
 f=traceFixture();f.blocks[f.traceWrite].parent=f.reset;bad(f);
 f=traceFixture();f.blocks[f.traceWrite].mutation={foreign:'metadata'};bad(f);
 f=traceFixture();const proto=f.node('arcade_setLocal',{NAME:[10,'__proto__'],VALUE:[10,'foreign']});
 f.blocks[f.hat].next=proto;f.blocks[proto].parent=f.hat;f.blocks[proto].next=f.reset;f.blocks[f.reset].parent=proto;bad(f);
});
test('a consumed primitive global prefix retains permanent ambient expiry',()=>{
 const q=good(traceFixture()),descriptor=Object.getOwnPropertyDescriptor(Object.prototype,'valueOf');
 try{Object.defineProperty(Object.prototype,'valueOf',{...descriptor,value(){throw new Error('changed coercion must not run');}});
  assert.equal(q.proof.validateInput(q.target,{...q.node}).ok,false);
 }finally{Object.defineProperty(Object.prototype,'valueOf',descriptor);}
 assert.equal(decision(q).ok,false);good(traceFixture());
});

function conditionalFixture(readReset){
 const f=fixture(),{blocks,node,copy,overwrite,store}=f;
 const condition=readReset?node('arcade_getLocal',{NAME:[10,'refs']}):[4,'1'];
 const kind=node('arcade_spriteKindValue',{NAME:[10,'Player']});
 const snapshot=node('arcade_spritesOfKind',{KIND:kind});
 const other=node('arcade_setLocal',{NAME:[10,'refs'],VALUE:snapshot});
 const branch=node('control_if_else',{CONDITION:condition,SUBSTACK:overwrite,SUBSTACK2:other});
 blocks[copy].next=branch;blocks[branch].parent=copy;blocks[branch].next=store;blocks[store].parent=branch;
 blocks[overwrite].next=null;blocks[overwrite].parent=branch;blocks[other].parent=branch;
 return f;
}
test('a conditional overwrite cannot hide an earlier read of the reset local',()=>{
 bad(conditionalFixture(true));
});
test('a literal condition with immediate overwrites on both branches retains the Array producer',()=>{
 good(conditionalFixture(false));
});
test('a malformed shadow condition cannot certify a conditional overwrite',()=>{
 const f=conditionalFixture(false),{blocks,node,copy}=f,branch=blocks[copy].next;
 const condition=node('math_number',{}, {NUM:[{},null]});blocks[condition].shadow=true;
 blocks[condition].parent=branch;blocks[branch].inputs.CONDITION=[1,condition];bad(f);
});
test('a branch cannot expose the reset value before its overwrite',()=>{
 const f=conditionalFixture(false),{blocks,node,copy,overwrite}=f,branch=blocks[copy].next;
 const read=node('arcade_getLocal',{NAME:[10,'refs']});
 const expose=node('data_setvariableto',{VALUE:read},{VARIABLE:['out','out']});
 blocks[branch].inputs.SUBSTACK=[2,expose];blocks[expose].parent=branch;
 blocks[expose].next=overwrite;blocks[overwrite].parent=expose;
 bad(f);
});

test('reset reads incompatible writers and unknown event inputs retain the original refusal',()=>{
 let f=fixture();f.blocks[f.event].opcode='arcade_getLocal';f.blocks[f.event].fields={};f.blocks[f.event].inputs={NAME:[1,[10,'refs']]};bad(f);
 f=fixture();f.blocks[f.copy].inputs.NAME=[1,[10,'refs']];bad(f);
 f=fixture('unproved');bad(f);
 f=fixture();f.blocks[f.event].inputs.EXTRA=[1,[4,'0']];bad(f);
 f=fixture();f.blocks[f.event].opcode='arcade_callFunction';f.blocks[f.event].fields={};f.blocks[f.event].inputs={NAME:[1,[10,'foreign']],ARGS:[1,[10,'[]']]};bad(f);
 f=fixture();f.blocks[f.event].opcode='arcade_unprovedEventRead';bad(f);
 f=fixture();delete f.blocks[f.snapshot];f.blocks[f.overwrite].inputs.VALUE=[1,[4,'7']];bad(f);
});

test('dynamic names prototype writes and malformed physical ownership cannot hide the reset',()=>{
 let f=fixture('first','__proto__');bad(f);
 f=fixture();const name=f.node('text',{}, {TEXT:['actor',null]});f.blocks[name].shadow=true;f.blocks[name].parent=f.copy;f.blocks[f.copy].inputs.NAME=[1,name];bad(f);
 f=fixture();f.blocks[f.event].parent=f.reset;bad(f);
 f=fixture();f.blocks[f.copy].inputs.VALUE[0]=99;bad(f);
 f=fixture();f.blocks[f.copy].mutation={foreign:'metadata'};bad(f);
 f=fixture();f.blocks[f.copy].next=f.copy;bad(f);
 for(const captured of [false,true])for(const dynamic of [false,true]){
  f=fixture();const value=f.node('arrays_specialValue',{}, {KIND:['null',null]});
  const name=dynamic?f.node('data_variable',{}, {VARIABLE:['out','out']}):[10,'__proto__'];
  const writer=f.node(captured?'arcade_setCaptured':'arcade_setLocal',{NAME:name,VALUE:value});
  let hat=f.hat;
  if(captured){hat=f.node('arcade_whenRegisteredCreated',{TOKEN:[10,'other']});f.blocks[hat].topLevel=true;}
  const next=f.blocks[hat].next;f.blocks[hat].next=writer;f.blocks[writer].parent=hat;f.blocks[writer].next=next;
  if(next)f.blocks[next].parent=writer;
  bad(f);
 }
});

test('the consumed event-copy frontier expires before an unrelated diagnostic and cannot revive',()=>{
 const f=fixture(),q=good(f),descriptor=Object.getOwnPropertyDescriptor(Array.prototype,'map');
 try{
  Object.defineProperty(Array.prototype,'map',{...descriptor,value(){throw new Error('changed map must never run');}});
  const result=q.proof.validateInput(q.target,{...q.node});
  assert.equal(result.ok,false);assert.match(result.reason,/event-copy prefix/);
 }finally{Object.defineProperty(Array.prototype,'map',descriptor);}
 assert.equal(decision(q).ok,false);good(f);
});
