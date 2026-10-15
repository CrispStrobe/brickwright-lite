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
export function patchPrimitiveOwner(source){
 if(!source.includes(ownerImport)){
  if(count(source,importAnchor)!==1||count(source,direct)!==1||source.includes('bwPrimitiveOwner'))throw Error('execute.js primitive ownership import/call anchor missing or ambiguous');
  return source.replace(importAnchor,importAnchor+'\n'+ownerImport).replace(direct,`        const primitiveReportedValue = ${current} ?
            bwPrimitiveOwner.invoke(sequencer.runtime, thread, blockContainer, opCached, argValues, blockUtility,
                () => blockFunction(argValues, blockUtility)) : blockFunction(argValues, blockUtility);`);
 }
 if(count(source,ownerImport)!==1||count(source,'bwPrimitiveOwner.invoke(')!==1)throw Error('execute.js primitive ownership marker missing or ambiguous');
 const markers=[current,...prior].filter(marker=>source.includes('const primitiveReportedValue = '+marker+' ?'));
 if(markers.length!==1||count(source,'const primitiveReportedValue = '+markers[0]+' ?')!==1)throw Error('execute.js unknown primitive ownership marker');
 return source.replace('const primitiveReportedValue = '+markers[0]+' ?','const primitiveReportedValue = '+current+' ?');
}
