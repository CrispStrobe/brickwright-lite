import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {ARRAYS_PREFIX,ARRAYS_SUFFIX,registeredArraysSource,renderRegisteredArraysCarrier,renderBuiltinCarrier} from '../scripts/lib/arrays-carrier.mjs';
const carrier=readFileSync(new URL('../overlay/scratch-vm/src/extensions/crispstrobe/arrays/index.js',import.meta.url),'utf8');
test('actual canonical Arrays carrier registers its exact decoded source and passes only the module-held token',()=>{
 const source=registeredArraysSource(carrier);assert.equal(typeof source,'string');assert.equal(carrier,renderRegisteredArraysCarrier(source));
 const token={},events=[],module={exports:null},expected={};
 runInNewContext(carrier,{module,require(request){
  if(request==='../../../util/bw-array-operations')return{registerSource(actual){assert.equal(actual,source);events.push('register');return token;}};
  assert.equal(request,'../adapter');return(...args)=>{assert.equal(args.length,3);assert.equal(args[0],source);assert.equal(args[1],null);assert.equal(args[2],token);events.push('construct');return expected;};
 }});assert.equal(module.exports,expected);assert.deepEqual(events,['register','construct']);
});
test('source decoding rejects changed registration or executable envelopes without evaluating them',()=>{
 for(const text of [carrier.replace('registerSource(source)','{}'),carrier.replace('registerSource(source)','registerSource("foreign")'),carrier.replace('.registerSource;','.bind;'),carrier.replace('module.exports = makeExt(source, null, registerSource(source));','module.exports = makeExt(source);'),'throw new Error("must not run");\n'+carrier,carrier+'sideEffect();\n'])assert.equal(registeredArraysSource(text),null);
 const odd='quotes " and ` and ${untrusted}\nUnicode: α';assert.equal(registeredArraysSource(renderRegisteredArraysCarrier(odd)),odd);assert.ok(carrier.startsWith(ARRAYS_PREFIX)&&carrier.endsWith(ARRAYS_SUFFIX));
});
test('every non-Arrays component retains the exact original one-argument carrier bytes',()=>{
 for(const id of [null,'controller','spikeprime','circuitplayground','wedo2unified','foreign'])for(const source of ['normal','` ${x} " \n'])assert.equal(renderBuiltinCarrier(id,source),`const makeExt = require('../adapter');\nmodule.exports = makeExt(${JSON.stringify(source)});\n`);
 assert.equal(renderBuiltinCarrier('arrays','source'),renderRegisteredArraysCarrier('source'));
});
