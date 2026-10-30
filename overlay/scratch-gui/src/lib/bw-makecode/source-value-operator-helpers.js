import {GENERATED_HELPER_PROFILES,inspectGeneratedHelperBindings,mapGeneratedSourceArray} from './generated-helper-recognition.js';

export const SOURCE_BINARY_OPERATORS=Object.freeze(['+','-','*','/','%','**','&','|','^','<<','>>','>>>']);
const names={'+':'Add','-':'Subtract','*':'Multiply','/':'Divide','%':'Remainder','**':'Power','&':'BitAnd','|':'BitOr','^':'BitXor','<<':'ShiftLeft','>>':'ShiftRight','>>>':'UnsignedShiftRight'};

// A source operation has its actual fixed selector, never a connected reporter.
// The result signature does not provide an input/body/Number conversion loan.
export function sourceValueOperation(block) {
    const unary=block?.opcode==='arcade_sourceValueUnary';
    if(!unary&&block?.opcode!=='arcade_sourceValueBinary')return null;
    const selector=block.fields?.OP;
    if(!Array.isArray(selector)||selector.length!==2||selector[1]!==null||block.inputs?.OP)return null;
    const op=selector[0];
    if(unary?op!=='~':!SOURCE_BINARY_OPERATORS.includes(op))return null;
    const inputs=unary?['VALUE']:['LEFT','RIGHT'];
    if(Object.keys(block.fields||{}).join(',')!=='OP'||Object.keys(block.inputs||{}).length!==inputs.length||
        inputs.some(name=>!Object.hasOwn(block.inputs,name)))return null;
    return {op,unary,inputs,result:op==='+'?null:'Number'};
}

// Exported source helpers are recognized by their COMPLETE body, unique root
// binding, own parameter references and every actual call. A helper spelling
// or declared result/parameter type cannot grant source-operation authority.
export function lowerSourceValueOperatorHelpers(program,profile=GENERATED_HELPER_PROFILES.ordinary) {
    const proof=inspectGeneratedHelperBindings(program,profile),selected=new Map();
    if(!proof.isCurrent())return program;
    const within=(node,fn)=>{for(let current=node;current;current=proof.parentOf(current))if(current===fn)return true;return false;};
    for(const fn of program.body||[]){
        if(fn?.type!=='FunctionDeclaration'||fn.body?.length!==1||fn.body[0]?.type!=='Return')continue;
        const value=fn.body[0].value,unary=value?.type==='Unary'&&value.op==='~';
        if(!unary&&(value?.type!=='Binary'||!SOURCE_BINARY_OPERATORS.includes(value.op)))continue;
        const op=value.op,canonical='__bwSource'+(unary?'UnaryBitNot':'Binary'+names[op]);
        const source=unary?`function ${canonical}(value: any): number { return ~value }`:
            `function ${canonical}(left: any, right: any): ${op==='+'?'any':'number'} { return left ${op} right }`;
        if(!proof.root(fn)||!proof.matches(fn,source,new Map([[fn.name,canonical]])))continue;
        const local=proof.nodes.every(node=>node.type!=='Identifier'||!within(node,fn)||within(proof.declarationAt(node),fn));
        const calls=proof.calls(fn,[unary?1:2],new Set([fn]));
        if(local&&calls?.length)selected.set(fn,{op,unary,calls});
    }
    if(!selected.size||!proof.isCurrent())return program;
    const calls=new Map();for(const record of selected.values())for(const call of record.calls)calls.set(call,record);
    const rewrite=node=>{
        if(!node||typeof node!=='object')return node;
        if(Array.isArray(node))return mapGeneratedSourceArray(node,rewrite);
        const record=calls.get(node);
        if(record){const args=node.args.map(rewrite);return record.unary?{type:'Unary',op:record.op,argument:args[0]}:
            {type:'Binary',op:record.op,left:args[0],right:args[1]};}
        return Object.fromEntries(Object.entries(node).map(([key,value])=>[key,rewrite(value)]));
    };
    const result=rewrite({...program,body:program.body.filter(node=>!selected.has(node))});
    return proof.isCurrent()?result:program;
}
