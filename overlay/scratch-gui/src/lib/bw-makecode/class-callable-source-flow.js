import {analyseCallableFlow} from './callable-flow.js';
import {parseCallableType} from './callable-type-syntax.js';
import {instantiateCallableSignature} from './callable-signatures.js';

// This is a bounded, sequential producer proof over source AST, not an
// interpreter for source values. Annotations constrain produced values but
// never create an allocation, initialized field, closure or return value.
export function proveClassCallableSource(program) {
    const flow=analyseCallableFlow(program),{lexical}=flow;
    const classes=new Map(),errors=[],visited=new Set(),constructed=new Set();
    const fail=message=>{throw Error('Class callable source: '+message);};
    const named=name=>({kind:'named',name});
    const scalar=name=>({type:named(name)});
    const undef=()=>scalar('undefined');
    const annotation=value=>parseCallableType(typeof value==='string'?value:value?.text||'');
    const equal=(a,b)=>a&&b&&a.kind===b.kind&&(a.kind==='named'?a.name===b.name:
        a.kind==='callable'&&a.parameters.length===b.parameters.length&&
        a.parameters.every((p,i)=>p.optional===b.parameters[i].optional&&equal(p.type,b.parameters[i].type))&&equal(a.result,b.result));
    const env=(parent=null)=>({parent,cells:new Map()});
    const moduleEnv=env(),active=new Set(),primitiveHelpers=new Map();
    const cell=(binding,context)=>{if(!binding)return null;for(let e=context;e;e=e.parent)if(e.cells.has(binding))return e.cells.get(binding);return null;};
    const supportedType=(type,generics=new Set())=>type?.kind==='named'?
        ['number','string','boolean','void','undefined'].includes(type.name)||generics.has(type.name)||classes.has(type.name):
        type?.kind==='callable'&&type.parameters.every(p=>!p.optional&&supportedType(p.type,generics))&&supportedType(type.result,generics);
    const scopes=new Map(lexical.functions.map(scope=>[scope.node,scope]));
    const signature=node=>flow.signature(flow.profiles.get(node));
    const constrain=(value,type,label)=>{
        if(value.genericOrigin&&type){if(type.kind!=='named'||type.name!==value.genericOrigin)fail(label+' narrows an unbound generic result');return value;}
        if(type&&!equal(value.type,type))fail(label+' has an incompatible actual producer');
        return value;
    };
    const getField=(object,name,context,write=false)=>{
        if(!object.instance)fail('member receiver has no actual ordinary allocation');
        const cls=classes.get(object.instance.className),field=cls.fields.find(f=>f.name===name);
        if(!field)fail('unknown field '+cls.name+'.'+name);
        if(field.modifiers?.some(m=>m==='private'||m==='protected')&&context.className!==cls.name)
            fail('field access differs from its actual lexical class');
        if(write&&field.modifiers?.includes('readonly')&&
            !(context.constructor===true&&context.receiver?.instance===object.instance))
            fail('readonly write requires the actual constructor receiver');
        return {field,cell:object.instance.fields.get(name)};
    };
    const bindScope=(node,parent,args,context={})=>{
        const scope=scopes.get(node);if(!scope)fail('missing actual lexical owner');
        if(args.length!==(node.params||[]).length)fail('actual invocation argument count differs');
        const local=env(parent);
        for(const binding of scope.names.values())local.cells.set(binding,{value:undef(),constraint:null});
        for(let i=0;i<args.length;i++){
            const binding=scope.names.get(node.params[i]);if(!binding||binding.kind!=='parameter'||binding.scope!==scope)fail('missing actual parameter binding');
            local.cells.set(binding,{value:args[i],constraint:annotation(node.paramTypes?.[node.params[i]])});
        }
        if(context.receiver&&scope.kind==='method'){const binding=scope.names.get('this');
            if(!binding||binding.kind!=='receiver'||binding.scope!==scope)fail('missing actual constructor/method receiver binding');
            local.cells.set(binding,{value:context.receiver,constraint:context.receiver.type});
        }
        return {...context,env:local,node,scope};
    };
    const invoke=(callable,args,caller)=>{
        const node=callable.node;if(!node)fail('callable has no actual source body');
        if(active.has(node))fail('recursive invocation requires separate qualification');
        const raw=signature(node);if(!raw)fail('callable signature is unresolved');
        const inst=instantiateCallableSignature(raw,node.typeParameters||[],args.map(a=>a.type));
        if(inst.unsupported.length||!inst.signature)fail(inst.unsupported.join('; '));
        const context=bindScope(node,callable.env,args,{className:callable.className,
            receiver:callable.receiver,constructor:callable.constructor===true,generics:inst.substitutions});
        args.forEach((arg,i)=>{constrain(arg,inst.signature.parameters[i].type,'argument');if(inst.signature.parameters[i].type.kind==='callable'&&arg.node?.type!=='FunctionExpression')fail('callback arguments require owned Arrows');});
        active.add(node);visited.add(node);
        try {
            const result=body(node.body,context);
            const expected=inst.signature.result;
            if(node.type==='FunctionExpression'&&!['number','string'].includes(expected.name))fail('default callbacks require concrete Number or String results');
            const genericResult=raw.result.kind==='named'&&inst.substitutions.has(raw.result.name);
            if(expected.name!=='void')constrain(genericResult?{...result.value,genericOrigin:undefined}:result.value,expected,'returned value');
            else if(result.returned&&result.value.type.name!=='undefined')fail('void body returns a value');
            if(raw.result.kind==='named'&&inst.substitutions.has(raw.result.name)&&result.value.genericOrigin!==raw.result.name)
                fail('generic return is not produced by its actual callback invocation');
            return {...result.value,genericOrigin:undefined};
        } finally {active.delete(node);}
    };
    const read=node=>lexical.references.get(node);
    const expression=(node,context,ignoreAssertion=false)=>{
        if(!node)return undef();
        if(node.assertedType&&!ignoreAssertion){
            const value=expression(node,context,true),type=annotation(node.assertedType);
            constrain(value,type,'identity assertion');return value;
        }
        if(node.type==='Parenthesized')return expression(node.expression,context);
        const primitive={Number:'number',String:'string',Boolean:'boolean',Undefined:'undefined'}[node.type];
        if(primitive)return scalar(primitive);
        if(node.type==='Identifier') {
            const current=cell(read(node),context.env);if(!current)fail('unresolved lexical value '+node.name);
            if(current.value.classDeclaration)fail('class declaration is not an instance producer');
            return current.value;
        }
        if(node.type==='FunctionExpression') {
            if(node.functionKind!=='arrow')fail('only actual Arrows are in the class default profile');
            const type=signature(node);if(!type)fail('Arrow signature is unresolved');
            return {type,node,env:context.env,className:context.className,receiver:context.receiver};
        }
        if(node.type==='Member') {
            const object=expression(node.object,context);
            if(!object.instance)fail('member receiver is opaque');
            const cls=classes.get(object.instance.className),method=cls.methods.find(m=>m.name===node.name);
            if(method?.modifiers?.some(m=>m==='private'||m==='protected')&&context.className!==cls.name)fail('method access differs from its actual lexical class');
            if(method)return {type:signature(method),node:method,env:moduleEnv,className:cls.name,receiver:object};
            const field=getField(object,node.name,context);
            if(!field.cell.initialized)fail('field read occurs before actual initialization');
            return field.cell.value;
        }
        if(node.type==='Assignment') {
            // Receiver is resolved before RHS; neither side is normalized away.
            let destination;
            if(node.left.type==='Identifier') {
                const binding=read(node.left);destination=cell(binding,context.env);
                if(!destination||['parameter','receiver','function','class'].includes(binding.kind))fail('unproved formal or lexical writer');
                if(destination.kind==='const')fail('const cell write');
            } else if(node.left.type==='Member') {
                const object=expression(node.left.object,context),field=getField(object,node.left.name,context,true);
                destination=field.cell;
            } else fail('unsupported assignment receiver');
            let value=expression(node.right,context);
            if(destination.constraint?.kind==='callable'&&value.node?.type!=='FunctionExpression')fail('stored callbacks require owned Arrow producers');
            if(node.op!=='=')value=binary(node.op.slice(0,-1),destination.value,value);
            constrain(value,destination.constraint,'writer');destination.value=value;destination.initialized=true;
            return value;
        }
        if(node.type==='Binary')return binary(node.op,expression(node.left,context),expression(node.right,context));
        if(node.type==='Call') {
            let callee=node.callee;while(callee?.type==='Parenthesized'&&!callee.assertedType)callee=callee.expression;
            if(!['Identifier','Member'].includes(callee?.type))fail('dynamic callees require their separate callable lane');
            if(node.isNew) {
                const binding=callee?.type==='Identifier'&&read(callee),cls=binding?.kind==='class'&&classes.get(binding.node.name);
                if(!cls)fail('constructor has no actual ordinary class declaration');
                const args=node.args.map(arg=>expression(arg,context)),instance={className:cls.name,fields:new Map(),complete:false};
                const result={type:named(cls.name),instance};
                for(const f of cls.fields)instance.fields.set(f.name,{value:undef(),constraint:annotation(f.typeName),initialized:false});
                for(const f of cls.fields)if(f.init){const value=expression(f.init,{env:moduleEnv,scope:lexical.global,generics:new Map()});constrain(value,annotation(f.typeName),'field initializer');Object.assign(instance.fields.get(f.name),{value,initialized:true});}
                const ctorContext=bindScope(cls.ctor,moduleEnv,args,{className:cls.name,receiver:result,constructor:true,generics:new Map()});
                args.forEach((arg,i)=>constrain(arg,annotation(cls.ctor.paramTypes?.[cls.ctor.params[i]]),'constructor argument'));
                if(active.has(cls.ctor))fail('recursive construction');active.add(cls.ctor);visited.add(cls.ctor);
                try {const completion=body(cls.ctor.body,ctorContext);if(completion.returned&&completion.value.type.name!=='undefined')fail('constructor returns a value');}
                finally {active.delete(cls.ctor);}
                if([...instance.fields.values()].some(f=>!f.initialized))fail('constructor completion leaves an unproved field');
                instance.complete=true;constructed.add(cls);return result;
            }
            const sdk=node.callee?.type==='Identifier'&&node.callee.name==='pause'&&!read(node.callee)?'pause':
                node.callee?.type==='Member'&&node.callee.object?.type==='Identifier'&&node.callee.object.name==='info'&&
                !read(node.callee.object)&&node.callee.name==='setScore'?'score':null;
            if(sdk){if(node.args.length!==1)fail('SDK effect argument count differs');constrain(expression(node.args[0],context),named('number'),'SDK effect');return undef();}
            const helper=callee.type==='Identifier'&&primitiveHelpers.get(read(callee));
            if(helper){const args=node.args.map(arg=>expression(arg,context));if(args.length!==2)fail('primitive helper actual arity differs');args.forEach((arg,i)=>{const type=annotation(helper.paramTypes?.[helper.params[i]]);if(type?.name!=='any')constrain(arg,type,'primitive helper argument');});
                visited.add(helper);const value=binary(helper.body[0].value.op,args[0],args[1]);const type=annotation(helper.returnType);if(type?.name!=='any')constrain(value,type,'primitive helper result');return value;}
            const callable=expression(node.callee,context),args=node.args.map(arg=>expression(arg,context));
            if(callable.receiver&&!callable.receiver.instance.complete)fail('method invocation precedes constructor completion');
            if(callable.receiver&&callable.receiver===context.receiver&&!context.receiver?.instance.complete)fail('callback invocation escapes incomplete constructor');
            const result=invoke(callable,args,context);
            const binding=callee.type==='Identifier'&&read(callee),declared=binding&&annotation(context.node?.paramTypes?.[binding.name]);
            return declared?.kind==='callable'&&declared.result.kind==='named'&&context.generics?.has(declared.result.name)?
                {...result,genericOrigin:declared.result.name}:result;
        }
        fail('unsupported expression '+node.type);
    };
    const binary=(op,left,right)=>{
        if(left.genericOrigin||right.genericOrigin)fail('primitive operation consumes an unbound generic result');
        const l=left.type.name,r=right.type.name;
        if(['==','===','!=','!=='].includes(op)&&left.type.kind==='named'&&right.type.kind==='named'&&(l===r||l==='undefined'||r==='undefined'))return scalar('boolean');
        if(op==='+'&&['number','string'].includes(l)&&['number','string'].includes(r))return scalar(l==='string'||r==='string'?'string':'number');
        if(['-','*','/','%'].includes(op)&&l==='number'&&r==='number')return scalar('number');
        fail('binary operands have no qualified primitive producer');
    };
    const body=(statements,context)=>{
        for(let index=0;index<(statements||[]).length;index++) {
            const statement=statements[index];
            if(statement.type==='Declaration') {
                if(!['let','const'].includes(statement.kind))fail('unqualified declaration syntax');
                for(const row of statement.decls) {
                    const binding=context.scope.names.get(row.name),current=cell(binding,context.env);
                    if(!binding||!['global','local'].includes(binding.kind)||binding.node!==row||binding.scope!==context.scope||!current||current.declared)fail('duplicate or foreign lexical declaration');
                    const value=expression(row.init,context),constraint=annotation(row.typeName);
                    if(row.init&&!(row.init.type==='Undefined'&&constraint?.kind==='named'&&['number','string','boolean'].includes(constraint.name)))constrain(value,constraint,'initializer');
                    if(context.scope===lexical.global&&value.type.kind==='callable')fail('module callable value cells require separate qualification');
                    Object.assign(current,{value,constraint:constraint||(value.genericOrigin?named(value.genericOrigin):value.type),kind:statement.kind,declared:true});
                }
            } else if(statement.type==='ExpressionStatement')expression(statement.expr,context);
            else if(statement.type==='Return') {
                if(index!==statements.length-1)fail('unqualified statements after return');
                return {returned:true,value:expression(statement.value,context)};
            } else if(context.scope===lexical.global&&['Class','FunctionDeclaration'].includes(statement.type))continue;
            else fail('unsupported statement '+statement.type);
        }
        return {returned:false,value:undef()};
    };
    try {
        for(const node of program.body)if(node.type==='Class') {
            if(classes.has(node.name))fail('duplicate class declaration');classes.set(node.name,node);
        }
        if(![...classes.values()].some(cls=>cls.fields.some(f=>annotation(f.typeName)?.kind==='callable')))
            return {eligible:false,unsupported:[],flow};
        for(const cls of classes.values()) {
            if(cls.base||!cls.ctor||cls.unsupported?.some(reason=>reason!=='generic class methods'))fail('default classes require explicit ordinary constructors without inheritance');
            const fields=new Set();for(const f of cls.fields){if(fields.has(f.name)||f.isStatic||!supportedType(annotation(f.typeName)))fail('unqualified field catalogue');fields.add(f.name);if(f.init&&annotation(f.typeName)?.kind==='callable')fail('callable field initializers require their own receiver/lexical ABI');}
            for(const node of [cls.ctor,...cls.methods]) {
                if(new Set(node.params||[]).size!==(node.params||[]).length)fail('duplicate actual parameters');
                if((node.params||[]).some(name=>!supportedType(annotation(node.paramTypes?.[name]),new Set((node.typeParameters||[]).map(p=>p.name)))))fail('unresolved parameter constraints');
                if(node.isStatic||node.kind&&node.kind!=='method'||node.optionalParams?.length||node.parameterDefaults?.length||node.parameterProperties?.length)
                    fail('unqualified method, defaults or parameter properties');
                if(node.typeParameters?.length>1||node.typeParameters?.some(p=>p.constraint||p.defaultType))fail('unqualified generic method');
            }
        }
        for(const scope of lexical.functions){
            const node=scope.node;
            const value=node.body?.length===1&&node.body[0].type==='Return'&&node.body[0].value;
            if(node.type==='FunctionDeclaration'&&scope.parent===lexical.global&&node.params.length===2&&
                value?.type==='Binary'&&['+','-','*','/','%'].includes(value.op)&&
                value.left?.type==='Identifier'&&value.right?.type==='Identifier'&&
                read(value.left)===scope.names.get(node.params[0])&&read(value.right)===scope.names.get(node.params[1])&&
                program.body.filter(row=>row.type==='FunctionDeclaration'&&row.name===node.name).length===1)
                primitiveHelpers.set(lexical.global.names.get(node.name),node);if(node.optionalParams?.length||node.parameterDefaults?.length)fail('optional/default arguments remain unqualified');
            if(node.type==='FunctionExpression'&&node.functionKind!=='arrow')fail('ordinary FunctionExpression remains unqualified');
            if(node.typeParameters?.length&&scope.kind!=='method')fail('generic free functions remain unqualified');
        }
        for(const binding of lexical.global.names.values()) {
            let value=undef();
            if(binding.kind==='class')value={type:named(binding.name),classDeclaration:binding.node};
            if(binding.kind==='function')value={type:signature(binding.node),node:binding.node,env:moduleEnv};
            moduleEnv.cells.set(binding,{value,constraint:null});
        }
        body(program.body,{env:moduleEnv,scope:lexical.global,generics:new Map()});
        for(const cls of classes.values())if(!constructed.has(cls))fail('adjacent class has no proved actual construction');
        for(const scope of lexical.functions)if(!visited.has(scope.node))fail('adjacent callable body has no proved actual invocation');
        return {eligible:true,unsupported:[],flow};
    } catch(error) {errors.push(error.message);return {eligible:false,unsupported:errors,flow};}
}
