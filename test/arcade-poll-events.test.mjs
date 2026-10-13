import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {createArcadeDiscreteTimers} from './helpers/arcade-discrete-timers.mjs';
const createPollEvents=createRequire(import.meta.url)('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/poll-events.js');
const make=()=>{const clock=createArcadeDiscreteTimers(),wakes=[],errors=[];const queue=createPollEvents({...clock,onReady:()=>wakes.push(clock.now()),onError:e=>errors.push(e)});return {clock,queue,wakes,errors};};
test('multiple registrations share the existing 50 ms phase and actual predicates',async()=>{
 const {clock,queue,wakes,errors}=make(),checks=[],ready=[];let first=false,second=false;
 queue.enqueue(()=>{checks.push(['first',clock.now()]);return first;},()=>ready.push(['first',clock.now()]));
 await clock.advanceTo(20);queue.enqueue(()=>{checks.push(['second',clock.now()]);return second;},()=>ready.push(['second',clock.now()]));
 first=true;second=true;await clock.advanceTo(49);assert.deepEqual(ready,[]);await clock.advanceTo(50);
 assert.deepEqual(checks,[['first',0],['first',50],['second',50]]);assert.deepEqual(ready,[['first',50],['second',50]]);assert.deepEqual(wakes,[50]);assert.equal(queue.size,0);assert.equal(queue.active,true);assert.deepEqual(errors,[]);
});
test('empty queue is released after the final sleep; intervening registrations keep its phase',async()=>{
 const {clock,queue}=make(),ready=[];queue.enqueue(()=>true,()=>ready.push(clock.now()));await clock.advanceTo(0);assert.deepEqual(ready,[0]);await clock.advanceTo(25);
 queue.enqueue(()=>true,()=>ready.push(clock.now()));await clock.advanceTo(49);assert.deepEqual(ready,[0]);await clock.advanceTo(50);assert.deepEqual(ready,[0,50]);await clock.advanceTo(100);assert.equal(queue.active,false);
 await clock.advanceTo(125);queue.enqueue(()=>true,()=>ready.push(clock.now()));await clock.advanceTo(125);assert.deepEqual(ready,[0,50,125]);
 queue.cancel();assert.equal(clock.pending,0);
});
test('strict timeout comparison, repeated events and reentrant registration follow queue order',async()=>{
 const {clock,queue}=make(),ready=[];queue.enqueue(()=>false,()=>ready.push(['timeout',clock.now()]),{timeout:50});
 let repeat=true;queue.enqueue(()=>repeat,()=>{ready.push(['repeat',clock.now()]);if(clock.now()===0)queue.enqueue(()=>true,()=>ready.push(['nested',clock.now()]));},{once:false});
 await clock.advanceTo(0);assert.deepEqual(ready,[['repeat',0],['nested',0]]);await clock.advanceTo(50);assert.equal(ready.some(x=>x[0]==='timeout'),false);
 repeat=false;await clock.advanceTo(100);assert.equal(ready.at(-1)[0],'timeout');assert.equal(ready.at(-1)[1],100);queue.cancel();assert.equal(clock.pending,0);
});
test('cancel rejects an already captured predecessor timer and new registrations start fresh',async()=>{
 const {clock,queue}=make(),ready=[];let old=true;queue.enqueue(()=>old,()=>ready.push('old'));queue.cancel();await clock.advanceTo(100);assert.deepEqual(ready,[]);assert.equal(queue.active,false);
 old=false;queue.enqueue(()=>true,()=>ready.push('new'));await clock.advanceTo(100);assert.deepEqual(ready,['new']);queue.cancel();assert.equal(clock.pending,0);
});
test('predicate failure is reported unchanged and cancels its polling fiber',async()=>{
 const {clock,queue,errors}=make(),fault=new Error('owned condition failed');queue.enqueue(()=>{throw fault;},()=>assert.fail('failed predicate must not wake'));await clock.advanceTo(0);assert.deepEqual(errors,[fault]);assert.equal(queue.active,false);assert.equal(clock.pending,0);
});
