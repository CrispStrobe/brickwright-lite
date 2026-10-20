import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {lowerNamespaceBindings} from '../overlay/scratch-gui/src/lib/bw-makecode/namespace-bindings.js';
test('global and ordinary function reference annotations resolve actual lexical class declarations',()=>{
 const result=lowerNamespaceBindings(parseMakeCodeTs('namespace N {export class Box {constructor(){}}} let pending:N.Box; let list:N.Box[]; function read(value:N.Box):N.Box{return value}'));
 assert.deepEqual(result.unsupported,[]);
 const cls=result.program.body.find(n=>n.type==='Class');
 const decls=result.program.body.filter(n=>n.type==='Declaration').flatMap(n=>n.decls);
 assert.equal(decls.find(n=>n.name==='pending').typeName,cls.name);
 assert.equal(decls.find(n=>n.name==='list').typeName,cls.name+'[]');
 const fn=result.program.body.find(n=>n.type==='FunctionDeclaration');
 assert.equal(fn.paramTypes.value.text,cls.name);assert.equal(fn.returnType,cls.name);
});
test('generic function type ownership is retained independently of same named classes',()=>{
 const result=lowerNamespaceBindings(parseMakeCodeTs('namespace N {export class T {constructor(){}} export function identity<T>(value:T):T {let copy:T=value; return copy}}'));
 assert.deepEqual(result.unsupported,[]);
 const fn=result.program.body.find(n=>n.type==='FunctionDeclaration');
 assert.equal(fn.paramTypes.value.text,'T');assert.equal(fn.returnType,'T');
 assert.equal(fn.body.find(n=>n.type==='Declaration').decls[0].typeName,'T');
});
