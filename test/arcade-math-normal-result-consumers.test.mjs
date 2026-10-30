import test from 'node:test';
import assert from 'node:assert/strict';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectJsonToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {createProjectJsonSnapshot} from '../overlay/scratch-gui/src/lib/bw-makecode/project-json-snapshot.js';
import {createProjectMathNormalResults} from '../overlay/scratch-gui/src/lib/bw-makecode/project-math-normal-results.js';
const create=source=>{const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);const c=new Creator();c.parse(imported.code);assert.deepEqual(c.errors,[]);assert.deepEqual(c.warnings,[]);return c;};
const fixture=()=>({targets:[{isStage:true,name:'Stage',blocks:{
 root:{opcode:'data_setvariableto',parent:null,topLevel:true,shadow:false,next:null,fields:{VARIABLE:['result','result']},inputs:{VALUE:[2,'math']}},
 math:{opcode:'arcade_mathBinary',parent:'root',topLevel:false,shadow:false,next:null,fields:{OP:['randomRange',null]},inputs:{A:[1,[4,'2']],B:[1,[4,'4']]}}
 }}]});
const query=project=>{const p=createProjectJsonSnapshot(JSON.stringify(project)),t=p.targets[0];return {p,t,n:t.blocks.math,proof:createProjectMathNormalResults(p)};};
test('canonical fixed math selectors with actual numeric operands have Number normal results',()=>{
 for(const op of ['min','max','atan2','randomRange'])for(const field of [[op],[op,null]]){const p=fixture();p.targets[0].blocks.math.fields.OP=field;const {t,n,proof}=query(p);assert.equal(proof.isNumberResult(t,n),true);assert.equal(proof.isNumberResult(t,{...n}),false);assert.equal(proof.isNumberResult({...t},n),false);}
});
test('the actual numeric result survives constrained callers, Code and two JSON generations',()=>{
 for(const operation of ['min','max','atan2','randomRange']){
  let creator=create(`let result=0;function take(n:number){result=n;}take(Math.${operation}(2+1,4));`);
  const code=new Creator();code.parse(creator.decompile());assert.deepEqual(code.errors,[]);assert.deepEqual(code.warnings,[]);creator=code;
  for(let i=0;i<2;i++){const exported=projectJsonToArcade(JSON.stringify(creator.project));assert.deepEqual(exported.unsupported,[],operation);assert.match(exported.ts,/function (?:Game_)+take/);creator=create(exported.files);}
 }
});
test('result facts require exact selector, operand, shadow, schema and physical ownership',()=>{
 const edits=[
  b=>b.math.fields.OP=['unknown',null],b=>b.math.fields.OP=['min','foreign'],
  b=>b.math.inputs.EXTRA=[1,[4,'3']],b=>b.math.inputs.A=[1,[10,'2']],
  b=>b.math.inputs.A=[1,[4,'not a number']],b=>b.math.inputs.A=[2,[4,'2']],
  b=>b.math.inputs.A=[3,[4,'2'],[10,'fallback']],b=>b.math.parent=null,
  b=>b.math.shadow=true,b=>b.math.next='root',b=>b.math.mutation={},
  b=>b.root.inputs.OTHER=[2,'math'],
  b=>b.root.inputs.VALUE=[999,'math'],b=>b.root.inputs.VALUE=[2,'math',[4,'0']],
  b=>b.root.inputs.VALUE=[3,'math'],b=>b.root.inputs.VALUE=[3,'math',[12,'n','n']],
  b=>{b.root.inputs.VALUE=[1,'math'];b.math.shadow=true;},b=>{b.root.inputs={};b.root.next='math';},
  b=>{b.math.inputs.A=[2,'read'];b.read={opcode:'data_variable',parent:'math',topLevel:false,shadow:false,next:null,inputs:{},fields:{VARIABLE:['n','n']}};}
 ];
 for(const edit of edits){const p=fixture();edit(p.targets[0].blocks);const {t,n,proof}=query(p);assert.equal(proof.isNumberResult(t,n),false,String(edit));}
});
test('actual recursive numeric arithmetic is accepted, malformed fallback and cyclic trees are refused',()=>{
 const p=fixture(),b=p.targets[0].blocks;b.math.inputs.A=[3,'sum',[4,'0']];b.sum={opcode:'operator_add',parent:'math',topLevel:false,shadow:false,next:null,fields:{},inputs:{NUM1:[1,[4,'1']],NUM2:[1,[4,'2']]}};
 let q=query(p);assert.equal(q.proof.isNumberResult(q.t,q.n),true);
 b.math.inputs.A[2]=[10,'0'];q=query(p);assert.equal(q.proof.isNumberResult(q.t,q.n),false);
 b.math.inputs.A=[2,'sum'];b.sum.inputs.NUM1=[2,'sum'];q=query(p);assert.equal(q.proof.isNumberResult(q.t,q.n),false);
});
test('live objects and JSON clones cannot enroll; ambient invalidation is sticky',()=>{
 const p=fixture();let t=p.targets[0];assert.equal(createProjectMathNormalResults(p).isNumberResult(t,t.blocks.math),false);
 const q=query(p),prior=Object.getOwnPropertyDescriptor(Number,'isFinite');
 try{Object.defineProperty(Number,'isFinite',{...prior,value:()=>true});assert.equal(q.proof.current(),false);assert.equal(q.proof.isNumberResult(q.t,q.n),false);}finally{Object.defineProperty(Number,'isFinite',prior);}
 assert.equal(q.proof.current(),false);
});
test('editing the actual math reporter to a connected String cannot borrow a formal Number annotation',()=>{
 const creator=create('let result=0;function take(n:number){result=n;}take(Math.min(2,4));');
 const project=JSON.parse(JSON.stringify(creator.project));let math,target;
 for(const t of project.targets)for(const node of Object.values(t.blocks))if(node.opcode==='arcade_mathBinary'){math=node;target=t;}
 assert.ok(math);const id=Object.keys(target.blocks).find(id=>target.blocks[id]===math);
 const old=math.inputs.A[1];if(typeof old==='string')delete target.blocks[old];
 math.inputs.A=[2,'connectedText'];target.blocks.connectedText={opcode:'operator_join',parent:id,topLevel:false,shadow:false,next:null,inputs:{STRING1:[1,[10,'2']],STRING2:[1,[10,'']]},fields:{}};
 const exported=projectJsonToArcade(JSON.stringify(project));
 assert.ok(exported.unsupported.some(message=>/requires Number|actual.*producer/.test(message)),JSON.stringify(exported.unsupported));
});


test('a connected Undefined math operand cannot acquire a Number from its selector',()=>{
 for(const operation of ['min','max','randomRange']){
  const creator=create(`let result=0;function take(n:number){result=n;}take(Math.${operation}(2,4));`);
  const project=JSON.parse(JSON.stringify(creator.project));
  for(const target of project.targets)for(const [id,node]of Object.entries(target.blocks))if(node.opcode==='arcade_mathBinary'){
   const old=node.inputs.A[1];if(typeof old==='string')delete target.blocks[old];
   node.inputs.A=[2,'undefinedOperand'];target.blocks.undefinedOperand={opcode:'arrays_specialValue',parent:id,topLevel:false,shadow:false,next:null,fields:{KIND:['undefined',null]},inputs:{}};
  }
  const exported=projectJsonToArcade(JSON.stringify(project));
  assert.ok(exported.unsupported.some(message=>/requires Number|actual.*producer/.test(message)),operation+JSON.stringify(exported.unsupported));
 }
});
