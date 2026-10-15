import {staticSdkNamespaceReceivers} from './static-sdk-namespaces.js';

// Lexical SDK identity and mutation are separate facts. A namespace alias can
// mutate the original receiver even when a later direct call is unshadowed.
export function consoleInspectSourceCalls(program) {
    const sdk=staticSdkNamespaceReceivers(program),candidates=[],qualified=new WeakSet();
    let unsafe=false;
    const root=node=>node?.type==='Identifier'?node:node?.type==='Member'||node?.type==='Index'?root(node.object):null;
    const consoleRoot=node=>{const value=root(node);return value?.name==='console'&&sdk.has(value);};
    const inspectMember=node=>node?.type==='Member'&&node.name==='inspect'&&node.object?.type==='Identifier'&&consoleRoot(node.object);
    const visit=(node,parent=null)=>{
        if(!node||typeof node!=='object')return;
        if(Array.isArray(node)){node.forEach(value=>visit(value,parent));return;}
        if(node.type==='Namespace'&&String(node.name).split('.')[0]==='console')unsafe=true;
        const written=node.type==='Assignment'?node.left:node.type==='Update'?node.argument:null;
        if(written&&consoleRoot(written)&&(written.type==='Identifier'||written.type==='Index'||inspectMember(written)))unsafe=true;
        if(node.type==='Identifier'&&node.name==='console'&&sdk.has(node) &&
            !((parent?.type==='Member'||parent?.type==='Index')&&parent.object===node))unsafe=true;
        if(inspectMember(node)&&!(parent?.type==='Call'&&parent.callee===node))unsafe=true;
        if(node.type==='Call'&&inspectMember(node.callee))candidates.push(node);
        for(const value of Object.values(node))if(value&&typeof value==='object')visit(value,node);
    };
    visit(program);
    if(!unsafe)for(const call of candidates)if(!call.isNew&&[1,2].includes(call.args?.length))qualified.add(call);
    return Object.freeze({isIntrinsicCall:node=>qualified.has(node),
        calls:Object.freeze([...candidates]),
        diagnostics:Object.freeze(candidates.length&&unsafe?['console.inspect requires its unchanged unaliased SDK binding']:[])});
}
