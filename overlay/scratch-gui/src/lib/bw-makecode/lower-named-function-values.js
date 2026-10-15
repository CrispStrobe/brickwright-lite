import {proveNamedFunctionSource} from './named-function-source.js';
import {validateCallableLexicalPlan} from './callable-lexical-plan.js';
import {renderCallableType} from './callable-type-syntax.js';

// Keep the actual declaration executable. Each value occurrence reads its
// declaration label; no extra Arrow/function-expression body is manufactured.
export function lowerNamedFunctionValues(input) {
    const proof=proveNamedFunctionSource(input);
    if(!proof.eligible)return {program:input,unsupported:proof.unsupported,proof};
    const {program,lexical}=proof,module='named_module',owners=[{id:module,kind:'module',parent:null}],bindings=[],sites=[];
    const infos=new Map(),bindingRows=new Map();
    for(const [node,signature]of proof.signatures) {
        const scope=lexical.scopes.get(node),site='named_site_'+scope.id;
        const info={name:node.name,site,signature,captures:[],defaults:[],functionKind:'declaration'};
        infos.set(node,info);
        const origin=proof.origins.get(node);
        owners.push({id:'named_owner_'+scope.id,kind:'declaration',parent:module,sourceName:node.name,
            procedure:node.name,signature,parameters:[],defaults:[],
            origin:origin?{kind:origin.kind,path:origin.path}:{kind:'module',path:node.name}});
        if(proof.targets.has(node))sites.push({id:site,owner:'named_owner_'+scope.id,createdIn:module,captures:[],defaults:[]});
    }
    const targetFor=binding=>proof.reads.find(row=>row.binding===binding)?.target||
        proof.reads.find(row=>proof.writes.get(binding)?.some(writer=>row.node===writer.value))?.target;
    for(const binding of lexical.bindings) {
        const owner=binding.scope===lexical.global?module:infos.has(binding.scope.node)?'named_owner_'+binding.scope.id:null;
        if(!owner)continue;
        let type;
        const target=binding.kind==='function'?binding.node:targetFor(binding);
        if(infos.has(target))type=infos.get(target).signature;
        else {
            const row=proof.writes.get(binding)?.[0];
            const facts=row?.value?proof.producers.bindingTypesAt(row.value,binding.name):new Set();
            if(facts.size===1) {
                const value=[...facts][0],name={Number:'number',String:'string',Boolean:'boolean',Null:'null',Undefined:'undefined'}[value];
                if(name)type={kind:'named',name};
            }
        }
        if(!type)continue;
        const row={id:'binding_'+binding.id,owner,sourceName:binding.name,
            nativeName:binding.scope===lexical.global?binding.name:binding.cellName,
            kind:binding.kind,...(proof.declarationKinds.has(binding.node)?{declarationKind:proof.declarationKinds.get(binding.node)}:{}),
            type,written:binding.written,...(type.kind==='callable'?{targets:infos.has(target)&&proof.targets.has(target)?[infos.get(target).site]:[]}: {})};bindings.push(row);bindingRows.set(binding,row);
    }
    let plan;
    try{plan=validateCallableLexicalPlan({schema:'bw-callable-lexical',version:3,module,owners,bindings,sites});}
    catch(error){return {program:input,unsupported:[String(error.message)],proof};}
    const id=name=>({type:'Identifier',name}),str=value=>({type:'String',value});
    const intrinsic=(name,args)=>({type:'Call',callee:{type:'Member',object:id('__bwCallables'),name},args,bwCallableIntrinsic:name});
    const occurrences=new WeakMap(proof.reads.map(row=>[row.node,row]));
    const rewrite=(node,callee=false)=>{
        if(!node||typeof node!=='object')return node;
        if(Array.isArray(node))return node.map(value=>rewrite(value));
        if(node.type==='Identifier') {
            const binding=lexical.references.get(node),row=occurrences.get(node),info=row&&infos.get(row.target);
            if(info&&binding.kind==='function'&&!callee)return {...intrinsic('create',[str(info.name)]),bwCallableSignature:info.signature,bwCallableTargets:[info.name]};
            return bindingRows.has(binding)&&binding.scope!==lexical.global?{...node,name:bindingRows.get(binding).nativeName}:node;
        }
        if(node.type==='Call'&&proof.comparisons.has(node))return {type:'Binary',op:proof.comparisons.get(node).op,left:rewrite(node.args[0]),right:rewrite(node.args[1])};
        if(node.type==='Call') {
            const invocation=proof.calls.find(row=>row.node===node),info=invocation&&infos.get(invocation.target);
            if(info&&invocation.binding.kind!=='function')return {...intrinsic('invoke',[rewrite(node.callee),{type:'Array',items:[]}]),
                bwCallableResultType:renderCallableType(info.signature.result),bwCallableTargets:[info.name]};
        }
        const out={...node};
        for(const [key,value]of Object.entries(node))if(value&&typeof value==='object'&&!['originalBody','parameterDefaults','paramTypes','typeParameters'].includes(key))out[key]=rewrite(value,key==='callee'||node.type==='Parenthesized'&&callee);
        if(node.type==='Declaration')out.decls=node.decls.map(row=>{
            const binding=lexical.scopes.get(node)?.names.get(row.name),mapped=bindingRows.get(binding);
            return {...row,name:mapped?.nativeName||row.name,init:rewrite(row.init||{type:'Undefined'}),...(mapped?.type.kind==='callable'?{bwCallableSignature:mapped.type}:{})};
        });
        if(node.type==='FunctionDeclaration'&&proof.targets.has(node))out.bwCallableDefinition=infos.get(node);
        return out;
    };
    const declarations=bindings.filter(row=>row.kind==='global'&&row.type.kind==='callable').map(row=>({name:row.sourceName,signature:row.type}));
    return {program:{...rewrite(program),bwCallableLexicalPlan:plan,
        bwCallables:[...proof.targets].map(node=>infos.get(node)),sourceCallableDeclarations:declarations},unsupported:[],proof};
}
