import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {localArrayDeclarationResetSource} from '../overlay/scratch-gui/src/lib/bw-makecode/local-array-declaration-reset-source.js';
import {analyseSourceValueProducers} from '../overlay/scratch-gui/src/lib/bw-makecode/source-value-producers.js';

const source=prefix=>`function run(){let values:number[]=null;${prefix}values=[];values.push(1);let missing=values[99]}run();`;
const inspect=text=>{
 const program=parseMakeCodeTs(text,{retainCallableMetadata:true}),fn=program.body.find(n=>n.type==='FunctionDeclaration'&&n.body.some(statement=>statement.type==='Declaration'&&statement.decls.some(decl=>decl.name==='values'))),decl=fn.body.filter(n=>n.type==='Declaration').flatMap(n=>n.decls).find(n=>n.name==='values');
 return {program,fn,decl,proof:localArrayDeclarationResetSource(program)};
};
const good=text=>{const row=inspect(text);assert.equal(row.proof.discount(row.decl),true,text);return row;};
const bad=text=>{const row=inspect(text);assert.equal(row.proof.discount(row.decl),false,text);return row;};

test('hoisted uncaptured resets cross only straight-line statements without references to their own binding',()=>{
 for(const prefix of ['let other:number[]=null;let flag=false;','let other=0;other=2;','let other=[];let flag=(2+3)===5;'])good(source(prefix));
 good(source('let other:number[]=null;other=[];').replace('=null','=undefined'));
});

test('reads aliases writes captures and dynamic scope cannot be skipped before a fresh overwrite',()=>{
 for(const prefix of ['let other=values;','consume(values);','values.push(1);','values[0]=2;','values=null;',
  'let callback=()=>values;','let callback=function(){return values};','let other=eval("values");','let other=globalThis.values;'])bad(source(prefix));
 bad(source('let other=0;').replace('values=[]','values=[values]'));
 bad(source('let other=0;').replace('values=[]','values=foreign()'));
 bad(source('let other=0;').replace('values=[]','values=[];function later(){return values}'));
});

test('no branch loop return or throw is crossed even when its own expressions omit the candidate',()=>{
 for(const prefix of ['if(true){let other=0;}','while(false){}','for(let i=0;i<1;i++){}','return;','throw 1;','{let other=0;}','function noop(){}'])bad(source(prefix));
});

test('unrelated calls yields property/index hooks coercing reads and callbacks retain the reset',()=>{
 for(const prefix of ['pause(1);','let other=foreign();','let other=[];other.push(4);','let other=[];other[0]=2;',
  'let other=box.value;','let other=box[0];','let other=+box;','let other=+[];','let other=[]+1;','let other=()=>4;','unknown=2;'])bad(source(prefix));
});

test('lexical identity and later real writers remain independent of the discounted reset',()=>{
 const row=good(source('let other=0;other=2;'));
 const graph=analyseSourceValueProducers(row.program,{arrayValues:true,arrayEffectSites:true,unboundIsOpaque:true,initializationEntries:true});
 const read=row.fn.body.find(n=>n.type==='Declaration'&&n.decls[0].name==='missing').decls[0].init;
 assert.deepEqual([...graph.typesAt(read)].sort(),['Number','Undefined']);assert.equal(graph.isInitializedAt(read.object),true);
 const early=good(source('let other=0;').replace('let values:number[]=null','let early=values[0];let values:number[]=null'));
 const earlyGraph=analyseSourceValueProducers(early.program,{arrayValues:true,arrayEffectSites:true,unboundIsOpaque:true,initializationEntries:true});
 const earlyRead=early.fn.body[0].decls[0].init;assert.equal(earlyGraph.isInitializedAt(earlyRead.object),false);
 for(const value of ['null','"late"']){
  const late=good(source('let other=0;').replace('let missing=',`values=${value};let missing=`));
  const facts=analyseSourceValueProducers(late.program,{arrayValues:true,arrayEffectSites:true,unboundIsOpaque:true,initializationEntries:true});
  const read=late.fn.body.at(-1).decls[0].init;assert.ok(facts.bindingTypesAt(read.object).has(value==='null'?'Null':'String'));assert.equal(facts.arrayAllocationsAt(read.object).length,0);
 }
});

test('malformed sparse inherited hidden and shared AST input cannot issue a hoisted reset discount',()=>{
 for(const mutate of [
  row=>delete row.fn.body[1],
  row=>Object.setPrototypeOf(row.fn.body[1],{type:'ExpressionStatement'}),
  row=>{row.fn.body[1].hidden={type:'Identifier',name:'values'};},
  row=>{row.fn.body[1]=row.fn.body[0];},
  row=>{row.fn.body[1].type='UnresolvedEffect';}
 ]){
  const row=inspect(source('let other=0;'));mutate(row);assert.equal(localArrayDeclarationResetSource(row.program).discount(row.decl),false);
 }
});

test('an unrelated unindexed object shorthand cannot revoke another local reset proof',()=>{
 const text='function other(){let scalar=1;return {scalar}} function run(){let values:number[]=null;values=[]} run();';
 good(text);
 for(const attach of ['candidate','unrelated']){
  const row=inspect(text),statement=attach==='candidate'?row.fn.body[0]:row.program.body[0].body[0];
  statement.hiddenCandidate={type:'Identifier',name:'values'};
  assert.equal(localArrayDeclarationResetSource(row.program).discount(row.decl),false,attach);
 }
});

test('source and ambient changes permanently revoke a consumed hoisted reset proof',()=>{
 const row=good(source('let other=0;'));row.fn.body[1].decls[0].init.value='2';assert.equal(row.proof.current(),false);
 row.fn.body[1].decls[0].init.value='0';assert.equal(row.proof.discount(row.decl),false);
 const ambient=good(source('let other=0;')),descriptor=Object.getOwnPropertyDescriptor(JSON,'stringify');
 try{Object.defineProperty(JSON,'stringify',{...descriptor,value(){throw Error('changed serializer must not run');}});assert.equal(ambient.proof.current(),false);}
 finally{Object.defineProperty(JSON,'stringify',descriptor);}
 assert.equal(ambient.proof.discount(ambient.decl),false);
});
