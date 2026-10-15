import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs,tokenize} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
const parse=source=>parseMakeCodeTs(source);
test('ThrowStatement retains the complete ordered expression rather than two value statements',()=>{
 const tree=parse('throw first() + second() * 2; let after=1;');assert.equal(tree.body.length,2);
 assert.deepEqual(tree.body[0],{type:'ThrowStatement',argument:{type:'Binary',op:'+',left:{type:'Call',callee:{type:'Identifier',name:'first'},args:[]},right:{type:'Binary',op:'*',left:{type:'Call',callee:{type:'Identifier',name:'second'},args:[]},right:{type:'Number',value:'2'}}}});
 assert.equal(tree.body[1].type,'Declaration');
 const assigned=parse('throw result = ready ? call(1, 2) : other.value;').body[0];assert.equal(assigned.argument.type,'Assignment');assert.equal(assigned.argument.right.type,'Conditional');assert.equal(assigned.argument.right.consequent.args.length,2);
});
test('primitive domains and nested branches preserve Throw with correct statement boundaries',()=>{
 for(const [source,type]of [['throw 20','Number'],['throw "20"','String'],['throw false','Boolean'],['throw null','Null'],['throw undefined','Undefined']])assert.equal(parse(source).body[0].argument.type,type);
 const tree=parse('function fail(){if (true) throw "boom"\nreturn 1}\nlet action=()=>{throw false};');
 assert.equal(tree.body[0].body[0].consequent[0].type,'ThrowStatement');assert.equal(tree.body[0].body[1].type,'Return');assert.equal(tree.body[1].decls[0].init.body[0].type,'ThrowStatement');
 assert.equal(parse('throw /*same line*/ first()\nnext()').body.length,2);assert.equal(parse('throw `first\nsecond`;').body[0].argument.type,'Template');assert.equal(parse('throw `value=${1+2}`;').body[0].argument.type,'Binary');
});
test('every line terminator after throw refuses, including comments',()=>{
 for(const newline of ['\n','\r','\r\n','\u2028','\u2029']) {
  assert.throws(()=>parse('throw'+newline+'value'),/line break is not allowed after throw/);
  assert.throws(()=>parse('throw /* comment'+newline+' */ value'),/line break is not allowed after throw/);
  assert.throws(()=>parse('throw // comment'+newline+'value'),/line break is not allowed after throw/);
 }
});
test('missing malformed and partially consumed operands never produce a successful Throw prefix',()=>{
 for(const source of ['throw','throw;','function f(){throw}','throw 1 + ;','throw @1;','throw 1 @;','throw "unterminated','throw "raw\nline"','throw `unterminated','throw 1 2;','throw 1, 2;','throw ()','throw `bad=${@1}`','throw `bad=${1 2}`'])assert.throws(()=>parse(source),/throw requires|complete expression|unsupported trailing|expected/);
});
test('try catch finally receive precise refusals while legal property names remain expressions',()=>{
 for(const keyword of ['try','catch','finally'])assert.throws(()=>parse(keyword+' {}'),new RegExp(keyword+' statement requires unsupported structured exception handling'));
 assert.throws(()=>parse('function fail(){try {throw 1} catch(e) {return 2} finally {done()}}'),/try statement requires unsupported/);
 assert.equal(parse('throw object.catch(1);').body[0].argument.callee.name,'catch');assert.equal(parse('throw {try:1,catch:2,finally:3};').body[0].argument.type,'Object');
});
test('ordinary token shape and parser options stay intact',()=>{
 assert.deepEqual(tokenize('let value=1;').map(token=>Object.keys(token)),Array(6).fill(['type','value','line']));
 assert.equal(parse('function f(value=3){return value}').body[0].body.length,1);assert.equal(parseMakeCodeTs('function f(value=3){return value}',{parameterDefaults:true}).body[0].body.length,2);
 assert.equal(parse('throw (1 + 2);').body[0].argument.type,'Binary');assert.equal(parseMakeCodeTs('throw (1 + 2);',{retainParentheses:true}).body[0].argument.parenthesized,true);
 assert.equal(parse('let value=@1;').body[0].decls[0].init.type,'Number','ordinary unknown-byte policy unchanged');
});
