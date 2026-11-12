import {analyseCallableBindings} from './callable-bindings.js';
import {inspectGeneratedHelperBindings,GENERATED_HELPER_PROFILES} from './generated-helper-recognition.js';
import {physicalUpdateSourceSnapshot} from './physical-update-source-snapshot.js';

// Read as data from the selected target's bundled base/pxt-helpers.ts and
// generated helpers-pxt.js. The existing generator control binds these files.
// Every normal exit with literal String/integer inputs returns NaN or the
// numeric sign*accumulator. No parsing value, finite result or completion is
// inferred, and the original invocation/coercions are never rewritten here.
export const PARSE_INTEGER_PXT_SOURCE_SHA256='e597d3b39d371872ebc8b021b4c63633e36641a8b239797da5cfb507c37da1cb';
export const PARSE_INTEGER_GENERATED_SOURCE_SHA256='6ac018eaeba0cc699a681e111d1c94bb8aa0b3bcdd46eaab9fc4af51f51f8713';

const freeze=Object.freeze,descriptor=Object.getOwnPropertyDescriptor,keys=Reflect.ownKeys;
const hasOwn=Object.hasOwn,isArray=Array.isArray;
const prototype=Object.getPrototypeOf,same=Object.is;
const realm=globalThis,realmAliases=[],realmRows=[];
const rememberRealm=object=>{
    for(let i=0;i<realmRows.length;i++)if(realmRows[i].object===object)return;
    const names=keys(object),fields=[];
    for(let i=0;i<names.length;i++)fields[i]=descriptor(object,names[i]);
    realmRows[realmRows.length]={object,parent:prototype(object),names,fields};
};
for(const name of ['globalThis','Object','Array','Reflect','Map','Set','WeakMap','WeakSet',
    'Number','String','Boolean','JSON','Symbol','Function','RegExp','Math','Error','TypeError',
    'SyntaxError','RangeError','parseInt','parseFloat','isNaN','isFinite']){
    const row=descriptor(realm,name);realmAliases[realmAliases.length]={name,row};
    if(name==='globalThis')continue;
    rememberRealm(row.value);
    const member=descriptor(row.value,'prototype');
    if(member&&hasOwn(member,'value'))rememberRealm(member.value);
}
for(const iterator of [[][Symbol.iterator](),new Map()[Symbol.iterator](),new Set()[Symbol.iterator](),''[Symbol.iterator]()]){
    for(let parent=prototype(iterator);parent;parent=prototype(parent))rememberRealm(parent);
}
const descriptorFields=['value','writable','get','set','enumerable','configurable'];
const sameDescriptor=(a,b)=>{
    if(!a||!b)return a===b;
    for(let i=0;i<descriptorFields.length;i++){
        const key=descriptorFields[i],present=hasOwn(a,key);
        if(present!==hasOwn(b,key)||present&&!same(a[key],b[key]))return false;
    }
    return true;
};
// Captured meta operations and plain loops only: a replaced every/map/iterator
// cannot certify its own realm. Include aliases, prototypes and iterator chains.
const realmCurrent=()=>{
    for(let i=0;i<realmAliases.length;i++){
        const row=realmAliases[i];if(!sameDescriptor(row.row,descriptor(realm,row.name)))return false;
    }
    for(let i=0;i<realmRows.length;i++){
        const row=realmRows[i],names=keys(row.object);
        if(prototype(row.object)!==row.parent||names.length!==row.names.length)return false;
        for(let j=0;j<names.length;j++)if(names[j]!==row.names[j]||!sameDescriptor(row.fields[j],descriptor(row.object,names[j])))return false;
    }
    return true;
};
const denied=()=>freeze({current:()=>false,isNumberCall:()=>false});
const metadata=new Set(['originalBody','parameterDefaults','optionalParams','parameterProperties',
    'paramTypes','returnType','typeParameters','ordinaryParameterDefaultNames','assertedType','calls']);
const forms=new Set(['Program','Declaration','FunctionDeclaration','FunctionExpression','Block',
    'ExpressionStatement','Return','If','While','Break','Continue','Number','String','Boolean',
    'Null','Undefined','Identifier','Binary','Logical','Unary','Assignment','Update','Conditional',
    'Parenthesized','Call','Member']);
const protectedNames=new Set(['parseInt','helpers','game','String','Number','NaN','Infinity',
    'Object','Array','Math','Reflect','eval','Function','globalThis','global','window','self','arguments']);
const binaryOps=new Set(['+','-','*','/','%','**','&','|','^','<<','>>','>>>',
    '===','!==','==','!=','<','>','<=','>=','&&','||','??']);
const assignmentOps=new Set(['=','+=','-=','*=','/=','%=','&=','|=','^=','<<=','>>=','>>>=']);
const identifier=name=>typeof name==='string'&&/^[$A-Z_a-z][$\w]*$/.test(name);
const emptyList=(owner,key)=>!hasOwn(owner,key)||isArray(owner[key])&&owner[key].length===0;
const closedFunction=fn=>isArray(fn.params)&&isArray(fn.body)&&new Set(fn.params).size===fn.params.length&&
    fn.params.every(identifier)&&[fn,fn.params].every(owner=>!hasOwn(owner,'restParam')&&
        !['async','isAsync','generator','isGenerator'].some(key=>owner[key])&&
        ['parameterDefaults','optionalParams','parameterProperties','typeParameters','genericParams',
            'ordinaryParameterDefaultNames'].every(key=>emptyList(owner,key))&&
        (!hasOwn(owner,'paramDefaults')||owner.paramDefaults&&typeof owner.paramDefaults==='object'&&keys(owner.paramDefaults).length===0))&&
    fn.exported!==true;
const plainCall=n=>n?.type==='Call'&&[n.isNew,n.constructorCall,n.optional,n.callee?.optional,n.callee?.computed]
    .every(value=>value===undefined||value===false)&&!hasOwn(n,'typeArguments')&&isArray(n.args)&&
    n.args.every(arg=>arg&&typeof arg==='object'&&arg.type!=='Spread');
const radixLiteral=n=>{
    if(n?.type==='Unary'&&['+','-'].includes(n.op))n=n.argument;
    if(n?.type!=='Number'||typeof n.value!=='string'||
        !/^(?:0[xX][\da-fA-F]+|0[bB][01]+|0[oO][0-7]+|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)$/.test(n.value))return false;
    return Number.isSafeInteger(Number(n.value));
};

// A closed scalar source profile, including the exact zero-argument onUpdate
// boundary used beside parseInt. Unknown calls, SDK/context escapes, boxed
// inputs, Arrays, prototype effects and source evaluation/reflection refuse.
// No source option or callee-name badge can enroll a call without this census.
export function createOrdinaryParseIntegerNumberSource(program){
    try{
        if(!realmCurrent())return denied();
        const syntax=inspectGeneratedHelperBindings(program,GENERATED_HELPER_PROFILES.ordinary);
        if(!syntax.isCurrent())return denied();
        if(!syntax.nodes.some(n=>n.type==='Call'&&n.callee?.type==='Identifier'&&n.callee.name==='parseInt'))return denied();
        const snapshot=physicalUpdateSourceSnapshot(program);
        if(!snapshot||snapshot.opaque.length)return denied();
        const nodes=[],parents=new WeakMap(),seen=new WeakSet();let invalid=false;
        const visit=(value,parent=null)=>{
            if(!value||typeof value!=='object')return;
            if(seen.has(value)){invalid=true;return;}seen.add(value);parents.set(value,parent);
            if(!isArray(value))nodes.push(value);
            for(const key of keys(value)){
                const d=descriptor(value,key);if(typeof key!=='string'||!d||!hasOwn(d,'value')){invalid=true;continue;}
                if(isArray(value)){
                    if(key==='length')continue;
                    if(!/^(0|[1-9][0-9]*)$/.test(key)){
                        if(!metadata.has(key)||!isArray(d.value)||d.value.length)invalid=true;
                        continue;
                    }
                }else if(metadata.has(key))continue;
                // Hidden executable fields are not an effect exclusion.
                if(!d.enumerable){invalid=true;continue;}
                visit(d.value,value);
            }
            if(isArray(value))for(let i=0;i<value.length;i++)if(!hasOwn(value,String(i)))invalid=true;
        };visit(program);
        if(invalid||program?.type!=='Program'||!isArray(program.body)||
            nodes.some(n=>n.type&&!forms.has(n.type)||n.kind==='var'||n.exported===true||
                n.optional||n.computed||n.isNew||n.constructorCall||n.typeArguments!==undefined))return denied();
        const lexical=analyseCallableBindings(program),ref=n=>lexical.references.get(n);
        if(lexical.bindings.some(b=>protectedNames.has(b.name)))return denied();
        const declarations=new Map(),ordinary=new Map(),callbacks=new Set(),calls=new WeakSet(),candidates=new WeakSet();
        const count=b=>{if(!b){invalid=true;return;}declarations.set(b,(declarations.get(b)||0)+1);};
        for(const n of nodes){
            if(n.type==='Declaration'){
                if(!['let','const'].includes(n.kind)||!isArray(n.decls))return denied();
                for(const d of n.decls){if(!identifier(d.name)||d.isArray||d.typeName&&!['number','string','boolean','any'].includes(d.typeName))return denied();
                    count(lexical.scopes.get(n)?.names.get(d.name));}
            }
            if(['FunctionDeclaration','FunctionExpression'].includes(n.type)){
                if(!closedFunction(n))return denied();
                const scope=lexical.scopes.get(n);if(!scope)return denied();
                for(const name of n.params)count(scope.names.get(name));
                if(n.type==='FunctionDeclaration'){
                    const b=lexical.global.names.get(n.name);
                    if(!program.body.includes(n)||!b||b.node!==n||b.written)return denied();count(b);ordinary.set(b,n);
                }
            }
        }
        if(invalid||[...declarations.values()].some(value=>value!==1))return denied();
        const gameCall=(n,name,arity)=>plainCall(n)&&n.callee?.type==='Member'&&n.callee.name===name&&
            n.callee.object?.type==='Identifier'&&n.callee.object.name==='game'&&!ref(n.callee.object)&&n.args.length===arity;
        const deltaRead=n=>n?.type==='Member'&&n.name==='deltaTime'&&gameCall(n.object,'eventContext',0);
        for(const n of nodes)if(n.type==='Call'){
            if(!plainCall(n))return denied();
            const callee=n.callee;
            if(callee?.type==='Identifier'&&callee.name==='parseInt'&&!ref(callee)){
                if(![1,2].includes(n.args.length)||n.args[0]?.type!=='String'||typeof n.args[0].value!=='string'||
                    n.args.length===2&&!radixLiteral(n.args[1]))return denied();
                calls.add(n);candidates.add(n);continue;
            }
            if(callee?.type==='Identifier'&&ordinary.has(ref(callee))&&n.args.length===ordinary.get(ref(callee)).params.length){calls.add(n);continue;}
            if(gameCall(n,'onUpdate',1)&&n.args[0]?.type==='FunctionExpression'&&n.args[0].params.length===0&&
                parents.get(n)?.type==='ExpressionStatement'&&parents.get(n).expr===n){callbacks.add(n.args[0]);calls.add(n);continue;}
            if(gameCall(n,'eventContext',0)&&deltaRead(parents.get(n))){calls.add(n);continue;}
            return denied();
        }
        for(const n of nodes){
            if(n.type==='FunctionExpression'&&!callbacks.has(n))return denied();
            if(n.type==='Identifier'){
                const b=ref(n),p=parents.get(n);
                if(ordinary.has(b)&&!(p?.type==='Call'&&p.callee===n&&calls.has(p)))return denied();
                if(!b&&!(n.name==='parseInt'&&p?.type==='Call'&&p.callee===n&&candidates.has(p))&&
                    !(n.name==='game'&&p?.type==='Member'&&p.object===n&&calls.has(parents.get(p)))&&
                    !['NaN','Infinity'].includes(n.name))return denied();
            }
            if(n.type==='Member'&&!deltaRead(n)&&!(parents.get(n)?.type==='Call'&&parents.get(n).callee===n&&calls.has(parents.get(n))))return denied();
            if(n.type==='Assignment'&&(!assignmentOps.has(n.op)||n.left?.type!=='Identifier'||!ref(n.left)||ordinary.has(ref(n.left))))return denied();
            if(n.type==='Update'&&(!['++','--'].includes(n.op)||n.argument?.type!=='Identifier'||!ref(n.argument)||ordinary.has(ref(n.argument))))return denied();
            if(n.type==='Unary'&&!['+','-','!','~','typeof','void'].includes(n.op))return denied();
            if((n.type==='Binary'||n.type==='Logical')&&!binaryOps.has(n.op))return denied();
            if(n.type==='Number'&&(typeof n.value!=='string'||!Number.isFinite(Number(n.value))))return denied();
            if(n.type==='String'&&typeof n.value!=='string'||n.type==='Boolean'&&typeof n.value!=='boolean')return denied();
        }
        if(!realmCurrent()||!syntax.isCurrent()||!snapshot.current()||!realmCurrent())return denied();
        let live=true;
        const current=()=>{
            if(live)try{if(!realmCurrent()||!syntax.isCurrent()||!snapshot.current()||!realmCurrent())live=false;}catch{live=false;}
            return live;
        };
        return freeze({current,isNumberCall:node=>current()&&candidates.has(node)});
    }catch{return denied();}
}
