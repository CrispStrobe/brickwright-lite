import {analyseSourceValueProducers} from './source-value-producers.js';
import {consoleInspectSourceCalls} from './console-inspect-source.js';

export function lowerConsoleInspectValues(program) {
    const qualified=consoleInspectSourceCalls(program),unsupported=[...qualified.diagnostics];
    const analysis=analyseSourceValueProducers(program,{consoleInspection:true,opaqueDeclarationValues:true,unboundIsOpaque:true});
    const fail=message=>{if(!unsupported.includes(message))unsupported.push(message);};
    const domain=(node,allowed)=>{const types=analysis.typesAt(node);return types.size>0&&[...types].every(type=>allowed.includes(type));};
    const rewrite=node=>{
        if(!node||typeof node!=='object')return node;
        if(Array.isArray(node))return node.map(rewrite);
        if(node.type==='Identifier'&&node.name.startsWith('__bwConsoleInspect'))fail('Internal console inspection names are not source bindings');
        if(['FunctionDeclaration','Class','Enum'].includes(node.type)&&node.name?.startsWith('__bwConsoleInspect')||node.type==='Declaration'&&node.decls.some(decl=>decl.name.startsWith('__bwConsoleInspect')))fail('Internal console inspection names are not source bindings');
        if(qualified.calls.includes(node)) {
            if(!qualified.isIntrinsicCall(node)||!domain(node.args[0],['String','Number','Boolean','Null','Undefined'])||node.args.length===2&&!domain(node.args[1],['Number','Undefined'])) {
                fail('console.inspect requires actual primitive VALUE and Number or Undefined LIMIT producers');
            } else return {type:'Call',callee:{type:'Identifier',name:'__bwConsoleInspectValue'},args:[rewrite(node.args[0]),node.args.length===2?rewrite(node.args[1]):{type:'Number',value:20}],bwConsoleInspectIntrinsic:true};
        }
        return Object.fromEntries(Object.entries(node).map(([name,value])=>[name,value&&typeof value==='object'?rewrite(value):value]));
    };
    return {program:rewrite(program),unsupported};
}
