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

// The original seven-call census remains independent. This additional profile
// is selected only by the ordinary primitive constraint consumer whose native
// score implementation and fixed-player result ownership are checked separately.
// A source candidate is never a certificate for a cached native Number result.
export function ordinaryPlayerScoreNumberCalls(program, safeIndex = () => false) {
    const sdk=staticSdkNamespaceReceivers(program),candidates=[];
    const rootArities=new Map([['score',0],['setScore',1],['changeScoreBy',1],
        ['startCountdown',1],['onCountdownEnd',1],['onScore',2],['showScore',1]]);
    const playerArities=new Map([['score',0],['setScore',1],['changeScoreBy',1]]);
    const players=new Set(['player1','player2','player3','player4']);
    let unsafe=false,hasPlayerAccess=false;
    const classThis=ancestors=>{
        const owner=[...ancestors].reverse().find(node=>node.type==='Class');
        if(!owner)return false;
        const at=ancestors.indexOf(owner),member=ancestors[at+1];
        if(!member||member.isStatic||!(member===owner.ctor||owner.methods?.includes(member)||owner.fields?.includes(member)))return false;
        return ancestors.slice(at+2).every(node=>node.type!=='FunctionDeclaration'&&
            (node.type!=='FunctionExpression'||node.functionKind==='arrow'));
    };
    const visit=(node,parent=null,grandparent=null,ancestors=[])=>{
        if(!node||typeof node!=='object')return;
        if(Array.isArray(node)){for(const value of node)visit(value,parent,grandparent,ancestors);return;}
        if(node.type==='Unknown'||node.type==='Identifier'&&
            (['globalThis','global','window','self','eval','Function','Reflect','arguments'].includes(node.name)||
                node.name==='this'&&!classThis(ancestors))||
            node.type==='Member'&&node.name==='constructor'||node.type==='Index'&&!safeIndex(node))unsafe=true;
        if(node.type==='Identifier'&&node.name==='info'&&sdk.has(node)){
            const receiver=parent?.type==='Member'&&parent.object===node?parent:null;
            const selected=players.has(receiver?.name);
            if(selected)hasPlayerAccess=true;
            const member=selected&&grandparent?.type==='Member'&&grandparent.object===receiver?grandparent:receiver;
            const call=selected?ancestors.at(-3):grandparent;
            const arities=selected?playerArities:rootArities;
            if(!member||!call||call.type!=='Call'||call.callee!==member||call.isNew||call.constructorCall||
                call.optional||member.optional||receiver.optional||call.typeArguments?.length||
                !arities.has(member.name)||!Array.isArray(call.args)||call.args.length!==arities.get(member.name)||
                call.args.some(arg=>arg?.type==='Spread'))unsafe=true;
            else if(member.name==='score')candidates.push(call);
        }
        for(const value of Object.values(node))if(value&&typeof value==='object')visit(value,node,parent,[...ancestors,node]);
    };
    visit(program);
    // Consumers that do not use the added player surface retain the complete
    // original seven-call policy, including its independently tested limits.
    if(!hasPlayerAccess)return ordinaryPrimitiveSdkNumberCalls(program);
    return new WeakSet(unsafe?[]:candidates);
}
