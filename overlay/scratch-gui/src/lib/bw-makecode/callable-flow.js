import {analyseCallableBindings} from './callable-bindings.js';
import {parseCallableType} from './callable-type-syntax.js';
import {instantiateCallableSignature} from './callable-signatures.js';
import {callableDefaultBody} from './callable-defaults.js';

// Callable signatures have their own directed source flow. A resource's runtime
// reference kind cannot supply a missing parameter/result type, and a generic
// invocation cannot specialize another invocation of the same method.
export function analyseCallableFlow(program) {
    const lexical=analyseCallableBindings(program),bindingTypes=new Map(),profiles=new WeakMap();
    const classes=new Map(program.body.filter(node=>node.type==='Class').map(node=>[node.name,node]));
    const expressionTypes=new WeakMap(),invocations=new WeakMap(),unsupported=[];
    const bindingTargets=new Map(),expressionTargets=new WeakMap(),fieldTargets=new WeakMap();
    const annotation=value=>parseCallableType(typeof value==='string'?value:value?.text || '');
    const named=name=>({kind:'named',name});
    const equal=(a,b)=>a?.kind===b?.kind && !!a && (a.kind==='named'?a.name===b.name:
        a.kind==='array'?equal(a.element,b.element):a.parameters.length===b.parameters.length &&
            a.parameters.every((parameter,index)=>parameter.optional===b.parameters[index].optional &&
                equal(parameter.type,b.parameters[index].type)) && equal(a.result,b.result));
    let changed=false;
    const set=(map,key,type)=>{
        if(!key || !type || equal(map.get(key),type))return;
        if(map.has(key))return; // Source declarations are authoritative.
        map.set(key,type);changed=true;
    };
    const targets=(map,key,values)=>{
        if(!key || !values?.size)return;
        if(!map.has(key))map.set(key,new Set());
        const current=map.get(key);
        for(const value of values)if(!current.has(value)){current.add(value);changed=true;}
    };
    for(const scope of lexical.functions) {
        const node=scope.node;
        const profile={node,scope,parameters:(node.params || []).map(name=>({name,
            optional:!!node.optionalParams?.includes(name) || !!node.parameterDefaults?.some(value=>value.name===name),
            type:annotation(node.paramTypes?.[name])})),result:annotation(node.returnType),
            typeParameters:node.typeParameters || [],returnTargets:new Set()};
        profiles.set(node,profile);
        for(const parameter of profile.parameters)set(bindingTypes,scope.names.get(parameter.name),parameter.type);
        if(scope.kind==='method')set(bindingTypes,scope.names.get('this'),named(scope.className));
    }
    for(const binding of lexical.bindings)if(binding.node?.typeName)
        set(bindingTypes,binding,annotation(binding.node.typeName));
    const signature=profile=>profile && profile.result && profile.parameters.every(parameter=>parameter.type) ?
        {kind:'callable',parameters:profile.parameters.map(parameter=>({...parameter})),result:profile.result}:null;
    const member=(type,name)=>{
        if(type?.kind!=='named')return null;
        const seen=new Set();let cls=classes.get(type.name);
        while(cls && !seen.has(cls.name)) {
            seen.add(cls.name);
            const field=cls.fields.find(field=>field.name===name);
            if(field)return {type:annotation(field.typeName),field,targets:fieldTargets.get(field)};
            const method=cls.methods.find(method=>method.name===name && !['get','set'].includes(method.kind));
            if(method)return {type:signature(profiles.get(method)),profile:profiles.get(method),targets:new Set([method])};
            const getter=cls.methods.find(method=>method.name===name && method.kind==='get');
            if(getter)return {type:profiles.get(getter)?.result};
            cls=classes.get(cls.base);
        }
        return null;
    };
    const constructorProfile=name=>{
        const seen=new Set();let cls=classes.get(name);
        while(cls && !seen.has(cls.name)) {
            seen.add(cls.name);
            if(cls.ctor)return profiles.get(cls.ctor);
            cls=classes.get(cls.base);
        }
        return null;
    };
    const returns=(node,out=[])=>{
        if(!node || typeof node!=='object')return out;
        if(Array.isArray(node)){node.forEach(value=>returns(value,out));return out;}
        if(['FunctionDeclaration','FunctionExpression','Class'].includes(node.type))return out;
        if(node.type==='Return'){out.push(node.value);return out;}
        Object.values(node).forEach(value=>{if(value && typeof value==='object')returns(value,out);});return out;
    };
    const context=(node,expected)=>{
        const profile=profiles.get(node);
        if(!profile || expected?.kind!=='callable' || profile.parameters.length!==expected.parameters.length)return;
        profile.parameters.forEach((parameter,index)=>{
            if(!parameter.type && expected.parameters[index].type) {
                parameter.type=expected.parameters[index].type;
                set(bindingTypes,profile.scope.names.get(parameter.name),parameter.type);changed=true;
            }
        });
    };
    const infer=node=>{
        if(!node || typeof node!=='object')return null;
        let result;
        const primitive={Number:'number',String:'string',Boolean:'boolean',Null:'null',Undefined:'undefined'}[node.type];
        if(primitive)result=named(primitive);
        else if(node.type==='Identifier') {
            const binding=lexical.references.get(node);
            const declaration=binding?.kind==='function' && binding.node?.type==='FunctionDeclaration';
            result=bindingTypes.get(binding) || (declaration?signature(profiles.get(binding.node)):null);
            targets(expressionTargets,node,bindingTargets.get(binding));
            if(declaration)targets(expressionTargets,node,new Set([binding.node]));
        } else if(node.type==='FunctionExpression') {
            result=signature(profiles.get(node));targets(expressionTargets,node,new Set([node]));
        } else if(node.type==='Member') {
            const value=member(infer(node.object),node.name);result=value?.type;targets(expressionTargets,node,value?.targets);
        }
        else if(node.type==='Index') {const type=infer(node.object);if(type?.kind==='array')result=type.element;}
        else if(node.type==='Array') {
            const types=node.items.map(infer);
            if(types.length && types.every(type=>equal(type,types[0])))result={kind:'array',element:types[0]};
        } else if(node.type==='Binary') {
            if(['==','===','!=','!==','<','>','<=','>='].includes(node.op))result=named('boolean');
            else if(node.op==='+') {
                const left=infer(node.left),right=infer(node.right);
                if(left?.kind==='named' && right?.kind==='named') {
                    if(left.name==='string'||right.name==='string')result=named('string');
                    else if(left.name==='number' && right.name==='number')result=named('number');
                }
            } else if(!['&&','||'].includes(node.op))result=named('number');
            else {const left=infer(node.left),right=infer(node.right);if(equal(left,right))result=left;}
        } else if(node.type==='Unary')result=named(node.op==='typeof'?'string':node.op==='!'?'boolean':'number');
        else if(node.type==='Update')result=named('number');
        else if(node.type==='Assignment') {result=infer(node.right);targets(expressionTargets,node,expressionTargets.get(node.right));}
        else if(node.type==='Conditional') {
            const left=infer(node.consequent),right=infer(node.alternate);if(equal(left,right))result=left;
            targets(expressionTargets,node,expressionTargets.get(node.consequent));targets(expressionTargets,node,expressionTargets.get(node.alternate));
        }
        else if(node.type==='Call') {
            if(node.isNew && node.callee?.type==='Identifier' && classes.has(node.callee.name)) {
                const profile=constructorProfile(node.callee.name);
                (node.args || []).forEach((argument,index)=>{
                    context(argument,profile?.parameters[index]?.type);infer(argument);
                    targets(bindingTargets,profile?.scope.names.get(profile.parameters[index]?.name),expressionTargets.get(argument));
                });
                result=named(node.callee.name);
            }
            else {
                const binding=node.callee?.type==='Identifier' && lexical.references.get(node.callee);
                const target=node.callee?.type==='Member'?member(infer(node.callee.object),node.callee.name):
                    {type:infer(node.callee),profile:binding?.kind==='function'?profiles.get(binding.node):null};
                const callee=target?.type;
                if(callee?.kind==='callable') {
                    (node.args || []).forEach((argument,index)=>context(argument,callee.parameters[index]?.type));
                    const arguments_=(node.args || []).map(infer);
                    infer(node.callee);
                    for(const fn of expressionTargets.get(node.callee) || []) {
                        const profile=profiles.get(fn);if(!profile)continue;
                        (node.args || []).forEach((argument,index)=>targets(bindingTargets,
                            profile.scope.names.get(profile.parameters[index]?.name),expressionTargets.get(argument)));
                        targets(expressionTargets,node,profile.returnTargets);
                    }
                    if(arguments_.every(Boolean)) {
                        const possible=expressionTargets.get(node.callee) || new Set();
                        const explicitUndefinedSlots=new Set();
                        for(let index=0;index<callee.parameters.length;index++)if(possible.size && [...possible].every(fn=>{
                            const profile=profiles.get(fn),parameter=profile?.parameters[index];
                            const entry=callableDefaultBody(fn).defaults.find(value=>value.name===parameter?.name);
                            return parameter?.type?.kind==='named' && parameter.type.name==='number' &&
                                typeof entry?.value==='number' && Number.isFinite(entry.value);
                        }))explicitUndefinedSlots.add(index);
                        const invocation=instantiateCallableSignature(callee,target.profile?.typeParameters || [],arguments_,{explicitUndefinedSlots});
                        invocations.set(node,invocation);
                        if(invocation.signature)result=invocation.signature.result;
                    }
                }
            }
        }
        if(result)set(expressionTypes,node,result);
        return result || expressionTypes.get(node) || null;
    };
    const visit=node=>{
        if(!node || typeof node!=='object')return;
        if(Array.isArray(node)){node.forEach(visit);return;}
        if(node.type==='Declaration')for(const declaration of node.decls) {
            const scope=lexical.scopes.get(node);
            const binding=scope?.names.get(declaration.name);
            context(declaration.init,bindingTypes.get(binding));
            set(bindingTypes,binding,infer(declaration.init));
            targets(bindingTargets,binding,expressionTargets.get(declaration.init));
        }
        if(node.type==='Assignment' && node.left?.type==='Identifier') {
            const binding=lexical.references.get(node.left);
            context(node.right,bindingTypes.get(binding));
            set(bindingTypes,binding,infer(node.right));
            targets(bindingTargets,binding,expressionTargets.get(node.right));
        } else if(node.type==='Assignment' && node.left?.type==='Member') {
            const field=member(infer(node.left.object),node.left.name)?.field;
            infer(node.right);targets(fieldTargets,field,expressionTargets.get(node.right));
        }
        infer(node);
        for(const [key,value]of Object.entries(node))if(!['originalBody','parameterDefaults','paramTypes','typeParameters'].includes(key) && value && typeof value==='object')visit(value);
    };
    let passes=0;
    do {
        changed=false;visit(program.body);
        for(const scope of lexical.functions) {
            const profile=profiles.get(scope.node);
            const body=scope.node.type==='FunctionExpression'?callableDefaultBody(scope.node).body:scope.node.body;
            const returned=returns(body),values=returned.map(value=>value?infer(value):named('undefined'));
            for(const value of returned)for(const fn of expressionTargets.get(value) || [])if(!profile.returnTargets.has(fn)){
                profile.returnTargets.add(fn);changed=true;
            }
            if(profile.result)continue;
            const concrete=values.filter(type=>type && !['undefined','null'].includes(type.name));
            if(values.every(Boolean) && concrete.length && concrete.every(type=>equal(type,concrete[0]))) {
                profile.result=concrete[0];changed=true;
            } else if(values.length===0 || values.every(type=>type?.name==='undefined')) {
                profile.result=named('void');changed=true;
            }
        }
    } while(changed && ++passes<100);
    if(changed)unsupported.push('Callable source signature flow did not converge');
    for(const scope of lexical.functions) {
        if(scope.capturedBeforeDeclaration.size)
            unsupported.push('Selected Arcade SDK callable captures a declaration before its value is available');
        unsupported.push(...(scope.unsupported || []));
    }
    return {lexical,profiles,bindingTypes,expressionTypes,invocations,signature,unsupported,
        bindingTargets,expressionTargets,fieldTargets};
}
