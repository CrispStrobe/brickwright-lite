import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {createStringCharCodeNumberSource,STRING_CHAR_CODE_DTS_SHA256,STRING_CHAR_CODE_SIM_SHA256} from '../overlay/scratch-gui/src/lib/bw-makecode/string-char-code-number-source.js';
import {analyseSourceValueProducers} from '../overlay/scratch-gui/src/lib/bw-makecode/source-value-producers.js';
import {promptStringCase} from './fixtures/arcade-prompt-string-provenance-case.mjs';

const walk=(value,out=[])=>{if(!value||typeof value!=='object')return out;if(Array.isArray(value)){value.forEach(child=>walk(child,out));return out;}
 out.push(value);for(const [key,child]of Object.entries(value))if(!['paramTypes','returnType','assertedType','originalBody'].includes(key))walk(child,out);return out;};
const source='function first(values:Array<string>):number{return values[0].charCodeAt(0)}let words:string[]=[];words.push("a");let copy=words;let result=first(copy);';
const observe=text=>{
 const program=parseMakeCodeTs(text,{retainCallableMetadata:true,retainParentheses:true}),nodes=walk(program);
 const call=nodes.find(node=>node.type==='Call'&&node.callee?.type==='Member'&&node.callee.name==='charCodeAt');
 const proof=createStringCharCodeNumberSource(program),graph=analyseSourceValueProducers(program,{arrayValues:true,arrayEffectSites:true,parenthesized:true,unboundIsOpaque:true,initializationEntries:true});
 return {program,nodes,call,proof,graph};
};
const good=text=>{const row=observe(text);assert.equal(row.proof.isCall(row.call),true);assert.deepEqual([...row.graph.typesAt(row.call)],['Number']);return row;};
const bad=text=>{const row=observe(text);assert.ok(row.graph.typesAt(row.call).has('Opaque'),text);return row;};

test('selected String declaration and simulator implementation retain their reviewed source bytes',()=>{
 const target=JSON.parse(readFileSync(new URL('../packages/scratch-gui/static/makecode/arcade/target.json',import.meta.url),'utf8'));
 const declaration=target.bundledpkgs.base['pxt-core.d.ts'];
 const simulation=readFileSync(new URL('../packages/scratch-gui/static/makecode/arcade/sim/pxtsim.js',import.meta.url),'utf8');
 const hash=value=>createHash('sha256').update(value).digest('hex');
 assert.equal(hash(declaration),STRING_CHAR_CODE_DTS_SHA256);assert.equal(hash(simulation),STRING_CHAR_CODE_SIM_SHA256);
 assert.match(declaration,/charCodeAt\(index: number\): number;/);
 assert.ok(simulation.includes('t.charCodeAt=function(e,t){return n(e),function(e,t){return n(e),0<=t&&t<e.length}(e,t)?e.charCodeAt(t):0}'));
});

test('actual String Array elements produce only normal Number results without losing their missing alternative',()=>{
 for(const index of ['0','99']){
  const row=good(source.replace('values[0]','values['+index+']'));
  assert.deepEqual([...row.graph.typesAt(row.call.callee.object)].sort(),['String','Undefined']);
  assert.equal(row.graph.isInitializedAt(row.call.callee.object.object),true);
 }
 const nullable=good('let text="a";text=null;text=undefined;let result=text.charCodeAt(0);');
 assert.deepEqual([...nullable.graph.typesAt(nullable.call.callee.object)].sort(),['Null','String','Undefined']);
 good('let text="a";let index:any=undefined;let result=text.charCodeAt(index);');
 good('let text="a";let result=text.charCodeAt(99);');
 good(source.replace('values[0].charCodeAt(0)','(<string>values[0]).charCodeAt(<any>(0+0))'));
 good('function nativeAdd(left:any,right:any):any{let a:any=left;if(left!==null&&typeof left==="object"){let array:any[]=left;a=array.join(",")}return a+right}'+source);
});

test('the complete checked-in prompt source retains early Undefined and actual char-code production',()=>{
 const row=good(promptStringCase.source),receiver=row.call.callee.object;
 assert.deepEqual([...row.graph.typesAt(receiver)].sort(),['String','Undefined']);
 const before=row.nodes.find(node=>node.type==='FunctionDeclaration'&&node.name==='before');
 const entered=walk(before).find(node=>node.type==='Identifier'&&node.name==='entered');
 assert.equal(row.graph.isInitializedAt(entered),false);
 const firstCall=row.nodes.find(node=>node.type==='Call'&&node.callee?.name==='first');
 assert.deepEqual([...row.graph.typesAt(firstCall)],['Number']);
});

test('receiver and index annotations cannot replace actual complete writer domains',()=>{
 bad(source.replace('words.push("a")','words.push(1)'));
 bad(source.replace('words.push("a")','words.push("a");words.push(1)'));
 bad(source.replace('words.push("a")','words.push(foreign())'));
 bad('let text:string;let result=text.charCodeAt(0);');
 bad('let text:any=null;let result=text.charCodeAt(0);');
 for(const value of ['"0"','[]','foreign()'])bad('let text="a";let index='+value+';let result=text.charCodeAt(index);');
 bad('let text="a";let index:any=0;index="wrong";let result=text.charCodeAt(index);');
 bad('let text=JSON.parse("{}") as string;let result=text.charCodeAt(0);');
 bad('let text:any={charCodeAt:()=>"wrong"};let result=text.charCodeAt(0);');
});

test('prototype method namespace computed aliases and unused effects cannot supply String dispatch',()=>{
 for(const extra of ['String.prototype.charCodeAt=0;','function unused(){String.prototype.charCodeAt=0}',
  'let proto=String["prototype"];','Object.defineProperty(String.prototype,"charCodeAt",0);',
  'Reflect.set(String.prototype,"charCodeAt",0);','eval("String.prototype.charCodeAt=0");',
  'let escaped="a".charCodeAt;','let escaped="a".constructor;']){
  const row=bad(extra+source);assert.equal(row.proof.isCall(row.call),false,extra);
 }
 const shadow=bad(promptStringCase.source.replace('function before()', 'let game:any;function before()'));
 assert.equal(shadow.proof.isCall(shadow.call),false);
});

test('wrong call shapes and hidden executable edges cannot borrow the normal result',()=>{
 for(const mutate of [row=>{row.call.optional=true;},row=>{row.call.args.push({type:'Number',value:'1'});},
  row=>{row.call.callee.hidden={type:'Identifier',name:'foreign'};},row=>{row.program.hidden={type:'Identifier',name:'foreign'};}]){
  const row=observe(source);mutate(row);const proof=createStringCharCodeNumberSource(row.program);assert.equal(proof.isCall(row.call),false);
 }
 const row=good(source);assert.equal(row.proof.isCall({...row.call}),false);
});

test('source and String dispatch mutation permanently revoke only actually consumed result authority',()=>{
 const row=good(source),arg=row.call.args[0],old=arg.value;arg.value='2';assert.equal(row.proof.current(),false);
 assert.deepEqual([...row.graph.typesAt(row.call)],[]);arg.value=old;assert.deepEqual([...row.graph.typesAt(row.call)],[]);
 const method=good(source),descriptor=Object.getOwnPropertyDescriptor(String.prototype,'charCodeAt');let called=false;
 try{Object.defineProperty(String.prototype,'charCodeAt',{...descriptor,value(){called=true;throw Error('replacement must not run');}});
  assert.equal(method.proof.current(),false);assert.deepEqual([...method.graph.typesAt(method.call)],[]);
 }finally{Object.defineProperty(String.prototype,'charCodeAt',descriptor);}
 assert.equal(called,false);assert.equal(method.proof.current(),false);assert.deepEqual([...method.graph.typesAt(method.call)],[]);
});

test('membership replacement cannot restore the realm and admit a copied call before expiry',()=>{
 const row=good(source),descriptor=Object.getOwnPropertyDescriptor(WeakSet.prototype,'has');let calls=0;
 try{Object.defineProperty(WeakSet.prototype,'has',{...descriptor,value(){calls++;Object.defineProperty(WeakSet.prototype,'has',descriptor);return true;}});
  assert.equal(row.proof.isCall({...row.call}),false);assert.equal(row.proof.isCall(row.call),false);
 }finally{Object.defineProperty(WeakSet.prototype,'has',descriptor);}
 assert.equal(calls,0);assert.equal(row.proof.current(),false);assert.equal(row.proof.isCall(row.call),false);
});

test('source observations cannot replace String dispatch after the opening realm check',()=>{
 const row=observe(source),descriptor=Object.getOwnPropertyDescriptor(String.prototype,'charCodeAt');let active=false,traps=0,calls=0;
 const replacement=function(){calls++;throw Error('replacement String method must not run');};
 const program=new Proxy(row.program,{ownKeys(target){if(active){traps++;Object.defineProperty(String.prototype,'charCodeAt',{...descriptor,value:replacement});}return Reflect.ownKeys(target);}});
 const proof=createStringCharCodeNumberSource(program);assert.equal(proof.isCall(row.call),true);
 try{active=true;assert.equal(proof.isCall(row.call),false);assert.ok(traps>0,'actual source observer executed');}
 finally{active=false;Object.defineProperty(String.prototype,'charCodeAt',descriptor);}
 assert.equal(calls,0);assert.equal(proof.current(),false);assert.equal(proof.isCall(row.call),false);
});

test('closure observation cannot replace membership insertion and enroll a copied call',()=>{
 const row=observe('let words=["a"];let result=words[0].charCodeAt(0);'),descriptor=Object.getOwnPropertyDescriptor(WeakSet.prototype,'add'),original=descriptor.value;
 const copied={...row.call};let armed=0,calls=0;
 const replacement=function(value){calls++;Object.defineProperty(WeakSet.prototype,'add',descriptor);
  Reflect.apply(original,this,[copied]);return Reflect.apply(original,this,[value]);};
 const call=new Proxy(row.call,{ownKeys(target){
  const stack=new Error().stack||'';
  if(stack.includes('expression')&&stack.includes('string-char-code-number-source.js')){
   armed++;Object.defineProperty(WeakSet.prototype,'add',{...descriptor,value:replacement});
  }
  return Reflect.ownKeys(target);
 }});
 row.program.body.at(-1).decls[0].init=call;
 try{const proof=createStringCharCodeNumberSource(row.program);assert.ok(armed>0,'actual closure expression observer executed');
  assert.equal(proof.isCall(copied),false);assert.equal(proof.isCall(call),false);assert.equal(calls,0);
 }finally{Object.defineProperty(WeakSet.prototype,'add',descriptor);}
});
