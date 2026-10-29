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
