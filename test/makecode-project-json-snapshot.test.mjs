import test from 'node:test';
import assert from 'node:assert/strict';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {createProjectJsonSnapshot,isProjectJsonSnapshot} from '../overlay/scratch-gui/src/lib/bw-makecode/project-json-snapshot.js';
import {projectToArcade,projectJsonToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {createArrayReferenceExportAuthority} from '../overlay/scratch-gui/src/lib/bw-makecode/array-reference-export-authority.js';
const allFrozen=root=>{
 const pending=[root];while(pending.length){const value=pending.pop();assert.equal(Object.isFrozen(value),true);
  for(const child of Object.values(value))if(child&&typeof child==='object')pending.push(child);
 }
};
const creator=()=>{const c=new Creator();c.parse('DEVICE ARCADE\nGLOBAL value\nSPRITE First:\nSPRITE Second:\nSTAGE:\nWHEN arcade source starts:\n  set value to 1\n');assert.deepEqual(c.warnings,[]);return c;};

test('primitive JSON construction freezes every native descendant without enrolling caller objects',()=>{
 const source='{"targets":[],"nested":[{"__proto__":{"safe":true},"values":[1,null,"text"]}]}';
 const root=createProjectJsonSnapshot(source);assert.equal(isProjectJsonSnapshot(root),true);allFrozen(root);
 assert.equal(Object.getPrototypeOf(root.nested[0]),Object.prototype);assert.equal(Object.hasOwn(root.nested[0],'__proto__'),true);
 assert.equal(root.nested[0].__proto__.safe,true);assert.equal(Object.prototype.safe,undefined);
 assert.equal(isProjectJsonSnapshot(JSON.parse(source)),false);assert.equal(isProjectJsonSnapshot(Object.freeze({targets:[]})),false);
 let traps=0;const proxy=new Proxy({},{get(){traps++;throw Error('coercion');},ownKeys(){traps++;throw Error('keys');}});
 for(const value of [proxy,{},[],new String(source),null,undefined,3,true])assert.throws(()=>createProjectJsonSnapshot(value),TypeError);
 assert.equal(traps,0);for(const source of ['null','1','true','[]'])assert.throws(()=>createProjectJsonSnapshot(source),TypeError);
 assert.throws(()=>createProjectJsonSnapshot('{'),SyntaxError);
});

test('parser replacement refuses before invocation and restores genuine fresh construction',()=>{
 const parseDescriptor=Object.getOwnPropertyDescriptor(JSON,'parse'),globalDescriptor=Object.getOwnPropertyDescriptor(globalThis,'JSON');
 let calls=0;
 try{Object.defineProperty(JSON,'parse',{...parseDescriptor,value(){calls++;return {targets:[]};}});
  assert.throws(()=>createProjectJsonSnapshot('{"targets":[]}'),/parser changed/);assert.equal(calls,0);
 }finally{Object.defineProperty(JSON,'parse',parseDescriptor);}
 try{Object.defineProperty(globalThis,'JSON',{...globalDescriptor,value:{parse(){calls++;return {targets:[]};}}});
  assert.throws(()=>createProjectJsonSnapshot('{"targets":[]}'),/parser changed/);assert.equal(calls,0);
 }finally{Object.defineProperty(globalThis,'JSON',globalDescriptor);}
 const root=createProjectJsonSnapshot('{"targets":[]}');allFrozen(root);assert.equal(isProjectJsonSnapshot(root),true);
});

test('private freeze work cannot publish an unfrozen parsed tree through inherited numeric setters',()=>{
 const index=Object.getOwnPropertyDescriptor(Array.prototype,'0'),length=Object.getOwnPropertyDescriptor(Array.prototype,'length');
 let escaped=null,root;
 try{Object.defineProperty(Array.prototype,'0',{configurable:true,set(value){escaped=value;},get(){return undefined;}});
  root=createProjectJsonSnapshot('{"targets":[],"nested":{"values":[{"value":7}]}}');
 }finally{if(index)Object.defineProperty(Array.prototype,'0',index);else delete Array.prototype[0];Object.defineProperty(Array.prototype,'length',length);}
 assert.equal(escaped,null);allFrozen(root);assert.equal(isProjectJsonSnapshot(root),true);
});

test('freeze traversal does not delegate native parsed keys to a replaced Array iterator',()=>{
 const descriptor=Object.getOwnPropertyDescriptor(Array.prototype,Symbol.iterator);let root;
 try{Object.defineProperty(Array.prototype,Symbol.iterator,{...descriptor,value(){return {next(){return {done:true};}};}});
  root=createProjectJsonSnapshot('{"targets":[],"nested":{"values":[{"value":7}]}}');
 }finally{Object.defineProperty(Array.prototype,Symbol.iterator,descriptor);}
 allFrozen(root);assert.equal(isProjectJsonSnapshot(root),true);
});

test('JSON export callbacks see frozen records and exact indices; old AST receiver and arity stay unchanged',()=>{
 const c=creator(),project=c.project,first=project.targets[1],second=project.targets[2];
 second.costumes.push({...second.costumes[0],name:'second frame'});second.currentCostume=1;
 first.costumes[0].assetId=second.costumes[1].assetId='shared-asset';
 const source=JSON.stringify(project),seen=[];
 const options={costumePalette(target,costume,position){
  assert.equal(this,options);assert.equal(arguments.length,3);assert.equal(Object.isFrozen(position),true);allFrozen(target);
  assert.equal(Reflect.set(target,'name','changed'),false);assert.equal(Reflect.set(costume,'assetId','changed'),false);
  assert.throws(()=>{target.blocks.extra={};},TypeError);
  seen.push({name:target.name,assetId:costume.assetId,...position});return null;
 }};
 const exported=projectJsonToArcade(source,options);assert.deepEqual(exported.unsupported,[]);
 assert.ok(seen.some(row=>row.name==='First'&&row.targetIndex===1&&row.costumeIndex===0));
 assert.ok(seen.some(row=>row.name==='Second'&&row.targetIndex===2&&row.costumeIndex===1));
 assert.equal(JSON.stringify(project),source,'caller project and duplicate asset contexts unchanged');
 const directOptions={costumePalette(target,costume){assert.equal(this,directOptions);assert.equal(arguments.length,2);assert.equal(Object.isFrozen(target),false);return null;}};
 projectToArcade(project,directOptions);
 const branded=createProjectJsonSnapshot(source);
 const brandedOptions={snapshotCallbacks:true,costumePalette(target,costume){assert.equal(this,brandedOptions);assert.equal(arguments.length,2,'old public entry stays two-argument even for a branded root or caller hint');allFrozen(target);return null;}};
 projectToArcade(branded,brandedOptions);
 const failure=Object.freeze(new Error('actual callback failure'));
 assert.throws(()=>projectJsonToArcade(source,{costumePalette(){throw failure;}}),error=>error===failure);
});

test('direct AST watcher Proxies cannot borrow frozen JSON ownership or cached Number values',()=>{
 const c=new Creator();c.parse('DEVICE ARCADE\nGLOBAL hero\nGLOBAL masked\nSPRITE Player:\nSTAGE:\nWHEN arcade source starts:\n  set hero to (arcade create template "Player" kind 1 width 8 height 8)\n  set masked to (calculate value (arcade property flags of hero) op "|" with 1)\n');
 assert.deepEqual(c.warnings,[]);const project=c.project,target=project.targets.find(t=>t.isStage),node=Object.values(target.blocks).find(n=>n.opcode==='arcade_spriteProperty');
 const actual=project.monitors[0];let armed=false;
 project.monitors[0]=new Proxy(actual,{getOwnPropertyDescriptor(value,key){const d=Reflect.getOwnPropertyDescriptor(value,key);if(armed&&key==='isDiscrete'){value.mode='slider';value.visible=true;}return d;}});
 const authority=createArrayReferenceExportAuthority(project);armed=true;
 assert.equal(authority.spriteFlagWriters(target,node),null);assert.equal(isProjectJsonSnapshot(project),false);
 assert.throws(()=>createProjectJsonSnapshot(project),TypeError,'no caller-object or Proxy enrollment');
 // A raw empty-array Proxy cannot select the new watcher-iteration path.
 const raw=new Creator();raw.parse('DEVICE ARCADE\nGLOBAL hero\nGLOBAL masked\nSPRITE Player:\nSTAGE:\nWHEN arcade source starts:\n  set hero to (arcade create template "Player" kind 1 width 8 height 8)\n  set masked to (calculate value (arcade property flags of hero) op "|" with 1)\n');
 const rawTarget=raw.project.targets.find(t=>t.isStage),rawNode=Object.values(rawTarget.blocks).find(n=>n.opcode==='arcade_spriteProperty');
 let iterations=0;const realRows=raw.project.monitors,rawJson=JSON.stringify(raw.project);
 raw.project.monitors=new Proxy([],{get(value,key,receiver){if(key===Symbol.iterator)return function*(){iterations++;yield*realRows;};return Reflect.get(value,key,receiver);}});
 createArrayReferenceExportAuthority(raw.project).spriteFlagWriters(rawTarget,rawNode);
 assert.equal(iterations,0,'old empty-AST path never iterates or admits unowned watcher records');assert.equal(isProjectJsonSnapshot(raw.project),false);
 // Replacing the shared iterator cannot inject an external watcher into a
 // branded root. Only own indexed native frozen array edges are consumed.
 const owned=createProjectJsonSnapshot(rawJson),ownedTarget=owned.targets.find(t=>t.isStage),ownedNode=Object.values(ownedTarget.blocks).find(n=>n.opcode==='arcade_spriteProperty');
 const ownedAuthority=createArrayReferenceExportAuthority(owned),iterator=Object.getOwnPropertyDescriptor(Array.prototype,Symbol.iterator);
 let injected=0,ownedRows;
 try{Object.defineProperty(Array.prototype,Symbol.iterator,{...iterator,value:function(){if(this===owned.monitors){injected++;return [actual][Symbol.iterator]();}return iterator.value.call(this);}});
  ownedRows=ownedAuthority.spriteFlagWriters(ownedTarget,ownedNode);
 }finally{Object.defineProperty(Array.prototype,Symbol.iterator,iterator);}
 assert.ok(ownedRows);assert.equal(injected,0);
 const noMonitors=JSON.parse(rawJson);delete noMonitors.monitors;
 const ownRoot=createProjectJsonSnapshot(JSON.stringify(noMonitors)),ownTarget=ownRoot.targets.find(t=>t.isStage),ownNode=Object.values(ownTarget.blocks).find(n=>n.opcode==='arcade_spriteProperty');
 const prototype=Object.getOwnPropertyDescriptor(Object.prototype,'monitors');let inheritedRows;
 try{Object.defineProperty(Object.prototype,'monitors',{configurable:true,value:[actual]});inheritedRows=createArrayReferenceExportAuthority(ownRoot).spriteFlagWriters(ownTarget,ownNode);}
 finally{if(prototype)Object.defineProperty(Object.prototype,'monitors',prototype);else delete Object.prototype.monitors;}
 assert.equal(inheritedRows,null,'a root brand never enrolls inherited monitor children');
 const snapshot=createProjectJsonSnapshot(JSON.stringify({targets:[],monitors:[]}));assert.equal(isProjectJsonSnapshot(snapshot),true);
 assert.equal(isProjectJsonSnapshot({...snapshot,monitors:project.monitors}),false,'borrowing a root shape cannot borrow origin');
});
