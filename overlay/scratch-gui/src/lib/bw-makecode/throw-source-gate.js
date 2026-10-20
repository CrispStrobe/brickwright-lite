import {validateProcedureConstraintSource} from './procedure-constraint-source.js';
import {analyseSourceValueProducers,preparePhysicalUpdateThrowSource,physicalUpdateSourceFor} from './source-value-producers.js';
import {staticSdkNamespaceReceivers} from './static-sdk-namespaces.js';
import {physicalUpdateSourceSnapshot} from './physical-update-source-snapshot.js';
import {validatePhysicalUpdateLowering} from './lower-object-classes.js';

const sourceProofs=new WeakMap(),emissionProofs=new WeakMap();
export function hasThrowEmission(program){return emissionProofs.get(program)?.current()===true;}
export function prepareThrowEmission(program,sourceProof,lowering=null,originalProof=sourceProof){
    const source=sourceProofs.get(sourceProof),original=sourceProofs.get(originalProof),unsupported=[];
    const projections=emissionProofs.get(program)?.projections||new Set();
    if([...projections].some(proof=>!proof.current()))unsupported.push('Throw actual consumed emitter projection changed before publication');
    if(!original||!original.snapshot.current()||!source||!source.snapshot.current())unsupported.push('Throw source changed before final emission');
    else if(sourceProof.physicalUpdateSource)unsupported.push(...validatePhysicalUpdateLowering(program,lowering));
    else {const final=prepareThrowSource(program);if(!final.present||final.unsupported.length)unsupported.push('Throw final ordinary/controller source failed fresh reproof',...final.unsupported);}
    const snapshot=physicalUpdateSourceSnapshot(program);
    if(!snapshot)unsupported.push('Throw final emission requires current plain data');
    if(!unsupported.length){
        // Publication of the outer route must also observe every actually
        // consumed projection. Reproof cannot erase an existing dependency.
        emissionProofs.set(program,Object.freeze({sourceProof,lowering,originalProof,projections,
            current:()=>snapshot.current()&&source.snapshot.current()&&original.snapshot.current()&&[...projections].every(proof=>proof.current())}));
    }
    return Object.freeze(unsupported);
}

// A real emitter may project an actual Program. Recompute the current source
// and generated correspondence on that output; never transplant the old brand
// or its binding symbols onto new identities.
export function reproveThrowEmission(program,previous){
    const prior=emissionProofs.get(previous);
    if(!prior?.current())return Object.freeze(['Throw emission projection requires its actual current private predecessor']);
    if(emissionProofs.has(program))return Object.freeze(['Throw emission projection requires its fresh never-branded actual output Program']);
    const unsupported=prepareThrowEmission(program,prior.sourceProof,prior.lowering,prior.originalProof);
    if(!unsupported.length)prior.projections.add(emissionProofs.get(program));
    return unsupported;
}

// This gate proves source contexts and operand domains. It issues no runtime
// exception/owner capability and does not enable a canonical compiler word.
export function prepareThrowSource(program) {
    const sourceSnapshot=physicalUpdateSourceSnapshot(program);
    if(!sourceSnapshot)return Object.freeze({present:true,program,unsupported:Object.freeze(['Throw source requires current acyclic plain own data'])});
    const all=[],parents=new WeakMap(),seen=new WeakSet();let shared=false;
    const metadata=new Set(['originalBody','parameterDefaults','paramTypes','typeParameters','returnType','assertedType','bwProcedureConstraintSource']);
    const collect=(node,parent=null)=>{
        if(!node||typeof node!=='object')return;
        if(seen.has(node)){shared=true;return;}seen.add(node);
        if(Array.isArray(node)){node.forEach(child=>collect(child,parent));return;}
        all.push(node);parents.set(node,parent);
        for(const [key,child]of Object.entries(node))if(!metadata.has(key))collect(child,node);
    };collect(program);
    const throws=all.filter(node=>node.type==='ThrowStatement');
    if(!throws.length)return Object.freeze({present:false,unsupported:Object.freeze([]),program});
    if(shared)return Object.freeze({present:true,program,unsupported:Object.freeze(['Throw source requires unshared executable nodes'])});
    const unsupported=[],fail=message=>{const text=`Throw source: ${message}`;if(!unsupported.includes(text))unsupported.push(text);};
    for(const diagnostic of validateProcedureConstraintSource(program))fail(diagnostic);
    const options={unboundIsOpaque:true,opaqueDeclarationValues:true,uninitializedLocalsAreOpaque:true};
    let graph=analyseSourceValueProducers(program,options),completion=graph.normalCompletion;
    const sdk=staticSdkNamespaceReceivers(program),primitive=new Set(['Number','String','Boolean','Null','Undefined']);
    const path=node=>node?.type==='Identifier'?node.name:node?.type==='Member'?path(node.object)+'.'+node.name:null;
    const root=node=>node?.type==='Identifier'?node:['Member','Index'].includes(node?.type)?root(node.object):null;
    const roots=new Set(['controller','ControllerButtonEvent']);let unsafeSdk=false;
    for(const node of all){
        const written=node.type==='Assignment'?node.left:node.type==='Update'?node.argument:null,base=root(written);
        if(base&&roots.has(base.name)&&sdk.has(base))unsafeSdk=true;
        if(node.type==='Identifier'&&roots.has(node.name)&&sdk.has(node)){
            const parent=parents.get(node);if(!(['Member','Index'].includes(parent?.type)&&parent.object===node))unsafeSdk=true;
        }
        if(['Member','Index'].includes(node.type)&&root(node)?.name==='controller'&&sdk.has(root(node))){const parent=parents.get(node);if(node.type==='Index'||!(parent?.type==='Member'&&parent.object===node)&&!(parent?.type==='Call'&&parent.callee===node&&/^controller\.(A|B|up|down|left|right)\.onEvent$/.test(path(node)||'')))unsafeSdk=true;}
        if(node.type==='Member'&&/^controller\.(A|B|up|down|left|right)\.onEvent$/.test(path(node)||'')){
            const parent=parents.get(node);if(parent?.type!=='Call'||parent.callee!==node)unsafeSdk=true;
        }
    }
    const button=fn=>{
        const call=parents.get(fn),callee=call?.callee,event=call?.args?.[0];
        return !unsafeSdk&&call?.type==='Call'&&!call.isNew&&!call.typeArguments?.length&&call.args.length===2&&call.args[1]===fn&&fn.params.length===0&&
            /^controller\.(A|B|up|down|left|right)\.onEvent$/.test(path(callee)||'')&&sdk.has(callee)&&
            event?.type==='Member'&&['Pressed','Released','Repeated'].includes(event.name)&&event.object?.type==='Identifier'&&event.object.name==='ControllerButtonEvent'&&sdk.has(event);
    };
    const owner=new WeakMap(),structured=new WeakSet(),calls=[],main=program;
    const loops=new Set(['For','ForOf','ForIn','While','DoWhile','Switch','Try','TryStatement']);
    const walk=(node,current=main,nested=false)=>{
        if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(child=>walk(child,current,nested));return;}
        owner.set(node,current);if(nested)structured.add(node);
        if(['FunctionDeclaration','FunctionExpression'].includes(node.type)){walk(node.body,node,false);return;}
        if(node.type==='Class'){
            for(const field of node.fields||[])walk(field.init,node,false);
            for(const method of [node.ctor,...(node.methods||[])].filter(Boolean))walk(method.body,method,false);return;
        }
        if(node.type==='Call')calls.push({node,owner:current,target:graph.immutableFunctionAt(node)});
        for(const child of Object.values(node))walk(child,current,nested||loops.has(node.type));
    };walk(program);
    const affected=new Set(throws.map(node=>owner.get(node)));
    let changed;do{changed=false;for(const call of calls)if(affected.has(call.target)&&!affected.has(call.owner)){affected.add(call.owner);changed=true;}}while(changed);
    const sourceMethods=new Set(all.filter(node=>node.type==='Class').flatMap(cls=>[cls.ctor,...(cls.methods||[])].filter(Boolean)));
    let physicalUpdateSource=null,physicalEntry=null;
    if([...affected].some(current=>sourceMethods.has(current))){
        physicalUpdateSource=preparePhysicalUpdateThrowSource(program);
        for(const message of physicalUpdateSource.unsupported)if(!unsupported.includes(message))unsupported.push(message);
        physicalEntry=physicalUpdateSourceFor(program,physicalUpdateSource);
        if(physicalEntry){graph=analyseSourceValueProducers(program,{...options,physicalUpdateSource});completion=graph.normalCompletion;}
    }
    const valueOwners=new Set(affected);let added;do{added=false;for(const call of calls)if(valueOwners.has(call.owner)&&call.target&&!valueOwners.has(call.target)){valueOwners.add(call.target);added=true;}}while(added);
    for(const fn of valueOwners)if(fn?.type==='FunctionDeclaration'&&(new Set(fn.params).size!==fn.params.length||fn.typeParameters?.length||fn.optionalParams?.length||fn.restParam||Object.keys(fn.defaultParams||{}).length||fn.parameterDefaults?.some(value=>value!=null)))fail('ordinary call flow requires unique required nongeneric parameters');
    for(const call of calls)if(valueOwners.has(call.target)&&call.node.args.length!==call.target.params.length)fail('ordinary call argument count must match actual required parameters');
    const declaredResults={number:'Number',string:'String',boolean:'Boolean',void:'Undefined'};
    for(const fn of valueOwners)if(fn?.type==='FunctionDeclaration'&&declaredResults[fn.returnType]){
        const declared=declaredResults[fn.returnType],allowed=new Set([declared,'Null','Undefined']);
        if(fn.returnType!=='void'&&completion.functionFallsThrough(fn)&&!completion.functionReturnsNormally(fn))fail('declared primitive result requires an actual normal value return');
        for(const node of all)if(node.type==='Return'&&owner.get(node)===fn){const facts=node.value?graph.constraintTypesAt(node.value):new Set(['Undefined']);if(!facts.size||[...facts].some(type=>!allowed.has(type)))fail('ordinary return contradicts its declared '+fn.returnType+' result constraint');}
    }
    for(const current of affected){
        if(current===main)continue;
        if(current?.type==='FunctionDeclaration'){
            if(graph.immutableFunctionAt(current)!==current)fail('ordinary procedure requires its unique unchanged actual declaration');
            for(const node of all)if(node.type==='Identifier'&&graph.bindingOf(node)===graph.bindingOf(current)){
                const parent=parents.get(node);if(parent?.type!=='Call'||parent.callee!==node||parent.isNew||parent.typeArguments?.length||graph.immutableFunctionAt(parent)!==current)fail('throwing procedure reference must be a direct immutable ordinary call');
            }
        }else if(physicalEntry?.hasMethod(current)){
            // Exact private source entry; globals were intersected before every
            // earliest actual allocation, not after derived construction.
        }else if(current?.type==='FunctionExpression'&&button(current)){
            // Actual static SDK registration is the only callback scope here.
        }else fail('only main, unchanged ordinary procedures and actual static controller button handlers are supported');
    }
    for(const node of throws){
        if(structured.has(node))fail('loops, Switch and Try containing Throw remain outside the bounded slice');
        const types=graph.typesAt(node.argument);
        if(!types.size||[...types].some(type=>!primitive.has(type)))fail('operand requires nonempty actual primitive producers');
    }
    for(const call of calls)if(affected.has(call.target)&&structured.has(call.node))fail('Throw through structured loop, Switch or Try call contexts remains unsupported');
    // Preserve primitive identity: an unproved initial read cannot be compiled
    // through Scratch's zero default and called the selected Undefined value.
    for(const node of all)if(valueOwners.has(owner.get(node))&&node.type==='Identifier'&&completion.isReachable(node)){
        const parent=parents.get(node),isTarget=parent?.type==='Assignment'&&parent.left===node&&parent.op==='=';
        const isCallee=parent?.type==='Call'&&parent.callee===node;
        if(!isTarget&&!isCallee&&graph.bindingKindsAt(node).has('variable')&&!graph.isInitializedAt(node))fail('value read requires its actual dominating initialization');
    }
    const result=Object.freeze({present:true,program,completion,physicalUpdateSource,unsupported:Object.freeze(unsupported)});
    if(!unsupported.length&&sourceSnapshot.current())sourceProofs.set(result,{snapshot:sourceSnapshot});
    return result;
}
