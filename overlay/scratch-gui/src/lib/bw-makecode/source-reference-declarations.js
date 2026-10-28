import {staticSdkNamespaceReceivers} from './static-sdk-namespaces.js';
/** Directed reference inventory. No scalar, callable or allocation authority. */
export function sourceReferenceDeclarations(program) {
    const sdk=staticSdkNamespaceReceivers(program);
    const path=node=>node?.type==='Identifier'?node.name:node?.type==='Member'?path(node.object)+'.'+node.name:null;
    const classes=new Set((program.body||[]).filter(node=>node.type==='Class').map(node=>node.name));
    const supported=type=>type==='Sprite'||type==='Image'||type==='image.Font'||classes.has(type)||
        typeof type==='string'&&type.endsWith('[]')&&(['number','boolean','string','Sprite','Image'].includes(type.slice(0,-2))||classes.has(type.slice(0,-2)));
    const globals=new Map(),functions=new Map(),types=new Map(),edges=[],nodes=new WeakMap(),sealed=new Set(),arrayCells=new Set(),elementCells=new Map(),arrayReads=[],arrayCalls=[],arrayItems=[];let sequence=0;
    const add=(cell,type)=>{if(!supported(type)&&!['Scalar','Opaque','number','boolean','string','Undefined','Null','Array'].includes(type))return false;let set=types.get(cell);if(!set)types.set(cell,set=new Set());const before=set.size;set.add(type);return before!==set.size;};
    const element=cell=>{if(!elementCells.has(cell))elementCells.set(cell,'element:'+cell);return elementCells.get(cell);};
    const edge=(from,to)=>{if(from&&to){edges.push([from,to],[element(from),element(to)],[element(to),element(from)]);}};
    const elementEdge=(from,to)=>{if(from&&to)edges.push([from,to]);};
    const annotate=(cell,type,generics=new Set())=>{const base=typeof type==='string'?type.replace(/\[\]$/,''):null;const resolved=generics.has(base)?'Opaque':supported(type)?type:['number','boolean','string'].includes(type)?type:type?'Opaque':null;if(resolved){add(cell,resolved);sealed.add(cell);}};
    const global=name=>'global:'+name;
    const locals=(body,result)=>{const walk=node=>{if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(walk);return;}if(['Class','FunctionDeclaration','FunctionExpression'].includes(node.type))return;if(node.type==='Declaration')node.decls.forEach(decl=>result.add(decl.name));Object.values(node).forEach(value=>{if(value&&typeof value==='object')walk(value);});};walk(body);return result;};
    const bind=(scope,name)=>scope.locals.has(name)?scope.key+':'+name:global(name);
    for(const node of program.body||[]){if(node.type==='Declaration')node.decls.forEach(decl=>globals.set(decl.name,decl));if(node.type==='FunctionDeclaration')functions.set(node.name,node);}
    const scopes=new Map([...functions].map(([name,fn])=>[name,{key:'function:'+name,locals:locals(fn.body,new Set(fn.params||[])),generics:new Set((fn.typeParameters||[]).map(p=>p.name))}]));
    for(const [name,fn]of functions){const scope=scopes.get(name);for(const param of fn.params||[])annotate(bind(scope,param),fn.paramTypes?.[param]?.text,scope.generics);annotate(scope.key+':result',fn.returnType,scope.generics);}
    const visit=(node,scope)=>{
        if(!node||typeof node!=='object')return null;if(Array.isArray(node)){node.forEach(value=>visit(value,scope));return null;}
        if(node.type==='Identifier'){const cell=bind(scope,node.name);if(!scope.locals.has(node.name)&&(functions.has(node.name)||classes.has(node.name)))add(cell,'Opaque');return cell;}
        if(nodes.has(node))return nodes.get(node);const cell='expression:'+ ++sequence;nodes.set(node,cell);
        if(['Number','Boolean','String'].includes(node.type)){add(cell,node.type.toLowerCase());return cell;}
        if(['Undefined','Null'].includes(node.type)){add(cell,node.type);return cell;}
        if(node.type==='Template'){add(cell,node.tag==='img'?'Image':'Opaque');return cell;}
        if(node.type==='Declaration')for(const decl of node.decls){if(scope.key!=='main')scope.locals.add(decl.name);const dst=bind(scope,decl.name);annotate(dst,decl.typeName,scope.generics);edge(visit(decl.init,scope),dst);}
        else if(node.type==='Assignment'){const right=visit(node.right,scope);if(node.op==='='){edge(right,cell);if(node.left?.type==='Identifier')edge(right,bind(scope,node.left.name));else if(node.left?.type==='Index')elementEdge(right,element(visit(node.left.object,scope)));}visit(node.left,scope);}
        else if(node.type==='Array'){arrayCells.add(cell);add(cell,'Array');const items=(node.items||[]).map(item=>visit(item,scope));arrayItems.push({cell,items});for(const item of items)elementEdge(item,element(cell));}
        else if(node.type==='Index'){const receiver=visit(node.object,scope);visit(node.index,scope);arrayReads.push({receiver,result:cell});}
        else if(node.type==='Return')edge(visit(node.value,scope),scope.key+':result');
        else if(node.type==='FunctionDeclaration'){const inner=scopes.get(node.name);if(inner)visit(node.body,inner);}
        else if(node.type==='FunctionExpression'){add(cell,'Opaque');visit(node.body,{key:'callback:'+cell,locals:locals(node.body,new Set(node.params||[]))});}
        else if(node.type==='Class') {
            for(const fn of [node.ctor,...(node.methods||[])].filter(Boolean)) {
                const inner={key:'class:'+node.name+':'+(fn.name||'constructor'),locals:locals(fn.body,new Set(fn.params||[])),generics:new Set((fn.typeParameters||[]).map(p=>p.name))};
                for(const param of fn.params||[])annotate(bind(inner,param),fn.paramTypes?.[param]?.text,inner.generics);
                visit(fn.body,inner);
            }
        }
        else if(node.type==='Call' && node.bwFontType==='image.Font' && ['constant','getFontForText','scaledFont'].includes(node.bwFontIntrinsic)){add(cell,'image.Font');for(const arg of node.args||[])visit(arg,scope);}
        else if(node.type==='Call'){
            const args=(node.args||[]).map(arg=>visit(arg,scope));
            const name=node.callee?.type==='Identifier'?node.callee.name:null;
            if(node.isNew&&classes.has(name)&&!scope.locals.has(name))add(cell,name);
            else if(name&&functions.has(name)&&!scope.locals.has(name)&&!node.isNew){const fn=functions.get(name),inner=scopes.get(name);args.forEach((arg,index)=>{if(fn.params[index])edge(arg,bind(inner,fn.params[index]));});edge(inner.key+':result',cell);}
            else if(sdk.has(node.callee)&&['sprites.create','sprites.createProjectile','sprites.createProjectileFromSide','sprites.createProjectileFromSprite'].includes(path(node.callee)))add(cell,'Sprite');
            else if(sdk.has(node.callee)&&path(node.callee)==='image.create')add(cell,'Image');
            else if(node.callee?.type==='Member' && ['pop','shift','removeAt','push','unshift','set','insertAt','slice','concat'].includes(node.callee.name)){
                arrayCalls.push({receiver:visit(node.callee.object,scope),method:node.callee.name,args,result:cell});
            }
            else add(cell,'Opaque');
            // Only lexically resolved selected SDK factories carry this authority.
        } else if(node.type==='Conditional'){visit(node.test,scope);edge(visit(node.consequent,scope),cell);edge(visit(node.alternate,scope),cell);}
        else if(node.type==='Logical'){edge(visit(node.left,scope),cell);edge(visit(node.right,scope),cell);}
        else for(const value of Object.values(node))if(value&&typeof value==='object')visit(value,scope);
        return cell;
    };
    visit(program.body,{key:'main',locals:new Set()});let changed;
    const arrayType=cell=>{const all=types.get(cell)||new Set(),values=[...all].filter(type=>!['Array','Undefined','Null'].includes(type));return values.length===1&&supported(values[0])&&values[0].endsWith('[]')?values[0]:!values.length&&all.has('Array')?'Array':null;};
    const copy=(from,to)=>{let changed=false;for(const type of types.get(from)||[])if(!sealed.has(to))changed=add(to,type)||changed;return changed;};
    const propagate=()=>{
        let changed;
        do{
            changed=false;
            for(const[from,to]of edges)changed=copy(from,to)||changed;
            for(const[cell,values]of [...types])for(const type of values)if(supported(type)&&type.endsWith('[]'))changed=add(element(cell),type.slice(0,-2))||changed;
            for(const{receiver,result}of arrayReads)if(arrayType(receiver))changed=copy(element(receiver),result)||changed;else if(types.get(receiver)?.size)changed=add(result,'Opaque')||changed;
            for(const{receiver,method,args,result}of arrayCalls){
                if(!arrayType(receiver)){if(types.get(receiver)?.size)changed=add(result,'Opaque')||changed;continue;}
                if(['pop','shift','removeAt'].includes(method))changed=copy(element(receiver),result)||changed;
                else if(['push','unshift','set','insertAt'].includes(method)){
                    changed=copy(args[['set','insertAt'].includes(method)?1:0],element(receiver))||changed;
                    changed=add(result,method==='push'||method==='unshift'?'number':'Opaque')||changed;
                } else {
                    arrayCells.add(result);changed=add(result,'Array')||changed;changed=copy(element(receiver),element(result))||changed;
                    if(method==='concat')for(const arg of args)if(arrayType(arg))changed=copy(element(arg),element(result))||changed;else if(types.get(arg)?.size)changed=add(element(result),'Opaque')||changed;
                }
            }
            for(const cell of arrayCells){
                const values=[...(types.get(element(cell))||[])].filter(type=>!['Undefined','Null','Array'].includes(type));
                if(values.length===1&&supported(values[0]+'[]'))changed=add(cell,values[0]+'[]')||changed;
                else if(values.length>1||values.length===1&&!supported(values[0]+'[]'))changed=add(cell,'Opaque')||changed;
            }
        }while(changed);
    };
    propagate();
    // An unresolved receiver or empty untyped array supplies no element authority.
    for(const{cell,items}of arrayItems)if(items.some(item=>!types.get(item)?.size))add(element(cell),'Opaque');
    for(const{receiver,result}of [...arrayReads,...arrayCalls])if(!arrayType(receiver))add(result,'Opaque');
    for(const cell of arrayCells)if(![...(types.get(cell)||[])].some(type=>type!=='Array'))add(cell,'Opaque');
    propagate();
    const result=[];
    for(const[name,decl]of globals){if(decl.temporary)continue;const declared=supported(decl.typeName)?decl.typeName:null;if(decl.typeName&&!declared)continue;const inferred=[...(types.get(global(name))||[])].filter(type=>!['Array','Undefined','Null'].includes(type));if(declared||inferred.length===1&&supported(inferred[0]))result.push({name,type:declared||inferred[0]});}
    return result;
}
