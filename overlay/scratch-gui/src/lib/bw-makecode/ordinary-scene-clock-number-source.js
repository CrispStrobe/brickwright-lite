import {staticSdkNamespaceReceivers} from './static-sdk-namespaces.js';

// A candidate expression is not a physical result certificate. Keep this game
// census separate from the independently owned, unchanged info producer census.
export function ordinarySceneClockNumberCalls(program, safeIndex = () => false) {
    const sdk=staticSdkNamespaceReceivers(program), candidates=[], nodes=[];
    const arities=new Map([['runtime',0],['currentScene',0],['eventContext',0],
        ['gameOver',1],['setGameOverEffect',2],['setGameOverPlayable',3],['setGameOverScoringType',1]]);
    let unsafe=false;
    const classThis=ancestors=>{
        const owner=[...ancestors].reverse().find(node=>node.type==='Class');if(!owner)return false;
        const at=ancestors.indexOf(owner),member=ancestors[at+1];
        if(!member||member.isStatic||!(member===owner.ctor||owner.methods?.includes(member)||owner.fields?.includes(member)))return false;
        return ancestors.slice(at+2).every(node=>node.type!=='FunctionDeclaration'&&
            (node.type!=='FunctionExpression'||node.functionKind==='arrow'));
    };
    const visit=(node,parent=null,grandparent=null,ancestors=[])=>{
        if(!node||typeof node!=='object')return;
        if(Array.isArray(node)){node.forEach(value=>visit(value,parent,grandparent,ancestors));return;}
        nodes.push(node);
        if(node.type==='Identifier'&&node.name==='this'&&!classThis(ancestors))unsafe=true;
        if(node.type==='Identifier'&&node.name==='game'&&sdk.has(node)) {
            const member=parent?.type==='Member'&&parent.object===node?parent:null;
            const call=grandparent?.type==='Call'&&grandparent.callee===member?grandparent:null;
            const leaf=member?.name==='ScoringType'&&grandparent?.type==='Member'&&grandparent.object===member&&grandparent.name==='LowScore'?grandparent:null;
            if(leaf) {
                // Only the scalar leaf can be read. The root/enum object cannot
                // escape; assignment/update/delete to any part is not readonly.
                if(ancestors.some(owner=>owner.type==='Assignment'&&[node,member,leaf].includes(owner.left)||
                    owner.type==='Update'&&[node,member,leaf].includes(owner.argument)||
                    owner.type==='Unary'&&owner.op==='delete'||
                    ['Member','Index'].includes(owner.type)&&owner.object===leaf))unsafe=true;
            } else if(!call||call.isNew||call.constructorCall||call.typeArguments?.length||
                !arities.has(member.name)||call.args.length!==arities.get(member.name)||call.args.some(arg=>arg?.type==='Spread'))unsafe=true;
            else if(member.name==='runtime')candidates.push(call);
        }
        for(const value of Object.values(node))if(value&&typeof value==='object')visit(value,node,parent,[...ancestors,node]);
    };
    visit(program);
    if(!candidates.length)return new WeakSet();
    // No general host-object effect interpreter: unknown/ambient/dynamic access
    // is deliberately conservative. Numeric Array indexing needs its existing
    // initialized/all-writer/no-escape proof, never a folded constructor key.
    if(nodes.some(node=>node.type==='Unknown'||
        node.type==='Identifier'&&['globalThis','window','self','eval','Function','Reflect','arguments'].includes(node.name)||
        node.type==='Member'&&node.name==='constructor'||node.type==='Index'&&!safeIndex(node)))unsafe=true;
    return new WeakSet(unsafe?[]:candidates);
}
