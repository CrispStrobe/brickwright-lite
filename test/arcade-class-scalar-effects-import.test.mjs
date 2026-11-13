import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';

import {scalarAccessorSource} from './fixtures/arcade-class-scalar-effects.mjs';
const accepted=source=>assert.deepEqual(arcadeToPseudocode(source).unsupported,[],source);
const refused=source=>assert.ok(arcadeToPseudocode(source).unsupported.some(message=>message.includes('requires Number from actual producers')),source);

test('closed Number accessors retain bounded scalar effects before the field operation',()=>{
 accepted(scalarAccessorSource);
 accepted(scalarAccessorSource.replace('trace=trace*10+1;','trace=trace*10+1;trace=trace+0;'));
 accepted(scalarAccessorSource.replace('trace=trace*10+1;','trace=-trace+1;'));
 const imported=arcadeToPseudocode(scalarAccessorSource);
 assert.match(imported.code,/DEFINE __bwAccessor_Box_get_value[\s\S]*set trace to[\s\S]*arcade return value/);
 assert.match(imported.code,/DEFINE __bwAccessor_Box_set_value[\s\S]*set trace to[\s\S]*arcade set object/);
});

test('scalar effect proof checks actual initialization, every writer and binding identity',()=>{
 for(const source of [
  scalarAccessorSource.replace('let trace=0;','let trace:number;'),
  scalarAccessorSource.replace('let trace=0;','let trace=<any>"";'),
  scalarAccessorSource.replace('let trace=0;','let trace=1e999;'),
  scalarAccessorSource.replace('let trace=0;','')+'let trace=0;',
  scalarAccessorSource+'trace=<any>"bad";',
  scalarAccessorSource+'function change(){trace=<any>true}',
  scalarAccessorSource+'trace++;',
  scalarAccessorSource.replace('trace=trace*10+1;','trace=other+1;'),
  scalarAccessorSource.replace('trace=trace*10+1;','trace=trace+<any>"x";'),
  scalarAccessorSource.replace('trace=trace*10+1;','trace=trace/0;'),
  scalarAccessorSource.replace('trace=trace*10+1;','trace=trace%2;'),
  scalarAccessorSource.replace('trace=trace*10+1;','trace=tap();')+'function tap(){return 1}',
  scalarAccessorSource.replace('trace=trace*10+2;','v=3;'),
  scalarAccessorSource.replace('trace=trace*10+2;','this.n=3;'),
  scalarAccessorSource.replace('trace=trace*10+1;','let trace=0;trace=trace+1;'),
  scalarAccessorSource.replace('trace=trace*10+1;','if(true){trace=1;}')
 ])refused(source);
});

test('effect prefixes preserve closed receiver and mixed field writer refusals',()=>{
 for(const extra of ['box.n=<any>"x";','box.value=<any>true;','let alias=box;',
  'function capture(){box.n=4}','box=<any>{n:2};','box["n"]=<any>"x";'])refused(scalarAccessorSource+extra);
 refused(scalarAccessorSource.replace('new Box(2)','new Box(<any>"x")'));
 refused(scalarAccessorSource.replace('return this.n','return <any>true'));
 refused(scalarAccessorSource.replace('return this.n','return this.value'));
 refused(scalarAccessorSource.replace('this.n=v','this.value=v'));
});


test('var hoisting cannot hide a Text writer behind lexical Number facts',()=>{
 const effect=scalarAccessorSource.replace('let trace=0;','var trace:any=0;').replace('let box=new Box(2);',`if(true){var trace:any="x"}let box=new Box(trace);`);
 refused(effect);
 refused(effect.replace('trace=trace*10+1;','').replace('trace=trace*10+2;',''));
 refused(scalarAccessorSource.replace('let trace=0;','var trace=0;'));
 refused(scalarAccessorSource.replace('let box=new Box(2);','var box=new Box(2);'));
 refused(scalarAccessorSource.replace('let box=new Box(2);','let value:any=2;if(true){var value:any="x"}let box=new Box(value);'));
});
