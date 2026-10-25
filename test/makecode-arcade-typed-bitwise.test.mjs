import test from 'node:test';import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import BW from '../overlay/scratch-vm/src/util/bw-values.js';
import {loadExtensionClass} from './helpers/bw-extensions.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const ops=['&','|','^','<<','>>','>>>'];
test('typed bitwise primitives preserve integer conversion and reject opaque values explicitly',()=>{
 const runtime=new EventEmitter(),errors=[];runtime.on('BLOCKS_ERROR',e=>errors.push(String(e)));const Ext=loadExtensionClass('arrays'),ext=new Ext(runtime);
 const primitives=[-1,2147483648,4294967295.9,1.5,-0,0,NaN,Infinity,-Infinity,null,BW.UNDEFINED,true,false,'4294967295','0','not a number'];
 const apply=(a,op,b)=>{switch(op){case '&':return a&b;case '|':return a|b;case '^':return a^b;case '<<':return a<<b;case '>>':return a>>b;case '>>>':return a>>>b;}};
 for(const a of primitives){for(const b of [-1,0,1,31,32,33,1.5,NaN,Infinity,null,BW.UNDEFINED])for(const op of ops){const expected=apply(BW.decode(a),op,BW.decode(b));assert.equal(BW.binary(a,op,b),expected);assert.equal(ext.valueBinary({LEFT:a,OP:op,RIGHT:b}),expected);}assert.equal(BW.unary('~',a),~BW.decode(a));assert.equal(ext.valueUnary({VALUE:a,OP:'~'}),~BW.decode(a));}
 assert.deepEqual(errors,[]);for(const value of [BW.reference(runtime,'image','not-pixels'),BW.arrayReference(runtime,[1]),{valueOf(){throw Error('must not execute opaque coercion')}},()=>1]){assert.throws(()=>BW.binary(value,'>>>',0),/primitive/);assert.throws(()=>BW.unary('~',value),/primitive/);assert.equal(BW.decode(ext.valueBinary({LEFT:value,OP:'>>>',RIGHT:0})),undefined);assert.equal(BW.decode(ext.valueUnary({VALUE:value,OP:'~'})),undefined);}
 assert.equal(errors.length,8);assert.ok(errors.every(e=>/primitive/.test(e)));assert.deepEqual(ext.getInfo().menus.valueOperations.items,['+','-','*','/','%','**',...ops]);assert.deepEqual(ext.getInfo().menus.valueUnaryOperations.items,['+','-','~']);
});
test('source bitwise conversions diagnose unknown and reference operands',()=>{
 for(const source of ['let a=[1];let result=(a as any)>>>0','let a=image.create(1,1);let result=~(a as any)','let a:any={n:1};let result=a|0','function unknown(){return screen};let result=unknown()>>>0'])assert.match(arcadeToPseudocode(source).unsupported.join('\n'),/Bitwise operation requires proven primitive/,source);
});
test('uncalled typed SDK helpers retain sprite flag and enum primitive inference',()=>{
 const source=`function unused(actor:Sprite){return actor.flags & SpriteFlag.StayInScreen}
function returned():Sprite{return null}
function unusedReturn(){return returned().flags & SpriteFlag.StayInScreen}
function unusedLocal(){let actor:Sprite=null;return actor.flags & SpriteFlag.StayInScreen}
let ready=1`;
 const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);assert.deepEqual(imported.warnings,[]);
 assert.match(imported.code,/op "&"/);
 for(const opaque of ['function bad(actor:any){return actor.flags & 1}',
  'function bad(actor:Image){return actor & 1}'])
  assert.match(arcadeToPseudocode(opaque).unsupported.join('\n'),/Bitwise operation requires proven primitive/,opaque);
 assert.match(arcadeToPseudocode('function bad(actor:Sprite,SpriteFlag:any){return actor.flags & SpriteFlag.StayInScreen}').unsupported.join('\n'),/shadowed flag binding/);
});
const source=`function unusedSprite(actor:Sprite){return actor.flags & SpriteFlag.StayInScreen}
function unsigned(a:any,b:any){return a>>>b}
function signed(a:any,b:any){return a>>b}
function invert(a:any){return ~a}
function combine(a:any,b:any){return (a&b)|(a^b)}
function leftShift(a:any,b:any){return a<<b}
let high=unsigned(-1,0);let highShift=unsigned(-1,1);let highSign=signed(2147483648,0)
let negativeCount=unsigned(-1,-1);let wrappedCount=unsigned(-1,33);let fraction=unsigned(4294967295.9,0)
let nul=unsigned(null,1);let missing=unsigned(undefined,1);let bool=unsigned(true,0);let text=unsigned("4294967295",0)
let nan=unsigned(0/0,0);let inf=unsigned(1/0,0);let zero=unsigned(-0,0);let inverted=invert(2147483648)
let combined=combine(255,15);let leftHigh=leftShift(1,31)
let trace="";let leftCalls=0;let rightCalls=0;function left(){trace+="L";leftCalls++;return -1}function right(){trace+="R";rightCalls++;return 1}let ordered=left()>>>right();trace=trace+"";
let resultValues=[high,highShift,inverted];let alias=resultValues;alias[0]=high;
`;
const names=['high','highShift','highSign','negativeCount','wrappedCount','fraction','nul','missing','bool','text','nan','inf','zero','inverted','combined','leftHigh','trace','leftCalls','rightCalls','ordered'];
const vars=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
test('original bitwise semantics retain unsigned values, evaluation order and numeric arrays through Code/export/fresh SB3',async()=>{
 const expected=await runPxtArcade(source,{fakeClock:true}),runs=[];
 const check=run=>{const values=vars(run);for(const n of names)assert.equal(values[n],expected[n],n);assert.deepEqual(run.errors,[]);const Ext=loadExtensionClass('arrays'),ext=new Ext(run.vm.runtime);assert.equal(ext.valueCompare({LEFT:values.resultValues,OP:'===',RIGHT:values.alias}),true);for(const [i,n]of ['high','highShift','inverted'].entries())assert.equal(ext.referenceItem({ARRAY:values.resultValues,INDEX:i}),expected[n],n+' numeric array');};
 const execute=async imported=>{assert.deepEqual(imported.unsupported,[]);assert.deepEqual(imported.warnings,[]);const run=await runProgram(imported.code,{frames:120,storage:true});runs.push(run);assert.deepEqual(run.creator.warnings,[]);check(run);return run;};
 try{
  const imported=arcadeToPseudocode(source),run=await execute(imported);assert.ok(run.calls.get('arrays_valueBinary')>0);assert.ok(run.calls.get('arrays_valueUnary')>0);assert.ok(!Object.keys(Object.fromEntries(run.calls)).some(k=>k.startsWith('bitops_')));
  await execute({...imported,code:run.creator.decompile()});
  const exported=projectToArcade(run.creator.project);assert.deepEqual(exported.unsupported,[]);const original=await runPxtArcade(exported.files,{fakeClock:true});const declared=parseMakeCodeTs(exported.ts).body.filter(st=>st.type==='Declaration').flatMap(st=>st.decls.map(d=>d.name));for(const n of names){const matches=declared.filter(k=>k===n||k===`Game_${n}`);assert.equal(matches.length,1,n+' declaration');assert.equal(original[matches[0]],expected[n],n+' exported');}await execute(arcadeToPseudocode(exported.files));
  const fresh=await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0,storage:true});runs.push(fresh);fresh.vm.stopAll();await fresh.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));fresh.vm.greenFlag();await stepFrames(fresh.vm,120);check(fresh);
 }finally{for(const run of runs)run.vm.quit();clearStrayTimers();}
});
