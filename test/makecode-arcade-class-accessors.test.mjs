import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import BW from '../overlay/scratch-vm/src/util/bw-values.js';
const cases={
  "basic": "let trace=\"\";class Box {constructor(public n:number){}get value():number{trace=trace+\"g\";return this.n}set value(v:number){trace=trace+\"s\";this.n=v}}let b=new Box(2);let alias=b;let before=b.value;alias.value=5;let after=b.value;let same=b===alias;before+=0;after+=0;trace=trace+\"\";",
  "compound-order": "let trace=\"\";class Box {constructor(public n:number){}get value():number{trace=trace+\"g\";return this.n}set value(v:number){trace=trace+\"s\";this.n=v}}let b=new Box(2);function receiver(){trace=trace+\"r\";return b}function rhs(){trace=trace+\"v\";return 3}receiver().value+=rhs();let result=b.n;result+=0;trace=trace+\"\";",
  "yield-recursion": "let trace=\"\";class Box {constructor(public n:number){}get value():number{trace=trace+\"g\";pause(20);return this.n}set value(v:number){trace=trace+\"s\";pause(20);if(v>1){this.value=v-1}else{this.n=v}}}let b=new Box(2);b.value=3;let result=b.value;result+=0;trace=trace+\"\";",
  "inherited-getter-no-super": "let trace=\"\";class Base {constructor(public n:number){}get value():number{trace=trace+\"g\";return this.n}set value(v:number){trace=trace+\"s\";this.n=v}}class Child extends Base {get value():number{trace=trace+\"c\";return this.n+10}}let child=new Child(2);let alias:Base=child;let before=alias.value;alias.value=5;let after=child.value;before+=0;after+=0;trace=trace+\"\";",
  "any-paired": "let trace=\"\";class Base {constructor(public n:number){}get value():number{trace=trace+\"g\";return this.n}set value(v:number){trace=trace+\"s\";this.n=v}}let b=new Base(2);let alias:any=b;alias.value=5;let typed=b.value;let dynamic=alias.value;typed+=0;dynamic+=0;trace=trace+\"\";",
  "typed-updates": "let trace=\"\";class Base {constructor(public n:number){}get value():number{trace=trace+\"g\";return this.n}set value(v:number){trace=trace+\"s\";this.n=v}}let b=new Base(2);let old=b.value++;let next=++b.value;let raw=b.n;old+=0;next+=0;raw+=0;trace=trace+\"\";",
  "partial-setter-base-typed": "let trace=\"\";class Base {constructor(public n:number){}get value():number{trace=trace+\"g\";return this.n}set value(v:number){trace=trace+\"s\";this.n=v}}class Child extends Base {set value(v:number){trace=trace+\"c\";this.n=v+10}}let child=new Child(2);let alias:Base=child;let before=alias.value;alias.value=5;let after=alias.value;before+=0;after+=0;trace=trace+\"\";",
  "partial-setter-any": "let trace=\"\";class Base {constructor(public n:number){}get value():number{trace=trace+\"g\";return this.n}set value(v:number){trace=trace+\"s\";this.n=v}}class Child extends Base {set value(v:number){trace=trace+\"c\";this.n=v+10}}let child=new Child(2);let alias:any=child;let before=alias.value;alias.value=5;let after=alias.value;before+=0;after+=0;trace=trace+\"\";"
};
const expected={
  "basic": {
    "trace": "gsg",
    "before": 2,
    "after": 5,
    "same": true
  },
  "compound-order": {
    "trace": "rgvs",
    "result": 5
  },
  "yield-recursion": {
    "trace": "sssg",
    "result": 1
  },
  "inherited-getter-no-super": {
    "trace": "csc",
    "before": 12,
    "after": 15
  },
  "any-paired": {
    "trace": "sgg",
    "typed": 5,
    "dynamic": 5
  },
  "typed-updates": {
    "trace": "gsgs",
    "old": 2,
    "next": 4,
    "raw": 4
  },
  "partial-setter-base-typed": {
    "trace": "gcg",
    "before": 2,
    "after": 15
  },
  "partial-setter-any": {
    "trace": "gcg",
    "before": 2,
    "after": 15
  }
};

Object.assign(cases,{
  "resource-aliases": "class Holder {constructor(public _art:Image,public _actor:Sprite,public _items:Holder[]){}get art():Image{return this._art}set art(v:Image){this._art=v}get actor():Sprite{return this._actor}get items():Holder[]{return this._items}set items(v:Holder[]){this._items=v}get self():Holder{return this}}let art=image.create(2,2);let actor=sprites.create(art,SpriteKind.Player);let holder=new Holder(art,actor,[]);holder.items=[holder];let imageSame=holder.art===art;let actorSame=holder.actor===actor;let objectSame=holder.self===holder;let arraySame=holder.items[0]===holder;holder.art.setPixel(0,0,7);let pixel=art.getPixel(0,0);let next=image.create(3,1);holder.art=next;let replaced=holder.art===next;let oldWidth=art.width;let newWidth=holder.art.width;pixel+=0;oldWidth+=0;newWidth+=0;",
  "constructor-virtual": "let trace=\"\";let observed=0;class Base {constructor(public n:number){trace=trace+\"B\";observed=this.value}get value():number{trace=trace+\"g\";return this.n}}class Child extends Base {field=2;constructor(public m:number){super(3);trace=trace+\"C\"}get value():number{trace=trace+\"c\";return this.n+this.m+this.field}}let child=new Child(4);let result=child.value;observed+=0;result+=0;trace=trace+\"\";",
  "empty-setter-string-boolean": "let trace=\"\";class Box {constructor(public n:number,public text:string,public flag:boolean){}get value():number{trace=trace+\"g\";return this.n}set value(v:number){}get label():string{return this.text}set label(v:string){this.text=v}get enabled():boolean{return this.flag}set enabled(v:boolean){this.flag=v}}let b=new Box(2,\"a\",false);b.value=9;b.label=\"b\";b.enabled=true;let result=b.value;let label=b.label;let enabled=b.enabled;result+=0;label=label+\"\";enabled=!!enabled;trace=trace+\"\";"
});
Object.assign(expected,{
  "resource-aliases": {
    "imageSame": true,
    "actorSame": true,
    "objectSame": true,
    "arraySame": true,
    "pixel": 7,
    "replaced": true,
    "oldWidth": 2,
    "newWidth": 3
  },
  "constructor-virtual": {
    "trace": "BcCc",
    "observed": 9,
    "result": 9
  },
  "empty-setter-string-boolean": {
    "trace": "g",
    "result": 2,
    "label": "b",
    "enabled": true
  }
});
Object.assign(cases,{
  "sprite-accessor": "class Child extends sprites.ExtendableSprite {constructor(img:Image){super(img,SpriteKind.Player)}get value():number{return this.x}set value(n:number){this.x=n}}let child=new Child(img`1`);let alias=sprites.allOfKind(SpriteKind.Player)[0];child.value=23;let result=child.value;let same=alias===child;let x=alias.x;result+=0;x+=0;",
  "any-wrongtype": "class Box {constructor(public n:number){}get value():number{return this.n}set value(v:number){this.n=v}}let b=new Box(2);(b as any).value=false;let result=(b as any).value;let same=result===false;same=!!same;",
  "private-valid": "class Box {constructor(public n:number){}private get value():number{return this.n}private set value(v:number){this.n=v}read(){this.value=5;return this.value}}let b=new Box(2);let result=b.read();result+=0;",
  "protected-valid": "class Base {constructor(public n:number){}protected get value():number{return this.n}protected set value(v:number){this.n=v}}class Child extends Base {read(){this.value=5;return this.value}}let child=new Child(2);let result=child.read();result+=0;",
  "uninitialized-getter": "class Box {n:number;get value():number{return this.n}set value(v:number){this.n=v}}let b=new Box();let same=b.value===undefined;b.value=7;let result=b.value;same=!!same;result+=0;"
});
Object.assign(expected,{
  "sprite-accessor": {
    "result": 23,
    "same": true,
    "x": 23
  },
  "any-wrongtype": {
    "result": false,
    "same": true
  },
  "private-valid": {
    "result": 5
  },
  "protected-valid": {
    "result": 5
  },
  "uninitialized-getter": {
    "same": true,
    "result": 7
  }
});
Object.assign(cases,{"cancel-accessor":"let entered=0;let finished=0;class Box {constructor(public n:number){}get value():number{entered++;pause(40);finished++;return this.n}set value(v:number){entered++;pause(40);finished++;this.n=v}}let b=new Box(2);b.value=5;let result=b.value;let elapsed=control.millis();result+=0;elapsed+=0;"});
Object.assign(expected,{"cancel-accessor":{"entered":2,"finished":2,"result":5,"elapsed":80}});
Object.assign(cases,{
  "receiver-hygiene": "let __bwSelf=9;function __bwAccessor_Box_get_value(){return 11}class Box {constructor(public __bwSelf:number){}get value():number{return this.__bwSelf}set value(__bwSelf:number){this.__bwSelf=__bwSelf}get label():string{return \"__bwSelf\"}get outer():number{return __bwSelf}read(__bwSelf:number){return this.__bwSelf+__bwSelf}}let b=new Box(2);b.value=5;let result=b.read(3);let label=b.label;let outer=b.outer;let helper=__bwAccessor_Box_get_value();result+=0;outer+=0;helper+=0;label=label+\"\";",
  "accessor-string-literals": "class Box {constructor(public n:number){}get label():string{return \"__bwSelf\"}get quoted():string{return \"\\\"__bwSelf\\\"\"}}let b=new Box(2);let label=b.label;let quoted=b.quoted;label=label+\"\";quoted=quoted+\"\";"
});
Object.assign(expected,{
  "receiver-hygiene": {
    "result": 8,
    "label": "__bwSelf",
    "outer": 9,
    "helper": 11
  },
  "accessor-string-literals": {
    "label": "__bwSelf",
    "quoted": "\"__bwSelf\""
  }
});
const variables=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,'').replace(/^x_$/,'x'),BW.decode(v.value)]));
const check=(run,want)=>{assert.deepEqual(run.errors,[]);const vars=variables(run);for(const [name,value]of Object.entries(want))assert.equal(vars[name],value,name);};
for(const [name,source]of Object.entries(cases))test('ordinary accessor '+name+' retains managed effects and all authoring routes', {todo:(["ordinary accessor resource-aliases retains managed effects and all authoring routes"].includes('ordinary accessor '+name+' retains managed effects and all authoring routes')?"Array export authority cannot yet prove the Array receiver \u2014 see docs/ARCADE-888-OPEN-FAILURES.md":undefined)},async()=>{
 const runs=[],want=expected[name];
 const execute=async imported=>{assert.deepEqual(imported.unsupported,[]);assert.deepEqual(imported.warnings,[]);const run=await runProgram(imported.code,{frames:0,storage:true,uploads:imported.costumes||[]});runs.push(run);assert.deepEqual(run.creator.warnings,[]);run.vm.stopAll();let now=0;run.vm.runtime.bwArcadeProgramClock={now:()=>now};run.vm.runtime.updateCurrentMSecs=()=>{run.vm.runtime.currentMSecs=now;};run.vm.greenFlag();await stepFrames(run.vm,150,0);for(let i=0;i<12;i++){now+=20;await stepFrames(run.vm,4,20);}check(run,want);return run;};
 try{
  const imported=arcadeToPseudocode(source),run=await execute(imported);
  await execute({...imported,code:run.creator.decompile()});
  const exported=projectToArcade(run.creator.project,{costumeSvg:(_target,costume)=>run.creator.assets.get(costume.assetId)?.data});assert.deepEqual(exported.unsupported,[]);assert.deepEqual(exported.warnings,[]);assert.match(exported.ts,/get \w+\(/);
  const original=await runPxtArcade(exported.files,{fakeClock:true});for(const [key,value]of Object.entries(want))assert.equal(original[key]??original['Game_'+key]??(key==='x'?(original.x_??original.Game_x_):undefined),value,key+' original export');
  await execute(arcadeToPseudocode(exported.files));
  const fresh=await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0,storage:true});runs.push(fresh);fresh.vm.stopAll();await fresh.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));let now=0;fresh.vm.runtime.bwArcadeProgramClock={now:()=>now};fresh.vm.runtime.updateCurrentMSecs=()=>{fresh.vm.runtime.currentMSecs=now;};fresh.vm.greenFlag();await stepFrames(fresh.vm,150,0);for(let i=0;i<12;i++){now+=20;await stepFrames(fresh.vm,4,20);}check(fresh,want);
 }finally{runs.forEach(run=>run.vm.quit());clearStrayTimers();}
});

test('accessor descriptors retain inherited halves without allocating a second backing field',async()=>{
 const {EventEmitter}=await import('node:events');
 const {default:createHeap}=await import('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/object-heap.js');
 const runtime=new EventEmitter(),heap=createHeap(runtime,BW);
 const base={name:'Base',fields:[{name:'n',type:'number',readonly:false},{name:'value',type:'number',readonly:false,getter:'baseGet %s',setter:{procedure:'baseSet %s %s',parameters:[{name:'value',type:'number',optional:false}]}}],initializer:'baseInit %s',constructor:'baseCtor %s',parameters:[],methods:[]};
 try{
  heap.register(base);heap.register({name:'Child',parent:'Base',fields:[{name:'value',type:'number',readonly:true,getter:'childGet %s'}],initializer:'childInit %s',constructor:'childCtor %s',parameters:[],methods:[]});
  const object=heap.allocate('Child');assert.equal(heap.property(object.ref,'value').getter,'childGet %s');assert.equal(heap.property(object.ref,'value').setter.procedure,'baseSet %s %s');
  assert.throws(()=>heap.get(object.ref,'value'),/managed getter/);assert.throws(()=>heap.set(object.ref,'value',7),/managed setter/);
  heap.set(object.ref,'n',7);assert.equal(BW.decode(heap.get(object.ref,'n')),7);
  for(const field of [
   {...base.fields[1],initializer:''},
   {...base.fields[1],setter:{...base.fields[1].setter,parameters:[]}},
   {...base.fields[1],setter:{...base.fields[1].setter,parameters:[{name:'value',type:'number',optional:true}]}},
   {...base.fields[1],setter:{...base.fields[1].setter,extra:true}},
   {...base.fields[1],getter:'baseInit %s'},
   {...base.fields[1],getter:'baseGet %s'}
  ])assert.throws(()=>heap.register({...base,name:'Malformed',fields:[field]}),/accessor|backing|declared half/);
  runtime.emit('PROJECT_START');assert.throws(()=>heap.property(object.ref,'value'),/stale/);
 }finally{heap.dispose();}
});

test('selected original accessor refusals remain explicit for missing halves, super, defaults and visibility',()=>{
 for(const [source,pattern]of [
  ['class Box {get value():number{}}let b=new Box();let x=b.value;',/getter must return/],
  ['class Box {get value():number{return 2}set value(v:number){}}let b=new Box();b.value=false;',/assignment type differs/],
  ['class Box {get value():number{return 2}set value(v:number){return 3}}let b=new Box();b.value=4;',/setter cannot return/],
  ['class Box {set value(v:number){}}let b=new Box();b.value=4;',/corresponding getter/],
  ['class Box {get value():number{return 2}}let b=new Box();b.value=4;',/Readonly/],
  ['class Box {get value():number{return 2}set value(v:number=2){}}let b=new Box();b.value=4;',/default accessor/],
  ['class Base {get value():number{return 2}set value(v:number){}}class Child extends Base {get value():number{return super.value}}let c=new Child();let result=c.value;',/super.*accessor|accessor.*super/],
  ['class Box {private get value():number{return 2}private set value(v:number){}}let b=new Box();let result=b.value;',/private/],
  ['class Box {protected get value():number{return 2}protected set value(v:number){}}let b=new Box();let result=b.value;',/protected/]
 ])assert.match(arcadeToPseudocode(source).unsupported.join('\n'),pattern,source);
});

test('Stop, restart and project replacement discard suspended getter/setter continuations',async()=>{
 const imported=arcadeToPseudocode(cases['cancel-accessor']);assert.deepEqual(imported.unsupported,[]);
 const run=await runProgram(imported.code,{frames:0,storage:true});let now=0;
 const runtime=run.vm.runtime;runtime.bwArcadeProgramClock={now:()=>now};runtime.updateCurrentMSecs=()=>{runtime.currentMSecs=now;};
 const advance=async time=>{now=time;await stepFrames(run.vm,25,0);};
 try{
  run.vm.stopAll();run.vm.greenFlag();await advance(0);assert.equal(variables(run).entered,1);assert.equal(variables(run).finished,0);
  run.vm.stopAll();await advance(40);assert.equal(variables(run).finished,0);assert.equal(runtime.threads.length,0);
  run.vm.greenFlag();await advance(40);assert.equal(variables(run).entered,1);await advance(80);assert.equal(variables(run).entered,2);assert.equal(variables(run).finished,1);
  run.vm.stopAll();await advance(120);assert.equal(variables(run).finished,1);assert.equal(runtime.threads.length,0);
  run.vm.greenFlag();await advance(120);await advance(160);await advance(200);check(run,expected['cancel-accessor']);
  run.vm.greenFlag();await advance(200);assert.equal(variables(run).finished,0);
  const saved=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());await run.vm.loadProject(saved);await advance(240);assert.equal(variables(run).finished,0);assert.equal(runtime.threads.length,0);
  run.vm.greenFlag();await advance(240);await advance(280);await advance(320);check(run,expected['cancel-accessor']);
 }finally{run.vm.quit();clearStrayTimers();}
});

test('editable accessor export refuses malformed descriptor arity, storage and shared procedure ownership',async()=>{
 const imported=arcadeToPseudocode(cases.basic),run=await runProgram(imported.code,{frames:0});
 const change=(target,block,name,value)=>{const slot=block.inputs[name][1];if(Array.isArray(slot))slot[1]=value;else{const shadow=target.blocks[slot];Object.values(shadow.fields)[0][0]=value;}};
 const read=(target,block,name)=>{const slot=block.inputs[name][1];return Array.isArray(slot)?slot[1]:Object.values(target.blocks[slot].fields)[0][0];};
 try{
  for(const mutate of [
   fields=>{fields.find(field=>field.getter).setter.parameters=[];},
   fields=>{fields.find(field=>field.getter).setter.extra=true;},
   fields=>{fields.find(field=>field.getter).initializer='';},
   fields=>{const field=fields.find(field=>field.getter);field.setter.procedure=field.getter;}
  ]){const project=structuredClone(run.creator.project),target=project.targets.find(t=>Object.values(t.blocks).some(b=>b.opcode==='arcade_declareClass')),declaration=Object.values(target.blocks).find(b=>b.opcode==='arcade_declareClass'),fields=JSON.parse(read(target,declaration,'FIELDS'));mutate(fields);change(target,declaration,'FIELDS',JSON.stringify(fields));assert.match(projectToArcade(project).unsupported.join('\n'),/valid declaration metadata|exactly one declared accessor half/);}
 }finally{run.vm.quit();clearStrayTimers();}
});

test('receiver hygiene preserves authored bindings, property names and quoted strings in editable export',async()=>{
 for(const name of ['receiver-hygiene','accessor-string-literals']){
  const imported=arcadeToPseudocode(cases[name]);assert.deepEqual(imported.unsupported,[]);const run=await runProgram(imported.code,{frames:80});
  try{check(run,expected[name]);const exported=projectToArcade(run.creator.project);assert.deepEqual(exported.unsupported,[]);assert.match(exported.ts,/return "__bwSelf"/);if(name==='receiver-hygiene'){assert.match(exported.ts,/this\.__bwSelf/);assert.match(exported.ts,/set value\(__bwSelf: number\)/);assert.match(exported.ts,/return __bwSelf\s/);}else assert.ok(exported.ts.includes('return "\\\"__bwSelf\\\""'));}
  finally{run.vm.quit();clearStrayTimers();}
 }
});

test('edited accessor receiver and parameter metadata cannot alias each other or an exported global binding',async()=>{
 const imported=arcadeToPseudocode(cases.basic),run=await runProgram(imported.code,{frames:0});
 try{
  for(const mode of ['duplicate','invalid','global']){const project=structuredClone(run.creator.project),target=project.targets.find(t=>Object.values(t.blocks).some(b=>b.opcode==='arcade_declareClass')),prototype=Object.values(target.blocks).find(b=>b.opcode==='procedures_prototype'&&b.mutation.proccode.startsWith('__bwAccessor_Box_set_value ')),names=JSON.parse(prototype.mutation.argumentnames);if(mode==='duplicate')names[1]=names[0];if(mode==='invalid')names[0]='invalid receiver';if(mode==='global')names[0]='trace';prototype.mutation.argumentnames=JSON.stringify(names);assert.match(projectToArcade(project).unsupported.join('\n'),/does not match its declaration|distinct ownership/);}
 }finally{run.vm.quit();clearStrayTimers();}
});

test('selected original refuses inherited accessor/method conflicts in both directions',async()=>{
 const {compile}=await import('../scripts/lib/pxt-node.mjs');
 for(const source of [
  'class Base {get value():number{return 1}}class Child extends Base {value(){return 2}}let child=new Child();',
  'class Base {value(){return 1}}class Child extends Base {get value():number{return 2}}let child=new Child();',
  'class Base {value(){return 1}}class Child extends Base {value:number}let child=new Child();'
 ]){const original=await compile('arcade',{'main.ts':source,'pxt.json':JSON.stringify({name:'accessor-method-conflict',dependencies:{device:'*'},files:['main.ts']})});assert.equal(original.success,false);assert.ok(original.diagnostics.length);assert.match(JSON.stringify(original.diagnostics),/value/);assert.match(arcadeToPseudocode(source).unsupported.join('\n'),/conflicts with.*method|conflicts with class method/);}
});

test('lazy heap and editable export refuse inherited field/accessor versus method slots',async()=>{
 const {EventEmitter}=await import('node:events'),{default:createHeap}=await import('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/object-heap.js');
 for(const getterInChild of [false,true]){const runtime=new EventEmitter(),heap=createHeap(runtime,BW),plain={fields:[],parameters:[],initializer:'',constructor:'',methods:[]};
  try{const getter={name:'value',type:'number',readonly:true,getter:'getter %s'},method={name:'value',procedure:'method %s',parameters:[],returnType:'number'};heap.register({...plain,name:'Base',fields:getterInChild?[]:[getter],methods:getterInChild?[method]:[]});heap.register({...plain,name:'Child',parent:'Base',fields:getterInChild?[getter]:[],methods:getterInChild?[]:[method]});assert.throws(()=>heap.allocate('Child'),/field\/accessor conflicts with a method/);}finally{heap.dispose();}}
 const imported=arcadeToPseudocode(cases['inherited-getter-no-super']),run=await runProgram(imported.code,{frames:0});
 try{const project=structuredClone(run.creator.project),target=project.targets.find(t=>Object.values(t.blocks).some(b=>b.opcode==='arcade_declareSubclass')),declaration=Object.values(target.blocks).find(b=>b.opcode==='arcade_declareSubclass'),slot=declaration.inputs.METHODS[1],methods=[{name:'n',procedure:'unowned method %s',parameters:[],returnType:'number',visibility:'public'}];if(Array.isArray(slot))slot[1]=JSON.stringify(methods);else Object.values(target.blocks[slot].fields)[0][0]=JSON.stringify(methods);assert.match(projectToArcade(project).unsupported.join('\n'),/Inherited class field\/accessor conflicts with a method/);}finally{run.vm.quit();clearStrayTimers();}
});
