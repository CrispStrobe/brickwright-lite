import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const require=createRequire(import.meta.url);
const collections=require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/pxt-particle-collections.js');
test('local particle collection removeAt agrees with original PXT bounds and fractional indices',async()=>{
 const source=`let values=[10,20,30]
let negative=values.removeAt(-1)
let fraction=values.removeAt(.5)
let remaining=values.length
let past=values.removeAt(99)
let notANumber=values.removeAt(NaN)
let infinite=values.removeAt(Infinity)
let emptyValues:number[]=[]
let empty=emptyValues.removeAt(0)
let zeroValues=[55]
let minusZero=zeroValues.removeAt(-0)
let found=values.removeElement(20)
let missing=values.removeElement(99)
let finalLength=values.length
let done=1;done+=0;`;
 const original=await runPxtArcade(source,{fakeClock:true});assert.equal(original.done,1);
 const values=[10,20,30];const native={negative:collections.removeAt(values,-1),fraction:collections.removeAt(values,.5),remaining:values.length,past:collections.removeAt(values,99),notANumber:collections.removeAt(values,NaN),infinite:collections.removeAt(values,Infinity),empty:collections.removeAt([],0),minusZero:collections.removeAt([55],-0),found:collections.removeElement(values,20),missing:collections.removeElement(values,99),finalLength:values.length};
 for(const [key,value] of Object.entries(native))assert.equal(value,original[key],key);
 assert.equal(native.negative,undefined);assert.equal(native.fraction,10);assert.equal(native.remaining,2);assert.equal(native.finalLength,1);
});
test('collection removal preserves aliases and identity and changes no Array prototype',()=>{
 const descriptors=Object.getOwnPropertyDescriptors(Array.prototype),first={},equalLooking={},items=[first,equalLooking,first],alias=items;
 assert.equal(collections.removeElement(items,{}),0);assert.equal(collections.removeElement(items,first),1);assert.equal(alias,items);assert.deepEqual(items,[equalLooking,first]);assert.equal(collections.removeAt(items,1),first);assert.deepEqual(items,[equalLooking]);
 for(const invalid of [null,undefined,{},'array']){assert.throws(()=>collections.removeAt(invalid,0),TypeError);assert.throws(()=>collections.removeElement(invalid,1),TypeError);}
 assert.deepEqual(Object.getOwnPropertyDescriptors(Array.prototype),descriptors);
});
