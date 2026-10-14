import {staticSdkNamespaceReceivers} from './static-sdk-namespaces.js';
/** Directed reference inventory. No scalar, callable or allocation authority. */
export function sourceReferenceDeclarations(program) {
    const sdk=staticSdkNamespaceReceivers(program);
    const path=node=>node?.type==='Identifier'?node.name:node?.type==='Member'?path(node.object)+'.'+node.name:null;
    const classes=new Set((program.body||[]).filter(node=>node.type==='Class').map(node=>node.name));
    const supported=type=>type==='Sprite'||type==='Image'||classes.has(type)||
        typeof type==='string'&&type.endsWith('[]')&&(['number','boolean','string','Sprite','Image'].includes(type.slice(0,-2))||classes.has(type.slice(0,-2)));
    const globals=new Map(),functions=new Map(),types=new Map(),edges=[],nodes=new WeakMap(),sealed=new Set();let sequence=0;
    const add=(cell,type)=>{if(!supported(type)&&!['Scalar','Opaque'].includes(type))return false;let set=types.get(cell);if(!set)types.set(cell,set=new Set());const before=set.size;set.add(type);return before!==set.size;};
    const edge=(from,to)=>{if(from&&to)edges.push([from,to]);};
    const annotate=(cell,type,generics=new Set())=>{const base=typeof type==='string'?type.replace(/\[\]$/,''):null;const resolved=generics.has(base)?'Opaque':supported(type)?type:['number','boolean','string'].includes(type)?'Scalar':type?'Opaque':null;if(resolved){add(cell,resolved);sealed.add(cell);}};
    const global=name=>'global:'+name;
    const locals=(body,result)=>{const walk=node=>{if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(walk);return;}if(['Class','FunctionDeclaration','FunctionExpression'].includes(node.type))return;if(node.type==='Declaration')node.decls.forEach(decl=>result.add(decl.name));Object.values(node).forEach(value=>{if(value&&typeof value==='object')walk(value);});};walk(body);return result;};
    const bind=(scope,name)=>scope.locals.has(name)?scope.key+':'+name:global(name);
    for(const node of program.body||[]){if(node.type==='Declaration')node.decls.forEach(decl=>globals.set(decl.name,decl));if(node.type==='FunctionDeclaration')functions.set(node.name,node);}
    const scopes=new Map([...functions].map(([name,fn])=>[name,{key:'function:'+name,locals:locals(fn.body,new Set(fn.params||[])),generics:new Set((fn.typeParameters||[]).map(p=>p.name))}]));
    for(const [name,fn]of functions){const scope=scopes.get(name);for(const param of fn.params||[])annotate(bind(scope,param),fn.paramTypes?.[param]?.text,scope.generics);annotate(scope.key+':result',fn.returnType,scope.generics);}
    const visit=(node,scope)=>{
        if(!node||typeof node!=='object')return null;if(Array.isArray(node)){node.forEach(value=>visit(value,scope));return null;}
        if(node.type==='Identifier')return bind(scope,node.name);
        if(nodes.has(node))return nodes.get(node);const cell='expression:'+ ++sequence;nodes.set(node,cell);
        if(['Number','Boolean','String'].includes(node.type)){add(cell,'Scalar');return cell;}
        if(node.type==='Template'){add(cell,node.tag==='img'?'Image':'Opaque');return cell;}
        if(node.type==='Declaration')for(const decl of node.decls){if(scope.key!=='main')scope.locals.add(decl.name);const dst=bind(scope,decl.name);annotate(dst,decl.typeName,scope.generics);edge(visit(decl.init,scope),dst);}
        else if(node.type==='Assignment'){const right=visit(node.right,scope);if(node.op==='='){edge(right,cell);if(node.left?.type==='Identifier')edge(right,bind(scope,node.left.name));}visit(node.left,scope);}
        else if(node.type==='Return')edge(visit(node.value,scope),scope.key+':result');
        else if(node.type==='FunctionDeclaration'){const inner=scopes.get(node.name);if(inner)visit(node.body,inner);}
        else if(node.type==='FunctionExpression')visit(node.body,{key:'callback:'+cell,locals:locals(node.body,new Set(node.params||[]))});
        else if(node.type==='Class') {
            for(const fn of [node.ctor,...(node.methods||[])].filter(Boolean)) {
                const inner={key:'class:'+node.name+':'+(fn.name||'constructor'),locals:locals(fn.body,new Set(fn.params||[])),generics:new Set((fn.typeParameters||[]).map(p=>p.name))};
                for(const param of fn.params||[])annotate(bind(inner,param),fn.paramTypes?.[param]?.text,inner.generics);
                visit(fn.body,inner);
            }
        }
        else if(node.type==='Call'){
            const args=(node.args||[]).map(arg=>visit(arg,scope));
            const name=node.callee?.type==='Identifier'?node.callee.name:null;
            if(node.isNew&&classes.has(name))add(cell,name);
            else if(name&&functions.has(name)&&!node.isNew){const fn=functions.get(name),inner=scopes.get(name);args.forEach((arg,index)=>{if(fn.params[index])edge(arg,bind(inner,fn.params[index]));});edge(inner.key+':result',cell);}
            else if(sdk.has(node.callee)&&['sprites.create','sprites.createProjectile','sprites.createProjectileFromSide','sprites.createProjectileFromSprite'].includes(path(node.callee)))add(cell,'Sprite');
            else if(sdk.has(node.callee)&&path(node.callee)==='image.create')add(cell,'Image');
            else add(cell,'Opaque');
            // Only lexically resolved selected SDK factories carry this authority.
        } else if(node.type==='Conditional'){visit(node.test,scope);edge(visit(node.consequent,scope),cell);edge(visit(node.alternate,scope),cell);}
        else if(node.type==='Logical'){edge(visit(node.left,scope),cell);edge(visit(node.right,scope),cell);}
        else for(const value of Object.values(node))if(value&&typeof value==='object')visit(value,scope);
        return cell;
    };
    visit(program.body,{key:'main',locals:new Set()});let changed;
    do{changed=false;for(const[from,to]of edges)for(const type of types.get(from)||[])if(!sealed.has(to))changed=add(to,type)||changed;}while(changed);
    const result=[];
    for(const[name,decl]of globals){if(decl.temporary)continue;const declared=supported(decl.typeName)?decl.typeName:null;if(decl.typeName&&!declared)continue;const inferred=[...(types.get(global(name))||[])];if(declared||inferred.length===1&&supported(inferred[0]))result.push({name,type:declared||inferred[0]});}
    return result;
}
