import {analyseCallableFlow} from './callable-flow.js';
import {callableDefaultBody} from './callable-defaults.js';
import {renderCallableType} from './callable-type-syntax.js';
import {createCallableLexicalPlan} from './callable-lexical-plan.js';
import {createClassCallableDescriptors} from './callable-class-descriptors.js';
import {createClassCallablePlan} from './class-callable-plan.js';

// An unadmitted source lowering prototype. The caller must qualify the complete
// descriptor, declaration-prefix and authoring bridge before connecting it.
export function lowerCallableValues(program,{legacyCallbacks=new WeakSet(),classPrototype=false}={}) {
    const flow=analyseCallableFlow(program),unsupported=[...flow.unsupported],definitions=[];
    const sites=new WeakMap(),siteInfos=[],taken=new Set(flow.lexical.bindings.map(binding=>binding.name));
    const fail=message=>{if(!unsupported.includes(message))unsupported.push(message);};
    if(classPrototype!==true&&classPrototype!==false)fail('Class callable prototype requires its explicit Boolean option');
    if(flow.lexical.bindings.some(binding=>binding.name==='__bwCallables'))fail('Authored __bwCallables binding conflicts with the unadmitted callable intrinsic namespace');
    const classModel=classPrototype?createClassCallableDescriptors(program):null;
    if(classModel)unsupported.push(...classModel.unsupported);
    for(const cls of program.body.filter(node=>node.type==='Class'))
        if(cls.methods.some(method=>method.typeParameters?.length) || cls.fields.some(field=>/=>/.test(field.typeName || '')))
            if(!classPrototype)fail('Class callable signatures require the qualified class descriptor bridge');
    const inspectHostArguments=node=>{
        if(!node || typeof node!=='object')return;
        if(Array.isArray(node)){node.forEach(inspectHostArguments);return;}
        if(node.type==='Call' && !node.isNew && flow.expressionTypes.get(node.callee)?.kind!=='callable')
            for(const argument of node.args || [])if(argument?.type==='FunctionExpression' && !legacyCallbacks.has(argument))
                fail('Host callback arguments require their qualified registration bridge');
        for(const [key,value]of Object.entries(node))if(!['originalBody','parameterDefaults','paramTypes','typeParameters'].includes(key) && value && typeof value==='object')inspectHostArguments(value);
    };
    inspectHostArguments(program.body);
    let next=0;
    const cellName=binding=>binding?.kind==='parameter'?binding.name:binding?.cellName;
    const site=scope=>{
        if(sites.has(scope.node))return sites.get(scope.node);
        const profile=flow.profiles.get(scope.node),signature=flow.signature(profile);
        if(!signature){fail('Source callable requires a resolved parameter and result signature');return null;}
        if(!['arrow','function'].includes(scope.node.functionKind)) {
            fail('Source callable requires retained actual arrow or function syntax metadata');return null;
        }
        let name;do{name='__bwCallable_'+(++next);}while(taken.has(name));taken.add(name);
        const info={name,site:'site_'+scope.id,scope,signature,parameters:scope.node.params.slice(),
            captures:scope.captureSpecifications.map(capture=>({name:cellName(capture.binding),
                sourceName:capture.sourceName,mode:capture.mode,
                ...(capture.binding.kind==='receiver'?{receiverClass:capture.binding.scope.className}:{})})),
            defaults:callableDefaultBody(scope.node).defaults};
        if(!classPrototype&&info.captures.some(capture=>capture.receiverClass))
            fail('Captured class receivers require the qualified class descriptor bridge');
        sites.set(scope.node,info);siteInfos.push(info);return info;
    };
    for(const scope of flow.lexical.functions) {
        if(scope.node.type==='FunctionExpression' && !legacyCallbacks.has(scope.node))site(scope);
        if(scope.node.type==='FunctionDeclaration' && scope.parent!==flow.lexical.global)
            fail('Nested callable declarations require their selected SDK initialization boundary');
    }
    const id=name=>({type:'Identifier',name}),str=value=>({type:'String',value});
    const call=(name,args)=>({type:'Call',callee:{type:'Member',object:id('__bwCallables'),name},args,bwCallableIntrinsic:name});
    const cloneMetadata=node=>{
        const out={...node};
        if(node.params)out.params=node.params.slice();
        if(node.paramTypes)out.paramTypes={...node.paramTypes};
        return out;
    };
    const reflectionWriters=new Map();
    const writer=(binding,value,op='=',source=null)=>{if(!binding)return;if(!reflectionWriters.has(binding))reflectionWriters.set(binding,[]);reflectionWriters.get(binding).push({value,op,source});};
    const collectWriters=node=>{
        if(!node||typeof node!=='object')return;
        if(Array.isArray(node)){node.forEach(collectWriters);return;}
        if(node.type==='Declaration')for(const row of node.decls)writer(flow.lexical.scopes.get(node)?.names.get(row.name),row.init,'=',row);
        if(node.type==='Assignment'&&node.left?.type==='Identifier')writer(flow.lexical.references.get(node.left),node.right,node.op,node);
        if(node.type==='Update'&&node.argument?.type==='Identifier')writer(flow.lexical.references.get(node.argument),null,node.op);
        for(const[key,value]of Object.entries(node))if(!['originalBody','parameterDefaults','paramTypes','typeParameters'].includes(key)&&value&&typeof value==='object')collectWriters(value);
    };
    collectWriters(program.body);
    const moduleOrder=new WeakMap();let ordinal=0;
    const orderedExpression=node=>{
        if(!node||typeof node!=='object'||['FunctionExpression','Conditional'].includes(node.type)||node.type==='Binary'&&['&&','||','??'].includes(node.op))return;
        if(Array.isArray(node)){node.forEach(orderedExpression);return;}
        for(const[key,value]of Object.entries(node))if(!['originalBody','parameterDefaults'].includes(key)&&value&&typeof value==='object')orderedExpression(value);
        moduleOrder.set(node,++ordinal);
    };
    for(const statement of program.body){
        if(statement.type==='Declaration')for(const row of statement.decls){orderedExpression(row.init);moduleOrder.set(row,++ordinal);}
        else if(statement.type==='ExpressionStatement')orderedExpression(statement.expr);
    }
    const numericReflectionArgument=(node,seen=new Set())=>{
        if(node?.type==='Parenthesized')return numericReflectionArgument(node.expression,seen);
        if(node?.type==='Number')return Number.isFinite(Number(node.value));
        if(node?.type==='Unary'&&['+','-','~'].includes(node.op))return numericReflectionArgument(node.argument,seen);
        if(node?.type==='Binary'&&['+','-','*','/','%'].includes(node.op))return numericReflectionArgument(node.left,seen)&&numericReflectionArgument(node.right,seen);
        if(node?.type!=='Identifier')return false;
        const binding=flow.lexical.references.get(node),writes=reflectionWriters.get(binding);
        return !!writes?.length&&!seen.has(binding)&&writes.every(row=>
            ['=','+=','-=','*=','/=','%='].includes(row.op)&&numericReflectionArgument(row.value,new Set([...seen,binding])));
    };
    const reflectionProducer=(node,seen=new Set())=>{
        if(node?.type==='Parenthesized')return reflectionProducer(node.expression,seen);
        const type=flow.expressionTypes.get(node),targets=flow.expressionTargets.get(node);
        if(type?.kind!=='callable'||!targets?.size||![...targets].every(target=>sites.has(target)))return false;
        if(node.type==='FunctionExpression')return sites.has(node);
        if(node.type==='Member')return classPrototype;
        if(node.type==='Identifier') {
            const binding=flow.lexical.references.get(node);
            if(!binding||seen.has(binding))return false;
            if(classPrototype&&binding.kind==='parameter')return true;
            const writes=reflectionWriters.get(binding);
            if(!writes?.length)return false;
            const concrete=writes.filter(row=>row.value&&row.value.type!=='Undefined'),empty=writes.filter(row=>!row.value||row.value.type==='Undefined');
            if(empty.length && (empty.length!==1||writes[0]!==empty[0]||binding.kind!=='global'||
                !moduleOrder.has(node)||!concrete.some(row=>moduleOrder.has(row.source)&&moduleOrder.get(row.source)<moduleOrder.get(node))))return false;
            return !!concrete.length&&concrete.every(row=>row.op==='='&&reflectionProducer(row.value,new Set([...seen,binding])));
        }
        if(node.type==='Call'&&node.callee?.type==='Identifier') {
            const binding=flow.lexical.references.get(node.callee);
            return binding?.kind==='function'&&!binding.written&&binding.node?.type==='FunctionDeclaration'&&
                node.args.every(argument=>numericReflectionArgument(argument));
        }
        return false;
    };
    const rewrite=(node,{callee=false,ownerScope=null}={})=>{
        if(!node || typeof node!=='object')return node;
        if(Array.isArray(node))return node.map(value=>rewrite(value,{ownerScope}));
        if(node.type==='Unary' && node.op==='typeof') {
            if(classPrototype?node.bwSourceCallableTypeOf===true:reflectionProducer(node.argument))
                return {...node,bwSourceCallableTypeOf:true,argument:rewrite(node.argument,{ownerScope})};
        }
        if(node.type==='FunctionExpression' && !legacyCallbacks.has(node)) {
            const info=sites.get(node);if(!info)return node;
            const targets=flow.expressionTargets.get(node) || new Set([node]);
            return {...call('create',[str(info.name)]),bwCallableSignature:info.signature,
                bwCallableTargets:[...targets].map(target=>sites.get(target)?.name).filter(Boolean)};
        }
        if(node.type==='Identifier') {
            const binding=flow.lexical.references.get(node);
            if(classPrototype&&binding?.kind==='receiver'&&ownerScope&&ownerScope!==binding.functionOwner)
                return {...node,name:cellName(binding),assertedType:binding.scope.className};
            if(binding?.kind==='function' && !callee && flow.expressionTypes.get(node)?.kind==='callable') {
                fail('Named function values require their qualified source declaration bridge');return node;
            }
            return binding && binding.functionOwner!==flow.lexical.global && binding.kind!=='receiver' ?
                {...node,name:cellName(binding)}:{...node};
        }
        if(node.type==='Member' && !callee) {
            const targets=flow.expressionTargets.get(node);
            if(targets?.size && [...targets].every(target=>target.kind==='method'))
                fail('Class method references require their qualified receiver binding');
        }
        if(node.type==='Declaration') {
            const scope=flow.lexical.scopes.get(node);
            return {...node,decls:node.decls.map(declaration=>{
                const binding=scope?.names.get(declaration.name),type=flow.bindingTypes.get(binding);
                return {...declaration,name:binding && binding.functionOwner!==flow.lexical.global?cellName(binding):declaration.name,
                    init:rewrite(declaration.init,{ownerScope}),...(type?.kind==='callable'?{bwCallableSignature:type}:{})};
            })};
        }
        if(node.type==='Call' && !node.isNew) {
            const binding=node.callee?.type==='Identifier' && flow.lexical.references.get(node.callee);
            const direct=binding?.kind==='function' && binding.node?.type==='FunctionDeclaration';
            const possible=flow.expressionTargets.get(node.callee);
            const classMethod=node.callee?.type==='Member' && possible?.size && [...possible].every(target=>target.kind==='method');
            const type=flow.expressionTypes.get(node.callee);
            if(type?.kind==='callable' && !direct && !classMethod) {
                const invocation=flow.invocations.get(node);
                if(!invocation?.signature)fail('Source callable invocation requires a qualified concrete signature');
                const targets=flow.expressionTargets.get(node.callee) || new Set();
                return {...call('invoke',[rewrite(node.callee,{ownerScope}),{type:'Array',items:node.args.map(argument=>rewrite(argument,{ownerScope}))}]),
                    ...(invocation?.signature?{bwCallableResultType:renderCallableType(invocation.signature.result)}:{}),
                    bwCallableTargets:[...targets].map(target=>sites.get(target)?.name).filter(Boolean)};
            }
        }
        const out=cloneMetadata(node);
        const actualScope=flow.lexical.scopes.get(node);
        if(classPrototype&&actualScope?.kind==='method')out.bwClassCallableScopeId=actualScope.id;
        const childScope=actualScope&&['method','function'].includes(actualScope.kind)?actualScope:ownerScope;
        for(const [key,value]of Object.entries(node)) {
            if(['params','paramTypes','originalBody','parameterDefaults','typeParameters'].includes(key))continue;
            if(value && typeof value==='object')out[key]=rewrite(value,{callee:key==='callee',ownerScope:childScope});
        }
        if(classPrototype&&node.type==='Call') {
            const invocation=flow.invocations.get(node);
            if(invocation?.signature)out.bwClassCallableInvocation=structuredClone(invocation.signature);
        }
        return out;
    };
    for(const scope of flow.lexical.functions) {
        const info=sites.get(scope.node);if(!info)continue;
        const defaults=callableDefaultBody(scope.node);
        unsupported.push(...defaults.unsupported);
        definitions.push({type:'FunctionDeclaration',name:info.name,params:info.parameters,
            paramTypes:Object.fromEntries(info.signature.parameters.map(parameter=>[parameter.name,{text:renderCallableType(parameter.type)}])),
            returnType:renderCallableType(info.signature.result),body:rewrite(defaults.body,{ownerScope:scope}),
            bwCallableDefinition:{site:info.site,signature:info.signature,
                captures:info.captures,defaults:info.defaults,
                functionKind:scope.node.functionKind}});
    }
    const body=rewrite(program.body);
    if(unsupported.length)return {program,unsupported:[...new Set(unsupported)],flow};
    if(classPrototype)return {program:{...program,body:[...body,...definitions],
        bwClassCallableDescriptors:{schema:classModel.schema,version:classModel.version,classes:structuredClone(classModel.classes)},
        bwCallables:definitions.map(definition=>({name:definition.name,...definition.bwCallableDefinition}))},
        unsupported:[],flow,
        finishClassPlan:procedures=>createClassCallablePlan(flow,siteInfos,procedures)};
    let lexicalPlan;
    try { lexicalPlan=createCallableLexicalPlan(flow,siteInfos); }
    catch(error) { return {program,unsupported:[String(error.message)],flow}; }
    return {program:{...program,body:[...body,...definitions],bwCallableLexicalPlan:lexicalPlan,
        bwCallables:definitions.map(definition=>({name:definition.name,...definition.bwCallableDefinition}))},
        unsupported:[],flow};
}
