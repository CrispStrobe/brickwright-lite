import {analyseCallableBindings} from './callable-bindings.js';
import {GENERATED_HELPER_PROFILES,inspectGeneratedHelperBindings} from './generated-helper-recognition.js';

// Negative execution-owner evidence only. No caller-supplied root/callee table
// or producer type can enroll a facade, and no value/init fact is returned.
const issued=new WeakMap(),denied=Object.freeze({current:()=>true,isUnreachable:()=>false});
const get=WeakMap.prototype.get,put=WeakMap.prototype.set,apply=Reflect.apply;
const metadata=new Set(['originalBody','parameterDefaults','paramTypes','typeParameters','returnType','assertedType','ordinaryParameterDefaultNames','bwProcedureConstraintSource']);
const safe=name=>typeof name==='string'&&name.length>0&&!['__proto__','constructor','prototype'].includes(name)&&!Object.hasOwn(Object.prototype,name);
const sdkCalls=new Map([
    ['pause',1],['randint',2],['screen.fill',1],['screen.fillRect',5],
    ['Math.round',1],['Math.floor',1],['Math.ceil',1],['Math.abs',1],
    ['Math.randomRange',2],['Math.min',2],['Math.max',2],['Math.atan2',2],['Math.sqrt',1]
]);
const roots=new Set(['screen','Math']);
const nodeTypes=new Set(['Program','FunctionDeclaration','Declaration','ExpressionStatement','Identifier','Number','String','Boolean','Null','Undefined','Parenthesized','Binary','Logical','Conditional','Assignment','Update','Unary','Call','Member','Index','Array','Return','If','For','ForOf','ForIn','While','DoWhile','Block','Break','Continue','Empty','EmptyStatement','ThrowStatement','NativeArrayValueBinary']);
const path=n=>n?.type==='Identifier'?n.name:n?.type==='Member'&&!n.optional?path(n.object)+'.'+n.name:null;
const root=n=>n?.type==='Identifier'?n:n?.type==='Member'||n?.type==='Index'?root(n.object):null;

export function closedOrdinarySourceEntryFor(program,facade){
    const row=apply(get,issued,[facade]);return row?.program===program&&row.facade.current()?row.facade:null;
}

export function createClosedOrdinarySourceEntry(program){
    const syntax=inspectGeneratedHelperBindings(program,GENERATED_HELPER_PROFILES.ordinary);
    if(!syntax.isCurrent()||program?.type!=='Program'||!Array.isArray(program.body))return denied;
    // The first slice deliberately excludes capabilities which could supply
    // an independent entry. Existing validators still handle these programs.
    const owners=new WeakMap(),parents=new WeakMap(),nodes=[],functions=new Map(),edges=new Map();let valid=true;
    const visit=(n,owner=null,parent=null)=>{
        if(!n||typeof n!=='object')return;
        if(Array.isArray(n)){for(const child of n)visit(child,owner,parent);return;}
        if(typeof n.type==='string'&&!nodeTypes.has(n.type))valid=false;
        if(n.exported||['Namespace','Class','FunctionExpression','Unknown','Object','New','Spread'].includes(n.type))valid=false;
        if(n.type==='FunctionDeclaration'){
            if(parent!==program||!safe(n.name)||functions.has(n.name)||!Array.isArray(n.params)||
                n.params.some(name=>!safe(name))||new Set(n.params).size!==n.params.length)valid=false;
            for(const row of [n,n.params||{}])if(Object.hasOwn(row,'restParam')||
                ['optionalParams','parameterDefaults','ordinaryParameterDefaultNames','typeParameters','genericParams'].some(key=>row[key]?.length)||
                ['async','isAsync','generator','isGenerator'].some(key=>row[key]))valid=false;
            functions.set(n.name,n);edges.set(n,new Set());owner=n;
        }
        owners.set(n,owner);parents.set(n,parent);nodes.push({node:n,parent});
        for(const [key,value]of Object.entries(n))if(!metadata.has(key))visit(value,owner,n);
    };
    visit(program);if(!valid)return denied;
    // Prefix hooks or other host functions in retained metadata cannot create
    // source calls outside this actual flat program's entry inventory.
    const seen=new WeakSet();const data=n=>{
        if(typeof n==='function'){valid=false;return;}if(!n||typeof n!=='object'||seen.has(n))return;seen.add(n);
        for(const key of Reflect.ownKeys(n)){const d=Object.getOwnPropertyDescriptor(n,key);if(!d||!Object.hasOwn(d,'value')){valid=false;return;}data(d.value);}
    };data(program);if(!valid)return denied;
    const lexical=analyseCallableBindings(program),byBinding=new Map();
    for(const [name,fn]of functions){const b=lexical.global.names.get(name);if(!b||b.node!==fn||b.kind!=='function'||b.written)return denied;byBinding.set(b,fn);}
    const top=new Set(),binding=n=>lexical.references.get(n),sdkRoot=n=>{const r=root(n);return r?.type==='Identifier'&&!binding(r)&&roots.has(r.name);};
    const unwrap=n=>n?.type==='Parenthesized'?unwrap(n.expression):n;
    // Entry neutrality is independent of storage readiness. Follow actual
    // lexical alias writers, including the exporter's null/reset/allocation
    // sequence; a type spelling never supplies a native receiver.
    const storage=new Map(lexical.bindings.map(b=>[b,{writers:[b.node?.init||{type:'Undefined'}],aliases:new Set()}]));
    const link=(b,value)=>{value=unwrap(value);const other=value?.type==='Identifier'?binding(value):null;
        if(storage.has(b)&&storage.has(other)){storage.get(b).aliases.add(other);storage.get(other).aliases.add(b);}};
    for(const b of lexical.bindings)link(b,b.node?.init);
    for(const {node:n}of nodes){
        if(n.type==='Declaration')for(const decl of n.decls||[]){
            let scope=lexical.scopes.get(n);while(scope&&!scope.names.has(decl.name))scope=scope.parent;
            const b=scope?.names.get(decl.name);if(b&&b.node!==decl)storage.get(b)?.writers.push({type:'Unknown'});
        }
        const left=n.type==='Assignment'?n.left:n.type==='Update'?n.argument:null;
        if(left?.type!=='Identifier')continue;const b=binding(left),row=storage.get(b);if(!row)continue;
        row.writers.push(n.type==='Assignment'&&n.op==='='?n.right:{type:'Unknown'});link(b,n.right);
    }
    const nativeArray=n=>{
        if(n?.type!=='Identifier')return false;const first=binding(n);if(!storage.has(first))return false;
        const component=new Set([first]),pending=[first];let allocation=false;
        while(pending.length)for(const b of storage.get(pending.pop()).aliases)if(!component.has(b)){component.add(b);pending.push(b);}
        for(const b of component){
            if(!['global','local'].includes(b.kind)||lexical.bindings.some(other=>other!==b&&other.node===b.node))return false;
            for(const raw of storage.get(b).writers){const value=unwrap(raw);
                if(value?.type==='Array'){allocation=true;continue;}
                if(['Null','Undefined'].includes(value?.type))continue;
                if(value?.type==='Identifier'&&component.has(binding(value)))continue;
                return false;
            }
        }
        if(!allocation)return false;
        for(const {node:value,parent}of nodes){
            if(value.type!=='Identifier'||!component.has(binding(value)))continue;
            if(parent?.type==='Member'&&parent.object===value){
                const usage=parents.get(parent);
                if(parent.name==='length'&&!(usage?.type==='Assignment'&&usage.left===parent||usage?.type==='Update'))continue;
                if(parent.name==='push'&&usage?.type==='Call'&&usage.callee===parent&&!usage.optional)continue;
                return false;
            }
            if(parent?.type==='Index'&&parent.object===value){
                // A literal named property is not an element access. Dynamic
                // element consumers retain their existing independent proofs.
                if(unwrap(parent.index)?.type==='String')return false;
                continue;
            }
            if(parent?.type==='Assignment'&&parent.op==='='&&
                (parent.left===value||parent.right===value&&parent.left?.type==='Identifier'&&component.has(binding(parent.left))))continue;
            if(parent?.init===value&&component.has(lexical.bindings.find(b=>b.node===parent)))continue;
            return false;
        }
        return true;
    };
    for(const {node:n,parent}of nodes){
        if(n.type==='Declaration'&&(n.decls||[]).some(decl=>functions.has(decl.name)))return denied;
        if(n.type==='Identifier'){
            const b=binding(n);
            if(!b&&roots.has(n.name)&&!(parent?.type==='Member'&&parent.object===n))return denied;
            if(byBinding.has(b)&&!(parent?.type==='Call'&&parent.callee===n&&!parent.isNew&&!parent.optional&&!parent.typeArguments?.length))return denied;
            if(!b&&!roots.has(n.name)&&!sdkCalls.has(n.name)&&!['undefined','NaN','Infinity'].includes(n.name))return denied;
            if(!b&&sdkCalls.has(n.name)&&!(parent?.type==='Call'&&parent.callee===n))return denied;
        }
        const left=n.type==='Assignment'?n.left:n.type==='Update'||n.type==='Unary'&&n.op==='delete'?n.argument:null;
        if(left&&sdkRoot(left))return denied;
        if(n.type!=='Call')continue;
        if(n.isNew||n.constructorCall||n.optional||n.typeArguments?.length||!Array.isArray(n.args)||n.args.some(arg=>arg?.type==='Spread'))return denied;
        const fn=n.callee?.type==='Identifier'?byBinding.get(binding(n.callee)):null;
        if(fn){if(n.args.length!==fn.params.length)return denied;(owners.get(n)?edges.get(owners.get(n)):top).add(fn);continue;}
        const name=path(n.callee),arity=sdkCalls.get(name);
        if(arity!==undefined){
            if(n.args.length!==arity||n.callee.type==='Identifier'&&binding(n.callee)||n.callee.type==='Member'&&!sdkRoot(n.callee))return denied;
            continue;
        }
        // This is entry-neutral native storage, never an Array/init issuer.
        // Aliases or unknown receiver writers conservatively decline it.
        if(n.callee?.type==='Member'&&!n.callee.optional&&n.callee.name==='push'&&n.args.length===1&&nativeArray(n.callee.object))continue;
        return denied;
    }
    const reachable=new Set(top),pending=[...top];
    while(pending.length){const fn=pending.pop();for(const next of edges.get(fn)||[])if(!reachable.has(next)){reachable.add(next);pending.push(next);}}
    let expired=false;
    const current=()=>{if(expired)return false;try{if(!syntax.isCurrent())expired=true;}catch(error){expired=true;throw error;}return !expired;};
    const facade=Object.freeze({current,isUnreachable:node=>current()&&owners.has(node)&&!!owners.get(node)&&!reachable.has(owners.get(node))});
    apply(put,issued,[facade,{program,facade}]);return facade;
}
