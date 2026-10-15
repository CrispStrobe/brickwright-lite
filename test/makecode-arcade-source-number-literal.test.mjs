import test from 'node:test';
import assert from 'node:assert/strict';
import {numberLiteralCode} from '../overlay/scratch-gui/src/lib/bw-makecode/source-number-literal.js';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runArcadeSourceCode} from './helpers/arcade-source-program.mjs';
test('Code decimal literals retain their exact Number and leave non-finite spellings unchanged',()=>{
 for(const value of [1e-7,-1e-7,5e-324,-5e-324,2.2250738585072014e-308,1e21,-1.25,0]){const code=numberLiteralCode(value);assert.equal(Number(code),value);assert.equal(/e[+-]/.test(code),false);}
 for(const value of [NaN,Infinity,-Infinity,-0])assert.equal(numberLiteralCode(value),String(value));
});
test('actual source tiny and subnormal Number literals and aliases remain exact native Numbers',async()=>{
 const converted=arcadeToPseudocode('let tiny=1e-7;let alias=tiny;let subnormal=5e-324;let negative=-1e-7;let big=1e+21;let thousand=1.E+3');assert.deepEqual(converted.unsupported,[]);const run=await runArcadeSourceCode(converted.code,{frames:3,uploads:converted.costumes});
 try{assert.deepEqual(run.errors,[]);const values=Object.fromEntries(run.vm.runtime.targets.flatMap(target=>Object.values(target.variables).map(value=>[value.name,value.value])));assert.equal(values.tiny,1e-7);assert.equal(values.alias,1e-7);assert.equal(values.subnormal,5e-324);assert.equal(values.negative,-1e-7);assert.equal(values.big,1e21);assert.equal(values.thousand,1000);}finally{run.vm.stopAll();}
});

test('decimal exponent lexing preserves sign, member boundaries and existing base literals',()=>{for(const literal of ['1e-7','1e+21','.5e-2','1.E+3','0x1f','0b101'])assert.equal(parseMakeCodeTs(`let n=${literal}`).body[0].decls[0].init.value,literal);const unary=parseMakeCodeTs('let n=-1e-7').body[0].decls[0].init;assert.equal(unary.op,'-');assert.equal(unary.argument.value,'1e-7');const member=parseMakeCodeTs('let n=1..toString()').body[0].decls[0].init;assert.equal(member.callee.name,'toString');assert.equal(member.callee.object.value,'1.');assert.equal(parseMakeCodeTs('let e=3;let n=e-1').body[1].decls[0].init.left.name,'e');for(const literal of ['1e','1e+','1e--3','.5e-'])assert.throws(()=>parseMakeCodeTs(`let n=${literal}`),/malformed numeric exponent/);});

test('positive exponent and underflow literals have bounded exact decimal carriers',()=>{for(const value of ['1e+21','1e+3','1.E+3','1e3','5e-999999','0e+999999']){const code=numberLiteralCode(value);assert.equal(Number(code),Number(value));assert.equal(/e[+-]/.test(code),false);assert.ok(code.length<=327);}});
