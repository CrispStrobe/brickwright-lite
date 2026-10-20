import test from 'node:test';import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {staticSdkNamespaceReceivers} from '../overlay/scratch-gui/src/lib/bw-makecode/static-sdk-namespaces.js';
import {sourceScalarDeclarations} from '../overlay/scratch-gui/src/lib/bw-makecode/source-scalar-declarations.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
const classify=source=>{const ast=parseMakeCodeTs(source),refs=staticSdkNamespaceReceivers(ast,{builtinIdentifiers:['randint']}),rows=[];const visit=node=>{if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(visit);return;}if(node.type==='Call'&&node.callee?.name==='randint')rows.push(refs.has(node.callee));Object.values(node).forEach(visit);};visit(ast);return rows;};
test('selected builtin randint callee authority is lexical, including hoisted shadows',()=>{
 assert.deepEqual(classify('let value=randint(1,1)'),[true]);
 for(const source of ['function f(randint:any){return randint(1,1)}','function f(){let value=randint(1,1);let randint:any}','let value=randint(1,1);let randint:any','function randint(a:number,b:number){return a};let value=randint(1,1)','{let randint:any;randint(1,1)}','class Box{constructor(randint:any){let value=randint(1,1)}}'])assert.deepEqual(classify(source),[false],source);
});
test('genuine randint results retain Number provenance through aliases and typed calls',()=>{
 for(const source of ['let value=randint(1,1);let result=value|0','function encode(x:number,y:number){return (x<<8)|y};let x=randint(1,1);let y=randint(2,2);let result=encode(x,y)'])assert.deepEqual(arcadeToPseudocode(source).unsupported,[]);
});
test('randint spelling cannot erase unknown, object, reference or shadowed operand guards',()=>{
 for(const source of ['function f(randint:any){let value=randint(1,1);return value|0}','let randint:any;let value=randint(1,1);let result=value|0','let sprite=sprites.create(img`1`,SpriteKind.Player);let result=sprite|0','let image=img`1`;let result=image|0','let value:any={n:1};let result=value|0','let value=new randint(1,1);let result=value|0'])assert.ok(arcadeToPseudocode(source).unsupported.some(message=>/primitive/.test(message)),source);
});

test('the same proven SDK return authority initializes only genuine numeric source cells',()=>{
 const scalar=source=>sourceScalarDeclarations(parseMakeCodeTs(source));
 assert.deepEqual(scalar('let value=randint(2,2)'),[{name:'value',type:'Number'}]);
 assert.deepEqual(scalar('function f(randint:any){return randint(2,2)}let value=f(null)'),[]);
 assert.deepEqual(scalar('let randint:any;let value=randint(2,2)'),[{name:'randint',type:'Any'}]);
});
