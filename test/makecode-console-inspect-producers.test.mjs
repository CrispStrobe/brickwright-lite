import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {analyseSourceValueProducers} from '../overlay/scratch-gui/src/lib/bw-makecode/source-value-producers.js';
function result(source){const program=parseMakeCodeTs(source),calls=[];const visit=node=>{if(!node||typeof node!=='object')return;if(node.type==='Call'&&node.callee?.name==='inspect')calls.push(node);Object.values(node).forEach(value=>{if(Array.isArray(value))value.forEach(visit);else visit(value);});};visit(program);const proof=analyseSourceValueProducers(program,{consoleInspection:true,opaqueDeclarationValues:true,unboundIsOpaque:true,uninitializedLocalsAreOpaque:true});return calls.map(call=>proof.typesAt(call));}
test('inspection String producer follows actual primitive inputs and omitted optional arguments',()=>{
 for(const source of ['let out=console.inspect("text")','let out=console.inspect(null,0)','let out=console.inspect(undefined)','let value=console.inspect(value)','function read(){return 20}let out=console.inspect(read())','function read(){return}let out=console.inspect(read())','function read(){let value=undefined;return value}let out=console.inspect(read())','function format(title:any,limit?:number){return console.inspect(title,limit)}let out=format("text")','function format(title:any){title=console.inspect(title);return title}let out=format("text")'])assert.deepEqual(result(source).map(set=>[...set]),[['String']],source);
});
test('declaration values and missing origins cannot bootstrap an inspection String',()=>{
 for(const source of ['function read(){return 3}let out=console.inspect(read)','class Box{}function read(){return Box}let out=console.inspect(read())','function f(){return 3}let alias=f;let out=console.inspect(alias)','enum Kind{A}let out=console.inspect(Kind)','function f(){return 3}f=undefined;let out=console.inspect(f)','function read(){let value;return value}let out=console.inspect(read())','function read(){let value;let alias=value;return alias}let out=console.inspect(read())','function read(){return value;let value}let out=console.inspect(read())','function read(){let value;let early=value;value=3;return early}let out=console.inspect(read())','let out=console.inspect(missing)','function format(value:any){value=console.inspect(value)}','let out=console.inspect("text","20")','let value:Image;let out=console.inspect(value)','let value:image.Font;function read(){return value}let out=console.inspect(read())','let out=console.inspect(image.create(1,1))','console.inspect=(v:any)=>"changed";let out=console.inspect("text")'])assert.ok(result(source).every(types=>!types.has('String')||types.has('Opaque')),source);
});

test('uninitialized lexical local reads retain a source refusal until their ABI is qualified',async()=>{
 const {arcadeToPseudocode}=await import('../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js');
 for(const source of ['function f(){let value;return console.inspect(value)}let out=f()','function f(){return console.inspect(value);let value}let out=f()','function f(){let value;let alias=value;return alias}let out=console.inspect(f())']){
  const converted=arcadeToPseudocode(source);assert.ok(converted.unsupported.some(message=>message.includes('actual primitive VALUE')),source);assert.doesNotMatch(converted.code,/arcade inspect value/);
 }
});

test('plain SDK inspection refuses authored generic call syntax',async()=>{
 const {arcadeToPseudocode}=await import('../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js');
 for(const type of ['number','string','any']){
  const converted=arcadeToPseudocode(`let out=console.inspect<${type}>(20)`);
  assert.ok(converted.unsupported.length,type);assert.doesNotMatch(converted.code,/arcade inspect value/);
 }
});
