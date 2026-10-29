import {proveClassCallableSource,assertCurrentClassSourceProof,classSdkImageValueCandidate} from './class-callable-source-flow.js';
import {numericRecursiveNormalResults} from './numeric-recursive-normal-results.js';
import {imagePixelNormalResults} from './image-pixel-normal-results.js';
import {numericClosureNormalResults} from './numeric-closure-normal-results.js';
import {analyseSourceValueProducers} from './source-value-producers.js';
import {inspectNativeArrayAddHelpers} from './native-array-binary-helper-source.js';
import {GENERATED_HELPER_PROFILES,inspectGeneratedHelperBindings,mapGeneratedSourceArray} from './generated-helper-recognition.js';
import {lowerNamedArrayItemHelpers} from './named-array-item-helpers.js';
import {nativeClassScalarView} from './native-class-scalar-view.js';
import {ordinaryPlayerScoreNumberCalls,ordinaryCameraPropertyNumberLeaves,ordinaryMathNumberCalls} from './ordinary-primitive-sdk-number-source.js';
import {createOrdinaryMusicNumberSource} from './ordinary-music-number-source.js';
import {createDestroyedSpriteCallbackNumberSource} from './destroyed-sprite-callback-number-source.js';
import {physicalUpdateSourceSnapshot} from './physical-update-source-snapshot.js';
import {ordinarySceneClockNumberCalls} from './ordinary-scene-clock-number-source.js';

const primitive=new Set(['Number','String','Boolean','Null','Undefined']);
const metadata=new Set(['originalBody','parameterDefaults','paramTypes','typeParameters','returnType','assertedType','bwProcedureConstraintSource','sourceReferenceDeclarations','sourceCallableDeclarations','sourceScalarDeclarations']);

// Use ORIGINAL operations for origin observations, before result-only Number
// projections. Only syntax-owned closed addition calls become native +. Their
// inert declarations are omitted in this PRIVATE view after every reference
// was accounted for; actual emitted source and operand evaluations stay intact.
function imageOriginOperationView(program,syntax) {
    if(!syntax.current())throw new Error('Image origin requires current source');
    const declarations=new Set(),calls=new Set(),mapped=new WeakMap(),active=new WeakSet();
    for(const helper of syntax.helpers.values()){
        declarations.add(helper.declaration);for(const call of helper.calls)calls.add(call);
    }
    const clone=value=>{
        if(typeof value==='function')throw new Error('Image origin requires source data');
        if(!value||typeof value!=='object')return value;
        if(active.has(value))throw new Error('Image origin requires acyclic source');
        if(mapped.has(value))return mapped.get(value);
        const proto=Object.getPrototypeOf(value);
        if(proto!==Object.prototype&&proto!==Array.prototype&&proto!==null)throw new Error('Image origin requires plain source');
        active.add(value);let copy;
        if(calls.has(value)){
            copy={type:'Binary',op:'+',left:clone(value.args[0]),right:clone(value.args[1])};
            if(value.parenthesized===true)copy.parenthesized=true;
        }else if(Array.isArray(value)){
            const length=Object.getOwnPropertyDescriptor(value,'length');
            if(!length||!Object.hasOwn(length,'value')||!Number.isSafeInteger(length.value)||length.value>100000)throw new Error('Image origin requires bounded arrays');
            copy=[];let index=0;
            for(let i=0;i<length.value;i++){
                const row=Object.getOwnPropertyDescriptor(value,String(i));
                if(!row||!Object.hasOwn(row,'value'))throw new Error('Image origin requires dense data arrays');
                if(value===program.body&&declarations.has(row.value))continue;
                Object.defineProperty(copy,String(index++),{...row,value:clone(row.value)});
            }
            Object.defineProperty(copy,'length',{...length,value:index});
            for(const key of Reflect.ownKeys(value)){
                if(key==='length'||typeof key==='string'&&/^(?:0|[1-9][0-9]*)$/.test(key))continue;
                const row=Object.getOwnPropertyDescriptor(value,key);
                if(typeof key!=='string'||!row||!Object.hasOwn(row,'value'))throw new Error('Image origin requires data metadata');
                Object.defineProperty(copy,key,{...row,value:clone(row.value)});
            }
        }else{
            copy=Object.create(proto);
            for(const key of Reflect.ownKeys(value)){
                const row=Object.getOwnPropertyDescriptor(value,key);
                if(typeof key!=='string'||!row||!Object.hasOwn(row,'value'))throw new Error('Image origin requires data properties');
                Object.defineProperty(copy,key,{...row,value:clone(row.value)});
            }
        }
        active.delete(value);mapped.set(value,copy);return copy;
    };
    const model=clone(program);
    if(!syntax.current())throw new Error('Image origin source changed during projection');
    return {program:model,modelOf:node=>mapped.get(node),current:syntax.current};
}

// This is a separate flat-native-coercion view. In particular it never changes
// named-reference element/presence authority or the occurrence export profile.
// The helper's original argument nodes remain the queried expressions. Only
// structurally proved, closed helper bodies are omitted: their Array-dependent result remains Opaque,
// and their argument expressions remain visited in their original order. That
// avoids treating their own known join as a foreign escape without inventing an Array-dependent primitive result. Primitive-only additions
// retain their actual value flow, including nested numeric/text operations.
export function inspectNativeArrayBinaryDomains(program,profile=GENERATED_HELPER_PROFILES.ordinary) {
    return inspectDomains(program,profile,false);
}

// Export alone constructs a candidate join body to decide whether it is
// needed. An Image may select the ordinary emitted + body there. Importing an
// actual authored join body must instead preserve its Image.join exception.
// Keep the selection mode lexical: source metadata/options cannot enable it
// in lowerNativeArrayBinaryHelpers.
export function inspectNativeAdditionExportDomains(program,profile=GENERATED_HELPER_PROFILES.ordinary) {
    return inspectDomains(program,profile,true);
}

function inspectDomains(program,profile,ordinaryExportSelection) {
    // Capture original own/default metadata before new proof traversal or any
    // prepared view can drop hidden parameter-array properties. Its refusal is
    // only absence of this new fact; existing producer paths remain independent.
    const recursiveResults=numericRecursiveNormalResults(program,profile);
    const recursiveSourceTokens=new Map(),recursiveNormalTokens=new Set();
    let recursiveLive=true;
    const syntax=inspectNativeArrayAddHelpers(program,profile),helpers=syntax.helpers;
    if(!helpers.size)return {helpers:new Map(),current:syntax.current,reason:null};
    const suppliedTags=new Set(['NativeNamedArrayCreate','NativeNamedArrayDelete','LegacyParsedValue','LegacyJsonValue','NativeArrayAccess']);
    const supplied=node=>node&&typeof node==='object'&&(Object.hasOwn(node,'bwNativeNamedArray')||Object.hasOwn(node,'nativeArrayDomainCall')||Object.hasOwn(node,'nativeArrayDomainNormalCall')||Object.hasOwn(node,'nativeDestroyedSourceProperty')||Object.hasOwn(node,'nativeDestroyedDomainNormalProperty')||Object.hasOwn(node,'nativeClosureDomainNormalCall')||Object.hasOwn(node,'nativeImageDomainNormalCall')||Object.hasOwn(node,'nativeRecursiveSourceCall')||Object.hasOwn(node,'nativeRecursiveDomainNormalCall')||
        suppliedTags.has(node.type)||Object.entries(node).some(([key,value])=>!metadata.has(key)&&(Array.isArray(value)?value.some(supplied):supplied(value))));
    if(supplied(program))return {helpers:new Map(),current:syntax.current,reason:'native addition requires original source, not supplied private named-helper tags'};
    // A complete unary conversion body returns Number whenever it returns.
    // This is a result fact, not an initialized/primitive fact about its input.
    // Keep the input expression in the private model so its actual calls,
    // writes and Array escapes still participate in the ordinary census.
    const unaryProof=inspectGeneratedHelperBindings(program,profile),unaryDeclarations=new Set(),unaryCalls=new Map();
    const inside=(node,fn)=>{for(let current=node;current;current=unaryProof.parentOf(current))if(current===fn)return true;return false;};
    for(const fn of program.body||[]){
        if(fn?.type!=='FunctionDeclaration'||fn.params?.length!==1)continue;
        const parameter=fn.params[0];
        if(typeof parameter!=='string'||!/^[A-Za-z_$][\w$]*$/.test(parameter)||parameter===fn.name)continue;
        const names=new Map([[fn.name,'__bwNativeUnaryNumber']]);
        // Function-name substitution deliberately does not rename formal
        // metadata. Match the actual formal spelling everywhere instead.
        if(!unaryProof.root(fn)||![`+${parameter}`,`-1 * ${parameter}`].some(expression=>
            unaryProof.matches(fn,`function __bwNativeUnaryNumber(${parameter}: any): number { return ${expression} }`,names)))continue;
        const calls=unaryProof.calls(fn,[1],new Set([fn]));
        if(!calls?.length||!unaryProof.nodes.every(node=>node.type!=='Identifier'||!inside(node,fn)||inside(unaryProof.declarationAt(node),fn)))continue;
        unaryDeclarations.add(fn);for(const call of calls)unaryCalls.set(call,fn);
    }
    // Only the already-proved helper bodies/calls enter this private view.
    // A fresh per-call scalar identity survives the existing normalizer's
    // ordinary cloning; no caller-supplied spelling or metadata can select it.
    const selected=new Set([...helpers.values()].map(helper=>helper.declaration).concat([...unaryDeclarations])),originalCalls=new Map(),tokens=new Map(),unaryTokens=new Set();
    for(const helper of helpers.values())for(const call of helper.calls)originalCalls.set(call,{helper,ordinal:originalCalls.size});
    // Prove the original getter operations before unary/class/result-only
    // projections can erase a callee or hidden source effect. This optional
    // source receipt inhibits later graph issuance when original closure fails.
    let destroyedOriginView=null,destroyedOriginProof=null,destroyedSnapshot=null;
    if(unaryProof.nodes.some(node=>node.type==='Call'&&node.callee?.type==='Member'&&node.callee.name==='onDestroyed'))try{
        destroyedOriginView=imageOriginOperationView(program,syntax);
        destroyedOriginProof=createDestroyedSpriteCallbackNumberSource(destroyedOriginView.program);
        if(destroyedOriginProof.reason===null)destroyedSnapshot=physicalUpdateSourceSnapshot(program);
    }catch{ /* No original receipt supplies no added property fact. */ }
    const destroyedAllowed=destroyedOriginProof?.reason===null&&!!destroyedSnapshot;
    const destroyedTokens=new Set();let destroyedUsed=false,destroyedLive=true;
    const prepare=node=>{
        if(!node||typeof node!=='object')return node;
        if(Array.isArray(node)){const next=mapGeneratedSourceArray(node,prepare);return node.some(value=>selected.has(value))?next.filter((value,index)=>!selected.has(node[index])):next;}
        if(originalCalls.has(node)){
            let owner=unaryProof.parentOf(node);
            while(owner&&owner!==program&&!['FunctionDeclaration','FunctionExpression','Class'].includes(owner.type))owner=unaryProof.parentOf(owner);
            const owningProcedure=owner?.type==='Class'?'UNAVAILABLE':owner===program?'TOP_LEVEL':typeof owner?.name==='string'?owner.name:'ANONYMOUS_OR_UNAVAILABLE';
            const token=Symbol();tokens.set(token,{...originalCalls.get(node),originalCall:node,owningProcedure});
            return {type:'Binary',op:'+',left:prepare(node.args[0]),right:prepare(node.args[1]),nativeArrayDomainCall:token};
        }
        if(unaryCalls.has(node)){
            const token=Symbol();unaryTokens.add(token);
            return {type:'Conditional',test:prepare(node.args[0]),consequent:{type:'Number',value:'0'},alternate:{type:'Number',value:'0'},nativeArrayDomainNormalCall:token};
        }
        const copy=Object.fromEntries(Object.entries(node).map(([key,value])=>[key,metadata.has(key)?value:prepare(value)]));
        if(destroyedAllowed&&node.type==='Member'&&destroyedOriginProof.has(destroyedOriginView.modelOf(node))){
            const token=Symbol();destroyedTokens.add(token);copy.nativeDestroyedSourceProperty=token;
        }
        if(recursiveResults.has(node)){
            const token=Symbol();recursiveSourceTokens.set(token,node);copy.nativeRecursiveSourceCall=token;
        }
        return copy;
    };
    // Reuse the existing complete body/binding/registry/ambient proof rather
    // than independently recognizing a JSON or named registry helper family.
    const prepared=prepare(program);
    // Capture before named/class/normal-return projections can erase syntax or
    // hidden parameter metadata. Only recognized generated helper effects have
    // been projected here; every user declaration/default remains observable.
    const originalMusic=createOrdinaryMusicNumberSource(prepared);
    const originalMusicSnapshot=originalMusic.reason===null?physicalUpdateSourceSnapshot(program):null;
    const musicAllowed=originalMusic.reason===null&&!!originalMusicSnapshot;
    const named=lowerNamedArrayItemHelpers(prepared,{profile});
    if(named.unsupported.length)return {helpers:new Map(),current:syntax.current,reason:'native addition named-helper source proof refused: '+named.unsupported.join('; ')};
    const classView=nativeClassScalarView(named.program,profile);
    const bindings=inspectGeneratedHelperBindings(classView.program,profile);
    const joinedDestroyed=new Set();
    for(const node of bindings.nodes)if(Object.hasOwn(node,'nativeDestroyedSourceProperty')){
        const token=node.nativeDestroyedSourceProperty;
        if(node.type!=='Member'||node.name!=='x'||!destroyedTokens.has(token)||joinedDestroyed.has(token))
            return {helpers:new Map(),current:()=>false,reason:'native addition destroyed callback source identity is ambiguous'};
        joinedDestroyed.add(token);
    }
    if(joinedDestroyed.size!==destroyedTokens.size)return {helpers:new Map(),current:()=>false,
        reason:'native addition destroyed callback source identity was not preserved'};
    let closureResults=null,closureLive=true,imageResults=null,imageLive=true;
    let imageOrigins=null,imageOriginView=null,imageOriginUsed=false,imageOriginLive=true;
    let callableAdditionProof=null,callableAdditionUsed=false,callableAdditionLive=true;
    let musicResultSource=null,musicUsed=false,musicLive=true;const usedMusicSources=[];
    let operationUsed=false,operationLive=true,classResultUsed=false,classResultLive=true,frameDeltaUsed=false,frameDeltaLive=true;const operationAbsences=[];
    const closureNormalTokens=new Set(),imageNormalTokens=new Set();
    const current=()=>{
        if(operationUsed&&!operationLive||classResultUsed&&!classResultLive)return false;
        try{
            musicUsed=musicUsed||graph.musicNumberResultsUsed?.()===true||usedMusicSources.length>0;
            destroyedUsed=destroyedUsed||destroyedTokens.size>0||graph.destroyedNumberResultsUsed?.()===true;
            if(destroyedUsed&&(!destroyedLive||!destroyedOriginView.current()||!destroyedOriginProof.current()||!destroyedSnapshot.current()))destroyedLive=false;
            let musicCurrent=graph.musicNumbersCurrent?.()!==false&&(!musicUsed||
                originalMusic.current()&&originalMusicSnapshot?.current());
            for(let i=0;i<usedMusicSources.length;i++)if(!usedMusicSources[i].current())musicCurrent=false;
            if(callableAdditionUsed){
                if(!callableAdditionLive||!imageOriginView.current()){callableAdditionLive=false;return false;}
                try{assertCurrentClassSourceProof(callableAdditionProof,imageOriginView.program);}catch{callableAdditionLive=false;return false;}
            }
            const now=syntax.current()&&unaryProof.isCurrent()&&classView.current()&&bindings.isCurrent()&&graph.lexicalDeclarationReadinessCurrent()&&
                (!frameDeltaUsed||graph.frameDeltaNumbersCurrent())&&musicCurrent&&(!destroyedUsed||destroyedLive);
            // Like the other consumed facts, any observed staleness permanently
            // expires a used frame-delta proof; restoring the text cannot revive it.
            if(frameDeltaUsed&&!now)frameDeltaLive=false;
            if(musicUsed&&!now)musicLive=false;
            if(closureNormalTokens.size&&(!now||!closureResults.current()))closureLive=false;
            if(imageNormalTokens.size&&(!now||!imageResults.current()))imageLive=false;
            if(recursiveNormalTokens.size&&(!now||!recursiveResults.current()))recursiveLive=false;
            if(imageOriginUsed&&(!now||!imageOriginView.current()||!imageOrigins.current()))imageOriginLive=false;
            const valid=now&&(!closureNormalTokens.size||closureLive)&&(!imageNormalTokens.size||imageLive)&&(!recursiveNormalTokens.size||recursiveLive);
            if(operationUsed&&(!valid||!operationAbsences.every(({object,key})=>!Object.hasOwn(object,key)&&!(key in object))))operationLive=false;
            if(classResultUsed&&!valid)classResultLive=false;
            if(callableAdditionUsed&&!valid)callableAdditionLive=false;
            return valid&&(!musicUsed||musicLive)&&(!frameDeltaUsed||frameDeltaLive)&&(!operationUsed||operationLive)&&(!classResultUsed||classResultLive)&&(!imageOriginUsed||imageOriginLive);
        }catch(error){if(destroyedUsed)destroyedLive=false;if(musicUsed)musicLive=false;if(operationUsed)operationLive=false;if(classResultUsed)classResultLive=false;if(imageOriginUsed)imageOriginLive=false;if(callableAdditionUsed)callableAdditionLive=false;if(frameDeltaUsed)frameDeltaLive=false;throw error;}
    };
    const domainHelpers=[...helpers.values()].map(helper=>({...helper,calls:[]}));
    const observed=new Set(),provedHelperResults=new WeakSet();
    for(const node of bindings.nodes)if(tokens.has(node.nativeArrayDomainCall)){
        const token=node.nativeArrayDomainCall,entry=tokens.get(token);
        if(observed.has(token)||node.type!=='Binary'||node.op!=='+')return {helpers:new Map(),current,reason:'native addition private call identity is ambiguous'};
        observed.add(token);provedHelperResults.add(node);domainHelpers.find(helper=>helper.declaration===entry.helper.declaration).calls.push({args:[node.left,node.right],original:entry});
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
        if(destroyedTokens.has(node.nativeDestroyedSourceProperty)){
            delete next.nativeDestroyedSourceProperty;
            next={type:'Conditional',test:next,consequent:{type:'Number',value:'0'},alternate:{type:'Number',value:'0'},
                nativeDestroyedDomainNormalProperty:node.nativeDestroyedSourceProperty};
        }
        replacements.set(node,next);return next;
    };
    const analyse=model=>analyseSourceValueProducers(model,{
        arrayValues:true,arrayEffectSites:true,arrayCallbackParameters:true,parenthesized:true,unboundIsOpaque:true,
        uninitializedLocalsAreOpaque:true,declaredLocalUndefined:true,initializationEntries:true,
        ordinaryPrimitiveSdkNumbers:true,ordinaryMusicNumbers:musicAllowed,ordinaryDestroyedNumbers:destroyedAllowed,sceneClockNumbers:true
    });
    let model=rewrite(classView.program),graph=analyse(model);
    const hasClosureCandidate=bindings.nodes.some(node=>node.type==='FunctionExpression'&&bindings.parentOf(node)?.type==='Return');
    closureResults=hasClosureCandidate?numericClosureNormalResults(model,profile):{current:()=>true,has:()=>false};
    // The original invocation remains the test of this private normal-return
    // projection. It is still evaluated once, including all callee/argument
    // effects and exceptions. Only the returned value has the proved Number
    // domain; no input, callable binding or capture cell receives that fact.
    const closureCopies=new WeakMap();
    const normalClosureView=node=>{
        if(!node||typeof node!=='object')return node;
        if(Array.isArray(node))return mapGeneratedSourceArray(node,normalClosureView);
        const selected=closureResults.has(node);
        const copy=Object.fromEntries(Object.entries(node).map(([key,value])=>[key,metadata.has(key)?value:normalClosureView(value)]));
        if(!selected){closureCopies.set(node,copy);return copy;}
        const token=Symbol();closureNormalTokens.add(token);
        const projected={type:'Conditional',test:copy,consequent:{type:'Number',value:'0'},alternate:{type:'Number',value:'0'},nativeClosureDomainNormalCall:token};
        closureCopies.set(node,projected);return projected;
    };
    const closureModel=hasClosureCandidate?normalClosureView(model):model;
    if(closureNormalTokens.size){
        const previous=replacements;replacements=new WeakMap();
        for(const node of bindings.nodes){const before=previous.get(node);if(before)replacements.set(node,closureCopies.get(before)||before);}
        model=closureModel;graph=analyse(model);
    }
    // Raw-call membership survives earlier views only through fresh private
    // source tokens, never through a callee spelling or copied source flag.
    // Check the complete token join before projecting any result, so optional
    // recursive rejection cannot partially loan Number into an older view.
    if(recursiveSourceTokens.size&&recursiveResults.current()){
        const matched=new Set();let valid=true;
        const check=node=>{
            if(!node||typeof node!=='object')return;
            if(Array.isArray(node)){for(const value of node)check(value);return;}
            if(Object.hasOwn(node,'nativeRecursiveSourceCall')){
                const token=node.nativeRecursiveSourceCall;
                if(node.type!=='Call'||!recursiveSourceTokens.has(token)||matched.has(token))valid=false;
                matched.add(token);
            }
            for(const [key,value]of Object.entries(node))if(!metadata.has(key))check(value);
        };
        check(model);
        if(valid&&matched.size===recursiveSourceTokens.size){
            const copies=new WeakMap();
            const normalRecursiveView=node=>{
                if(!node||typeof node!=='object')return node;
                if(Array.isArray(node))return mapGeneratedSourceArray(node,normalRecursiveView);
                const selected=recursiveSourceTokens.has(node.nativeRecursiveSourceCall);
                const copy=Object.fromEntries(Object.entries(node).filter(([key])=>key!=='nativeRecursiveSourceCall')
                    .map(([key,value])=>[key,metadata.has(key)?value:normalRecursiveView(value)]));
                if(!selected){copies.set(node,copy);return copy;}
                const token=Symbol();recursiveNormalTokens.add(token);
                // Actual invocation, arguments, exceptions and nonreturn remain
                // the test; only its NORMAL returned value has this domain.
                const projected={type:'Conditional',test:copy,consequent:{type:'Number',value:'0'},
                    alternate:{type:'Number',value:'0'},nativeRecursiveDomainNormalCall:token};
                copies.set(node,projected);return projected;
            };
            const projected=normalRecursiveView(model),previous=replacements;replacements=new WeakMap();
            for(const node of bindings.nodes){const before=previous.get(node);if(before)replacements.set(node,copies.get(before)||before);}
            model=projected;graph=analyse(model);
        }
    }
    // This independent actual-entry proof issues only operation normal results.
    // Literal Image origins in the exporter resource view remain separate from
    // clone nonexposure, generic Image annotations and flat Array admission.
    const hasImageCandidate=bindings.nodes.some(node=>node.type==='Call'&&node.callee?.type==='Member'&&node.callee.name==='getPixel');
    imageResults=hasImageCandidate?imagePixelNormalResults(model,profile):{current:()=>true,has:()=>false};
    if(hasImageCandidate){
        const copies=new WeakMap();
        const normalImageView=node=>{
            if(!node||typeof node!=='object')return node;
            if(Array.isArray(node))return mapGeneratedSourceArray(node,normalImageView);
            const selected=imageResults.has(node);
            const copy=Object.fromEntries(Object.entries(node).map(([key,value])=>[key,metadata.has(key)?value:normalImageView(value)]));
            if(!selected){copies.set(node,copy);return copy;}
            const token=Symbol();imageNormalTokens.add(token);
            const projected={type:'Conditional',test:copy,consequent:{type:'Number',value:'0'},alternate:{type:'Number',value:'0'},nativeImageDomainNormalCall:token};
            copies.set(node,projected);return projected;
        };
        const projected=normalImageView(model);
        if(imageNormalTokens.size){
            const previous=replacements;replacements=new WeakMap();
            for(const node of bindings.nodes){const before=previous.get(node);if(before)replacements.set(node,copies.get(before)||before);}
            model=projected;graph=analyse(model);
        }
    }
    // Reuse the same closed source/binding profiles as the value graph. These
    // are Number results on NORMAL return, never input or initialization facts
    // about their arguments. The complete original argument/effect census is
    // still below; omitted safe-index callbacks are intentionally conservative.
    const numberResults=source=>{
        musicResultSource=musicAllowed?createOrdinaryMusicNumberSource(source):null;
        return [ordinaryPlayerScoreNumberCalls(source),ordinaryCameraPropertyNumberLeaves(source),
            ordinaryMathNumberCalls(source),ordinarySceneClockNumberCalls(source),
            ...(musicResultSource?[musicResultSource]:[])];
    };
    let numberResultSets=numberResults(model);
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
        if(unaryTokens.has(node.nativeArrayDomainNormalCall)||closureNormalTokens.has(node.nativeClosureDomainNormalCall)||imageNormalTokens.has(node.nativeImageDomainNormalCall)||recursiveNormalTokens.has(node.nativeRecursiveDomainNormalCall))return true;
        // Helper operands are original preprojection nodes. Recognize only the
        // actual joined result, not their still-opaque recursive callee binding.
        const projected=actual(node);
        if(projected!==node&&projected.type==='Conditional'&&recursiveNormalTokens.has(projected.nativeRecursiveDomainNormalCall)&&recursiveResults.current())return true;
        for(const producers of numberResultSets)if(producers.has(actual(node))){
            if(producers===musicResultSource&&!usedMusicSources.includes(producers))usedMusicSources.push(producers);
            return true;
        }
        if(node.type==='Member'&&graph.frameDeltaNumberAt?.(actual(node))){frameDeltaUsed=true;return true;}
        if(node.type==='Identifier'&&!graph.isInitializedAt(actual(node))&&!graph.immutableFunctionAt(actual(node)))return false;
        return Object.entries(node).every(([key,value])=>metadata.has(key)||initialized(value));
    };
    // Operator decision 2026-10-27: a numeric SDK Sprite/Image field read
    // (declared number in the Arcade typings) is a Number or, on a non-object
    // receiver, Undefined; it can never yield an Array. That holds unless a
    // program class or object literal can supply an own member of the same
    // name, so any such declaration anywhere refuses this admission. The
    // receiver must be a plain binding or a literal/identifier index of one,
    // evaluated exactly as in the original; no value is substituted.
    const numericSdkFields=new Set(['x','y','z','vx','vy','ax','ay','fx','fy','left','right','top','bottom','width','height','lifespan']);
    const ownMemberNames=(()=>{const names=new Set();let objectLiteral=false;
        for(const node of nodes){
            if(node.type==='Object')objectLiteral=true;
            if(node.type==='Class'){
                for(const field of node.fields||[])if(typeof field?.name==='string')names.add(field.name);else objectLiteral=true;
                for(const method of node.methods||[])if(typeof method?.name==='string')names.add(method.name);else objectLiteral=true;
            }
        }
        return objectLiteral?null:names;})();
    const plainReceiver=node=>node?.type==='Identifier'&&!['this','globalThis','undefined'].includes(node.name)||
        node?.type==='Index'&&node.object?.type==='Identifier'&&!['this','globalThis'].includes(node.object.name)&&
        (node.index?.type==='Number'||node.index?.type==='Identifier');
    const nullishLiteral=value=>value?.type==='Null'||value?.type==='Undefined'||value?.type==='Identifier'&&value.name==='undefined';
    // The exporter's canonical reset `x = null` directly followed, in the
    // same statement list, by a non-nullish `x = value` is never observable.
    const deadReset=(assignment,same)=>{
        const statement=parents.get(assignment);if(statement?.type!=='ExpressionStatement'||statement.expr!==assignment)return false;
        const container=parents.get(statement);if(!container)return false;
        for(const list of Object.values(container)){
            if(!Array.isArray(list))continue;const at=list.indexOf(statement);if(at<0)continue;
            const next=list[at+1];
            return next?.type==='ExpressionStatement'&&next.expr?.type==='Assignment'&&next.expr.op==='='&&same(next.expr.left)&&
                !nullishLiteral(next.expr.right)&&!nodes.some(node=>same(node)&&node!==next.expr.left&&(()=>{for(let p=parents.get(node);p;p=parents.get(p))if(p===next.expr.right)return true;return false;})());
        }
        return false;
    };
    const nullishFreeBinding=identifier=>{
        const value=actual(identifier),binding=graph.bindingOf(value);
        if(!binding)return false;
        const same=node=>node?.type==='Identifier'&&node.name===identifier.name&&graph.bindingOf(node)===binding;
        let parameterOf=null,assigned=false;
        for(const node of nodes){
            if(node.type==='Assignment'&&same(node.left)){if(node.op!=='='||nullishLiteral(node.right)&&!deadReset(node,same))return false;assigned=true;}
            if(node.type==='Update'&&same(node.argument))return false;
            if((node.type==='FunctionDeclaration'||node.type==='FunctionExpression')&&Array.isArray(node.params)&&node.params.includes(identifier.name)&&functionOwner(value)===node)parameterOf=node;
        }
        if(!parameterOf)return assigned;
        // Parameter: the function must only be called directly by name, and
        // every actual argument at this position must be non-nullish.
        const name=parameterOf.name,position=parameterOf.params.indexOf(identifier.name);
        if(typeof name!=='string')return false;
        let calls=0;
        for(const node of nodes){
            if(node.type==='Identifier'&&node.name===name){
                const parent=parents.get(node);
                if(!(parent?.type==='Call'&&parent.callee===node))return false;
                const arg=parent.args?.[position];
                if(!arg||nullishLiteral(arg))return false;
                const found=types(arg);
                if(![...found].every(type=>['Opaque','Null','Undefined'].includes(type))||!found.has('Opaque'))return false;
                if(arg.type==='Identifier'&&found.size>1&&!nullishFreeBinding(arg))return false;
                calls++;
            }
        }
        return calls>0;
    };
    const numericSdkFieldRead=node=>node?.type==='Member'&&typeof node.name==='string'&&numericSdkFields.has(node.name)&&
        ownMemberNames!==null&&!ownMemberNames.has(node.name)&&plainReceiver(node.object)&&!allocations(node).length&&
        (()=>{
            // Opaque SDK objects only; Images, Arrays, primitives and program
            // objects refuse. Null/Undefined are admitted only as artifacts of
            // a hoisted declaration: no explicit null/undefined value may reach
            // the receiver binding through any assignment or call argument.
            const receiver=types(node.object);
            if(!receiver.size||!receiver.has('Opaque')||![...receiver].every(type=>['Opaque','Null','Undefined'].includes(type)))return false;
            const root=node.object.type==='Index'?node.object.object:node.object;
            if(root.type!=='Identifier')return false;
            if(receiver.size===1)return true;
            return nullishFreeBinding(root);
        })();
    // Operator decision 2026-10-27 (follow-up): a variable whose EVERY write
    // is an admitted numeric SDK field read (receiver rules above), a
    // primitive-typed value, or the exporter's canonical dead null reset can
    // only hold a Number or primitive. Any other write (call result, index
    // read, Opaque value, Image, object, update/compound operator) refuses.
    const fieldCell=node=>{
        if(node?.type!=='Identifier'||['this','globalThis','undefined'].includes(node.name))return false;
        const found=types(node);
        if(!found.size||!found.has('Opaque')||![...found].every(type=>type==='Opaque'||primitive.has(type)))return false;
        const value=actual(node),binding=graph.bindingOf(value);
        if(!binding||allocations(node).length)return false;
        const same=entry=>entry?.type==='Identifier'&&entry.name===node.name&&graph.bindingOf(entry)===binding;
        const primitiveWrite=right=>{const written=types(right);return written.size>0&&[...written].every(type=>primitive.has(type))&&!allocations(right).length;};
        const admitted=right=>numericSdkFieldRead(right)||primitiveWrite(right);
        let fieldWrites=0;
        for(const entry of nodes){
            if(entry.type==='Assignment'&&same(entry.left)){
                if(entry.op!=='=')return false;
                if(nullishLiteral(entry.right)){if(!deadReset(entry,same))return false;continue;}
                if(!admitted(entry.right))return false;
                if(numericSdkFieldRead(entry.right))fieldWrites++;
            }
            if(entry.type==='Update'&&same(entry.argument))return false;
            if(entry.type==='Declaration')for(const decl of entry.decls||[])
                if(decl.name===node.name&&graph.bindingOf(entry,decl.name)===binding&&decl.init&&!nullishLiteral(decl.init)){
                    if(!admitted(decl.init))return false;
                    if(numericSdkFieldRead(decl.init))fieldWrites++;
                }
        }
        return fieldWrites>0;
    };
    // Operator decisions 2026-10-28 for #1128: (1) a sum is a Number when both
    // operands are proven Numbers, including self-updating cells (fixed point
    // over every write); (2) the engine-called ExtendableSprite update(dt)
    // parameter is a Number per the SDK typings (game.runtime() is handled
    // separately);
    // (3) SDK calls/methods whose typings declare a number result are Numbers.
    // Opaque, Image, object and unknown values still refuse.
    const helperNames=new Set([...helpers.keys()]);
    const unboundRoot=(node,name)=>node?.type==='Identifier'&&node.name===name&&!graph.bindingKindsAt(actual(node)).size;
    const sdkNumberCalls=new Map([['info',new Set(['score','life','highScore','countdown'])]]);
    const sdkNumberMethods=new Set(['getPixel']);
    // The SDK namespace root must not be aliased, passed, rebound or have any
    // member written anywhere; otherwise its typed result is not established.
    const sdkRootClosed=name=>nodes.every(entry=>{
        if(entry.type==='Assignment'||entry.type==='Update'){
            const target=entry.type==='Assignment'?entry.left:entry.argument;
            for(let t=target;t&&(t.type==='Member'||t.type==='Index');t=t.object)if(t.object?.type==='Identifier'&&t.object.name===name)return false;
            if(target?.type==='Identifier'&&target.name===name)return false;
        }
        if(entry.type!=='Identifier'||entry.name!==name)return true;
        const parent=parents.get(entry);
        return parent?.type==='Member'&&parent.object===entry;
    });
    const sdkNumberCall=node=>{
        if(node?.type!=='Call'||node.isNew||node.optional||node.callee?.type!=='Member'||node.callee.optional)return false;
        const callee=node.callee,root=callee.object;
        if(root?.type==='Identifier'&&sdkNumberCalls.has(root.name)&&sdkNumberCalls.get(root.name).has(callee.name)&&unboundRoot(root,root.name)&&sdkRootClosed(root.name))
            return node.args.every(arg=>numberValue(arg,new Set()));
        return sdkNumberMethods.has(callee.name)&&ownMemberNames!==null&&!ownMemberNames.has(callee.name)&&!ownMemberNames.has('image')&&
            (plainReceiver(root)||root?.type==='Member'&&root.name==='image'&&plainReceiver(root.object))&&
            (()=>{const receiver=types(root);return receiver.size>0&&[...receiver].every(type=>type==='Opaque');})()&&
            node.args.every(arg=>numberValue(arg,new Set()));
    };
    const updateDelta=node=>{
        if(node?.type!=='Identifier')return false;
        const owner=functionOwner(actual(node));
        if(!owner||owner.name!=='update'||!Array.isArray(owner.params)||owner.params[0]!==node.name||owner.params.length!==1)return false;
        const klass=nodes.find(entry=>entry.type==='Class'&&(entry.methods||[]).includes(owner));
        if(!klass||klass.base!=='sprites.ExtendableSprite'||(klass.methods||[]).some(m=>m.isStatic&&m.name==='update'))return false;
        const binding=graph.bindingOf(actual(node));
        return !!binding&&!nodes.some(entry=>(entry.type==='Assignment'&&entry.left?.type==='Identifier'||entry.type==='Update'&&entry.argument?.type==='Identifier')&&
            graph.bindingOf(entry.type==='Assignment'?entry.left:entry.argument)===binding);
    };
    const sumParts=node=>{
        if(node?.type==='Binary'&&['+','-','*','/','%'].includes(node.op))return [node.left,node.right];
        if(node?.type==='Call'&&node.callee?.type==='Identifier'&&helperNames.has(node.callee.name)&&node.args?.length===2)return node.args;
        return null;
    };
    function numberValue(node,seen){
        if(!node||typeof node!=='object')return false;
        // A string literal or proven String joins numbers into a primitive
        // String, never an Array; the result is primitive, not a Number badge.
        if(node.type==='Number'||node.type==='String')return true;
        if(node.type==='Paren'||node.type==='Parenthesized')return numberValue(node.expression||node.inner,seen);
        const found=types(node);
        if(found.size&&[...found].every(type=>type==='Number'||type==='String')&&initialized(node))return true;
        const parts=sumParts(node);if(parts)return parts.every(part=>numberValue(part,seen));
        if(node.type==='Unary'&&['-','+'].includes(node.op))return numberValue(node.argument,seen);
        if(numericSdkFieldRead(node)||sdkNumberCall(node)||updateDelta(node))return true;
        if(node.type!=='Identifier'||['this','globalThis','undefined'].includes(node.name))return false;
        const binding=graph.bindingOf(actual(node));
        if(!binding||allocations(node).length)return false;
        if(seen.has(binding))return true;
        const next=new Set(seen);next.add(binding);
        const same=entry=>entry?.type==='Identifier'&&entry.name===node.name&&graph.bindingOf(entry)===binding;
        let writes=0;
        for(const entry of nodes){
            if(entry.type==='Assignment'&&same(entry.left)){
                if(nullishLiteral(entry.right)){if(!deadReset(entry,same))return false;continue;}
                if(entry.op==='='){if(!numberValue(entry.right,next))return false;}
                else if(['+=','-=','*=','/=','%='].includes(entry.op)){if(!numberValue(entry.right,next))return false;}
                else return false;
                writes++;
            }
            if(entry.type==='Update'&&same(entry.argument))writes++;
            if(entry.type==='Declaration')for(const decl of entry.decls||[])
                if(decl.name===node.name&&graph.bindingOf(entry,decl.name)===binding&&decl.init&&!nullishLiteral(decl.init)){
                    if(!numberValue(decl.init,next))return false;writes++;
                }
        }
        return writes>0;
    }
    const primitiveValue=node=>{const found=types(node);return found.size>0&&[...found].every(type=>primitive.has(type))&&initialized(node);};
    // A captured scalar cell may be read before its first assignment. Its
    // actual Undefined value is still a primitive operand; this does not
    // establish initialization, an Array producer or an input certificate.
    // Both occurrence and complete binding writer facts must be primitive.
    // A captured read is not a module/same-function lexical TDZ read. Before
    // admitting an uninitialized primitive capture, its actual sole binding
    // declaration must execute before any possible entry in the declaring
    // body. Only inert definitions and literal declarations may precede it;
    // uncertain branches, calls, accessors and callback entry remain refused.
    const actualFunctionOwners=new WeakSet();
    for(const node of nodes){
        if(node.type==='FunctionDeclaration'||node.type==='FunctionExpression')actualFunctionOwners.add(node);
        if(node.type==='Class'){
            if(node.ctor)actualFunctionOwners.add(node.ctor);
            for(const method of node.methods||[])actualFunctionOwners.add(method);
        }
    }
    const functionOwner=node=>{
        for(let owner=node;owner;owner=parents.get(owner))
            if(owner===model||actualFunctionOwners.has(owner))return owner;
        return null;
    };
    const inertLiteral=node=>!node||primitive.has(node.type)||
        node.type==='Array'&&Array.isArray(node.items)&&node.items.every(inertLiteral)||
        node.type==='Unary'&&['+','-','!','~','typeof','void'].includes(node.op)&&inertLiteral(node.argument)||
        node.type==='Binary'&&inertLiteral(node.left)&&inertLiteral(node.right);
    // A class declaration evaluates its heritage reference but runs none of
    // its own or its base's constructors, methods or field initializers.
    // Only an absent heritage or a parsed static dotted name reference
    // (e.g. sprites.ExtendableSprite) is inert; any other shape refuses.
    const inertHeritage=base=>base===undefined||base===null||
        typeof base==='string'&&/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/.test(base);
    const inertStatement=node=>node?.type==='FunctionDeclaration'||node?.type==='Declaration'&&
        node.decls.every(decl=>inertLiteral(decl.init))||node?.type==='Class'&&inertHeritage(node.base)&&
        !node.fields?.some(field=>field.isStatic)&&!node.methods?.some(method=>method.isStatic);
    const capturedDeclarationReady=node=>{
        const value=actual(node),readOwner=functionOwner(value);
        if(!readOwner||readOwner===model)return false;
        const binding=graph.bindingOf(value);
        const declarations=nodes.filter(entry=>entry.type==='Declaration').flatMap(statement=>
            statement.decls.filter(decl=>graph.bindingOf(statement,decl.name)===binding).map(decl=>({statement,decl})));
        if(declarations.length!==1)return false;
        const {statement}=declarations[0],owner=functionOwner(statement);
        if(!owner||owner===readOwner||!Array.isArray(owner.body))return false;
        const at=owner.body.indexOf(statement);
        return at>=0&&owner.body.slice(0,at).every(inertStatement);
    };
    // A separate actual declaration-executed frontier may discharge lexical
    // readiness only AFTER the same nonempty primitive occurrence/all-writer
    // gate. It supplies no value, initialized binding or Array certificate.
    const capturedScalarIdentifier=node=>{
        if(node?.type!=='Identifier')return false;
        const value=actual(node),kinds=graph.bindingKindsAt(value);
        if(graph.declarationCountAt(value)!==1||kinds.size!==1||!kinds.has('variable'))return false;
        const occurrence=types(node),writers=graph.bindingTypesAt(value);
        return occurrence.size>0&&writers.size>0&&
            [...occurrence,...writers].every(type=>primitive.has(type))&&
            (initialized(node)||capturedDeclarationReady(node)||graph.isCapturedLexicalDeclarationReadyAt(value));
    };
    // This graph leaves an unassigned module binding's writer set empty, but
    // records Undefined at its actual read. Require precisely that occurrence
    // AFTER its root let declaration, not an empty or opaque occurrence set.
    // Keep this fact local to host coercion arguments: it does not initialize
    // the binding or grant a native-add operand/Array fact. Any actual writer,
    // alias value or read before the declaration retains the strict refusal.
    const unassignedGlobalUndefined=node=>{
        if(node?.type!=='Identifier'||graph.declarationCountAt(node)!==1||
            graph.bindingKindsAt(node).size!==1||!graph.bindingKindsAt(node).has('variable')||
            graph.bindingTypesAt(node).size||types(node).size!==1||!types(node).has('Undefined'))return false;
        for(let owner=node;owner&&owner!==model;owner=parents.get(owner))
            if(['FunctionDeclaration','FunctionExpression','Class'].includes(owner.type))return false;
        let statement=node;
        while(parents.get(statement)&&parents.get(statement)!==model)statement=parents.get(statement);
        const readAt=model.body.indexOf(statement),binding=graph.bindingOf(node);
        if(readAt<0)return false;
        return model.body.some((entry,index)=>index<readAt&&entry.type==='Declaration'&&entry.kind==='let'&&
            entry.decls.some(declaration=>declaration.init===null&&!declaration.isArray&&
                (!declaration.typeName||['number','string','boolean','any'].includes(declaration.typeName))&&
                graph.bindingOf(entry,declaration.name)===binding));
    };
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
    if(parsedValues.size){replacements=new WeakMap();model=rewrite(classView.program);graph=analyse(model);numberResultSets=numberResults(model);nodes.length=0;visit(model);}

    // Only this consumer gains an operation's NORMAL primitive result. The
    // original captured input can remain uninitialized in the general graph.
    // Recognize source bodies and bindings, never helper names or annotations.
    const operationCalls=new WeakMap(),operationRecords=[],badSlot=Symbol();
    const operationSlot=(object,key)=>{
        const descriptor=Object.getOwnPropertyDescriptor(object,key);
        if(!descriptor){
            if(key in object)return badSlot;
            operationAbsences.push({object,key});return undefined;
        }
        return Object.hasOwn(descriptor,'value')?descriptor.value:badSlot;
    };
    const operationParameters=(fn,params)=>{
        for(const object of [fn,params]){
            for(const key of ['parameterDefaults','optionalParams','ordinaryParameterDefaultNames','parameterProperties','typeParameters','genericParams']){
                const value=operationSlot(object,key);
                if(value===badSlot||value!==undefined&&(!Array.isArray(value)||value.length))return false;
            }
            for(const key of ['async','generator','isAsync','isGenerator']){
                const value=operationSlot(object,key);if(value!==undefined&&value!==false)return false;
            }
            if(operationSlot(object,'restParam')!==undefined)return false;
            const kind=operationSlot(object,'functionKind'),prologue=operationSlot(object,'parameterDefaultPrologue');
            if(kind!==undefined&&kind!=='declaration'||prologue!==undefined&&typeof prologue!=='boolean')return false;
        }
        return true;
    };
    const operationPlainCall=(call,arity)=>{
        if(operationSlot(call,'type')!=='Call')return false;
        for(const key of ['isNew','constructorCall']){
            const value=operationSlot(call,key);if(value!==undefined&&value!==false)return false;
        }
        const generics=operationSlot(call,'typeArguments'),args=operationSlot(call,'args');
        return (generics===undefined||Array.isArray(generics)&&!generics.length)&&Array.isArray(args)&&args.length===arity&&
            args.every(arg=>arg&&typeof arg==='object'&&typeof operationSlot(arg,'type')==='string'&&operationSlot(arg,'type')!=='Spread');
    };
    const operationInternal=(node,fn)=>{
        for(let parent=bindings.parentOf(node);parent;parent=bindings.parentOf(parent))if(parent===fn)return true;
        return false;
    };
    const operationBinary=['-','*','/','%','**','&','|','^','<<','>>','>>>'];
    const operationComparisons=['<','<=','>','>=','==','!=','===','!=='];
    for(const fn of classView.program.body||[]){
        if(fn?.type!=='FunctionDeclaration'||!bindings.root(fn))continue;
        const params=operationSlot(fn,'params');
        if(!Array.isArray(params)||![1,2].includes(params.length)||!operationParameters(fn,params)||
            params.some(name=>typeof name!=='string'||!/^[A-Za-z_$][\w$]*$/.test(name)||name===fn.name)||new Set(params).size!==params.length)continue;
        let templateName='__bwPrimitiveOperation';while(params.includes(templateName))templateName+='_';
        const names=new Map([[fn.name,templateName]]),a=params[0],b=params[1];
        // A descriptor-only preselection avoids parsing/checking unrelated
        // templates. Only the complete canonical match below issues a role.
        const body=operationSlot(fn,'body');
        if(!Array.isArray(body)||body.length!==1||operationSlot(body[0],'type')!=='Return')continue;
        const returned=operationSlot(body[0],'value');if(!returned||typeof returned!=='object')continue;
        const kind=operationSlot(returned,'type'),op=operationSlot(returned,'op');
        let bodies=[];
        if(params.length===2&&kind==='Binary'){
            if(operationBinary.includes(op))bodies=[{expression:`${a} ${op} ${b}`,result:'number'}];
            else if(operationComparisons.includes(op))bodies=[{expression:`${a} ${op} ${b}`,result:'boolean'}];
        }else if(params.length===1){
            if(kind==='Binary'&&op==='*')bodies=[{expression:`-1 * ${a}`,result:'number'}];
            else if(kind==='Unary'&&['+','~','!'].includes(op))bodies=[{expression:`${op}${a}`,result:op==='!'?'boolean':'number'}];
        }
        const selected=bodies.find(body=>bindings.matches(fn,
            `function ${templateName}(${params.map(name=>`${name}: any`).join(', ')}): ${body.result} { return ${body.expression} }`,names));
        if(!selected)continue;
        // Inspect optional fields before the existing call census reads them.
        let safe=true;
        for(const node of bindings.nodes)if(node.type==='Identifier'&&bindings.declarationAt(node)===fn&&!operationInternal(node,fn)){
            const parent=bindings.parentOf(node);
            if(!parent||operationSlot(parent,'callee')!==node||!operationPlainCall(parent,params.length)){safe=false;break;}
        }
        if(!safe)continue;
        const calls=bindings.calls(fn,[params.length],new Set([fn]));
        if(!calls?.length)continue;
        const record={fn,arity:params.length,calls,dependencies:new Set()};operationRecords.push(record);
        for(const call of calls)operationCalls.set(call,record);
    }
    const operationMemo=new WeakMap(),operationActive=new WeakSet();
    const localPrimitiveOperation=node=>{
        if(!node||typeof node!=='object')return false;
        if(operationMemo.has(node))return operationMemo.get(node);
        const record=operationCalls.get(node);if(!record||operationActive.has(node))return false;
        // Parsed-value and normal-result views may have rebuilt the model.
        // Join exact original children to the FINAL graph; never query a stale
        // intermediate graph or infer an association from callee spelling.
        const final=actual(node);
        if(final?.type!=='Call'||final.callee!==actual(node.callee)||final.args?.length!==record.arity||
            final.args.some((arg,index)=>arg!==actual(node.args[index]))||graph.immutableFunctionAt(final)!==actual(record.fn))return false;
        operationActive.add(node);
        const valid=node.args.every(arg=>{
            if(primitiveValue(arg)||capturedScalarIdentifier(arg))return true;
            const nested=operationCalls.get(arg);
            if(!nested||!localPrimitiveOperation(arg))return false;
            record.dependencies.add(nested);return true;
        });
        operationActive.delete(node);operationMemo.set(node,valid);return valid;
    };
    // Close every actual call to each used helper, including calls outside an
    // addition operand. Local proofs descend finite argument trees; this
    // dependency closure cannot manufacture a leaf from a helper cycle.
    const closedOperations=new Set(operationRecords.filter(record=>record.calls.every(localPrimitiveOperation)));
    let operationsChanged;
    do{
        operationsChanged=false;
        for(const record of closedOperations)if([...record.dependencies].some(dependency=>!closedOperations.has(dependency))){
            closedOperations.delete(record);operationsChanged=true;
        }
    }while(operationsChanged);
    const normalPrimitiveOperation=node=>closedOperations.has(operationCalls.get(node))&&localPrimitiveOperation(node);
    // This is a result-local composition, never an initialized receiver fact.
    // Class selection already closes its value/effect/writer census. Entry
    // readiness still belongs to the final generic graph, separately.
    const classArgumentReady=node=>{
        if(!node||typeof node!=='object')return true;
        if(initialized(node)||capturedScalarIdentifier(node))return true;
        if(Array.isArray(node))return node.every(classArgumentReady);
        if(node.type==='Identifier')return false;
        return Object.entries(node).every(([key,value])=>metadata.has(key)||classArgumentReady(value));
    };
    const classReceiverReady=node=>{
        if(initialized(node))return true;
        if(node?.type==='Identifier'){
            const value=actual(node),kinds=graph.bindingKindsAt(value);
            return graph.declarationCountAt(value)===1&&kinds.size===1&&kinds.has('variable')&&
                graph.isCapturedLexicalDeclarationReadyAt(value);
        }
        // A nested field retains its original access and effects. Only its
        // actual receiver may use the captured-object declaration frontier.
        if(node?.type==='Member')return classReceiverReady(node.object);
        return classArgumentReady(node);
    };
    const normalPrimitiveClass=node=>{
        if(!classView.hasNormalPrimitiveResult||node?.type!=='Conditional')return false;
        const final=actual(node),test=node.test,mapped=actual(test);
        if(final?.type!=='Conditional'||final.test!==mapped||final.consequent!==actual(node.consequent)||
            final.alternate!==actual(node.alternate))return false;
        let ready=false;
        if(test?.type==='Identifier')ready=mapped?.type==='Identifier'&&classView.hasCapturedPrimitiveRead?.(node)===true;
        else if(test?.type==='Member')ready=mapped?.type==='Member'&&mapped.object===actual(test.object)&&
            (classReceiverReady(test.object)||classView.hasOwnedReceiverResult?.(node)===true);
        else if(test?.type==='Call'&&test.callee?.type==='Member')ready=mapped?.type==='Call'&&
            mapped.callee===actual(test.callee)&&mapped.callee.object===actual(test.callee.object)&&
            mapped.args?.length===test.args?.length&&mapped.args.every((arg,index)=>arg===actual(test.args[index]))&&
            (classReceiverReady(test.callee.object)||classView.hasOwnedReceiverResult?.(node)===true)&&test.args.every(classArgumentReady);
        return ready&&classView.hasNormalPrimitiveResult(node);
    };
    // Query an independent execution of ORIGINAL operations. The ordinary
    // producer view contains type-only zero projections and cannot establish
    // which branch or Image allocation the source actually observes.
    const originalOriginAt=(call,position,query)=>{
        try{
            if(!imageOrigins){
                imageOriginView ||= imageOriginOperationView(program,syntax);
                imageOrigins=imagePixelNormalResults(imageOriginView.program,profile);
            }
            const original=call.original.originalCall.args[position];
            const node=imageOriginView.modelOf(original);
            return !!node&&typeof imageOrigins[query]==='function'&&
                imageOrigins[query](node)&&imageOriginView.current()&&imageOrigins.current();
        }catch{return false;}
    };
    const imageAt=(call,position)=>originalOriginAt(call,position,'isImageValue');
    const primitiveAt=(call,position)=>originalOriginAt(call,position,'isPrimitiveValue');
    // The existing complete class/closure producer checks every actual
    // invocation. Its Binary '+' rule accepts only produced Number/String
    // operands. Query the observed ORIGINAL Binary occurrence, never a class
    // annotation or a result-only scalar projection. Unobserved bodies and
    // incompatible invocations cannot borrow this ordinary-addition fact.
    const callablePrimitiveAddition=call=>{
        if(!ordinaryExportSelection)return false;
        try{
            imageOriginView ||= imageOriginOperationView(program,syntax);
            callableAdditionProof ||= proveClassCallableSource(imageOriginView.program,{sdkImagePrototype:true});
            if(!callableAdditionProof.eligible)return false;
            assertCurrentClassSourceProof(callableAdditionProof,imageOriginView.program);
            const node=imageOriginView.modelOf(call.original.originalCall);
            const valid=node?.type==='Binary'&&node.op==='+'&&classSdkImageValueCandidate(callableAdditionProof,node)&&imageOriginView.current();
            if(valid)callableAdditionUsed=true;
            return valid;
        }catch{return false;}
    };
    const imageFamilies=new Map();
    const imageOnlyFamily=helper=>{
        if(imageFamilies.has(helper))return imageFamilies.get(helper);
        // The emitted helper is shared by every actual caller. Selecting its
        // ordinary body for one Image call must never change an Array call.
        const safe=helper.calls.every(call=>call.args.every((arg,position)=>{
            if(provedHelperResults.has(arg)||primitiveValue(arg)||capturedScalarIdentifier(arg))return true;
            return primitiveAt(call,position)||imageAt(call,position)||callablePrimitiveAddition(call);
        }));
        imageFamilies.set(helper,safe);return safe;
    };
    const allTokens=new Set(),arrayHelpers=new Set();
    for(const helper of domainHelpers)for(const call of helper.calls)for(let position=0;position<call.args.length;position++){
        const arg=call.args[position];
        // An actual closed helper's result is primitive on NORMAL return only
        // after its own operands and every selected Array/effect obligation
        // below succeed. Defer this result edge; every original helper call,
        // including this nested call, still has all inputs checked here.
        // The syntax proof excludes cycles/shared executable identities, so
        // a result cannot justify its own unproved input. No Array result or
        // captured Array initialization is inferred through this edge.
        if(provedHelperResults.has(arg))continue;
        const found=types(arg);
        // This pointwise executed origin is independent of nominal graph tags.
        // A wrapped frame index can remain Opaque in the general graph while
        // every actual observation here is an initialized owned Image.
        // Reimported frame indices share arithmetic helpers with Image
        // arithmetic. Original all-normal primitive observations can select
        // their actual scalar result without weakening helper-family closure,
        // the independent Number API, or any producer/initialization gate.
        const ownedOrigin=ordinaryExportSelection&&!primitiveValue(arg)&&!capturedScalarIdentifier(arg)&&
            imageOnlyFamily(helper)&&(primitiveAt(call,position)||imageAt(call,position)||callablePrimitiveAddition(call));
        // Preserve the original short circuit exactly. These locals record
        // ONLY predicates that this invocation actually evaluated.
        let initialization='NOT_EVALUATED',capture='NOT_EVALUATED',domain='NOT_EVALUATED';
        const refused=!ownedOrigin&&(!found.size||!(initialization=initialized(arg))&&!(capture=capturedScalarIdentifier(arg))||
            (domain=[...found].some(type=>!primitive.has(type)&&type?.kind!=='Array')));
        // Existing successful paths remain independent of the new profile.
        if(refused&&numericSdkFieldRead(arg))continue;
        if(refused&&fieldCell(arg))continue;
        // Value-domain admission never discharges lexical readiness: a read
        // before its declaration executes keeps the original refusal.
        if(refused&&(arg?.type!=='Identifier'||initialized(arg)||capturedDeclarationReady(arg))&&numberValue(arg,new Set()))continue;
        if(refused&&normalPrimitiveOperation(arg)){operationUsed=true;continue;}
        if(refused&&normalPrimitiveClass(arg)){classResultUsed=true;continue;}
        if(refused){
            const result={helpers:new Map(),current,reason:'native addition requires initialized primitive or proved flat Array operands'};
            // Diagnostics must never replace the original refusal, including
            // when a malformed diagnostic observation itself throws.
            try {
                result.refusal={schema:'native-addition-refusal-v1',helper:helper.declaration.name,
                    sourceCallOrdinal:call.original.ordinal,sourceCallOrder:'CLOSED_HELPER_CALL_ORDER',
                    operand:position===0?'LEFT':'RIGHT',operandIndex:position,
                    operandNodeType:typeof arg.type==='string'?arg.type:'UNAVAILABLE',
                    foundTypes:[...found].map(type=>{
                        if(typeof type==='string')return type;
                        const kind=Object.getOwnPropertyDescriptor(type,'kind');
                        return kind&&Object.hasOwn(kind,'value')&&typeof kind.value==='string'?kind.value:'UNAVAILABLE';
                    }),
                    initialization,capturedScalar:capture,invalidDomain:domain,
                    sourceRange:'UNAVAILABLE',owningProcedure:call.original.owningProcedure,block:'UNAVAILABLE',classSlot:'UNAVAILABLE'};
            }catch { /* Retain the original refusal with no invented details. */ }
            // Operator decision 2026-10-27 (supersedes d86881e for Array-free
            // programs): when no authored Array can exist, the native join is
            // irrelevant and the ordinary helper the exporter emits on refusal
            // is main's pre-join export. Additive fact only: every helper
            // operand must have primitive or Opaque producer types and no
            // Array allocation; Image/object/Array operands keep the refusal.
            // The exporter's own frame banks (Image[] declared as
            // __bwFrames_*) and their index reads are Image-typed, so they
            // are not authored Arrays; any operand they reach is an Image and
            // is refused by the operand rule above.
            try {
                const arrayShaped=new Set(['Array','Index','NativeNamedArrayCreate','NativeNamedArrayDelete','NativeArrayAccess','LegacyParsedValue','LegacyJsonValue']);
                const frameBank=name=>typeof name==='string'&&/^__bwFrames_[A-Za-z0-9_]+$/.test(name);
                const generatedBank=new WeakSet();
                for(const node of bindings.nodes){
                    if(node?.type==='Declaration')for(const decl of node.decls||[])
                        if(frameBank(decl.name)&&decl.init?.type==='Array'&&decl.init.items.every(item=>item?.type==='Template'&&item.tag==='img'))generatedBank.add(decl.init);
                    if(node?.type==='Index'&&node.object?.type==='Identifier'&&frameBank(node.object.name))generatedBank.add(node);
                }
                const operandsOrdinary=domainHelpers.every(each=>each.calls.every(site=>site.args.every(operand=>{
                    if(provedHelperResults.has(operand))return true;
                    const operandTypes=types(operand);
                    const allPrimitive=operandTypes.size>0&&[...operandTypes].every(type=>typeof type==='string'&&primitive.has(type));
                    // A directly added unknown call/construction/template result
                    // may itself be an SDK Array or Image: refused unless primitive.
                    if(!allPrimitive&&['Call','New','Template'].includes(operand?.type))return false;
                    return operandTypes.size>0&&[...operandTypes].every(type=>typeof type==='string'&&(primitive.has(type)||type==='Opaque'))&&!allocations(operand).length;
                })));
                // SDK calls that return Arrays make the program Array-holding.
                const sdkArrayCalls=new Set(['allOfKind','getTilesByType','getTilesByTile','getTileLocations','allSprites','split','slice','concat','filter','map','splice','keys']);
                const sdkArrayFree=bindings.nodes.every(node=>!(node?.type==='Call'&&node.callee?.type==='Member'&&sdkArrayCalls.has(node.callee.name)));
                const arrayFree=bindings.nodes.every(node=>!node||typeof node!=='object'||generatedBank.has(node)||
                    !arrayShaped.has(node.type)&&!Object.hasOwn(node,'bwNativeNamedArray'));
                if(operandsOrdinary&&arrayFree&&sdkArrayFree)result.ordinaryFallback=true;
            }catch { /* Without this fact the refusal stands unchanged. */ }
            return result;
        }
        if(ownedOrigin){if(!callablePrimitiveAddition(call))imageOriginUsed=true;continue;}
        for(const allocation of allocations(arg)){
            if(!(position===0?helper.leftArray:helper.rightArray))return {helpers:new Map(),current,reason:'native helper does not join this actual Array operand position'};
            allTokens.add(allocation);arrayHelpers.add(helper.declaration.name);
        }
    }
    // Unary conversion can invoke an object's ToPrimitive hooks. The private
    // result model does not execute or remove those effects from actual source.
    // When a native Array join is selected, require primitive-only conversion
    // inputs so no implicit opaque callback can mutate its body/prototype.
    // Undefined is a legitimate input and returns NaN; initialization is not
    // needed to establish this conversion's normal-return result.
    if(allTokens.size)for(const node of bindings.nodes)if(unaryTokens.has(node.nativeArrayDomainNormalCall)){
        const found=types(node.test);
        if(!found.size||[...found].some(type=>!primitive.has(type)))
            return {helpers:new Map(),current,reason:'native addition cannot prove unary conversion has no opaque coercion effects'};
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
    const namespaceCalls=new Set(['Array.isArray','Object.keys','JSON.parse','JSON.stringify','Math.round','Math.floor','Math.ceil','Math.min','Math.max','Math.atan2','Math.abs','Math.random','Math.percentChance',
        'console.log','game.onUpdate','game.onUpdateInterval','control.runInParallel','control.panic','basic.pause','music.stopAllSounds',
        'info.setScore','info.changeScoreBy','info.score','info.startCountdown','info.onCountdownEnd','sprites.create','sprites.onCreated','sprites.onDestroyed','sprites.onOverlap']);
    const root=node=>node?.type==='Identifier'?node:node?.type==='Member'?root(node.object):null;
    const globalCall=node=>{const base=root(node);return !!base&&!graph.bindingKindsAt(base).size;};
    const primitiveCalls=new Set(['pause','isNaN','Number','String','Boolean','parseInt','parseFloat']);
    const coerciveNumberInputs=new Set(['Number','String','parseInt','parseFloat','isNaN',
        'info.setScore','info.changeScoreBy','info.startCountdown']);
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
            // A known host Number result says nothing about its arguments.
            // Numeric builtins can invoke an opaque operand's ToPrimitive;
            // retain the scalar result fact, but do not borrow Array-join
            // authority across that implicit callback frontier. Actual local
            // function bodies remain subject to the complete source census.
            if(allTokens.size&&!graph.immutableFunctionAt(node)&&
                (types(node).size===1&&types(node).has('Number')||coerciveNumberInputs.has(path(node.callee))||
                    node.callee?.type==='Member'&&path(node.callee.object)==='Math')&&
                node.args.some(arg=>!primitiveValue(arg)&&!capturedScalarIdentifier(arg)&&!unassignedGlobalUndefined(arg)))
                return {helpers:new Map(),current,reason:'native addition cannot prove host Number conversion has no opaque coercion effects'};
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
        if(Array.isArray(node)){const next=mapGeneratedSourceArray(node,rewrite);return node.some(value=>removed.has(value))?next.filter((value,index)=>!removed.has(node[index])):next;}
        if(calls.has(node))return {type:'NativeArrayValueBinary',op:'+',left:rewrite(node.args[0]),right:rewrite(node.args[1])};
        return Object.fromEntries(Object.entries(node).map(([key,value])=>[key,metadata.has(key)?value:rewrite(value)]));
    };
    return proof.current()?{program:rewrite(program),unsupported:[]}:{program,unsupported:['native helper source changed before lowering']};
}
