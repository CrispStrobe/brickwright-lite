import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {INTEGRATED} from './helpers/bw-integrated.mjs';

const require=createRequire(import.meta.url),Module=require('node:module');
const root=INTEGRATED+'/node_modules/scratch-vm/src/util/';
const keys={
 'bw-primitive-owner':['beforeInputs','invoke','current','stepNested','handles','permitsNumberInput','captureActiveCall','captureFailureCall','isFailureActive','dispatchArrayFailure','isActiveCall'],
 'bw-array-operations':['registerSource','bind','consumeFailureLease'],
 'bw-arcade-exceptions':['rejectConditionWait','create','consume','failed','capture','stale','diagnostic','reported','arrayCoordinatorReady','rejectArrayOperation']
};
function actualEntry(first){
 const priorDescriptor=Object.getOwnPropertyDescriptor(Module,'_cache');
 assert.ok(priorDescriptor&&Object.hasOwn(priorDescriptor,'value')&&priorDescriptor.writable);
 const prior=priorDescriptor.value,priorRows=Object.entries(prior),isolated=Object.create(null);
 let actual;
 try{
  Module._cache=isolated;
  const entry=require(root+first+'.js');
  actual=Object.fromEntries(Object.keys(keys).map(name=>[name,require(root+name+'.js')]));
  assert.equal(actual[first],entry,'first entry is the same fully initialized native CJS export');
  for(const [name,expected]of Object.entries(keys)){
   const file=root+name+'.js',exported=actual[name],loaded=isolated[file];
   assert.equal(readFileSync(file,'utf8'),readFileSync(new URL('../overlay/scratch-vm/src/util/'+name+'.js',import.meta.url),'utf8'),'actual current installed body '+name);
   assert.ok(loaded?.loaded,'actual loader completed '+name);
   assert.equal(loaded.exports,exported);
   assert.equal(Object.isFrozen(exported),true);
   assert.deepEqual(Reflect.ownKeys(exported).sort(),[...expected].sort());
   assert.equal(Object.getPrototypeOf(exported),null,'every cyclic export avoids ordinary-object warning prototype decoration');
   for(const key of expected){
    const descriptor=Object.getOwnPropertyDescriptor(exported,key);
    assert.equal(typeof descriptor.value,'function');
    assert.equal(descriptor.writable,false);assert.equal(descriptor.configurable,false);
    assert.equal(require(file)[key],descriptor.value,'stable actual function identity '+name+'.'+key);
   }
   assert.equal(require(file),exported,'repeat native require returns the same export object');
  }
  const edges=[['bw-primitive-owner','bw-arcade-exceptions'],['bw-arcade-exceptions','bw-array-operations'],['bw-array-operations','bw-primitive-owner'],['bw-array-operations','bw-arcade-exceptions']];
  for(const [from,to]of edges)assert.ok(isolated[root+from+'.js'].children.includes(isolated[root+to+'.js']),'actual closed coordinator dependency '+from+' -> '+to);
 }finally{
  Object.defineProperty(Module,'_cache',priorDescriptor);
 }
 assert.deepEqual(Object.getOwnPropertyDescriptor(Module,'_cache'),priorDescriptor,'original native cache descriptor restored');
 assert.equal(Module._cache,prior);
 assert.deepEqual(Object.keys(prior),priorRows.map(([key])=>key),'original cache membership unchanged');
 for(const [key,value]of priorRows)assert.equal(prior[key],value,'original cache object identity '+key);
 return actual;
}

test('closed Array CJS cycle boots through primitive-owner first with immutable complete exports',()=>{actualEntry('bw-primitive-owner');});
test('closed Array CJS cycle boots through exceptions first with immutable complete exports',()=>{actualEntry('bw-arcade-exceptions');});
test('closed Array CJS cycle boots through operations first with immutable complete exports',()=>{actualEntry('bw-array-operations');});
