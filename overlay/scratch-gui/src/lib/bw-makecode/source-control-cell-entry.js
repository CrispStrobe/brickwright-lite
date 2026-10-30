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

// Occurrence-only execution evidence. The ordinary primitive validator is the
// sole value-graph consumer; this module never returns a producer/init token.
const denied=Object.freeze({current:()=>true,isInitializedRead:()=>false});
const metadata=new Set(['originalBody','parameterDefaults','paramTypes','typeParameters','returnType','assertedType','calls']);
const MAX_CONTROLS=8,MAX_STATES=256,MAX_NODES=6000,MAX_WORK=100000;
const absent=Symbol('unexecuted');
// Pure finite constants only: control writers never accept calls or names.
const constant=node=>{
    let work=0;
    const visit=(n,depth=0)=>{
        if(++work>64||depth>16)return null;
        if(n?.type==='Parenthesized')return visit(n.expression,depth+1);
        if(n?.type==='Number'&&['number','string'].includes(typeof n.value)&&String(n.value).trim()!==''&&Number.isFinite(Number(n.value)))return {value:Number(n.value)};
        if(n?.type==='Boolean'&&[true,false,'true','false'].includes(n.value))return {value:n.value===true||n.value==='true'};
        if(n?.type==='Unary'&&['+','-'].includes(n.op)){
            const a=visit(n.argument,depth+1);return a&&typeof a.value==='number'?{value:n.op==='+'?+a.value:-a.value}:null;
        }
        if(n?.type==='Binary'&&['+','-','*','/','%'].includes(n.op)){
            const a=visit(n.left,depth+1),b=visit(n.right,depth+1);if(!a||!b||typeof a.value!=='number'||typeof b.value!=='number')return null;
            const value=n.op==='+'?a.value+b.value:n.op==='-'?a.value-b.value:n.op==='*'?a.value*b.value:n.op==='/'?a.value/b.value:a.value%b.value;
            return Number.isFinite(value)?{value}:null;
        }
        return null;
    };return visit(node);
};
const valueKey=v=>v===absent?'u':typeof v==='boolean'?'b'+Number(v):'n'+String(v);

// Negative-only admission preflight. Passing this work bound never replaces
// the complete source snapshot, binding inventory or late executable-node cap.
const preflightArray=Array.isArray,preflightInteger=Number.isSafeInteger,preflightNumber=Number,preflightString=String;
const preflightPush=Array.prototype.push,preflightPop=Array.prototype.pop;
const preflightObjectPrototype=Object.prototype,preflightArrayPrototype=Array.prototype;
const preflightHas=WeakSet.prototype.has,preflightAdd=WeakSet.prototype.add;
const withinSourceBudget=root=>{
    const pending=[root],seen=new WeakSet();let nodes=0,work=0;
    while(pending.length){
        const value=intrinsicApply(preflightPop,pending,[]);if(!value||typeof value!=='object')continue;
        if(intrinsicApply(preflightHas,seen,[value]))return false;
        intrinsicApply(preflightAdd,seen,[value]);
        const array=preflightArray(value),parent=intrinsicPrototype(value);
        if(parent!==preflightObjectPrototype&&parent!==preflightArrayPrototype&&parent!==null)return false;
        let length=0;
        if(array){
            const row=intrinsicDescriptor(value,'length');
            if(!row||!intrinsicApply(intrinsicOwn,row,['value'])||typeof row.value!=='number'||!preflightInteger(row.value)||row.value<0||row.value>MAX_WORK-work)return false;
            length=row.value;work+=length;
        }else if(++nodes>MAX_NODES)return false;
        const keys=intrinsicKeys(value);
        for(let i=0;i<keys.length;i++){
            if(++work>MAX_WORK)return false;
            const key=keys[i],row=intrinsicDescriptor(value,key);
            if(typeof key!=='string'||!row||!intrinsicApply(intrinsicOwn,row,['value']))return false;
            if(array){
                // The original executable walk visits array slots, not named
                // parameter metadata. Observe descriptors without an iterator.
                const index=preflightNumber(key);
                if(key==='length'||!preflightInteger(index)||index<0||index>=length||preflightString(index)!==key)continue;
            }else if(metadata.has(key))continue;
            intrinsicApply(preflightPush,pending,[row.value]);
        }
    }
    return true;
};

export function createSourceControlCellEntry(program){
    if(!ambientCurrent()||!withinSourceBudget(program))return denied;
    const syntax=inspectGeneratedHelperBindings(program,GENERATED_HELPER_PROFILES.ordinary);
    if(!syntax.isCurrent()||program?.type!=='Program'||!Array.isArray(program.body))return denied;
    const lexical=analyseCallableBindings(program),nodes=[],parents=new WeakMap(),seen=new WeakSet();let valid=true;
    const walk=(n,parent=null)=>{
        if(!n||typeof n!=='object')return;
        if(Array.isArray(n)){for(const child of n)walk(child,parent);return;}
        if(seen.has(n)){valid=false;return;}seen.add(n);parents.set(n,parent);nodes.push(n);
        for(const[k,v]of Object.entries(n))if(!metadata.has(k))walk(v,n);
    };walk(program);if(!valid||nodes.length>MAX_NODES||nodes.some(n=>n.type==='Identifier'&&['eval','Function','globalThis','window','self','arguments','Reflect'].includes(n.name)))return denied;
    const lookup=(node,name)=>{for(let s=lexical.scopes.get(node);s;s=s.parent)if(s.names.has(name))return s.names.get(name);return null;};
    const binding=n=>lexical.references.get(n);
    const declarations=new Map(),writers=new Map(),references=new Map();
    for(const n of nodes){
        if(n.type==='Declaration')for(const decl of n.decls||[]){const b=lookup(n,decl.name);if(!declarations.has(b))declarations.set(b,[]);declarations.get(b).push({statement:n,decl});}
        if(n.type==='Identifier'){const b=binding(n);if(!references.has(b))references.set(b,[]);references.get(b).push(n);}
        const left=n.type==='Assignment'?n.left:n.type==='Update'?n.argument:null;
        if(left?.type==='Identifier'){const b=binding(left);if(!writers.has(b))writers.set(b,[]);writers.get(b).push(n);}
    }
    const predicateCalls=new WeakMap();let directSyntax=null;
    const plainCall=call=>{
        if(call?.type!=='Call'||call.callee?.type!=='Identifier'||[call.optional,call.isNew,call.constructorCall,call.callee.optional].some(v=>v!==undefined&&v!==false)||
            call.typeArguments!==undefined&&(!Array.isArray(call.typeArguments)||call.typeArguments.length)||!Array.isArray(call.args)||call.args.length!==2)return false;
        for(let i=0;i<2;i++)if(!Object.hasOwn(call.args,String(i))||!call.args[i]||typeof call.args[i].type!=='string'||call.args[i].type==='Spread')return false;
        return true;
    };
    for(const fn of program.body){
        if(fn?.type!=='FunctionDeclaration'||fn.exported||fn.params?.length!==2||new Set(fn.params).size!==2||
            !fn.params.every(name=>typeof name==='string'&&name!==fn.name&&/^[A-Za-z_$][\w$]*$/.test(name))||fn.body?.length!==1||fn.body[0]?.type!=='Return'||
            fn.parameterDefaults?.length||fn.optionalParams?.length||fn.typeParameters?.length||fn.restParam||fn.async||fn.isAsync||fn.generator||fn.isGenerator)continue;
        const value=fn.body[0].value,op=value?.type==='Binary'&&value.op;
        if(!['===','!==','<'].includes(op)||value.left?.type!=='Identifier'||value.right?.type!=='Identifier'||value.left.name!==fn.params[0]||value.right.name!==fn.params[1]||
            binding(value.left)?.kind!=='parameter'||binding(value.right)?.kind!=='parameter'||binding(value.left)?.node!==fn||binding(value.right)?.node!==fn)continue;
        let neutral='__bwControlPredicate';while(fn.params.includes(neutral))neutral+='_';
        const names=new Map([[fn.name,neutral]]),body=`function ${neutral}(${fn.params[0]}: any, ${fn.params[1]}: any): boolean { return ${fn.params[0]} ${op} ${fn.params[1]} }`;
        if(!syntax.root(fn))continue;
        if(!syntax.matches(fn,body,names)){
            // Final emitted-source validation uses the public direct parser
            // profile. Require its same complete canonical body, not a
            // metadata-erased clone of the original declaration.
            directSyntax ||= inspectGeneratedHelperBindings(program,GENERATED_HELPER_PROFILES.direct);
            if(!directSyntax.root(fn)||!directSyntax.matches(fn,body,names))continue;
        }
        const calls=syntax.calls(fn,[2],new Set([fn]));
        if(!calls?.length||calls.some(call=>!plainCall(call)||syntax.declarationAt(call.callee)!==fn))continue;
        for(const call of calls)predicateCalls.set(call,op);
    }
    const conditionUse=ref=>{
        let child=ref,parent=parents.get(child);
        if(parent?.type==='Assignment'&&parent.left===child&&parent.op==='='&&constant(parent.right))return parents.get(parent)?.type==='ExpressionStatement'&&parents.get(parent).expr===parent;
        while(parent?.type==='Parenthesized'&&parent.expression===child){child=parent;parent=parents.get(child);}
        if(parent?.type==='Binary'&&['===','!=='].includes(parent.op)&&constant(parent.left===child?parent.right:parent.left)){child=parent;parent=parents.get(child);}
        else if(parent?.type==='Call'&&predicateCalls.has(parent)&&parent.args.includes(child)&&constant(parent.args[parent.args[0]===child?1:0])){child=parent;parent=parents.get(child);}
        while(parent&&(parent.type==='Parenthesized'&&parent.expression===child||parent.type==='Unary'&&parent.op==='!'&&parent.argument===child||['Binary','Logical'].includes(parent.type)&&['&&','||'].includes(parent.op))){child=parent;parent=parents.get(child);}
        return !!parent&&(['If','While','Conditional'].includes(parent.type)&&parent.test===child);
    };
    const controlsByOwner=new Map();
    for(const b of lexical.bindings){
        const rows=declarations.get(b)||[],owner=b.functionOwner;
        if(b.kind!=='local'||owner?.kind!=='function'||rows.length!==1||rows[0].statement.kind!=='let'||!constant(rows[0].decl.init))continue;
        if(!(references.get(b)||[]).some(ref=>parents.get(ref)?.type!=='Assignment'&&conditionUse(ref)))continue;
        if((writers.get(b)||[]).some(n=>n.type!=='Assignment'||n.op!=='='||!constant(n.right)))continue;
        if((references.get(b)||[]).some(ref=>lexical.scopes.get(ref)?.functionOwner!==owner||!conditionUse(ref)))continue;
        if(!controlsByOwner.has(owner))controlsByOwner.set(owner,[]);controlsByOwner.get(owner).push(b);
    }
    const byScope=new Map();for(const b of lexical.bindings){if(!byScope.has(b.scope))byScope.set(b.scope,[]);if(b.kind!=='parameter')byScope.get(b.scope).push(b);}
    const ready=new WeakSet();let used=false;
    for(const[owner,controls]of controlsByOwner){
        if(!controls.length||controls.length>MAX_CONTROLS)continue;
        const reads=analyseOwner(owner,controls);if(reads){for(const read of reads)ready.add(read);used=true;}
    }
    let expired=false;
    const current=()=>{if(expired)return false;try{if(!ambientCurrent()||!syntax.isCurrent()||directSyntax&&!directSyntax.isCurrent())expired=true;}catch(error){expired=true;throw error;}return !expired;};
    return used?Object.freeze({current,isInitializedRead:node=>current()&&ready.has(node)}):denied;

    function analyseOwner(owner,controls){
        const index=new Map(controls.map((b,i)=>[b,i])),observed=new Map();let work=0,ok=true;
        const allowed=new Set(['FunctionDeclaration','FunctionExpression','Declaration','ExpressionStatement','Block','If','While','Break','Continue','Return','ThrowStatement','Identifier','Number','Boolean','String','Null','Undefined','Parenthesized','Binary','Logical','Unary','Assignment','Update','Call','Member','Index','Array','Conditional','Empty','EmptyStatement']);
        const check=n=>{
            if(!n||typeof n!=='object')return;if(Array.isArray(n)){for(const child of n)check(child);return;}
            if(n!==owner.node&&['FunctionDeclaration','FunctionExpression'].includes(n.type))return;
            if(n.type&&(!allowed.has(n.type)||n.label||n.optional||n.isNew||n.constructorCall))ok=false;
            if(n.type==='Declaration'&&n.kind==='var'||n.type==='Identifier'&&['eval','Function','globalThis','window','self','arguments','Reflect'].includes(n.name))ok=false;
            for(const[k,v]of Object.entries(n))if(!metadata.has(k))check(v);
        };check(owner.node.body);if(!ok)return null;
        const copy=s=>({values:s.values.slice(),known:new Set(s.known)});
        const key=s=>s.values.map(valueKey).join(',');
        const join=(into,incoming)=>{
            let changed=false;
            for(const s of incoming.values()){
                const k=key(s),old=into.get(k);
                if(!old){into.set(k,copy(s));changed=true;}
                else{const next=new Set([...old.known].filter(b=>s.known.has(b)));if(next.size!==old.known.size){old.known=next;changed=true;}}
                if(into.size>MAX_STATES){ok=false;return false;}
            }return changed;
        };
        const relation=states=>{const out=new Map();for(const s of states)join(out,new Map([[key(s),s]]));return out;};
        const each=(states,fn)=>{const out=new Map();for(const s of states.values()){if(++work>MAX_WORK){ok=false;break;}join(out,fn(copy(s)));}return out;};
        const mark=(n,states)=>{
            if(n?.type!=='Identifier')return;const b=binding(n);if(!b)return;
            for(const s of states.values())observed.set(n,(observed.get(n)??true)&&s.known.has(b));
        };
        const scopeBindings=s=>byScope.get(s)||[];
        const reset=(states,scope)=>each(states,s=>{for(const b of scopeBindings(scope)){s.known.delete(b);if(index.has(b))s.values[index.get(b)]=absent;}return relation([s]);});
        const sequence=(list,states,scope=null)=>{
            if(scope)states=reset(states,scope);
            const out={normal:states,break:new Map(),continue:new Map(),return:new Map(),throw:new Map()};
            for(const n of list||[]){if(!ok||!out.normal.size)break;const step=statement(n,out.normal);out.normal=step.normal;for(const kind of ['break','continue','return','throw'])join(out[kind],step[kind]);}
            if(scope)for(const kind of Object.keys(out))out[kind]=reset(out[kind],scope);
            return out;
        };
        const flow=normal=>({normal,break:new Map(),continue:new Map(),return:new Map(),throw:new Map()});
        const expr=(n,states)=>{
            if(!ok||!n||!states.size)return states;
            if(n.type==='Identifier'){mark(n,states);return states;}
            if(['FunctionDeclaration','FunctionExpression'].includes(n.type))return states;
            if(n.type==='Conditional'){const c=condition(n.test,states),out=expr(n.consequent,c.yes);join(out,expr(n.alternate,c.no));return out;}
            if(['Binary','Logical'].includes(n.type)&&['&&','||'].includes(n.op)){const c=condition(n.left,states),out=n.op==='&&'?c.no:c.yes;join(out,expr(n.right,n.op==='&&'?c.yes:c.no));return out;}
            if(n.type==='Assignment'){
                // Property LHS operands are evaluated before the RHS. A plain
                // identifier assignment does not read its previous value.
                if(n.left?.type!=='Identifier')states=expr(n.left,states);
                else if(n.op!=='=')states=expr(n.left,states);
                states=expr(n.right,states);
                if(n.left?.type==='Identifier')states=each(states,s=>{const b=binding(n.left);if(n.op==='='){s.known.add(b);if(index.has(b)){const v=constant(n.right);if(!v){ok=false;return new Map();}s.values[index.get(b)]=v.value;}}return relation([s]);});
                return states;
            }
            const slots={Parenthesized:['expression'],Binary:['left','right'],Logical:['left','right'],Unary:['argument'],Update:['argument'],Member:['object'],Index:['object','index'],Call:['callee','args'],Array:['items']};
            for(const k of slots[n.type]||[]){if(Array.isArray(n[k]))for(const child of n[k])states=expr(child,states);else states=expr(n[k],states);}
            return states;
        };
        const evaluate=(n,s,depth=0)=>{
            if(depth>16)return null;
            if(n?.type==='Parenthesized')return evaluate(n.expression,s,depth+1);const v=constant(n);if(v)return v;
            if(n?.type==='Identifier'&&index.has(binding(n))){const value=s.values[index.get(binding(n))];if(value===absent){ok=false;return null;}return {value};}
            if(n?.type==='Unary'&&n.op==='!'){const a=evaluate(n.argument,s,depth+1);return a?{value:!a.value}:null;}
            if(n?.type==='Binary'&&['===','!=='].includes(n.op)){const a=evaluate(n.left,s,depth+1),b=evaluate(n.right,s,depth+1);return a&&b?{value:n.op==='==='?a.value===b.value:a.value!==b.value}:null;}
            if(n?.type==='Call'&&predicateCalls.has(n)){
                const a=evaluate(n.args[0],s,depth+1),b=evaluate(n.args[1],s,depth+1),op=predicateCalls.get(n);
                if(!a||!b)return null;
                if(op==='<'&&(typeof a.value!=='number'||typeof b.value!=='number'))return null;
                return {value:op==='==='?a.value===b.value:op==='!=='?a.value!==b.value:a.value<b.value};
            }
            return null;
        };
        const condition=(n,states)=>{
            if(n?.type==='Parenthesized')return condition(n.expression,states);
            if(n?.type==='Unary'&&n.op==='!'){const a=condition(n.argument,states);return {yes:a.no,no:a.yes};}
            if(['Binary','Logical'].includes(n?.type)&&['&&','||'].includes(n.op)){
                const a=condition(n.left,states),b=condition(n.right,n.op==='&&'?a.yes:a.no);
                if(n.op==='&&'){join(b.no,a.no);return b;}join(b.yes,a.yes);return b;
            }
            states=expr(n,states);const yes=new Map(),no=new Map();
            for(const s of states.values()){const v=evaluate(n,s);if(!v||!!v.value)join(yes,relation([s]));if(!v||!v.value)join(no,relation([s]));}return {yes,no};
        };
        const statement=(n,states)=>{
            if(!ok||!n)return flow(states);
            if(n.type==='Declaration'){
                for(const decl of n.decls){states=expr(decl.init,states);states=each(states,s=>{const b=lookup(n,decl.name);if(decl.init)s.known.add(b);if(index.has(b))s.values[index.get(b)]=constant(decl.init).value;return relation([s]);});}return flow(states);
            }
            if(n.type==='ExpressionStatement')return flow(expr(n.expr,states));
            if(n.type==='Block')return sequence(n.body,states,lexical.scopes.get(n));
            if(n.type==='If'){
                const c=condition(n.test,states),a=sequence(n.consequent,c.yes,lexical.scopes.get(n.consequent)),b=sequence(n.alternate,c.no,lexical.scopes.get(n.alternate));
                for(const kind of Object.keys(a))join(a[kind],b[kind]);return a;
            }
            if(['Return','ThrowStatement'].includes(n.type)){const out=flow(new Map());out[n.type==='Return'?'return':'throw']=expr(n.type==='Return'?n.value:n.argument,states);return out;}
            if(['Break','Continue'].includes(n.type)){const out=flow(new Map());out[n.type.toLowerCase()]=states;return out;}
            if(n.type==='While'){
                const heads=new Map(),pending=[],out=flow(new Map());
                const enqueue=incoming=>{for(const s of incoming.values()){const k=key(s),one=new Map([[k,s]]);if(join(heads,one))pending.push(k);}};enqueue(states);
                while(ok&&pending.length){if(++work>MAX_WORK){ok=false;break;}const k=pending.shift(),current=relation([heads.get(k)]),c=n.test?condition(n.test,current):{yes:current,no:new Map()};
                    join(out.normal,c.no);
                    const body=sequence(n.body,c.yes,lexical.scopes.get(n));join(out.normal,body.break);join(out.return,body.return);join(out.throw,body.throw);
                    join(body.normal,body.continue);enqueue(body.normal);
                }
                return out;
            }
            if(['FunctionDeclaration','Empty','EmptyStatement'].includes(n.type))return flow(states);
            ok=false;return flow(new Map());
        };
        const initial={values:controls.map(()=>absent),known:new Set(lexical.bindings.filter(b=>b.scope===owner&&b.kind==='parameter'))};
        sequence(owner.node.body,relation([initial]));
        return ok?[...observed].filter(([,all])=>all).map(([n])=>n):null;
    }
}
