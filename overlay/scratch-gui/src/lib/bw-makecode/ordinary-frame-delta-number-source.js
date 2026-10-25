import {analyseCallableBindings} from './callable-bindings.js';
import {inspectGeneratedHelperBindings,GENERATED_HELPER_PROFILES} from './generated-helper-recognition.js';

// Capture meta operations, global aliases, full intrinsic descriptors and the
// iterator chains used by this finite analysis before inspecting source data.
const intrinsicApply=Reflect.apply,intrinsicKeys=Reflect.ownKeys;
const intrinsicDescriptor=Object.getOwnPropertyDescriptor,intrinsicPrototype=Object.getPrototypeOf;
const intrinsicSame=Object.is,intrinsicOwn=Object.prototype.hasOwnProperty;
const intrinsicRealm=globalThis,intrinsicAliases=[],intrinsicRows=[];
const remember=object=>{
    for(let i=0;i<intrinsicRows.length;i++)if(intrinsicRows[i].object===object)return;
    const keys=intrinsicKeys(object),rows=[];for(let i=0;i<keys.length;i++)rows[i]=intrinsicDescriptor(object,keys[i]);
    intrinsicRows[intrinsicRows.length]={object,parent:intrinsicPrototype(object),keys,rows};
};
for(const name of ['globalThis','Object','Array','Reflect','Map','Set','WeakMap','WeakSet','Number','String','Boolean','JSON','Symbol','Function','RegExp','Math','Error','TypeError']){
    const row=intrinsicDescriptor(intrinsicRealm,name);intrinsicAliases[intrinsicAliases.length]={name,row};
    if(name==='globalThis')continue;remember(row.value);const prototype=intrinsicDescriptor(row.value,'prototype');if(prototype&&intrinsicApply(intrinsicOwn,prototype,['value']))remember(prototype.value);
}
for(const iterator of [[][Symbol.iterator](),new Map()[Symbol.iterator](),new Set()[Symbol.iterator](),''[Symbol.iterator]()])for(let p=intrinsicPrototype(iterator);p;p=intrinsicPrototype(p))remember(p);
const descriptorFields=['value','writable','get','set','enumerable','configurable'];
const sameDescriptor=(a,b)=>{
    if(!a||!b)return a===b;
    for(let i=0;i<descriptorFields.length;i++){const k=descriptorFields[i],present=intrinsicApply(intrinsicOwn,a,[k]);if(present!==intrinsicApply(intrinsicOwn,b,[k])||present&&!intrinsicSame(a[k],b[k]))return false;}
    return true;
};
const ambientCurrent=()=>{
    for(let i=0;i<intrinsicAliases.length;i++){const a=intrinsicAliases[i];if(!sameDescriptor(a.row,intrinsicDescriptor(intrinsicRealm,a.name)))return false;}
    for(let i=0;i<intrinsicRows.length;i++){const r=intrinsicRows[i],keys=intrinsicKeys(r.object);if(intrinsicPrototype(r.object)!==r.parent||keys.length!==r.keys.length)return false;for(let j=0;j<keys.length;j++)if(!intrinsicSame(keys[j],r.keys[j])||!sameDescriptor(r.rows[j],intrinsicDescriptor(r.object,keys[j])))return false;}
    return true;
};

// Seconds from the current game event context, on normal return only. This
// inventory supplies no timing, callback order, initialization or Array fact.
const denied=Object.freeze({current:()=>true,isNumberRead:()=>false});
const metadata=new Set(['originalBody','parameterDefaults','paramTypes','typeParameters','returnType','assertedType','calls']);
const slot=(object,name)=>{const row=object&&intrinsicDescriptor(object,name);return row&&intrinsicApply(intrinsicOwn,row,['value'])?row.value:undefined;};
const isArray=Array.isArray,arrayPrototype=Array.prototype,objectPrototype=Object.prototype;
const weakHas=WeakSet.prototype.has,weakAdd=WeakSet.prototype.add;
const safeInteger=Number.isSafeInteger,number=Number,string=String,push=Array.prototype.push,pop=Array.prototype.pop;
const shape=n=>slot(n,'type')==='Member'&&slot(n,'name')==='deltaTime'&&
    slot(slot(n,'object'),'type')==='Call'&&slot(slot(slot(n,'object'),'callee'),'type')==='Member'&&
    slot(slot(slot(n,'object'),'callee'),'name')==='eventContext'&&
    slot(slot(slot(slot(n,'object'),'callee'),'object'),'type')==='Identifier'&&
    slot(slot(slot(slot(n,'object'),'callee'),'object'),'name')==='game';
// Negative-only bounded scan: no snapshot/lexical machinery for unrelated
// programs, and no source getter, serializer, function or iterator executes.
const hasCandidate=program=>{
    const pending=[program],seen=new WeakSet();let found=false,count=0,work=0;
    while(pending.length){
        const n=intrinsicApply(pop,pending,[]);if(!n||typeof n!=='object')continue;
        if(intrinsicApply(weakHas,seen,[n]))return false;intrinsicApply(weakAdd,seen,[n]);
        const parent=intrinsicPrototype(n);if(![arrayPrototype,objectPrototype,null].includes(parent))return false;
        const array=isArray(n);let length=0;if(array){length=slot(n,'length');if(!safeInteger(length)||length<0||length>100000-work)return false;work+=length;}else if(++count>6000)return false;
        if(shape(n))found=true;
        const keys=intrinsicKeys(n);for(let i=0;i<keys.length;i++){
            if(++work>100000)return false;const key=keys[i],row=intrinsicDescriptor(n,key);
            if(typeof key!=='string'||!row||!intrinsicApply(intrinsicOwn,row,['value']))return false;
            if(array){const index=number(key);if(key==='length'||!safeInteger(index)||index<0||index>=length||string(index)!==key)continue;}
            else if(metadata.has(key))continue;
            intrinsicApply(push,pending,[row.value]);
        }
    }return found;
};
const plainCall=(n,arities)=>{
    if(n?.type!=='Call'||![n.isNew,n.constructorCall,n.optional,n.callee?.optional].every(v=>v===undefined||v===false)||
        n.typeArguments!==undefined&&(!Array.isArray(n.typeArguments)||n.typeArguments.length)||!Array.isArray(n.args)||!arities.includes(n.args.length))return false;
    for(let i=0;i<n.args.length;i++)if(!Object.hasOwn(n.args,String(i))||!n.args[i]||typeof n.args[i].type!=='string'||n.args[i].type==='Spread')return false;
    return true;
};
const callback=n=>n?.type==='FunctionExpression'&&Array.isArray(n.params)&&n.params.length===0&&Array.isArray(n.body)&&
    !n.parameterDefaults?.length&&!n.optionalParams?.length&&!n.typeParameters?.length&&!n.restParam&&
    !n.async&&!n.isAsync&&!n.generator&&!n.isGenerator;
const otherCalls=new Map([['pause',[1]],['randint',[2]],['Math.sign',[1]],['Math.randomRange',[2]],
    ['Math.min',[2]],['Math.max',[2]],['Math.atan2',[2]],['Math.abs',[1]],['Math.floor',[1]],['Math.ceil',[1]],['Math.round',[1]],
    ['screen.fill',[1]],['screen.fillRect',[5]],['screen.print',[1,2,3,4,5]],
    ['controller.dx',[1]],['controller.dy',[1]],['music.playSound',[1]],['music.sounds',[1]]]);
const path=n=>n?.type==='Identifier'?n.name:n?.type==='Member'&&!n.optional?path(n.object)+'.'+n.name:null;
const root=n=>['Member','Index'].includes(n?.type)?root(n.object):n;

export function createOrdinaryFrameDeltaNumberSource(program,safeIndex=()=>false){
    if(!ambientCurrent()||typeof safeIndex!=='function'||!hasCandidate(program))return denied;
    const syntax=inspectGeneratedHelperBindings(program,GENERATED_HELPER_PROFILES.ordinary);
    if(!syntax.isCurrent())return denied;
    const lexical=analyseCallableBindings(program),binding=n=>lexical.references.get(n),candidates=new WeakSet();
    let unsafe=false,found=false;
    for(const n of syntax.nodes){
        if(n.type==='Identifier'&&['control','this','global','globalThis','window','self','eval','Function','Reflect','arguments'].includes(n.name)&&
            (n.name==='this'||!binding(n)))unsafe=true;
        if(n.type==='Class'&&n.base||n.type==='Member'&&['constructor','prototype','__proto__'].includes(n.name))unsafe=true;
        if(n.type==='Index'&&safeIndex(n)!==true)unsafe=true;
        const target=n.type==='Assignment'?n.left:n.type==='Update'||n.type==='Unary'&&n.op==='delete'?n.argument:null;
        if(target&&target.type!=='Identifier'&&!(target.type==='Index'&&safeIndex(target)===true))unsafe=true;
        if(n.type==='Identifier'&&n.name==='game'&&!binding(n)){
            const member=syntax.parentOf(n),call=syntax.parentOf(member);
            if(member?.type!=='Member'||member.object!==n||member.optional||call?.callee!==member){unsafe=true;continue;}
            const arities={runtime:[0],gameOver:[1],splash:[1,2],onPaint:[1],onUpdate:[1],eventContext:[0]}[member.name];
            if(!arities||!plainCall(call,arities)){unsafe=true;continue;}
            if(['onPaint','onUpdate'].includes(member.name)&&!callback(call.args[0]))unsafe=true;
            if(member.name!=='eventContext')continue;
            const read=syntax.parentOf(call);let top=read,parent=syntax.parentOf(top);
            while(parent?.type==='Parenthesized'&&parent.expression===top){top=parent;parent=syntax.parentOf(top);}
            if(read?.type!=='Member'||read.object!==call||read.name!=='deltaTime'||read.optional||
                parent?.type==='Assignment'&&parent.left===top||parent?.type==='Update'||parent?.type==='Unary'&&parent.op==='delete'||
                ['Member','Index'].includes(parent?.type)&&parent.object===top||parent?.type==='Call'&&parent.callee===top){unsafe=true;continue;}
            candidates.add(read);found=true;
        }
        if(n.type!=='Call')continue;
        const r=root(n.callee),own=r?.type==='Identifier'?binding(r):null;
        // Same-named lexical receivers are ordinary values, never this SDK.
        if(own&&['game','control'].includes(r.name))continue;
        if(!own&&r?.name==='game')continue;
        if(n.callee?.type==='Identifier'&&own?.kind==='function'&&own.node?.type==='FunctionDeclaration'&&!own.written)continue;
        const allowed=!own&&otherCalls.get(path(n.callee));
        if(!allowed||!plainCall(n,allowed))unsafe=true;
    }
    if(unsafe||!found||!ambientCurrent()||!syntax.isCurrent())return denied;
    let expired=false;
    const current=()=>{if(expired)return false;try{if(!ambientCurrent()||!syntax.isCurrent())expired=true;}catch(error){expired=true;throw error;}return !expired;};
    return Object.freeze({current,isNumberRead:node=>current()&&candidates.has(node)});
}
