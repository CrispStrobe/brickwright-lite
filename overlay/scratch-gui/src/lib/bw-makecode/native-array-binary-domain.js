import {analyseSourceValueProducers} from './source-value-producers.js';
import {inspectNativeArrayAddHelpers} from './native-array-binary-helper-source.js';
import {GENERATED_HELPER_PROFILES,inspectGeneratedHelperBindings,mapGeneratedSourceArray} from './generated-helper-recognition.js';
import {lowerNamedArrayItemHelpers} from './named-array-item-helpers.js';

const primitive=new Set(['Number','String','Boolean','Null','Undefined']);
const metadata=new Set(['originalBody','parameterDefaults','paramTypes','typeParameters','returnType','assertedType','bwProcedureConstraintSource','sourceReferenceDeclarations','sourceCallableDeclarations','sourceScalarDeclarations']);

// This is a separate flat-native-coercion view. In particular it never changes
// named-reference element/presence authority or the occurrence export profile.
// The helper's original argument nodes remain the queried expressions. Only
// structurally proved, closed helper bodies are omitted: their Array-dependent result remains Opaque,
// and their argument expressions remain visited in their original order. That
// avoids treating their own known join as a foreign escape without inventing an Array-dependent primitive result. Primitive-only additions
// retain their actual value flow, including nested numeric/text operations.
export function inspectNativeArrayBinaryDomains(program,profile=GENERATED_HELPER_PROFILES.ordinary) {
    const syntax=inspectNativeArrayAddHelpers(program,profile),helpers=syntax.helpers;
    if(!helpers.size)return {helpers:new Map(),current:syntax.current,reason:null};
    const suppliedTags=new Set(['NativeNamedArrayCreate','NativeNamedArrayDelete','LegacyParsedValue','LegacyJsonValue','NativeArrayAccess']);
    const supplied=node=>node&&typeof node==='object'&&(Object.hasOwn(node,'bwNativeNamedArray')||Object.hasOwn(node,'nativeArrayDomainCall')||
        suppliedTags.has(node.type)||Object.entries(node).some(([key,value])=>!metadata.has(key)&&(Array.isArray(value)?value.some(supplied):supplied(value))));
    if(supplied(program))return {helpers:new Map(),current:syntax.current,reason:'native addition requires original source, not supplied private named-helper tags'};
    // Only the already-proved helper bodies/calls enter this private view.
    // A fresh per-call scalar identity survives the existing normalizer's
    // ordinary cloning; no caller-supplied spelling or metadata can select it.
    const selected=new Set([...helpers.values()].map(helper=>helper.declaration)),originalCalls=new Map(),tokens=new Map();
    for(const helper of helpers.values())for(const call of helper.calls)originalCalls.set(call,helper);
    const prepare=node=>{
        if(!node||typeof node!=='object')return node;
        if(Array.isArray(node)){const next=mapGeneratedSourceArray(node,prepare);return node.some(value=>selected.has(value))?next.filter((value,index)=>!selected.has(node[index])):next;}
        if(originalCalls.has(node)){
            const token=Symbol();tokens.set(token,{helper:originalCalls.get(node),originalCall:node});
            return {type:'Binary',op:'+',left:prepare(node.args[0]),right:prepare(node.args[1]),nativeArrayDomainCall:token};
        }
        return Object.fromEntries(Object.entries(node).map(([key,value])=>[key,metadata.has(key)?value:prepare(value)]));
    };
    // Reuse the existing complete body/binding/registry/ambient proof rather
    // than independently recognizing a JSON or named registry helper family.
    const named=lowerNamedArrayItemHelpers(prepare(program),{profile});
    if(named.unsupported.length)return {helpers:new Map(),current:syntax.current,reason:'native addition named-helper source proof refused: '+named.unsupported.join('; ')};
    const bindings=inspectGeneratedHelperBindings(named.program,profile);
    const current=()=>syntax.current()&&bindings.isCurrent();
    const domainHelpers=[...helpers.values()].map(helper=>({...helper,calls:[]}));
    const observed=new Set();
    for(const node of bindings.nodes)if(tokens.has(node.nativeArrayDomainCall)){
        const token=node.nativeArrayDomainCall,entry=tokens.get(token);
        if(observed.has(token)||node.type!=='Binary'||node.op!=='+')return {helpers:new Map(),current,reason:'native addition private call identity is ambiguous'};
        observed.add(token);domainHelpers.find(helper=>helper.declaration===entry.helper.declaration).calls.push({args:[node.left,node.right]});
    }
    if(observed.size!==tokens.size)return {helpers:new Map(),current,reason:'native addition private call identity was not preserved'};
    const parsedValues=new Set();
    let replacements=new WeakMap(),unsupportedView=false;
    const literal=value=>value===null?{type:'Null'}:Array.isArray(value)?{type:'Array',items:value.map(literal)}:
        typeof value==='string'?{type:'String',value:JSON.stringify(value)}:
        typeof value==='boolean'?{type:'Boolean',value:String(value)}:{type:'Number',value:String(value)};
    const parsed=value=>({type:'Conditional',test:value,consequent:{type:'Number',value:'0'},
        alternate:{type:'Conditional',test:{type:'Boolean',value:'false'},consequent:{type:'Null'},alternate:{type:'Undefined'}}});
    const rewrite=node=>{
        if(!node||typeof node!=='object')return node;
        if(Array.isArray(node))return node.map(rewrite);
        let next;
        if(node.type==='NativeNamedArrayCreate')next=literal(JSON.parse(node.json));
        else if(node.type==='NativeNamedArrayDelete')next={type:'Null'};
        else if(node.type==='Call'&&node.bwNativeNamedArray){
            const args=node.args.map(rewrite),kind=node.bwNativeNamedArray.kind;
            if(kind==='get')next={type:'Index',object:args[0],index:{type:'Unary',op:'+',argument:args[1]}};
            else if(kind==='push'){
                next={type:'Call',callee:{type:'Member',object:args[0],name:'push'},args:[parsedValues.has(node)?parsed(args[1]):args[1]]};
            }else{unsupportedView=true;next=node;}
        }else if(['LegacyParsedValue','LegacyJsonValue','NativeArrayAccess'].includes(node.type)){unsupportedView=true;next=node;}
        else{
            next={};for(const [key,value]of Object.entries(node))if(key!=='nativeArrayDomainCall')next[key]=metadata.has(key)?value:rewrite(value);
        }
        replacements.set(node,next);return next;
    };
    const analyse=model=>analyseSourceValueProducers(model,{
        arrayValues:true,arrayEffectSites:true,parenthesized:true,unboundIsOpaque:true,
        uninitializedLocalsAreOpaque:true,declaredLocalUndefined:true,initializationEntries:true
    });
    let model=rewrite(named.program),graph=analyse(model);
    const nodes=[],parents=new WeakMap();
    const visit=(node,parent=null)=>{
        if(!node||typeof node!=='object')return;
        if(Array.isArray(node)){for(const child of node)visit(child,parent);return;}
        nodes.push(node);parents.set(node,parent);
        for(const [key,value]of Object.entries(node))if(!metadata.has(key))visit(value,node);
    };
    visit(model);
    const actual=node=>replacements.get(node)||node;
    const types=node=>graph.typesAt(actual(node)),allocations=node=>graph.possibleArrayAllocationsAt(actual(node));
    const initialized=node=>{
        if(!node||typeof node!=='object')return true;
        if(Array.isArray(node))return node.every(initialized);
        if(node.type==='Identifier'&&!graph.isInitializedAt(actual(node))&&!graph.immutableFunctionAt(actual(node)))return false;
        return Object.entries(node).every(([key,value])=>metadata.has(key)||initialized(value));
    };
    const primitiveValue=node=>{const found=types(node);return found.size>0&&[...found].every(type=>primitive.has(type))&&initialized(node);};
    // Canonical parse NORMAL returns on non-String primitive input are
    // primitive. Its unary+/isNaN/JSON effects and possible errors remain in
    // the actual source; this is only an overapproximation of Array contents.
    for(const node of bindings.nodes)if(node.type==='Call'&&node.bwNativeNamedArray?.kind==='get'&&!primitiveValue(node.args[1]))
        return {helpers:new Map(),current,reason:'native addition cannot prove the named getter index has primitive coercion'};
    for(const node of bindings.nodes)if(node.type==='Call'&&node.bwNativeNamedArray?.kind==='push'){
        const entries=types(node.args[1]);
        if(!entries.size||!initialized(node.args[1])||[...entries].some(type=>!['Number','Boolean','Null','Undefined'].includes(type)))
            return {helpers:new Map(),current,reason:'native addition cannot prove the canonical parser result is primitive'};
        parsedValues.add(node);
    }
    if(unsupportedView)return {helpers:new Map(),current,reason:'native addition has no private shape model for this named mutator'};
    if(parsedValues.size){replacements=new WeakMap();model=rewrite(named.program);graph=analyse(model);nodes.length=0;visit(model);}

    const allTokens=new Set(),arrayHelpers=new Set();
    for(const helper of domainHelpers)for(const call of helper.calls)for(let position=0;position<call.args.length;position++){
        const arg=call.args[position];
        const found=types(arg);
        if(!found.size||!initialized(arg)||[...found].some(type=>!primitive.has(type)&&type?.kind!=='Array'))
            return {helpers:new Map(),current,reason:'native addition requires initialized primitive or proved flat Array operands'};
        for(const allocation of allocations(arg)){
            if(!(position===0?helper.leftArray:helper.rightArray))return {helpers:new Map(),current,reason:'native helper does not join this actual Array operand position'};
            allTokens.add(allocation);arrayHelpers.add(helper.declaration.name);
        }
    }
    if(graph.diagnostics.length&&allTokens.size)return {helpers:new Map(),current,reason:'native addition source graph contains unresolved producer constraints'};
    const affected=node=>allocations(node).some(site=>allTokens.has(site));
    // Literal/all-writer graph facts handle alias and formal propagation. A
    // separate actual-site census closes the graph's intentionally narrower
    // Array-only mutation receiver domain: Array|null/0 unions cannot conceal
    // an inserted nested/opaque value or an unknown method/callee escape.
    for(const site of allTokens){
        const entries=graph.arrayElementTypesAt(site);
        if(site.type!=='Array'||!graph.arrayMapReceiverSafeAt(site)||graph.arrayConstraintErrorsAt(site).length||
            [...entries].some(type=>!primitive.has(type)))
            return {helpers:new Map(),current,reason:'native addition requires flat primitive allocation contents and no foreign escapes'};
    }
    const path=node=>node?.type==='Identifier'?node.name:node?.type==='Member'?path(node.object)+'.'+node.name:null;
    const namespaceCalls=new Set(['Array.isArray','Object.keys','JSON.parse','JSON.stringify','Math.round','Math.floor','Math.ceil','Math.min','Math.max','Math.abs','Math.random','Math.percentChance',
        'console.log','game.onUpdate','game.onUpdateInterval','control.runInParallel','control.panic','basic.pause','music.stopAllSounds',
        'info.setScore','info.changeScoreBy','info.score','info.startCountdown','info.onCountdownEnd','sprites.create','sprites.onCreated','sprites.onDestroyed','sprites.onOverlap']);
    const root=node=>node?.type==='Identifier'?node:node?.type==='Member'?root(node.object):null;
    const globalCall=node=>{const base=root(node);return !!base&&!graph.bindingKindsAt(base).size;};
    const primitiveCalls=new Set(['pause','isNaN','Number','String','Boolean','parseInt','parseFloat']);
    const builtinRoots=new Set([...primitiveCalls,...[...namespaceCalls].map(name=>name.split('.')[0])]);
    const arrayReturningFunctions=new Set();
    for(const node of nodes)if(node.type==='Return'&&affected(node.value)){
        let owner=parents.get(node);
        while(owner&&!['FunctionDeclaration','FunctionExpression'].includes(owner.type))owner=parents.get(owner);
        if(owner?.type!=='FunctionDeclaration')return {helpers:new Map(),current,reason:'native addition Array escapes through an unproved callback return'};
        arrayReturningFunctions.add(owner);
    }
    for(const node of nodes){
        if(node.type==='Identifier'&&arrayReturningFunctions.has(graph.immutableFunctionAt(node))){
            const parent=parents.get(node);
            if(parent?.type!=='Call'||parent.callee!==node||parent.isNew||parent.constructorCall)
                return {helpers:new Map(),current,reason:'native addition Array-returning function escapes its actual callers'};
        }
        if(node.type==='Object'&&(node.props||[]).some(property=>affected(property.value)))
            return {helpers:new Map(),current,reason:'native addition Array escapes through an object literal'};
        if(node.type==='Array'&&!allTokens.has(node)&&node.items.some(affected))
            return {helpers:new Map(),current,reason:'native addition Array escapes through a containing Array'};
        if(node.type==='Call'){
            if(allTokens.size&&(node.isNew||node.constructorCall||node.typeArguments?.length||node.args.some(arg=>arg?.type==='Spread')))
                return {helpers:new Map(),current,reason:'native addition cannot prove constructor, generic or spread call effects'};
            if(node.callee?.type==='Member'){
                if(allTokens.size&&!namespaceCalls.has(path(node.callee))&&!allocations(node.callee.object).length)
                    return {helpers:new Map(),current,reason:'native addition cannot prove a foreign member call effect'};
                if(allTokens.size&&namespaceCalls.has(path(node.callee))&&!globalCall(node.callee))
                    return {helpers:new Map(),current,reason:'native addition SDK or builtin callee binding differs'};
                const receiver=node.callee.object,name=node.callee.name;
                if(affected(receiver)){
                    if(!['push','unshift','pop','shift'].includes(name)||node.isNew||node.constructorCall||node.typeArguments?.length||
                        (['pop','shift'].includes(name)?node.args.length!==0:node.args.some(arg=>!primitiveValue(arg))))
                        return {helpers:new Map(),current,reason:'native addition cannot prove an Array method writer or escape'};
                }
                if(node.args.some(affected))return {helpers:new Map(),current,reason:'native addition Array escapes through a member call'};
            }else if(allTokens.size&&!graph.immutableFunctionAt(node)&&
                !(node.callee?.type==='Identifier'&&primitiveCalls.has(node.callee.name)&&globalCall(node.callee)))
                return {helpers:new Map(),current,reason:'native addition cannot prove an actual callee effect'};
            else if(node.args.some(affected)&&!graph.immutableFunctionAt(node))
                return {helpers:new Map(),current,reason:'native addition Array escapes through an unproved callee'};
        }
        if(node.type==='Assignment'){
            const left=node.left;
            if(allTokens.size&&left?.type==='Identifier'&&builtinRoots.has(left.name))
                return {helpers:new Map(),current,reason:'native addition builtin binding has an actual writer'};
            if(allTokens.size&&left?.type==='Index'&&(!allocations(left.object).length||
                types(left.index).size!==1||!types(left.index).has('Number')))
                return {helpers:new Map(),current,reason:'native addition cannot prove a global or nonnumeric indexed writer'};
            if(left?.type==='Index'&&affected(left.object)&&(!primitiveValue(node.right)||types(left.index).size!==1||!types(left.index).has('Number')))
                return {helpers:new Map(),current,reason:'native addition cannot prove an indexed Array writer'};
            if(left?.type==='Member'&&allTokens.size)
                return {helpers:new Map(),current,reason:'native addition Array has an unproved property writer'};
            if(left?.type!=='Identifier'&&affected(node.right))
                return {helpers:new Map(),current,reason:'native addition Array escapes through an object or indexed writer'};
        }
        if(node.type==='Update'&&allTokens.size&&(node.argument?.type!=='Identifier'||builtinRoots.has(node.argument.name)))
            return {helpers:new Map(),current,reason:'native addition cannot prove an updated Array slot'};
        if(node.type==='Unary'&&node.op==='delete'&&allTokens.size)
            return {helpers:new Map(),current,reason:'native addition cannot prove a deleted Array property'};
    }
    if(!current())return {helpers:new Map(),current,reason:'native helper source changed during domain analysis'};
    return {helpers,arrayHelpers,current,reason:null};
}

// Only a complete current body/all-use/domain proof may erase the source join.
// This private AST family keeps native authored semantics separate from PXT +.
export function lowerNativeArrayBinaryHelpers(program,profile=GENERATED_HELPER_PROFILES.ordinary) {
    const proof=inspectNativeArrayBinaryDomains(program,profile);
    if(proof.reason)return {program,unsupported:[proof.reason]};
    if(!proof.helpers.size||!proof.current())return {program,unsupported:[]};
    const removed=new Set(),calls=new Map();
    for(const record of proof.helpers.values()){
        removed.add(record.declaration);for(const call of record.calls)calls.set(call,record);
    }
    const rewrite=node=>{
        if(!node||typeof node!=='object')return node;
        if(Array.isArray(node))return node.filter(value=>!removed.has(value)).map(rewrite);
        if(calls.has(node))return {type:'NativeArrayValueBinary',op:'+',left:rewrite(node.args[0]),right:rewrite(node.args[1])};
        return Object.fromEntries(Object.entries(node).map(([key,value])=>[key,metadata.has(key)?value:rewrite(value)]));
    };
    return proof.current()?{program:rewrite(program),unsupported:[]}:{program,unsupported:['native helper source changed before lowering']};
}
