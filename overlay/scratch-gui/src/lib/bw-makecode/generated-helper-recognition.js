import {parseMakeCodeTs} from './ts-import.js';
import {analyseCallableBindings} from './callable-bindings.js';
import {LEGACY_PARSE_SOURCE,LEGACY_JSON_SOURCE,ARRAY_ACCESS_SOURCE} from './legacy-array-values.js';

// Eligibility for a compiler-owned synchronous operation, not a public proof
// of arbitrary objects or hostile realms. These observations are private and
// contain no AST/binding/type results. Captured meta operations do not invoke
// a replacement intrinsic while checking whether the original realm remains.
const aggregateApply=Reflect.apply,aggregateOwnKeys=Reflect.ownKeys;
const aggregateDescriptor=Object.getOwnPropertyDescriptor,aggregatePrototype=Object.getPrototypeOf;
const aggregateSame=Object.is,aggregateHasOwn=Object.prototype.hasOwnProperty;
const aggregateSet=Set,aggregateSetValues=Set.prototype.values;
const aggregateSetAdd=Set.prototype.add,aggregateSetHas=Set.prototype.has;
const aggregateSetNext=aggregatePrototype(aggregateApply(aggregateSetValues,new aggregateSet(),[])).next;
const aggregateGlobalObject=globalThis;
const aggregateGlobals=[{name:'globalThis',descriptor:aggregateDescriptor(aggregateGlobalObject,'globalThis')}];
const aggregateIntrinsicRows=[];
const aggregateRemember=target=>{
    for(let i=0;i<aggregateIntrinsicRows.length;i++)if(aggregateIntrinsicRows[i].target===target)return;
    const keys=aggregateOwnKeys(target),descriptors=[];
    for(let i=0;i<keys.length;i++)descriptors[i]=aggregateDescriptor(target,keys[i]);
    aggregateIntrinsicRows[aggregateIntrinsicRows.length]={target,parent:aggregatePrototype(target),keys,descriptors};
};
for(const name of ['Object','Array','Reflect','Map','Set','WeakMap','WeakSet','Number','String','Boolean',
    'RegExp','JSON','Math','Error','TypeError','SyntaxError','RangeError','Function','Symbol',
    'parseInt','parseFloat','isNaN','isFinite']){
    const d=aggregateDescriptor(aggregateGlobalObject,name);aggregateGlobals[aggregateGlobals.length]={name,descriptor:d};
    const value=d.value;aggregateRemember(value);
    const p=aggregateDescriptor(value,'prototype');if(p&&aggregateApply(aggregateHasOwn,p,['value']))aggregateRemember(p.value);
}
// Iteration can escape through a replaced iterator or next method too. Include
// each actual iterator's complete own descriptors and prototype chain.
for(const iterator of [[][Symbol.iterator](),new Map()[Symbol.iterator](),new Set()[Symbol.iterator](),''[Symbol.iterator]()]){
    for(let p=aggregatePrototype(iterator);p;p=aggregatePrototype(p))aggregateRemember(p);
}
const aggregateDescriptorKeys=['value','writable','get','set'];
const aggregateEqualDescriptor=(a,b)=>{
    if(!a||!b||a.enumerable!==b.enumerable||a.configurable!==b.configurable)return false;
    for(let index=0;index<aggregateDescriptorKeys.length;index++){
        const key=aggregateDescriptorKeys[index];
        const x=aggregateApply(aggregateHasOwn,a,[key]),y=aggregateApply(aggregateHasOwn,b,[key]);
        if(x!==y||x&&!aggregateSame(a[key],b[key]))return false;
    }
    return true;
};
const aggregateIntrinsicsCurrent=()=>{
    for(let i=0;i<aggregateGlobals.length;i++){
        const r=aggregateGlobals[i];if(!aggregateEqualDescriptor(aggregateDescriptor(aggregateGlobalObject,r.name),r.descriptor))return false;
    }
    for(let i=0;i<aggregateIntrinsicRows.length;i++){
        const r=aggregateIntrinsicRows[i],keys=aggregateOwnKeys(r.target);
        if(aggregatePrototype(r.target)!==r.parent||keys.length!==r.keys.length)return false;
        for(let j=0;j<keys.length;j++)if(!aggregateSame(keys[j],r.keys[j])||
            !aggregateEqualDescriptor(aggregateDescriptor(r.target,keys[j]),r.descriptors[j]))return false;
    }
    return true;
};
const aggregateCopyMembers=input=>{
    const output=new aggregateSet(),iterator=aggregateApply(aggregateSetValues,input,[]);
    for(;;){const row=aggregateApply(aggregateSetNext,iterator,[]);if(row.done)return output;
        aggregateApply(aggregateSetAdd,output,[row.value]);}
};

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
function sameGeneratedData(a,b,names=new Map()){
    if(!a||!b||typeof a!=='object'||typeof b!=='object')return Object.is(a,b);
    if(Array.isArray(a)!==Array.isArray(b))return false;
    const ak=Reflect.ownKeys(a),bk=Reflect.ownKeys(b);
    if(ak.length!==bk.length||ak.some(k=>!bk.includes(k)))return false;
    return ak.every(key=>{const x=Object.getOwnPropertyDescriptor(a,key),y=Object.getOwnPropertyDescriptor(b,key);
        if(!x||!y||!Object.hasOwn(x,'value')||!Object.hasOwn(y,'value')||x.enumerable!==y.enumerable||
            x.configurable!==y.configurable||x.writable!==y.writable)return false;
        const value=key==='name'&&['FunctionDeclaration','Identifier'].includes(a.type)&&names.has(x.value)?names.get(x.value):x.value;
        return sameGeneratedData(value,y.value,names);
    });
}
// A necessary syntax check only: callers still need the current binding proof.
export function hasGeneratedHelperShape(fn,source,profile,names=new Map()){
    const expected=canonical(source,profile);return !!expected&&sameGeneratedData(fn,expected,names);
}

/** Binding/currentness only: this proof creates no value or type facts. */
export function inspectGeneratedHelperBindings(program,profile){
    return buildGeneratedHelperBindings(program,profile,false);
}
// fastAmbient is chosen only by the complete compiler operation below. No
// caller-selected mode or proof object from this branch leaves the module.
function buildGeneratedHelperBindings(program,profile,fastAmbient){
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
        if(node.type==='Identifier'&&['eval','Function','Reflect','globalThis','window','arguments'].includes(node.name)||
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
    for(const n of nodes)if(n.type==='Template'&&(typeof n.value!=='string'||n.value.includes('${')||!['img','hex'].includes(n.tag)))valid=false;
    // Default initializers are executable in these actual parser profiles.
    // Join retained metadata to the complete actual body prologue before a
    // lexical normalizer can hide it. Pure/nonliteral defaults remain valid;
    // their actual calls and effects are included in the ordinary body census.
    if(valid)for(const n of nodes)if(Array.isArray(n.params)){
        const defaults=Object.getOwnPropertyDescriptor(n.params,'parameterDefaults')?.value||[];
        if(!Array.isArray(defaults)||Object.hasOwn(n,'parameterDefaults')&&!sameGeneratedData(n.parameterDefaults,defaults)){
            valid=false;break;
        }
        if(!defaults.length)continue;
        if(!Array.isArray(n.body)||Object.hasOwn(n,'parameterDefaultPrologue')&&n.parameterDefaultPrologue!==true){valid=false;break;}
        const expected=defaults.map(({name,value})=>({type:'If',test:{type:'Binary',op:'===',left:{type:'Identifier',name},right:{type:'Undefined'}},
            consequent:[{type:'ExpressionStatement',expr:{type:'Assignment',op:'=',left:{type:'Identifier',name},right:value}}],alternate:[]}));
        if(!sameGeneratedData(n.body.slice(0,expected.length),expected)){valid=false;break;}
    }
    const lexical=valid?analyseCallableBindings(program):null;
    // A declared cell named self is not the ambient global receiver. Resolve
    // its actual owner; this spelling never supplies a value/type fact.
    if(valid)for(const n of nodes)if(n.type==='Identifier'&&n.name==='self'){
        const own=lexical.references.get(n);
        if(!own||!['global','local','parameter'].includes(own.kind))valid=false;
    }
    // Literal tags are scalar AST spellings rather than Identifier nodes.
    // Reject an actual lexical shadow or any ambient tag reference/escape,
    // while unrelated method/formal names cannot shadow a root literal.
    if(valid)for(const n of nodes)if(n.type==='Template'){
        let shadow=false;
        for(let owner=lexical.scopes.get(n);owner;owner=owner.parent)
            if(owner.names.has(n.tag)){shadow=true;break;}
        if(shadow||nodes.some(other=>other.type==='Identifier'&&other.name===n.tag&&!lexical.references.get(other)))valid=false;
    }
    const rootBinding=fn=>fn?.type==='FunctionDeclaration'&&program.body.includes(fn)&&counts.get(fn.name)===1&&
        lexical.global.names.get(fn.name)?.node===fn&&!lexical.global.names.get(fn.name).written;
    const root=fn=>current()&&rootBinding(fn);
    // The callable analyser intentionally omits proved literal default
    // prologues. Their two actual parameter references still participate in
    // this complete executable census, bound to that exact function scope.
    const defaultReferences=new WeakMap();
    if(valid)for(const fn of nodes)if(fn.type==='FunctionExpression'&&fn.parameterDefaultPrologue===true){
        const defaults=fn.parameterDefaults||[],scope=lexical.scopes.get(fn);
        for(let i=0;i<defaults.length;i++){
            const own=scope?.names.get(defaults[i].name),st=fn.body[i];
            if(own?.node===fn&&own.kind==='parameter'){
                defaultReferences.set(st.test.left,own);defaultReferences.set(st.consequent[0].expr.left,own);
            }
        }
    }
    const binding=node=>lexical?.references.get(node)||defaultReferences.get(node);
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
        // Only the complete compiler operation owns this branch and its Sets.
        // Public callers retain every original root/current/has observation.
        let ownedInternal=null;
        if(fastAmbient){
            if(!current())return false;
            ownedInternal=aggregateCopyMembers(internal);
            if(!current())return false;
        }
        const member=fn=>aggregateApply(aggregateSetHas,ownedInternal,[fn]);
        const ambientWithin=node=>{
            for(let p=parents.get(node);p;p=parents.get(p))if(member(p))return true;
            return false;
        };
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
                return (fastAmbient?member(fn):internal.has(fn))&&fn?.params?.length===1&&fn.body?.length===2&&fn.body[0].type==='Declaration'&&
                    fn.body[0].decls.length===1&&fn.body[0].decls[0].init?.type==='Identifier'&&fn.body[0].decls[0].init.name===fn.params[0]&&
                    fn.body[1].type==='Return'&&fn.body[1].value?.type==='Identifier'&&fn.body[1].value.name===fn.body[0].decls[0].name&&arrays(n.args[0],seen);
            }
            return false;
        };
        const path=n=>n?.type==='Identifier'?n.name:n?.type==='Member'?path(n.object)+'.'+n.name:null;
        for(const n of nodes){
            if(fastAmbient?ambientWithin(n):within(n,internal))continue;
            if(n.type==='Call'){
                if(n.isNew||n.constructorCall||n.typeArguments?.length||n.args?.some(a=>a?.type==='Spread'))return false;
                if(n.callee?.type==='Identifier'){
                    const b=binding(n.callee);
                    if(b){if(b.node?.type!=='FunctionDeclaration'||!(fastAmbient?rootBinding(b.node):root(b.node)))return false;}
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
        matches:(fn,source,names)=>current()&&program.body.includes(fn)&&hasGeneratedHelperShape(fn,source,profile,names),
        unbound:node=>current()&&node?.type==='Identifier'&&!binding(node)&&!counts.has(node.name),
        unique:name=>current()&&counts.get(name)===1,profile});
}

/**
 * Compiler INTERNAL complete operation. Input is the actual synchronous parser
 * result after only owned normalizers, before external publication. It is not
 * a hostile/foreign AST entry or an unforgeable origin token. No options,
 * caller Sets, recipes, callbacks or private proof objects cross this boundary.
 * Later intrinsic changes select the unchanged slow proof path. The module
 * initializes in the normal compiler realm; this does not authenticate a realm
 * already tampered with before module initialization.
 */
export function normalizeCompilerOwnedLegacyArrayHelpers(program,profile){
    const proof=buildGeneratedHelperBindings(program,profile,aggregateIntrinsicsCurrent());
    if(!proof.isCurrent())return program;
    const recipes=[['__bwNamedParseValue',LEGACY_PARSE_SOURCE,'LegacyParsedValue'],
        ['__bwNamedJsonValue',LEGACY_JSON_SOURCE,'LegacyJsonValue'],
        ['__bwArrayAccess',ARRAY_ACCESS_SOURCE,'NativeArrayAccess']];
    const candidates=new Map();
    // Reject impossible recipe shapes before rescanning the whole binding snapshot.
    // Shape alone grants no rewrite: every selected helper still needs the original
    // current root, exact match, closed-use and call proofs below.
    for(const fn of program.body)if(fn?.type==='FunctionDeclaration')for(const [base,source,type]of recipes){
        const names=new Map([[fn.name,base]]);
        if(hasGeneratedHelperShape(fn,source,profile,names)&&proof.root(fn)&&proof.matches(fn,source,names))
            candidates.set(fn,{type});
    }
    // A retained helper body becomes an external consumer of its dependencies.
    // Recompute until removing one declaration cannot strand a retained caller.
    const selected=new Set(candidates.keys());let changed;
    do {changed=false;for(const fn of selected)if(!proof.closed(fn,selected)||proof.calls(fn,[1],selected)===null){selected.delete(fn);changed=true;}}while(changed);
    const calls=new Map();for(const fn of selected)for(const call of proof.calls(fn,[1],selected))calls.set(call,candidates.get(fn));
    if(!selected.size||!proof.isCurrent())return program;
    const rewrite=node=>{
        if(!node||typeof node!=='object')return node;
        if(Array.isArray(node))return mapGeneratedSourceArray(node,rewrite);
        if(calls.has(node))return {type:calls.get(node).type,value:rewrite(node.args[0])};
        return Object.fromEntries(Object.entries(node).map(([key,value])=>[key,rewrite(value)]));
    };
    return rewrite({...program,body:program.body.filter(fn=>!selected.has(fn))});
}
