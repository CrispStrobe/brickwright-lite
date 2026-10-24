import {physicalUpdateSourceSnapshot} from './physical-update-source-snapshot.js';

const dataDescriptor=Object.getOwnPropertyDescriptor,dataHasOwn=Object.hasOwn;
const FrontierWeakSet=WeakSet,frontierHas=WeakSet.prototype.has,frontierAdd=WeakSet.prototype.add,frontierApply=Reflect.apply;

// Internal graph construction only: no input flag, type hint or caller-owned
// receipt can enroll a declaration. Readiness never changes value/type facts.
export function lexicalDeclarationReadiness(program) {
    // Capture BEFORE value-graph traversal. The lazy computation must never
    // combine old binding/writer facts with a newly snapshotted mutable AST.
    const snapshot=physicalUpdateSourceSnapshot(program);let expired=false;
    const current=()=>{
        if(expired)return false;
        try {if(!snapshot||!snapshot.current())expired=true;}
        catch(error){expired=true;throw error;}
        return !expired;
    };
    return Object.freeze({current,analyse:graph=>{
        try{return analyseReadiness(program,graph,current);}
        catch(error){expired=true;throw error;}
    }});
}

function analyseReadiness(program,graph,current) {
    const statements=new WeakSet(),expressions=new WeakSet();
    const records=[],functions=new Map(),declarations=new Map(),references=[],seen=new WeakSet();
    let valid=current()&&program?.type==='Program';
    const own=node=>{if(!node||typeof node!=='object'||seen.has(node)){valid=false;return false;}seen.add(node);return true;};
    // String evaluation/reflection can hide lexical writers from an ordinary
    // source edge census. Names here only REFUSE, never issue authority.
    const badSlot=Symbol();
    const required=(object,key)=>{
        const descriptor=dataDescriptor(object,key);
        return descriptor&&dataHasOwn(descriptor,'value')?descriptor.value:badSlot;
    };
    const optional=(object,key)=>{
        const descriptor=dataDescriptor(object,key);
        if(!descriptor)return key in object?badSlot:undefined;
        return dataHasOwn(descriptor,'value')?descriptor.value:badSlot;
    };
    const absent=(object,key)=>!dataDescriptor(object,key)&&!(key in object);
    const dense=array=>{
        if(!Array.isArray(array))return false;
        const length=required(array,'length');
        if(!Number.isSafeInteger(length)||length<0)return false;
        for(let index=0;index<length;index++)if(required(array,String(index))===badSlot)return false;
        return true;
    };
    const alternatives=new WeakMap(),fieldInitializers=new WeakMap(),instanceRows=new FrontierWeakSet();
    // Only the Class traversal creates this private context. It is a syntax
    // role, never a receiver/type/initialization fact or an entry seed.
    const instanceRole=(node,context,params)=>{
        if(!context||!absent(node,'type')||required(node,'isStatic')!==false||params.some(name=>typeof name!=='string'||!name||name==='this'))return false;
        if(context.constructor){
            return required(context.owner,'ctor')===node&&absent(node,'name')&&absent(node,'kind');
        }
        const methods=required(context.owner,'methods'),kind=required(node,'kind'),name=required(node,'name');
        return dense(methods)&&required(methods,String(context.index))===node&&typeof name==='string'&&name.length>0&&
            name!=='constructor'&&['method','get','set'].includes(kind)&&
            (kind!=='get'||params.length===0)&&(kind!=='set'||params.length===1);
    };
    const reflectiveRoots=new Set(['eval','Function','Reflect','Proxy','globalThis','window','self','this']);
    const reflectiveKeys=new Set(['constructor','prototype','__proto__','eval','Function','getPrototypeOf','setPrototypeOf',
        'getOwnPropertyDescriptor','getOwnPropertyDescriptors','getOwnPropertyNames','getOwnPropertySymbols','defineProperty','defineProperties','ownKeys']);
    const record=(node,kind,context=null)=>{
        const body=required(node,'body'),params=required(node,'params');
        if(!dense(body)||!dense(params)){valid=false;return;}
        // Defaults have their own pre-body execution boundary. This theorem
        // deliberately refuses them rather than deleting their expressions.
        // parseParams retains default expressions on a nonenumerable own
        // property of params even when the ordinary callable omits its copy.
        // These records refuse authority; their expressions are never erased
        // or interpreted as body-entry facts.
        // Optional signatures remain conservative too: their enumerable
        // callable copy survives private array cloning which may omit hidden
        // params default metadata. Never recover authority from that omission.
        for(const value of [node,params])for(const key of ['parameterDefaults','ordinaryParameterDefaultNames','optionalParams']){
            const defaults=optional(value,key);
            if(defaults!==undefined&&(!dense(defaults)||defaults.length!==0)){valid=false;return;}
        }
        const row={node,kind,body};records.push(row);
        if(instanceRole(node,context,params))frontierApply(frontierAdd,instanceRows,[row]);
        if(kind==='hoisted'){
            const binding=graph.bindingOf(node);
            if(!binding||functions.has(binding)||graph.declarationCountAt(node)!==1)valid=false;
            functions.set(binding,row);
        }
        statementList(body,row);
    };
    const expression=(node,owner,parent=null,slot=null)=>{
        if(node===null||node===undefined)return;
        if(!own(node))return;expressions.add(node);
        if(typeof required(node,'type')!=='string'){valid=false;return;}
        if(node.type==='Identifier'){const name=required(node,'name');if(typeof name!=='string'){valid=false;return;}if(reflectiveRoots.has(name)&&!(name==='this'&&owner&&frontierApply(frontierHas,instanceRows,[owner])))valid=false;references.push({node,parent,slot});return;}
        if(node.type==='Number'){
            if(typeof node.value!=='string'||!/^(?:0[xX][0-9a-fA-F]+|0[bB][01]+|0[oO][0-7]+|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)$/.test(node.value))valid=false;
            return;
        }
        // ts-import stores raw token content (including escapes), not a quoted JSON token.
        if(node.type==='String'){if(typeof node.value!=='string')valid=false;return;}
        if(node.type==='Boolean'){if(typeof required(node,'value')!=='boolean')valid=false;return;}
        if(['Null','Undefined'].includes(node.type))return;
        if(node.type==='Template'){
            if(typeof node.value==='string'&&node.value.includes('${'))valid=false;
            // Tags are represented as strings by this parser, not Identifier
            // nodes. They are reference uses and cannot be hidden from B.
            if(typeof node.tag==='string'){
                const parts=node.tag.split('.');if(reflectiveRoots.has(parts[0])||parts.some(part=>reflectiveKeys.has(part)))valid=false;
                references.push({node,name:parts[0],parent:null,slot:'tag'});
            }
            return;
        }
        if(node.type==='FunctionExpression'){record(node,'allocation');return;}
        if(node.type==='Member'&&reflectiveKeys.has(node.name))valid=false;
        if(node.type==='Index'){
            let key;
            if(node.index?.type==='String'){
                // Escape spelling can conceal a reflective property name. This
                // theorem admits only literal unescaped computed string keys.
                if(typeof node.index.value==='string'&&!node.index.value.includes('\\'))key=node.index.value;
                else valid=false;
            }
            if(node.index?.type!=='Number'&&(typeof key!=='string'||reflectiveKeys.has(key))&&!graph.isClosedArrayIndex(node))valid=false;
        }
        if(node.type==='Array'){if(!Array.isArray(node.items))valid=false;else node.items.forEach(value=>expression(value,owner,node,'items'));return;}
        if(node.type==='Object'){if(!Array.isArray(node.props))valid=false;else for(const prop of node.props)expression(prop.value,owner,node,'props');return;}
        const slots={Call:['callee','args'],Binary:['left','right'],Logical:['left','right'],Assignment:['left','right'],
            Unary:['argument'],Update:['argument'],Member:['object'],Index:['object','index'],Conditional:['test','consequent','alternate']};
        if(!slots[node.type]){valid=false;return;}
        for(const key of slots[node.type]){
            if(key==='args'){
                if(!Array.isArray(node.args))valid=false;else node.args.forEach(value=>expression(value,owner,node,key));
            }else expression(node[key],owner,node,key);
        }
    };
    const statement=(node,owner)=>{
        if(!own(node))return;statements.add(node);
        if(typeof required(node,'type')!=='string'){valid=false;return;}
        if(node.type==='Declaration'){
            if(!['let','const','var'].includes(node.kind)||!Array.isArray(node.decls)){valid=false;return;}
            for(const decl of node.decls){
                if(node.kind==='const'&&!decl.init)valid=false;
                const binding=graph.bindingOf(node,decl.name);
                if(['let','const'].includes(node.kind)){
                    if(!binding||declarations.has(binding))valid=false;
                    declarations.set(binding,{statement:node,decl,owner});
                }
                expression(decl.init,owner,node,'init');
            }return;
        }
        if(node.type==='FunctionDeclaration'){record(node,'hoisted');return;}
        if(node.type==='Class'){
            const unsupported=optional(node,'unsupported'),base=optional(node,'base');
            if(unsupported===badSlot||unsupported!=null&&(!dense(unsupported)||unsupported.length)||base===badSlot||base!=null&&typeof base!=='string'){valid=false;return;}
            if(typeof base==='string'){
                const parts=base.split('.');if(reflectiveRoots.has(parts[0])||parts.some(part=>reflectiveKeys.has(part)))valid=false;
                references.push({node,name:parts[0],parent:null,slot:'heritage'});
            }
            const fields=optional(node,'fields'),methods=optional(node,'methods'),ctor=optional(node,'ctor');
            if(fields===badSlot||methods===badSlot||ctor===badSlot||
                fields!=null&&!dense(fields)||methods!=null&&!dense(methods)){valid=false;return;}
            const name=required(node,'name');
            const owned=required(node,'type')==='Class'&&typeof name==='string'&&name.length>0&&
                dense(required(node,'fields'))&&dense(required(node,'methods'))&&required(node,'ctor')!==badSlot&&ctor!==undefined;
            // Validation context only: fields do not inherit an outer method's
            // this permission, even for a Class nested inside that method.
            // The later flow pass keeps the actual lexical owner unchanged.
            for(const field of fields||[]){
                if(!field||typeof field!=='object'){valid=false;return;}
                const init=optional(field,'init');if(init===badSlot){valid=false;return;}
                fieldInitializers.set(field,init);expression(init,null,node,'field');
            }
            if(ctor!=null){if(own(ctor))record(ctor,'method',owned?{owner:node,constructor:true}:null);}
            for(let index=0;index<(methods?.length||0);index++){
                const method=required(methods,String(index));
                if(own(method))record(method,'method',owned?{owner:node,index,constructor:false}:null);
            }return;
        }
        if(node.type==='Block'){statementList(node.body,owner);return;}
        if(node.type==='If'){
            const test=required(node,'test'),consequent=required(node,'consequent'),alternate=required(node,'alternate');
            if(test===badSlot||!dense(consequent)||alternate!==null&&!dense(alternate)){valid=false;return;}
            alternatives.set(node,alternate);expression(test,owner,node,'test');statementList(consequent,owner);
            if(alternate!==null)statementList(alternate,owner);return;
        }
        if(['For','ForOf','While'].includes(node.type)){
            if(node.init?.type==='Declaration')statement(node.init,owner);else expression(node.init,owner,node,'init');
            for(const key of ['test','iterable','update'])expression(node[key],owner,node,key);
            statementList(node.body,owner);return;
        }
        if(node.type==='ExpressionStatement'){expression(node.expr,owner,node,'expr');return;}
        if(node.type==='Return'){expression(node.value,owner,node,'value');return;}
        if(node.type==='ThrowStatement'){expression(node.argument,owner,node,'argument');return;}
        if(['Break','Continue','Interface'].includes(node.type))return;
        valid=false;
    };
    const statementList=(list,owner)=>{if(!dense(list)){valid=false;return;}for(let index=0;index<list.length;index++)statement(required(list,String(index)),owner);};
    if(valid)statementList(program.body,program);
    const entries=new Map(records.map(row=>[row,[]])),closed=new Set();
    for(const [binding,row]of functions){
        const uses=references.filter(ref=>graph.bindingOf(ref.node,ref.name??ref.node.name)===binding);
        if(!uses.length||graph.immutableFunctionAt(row.node)!==row.node)continue;
        if(uses.every(ref=>ref.slot==='callee'&&ref.parent?.type==='Call'&&ref.parent.callee===ref.node&&
            !ref.parent.isNew&&!ref.parent.constructorCall&&!ref.parent.typeArguments?.length)){
            closed.add(row);entries.set(row,uses.map(ref=>ref.parent));
        }
    }
    const same=(a,b)=>a.size===b.size&&[...a].every(value=>b.has(value));
    const intersect=sets=>sets.length?new Set([...sets[0]].filter(value=>sets.every(set=>set.has(value)))):new Set();
    let seeds=new Map(records.map(row=>[row,new Set()])),at=new WeakMap(),owners=new WeakMap(),converged=false;
    // Every iteration can add only a finite actual declaration binding to a
    // finite actual function entry. No iteration budget may become a PASS.
    const maximum=(records.length+1)*(declarations.size+1)+1;
    for(let pass=0;valid&&pass<maximum;pass++){
        at=new WeakMap();owners=new WeakMap();const allocations=new Map(),calls=new Map();
        const mark=(node,known,owner)=>{at.set(node,new Set(known));owners.set(node,owner);};
        const expr=(node,known,owner)=>{
            if(!node||!expressions.has(node))return known;mark(node,known,owner);
            if(node.type==='FunctionExpression'){
                const row=records.find(row=>row.node===node);allocations.set(row,new Set(known));return known;
            }
            if(node.type==='Conditional'){
                known=expr(node.test,known,owner);return intersect([expr(node.consequent,new Set(known),owner),expr(node.alternate,new Set(known),owner)]);
            }
            if(node.type==='Logical'||node.type==='Binary'&&['&&','||','??'].includes(node.op)){
                known=expr(node.left,known,owner);expr(node.right,new Set(known),owner);return known;
            }
            if(node.type==='Array'){for(const item of node.items)known=expr(item,known,owner);return known;}
            if(node.type==='Object'){for(const prop of node.props)known=expr(prop.value,known,owner);return known;}
            const slots={Call:['callee','args'],Binary:['left','right'],Assignment:['left','right'],Unary:['argument'],Update:['argument'],Member:['object'],Index:['object','index']};
            for(const key of slots[node.type]||[]){
                if(key==='args')for(const arg of node.args)known=expr(arg,known,owner);else known=expr(node[key],known,owner);
            }
            if(node.type==='Call')calls.set(node,new Set(known));
            return known;
        };
        const flow=(list,known,owner)=>{
            for(const node of list){
                if(known===null)break;
                if(!statements.has(node)){valid=false;break;}mark(node,known,owner);
                if(node.type==='Declaration'){
                    for(const decl of node.decls){
                        known=expr(decl.init,known,owner);
                        // The initializer runs BEFORE declaration completion.
                        const id=graph.bindingOf(node,decl.name),row=declarations.get(id);
                        if(row?.statement===node&&row.decl===decl)known=new Set([...known,id]);
                    }
                }else if(node.type==='Block')known=flow(node.body,known,owner);
                else if(node.type==='If'){
                    known=expr(node.test,known,owner);
                    const alternate=alternatives.get(node);
                    const left=flow(node.consequent,new Set(known),owner),right=alternate===null?new Set(known):flow(alternate,new Set(known),owner);
                    known=left===null?right:right===null?left:intersect([left,right]);
                }else if(['For','ForOf','While'].includes(node.type)){
                    // Loop bodies may execute zero times. No loop declaration
                    // or iteration completion becomes an outgoing frontier.
                    const inside=node.init?.type==='Declaration'?flow([node.init],new Set(known),owner):expr(node.init,new Set(known),owner);
                    expr(node.test,inside,owner);expr(node.iterable,inside,owner);
                    const end=flow(node.body,new Set(inside),owner);if(end!==null)expr(node.update,end,owner);
                }else if(node.type==='ExpressionStatement')known=expr(node.expr,known,owner);
                else if(node.type==='Return'||node.type==='ThrowStatement'){
                    expr(node.type==='Return'?node.value:node.argument,known,owner);known=null;
                }else if(node.type==='Break'||node.type==='Continue')known=null;
                else if(node.type==='Class')for(const field of node.fields||[])expr(fieldInitializers.get(field),new Set(),owner);
            }return known;
        };
        flow(program.body,new Set(),program);
        for(const row of records)flow(row.body,new Set(seeds.get(row)),row);
        const next=new Map();
        for(const row of records){
            const sites=entries.get(row);
            next.set(row,row.kind==='allocation'?allocations.get(row)||new Set():row.kind==='hoisted'&&closed.has(row)&&sites.every(site=>calls.has(site))?
                intersect(sites.map(site=>calls.get(site))):new Set());
        }
        if([...next].every(([row,set])=>same(set,seeds.get(row)))){converged=true;break;}seeds=next;
    }
    const executed=(node,binding)=>valid&&converged&&at.get(node)?.has(binding)===true;
    return Object.freeze({
        current,
        isDeclarationExecutedAt:(node,binding)=>current()&&executed(node,binding),
        isCapturedReadyAt:node=>{
            if(!current()||node?.type!=='Identifier')return false;
            const binding=graph.bindingOf(node),decl=declarations.get(binding),owner=owners.get(node);
            return !!decl&&owner!==program&&owner!==decl.owner&&records.includes(owner)&&
                graph.declarationCountAt(node)===1&&executed(node,binding);
        }
    });
}
