import {analyseSourceNormalCompletion,sourceNormalCompletionFor} from './source-normal-completion.js';
import {multiplayerPlayerSourceCalls} from './multiplayer-player-source.js';
import {staticSdkNamespaceReceivers} from './static-sdk-namespaces.js';
import {consoleInspectSourceCalls} from './console-inspect-source.js';
import {SDK_FONT_FIELDS} from './sdk-font-value-descriptors.js';
import {ordinaryPrimitiveSdkNumberCalls} from './ordinary-primitive-sdk-number-source.js';
import {ordinarySceneClockNumberCalls} from './ordinary-scene-clock-number-source.js';
import {controllerButtonEventNumberLeaves} from './controller-button-event-number-source.js';

export function analyseSourceValueProducers(program,options={}) {
    if(options.normalCompletion&&!sourceNormalCompletionFor(program,options.normalCompletion))throw new Error('Source completion proof must belong to the actual Program');
    const containsThrow=node=>node&&typeof node==='object'&&(node.type==='ThrowStatement'||Object.values(node).some(value=>Array.isArray(value)?value.some(containsThrow):containsThrow(value)));
    if(!containsThrow(program))return analyseGraph(program,options);
    // Bootstrap is private. No public option can bypass exceptional reachability
    // or supply a caller-made callee table after a consumer clones the AST.
    const initial=analyseGraph(program,{...options,normalCompletion:null});
    const completion=analyseSourceNormalCompletion(program,initial.immutableFunctionAt);
    return Object.freeze({...analyseGraph(program,{...options,normalCompletion:completion}),normalCompletion:completion,constraintTypesAt:node=>new Set(initial.typesAt(node))});
}

// Analyze actual lexical producers and all writers without rewriting the AST.
// Source annotations constrain consumers; they never seed producer authority.
function analyseGraph(program,{numericArrows:provedArrows=new Set(),numericHelpers:provedHelpers=new Set(),parenthesized=false,unboundIsOpaque=false,opaqueDeclarationValues=false,uninitializedLocalsAreOpaque=false,declaredLocalUndefined=false,multiplayerPlayerProperties=false,consoleInspection=false,arrayValues=false,ordinaryPrimitiveSdkNumbers=false,sceneClockNumbers=false,initializationEntries=false,normalCompletion=null}={}) {
    const completion=normalCompletion?sourceNormalCompletionFor(program,normalCompletion):null;
    if(normalCompletion&&!completion)throw new Error('Source completion proof must belong to the actual Program');
    const unreachableCells=new Set();
    const numericArrows=new Set(provedArrows),numericHelpers=new Set(provedHelpers);
    // Optional actual Array allocations retain per-allocation element cells.
    // Default consumers receive exactly their prior domain and traversal.
    const arraySites=new WeakMap(),arrayOperations=[],arrayMaps=[],arrayConstraints=[],unsafeArrayMethods=new Set();
    const arrayToken=node=>{if(!arraySites.has(node))arraySites.set(node,Object.freeze({kind:'Array',site:node,element:Symbol('array element')}));return arraySites.get(node);};

    const inspection=consoleInspection?consoleInspectSourceCalls(program):null;
    const multiplayer=multiplayerPlayerProperties?multiplayerPlayerSourceCalls(program):null,functionScopes=new WeakMap(),playerConstraints=new Set();
    let internalInspection=false,unsafePlayerWrite=false;
    // Only a consumer with an independently validated zero-argument Number body
    // may supply these actual AST allocation sites. Ordinary analysis is unchanged.
    const sdk=staticSdkNamespaceReceivers(program,{builtinIdentifiers:['screen']}),fields=new Map(SDK_FONT_FIELDS.map(field=>[field.name,field.type]));
    const ordinaryNumbers=ordinaryPrimitiveSdkNumbers?ordinaryPrimitiveSdkNumberCalls(program):null;
    const buttonEventNumbers=ordinaryPrimitiveSdkNumbers?controllerButtonEventNumberLeaves(program):null;
    let clockIndexFacts;
    const safeClockIndex=node=>{
        const graph=clockIndexFacts ||= analyseGraph(program,{arrayValues:true,parenthesized:true,unboundIsOpaque:true,
            opaqueDeclarationValues:true,uninitializedLocalsAreOpaque:true,declaredLocalUndefined:true,initializationEntries:true});
        if(!graph.arrayAllocationsAt(node.object).length||!graph.arrayMapReceiverSafeAt(node.object)||
            graph.arrayConstraintErrorsAt(node.object).length||node.object?.type==='Identifier'&&!graph.isInitializedAt(node.object))return false;
        const types=graph.typesAt(node.index);if(types.size!==1||!types.has('Number'))return false;
        const initialized=value=>!value||typeof value!=='object'||(Array.isArray(value)?value.every(initialized):
            !(value.type==='Identifier'&&!graph.isInitializedAt(value))&&Object.values(value).every(initialized));
        return initialized(node.index);
    };
    const sceneNumbers=sceneClockNumbers?ordinarySceneClockNumberCalls(program,safeClockIndex):null;
    let screenWritten=false;
    const scanScreenWrites=node=>{if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(scanScreenWrites);return;}const target=node.type==='Assignment'?node.left:node.type==='Update'?node.argument:null;if(target?.type==='Identifier'&&target.name==='screen'&&sdk.has(target))screenWritten=true;Object.values(node).forEach(scanScreenWrites);};scanScreenWrites(program);
    const initializedReads=new WeakSet(),initializationAt=new WeakMap(),localUndefinedDeclarations=new Set();
    const writing=new WeakSet(),owners=new WeakMap(),cells=new WeakMap(),types=new Map(),edges=[],scales=[],texts=[],derived=[],prints=[],classes=new Map(),classCalls=[],classWrites=new Set(),declarations=new Map(),functions=new Map(),calls=[],numericCalls=[],unsupported=[];
    const fail=message=>{if(!unsupported.includes(message))unsupported.push(message);};
    const scope=parent=>({parent,bindings:new Map()});
    const global=scope(null),key=()=>Symbol(),add=(cell,type)=>{if(!types.has(cell))types.set(cell,new Set());const set=types.get(cell),before=set.size;set.add(unreachableCells.has(cell)?'Opaque':type);return before!==set.size;};
    const binding=(owner,name)=>{for(let current=owner;current;current=current.parent)if(current.bindings.has(name))return current.bindings.get(name);if(!global.bindings.has(name))global.bindings.set(name,key());return global.bindings.get(name);};
    const declare=(owner,name)=>{if(!owner.bindings.has(name))owner.bindings.set(name,key());return owner.bindings.get(name);};
    const declaration=(owner,name,node)=>{const id=declare(owner,name);if(!declarations.has(id))declarations.set(id,new Set());declarations.get(id).add(node);};
    const path=node=>node?.type==='Identifier'?node.name:node?.type==='Member'?path(node.object)+'.'+node.name:null;
    const returns=node=>node?.type==='Return'||node?.type==='Block'&&complete(node.body)||node?.type==='If'&&complete(node.consequent)&&complete(node.alternate);
    const complete=body=>(body||[]).some(returns);
    const predeclare=(body,owner)=>{for(const node of body||[]){if(node.type==='Declaration')for(const decl of node.decls)declaration(owner,decl.name,decl);if(['FunctionDeclaration','Class','Enum'].includes(node.type))declaration(owner,node.name,node);}};
    const vars=(node,owner)=>{if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(value=>vars(value,owner));return;}if(['FunctionDeclaration','FunctionExpression','Class'].includes(node.type))return;if(node.type==='Declaration'&&node.kind==='var')node.decls.forEach(decl=>declare(owner,decl.name));Object.values(node).forEach(value=>{if(value&&typeof value==='object')vars(value,owner);});};
    const cell=node=>node?.type==='Identifier'&&writing.has(node)?binding(owners.get(node)||global,node.name):cells.get(node);
    const edge=(from,to)=>{if(from&&to)edges.push([from,to]);};
    const body=(nodes,outer,fn=null)=>{const owner=scope(outer);predeclare(nodes,owner);if(fn){for(const param of fn.params||[]){declaration(owner,param,Symbol(param));const annotation=fn.paramTypes?.[param];if(arrayValues&&annotation?.isArray)arrayConstraints.push({cell:binding(owner,param),type:(annotation.text||'any[]').replace(/\[\]$/,'')});if(multiplayer&&annotation&&(annotation.isArray||annotation.text&&!['any','mp.Player'].includes(annotation.text)))playerConstraints.add(binding(owner,param));}vars(nodes,owner);owner.result=fn.result;}for(const node of nodes||[])visit(node,owner);return owner;};
    const visit=(node,owner)=>{
        if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(value=>visit(value,owner));return;}
        owners.set(node,owner);if(['FunctionDeclaration','Class'].includes(node.type) && (node.name?.startsWith('__bwSdkFont_') || node.name==='__bwSDK_Font'))fail('Internal Font descriptor and intrinsic names are not source bindings');
        if(node.type==='Declaration' && node.decls.some(decl=>decl.name.startsWith('__bwSdkFont_') || decl.name==='__bwSDK_Font'))fail('Internal Font descriptor and intrinsic names are not source bindings');
        if(node.type==='Identifier'){if(node.name.startsWith('__bwSdkFont_'))fail('Internal Font intrinsic names are not source bindings');if(!writing.has(node)){cells.set(node,key());if(node.name==='screen'&&sdk.has(node))add(cell(node),screenWritten?'Opaque':'Image');else {const id=binding(owner,node.name);edge(id,cell(node));if(unboundIsOpaque&&!declarations.has(id)||opaqueDeclarationValues&&[...(declarations.get(id)||[])].some(value=>(['FunctionDeclaration','Class','Enum'].includes(value?.type)||value?.isArray||value?.typeName&&!['number','boolean','string','any'].includes(value.typeName)&&!(multiplayer&&value.typeName==='mp.Player'))))add(cell(node),'Opaque');else if(opaqueDeclarationValues&&multiplayer&&[...(declarations.get(id)||[])].some(value=>value?.typeName==='mp.Player'))add(cell(node),'OpaquePlayerConstraint');}}return;}
        cells.set(node,key());const current=cell(node);if(completion&&!completion.isReachable(node))unreachableCells.add(current);
        if(node.bwConsoleInspectIntrinsic===true&&node.callee?.name==='__bwConsoleInspectValue')internalInspection=true;
        if(node.type==='Program'){predeclare(node.body,owner);vars(node.body,owner);node.body.forEach(value=>visit(value,owner));return;}
        if(node.type==='Block'){body(node.body,owner);return;}
        if(node.type==='FunctionDeclaration'){
            const result=key(),entry={node,result,owner:null},functionBinding=binding(owner,node.name);
            if(functions.has(functionBinding)){functions.set(functionBinding,null);fail('SDK Font procedure flow requires a unique lexical declaration');}else functions.set(functionBinding,entry);
            entry.owner=body(node.body,owner,{params:node.params,paramTypes:node.paramTypes,result});if(arrayValues&&new Set(node.params).size!==node.params.length)for(const param of node.params)add(entry.owner.bindings.get(param),'Opaque');if(completion?completion.functionFallsThrough(node):!complete(node.body))add(result,'Undefined');return;
        }
        if(node.type==='FunctionExpression'){add(current,numericArrows.has(node)&&node.functionKind==='arrow'&&!node.params.length?'NumericCallable':'Opaque');functionScopes.set(node,body(node.body,owner,{params:node.params,paramTypes:node.paramTypes,result:key()}));if((arrayValues||completion)&&(completion?completion.functionFallsThrough(node):!complete(node.body)))add(functionScopes.get(node).result,'Undefined');return;}
        if(node.type==='Class'){
            const name=binding(owner,node.name);classes.set(name,(classes.get(name)||0)+1);add(current,'Opaque');for(const field of node.fields||[])visit(field.init,owner);
            for(const method of [node.ctor,...(node.methods||[])].filter(Boolean))body(method.body,owner,{params:method.params,paramTypes:method.paramTypes,result:key()});return;
        }
        if(node.type==='If'){visit(node.test,owner);body(node.consequent,owner);body(node.alternate,owner);return;}
        if(['For','ForOf','While'].includes(node.type)){
            const loop=scope(owner);if(node.init?.type==='Declaration')predeclare([node.init],loop);if(node.type==='ForOf')declare(loop,node.name);
            for(const value of [node.init,node.test,node.update,node.iterable])visit(value,loop);body(node.body,loop);return;
        }
        if(node.type==='Declaration'){
            let functionOwner=owner;while(functionOwner&&!functionOwner.result)functionOwner=functionOwner.parent;
            for(const decl of node.decls){const target=binding(owner,decl.name);if(arrayValues&&decl.isArray&&decl.typeName)arrayConstraints.push({cell:target,type:decl.typeName.replace(/\[\]$/,'')});if(multiplayer&&(decl.isArray||decl.typeName&&!['any','mp.Player'].includes(decl.typeName)))playerConstraints.add(target);if(decl.init){visit(decl.init,owner);edge(cell(decl.init),target);}
                else if(declaredLocalUndefined&&functionOwner&&node.kind==='let'&&declarations.get(target)?.size===1&&!decl.isArray&&(!decl.typeName||['number','string','boolean','any'].includes(decl.typeName))){add(target,'Undefined');localUndefinedDeclarations.add(decl);}
                if(decl.typeName==='image.Font')owner.fontAnnotations=(owner.fontAnnotations||new Set()).add(target);}return;
        }
        if(node.type==='Return'){visit(node.value,owner);if(completion&&!completion.isReachable(node))return;let fn=owner;while(fn&&!fn.result)fn=fn.parent;if(fn){if(node.value)edge(cell(node.value),fn.result);else add(fn.result,'Undefined');}return;}
        if(node.type==='ThrowStatement'){visit(node.argument,owner);return;}
        if(node.type==='Assignment'&&node.op==='='&&node.left?.type==='Identifier')writing.add(node.left);
        for(const value of Object.values(node))if(value&&typeof value==='object')visit(value,owner);
        if(node.type==='Assignment'){if(arrayValues&&node.left?.type==='Member'&&node.left.name!=='length')arrayOperations.push({kind:'methodWrite',receiver:cell(node.left.object)});if(arrayValues&&node.left?.type==='Index')arrayOperations.push({kind:'write',receiver:cell(node.left.object),index:cell(node.left.index),value:cell(node.right)});if(node.left?.type==='Identifier')classWrites.add(binding(owners.get(node.left),node.left.name));if(node.op==='=')edge(cell(node.right),cell(node.left));else if(node.left?.type==='Identifier')derived.push({result:binding(owners.get(node.left),node.left.name),type:'Number',operands:[cell(node.left),cell(node.right)],signature:['+=','-=','*=','/=','%=','&=','|=','^=','<<=','>>=','>>>='].includes(node.op),domain:'Number'});else add(cell(node.left),'Opaque');edge(cell(node.right),current);return;}
        if(arrayValues&&node.type==='Update'&&node.argument?.type==='Member'&&node.argument.name!=='length')arrayOperations.push({kind:'methodWrite',receiver:cell(node.argument.object)});
        if(arrayValues&&node.type==='Update'&&node.argument?.type==='Index')arrayOperations.push({kind:'update',receiver:cell(node.argument.object),index:cell(node.argument.index)});
        if(node.type==='Update'&&node.argument?.type==='Identifier'){classWrites.add(binding(owners.get(node.argument),node.argument.name));derived.push({result:binding(owners.get(node.argument),node.argument.name),type:'Number',operands:[cell(node.argument)],signature:['++','--'].includes(node.op),domain:'Number'});edge(cell(node.argument),current);return;}
        if(node.type==='Call'&&node.isNew&&node.callee?.type==='Identifier'){classCalls.push({value:current,name:binding(owner,node.callee.name)});return;}
        if(arrayValues&&node.type==='Array'){const token=arrayToken(node);add(current,token);for(const item of node.items)edge(cell(item),token.element);return;}
        if(arrayValues&&node.type==='Index'){arrayOperations.push({kind:'read',receiver:cell(node.object),result:current});return;}
        if(arrayValues&&node.type==='Member'&&node.name==='length'){arrayOperations.push({kind:'length',receiver:cell(node.object),result:current});return;}
        if(arrayValues&&node.type==='Call'&&!node.isNew&&node.callee?.type==='Member'&&['map','push','pop','shift','unshift'].includes(node.callee.name)){
            const operation={kind:node.callee.name,node,receiver:cell(node.callee.object),result:current};arrayOperations.push(operation);
            if(operation.kind==='map'){operation.token=arrayToken(node);add(current,operation.token);arrayMaps.push(operation);}return;
        }

        if(multiplayer?.isRegistration(node)){const handler=node.args[1],scope=functionScopes.get(handler);if(scope)add(binding(scope,handler.params[0]),'Player');}
        if(multiplayer?.isProperty(node))derived.push({result:current,type:'Number',operands:[cell(node.args[0])],signature:true,domain:'Player'});
        else if(node.type==='Call'&&(inspection?.isIntrinsicCall(node)||node.bwConsoleInspectIntrinsic===true&&node.callee?.type==='Identifier'&&node.callee.name==='__bwConsoleInspectValue'&&!node.isNew&&node.args.length===2))derived.push({result:current,type:'String',operands:node.args.map(cell),signature:[1,2].includes(node.args.length),inspection:true});
        else if(node.type==='Member'&&sdk.has(node)&&['image.font5','image.font8','image.font12'].includes(path(node)))add(current,'Font');
        else if(node.type==='Call'&&!node.isNew&&sdk.has(node.callee)&&path(node.callee)==='image.getFontForText'&&node.args.length===1)texts.push({node,argument:cell(node.args[0]),result:current});
        else if(node.type==='Call'&&!node.isNew&&sdk.has(node.callee)&&path(node.callee)==='image.scaledFont'&&node.args.length===2)scales.push({node,receiver:cell(node.args[0]),result:current});
        else if(node.type==='Call'&&!node.isNew&&sdk.has(node.callee)&&path(node.callee)==='image.create')derived.push({result:current,type:'Image',operands:node.args.map(cell),signature:node.args.length===2,domain:'Number'});
        else if(node.type==='Template'&&node.tag==='img')add(current,'Image');
        else if(node.type==='Call'&&!node.isNew&&node.callee?.type==='Member'&&node.callee.name==='clone')derived.push({result:current,type:'Image',operands:[cell(node.callee.object)],signature:node.args.length===0,domain:'Image'});
        else if(node.type==='Call'&&!node.isNew&&node.callee?.type==='Member'&&node.callee.name==='toString')derived.push({result:current,type:'String',operands:[cell(node.callee.object)],signature:node.args.length===0,domain:'Number'});
        else if(node.type==='Binary'&&['===','!==','==','!=','<','>','<=','>='].includes(node.op)||node.type==='Unary'&&node.op==='!')derived.push({result:current,type:'Boolean',operands:(node.type==='Unary'?[node.argument]:[node.left,node.right]).map(cell),signature:true,inspectionPrimitive:true});
        else if(arrayValues&&node.type==='Unary'&&node.op==='typeof')derived.push({result:current,type:'String',operands:[cell(node.argument)],signature:true,inspectionPrimitive:true});
        else if(node.type==='Unary'&&['+','-','~'].includes(node.op))derived.push({result:current,type:'Number',operands:[cell(node.argument)],signature:true,domain:'Number'});
        else if(node.type==='Binary'&&['+','-','*','/','%','&','|','^','<<','>>','>>>'].includes(node.op))derived.push({result:current,type:'Number',operands:[cell(node.left),cell(node.right)],signature:true,domain:'Number',stringConcat:node.op==='+'});
        else if(node.type==='Call'&&!node.isNew&&(node.callee?.type==='Identifier'||numericArrows.size&&node.callee?.type==='Parenthesized'))calls.push({node,callee:node.callee.type==='Identifier'?binding(owner,node.callee.name):null,result:current});
        else if(node.type==='Parenthesized'&&parenthesized)edge(cell(node.expression),current);
        else if(['Conditional','Logical'].includes(node.type)){edge(cell(node.consequent||node.left),current);edge(cell(node.alternate||node.right),current);}
        else if(node.type==='Member'&&['width','height'].includes(node.name))edges.push([cell(node.object),current,'imageDimension',node.name]);
        else if(node.type==='Member'&&fields.has(node.name))edges.push([cell(node.object),current,'field',node.name]);
        else if(['Undefined','Null','String','Number','Boolean'].includes(node.type))add(current,node.type);
        else if(ordinaryNumbers?.has(node)||sceneNumbers?.has(node)||buttonEventNumbers?.has(node))add(current,'Number');
        else if(node.type==='Call'&&sdk.has(node.callee)&&path(node.callee)==='game.askForString')add(current,'String');
        else {add(current,'Opaque');if(arrayValues&&node.type==='Call'&&node.callee?.type==='Member')for(const value of [node.callee.object,...node.args])arrayOperations.push({kind:'escape',receiver:cell(value)});}
    };
    const collectPrints=node=>{if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(collectPrints);return;}if(node.type==='Call'&&node.callee?.type==='Member'&&['print','printCenter'].includes(node.callee.name)){const center=node.callee.name==='printCenter',fontIndex=center?3:4;if(node.args.length>fontIndex)prints.push({node,center,fontIndex});}Object.values(node).forEach(value=>{if(value&&typeof value==='object')collectPrints(value);});};
    visit(program,global);collectPrints(program);
    if(arrayValues)for(const [binding,nodes]of declarations)if(nodes.size!==1)add(binding,'Opaque');
    function entry(node,known=new Set()){
        if(!node||typeof node!=='object')return known;
        if(Array.isArray(node)){for(const value of node)known=entry(value,known);return known;}
        const owner=owners.get(node)||global;if(initializationEntries)initializationAt.set(node,new Set(known));
        if(node.type==='Identifier'){
            if(known.has(binding(owner,node.name)))initializedReads.add(node);
            if(!writing.has(node)&&!(node.name==='screen'&&sdk.has(node))&&!known.has(binding(owner,node.name))){
                const id=binding(owner,node.name);
                if(uninitializedLocalsAreOpaque&&global.bindings.get(node.name)!==id&&[...(declarations.get(id)||[])].some(declaration=>typeof declaration==='object'&&!['FunctionDeclaration','Class','Enum'].includes(declaration.type)))add(cell(node),'Opaque');
                add(cell(node),'Undefined');
            }return known;
        }
        // A closure expression is allocated here, after the currently proved
        // initializations. Hoisted declarations retain their entry boundary.
        if(node.type==='FunctionDeclaration'||node.type==='FunctionExpression'){const entryOwner=node.type==='FunctionDeclaration'?functions.get(binding(owner,node.name))?.owner:null;const first=node.body?.[0],methodOwner=entryOwner||owners.get(first);entry(node.body,new Set([...((consoleInspection||arrayValues)&&node.type==='FunctionExpression'?known:[]),...(node.params||[]).map(name=>binding(methodOwner||owner,name))]));return known;}
        if(node.type==='Class'){for(const field of node.fields||[])entry(field.init,new Set());for(const method of [node.ctor,...(node.methods||[])].filter(Boolean)){const methodOwner=owners.get(method.body?.[0])||owner;entry(method.body,new Set((method.params||[]).map(name=>binding(methodOwner,name))));}return known;}
        if(node.type==='Declaration'){for(const decl of node.decls){known=entry(decl.init,known);if(decl.init||localUndefinedDeclarations.has(decl))known=new Set([...known,binding(owner,decl.name)]);}return known;}
        if(node.type==='Assignment'){known=entry(node.right,known);if(node.left?.type==='Identifier'&&node.op==='=')known=new Set([...known,binding(owners.get(node.left),node.left.name)]);else known=entry(node.left,known);return known;}
        if(node.type==='Conditional'){known=entry(node.test,known);const left=entry(node.consequent,new Set(known)),right=entry(node.alternate,new Set(known));return new Set([...left].filter(value=>right.has(value)));}
        if(node.type==='Logical'||node.type==='Binary'&&['&&','||','??'].includes(node.op)){known=entry(node.left,known);entry(node.right,new Set(known));return known;}
        if(node.type==='If'){known=entry(node.test,known);const left=entry(node.consequent,new Set(known)),right=entry(node.alternate,new Set(known));return new Set([...left].filter(value=>right.has(value)));}
        if(['For','ForOf','While'].includes(node.type)){known=entry(node.init,known);entry(node.test,known);entry(node.iterable,known);const inside=entry(node.body,new Set(known));entry(node.update,inside);return known;}
        for(const value of Object.values(node))if(value&&typeof value==='object')known=entry(value,known);return known;
    }
    entry(program);
    for(const call of classCalls)add(call.value,classes.get(call.name)===1&&declarations.get(call.name)?.size===1&&!classWrites.has(call.name)?'ClassInstance':'Opaque');
    const resultFunctions=new Map([...functions].filter(([,fn])=>fn).map(([name,fn])=>[fn.result,name])),callGraph=new Map();
    for(const call of calls){let owner=owners.get(call.node);while(owner&&!owner.result)owner=owner.parent;const origin=resultFunctions.get(owner?.result);if(origin){if(!callGraph.has(origin))callGraph.set(origin,new Set());callGraph.get(origin).add(call.callee);}}
    const cyclic=(origin,current=origin,seen=new Set())=>{if(seen.has(current))return false;seen.add(current);for(const next of callGraph.get(current)||[])if(next===origin||cyclic(origin,next,seen))return true;return false;};
    for(const call of calls){if(completion&&!completion.isReachable(call.node)){add(call.result,'Opaque');continue;}const fn=functions.get(call.callee);if(!fn||declarations.get(call.callee)?.size!==1||classWrites.has(call.callee)){
            if(numericArrows.size)numericCalls.push({node:call.node,result:call.result,receiver:cell(call.node.callee)});
            else add(call.result,'Opaque');if(arrayValues)for(const argument of call.node.args)arrayOperations.push({kind:'escape',receiver:cell(argument)});continue;
        }if(numericHelpers.has(fn.node)) {
            // Structural numeric helpers are proved by the caller using actual
            // declaration/parameter identities; specialize each call's operands.
            derived.push({result:call.result,type:'Number',operands:call.node.args.map(cell),signature:call.node.args.length===2,domain:'Number'});
            continue;
        }
        if(cyclic(call.callee))add(call.result,'Opaque');
        fn.node.params.forEach((name,index)=>{const arg=call.node.args[index],param=fn.owner.bindings.get(name);if(arg)edge(cell(arg),param);else add(param,'Undefined');});edge(fn.result,call.result);
    }
    const isFont=current=>{const set=types.get(current);return !!set?.has('Font')&&set.size===1;};
    const exactType=(value,type)=>types.get(value)?.size===1&&types.get(value).has(type);
    const primitiveTypes=new Set(['String','Number','Boolean','Null','Undefined']);
    const stringConcat=item=>item.stringConcat&&item.operands.some(value=>exactType(value,'String'))&&item.operands.every(value=>types.get(value)?.size&&[...types.get(value)].every(type=>primitiveTypes.has(type)));
    const playerOperand=value=>!unsafePlayerWrite&&types.get(value)?.has('Player')&&[...types.get(value)].every(type=>['Player','Null','Undefined','OpaquePlayerConstraint'].includes(type));
    const numericOperand=value=>types.get(value)?.size&&[...types.get(value)].every(type=>type==='Number'||type==='Undefined');
    const inspectionDomain=(operand,allowed)=>types.get(operand)?.size&&[...types.get(operand)].every(type=>allowed.has(type));
    const derivedValid=item=>item.inspectionPrimitive?(consoleInspection||internalInspection||arrayValues)&&item.operands.every(operand=>inspectionDomain(operand,primitiveTypes)):item.inspection?item.signature&&inspectionDomain(item.operands[0],primitiveTypes)&&(item.operands.length===1||inspectionDomain(item.operands[1],new Set(['Number','Undefined']))):item.signature&&(stringConcat(item)||item.operands.every(operand=>item.domain==='Player'?playerOperand(operand):item.domain==='Number'&&item.type==='Number'?numericOperand(operand):exactType(operand,item.domain)));
    const arrayTypes=value=>{const set=types.get(value);return set?.size&&[...set].every(type=>type?.kind==='Array')?[...set]:null;};
    const propagateArrays=()=>{let changed=false;
        for(const op of arrayOperations){const tokens=arrayTypes(op.receiver);if(!tokens)continue;
            if(['escape','methodWrite'].includes(op.kind)||['write','update'].includes(op.kind)&&types.get(op.index)?.size&&!exactType(op.index,'Number'))for(const token of tokens){if(!unsafeArrayMethods.has(token)){unsafeArrayMethods.add(token);changed=true;}if(op.kind==='escape')changed=add(token.element,'Opaque')||changed;}
            if(op.kind==='update')for(const token of tokens){const prior=types.get(token.element);if(prior&&[...prior].some(type=>!primitiveTypes.has(type))){if(!unsafeArrayMethods.has(token)){unsafeArrayMethods.add(token);changed=true;}}else changed=add(token.element,'Number')||changed;}
            if(op.kind==='length'||['push','unshift'].includes(op.kind))changed=add(op.result,'Number')||changed;
            if(['read','pop','shift'].includes(op.kind)){changed=add(op.result,'Undefined')||changed;for(const token of tokens)for(const type of types.get(token.element)||[])changed=add(op.result,type)||changed;}
            if(op.kind==='write'||['push','unshift'].includes(op.kind))for(const token of tokens)for(const value of op.kind==='write'?[op.value]:op.node.args.map(cell))for(const type of types.get(value)||[])changed=add(token.element,type)||changed;
            if(op.kind==='map'){const fn=op.node.args[0],owner=functionScopes.get(fn);if(!owner)continue;
                if(fn.params[0]){const target=owner.bindings.get(fn.params[0]);changed=add(target,'Undefined')||changed;for(const token of tokens)for(const type of types.get(token.element)||[])changed=add(target,type)||changed;}
                if(fn.params[1])changed=add(owner.bindings.get(fn.params[1]),'Number')||changed;
                for(const type of types.get(owner.result)||[])changed=add(op.token.element,type)||changed;
            }
        }return changed;
    };
    const propagate=()=>{let changed;do{changed=propagateArrays();
        for(const[from,to,mode,name]of edges){if(mode==='imageDimension'){if(exactType(from,'Image'))changed=add(to,'Number')||changed;else if(types.get(from)?.size)changed=add(to,'Opaque')||changed;}else if(mode==='field'){if(isFont(from)){changed=add(to,name==='data'?'GlyphBuffer':'Number')||changed;if(name==='multiplier')changed=add(to,'Undefined')||changed;}else if(types.get(from)?.size)changed=add(to,'Opaque')||changed;}else for(const type of types.get(from)||[])changed=add(to,type)||changed;}
        for(const cell of playerConstraints)if(types.get(cell)?.has('Player'))changed=add(cell,'Opaque')||changed;
        for(const item of derived)if(derivedValid(item))changed=add(item.result,stringConcat(item)?'String':item.type)||changed;
        for(const item of numericCalls)if(!item.node.args.length&&exactType(item.receiver,'NumericCallable'))changed=add(item.result,'Number')||changed;
        for(const item of scales)if(isFont(item.receiver))changed=add(item.result,'Font')||changed;
        for(const item of texts)if(types.get(item.argument)?.size===1 && types.get(item.argument).has('String'))changed=add(item.result,'Font')||changed;
    }while(changed);};propagate();
    if(arrayValues)for(const operation of arrayOperations)if(['write','update'].includes(operation.kind)&&!types.get(operation.index)?.size)for(const token of arrayTypes(operation.receiver)||[])unsafeArrayMethods.add(token);
    const playerWriteUnsafe=()=>!!multiplayer?.computedWrites.some(node=>{const keys=types.get(cell(node));return !keys?.size||[...keys].some(type=>!['Number','Boolean','Null','Undefined'].includes(type));});
    let invalidated;do{invalidated=false;if(!unsafePlayerWrite&&playerWriteUnsafe()){unsafePlayerWrite=true;invalidated=true;}for(const item of derived)if(!derivedValid(item))invalidated=add(item.result,'Opaque')||invalidated;for(const item of numericCalls)if(item.node.args.length||!exactType(item.receiver,'NumericCallable'))invalidated=add(item.result,'Opaque')||invalidated;propagate();}while(invalidated);
    const fontAnnotations=new Set();const collectScope=node=>{if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(collectScope);return;}const owner=owners.get(node);for(let s=owner;s;s=s.parent)for(const value of s.fontAnnotations||[])fontAnnotations.add(value);Object.values(node).forEach(value=>{if(value&&typeof value==='object')collectScope(value);});};collectScope(program);
    const knownBinding=(node,name=node?.name)=>{
        if(typeof name!=='string')return null;
        for(let owner=owners.get(node);owner;owner=owner.parent)if(owner.bindings.has(name))return owner.bindings.get(name);
        return null;
    };
    // Declaration identity is separate from result production. Recursive calls
    // may keep a unique unchanged declaration without acquiring a result fact.
    const unchangedFunction=node=>{
        const identifier=node?.type==='Call'?node.callee:node;
        if(node?.type==='Call'&&node.isNew)return null;
        if(!['Identifier','FunctionDeclaration'].includes(identifier?.type))return null;
        const id=knownBinding(identifier),fn=functions.get(id);
        return fn&&declarations.get(id)?.size===1&&!classWrites.has(id)?fn.node:null;
    };
    const immutableFunction=node=>{const fn=unchangedFunction(node);return fn&&!cyclic(knownBinding(fn))?fn:null;};
    // Copies prevent a consumer from changing another consumer's proof facts.
    // Binding facts do not discharge initialization at an expression occurrence.
    return Object.freeze({
        typesAt:node=>new Set(owners.has(node)?types.get(cell(node))||[]:[]),
        bindingTypesAt:(node,name=node?.name)=>new Set(types.get(knownBinding(node,name))||[]),
        bindingOf:knownBinding,
        bindingKindsAt:(node,name=node?.name)=>new Set([...(declarations.get(knownBinding(node,name))||[])].map(declaration=>
            typeof declaration==='symbol'?'parameter':({FunctionDeclaration:'function',Class:'class',Enum:'enum'}[declaration.type]||'variable'))),
        isInitializedAt:node=>initializedReads.has(node),
        isBindingInitializedAt:(node,binding)=>initializationAt.get(node)?.has(binding)===true,
        localUndefinedDeclarations:Object.freeze([...localUndefinedDeclarations]),
        declarationCountAt:(node,name=node?.name)=>declarations.get(knownBinding(node,name))?.size||0,
        immutableFunctionAt:immutableFunction,
        unchangedFunctionAt:unchangedFunction,
        isSdkNamespace:node=>sdk.has(node),
        fontAnnotatedAt:node=>fontAnnotations.has(cell(node)),
        fontScales:Object.freeze(scales.map(item=>item.node)),
        fontSelections:Object.freeze(texts.map(item=>item.node)),
        fontPrints:Object.freeze(prints.map(item=>Object.freeze({...item}))),
        arrayConstraintErrorsAt:node=>{const tokens=new Set(arrayTypes(cell(node))||[]),domains={number:'Number',string:'String',boolean:'Boolean'};return arrayConstraints.filter(record=>record.type!=='any'&&(arrayTypes(record.cell)||[]).some(token=>tokens.has(token)&&(!domains[record.type]||[...(types.get(token.element)||[])].some(type=>type!==domains[record.type]&&!['Null','Undefined'].includes(type))))).map(record=>`actual Array elements contradict declared ${record.type}[] constraint`);},
        arrayMapReceiverSafeAt:node=>!!arrayTypes(cell(node))&&arrayTypes(cell(node)).every(token=>!unsafeArrayMethods.has(token)),
        arrayAllocationsAt:node=>Object.freeze([...(arrayTypes(cell(node))||[])].map(token=>token.site)),
        arrayElementTypesAt:node=>new Set((arrayTypes(cell(node))||[]).flatMap(token=>[...(types.get(token.element)||[])])),
        arrayMapCalls:Object.freeze(arrayMaps.map(operation=>operation.node)),
        functionParameterBinding:(node,index)=>functionScopes.get(node)?.bindings.get(node.params[index])||null,
        functionParameterTypes:(node,index)=>new Set(types.get(functionScopes.get(node)?.bindings.get(node.params[index]))||[]),
        functionResultTypes:node=>new Set(types.get(functionScopes.get(node)?.result)||[]),
        diagnostics:Object.freeze([...unsupported])
    });
}
