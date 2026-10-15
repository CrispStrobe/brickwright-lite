import {staticSdkNamespaceReceivers} from './static-sdk-namespaces.js';

// A bounded Number producer for the ordinary parameter-constraint consumer.
// Every unshadowed info use must stay inside this closed native API surface.
// Namespace/member writes, computed access, extraction and escaping aliases
// invalidate the whole root, including writes in later or unused functions.
export function ordinaryPrimitiveSdkNumberCalls(program) {
    const sdk=staticSdkNamespaceReceivers(program),candidates=[],allowed=new Set([
        'score','setScore','changeScoreBy','startCountdown','onCountdownEnd','onScore','showScore'
    ]);
    let unsafe=false;
    const visit=(node,parent=null,grandparent=null)=>{
        if(!node||typeof node!=='object')return;
        if(Array.isArray(node)){for(const value of node)visit(value,parent,grandparent);return;}
        if(node.type==='Identifier'&&node.name==='info'&&sdk.has(node)){
            const member=parent?.type==='Member'&&parent.object===node?parent:null;
            const call=grandparent?.type==='Call'&&grandparent.callee===member?grandparent:null;
            if(!call||call.isNew||call.typeArguments?.length||!allowed.has(member.name))unsafe=true;
            else if(member.name==='score'&&call.args.length===0)candidates.push(call);
        }
        for(const value of Object.values(node))if(value&&typeof value==='object')visit(value,node,parent);
    };
    visit(program);
    return new WeakSet(unsafe?[]:candidates);
}
