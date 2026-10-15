import {createRequire} from 'node:module';
const guiRequire=createRequire(new URL('../../packages/scratch-gui/package.json',import.meta.url));
const ownerImport="const bwPrimitiveOwner = require('../util/bw-primitive-owner');";
const current='bwPrimitiveOwner.handles(opCached.opcode)';
const prior=[
 "opCached.opcode === 'arcade_createCallable'",
 ...[
  ['arcade_createCallable','arcade_objectField'],
  ['arcade_createCallable','arcade_objectField','arcade_inspectValue'],
  ['arcade_createCallable','arcade_objectField','arcade_inspectValue','arcade_returnValue'],
  ['arcade_createCallable','arcade_objectField','arcade_returnValue','arcade_functionArgument','arcade_setLocal','arcade_setCaptured','arcade_setObjectField'],
  ['arcade_createCallable','arcade_objectField','arcade_returnValue','arcade_functionArgument','arcade_setLocal','arcade_setCaptured','arcade_setObjectField','arcade_inspectValue']
 ].map(ops=>'['+ops.map(op=>"'"+op+"'").join(',')+'].includes(opCached.opcode)')
];
// Parse actual declarations, so comments and strings cannot stand in for
// executable imports, predicates or invocation bodies. This overlay runs after
// installation of the GUI's existing Babel toolchain.
const declarations=source=>{
 const ast=guiRequire('@babel/parser').parse(source,{sourceType:'script'}),found=new Map();
 const visit=(node,parent=null)=>{
  if(!node||typeof node!=='object')return;
  if(node.type==='VariableDeclarator'&&node.id?.type==='Identifier'){
   const rows=found.get(node.id.name)||[];rows.push({node,statement:parent});found.set(node.id.name,rows);
  }
  for(const[key,value]of Object.entries(node))if(!['comments','tokens','loc','extra'].includes(key)){
   if(Array.isArray(value))value.forEach(child=>visit(child,node));else if(value&&typeof value==='object')visit(value,node);
  }
 };
 visit(ast.program);
 return (name,optional=false)=>{
  const rows=found.get(name)||[];if(optional&&!rows.length)return null;
  if(rows.length!==1)throw Error('execute.js actual primitive ownership declaration missing or ambiguous: '+name);
  const row=rows[0];if(row.statement?.type!=='VariableDeclaration'||row.statement.kind!=='const'||row.statement.declarations.length!==1)throw Error('execute.js actual primitive ownership declaration must be a single const: '+name);
  return row;
 };
};
const wrapper=`            bwPrimitiveOwner.invoke(sequencer.runtime, thread, blockContainer, opCached, argValues, blockUtility,
                () => blockFunction(argValues, blockUtility)) : blockFunction(argValues, blockUtility)`;

export function patchPrimitiveOwner(source){
 const actual=declarations(source),imported=actual('BlockUtility'),reported=actual('primitiveReportedValue'),owner=actual('bwPrimitiveOwner',true);
 if(source.slice(imported.node.start,imported.node.end)!=="BlockUtility = require('./block-utility')")throw Error('execute.js actual primitive ownership source anchor differs');
 const init=reported.node.init;
 if(!owner){
  if(source.slice(init.start,init.end)!=='blockFunction(argValues, blockUtility)')throw Error('execute.js actual primitive ownership source anchor differs');
  // Apply descending actual AST ranges; a textual comment cannot receive an
  // import or guard intended for a real declaration.
  const edits=[{start:init.start,end:init.end,text:current+' ?\n'+wrapper},
   {start:imported.statement.end,end:imported.statement.end,text:'\n'+ownerImport}].sort((a,b)=>b.start-a.start);
  for(const edit of edits)source=source.slice(0,edit.start)+edit.text+source.slice(edit.end);
  return source;
 }
 if(source.slice(owner.node.start,owner.node.end)!=="bwPrimitiveOwner = require('../util/bw-primitive-owner')")throw Error('execute.js actual primitive ownership import differs');
 if(init.type!=='ConditionalExpression')throw Error('execute.js unknown primitive ownership marker');
 const marker=source.slice(init.test.start,init.test.end);
 if(![current,...prior].includes(marker))throw Error('execute.js unknown primitive ownership marker');
 if(source.slice(init.start,init.end)!==marker+' ?\n'+wrapper)throw Error('execute.js actual primitive ownership invocation wrapper differs');
 return source.slice(0,init.test.start)+current+source.slice(init.test.end);
}
