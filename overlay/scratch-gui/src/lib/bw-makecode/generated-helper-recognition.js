import {parseMakeCodeTs} from './ts-import.js';
import {analyseCallableBindings} from './callable-bindings.js';

const common={parameterDefaults:true,retainParentheses:true};
export const GENERATED_HELPER_PROFILES=Object.freeze({
    direct:Object.freeze({...common}),
    ordinary:Object.freeze({...common,retainWhenUsed:true,retainClassHeritage:true,
        retainOrdinaryDefaultProvenance:true,retainPrimitiveProcedureDefaults:true}),
    metadata:Object.freeze({...common,retainWhenUsed:true,retainClassHeritage:true,
        retainOrdinaryDefaultProvenance:true,retainCallableMetadata:true})
});
export function mapGeneratedSourceArray(array,mapper){
    const result=array.map(mapper);
    for(const key of Reflect.ownKeys(array)){
        if(key==='length'||typeof key==='string'&&/^(0|[1-9][0-9]*)$/.test(key))continue;
        const d=Object.getOwnPropertyDescriptor(array,key);
        if(!['optionalParams','parameterDefaults','parameterProperties'].includes(key)||!d||!Object.hasOwn(d,'value')||
            d.enumerable||d.writable||d.configurable||!Array.isArray(d.value))
            throw new Error('Generated helper normalization requires the actual parser parameter metadata');
        Object.defineProperty(result,key,{...d,value:mapper(d.value)});
    }
    return result;
}
const profiles=new Set(Object.values(GENERATED_HELPER_PROFILES));
const metadata=new Set(['originalBody','parameterDefaults','paramTypes','typeParameters','returnType',
    'assertedType','ordinaryParameterDefaultNames','bwProcedureConstraintSource']);
const templates=new Map();
function canonical(source,profile){
    if(!profiles.has(profile))return null;
    let cache=templates.get(profile);if(!cache)templates.set(profile,cache=new Map());
    if(!cache.has(source))cache.set(source,parseMakeCodeTs(source,profile).body.find(n=>n.type==='FunctionDeclaration'));
    return cache.get(source);
}
// Only declaration/Identifier roles may change a helper name. Member names,
// record keys, strings, types and every default/body field remain exact.
function matchesGeneratedFunction(fn,source,profile,names=new Map()){
    const expected=canonical(source,profile);if(!expected)return false;
    const equal=(a,b)=>{
        if(!a||!b||typeof a!=='object'||typeof b!=='object')return Object.is(a,b);
        if(Array.isArray(a)!==Array.isArray(b))return false;
        const ak=Reflect.ownKeys(a),bk=Reflect.ownKeys(b);
        if(ak.length!==bk.length||ak.some(k=>!bk.includes(k)))return false;
        return ak.every(key=>{const x=Object.getOwnPropertyDescriptor(a,key),y=Object.getOwnPropertyDescriptor(b,key);
            if(!x||!y||!Object.hasOwn(x,'value')||!Object.hasOwn(y,'value')||x.enumerable!==y.enumerable||
                x.configurable!==y.configurable||x.writable!==y.writable)return false;
            const value=key==='name'&&['FunctionDeclaration','Identifier'].includes(a.type)&&names.has(x.value)?names.get(x.value):x.value;
            return equal(value,y.value);
        });
    };
    return equal(fn,expected);
}

/** Binding/currentness only: this proof creates no value or type facts. */
export function inspectGeneratedHelperBindings(program,profile){
    const snapshots=[],seen=new WeakSet(),active=new WeakSet(),nodes=[],parents=new WeakMap(),counts=new Map();let valid=profiles.has(profile);
    const capture=(value,prefixAllowed=false,parameterArray=false)=>{
        if(typeof value==='function'){if(!prefixAllowed)valid=false;return;}
        if(!value||typeof value!=='object')return;
        if(active.has(value)){valid=false;return;}if(seen.has(value))return;seen.add(value);active.add(value);
        const proto=Object.getPrototypeOf(value);if(proto!==Object.prototype&&proto!==Array.prototype&&proto!==null)valid=false;
        const keys=Reflect.ownKeys(value),rows=[];
        for(const name of keys){const d=Object.getOwnPropertyDescriptor(value,name);
            if(typeof name!=='string'||!d||!Object.hasOwn(d,'value')||!d.enumerable&&
                !(Array.isArray(value)&&(name==='length'||parameterArray&&['optionalParams','parameterDefaults','parameterProperties'].includes(name)))){valid=false;continue;}
            rows.push([name,d]);
            if(value===program&&name==='bwProcedureConstraintSource'){
                const envelope=d.value,fields=envelope&&typeof envelope==='object'?Reflect.ownKeys(envelope):[];
                const prefix=fields.length===1&&fields[0]==='prefix'?Object.getOwnPropertyDescriptor(envelope,'prefix'):null;
                if(!prefix||!Object.hasOwn(prefix,'value')||typeof prefix.value!=='function')valid=false;
                capture(envelope,true);
            }else capture(d.value,prefixAllowed&&name==='prefix',name==='params');
        }
        snapshots.push({value,proto,keys,rows});active.delete(value);
    };
    capture(program);
    const executable=new WeakSet();
    const walk=(node,parent=null)=>{
        if(!node||typeof node!=='object')return;
        if(executable.has(node)){valid=false;return;}executable.add(node);
        if(Array.isArray(node)){node.forEach(n=>walk(n,parent));return;}
        nodes.push(node);parents.set(node,parent);
        if(['Unknown','Try','TryCatch','CatchClause','With'].includes(node.type))valid=false;
        if(node.type==='Identifier'&&['eval','Function','Reflect','globalThis','window','self','arguments'].includes(node.name)||
            node.type==='Member'&&node.name==='constructor')valid=false;
        for(const [key,value]of Object.entries(node))if(!metadata.has(key))walk(value,node);
    };
    // No recursive lexical analysis sees cycles, shared executable nodes or accessors.
    if(valid)walk(program);
    const current=()=>valid&&snapshots.every(({value,proto,keys,rows})=>{
        const actual=Reflect.ownKeys(value);if(Object.getPrototypeOf(value)!==proto||actual.length!==keys.length||actual.some((k,i)=>k!==keys[i]))return false;
        return rows.every(([key,d])=>{const a=Object.getOwnPropertyDescriptor(value,key);return a&&Object.hasOwn(a,'value')&&
            Object.is(a.value,d.value)&&a.enumerable===d.enumerable&&a.configurable===d.configurable&&a.writable===d.writable;});
    });
    const add=name=>{if(typeof name==='string')counts.set(name,(counts.get(name)||0)+1);};
    for(const n of nodes){
        if(['FunctionDeclaration','Class','Enum','ForOf','ForIn'].includes(n.type))add(n.name);
        if(n.type==='Declaration')for(const d of n.decls||[])add(d.name);
        if(Array.isArray(n.params))n.params.forEach(add);
        if(n.type==='FunctionExpression'&&n.name)add(n.name);
    }
    // Tagged callees are scalar AST spellings, not Identifier references.
    // Only the actual unshadowed literal tags have a closed effect here.
    for(const n of nodes)if(n.type==='Template'&&(!['img','hex'].includes(n.tag)||counts.has(n.tag)||
        nodes.some(other=>other.type==='Identifier'&&other.name===n.tag)))valid=false;
    const lexical=valid?analyseCallableBindings(program):null;
    const root=fn=>current()&&fn?.type==='FunctionDeclaration'&&program.body.includes(fn)&&counts.get(fn.name)===1&&
        lexical.global.names.get(fn.name)?.node===fn&&!lexical.global.names.get(fn.name).written;
    const binding=node=>lexical?.references.get(node);
    const within=(node,set)=>{for(let p=parents.get(node);p;p=parents.get(p))if(set.has(p))return true;return false;};
    const calls=(fn,arity,internal=new Set())=>{
        if(!root(fn))return null;const found=[];
        for(const n of nodes)if(n.type==='Identifier'&&binding(n)?.node===fn){
            if(within(n,internal))continue;
            const parent=parents.get(n);
            if(parent?.type!=='Call'||parent.callee!==n||parent.isNew||parent.constructorCall||parent.typeArguments?.length||
                !arity.includes(parent.args?.length)||parent.args.some(a=>a?.type==='Spread'))return null;
            found.push(parent);
        }
        return current()?found:null;
    };
    const builtinRoots=new Set(['Array','Object','JSON','Math','control','Infinity','NaN','undefined','isNaN']);
    const stableBuiltin=name=>!counts.has(name)&&nodes.every(n=>{
        if(n.type!=='Identifier'||n.name!==name)return true;
        if(binding(n))return false;
        let top=n,parent=parents.get(top);
        while(parent?.type==='Member'&&parent.object===top){top=parent;parent=parents.get(top);}
        if(parent?.type==='Assignment'&&parent.left===top||parent?.type==='Update'||parent?.type==='Unary'&&parent.op==='delete')return false;
        // Passing the namespace itself to another consumer escapes its methods.
        return top!==n||parent?.type==='Call'&&parent.callee===n||['Infinity','NaN','undefined'].includes(name);
    });
    const ambient=(internal=new Set())=>{
        const namespaceCalls=new Set(['Array.isArray','Object.keys','JSON.parse','JSON.stringify','Math.round','Math.floor','Math.ceil','Math.min','Math.max','Math.abs','Math.random','Math.percentChance',
            'console.log','game.onUpdate','game.onUpdateInterval','control.runInParallel','control.panic','basic.pause','music.stopAllSounds',
            'info.setScore','info.changeScoreBy','info.score','info.startCountdown','info.onCountdownEnd','sprites.create','sprites.onCreated','sprites.onDestroyed','sprites.onOverlap']);
        const methodCalls=new Set(['push','pop','shift','unshift','insertAt','removeAt','indexOf','reverse']);
        const writers=new Map(),add=(b,value)=>{if(b){if(!writers.has(b))writers.set(b,[]);writers.get(b).push(value);}};
        for(const n of nodes){
            if(n.type==='Declaration')for(const d of n.decls)add(lexical?.scopes.get(n)?.names.get(d.name),d.init);
            if(n.type==='Assignment'&&n.left?.type==='Identifier')add(binding(n.left),n.op==='='?n.right:null);
            if(n.type==='Update'&&n.argument?.type==='Identifier')add(binding(n.argument),null);
        }
        const containers=(n,seen=new Set())=>{
            if(n?.type==='Array')return [n];
            if(n?.type!=='Identifier')return null;
            const b=binding(n);if(!b||seen.has(b)||!writers.has(b))return null;
            const next=new Set(seen);next.add(b);const values=writers.get(b).filter(v=>v?.type!=='Null'&&v?.type!=='Undefined');
            if(!values.length)return null;
            const groups=values.map(v=>containers(v,next));return groups.every(Boolean)?groups.flat():null;
        };
        const arrays=(n,seen=new Set())=>{
            if(n?.type==='Array')return true;
            if(n?.type==='Identifier'){
                const b=binding(n);if(!b||seen.has(b)||!writers.has(b))return false;
                const next=new Set(seen);next.add(b);const values=writers.get(b).filter(v=>v?.type!=='Null'&&v?.type!=='Undefined');
                return values.length>0&&values.every(v=>arrays(v,next));
            }
            if(n?.type==='Index'){
                const values=containers(n.object);
                return !!values?.length&&values.every(v=>v.items?.length&&v.items.every(item=>item.type==='Array'));
            }
            // Exact canonical ArrayAccess only transports its actual argument.
            if(n?.type==='Call'&&n.args?.length===1){
                const fn=binding(n.callee)?.node;
                return internal.has(fn)&&fn?.params?.length===1&&fn.body?.length===2&&fn.body[0].type==='Declaration'&&
                    fn.body[0].decls.length===1&&fn.body[0].decls[0].init?.type==='Identifier'&&fn.body[0].decls[0].init.name===fn.params[0]&&
                    fn.body[1].type==='Return'&&fn.body[1].value?.type==='Identifier'&&fn.body[1].value.name===fn.body[0].decls[0].name&&arrays(n.args[0],seen);
            }
            return false;
        };
        const path=n=>n?.type==='Identifier'?n.name:n?.type==='Member'?path(n.object)+'.'+n.name:null;
        for(const n of nodes){
            if(within(n,internal))continue;
            if(n.type==='Call'){
                if(n.isNew||n.constructorCall||n.typeArguments?.length||n.args?.some(a=>a?.type==='Spread'))return false;
                if(n.callee?.type==='Identifier'){
                    const b=binding(n.callee);
                    if(b){if(b.node?.type!=='FunctionDeclaration'||!root(b.node))return false;}
                    else if(!['pause','isNaN','Number','String','Boolean','parseInt','parseFloat'].includes(n.callee.name)||counts.has(n.callee.name))return false;
                }else if(n.callee?.type==='Member'){
                    let base=n.callee;while(base.type==='Member')base=base.object;
                    if(namespaceCalls.has(path(n.callee))){if(base.type!=='Identifier'||binding(base)||counts.has(base.name))return false;}
                    else if(!methodCalls.has(n.callee.name)||!arrays(n.callee.object))return false;
                }else return false;
            }
            if(n.type==='Assignment'||n.type==='Update'||n.type==='Unary'&&n.op==='delete'){
                const target=n.type==='Assignment'?n.left:n.argument;
                if(target?.type==='Member')return false;
                if(target?.type==='Index'&&(!arrays(target.object)||target.index?.type!=='Number'||!Number.isFinite(Number(target.index.value))))return false;
            }
            if(n.type==='Identifier'&&!binding(n)){
                let top=n,parent=parents.get(top);while(parent?.type==='Member'&&parent.object===top){top=parent;parent=parents.get(top);}
                if(parent?.type==='Call'&&parent.callee===top)continue;
                if(!['undefined','Infinity','NaN'].includes(n.name))return false;
            }
        }
        return current();
    };
    const closed=(fn,internal=new Set([fn]))=>{const own=new Set([fn]);return root(fn)&&ambient(internal)&&nodes.every(n=>{
        if(n.type!=='Identifier'||!within(n,own))return true;
        const owner=binding(n)?.node;
        if(owner)return owner===fn||within(owner,own)||internal.has(owner);
        return builtinRoots.has(n.name)&&stableBuiltin(n.name);
    });};
    return Object.freeze({isCurrent:current,root,calls,closed,ambient,nodes:Object.freeze([...nodes]),parentOf:node=>parents.get(node),
        declarationAt:node=>binding(node)?.node,
        storageReference:(node,name)=>current()&&counts.get(name)===1&&binding(node)===lexical?.global.names.get(name),
        matches:(fn,source,names)=>current()&&program.body.includes(fn)&&matchesGeneratedFunction(fn,source,profile,names),
        unbound:node=>current()&&node?.type==='Identifier'&&!binding(node)&&!counts.has(node.name),
        unique:name=>current()&&counts.get(name)===1,profile});
}
