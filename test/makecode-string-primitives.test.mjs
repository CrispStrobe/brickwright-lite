import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {loadExtensionClass} from './helpers/bw-extensions.mjs';
import {INTEGRATED} from './helpers/bw-integrated.mjs';
import {runProgram,clearStrayTimers} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const require=createRequire(import.meta.url);
const BW=require(path.join(INTEGRATED,'node_modules/scratch-vm/src/util/bw-values.js'));
const read=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
const source=`let a=String.fromCharCode(-1);let b=String.fromCharCode(65536);let c=String.fromCharCode(65537.9);let d=String.fromCharCode(0/0);let e=String.fromCharCode(1/0);let f=String.fromCharCode(55357);let g=String.fromCharCode(56832);let h=f.concat(g);let n:string=null;let u:string=undefined;let cn="a".concat(n);let cu="a".concat(u);let nn:number=null;let un:number=undefined;let an=String.fromCharCode(nn);let au=String.fromCharCode(un);let as=String.fromCharCode(<any>"65");let cm="a".concat(<any>(0/0));an+="";au+="";as+="";cm+="";a+="";b+="";c+="";d+="";e+="";f+="";g+="";h+="";cn+="";cu+=""`;
const code=`DEVICE ARCADE
SPRITE Game:
WHEN flag clicked:
  set a to (text from char code -1)
  set b to (text from char code 65536)
  set c to (text from char code 65537.9)
  set d to (text from char code (calculate value 0 op "/" with 0))
  set e to (text from char code (calculate value 1 op "/" with 0))
  set f to (text from char code 55357)
  set g to (text from char code 56832)
  set h to (concatenate text f with g)
  set cn to (concatenate text "a" with (null value))
  set cu to (concatenate text "a" with (undefined value))
  set an to (text from char code (null value))
  set au to (text from char code (undefined value))
  set as to (text from char code "65")
  set cm to (concatenate text "a" with (calculate value 0 op "/" with 0))`;

test('single UTF-16 character conversion and primitive string concat match original through native Code and saved SB3',async()=>{
 const original=await runPxtArcade(source);let run,again;
 try{
  run=await runProgram(code,{frames:2});assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
  for(const key of ['a','b','c','d','e','f','g','h','cn','cu','an','au','as','cm'])assert.equal(read(run)[key],original[key],key);
  assert.equal(read(run).h,'😀');assert.equal(read(run).f.length,1);assert.equal(read(run).b.charCodeAt(0),0);
  again=await runProgram(run.creator.decompile(),{frames:2});assert.deepEqual(again.errors,[]);
  for(const key of ['a','b','c','d','e','f','g','h','cn','cu','an','au','as','cm'])assert.equal(read(again)[key],original[key],key+' Code');
  const archive=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());again.vm.stopAll();await again.vm.loadProject(archive);again.vm.greenFlag();again.vm.runtime._step(20);
  for(const key of ['a','b','c','d','e','f','g','h','cn','cu','an','au','as','cm'])assert.equal(read(again)[key],original[key],key+' SB3');
 }finally{run?.vm.quit?.();again?.vm.quit?.();clearStrayTimers();}
});

test('primitive conversions retain null/undefined/NaN while opaque values and invalid receivers are diagnosed',()=>{
 const runtime=new EventEmitter(),errors=[];runtime.on('BLOCKS_ERROR',e=>errors.push(e));
 const ext=new (loadExtensionClass('arrays'))(runtime);
 for(const value of [null,undefined,NaN,Infinity,-Infinity])assert.equal(ext.stringFromCharCode({CODE:BW.encode(value)}),'\0');
 assert.equal(ext.stringFromCharCode({CODE:'65'}),'A','numeric editor shadow');
 assert.equal(ext.stringConcat({TEXT:'a',OTHER:BW.encode(NaN)}),'aNaN');
 assert.equal(ext.stringConcat({TEXT:'a',OTHER:true}),'atrue');
 const ref=BW.arrayReference(runtime,[65]);
 for(const CODE of [ref,{},BW.reference(runtime,'image','test')])assert.equal(BW.decode(ext.stringFromCharCode({CODE})),undefined);
 for(const TEXT of [null,BW.encode(undefined),ref,7])assert.equal(BW.decode(ext.stringConcat({TEXT,OTHER:'b'})),undefined);
 assert.equal(BW.decode(ext.stringConcat({TEXT:'a',OTHER:ref})),undefined);
 assert.equal(errors.length,8);
 runtime.emit('PROJECT_START');assert.equal(BW.decode(ext.stringFromCharCode({CODE:ref})),undefined,'expired reference still cannot become a handle string');
});

test('standalone Arrays uses the same primitive rules without the shared host value module',()=>{
 const bundle=readFileSync(new URL('../overlay/scratch-vm/src/extensions/crispstrobe/arrays/index.js',import.meta.url),'utf8');
 const source=JSON.parse(bundle.slice(bundle.indexOf('makeExt(')+8,bundle.lastIndexOf(');')));
 const runtime=new EventEmitter(),errors=[];runtime.on('BLOCKS_ERROR',e=>errors.push(e));
 let ext;
 const Scratch={vm:{runtime},extensions:{register(instance){ext=instance;}}};
 new Function('Scratch',source)(Scratch);
 assert.equal(ext.stringFromCharCode({CODE:-1}),'\uffff');
 assert.equal(ext.stringFromCharCode({CODE:65537.9}),'\u0001');
 assert.equal(ext.stringFromCharCode({CODE:NaN}),'\0');
 assert.equal(ext.stringConcat({TEXT:ext.stringFromCharCode({CODE:55357}),OTHER:ext.stringFromCharCode({CODE:56832})}),'😀');
 assert.equal(ext.stringConcat({TEXT:'a',OTHER:ext.specialValue({KIND:'undefined'})}),'aundefined');
 const ref=ext.createReference({VALUES:'[65]'});
 assert.equal(String(ext.stringConcat({TEXT:'a',OTHER:ref})),'undefined');
 assert.equal(String(ext.stringFromCharCode({CODE:ref})),'undefined');
 assert.equal(errors.length,2);
});
