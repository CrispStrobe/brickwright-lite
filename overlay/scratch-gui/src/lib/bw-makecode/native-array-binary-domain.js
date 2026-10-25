import {numericRecursiveNormalResults} from './numeric-recursive-normal-results.js';
import {imagePixelNormalResults} from './image-pixel-normal-results.js';
import {numericClosureNormalResults} from './numeric-closure-normal-results.js';
import {analyseSourceValueProducers,sdkSpritePrimitiveFieldType} from './source-value-producers.js';
import {inspectNativeArrayAddHelpers} from './native-array-binary-helper-source.js';
import {GENERATED_HELPER_PROFILES,inspectGeneratedHelperBindings,mapGeneratedSourceArray} from './generated-helper-recognition.js';
import {lowerNamedArrayItemHelpers} from './named-array-item-helpers.js';
import {nativeClassScalarView} from './native-class-scalar-view.js';
import {ordinaryPlayerScoreNumberCalls,ordinaryCameraPropertyNumberLeaves,ordinaryMathNumberCalls} from './ordinary-primitive-sdk-number-source.js';
import {ordinarySceneClockNumberCalls} from './ordinary-scene-clock-number-source.js';

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
    // Capture original own/default metadata before new proof traversal or any
    // prepared view can drop hidden parameter-array properties. Its refusal is
    // only absence of this new fact; existing producer paths remain independent.
    const recursiveResults=numericRecursiveNormalResults(program,profile);
    const recursiveSourceTokens=new Map(),recursiveNormalTokens=new Set();
    let recursiveLive=true;
    const syntax=inspectNativeArrayAddHelpers(program,profile),helpers=syntax.helpers;
    if(!helpers.size)return {helpers:new Map(),current:syntax.current,reason:null};
    const suppliedTags=new Set(['NativeNamedArrayCreate','NativeNamedArrayDelete','LegacyParsedValue','LegacyJsonValue','NativeArrayAccess']);
    const supplied=node=>node&&typeof node==='object'&&(Object.hasOwn(node,'bwNativeNamedArray')||Object.hasOwn(node,'nativeArrayDomainCall')||Object.hasOwn(node,'nativeArrayDomainNormalCall')||Object.hasOwn(node,'nativeClosureDomainNormalCall')||Object.hasOwn(node,'nativeImageDomainNormalCall')||Object.hasOwn(node,'nativeRecursiveSourceCall')||Object.hasOwn(node,'nativeRecursiveDomainNormalCall')||
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
        if(recursiveResults.has(node)){
            const token=Symbol();recursiveSourceTokens.set(token,node);copy.nativeRecursiveSourceCall=token;
        }
        return copy;
    };
    // Reuse the existing complete body/binding/registry/ambient proof rather
    // than independently recognizing a JSON or named registry helper family.
    const named=lowerNamedArrayItemHelpers(prepare(program),{profile});
    if(named.unsupported.length)return {helpers:new Map(),current:syntax.current,reason:'native addition named-helper source proof refused: '+named.unsupported.join('; ')};
    const classView=nativeClassScalarView(named.program,profile);
    const bindings=inspectGeneratedHelperBindings(classView.program,profile);
    let closureResults=null,closureLive=true,imageResults=null,imageLive=true;
    let operationUsed=false,operationLive=true,classResultUsed=false,classResultLive=true;const operationAbsences=[];
    const closureNormalTokens=new Set(),imageNormalTokens=new Set();
    const current=()=>{
        if(operationUsed&&!operationLive||classResultUsed&&!classResultLive)return false;
        try{
            const now=syntax.current()&&unaryProof.isCurrent()&&classView.current()&&bindings.isCurrent()&&graph.lexicalDeclarationReadinessCurrent();
            if(closureNormalTokens.size&&(!now||!closureResults.current()))closureLive=false;
            if(imageNormalTokens.size&&(!now||!imageResults.current()))imageLive=false;
            if(recursiveNormalTokens.size&&(!now||!recursiveResults.current()))recursiveLive=false;
            const valid=now&&(!closureNormalTokens.size||closureLive)&&(!imageNormalTokens.size||imageLive)&&(!recursiveNormalTokens.size||recursiveLive);
            if(operationUsed&&(!valid||!operationAbsences.every(({object,key})=>!Object.hasOwn(object,key)&&!(key in object))))operationLive=false;
            if(classResultUsed&&!valid)classResultLive=false;
            return valid&&(!operationUsed||operationLive)&&(!classResultUsed||classResultLive);
        }catch(error){if(operationUsed)operationLive=false;if(classResultUsed)classResultLive=false;throw error;}
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
        replacements.set(node,next);return next;
    };
    const analyse=model=>analyseSourceValueProducers(model,{
        arrayValues:true,arrayEffectSites:true,parenthesized:true,unboundIsOpaque:true,
        uninitializedLocalsAreOpaque:true,declaredLocalUndefined:true,initializationEntries:true,
        ordinaryPrimitiveSdkNumbers:true,sceneClockNumbers:true
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
    const numberResults=source=>[ordinaryPlayerScoreNumberCalls(source),ordinaryCameraPropertyNumberLeaves(source),
        ordinaryMathNumberCalls(source),ordinarySceneClockNumberCalls(source)];
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
        if(numberResultSets.some(producers=>producers.has(actual(node))))return true;
        if(node.type==='Identifier'&&!graph.isInitializedAt(actual(node))&&!graph.immutableFunctionAt(actual(node)))return false;
        return Object.entries(node).every(([key,value])=>metadata.has(key)||initialized(value));
    };
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
    const inertStatement=node=>node?.type==='FunctionDeclaration'||node?.type==='Declaration'&&
        node.decls.every(decl=>inertLiteral(decl.init))||node?.type==='Class'&&!node.base&&
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
        // Preserve the original short circuit exactly. These locals record
        // ONLY predicates that this invocation actually evaluated.
        let initialization='NOT_EVALUATED',capture='NOT_EVALUATED',domain='NOT_EVALUATED';
        const refused=!found.size||!(initialization=initialized(arg))&&!(capture=capturedScalarIdentifier(arg))||
            (domain=[...found].some(type=>!primitive.has(type)&&type?.kind!=='Array'));
        // Existing successful paths remain independent of the new profile.
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
            // Separate, additive fact for the exporter: whether the ordinary
            // (non-join) helper the exporter already emits on refusal is
            // admissible because no Array can reach any addition here. The
            // program must contain no Array literal, index or named-Array
            // node, and EVERY helper operand (not only this first refused
            // one) must have only primitive or Opaque producers. A known
            // object type (Image, object literal) or any Array kind keeps the
            // refusal. Absence of this fact never weakens the refusal above.
            try {
                const arrayShaped=new Set(['Array','Index','NativeNamedArrayCreate','NativeNamedArrayDelete','NativeArrayAccess','LegacyParsedValue','LegacyJsonValue']);
                const operandsOrdinary=domainHelpers.every(each=>each.calls.every(each=>each.args.every(operand=>{
                    if(provedHelperResults.has(operand))return true;
                    const operandTypes=types(operand);
                    return [...operandTypes].every(type=>typeof type==='string'&&(primitive.has(type)||type==='Opaque'))&&!allocations(operand).length;
                })));
                const arrayFree=bindings.nodes.every(node=>!arrayShaped.has(node?.type)&&!Object.hasOwn(node,'bwNativeNamedArray'));
                // A program that holds Arrays still keeps the ordinary helper
                // when no Array can reach any operand. Every operand is traced
                // through its actual writers to primitives, closed helper
                // results, typeof/unary/arithmetic results, known non-Array
                // object types, declared-primitive SDK Sprite fields, members of
                // SDK-declared receivers, flat Array element reads, or program
                // function/method results while every program Array stays in
                // closed program flow. Unknown SDK calls, non-primitive
                // parameters, escaping Arrays and named/legacy Array tags keep
                // the refusal.
                const namedFree=bindings.nodes.every(node=>!['NativeNamedArrayCreate','NativeNamedArrayDelete','NativeArrayAccess','LegacyParsedValue','LegacyJsonValue'].includes(node?.type)&&!Object.hasOwn(node,'bwNativeNamedArray'));
                const unwrap=node=>node?.type==='Parenthesized'?unwrap(node.expression):node;
                const noArray=node=>{const found=types(node);return found.size>0&&[...found].every(type=>typeof type==='string')&&!allocations(node).length;};
                const primitiveOnly=node=>{const found=types(node);return found.size>0&&[...found].every(type=>typeof type==='string'&&primitive.has(type))&&!allocations(node).length;};
                const variable=node=>{const kinds=graph.bindingKindsAt(actual(node));return kinds.size===1&&kinds.has('variable');};
                const bindingAt=(node,name)=>name===undefined?graph.bindingOf(actual(node)):graph.bindingOf(actual(node),name);
                // A binding every declaration of which states one non-Array
                // SDK type (the exported PXT declaration, never a program
                // class or any), and that is not a parameter.
                const userClasses=new Set(bindings.nodes.filter(node=>node?.type==='Class'&&typeof node.name==='string').map(node=>node.name));
                const declaredType=identifier=>{
                    if(identifier?.type!=='Identifier'||!variable(identifier))return null;
                    const binding=bindingAt(identifier);if(binding==null)return null;
                    const rows=bindings.nodes.filter(node=>node.type==='Declaration').flatMap(node=>(node.decls||[]).filter(decl=>bindingAt(node,decl.name)===binding));
                    const names=new Set(rows.map(decl=>decl.isArray===true?null:decl.typeName));
                    const [name]=names;
                    return rows.length>0&&names.size===1&&typeof name==='string'&&/^[A-Za-z_$][\w$.]*$/.test(name)&&
                        !['any','Object','object','unknown'].includes(name)&&!userClasses.has(name)?name:null;
                };
                // Members typed any or Array in the SDK are never admitted.
                const opaqueMembers=new Set(['data','allSprites','sprites','tiles','frames','pixels','children','buffer']);
                const receiverSafe=node=>{
                    const value=unwrap(node);
                    // An element of a program Array whose elements are only Sprites.
                    if(value?.type==='Index'){
                        const object=unwrap(value.object);
                        if(!object||!allocations(object).length)return false;
                        const elements=graph.arrayElementTypesAt(actual(object));
                        return elements.size>0&&[...elements].every(type=>['Null','Undefined','Sprite','SdkSprite'].includes(type));
                    }
                    if(!value||!noArray(value))return false;
                    if(value.type==='Identifier'&&!variable(value))return false;
                    if(declaredType(value))return true;
                    return [...types(value)].every(type=>['Null','Undefined','Sprite','SdkSprite','Image'].includes(type));
                };
                const writersOf=identifier=>{
                    const binding=bindingAt(identifier),rows=[];
                    if(binding==null)return null;
                    for(const node of bindings.nodes){
                        if(node.type==='Declaration')for(const decl of node.decls||[])if(bindingAt(node,decl.name)===binding)rows.push(decl.init?{value:decl.init}:{empty:true});
                        const left=node.type==='Assignment'?unwrap(node.left):node.type==='Update'?unwrap(node.argument):null;
                        if(left?.type==='Identifier'&&bindingAt(left)===binding)rows.push(node.type==='Assignment'&&node.op==='='?{value:node.right}:node.type==='Update'?{empty:true}:{other:true});
                    }
                    return rows;
                };
                // getPixel returns a Number on an Image and throws otherwise;
                // a program class may not supply its own getPixel method.
                const ownGetPixel=bindings.nodes.some(node=>node?.type==='Class'&&(node.methods||[]).some(method=>method?.name==='getPixel'));
                const imageValue=node=>{
                    const value=unwrap(node);if(!value||allocations(value).length||ownGetPixel)return false;
                    if(declaredType(value)==='Image'||value.type==='Member'||value.type==='Index')return true;
                    const found=value.type==='Index'&&allocations(unwrap(value.object)).length?graph.arrayElementTypesAt(actual(unwrap(value.object))):types(value);
                    return found.size>0&&[...found].some(type=>type==='Image')&&[...found].every(type=>['Image','Null','Undefined'].includes(type));
                };
                // Every actual program Array allocation stays inside closed
                // program flow: it never reaches an object literal, a member or
                // indexed store, a callback return, a constructor or an SDK or
                // unknown callee. Then an Opaque program value is never one of
                // them. Computed once, on demand.
                let containment;
                const internal=()=>{
                    if(containment!==undefined)return containment;
                    const reaches=node=>!!node&&typeof node==='object'&&allocations(node).length>0;
                    containment=true;
                    for(const node of bindings.nodes){
                        if(node.type==='Object'&&(node.props||[]).some(property=>reaches(property.value))){containment=false;break;}
                        if(node.type==='Assignment'&&unwrap(node.left)?.type!=='Identifier'&&reaches(node.right)){containment=false;break;}
                        if(node.type==='Call'&&(node.args||[]).some(reaches)&&(node.isNew||node.constructorCall||
                            !(node.callee?.type==='Identifier'&&graph.immutableFunctionAt(actual(node.callee)))&&
                            !(node.callee?.type==='Member'&&reaches(node.callee.object)&&['push','unshift','indexOf','includes','insertAt','removeElement'].includes(node.callee.name)))){containment=false;break;}
                        if(node.type==='Return'&&reaches(node.value)){
                            let owner=bindings.parentOf(node);
                            while(owner&&!['FunctionDeclaration','FunctionExpression'].includes(owner.type))owner=bindings.parentOf(owner);
                            if(owner?.type!=='FunctionDeclaration'){containment=false;break;}
                        }
                    }
                    return containment;
                };
                // A parameter whose own function declares it a primitive
                // (exported PXT) type; untyped, any and object formals refuse.
                const primitiveParameter=identifier=>{
                    const kinds=graph.bindingKindsAt(actual(identifier));
                    if(kinds.size!==1||!kinds.has('parameter'))return false;
                    let owner=bindings.parentOf(identifier);
                    while(owner&&!(Array.isArray(owner.params)&&owner.params.includes(identifier.name)))owner=bindings.parentOf(owner);
                    const declared=owner?.paramTypes?.[identifier.name];
                    return !!declared&&declared.isArray!==true&&['number','string','boolean'].includes(declared.text);
                };
                // A local or global whose every declaration states one program class.
                const programClassLocal=identifier=>{
                    if(!variable(identifier))return false;
                    const binding=bindingAt(identifier);if(binding==null)return false;
                    const rows=bindings.nodes.filter(node=>node.type==='Declaration').flatMap(node=>(node.decls||[]).filter(decl=>bindingAt(node,decl.name)===binding));
                    return rows.length>0&&rows.every(decl=>decl.isArray!==true&&userClasses.has(decl.typeName));
                };
                const fieldWritersSafe=(name,seen)=>{
                    for(const node of bindings.nodes){
                        if(node?.type==='Class'){
                            for(const field of node.fields||[])if(field?.name===name&&(field.parameterProperty&&!['number','string','boolean'].includes(field.typeName)||field.init&&!valueSafe(field.init,seen)))return false;
                        }
                        if(node?.type==='Assignment'){
                            const left=unwrap(node.left);
                            if(left?.type==='Member'&&left.name===name&&(left.computed||node.op!=='='||!valueSafe(node.right,seen)))return false;
                            if(left?.type==='Index')return false;
                        }
                    }
                    return true;
                };
                const primitiveResultOps=new Set(['+','-','*','/','%','**','&','|','^','<<','>>','>>>','<','<=','>','>=','==','!=','===','!==']);
                const valueSafe=(operand,seen=new Set())=>{
                    if(provedHelperResults.has(operand)||primitiveOnly(operand))return true;
                    const node=unwrap(operand);
                    if(!node)return false;
                    if(provedHelperResults.has(node)||primitiveOnly(node))return true;
                    // A revisited producer adds no new leaf; all leaves are still checked.
                    if(seen.has(node))return true;seen.add(node);
                    const found=types(node);
                    if(allocations(node).length||[...found].some(type=>typeof type!=='string'))return false;
                    // A known non-Array object type (Image, Sprite...) is never an Array.
                    if(found.size&&!found.has('Opaque'))return true;
                    // Arithmetic, comparison and unary results of non-Array operands are primitive.
                    if(node.type==='Binary'&&primitiveResultOps.has(node.op))return valueSafe(node.left,seen)&&valueSafe(node.right,seen);
                    // These unary operators always return a primitive, whatever their operand.
                    if(node.type==='Unary'&&['-','+','~','!','typeof'].includes(node.op))return true;
                    if(node.type==='Member'&&!node.optional&&!node.computed){
                        const receiver=unwrap(node.object),receiverTypes=receiver?types(receiver):new Set();
                        if(node.name==='length'&&receiverTypes.size&&[...receiverTypes].some(type=>type?.kind==='Array'||type==='String')&&
                            [...receiverTypes].every(type=>type?.kind==='Array'||['String','Null','Undefined'].includes(type)))return true;
                        if(sdkSpritePrimitiveFieldType(node.name)!==null&&receiverSafe(node.object))return true;
                        // A declared-primitive SDK Sprite field of a program Array
                        // element: only program values reach the element, and any
                        // program class field of that name is checked by its writers.
                        if(sdkSpritePrimitiveFieldType(node.name)!==null&&receiver?.type==='Index'&&allocations(unwrap(receiver.object)).length&&
                            internal()&&fieldWritersSafe(node.name,seen))return true;
                        if(!opaqueMembers.has(node.name)&&!!declaredType(receiver)&&noArray(receiver))return true;
                        // A program class field read: only program values reach it.
                        if(internal()&&!opaqueMembers.has(node.name)&&receiverTypes.size>0&&[...receiverTypes].every(type=>['ClassInstance','Null','Undefined'].includes(type)))return true;
                        // A field of the receiver `this`: every program store to
                        // a field of that name (and its class initializers) is
                        // checked; a parameter property must declare a primitive type.
                        // A declared SDK Sprite primitive field that no program
                        // class redeclares is the SDK field of a Sprite subclass.
                        if(receiver?.type==='Identifier'&&(receiver.name==='this'||programClassLocal(receiver))&&!opaqueMembers.has(node.name)){
                            const declared=bindings.nodes.some(each=>each?.type==='Class'&&(each.fields||[]).some(field=>field?.name===node.name));
                            return !declared&&sdkSpritePrimitiveFieldType(node.name)!==null||fieldWritersSafe(node.name,seen);
                        }
                        return false;
                    }
                    if(node.type==='Call'&&!node.isNew&&node.callee?.type==='Member'&&node.callee.name==='getPixel'&&node.args?.length===2&&
                        imageValue(node.callee.object)&&node.args.every(arg=>valueSafe(arg,seen)))return true;
                    // A canonical generated primitive operation helper returns
                    // a Number or Boolean on normal completion.
                    if(node.type==='Call'&&operationCalls.has(node))return true;
                    // A call of an actual program function or a program class
                    // method computes its result from program values only.
                    if(node.type==='Call'&&!node.isNew&&!node.optional&&internal()){
                        if(node.callee?.type==='Identifier'&&graph.immutableFunctionAt(actual(node.callee)))return true;
                        if(node.callee?.type==='Member'&&!node.callee.optional&&!node.callee.computed){
                            const receiverTypes=types(unwrap(node.callee.object));
                            if(receiverTypes.size&&[...receiverTypes].every(type=>['ClassInstance','Null','Undefined'].includes(type)))return true;
                        }
                    }
                    if(node.type==='Index'){
                        const receiver=unwrap(node.object);
                        // An element of a binding every declaration of which states
                        // a primitive Array type (exported PXT) is that primitive or undefined.
                        if(receiver?.type==='Identifier'&&variable(receiver)){
                            const binding=bindingAt(receiver);
                            const rows=binding==null?[]:bindings.nodes.filter(each=>each.type==='Declaration').flatMap(each=>(each.decls||[]).filter(decl=>bindingAt(each,decl.name)===binding));
                            if(rows.length&&rows.every(decl=>['string[]','number[]','boolean[]'].includes(decl.typeName)))return true;
                        }
                        if(!receiver||!allocations(receiver).length)return false;
                        const elements=graph.arrayElementTypesAt(actual(receiver));
                        return [...elements].every(type=>typeof type==='string'&&type!=='Opaque');
                    }
                    if(node.type==='Identifier'&&primitiveParameter(node))return true;
                    if(node.type!=='Identifier'||!variable(node))return false;
                    const rows=writersOf(node);
                    return !!rows?.length&&rows.every(row=>row.empty||row.value&&valueSafe(row.value,seen));
                };
                // An Array-free program keeps the original rule above unchanged
                // (a known object operand still refuses there).
                const operandsSafe=!arrayFree&&namedFree&&domainHelpers.every(each=>each.calls.every(each=>each.args.every(operand=>valueSafe(operand))));
                if(operandsOrdinary&&arrayFree||operandsSafe)result.ordinaryFallback=true;
            }catch { /* Without this fact the refusal stands unchanged. */ }
            return result;
        }
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
    const namespaceCalls=new Set(['Array.isArray','Object.keys','JSON.parse','JSON.stringify','Math.round','Math.floor','Math.ceil','Math.min','Math.max','Math.abs','Math.random','Math.percentChance',
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
