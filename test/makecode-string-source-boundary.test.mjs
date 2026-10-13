import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runProgram,clearStrayTimers} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const read=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));

test('opaque and unknown leaves remain diagnostic through assertions, aliases, mixed branches and primitive declarations',()=>{
 const cases=[
  'String.fromCharCode({code:65})',
  '"x".concat({value:"y"})',
  'let x:any={code:65};let alias=x;String.fromCharCode(alias)',
  'let x:any=[65];String.fromCharCode(x as number)',
  'let x:any=image.create(1,1);"x".concat(x as string)',
  'let x:any=true?65:{code:65};String.fromCharCode(x)',
  'let x:any=true?"a":{code:65};"x".concat(x)',
  'function x():any{return true?65:{code:65}};String.fromCharCode(x())',
  'let x:any=true?65:missing.value;String.fromCharCode(x)',
  'let x:any=true?65:missing();String.fromCharCode(x)',
  'let x:any;String.fromCharCode(x)',
  'let missing:any;let x:any=true?65:missing;String.fromCharCode(x)',
  'let x:any={value:"y"};let y:string=x;"x".concat(y)',
  'let x:any=true?"a":image.create(1,1);x.concat("b")'
 ];
 for(const source of cases){const end=source.lastIndexOf(';');const result=arcadeToPseudocode(source.slice(0,end+1)+'let result='+source.slice(end+1));assert.ok(result.unsupported.some(message=>/String\.(?:concat|fromCharCode)\(\).*proven/.test(message)),source+' '+JSON.stringify(result.unsupported));}
});

test('primitive unions and assertion metadata retain a concrete native string operation',()=>{
 for(const source of [
  'let x:number|string|boolean|null|undefined=65;String.fromCharCode(x)',
  'let x:any=true?65:null;String.fromCharCode(x)',
  'let x:any=true?"a":undefined;"x".concat(x)',
  'let x:any=65;String.fromCharCode(x as number)',
  'let x:any="b";"a".concat(x as string)',
  'let x:any=NaN;String.fromCharCode(x)',
  'let x:any=Math.PI;String.fromCharCode(x)',
  'let x:number[]=[65];String.fromCharCode(x.pop())',
  'function x(v:number):number{return v};String.fromCharCode(x(65))'
 ]){const end=source.lastIndexOf(';');const result=arcadeToPseudocode(source.slice(0,end+1)+'let result='+source.slice(end+1));assert.deepEqual(result.unsupported,[],source);assert.match(result.code,/(text from char code|concatenate text)/,source);}
});

test('actual original object and RefCollection coercions stay outside primitive source admission',async()=>{
 const source='let a=[65];let o={code:65};let ca=String.fromCharCode(<any>a);let co=String.fromCharCode(<any>o);let sa="x".concat(<any>a);let so="x".concat(<any>o);ca+="";co+="";sa+="";so+="";';
 const original=await runPxtArcade(source);
 assert.equal(original.ca,'\0');assert.equal(original.co,'\0');
 assert.equal(original.sa,'x[object Object]');assert.equal(original.so,'x[object Object]');
 const result=arcadeToPseudocode(source);
 assert.equal(result.unsupported.filter(message=>/String\.(?:concat|fromCharCode)\(\).*proven primitive/.test(message)).length,2);
 assert.doesNotMatch(result.code,/(text from char code|concatenate text)/);
});

test('primitive aliases in functions and callbacks keep observable return values against original PXT',async()=>{
 const source='function letter(n:number):string{let alias=n;return String.fromCharCode(alias)};let observed="";game.onUpdate(function(){let n=65;let alias=n;let text=letter(alias);let textAlias=text;observed="x".concat(textAlias)});let done=1;done+=0;';
 const original=await runPxtArcade(source,{waitForGlobals:{observed:'xA'}});
 const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);let run;
 try{run=await runProgram(imported.code,{frames:30});assert.deepEqual(run.errors,[]);assert.equal(read(run).observed,original.observed);assert.equal(original.observed,'xA');}
 finally{run?.vm.quit?.();clearStrayTimers();}
});
