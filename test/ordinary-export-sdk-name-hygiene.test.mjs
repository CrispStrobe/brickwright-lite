import test from 'node:test';
import assert from 'node:assert/strict';
import {createOrdinaryExportSymbols} from '../overlay/scratch-gui/src/lib/bw-makecode/ordinary-export-symbols.js';
import {createClosedOrdinaryProjectEntry} from '../overlay/scratch-gui/src/lib/bw-makecode/closed-ordinary-project-entry.js';
import {createProjectJsonSnapshot} from '../overlay/scratch-gui/src/lib/bw-makecode/project-json-snapshot.js';
import {SDK_SPRITE_CLASS_NODES,SDK_DIALOG_CLASS_NODES,sdkClassPublicName} from '../overlay/scratch-gui/src/lib/bw-makecode/sdk-class-descriptors.js';

test('a denied symbol plan also reports its SDK dependency as noncurrent',()=>{
 assert.equal(createOrdinaryExportSymbols(null).sdkNamesCurrent(),false);
});

function fixture(code='unused'){
 const blocks={definition:{opcode:'procedures_definition',topLevel:true,shadow:false,parent:null,next:'write',inputs:{custom_block:[1,'prototype']},fields:{}},
  prototype:{opcode:'procedures_prototype',topLevel:false,shadow:true,parent:'definition',next:null,inputs:{},fields:{},mutation:{proccode:code,argumentids:'[]',argumentnames:'[]',argumentdefaults:'[]',warp:'false'}},
  write:{opcode:'data_setvariableto',topLevel:false,shadow:false,parent:'definition',next:null,inputs:{VALUE:[1,[4,'7']]},fields:{VARIABLE:['out','out']}}};
 const target={name:'Stage',isStage:true,variables:{out:['out',0]},lists:{},blocks};
 return {project:{targets:[target],extensions:['arcade'],monitors:[]},target,node:blocks.write,code};
}
const plan=f=>{const notes=[];const symbols=createOrdinaryExportSymbols(f.project,n=>notes.push(n));return {symbols,notes};};
const closed=f=>{const project=createProjectJsonSnapshot(JSON.stringify(f.project));return {proof:createClosedOrdinaryProjectEntry(project),target:project.targets[0],node:project.targets[0].blocks.write};};

test('SDK name hygiene preserves ordinary names and reserves every actual SDK public root',()=>{
 const f=fixture(),q=plan(f);assert.equal(q.symbols.name(f.target,f.code),'unused');assert.deepEqual(q.notes,[]);
 for(const supplier of [SDK_SPRITE_CLASS_NODES,SDK_DIALOG_CLASS_NODES])for(const cls of supplier){
  const name=sdkClassPublicName(cls.name).split('.')[0],collision=fixture(name),found=plan(collision);
  assert.equal(found.symbols.current(),true);assert.notEqual(found.symbols.name(collision.target,name),name);
 }
 const c=closed(f);assert.equal(c.proof.isUnreachable(c.target,c.node),true);
});

test('fresh symbol and ordinary entry construction never reads inherited SDK metadata',()=>{
 const cls=SDK_SPRITE_CLASS_NODES[0],parent=Object.getPrototypeOf(cls),changed=Object.create(parent);let calls=0;
 Object.defineProperty(changed,'base',{get(){calls++;throw Error('inherited SDK metadata read');}});
 try{
  Object.setPrototypeOf(cls,changed);const f=fixture(),q=plan(f);assert.equal(q.symbols.current(),false);assert.equal(q.symbols.name(f.target,f.code),null);
  const c=closed(f);assert.equal(c.proof.isUnreachable(c.target,c.node),false);
 }finally{Object.setPrototypeOf(cls,parent);}
 assert.equal(calls,0);
});

test('name-only hygiene does not materialize irrelevant SDK fields methods constructor or base',()=>{
 const cls=SDK_SPRITE_CLASS_NODES[0];let calls=0;
 for(const key of ['fields','methods','ctor','base']){
  const descriptor=Object.getOwnPropertyDescriptor(cls,key);
  try{
   Object.defineProperty(cls,key,{configurable:true,enumerable:true,get(){calls++;throw Error('irrelevant SDK metadata read');}});
   const f=fixture(),q=plan(f);assert.equal(q.symbols.name(f.target,f.code),'unused');assert.equal(q.symbols.current(),true);
  }finally{if(descriptor)Object.defineProperty(cls,key,descriptor);else delete cls[key];}
 }
 assert.equal(calls,0);
});

test('own accessor or absent SDK names refuse without execution or inherited fallback',()=>{
 const cls=SDK_SPRITE_CLASS_NODES[0],descriptor=Object.getOwnPropertyDescriptor(cls,'name');let calls=0;
 for(const accessor of [true,false])try{
  if(accessor)Object.defineProperty(cls,'name',{configurable:true,get(){calls++;throw Error('SDK name getter read');}});else delete cls.name;
  const f=fixture(),q=plan(f);assert.equal(q.symbols.current(),false);assert.equal(q.symbols.name(f.target,f.code),null);
 }finally{Object.defineProperty(cls,'name',descriptor);}
 assert.equal(calls,0);
});

test('both supplier replacements additions and sparse/accessor slots expire admitted symbol and ordinary entry proofs',()=>{
 for(const supplier of [SDK_SPRITE_CLASS_NODES,SDK_DIALOG_CLASS_NODES])for(const mode of ['replace','append','sparse','accessor']){
  const f=fixture(),q=plan(f),c=closed(f),descriptor=Object.getOwnPropertyDescriptor(supplier,'0'),length=supplier.length;let calls=0;
  assert.equal(c.proof.isUnreachable(c.target,c.node),true);
  try{
   if(mode==='append')supplier.push({...supplier[0],name:'__bwSDK_Added'});
   else if(mode==='replace')supplier[0]={...supplier[0]};
   else if(mode==='sparse')delete supplier[0];
   else Object.defineProperty(supplier,'0',{configurable:true,get(){calls++;throw Error('SDK supplier getter read');}});
   assert.equal(q.symbols.current(),false);assert.equal(q.symbols.name(f.target,f.code),null);
   assert.equal(c.proof.current(),false);assert.equal(c.proof.isUnreachable(c.target,c.node),false);
   if(mode!=='append'&&mode!=='replace')assert.equal(plan(fixture()).symbols.current(),false);
  }finally{Object.defineProperty(supplier,'0',descriptor);supplier.length=length;}
  assert.equal(calls,0);assert.equal(q.symbols.current(),false);assert.equal(c.proof.current(),false);
 }
});

test('SDK name and supplier/class prototype changes permanently expire consumed dependencies',()=>{
 const supplier=SDK_SPRITE_CLASS_NODES,cls=supplier[0];
 for(const mode of ['name','supplier-prototype','class-prototype']){
  const f=fixture(),q=plan(f),c=closed(f),name=Object.getOwnPropertyDescriptor(cls,'name'),object=mode==='supplier-prototype'?supplier:cls,parent=Object.getPrototypeOf(object);
  try{
   if(mode==='name')cls.name='__bwSDK_Changed';else Object.setPrototypeOf(object,Object.create(parent));
   assert.equal(q.symbols.current(),false);assert.equal(c.proof.current(),false);
  }finally{if(mode==='name')Object.defineProperty(cls,'name',name);else Object.setPrototypeOf(object,parent);}
  assert.equal(q.symbols.current(),false);assert.equal(c.proof.isUnreachable(c.target,c.node),false);
 }
});
