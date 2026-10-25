import test from 'node:test';
import assert from 'node:assert/strict';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectJsonToArcade,projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {createProjectJsonSnapshot} from '../overlay/scratch-gui/src/lib/bw-makecode/project-json-snapshot.js';
import {createProjectFrameDeltaNumber,currentFrameDeltaReporter} from '../overlay/scratch-gui/src/lib/bw-makecode/project-frame-delta-number.js';
const fixture=()=>({targets:[{isStage:true,name:'Stage',blocks:{
 root:{opcode:'data_setvariableto',parent:null,topLevel:true,shadow:false,next:null,fields:{VARIABLE:['n','n']},inputs:{VALUE:[3,'frame',[4,'0']]}},
 frame:{opcode:'arcade_frameDeltaTime',parent:'root',topLevel:false,shadow:false,next:null,fields:{},inputs:{}}
 }}]});
const inspect=input=>{const p=createProjectJsonSnapshot(JSON.stringify(input)),t=p.targets[0],n=t.blocks.frame;return {p,t,n,proof:createProjectFrameDeltaNumber(p)};};
const create=source=>{const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);const c=new Creator();c.parse(imported.code);assert.deepEqual(c.errors,[]);assert.deepEqual(c.warnings,[]);return c;};
test('a canonical physical saved frame reporter supplies its own Number result',()=>{
 for(const input of [[2,'frame'],[3,'frame',[4,'0']],[3,'frame',[10,'']]]){
  const p=fixture();p.targets[0].blocks.root.inputs.VALUE=input;const {t,n,proof}=inspect(p);assert.equal(proof.isNumberResult(t,n),true);assert.equal(proof.isNumberResult(t,{...n}),false);assert.equal(proof.isNumberResult({...t},n),false);
 }
});
test('canonical fallback shadow ownership is verified separately from the actual frame result',()=>{
 const p=fixture(),b=p.targets[0].blocks;b.root.inputs.VALUE=[3,'frame','fallback'];b.fallback={opcode:'math_number',parent:'root',topLevel:false,shadow:true,next:null,fields:{NUM:['0',null]},inputs:{}};
 let q=inspect(p);assert.equal(q.proof.isNumberResult(q.t,q.n),true);
 b.root.inputs.OTHER=[1,'fallback'];q=inspect(p);assert.equal(q.proof.isNumberResult(q.t,q.n),false);
});
test('invalid reporter and physical socket schemas cannot issue a Number result',()=>{
 const edits=[b=>b.frame.fields.EXTRA=['x',null],b=>b.frame.inputs.EXTRA=[1,[4,'0']],b=>b.frame.fields=[],b=>b.frame.inputs=[],
  b=>b.frame.mutation={},b=>b.frame.next='root',b=>b.frame.shadow=true,b=>b.frame.parent=null,b=>b.frame.topLevel=true,
  b=>b.root.inputs.VALUE=[1,'frame'],b=>b.root.inputs.VALUE=[999,'frame'],b=>b.root.inputs.VALUE=[2,'frame',[4,'0']],
  b=>b.root.inputs.VALUE=[3,'frame'],b=>b.root.inputs.VALUE=[3,'frame',[12,'n','n']],b=>b.root.inputs.VALUE=[3,'frame','missing'],
  b=>b.root.inputs.OTHER=[2,'frame'],b=>{b.root.inputs={};b.root.next='frame';},b=>{b.root.parent='frame';b.root.topLevel=false;},
  b=>b.frame.opcode='arcade_sceneMillis'];
 for(const edit of edits){const p=fixture();edit(p.targets[0].blocks);const {t,n,proof}=inspect(p);assert.equal(proof.isNumberResult(t,n),false,String(edit));}
});
test('legacy live expression validation does not manufacture an immutable saved-project proof',()=>{
 const p=fixture(),t=p.targets[0],n=t.blocks.frame;assert.equal(currentFrameDeltaReporter(t.blocks,n),true);assert.equal(createProjectFrameDeltaNumber(p).isNumberResult(t,n),false);
 const c=create('let seen=game.eventContext().deltaTime;');const out=projectToArcade(c.project);assert.deepEqual(out.unsupported,[]);assert.match(out.ts,/game\.eventContext\(\)\.deltaTime/);
});
test('malformed actual saved frame reporters are named even without a Number formal',()=>{
 const c=create('let seen=game.eventContext().deltaTime;');
 for(const mode of ['field','input','socket']){
  const p=JSON.parse(JSON.stringify(c.project)),t=p.targets.find(t=>Object.values(t.blocks).some(n=>n.opcode==='arcade_frameDeltaTime')),n=Object.values(t.blocks).find(n=>n.opcode==='arcade_frameDeltaTime');
  if(mode==='field')n.fields.EXTRA=['x',null];if(mode==='input')n.inputs.EXTRA=[1,[4,'0']];if(mode==='socket'){const parent=t.blocks[n.parent],entry=Object.values(parent.inputs).find(slot=>slot[1]===Object.keys(t.blocks).find(id=>t.blocks[id]===n));entry[0]=999;}
  const out=projectJsonToArcade(JSON.stringify(p));assert.ok(out.unsupported.some(message=>/Frame delta Number:/.test(message)),JSON.stringify(out.unsupported));
 }
});
test('ambient changes invalidate the saved frame result and never revive it',()=>{
 const q=inspect(fixture()),original=Object.getOwnPropertyDescriptor(Map.prototype,'get');assert.equal(q.proof.isNumberResult(q.t,q.n),true);
 try{Object.defineProperty(Map.prototype,'get',{...original,value:function(){return undefined;}});assert.equal(q.proof.current(),false);assert.equal(q.proof.isNumberResult(q.t,q.n),false);}finally{Object.defineProperty(Map.prototype,'get',original);}
 assert.equal(q.proof.current(),false);
});

test('a fresh proof cannot treat an inert denied environment as an issued current one',()=>{
 const p=createProjectJsonSnapshot(JSON.stringify(fixture())),t=p.targets[0],n=t.blocks.frame,original=Object.getOwnPropertyDescriptor(Number,'isFinite');
 try{Object.defineProperty(Number,'isFinite',{...original,value:()=>true});assert.equal(createProjectFrameDeltaNumber(p).isNumberResult(t,n),false);}finally{Object.defineProperty(Number,'isFinite',original);}
});
