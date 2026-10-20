// The selected PXT Number_.toString implementation is x + "". Admission uses
// actual lexical producers and all writers supplied by the source value graph;
// declarations and apparent member names do not establish a Number receiver.
export function lowerNumberTextValue(node, producerTypes) {
    if(node?.type!=='Call'||node.callee?.type!=='Member'||node.callee.name!=='toString')return null;
    const types=producerTypes(node.callee.object);
    if(types?.size!==1||!types.has('Number'))return null;
    if(node.isNew||node.args.length)return {unsupported:'Primitive Number toString requires its zero-argument selected signature'};
    return {value:{type:'Binary',op:'+',left:node.callee.object,right:{type:'String',value:''},bwPrimitiveNumberText:true}};
}

