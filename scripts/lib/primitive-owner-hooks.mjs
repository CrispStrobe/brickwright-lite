import {createRequire} from 'node:module';
const guiRequire=createRequire(new URL('../../packages/scratch-gui/package.json',import.meta.url));
const importAnchor="const BlockUtility = require('./block-utility');";
const ownerImport="const bwPrimitiveOwner = require('../util/bw-primitive-owner');";
const direct='        const primitiveReportedValue = blockFunction(argValues, blockUtility);';
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
const count=(source,value)=>source.split(value).length-1;
// Parse the actual code, so comments and strings cannot stand in for the
// guarded invocation. The parser comes from the already installed GUI Babel
// toolchain; this overlay runs after that dependency installation.
const declaration=(source,name)=>{
 const ast=guiRequire('@babel/parser').parse(source,{sourceType:'script'}),found=[];
 const visit=node=>{
  if(!node||typeof node!=='object')return;
  if(node.type==='VariableDeclarator'&&node.id?.type==='Identifier'&&node.id.name===name)found.push(node);
  for(const[key,value]of Object.entries(node))if(!['comments','tokens','loc','extra'].includes(key)){
   if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);
  }
 };
 visit(ast.program);if(found.length!==1)throw Error('execute.js actual primitive ownership declaration missing or ambiguous: '+name);
 return found[0];
};
const wrapper=`            bwPrimitiveOwner.invoke(sequencer.runtime, thread, blockContainer, opCached, argValues, blockUtility,
                () => blockFunction(argValues, blockUtility)) : blockFunction(argValues, blockUtility)`;

export function patchPrimitiveOwner(source){
 if(!source.includes(ownerImport)){
  if(count(source,importAnchor)!==1||count(source,direct)!==1||source.includes('bwPrimitiveOwner'))throw Error('execute.js primitive ownership import/call anchor missing or ambiguous');
  const imported=declaration(source,'BlockUtility'),reported=declaration(source,'primitiveReportedValue');
  if(source.slice(imported.start,imported.end)!=="BlockUtility = require('./block-utility')"||source.slice(reported.init.start,reported.init.end)!=='blockFunction(argValues, blockUtility)')throw Error('execute.js actual primitive ownership source anchor differs');
  return source.replace(importAnchor,importAnchor+'\n'+ownerImport).replace(direct,`        const primitiveReportedValue = ${current} ?
            bwPrimitiveOwner.invoke(sequencer.runtime, thread, blockContainer, opCached, argValues, blockUtility,
                () => blockFunction(argValues, blockUtility)) : blockFunction(argValues, blockUtility);`);
 }
 if(count(source,ownerImport)!==1||count(source,'bwPrimitiveOwner.invoke(')!==1)throw Error('execute.js primitive ownership marker missing or ambiguous');
 const markers=[current,...prior].filter(marker=>source.includes('const primitiveReportedValue = '+marker+' ?'));
 if(markers.length!==1||count(source,'const primitiveReportedValue = '+markers[0]+' ?')!==1)throw Error('execute.js unknown primitive ownership marker');
 const imported=declaration(source,'bwPrimitiveOwner'),reported=declaration(source,'primitiveReportedValue');
 if(source.slice(imported.start,imported.end)!=="bwPrimitiveOwner = require('../util/bw-primitive-owner')"||source.slice(reported.init.start,reported.init.end)!==markers[0]+' ?\n'+wrapper)throw Error('execute.js actual primitive ownership invocation wrapper differs');
 return source.replace('const primitiveReportedValue = '+markers[0]+' ?','const primitiveReportedValue = '+current+' ?');
}
