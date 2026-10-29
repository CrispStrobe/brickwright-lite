import {analyseCallableBindings} from './callable-bindings.js';
import {physicalUpdateSourceSnapshot} from './physical-update-source-snapshot.js';
import {inspectGeneratedHelperBindings,GENERATED_HELPER_PROFILES} from './generated-helper-recognition.js';

const denied=Object.freeze({overwrite:()=>null,current:()=>true});
const descriptor=Object.getOwnPropertyDescriptor,keys=Reflect.ownKeys,prototype=Object.getPrototypeOf,own=Object.hasOwn,same=Object.is;
const privateSymbol=Symbol;
const realm=globalThis,aliases=['Object','Array','Map','Set','WeakMap','WeakSet','Reflect','JSON','String','Number','Function','Symbol','Boolean','Math','RegExp'];
const aliasRows=aliases.map(name=>[name,descriptor(realm,name)]);
const ambient=[Object,Array,Map,Set,WeakMap,WeakSet,Reflect,JSON,String,Number,Function,Symbol,Symbol.prototype,Boolean,Boolean.prototype,Math,RegExp,RegExp.prototype,
    Object.prototype,Array.prototype,Map.prototype,Set.prototype,WeakMap.prototype,WeakSet.prototype,
    String.prototype,Number.prototype,Function.prototype,prototype([][Symbol.iterator]()),
    prototype(new Map()[Symbol.iterator]()),prototype(new Set()[Symbol.iterator]())]
    .map(object=>({object,parent:prototype(object),rows:keys(object).map(key=>[key,descriptor(object,key)])}));
for(const iterator of [[][Symbol.iterator](),new Map()[Symbol.iterator](),new Set()[Symbol.iterator](),''[Symbol.iterator]()]){
    for(let parent=prototype(iterator);parent;parent=prototype(parent)){
        if(!ambient.some(row=>row.object===parent))ambient.push({object:parent,parent:prototype(parent),rows:keys(parent).map(key=>[key,descriptor(parent,key)])});
    }
}
const descriptorSlots=['value','writable','get','set'];
const sameDescriptor=(a,b)=>{
    if(!a||!b||a.enumerable!==b.enumerable||a.configurable!==b.configurable)return false;
    for(let i=0;i<descriptorSlots.length;i++){
        const key=descriptorSlots[i],present=own(a,key);
        if(present!==own(b,key)||present&&!same(a[key],b[key]))return false;
    }
    return true;
};
// Observe replacements before dispatching any prototype method or iterator.
const ambientCurrent=()=>{
    for(let i=0;i<aliasRows.length;i++)if(!sameDescriptor(descriptor(realm,aliasRows[i][0]),aliasRows[i][1]))return false;
    for(let i=0;i<ambient.length;i++){
        const row=ambient[i],names=keys(row.object);
        if(prototype(row.object)!==row.parent||names.length!==row.rows.length)return false;
        for(let j=0;j<names.length;j++)if(names[j]!==row.rows[j][0]||!sameDescriptor(descriptor(row.object,names[j]),row.rows[j][1]))return false;
    }
    return true;
};
const metadata=new Set(['paramTypes','returnType','typeParameters','optionalParams','parameterDefaults',
    'ordinaryParameterDefaultNames','functionKind','parameterDefaultPrologue','originalBody']);
const safeName=name=>typeof name==='string'&&/^[A-Za-z_$][\w$]*$/.test(name);
const scalar=value=>({kind:'scalar',value,comparison:false});

// Reset non-exposure only. This private evaluator has no producer, initialized
// read, indexed result or heap certificate API. Each query starts a new entry
// invocation and an isolated symbolic heap; no state survives in source data.
export function createLocalArrayResetPrefixEffects(program){
    try{
        if(!ambientCurrent())return denied;
        const snapshot=physicalUpdateSourceSnapshot(program);
        if(!snapshot||snapshot.opaque.length)return denied;
        const syntax=inspectGeneratedHelperBindings(program,GENERATED_HELPER_PROFILES.ordinary);
        if(!syntax.isCurrent())return denied;
        const lexical=analyseCallableBindings(program),cache=new WeakMap();let live=true;
        const current=()=>{
            if(!live)return false;
            try{if(!ambientCurrent()||!syntax.isCurrent()||!snapshot.current())live=false;}catch{live=false;}
            return live;
        };
        const fail=()=>{throw false;};
        const dense=array=>Array.isArray(array)&&array.length<=4096&&keys(array).length===array.length+1&&
            Array.from({length:array.length},(_,i)=>own(array,String(i))).every(value=>value===true);
        const shape=(node,required,optional=[])=>!!node&&typeof node==='object'&&
            required.every(key=>descriptor(node,key))&&keys(node).every(key=>required.includes(key)||optional.includes(key)||
                key==='parenthesized'&&typeof node[key]==='boolean');
        if(!shape(program,['type','body'])||program.type!=='Program'||!dense(program.body))return denied;
        const functionShapes=new WeakMap();
        const inspectFunction=fn=>{
            if(!shape(fn,['type','name','params','body'],[...metadata])||fn.type!=='FunctionDeclaration'||!safeName(fn.name)||
                !Array.isArray(fn.params)||fn.params.length>16||new Set(fn.params).size!==fn.params.length||!fn.params.every(safeName)||!dense(fn.body)||
                Array.from({length:fn.params.length},(_,i)=>own(fn.params,String(i))).some(yes=>!yes)||
                keys(fn.params).some(key=>key!=='length'&&!/^(?:0|[1-9][0-9]*)$/.test(key)&&!['optionalParams','parameterDefaults','parameterProperties'].includes(key)))return false;
            for(const row of [fn,fn.params]){
                for(const key of ['parameterDefaults','parameterProperties','optionalParams','ordinaryParameterDefaultNames','typeParameters','originalBody'])
                    if(row[key]!==undefined&&(!Array.isArray(row[key])||row[key].length))return false;
                if(keys(row).some(key=>['async','isAsync','generator','isGenerator','restParam'].includes(key)))return false;
            }
            // Formal references have the function as their declaration node.
            // Their complete body is interpreted below; outside references must
            // remain direct calls to the actual immutable declaration.
            return syntax.root(fn)&&syntax.calls(fn,[fn.params.length],new Set([fn]))!==null;
        };
        const fnShape=fn=>{
            if(!fn||typeof fn!=='object')return false;
            if(!functionShapes.has(fn))functionShapes.set(fn,inspectFunction(fn));
            return functionShapes.get(fn);
        };
        const declarations=new Map();
        for(const node of syntax.nodes)if(node.type==='Declaration')for(const decl of node.decls||[]){
            let scope=lexical.scopes.get(node);while(scope&&!scope.names.has(decl.name))scope=scope.parent;
            const binding=scope?.names.get(decl.name);if(binding){if(declarations.has(binding))declarations.set(binding,null);else declarations.set(binding,{decl,node});}
        }
        const binding=node=>lexical.references.get(node);
        const declared=(node,decl)=>{
            let scope=lexical.scopes.get(node);while(scope&&!scope.names.has(decl.name))scope=scope.parent;
            const result=scope?.names.get(decl.name);if(!result||declarations.get(result)?.decl!==decl)fail();return result;
        };
        const declarationShape=node=>shape(node,['type','kind','decls'])&&node.type==='Declaration'&&['let','const'].includes(node.kind)&&
            dense(node.decls)&&node.decls.every(decl=>shape(decl,['name','init'],['typeName','isArray'])&&safeName(decl.name)&&
                (decl.typeName==null||typeof decl.typeName==='string')&&(decl.isArray===undefined||typeof decl.isArray==='boolean'));
        const plainCall=node=>shape(node,['type','callee','args'])&&node.type==='Call'&&dense(node.args);
        const clone=state=>({globals:new Map(state.globals),frames:new Map([...state.frames].map(([key,map])=>[key,new Map(map)])),
            heap:new Map([...state.heap].map(([key,row])=>[key,{length:row.length,slots:new Map(row.slots)}]))});
        const compute=decl=>{
            const entry=lexical.bindings.find(row=>row.node===decl),fn=entry?.functionOwner?.node;
            if(!entry||entry.kind!=='local'||!fnShape(fn)||fn.params.length||!fn.body.some(node=>node.type==='Declaration'&&node.decls.includes(decl))||
                !['Null','Undefined'].includes(decl.init?.type)||declarations.get(entry)?.decl!==decl||
                lexical.functions.some(other=>other!==entry.functionOwner&&other.captures.has(entry)))return null;
            if(syntax.nodes.some(node=>node.type==='Identifier'&&node.name===decl.name&&!lexical.references.has(node)))return null;
            const calls=syntax.calls(fn,[0]);if(calls?.length!==1)return null;
            const call=calls[0],statement=syntax.parentOf(call);
            if(!plainCall(call)||statement?.type!=='ExpressionStatement'||!shape(statement,['type','expr'])||statement.expr!==call||
                program.body.at(-1)!==statement||syntax.parentOf(statement)!==program)return null;
            const at=fn.body.findIndex(node=>node.type==='Declaration'&&node.decls.includes(decl));
            const overwrite=fn.body.slice(at+1).find(node=>node.type==='ExpressionStatement'&&node.expr?.type==='Assignment'&&
                node.expr.op==='='&&node.expr.left?.type==='Identifier'&&binding(node.expr.left)===entry);
            if(!overwrite||overwrite.expr.right?.type!=='Array'||overwrite.expr.right.items?.length!==0)return null;
            let steps=0,nextArray=0,ordinaryCalls=0;const active=new Set(),rootFrame=privateSymbol(),state={globals:new Map(),frames:new Map(),heap:new Map()};
            const tick=()=>{if(++steps>10000)fail();};
            const read=(node,state,frame)=>{
                const b=binding(node);if(!b){if(node.name==='undefined'&&!lexical.global.names.has('undefined'))return scalar(undefined);fail();}
                if(b===entry)fail();
                const map=b.functionOwner===lexical.global?state.globals:state.frames.get(frame);
                if(!map?.has(b))fail();return map.get(b);
            };
            const write=(b,value,state,frame,initial=false)=>{
                if(!b||b===entry&&!initial||!['global','local','parameter'].includes(b.kind))fail();
                const map=b.functionOwner===lexical.global?state.globals:state.frames.get(frame);
                if(!map||!initial&&!map.has(b)||!initial&&declarations.get(b)?.node.kind==='const')fail();map.set(b,value);
            };
            const numberIndex=value=>{if(value?.kind!=='scalar'||typeof value.value!=='number'||!Number.isSafeInteger(value.value)||value.value<0||value.value>=4096)fail();return value.value;};
            const array=(value,state)=>{if(value?.kind!=='array'||!state.heap.has(value))fail();return state.heap.get(value);};
            const strictComparator=target=>{
                if(target.params.length!==2||target.body.length!==1||target.body[0]?.type!=='Return')return false;
                const value=target.body[0].value;if(!['===','!=='].includes(value?.op)||value.type!=='Binary')return false;
                const scope=lexical.scopes.get(target);
                return value.left?.type==='Identifier'&&value.right?.type==='Identifier'&&
                    binding(value.left)===scope.names.get(target.params[0])&&binding(value.right)===scope.names.get(target.params[1]);
            };
            const invoke=(target,args,state)=>{
                tick();if(!fnShape(target)||target===fn||active.has(target)||active.size>=16||args.length!==target.params.length)fail();
                ordinaryCalls++;active.add(target);const frame=privateSymbol(),scope=lexical.scopes.get(target);state.frames.set(frame,new Map());
                target.params.forEach((name,i)=>write(scope.names.get(name),args[i],state,frame,true));
                let value=scalar(undefined);
                try{
                    for(const node of target.body){
                        if(node.type==='Return'){
                            if(!shape(node,['type','value']))fail();value=node.value?expression(node.value,state,frame):scalar(undefined);break;
                        }
                        simple(node,state,frame);
                    }
                }finally{active.delete(target);state.frames.delete(frame);}
                if(strictComparator(target)){if(value.kind!=='scalar'||typeof value.value!=='boolean')fail();value={...value,comparison:true};}
                return value;
            };
            const expression=(node,state,frame,top=false)=>{
                tick();if(!node||typeof node!=='object')fail();
                if(['Null','Undefined'].includes(node.type)){if(!shape(node,['type']))fail();return scalar(node.type==='Null'?null:undefined);}
                if(['Number','String','Boolean'].includes(node.type)){
                    if(!shape(node,['type','value']))fail();
                    if(node.type==='Number'){if(typeof node.value!=='string'||!Number.isFinite(Number(node.value)))fail();return scalar(Number(node.value));}
                    if(typeof node.value!==(node.type==='String'?'string':'boolean'))fail();return scalar(node.value);
                }
                if(node.type==='Array'){
                    if(!shape(node,['type','items'])||!dense(node.items)||++nextArray>256)fail();
                    const items=node.items.map(item=>expression(item,state,frame,top));
                    if(items.some(item=>item.kind!=='scalar'))fail();const token={kind:'array',id:nextArray};
                    state.heap.set(token,{length:items.length,slots:new Map(items.map((value,i)=>[i,value]))});return token;
                }
                if(top)fail();
                if(node.type==='Identifier'){if(!shape(node,['type','name']))fail();return read(node,state,frame);}
                if(node.type==='Unary'){
                    if(!shape(node,['type','op','argument'])||!['!','+','-'].includes(node.op))fail();const value=expression(node.argument,state,frame);
                    if(value.kind!=='scalar')fail();return {kind:'scalar',value:node.op==='!'?!value.value:node.op==='+'?+value.value:-value.value,comparison:node.op==='!'&&value.comparison};
                }
                if(node.type==='Binary'){
                    if(!shape(node,['type','op','left','right']))fail();const left=expression(node.left,state,frame),right=expression(node.right,state,frame);
                    if(['===','!=='].includes(node.op)){
                        const equal=left.kind===right.kind&&(left.kind==='array'?left===right:left.value===right.value);return scalar(node.op==='==='?equal:!equal);
                    }
                    if(node.op!=='+'||left.kind!=='scalar'||right.kind!=='scalar')fail();return scalar(left.value+right.value);
                }
                if(node.type==='Call'){
                    if(!plainCall(node))fail();
                    if(node.callee?.type==='Member'){
                        if(!shape(node.callee,['type','object','name'])||node.callee.name!=='push'||node.args.length!==1)fail();
                        const receiver=array(expression(node.callee.object,state,frame),state),value=expression(node.args[0],state,frame);
                        if(value.kind!=='scalar'||receiver.length>=4096)fail();receiver.slots.set(receiver.length++,value);return scalar(receiver.length);
                    }
                    if(node.callee?.type!=='Identifier'||!shape(node.callee,['type','name']))fail();
                    const target=syntax.declarationAt(node.callee);
                    if(!target||target.type!=='FunctionDeclaration')fail();return invoke(target,node.args.map(arg=>expression(arg,state,frame)),state);
                }
                if(node.type==='Assignment'){
                    if(!shape(node,['type','op','left','right'])||node.op!=='=')fail();
                    if(node.left?.type==='Identifier'){
                        if(!shape(node.left,['type','name']))fail();const value=expression(node.right,state,frame);write(binding(node.left),value,state,frame);return value;
                    }
                    if(node.left?.type!=='Index'||!shape(node.left,['type','object','index']))fail();
                    const receiver=array(expression(node.left.object,state,frame),state),index=numberIndex(expression(node.left.index,state,frame)),value=expression(node.right,state,frame);
                    if(value.kind!=='scalar')fail();receiver.slots.set(index,value);if(index>=receiver.length)receiver.length=index+1;return value;
                }
                fail();
            };
            const declaration=(node,state,frame,top=false)=>{
                if(!declarationShape(node))fail();
                for(const item of node.decls){
                    const b=declared(node,item);if(b===entry&&item!==decl)fail();
                    write(b,item.init?expression(item.init,state,frame,top):scalar(undefined),state,frame,true);
                }
            };
            const simple=(node,state,frame)=>{
                tick();if(node?.type==='Declaration')return declaration(node,state,frame);
                if(node?.type!=='ExpressionStatement'||!shape(node,['type','expr']))fail();expression(node.expr,state,frame);
            };
            for(const node of program.body.slice(0,-1)){
                if(node.type==='FunctionDeclaration'){if(!fnShape(node))fail();continue;}
                declaration(node,state,null,true);
            }
            state.frames.set(rootFrame,new Map());
            const sequence=(nodes,states)=>{
                if(!dense(nodes))fail();
                for(const node of nodes){
                    const next=[];
                    for(const state of states){
                        if(node.type==='If'){
                            if(!shape(node,['type','test','consequent','alternate']))fail();
                            const condition=expression(node.test,state,rootFrame);
                            if(condition.kind!=='scalar'||typeof condition.value!=='boolean'||!condition.comparison)fail();
                            next.push(...sequence(node.consequent,[clone(state)]),...sequence(node.alternate||[],[clone(state)]));
                        }else{simple(node,state,rootFrame);next.push(state);}
                    }
                    if(next.length>16)fail();states=next;
                }
                return states;
            };
            const before=fn.body.indexOf(overwrite);if(before<=at)fail();
            sequence(fn.body.slice(0,before),[state]);
            // The actual overwrite is checked, never executed or projected.
            if(!shape(overwrite,['type','expr'])||!shape(overwrite.expr,['type','op','left','right'])||
                !shape(overwrite.expr.left,['type','name'])||!shape(overwrite.expr.right,['type','items'])||!dense(overwrite.expr.right.items))fail();
            // Requiring an actually interpreted declared call is a conservative
            // supported-profile limit, not evidence that call-free gaps are
            // unsafe. Generic method/index-only gaps keep their old barrier.
            return ordinaryCalls?overwrite:null;
        };
        return Object.freeze({current,overwrite(decl){
            if(!decl||typeof decl!=='object'||!current())return null;
            if(!cache.has(decl)){let result=null;try{result=compute(decl);}catch{}cache.set(decl,result);}
            return current()?cache.get(decl):null;
        }});
    }catch{return denied;}
}
