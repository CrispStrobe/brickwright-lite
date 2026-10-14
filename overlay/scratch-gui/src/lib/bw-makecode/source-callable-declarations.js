import {analyseCallableFlow} from './callable-flow.js';

// Source signature authority remains separate from reference/scalar inventory.
// Only concrete source callable targets can authorize a callable declaration.
export function sourceCallableDeclarations(program) {
    const flow=analyseCallableFlow(program),declarations=[],unsupported=[];
    const same=(a,b)=>a?.kind===b?.kind && (a.kind==='named'?a.name===b.name:
        a.kind==='array'?same(a.element,b.element):a.parameters.length===b.parameters.length &&
            a.parameters.every((parameter,index)=>parameter.optional===b.parameters[index].optional &&
                same(parameter.type,b.parameters[index].type)) && same(a.result,b.result));
    for(const [name,binding]of flow.lexical.global.names) {
        const signature=flow.bindingTypes.get(binding);
        if(signature?.kind!=='callable' || binding.kind==='function')continue;
        const targets=flow.bindingTargets.get(binding);
        if(!targets?.size || [...targets].some(target=>!same(signature,flow.signature(flow.profiles.get(target))))) {
            unsupported.push(`Source callable ${name} requires matching concrete source target signatures`);
            continue;
        }
        declarations.push({name,signature:structuredClone(signature)});
    }
    return {declarations,unsupported};
}
