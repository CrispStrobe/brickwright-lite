import test from 'node:test';
import assert from 'node:assert/strict';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {createProjectJsonSnapshot} from '../overlay/scratch-gui/src/lib/bw-makecode/project-json-snapshot.js';
import {createArrayReferenceExportAuthority} from '../overlay/scratch-gui/src/lib/bw-makecode/array-reference-export-authority.js';

const source=`function echo(value:any){return value}
function start(){
 let body:any[]=null
 let picture=image.create(2,1)
 picture.fill(5)
 let copy=picture.clone()
 let alias=echo(copy)
 body=[]
 body.push(alias)
 let index=body.indexOf(alias)
}
start()`;
const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
const creator=new Creator();creator.parse(imported.code);assert.deepEqual(creator.warnings,[]);
const baseline=JSON.stringify(creator.project);
const rows=project=>project.targets.flatMap(target=>Object.entries(target.blocks).map(([id,node])=>({target,id,node})));
const literal=(row,name)=>{
 const raw=row.node.inputs?.[name]?.[1];
 return Array.isArray(raw)&&raw[0]===10?raw[1]:row.node.fields?.[name]?.[0];
};
const query=project=>{
 const owned=createProjectJsonSnapshot(JSON.stringify(project));
 const authority=createArrayReferenceExportAuthority(owned);
 const consumers=rows(owned).filter(row=>['arrays_mutateReference','arrays_referenceIndexOf'].includes(row.node.opcode));
 assert.equal(consumers.length,2);
 return {owned,authority,consumers,decisions:consumers.map(row=>authority.validateInput(row.target,row.node))};
};
const fresh=()=>JSON.parse(baseline);
const find= (project,opcode,name)=>rows(project).find(row=>row.node.opcode===opcode&&(name===undefined||literal(row,'NAME')===name));
const overwrite=project=>rows(project).find(row=>row.node.opcode==='arcade_setLocal'&&literal(row,'NAME')==='body'&&row.target.blocks[row.node.inputs.VALUE[1]]?.opcode==='arrays_createReference');
const insertBefore=(row,id,node)=>{
 const previous=row.target.blocks[row.node.parent];assert.equal(previous.next,row.id);
 previous.next=id;row.node.parent=id;
 row.target.blocks[id]={...node,parent:Object.keys(row.target.blocks).find(key=>row.target.blocks[key]===previous),next:row.id,shadow:false,topLevel:false};
};
const refused=edit=>{
 const project=fresh();assert.ok(query(project).decisions.every(row=>row.ok));
 edit(project);
 const decisions=query(project).decisions;
 assert.ok(decisions.some(row=>!row.ok),JSON.stringify(decisions));
};

test('actual private local reset crosses bounded Image effects and one exact identity call',()=>{
 const result=query(fresh());assert.ok(result.decisions.every(row=>row.ok),JSON.stringify(result.decisions));
 assert.deepEqual(query(JSON.parse(baseline)).decisions,result.decisions);
});

test('identity effects require the actual Any declaration and single formal return body',()=>{
 for(const [key,value] of [['PROCEDURE','other'],['PARAMETER','other'],['TYPE','Number']])refused(project=>{
  const row=find(project,'arcade_declareParameterConstraint');assert.ok(row);
  row.node.fields[key][0]=value;
 });
 refused(project=>{
  const row=find(project,'arcade_returnValue');
  insertBefore(row,'__extraIdentityStatement',{opcode:'looks_say',inputs:{MESSAGE:[1,[10,'extra']]},fields:{}});
 });
 refused(project=>{
  const row=find(project,'arcade_returnValue');
  const old=row.node.inputs.VALUE[1];delete row.target.blocks[old];
  row.node.inputs.VALUE=[1,[10,'other']];
 });
 refused(project=>{
  const row=find(project,'arcade_declareParameterConstraint');
  insertBefore(row,'__duplicateConstraint',structuredClone(row.node));
 });
 refused(project=>{
  const row=find(project,'arcade_declareParameterConstraint');
  const definition=row.target.blocks[row.node.parent],prototype=row.target.blocks[definition.inputs.custom_block[1]];
  row.target.blocks.__duplicateIdentityPrototype={...structuredClone(prototype),parent:null};
 });
});

test('early candidate reads and self-read overwrites retain the real null writer',()=>{
 refused(project=>{
  const row=overwrite(project);assert.ok(row);
  row.target.blocks.__earlyRead={opcode:'arcade_getLocal',inputs:{NAME:[1,[10,'body']]},fields:{},parent:'__earlyCopy',next:null,shadow:false,topLevel:false};
  insertBefore(row,'__earlyCopy',{opcode:'arcade_setLocal',inputs:{NAME:[1,[10,'leaked']],VALUE:[3,'__earlyRead',[4,'0']]},fields:{}});
 });
 refused(project=>{
  const row=overwrite(project),old=row.node.inputs.VALUE[1];delete row.target.blocks[old];
  row.target.blocks.__selfRead={opcode:'arcade_getLocal',inputs:{NAME:[1,[10,'body']]},fields:{},parent:row.id,next:null,shadow:false,topLevel:false};
  row.node.inputs.VALUE=[3,'__selfRead',[4,'0']];
 });
 refused(project=>{
  const consumer=find(project,'arrays_mutateReference');
  insertBefore(consumer,'__laterScalar',{opcode:'arcade_setLocal',inputs:{NAME:[1,[10,'body']],VALUE:[1,[10,'not an Array']]},fields:{}});
 });
});

test('opaque coercive dimensions and unsupported Image mutations cannot cross the private prefix',()=>{
 refused(project=>{
  const row=find(project,'arcade_createImage');
  row.target.blocks.__badDimension={opcode:'arcade_getLocal',inputs:{NAME:[1,[10,'body']]},fields:{},parent:row.id,next:null,shadow:false,topLevel:false};
  row.node.inputs.WIDTH=[3,'__badDimension',[4,'0']];
 });
 refused(project=>{find(project,'arcade_mutateImage').node.fields.OP[0]='flipX';});
 refused(project=>{find(project,'arcade_createImage').node.mutation={unproved:true};});
});

test('used private prefix observations expire permanently on inherited frame changes',()=>{
 const result=query(fresh());assert.ok(result.decisions.every(row=>row.ok));
 const property='__bwPrivateImagePrefixInherited';assert.equal(Object.hasOwn(Object.prototype,property),false);
 try{
  Object.defineProperty(Object.prototype,property,{value:1,configurable:true});
  for(const row of result.consumers)assert.equal(result.authority.validateInput(row.target,row.node).ok,false);
 }finally{delete Object.prototype[property];}
 for(const row of result.consumers)assert.equal(result.authority.validateInput(row.target,row.node).ok,false);
 assert.ok(query(fresh()).decisions.every(row=>row.ok));
});
