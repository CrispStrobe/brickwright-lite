import {analyseCallableFlow} from './callable-flow.js';
import {parseCallableType} from './callable-type-syntax.js';
import {instantiateCallableSignature} from './callable-signatures.js';
import {alternatives,joinProducedValues,presenceAlternatives} from './class-callable-branch-values.js';
const completedResultProofs=new WeakMap();
export function classResultFlowCertificate(proof,program,method) {
    const record=completedResultProofs.get(proof);
    if(!record||record.program!==program||JSON.stringify(program)!==record.source)throw Error('Class result flow requires its actual unchanged source proof');
    const flow=record.methods.get(method);return flow?structuredClone(flow.resultFlow):null;
}
export function classMethodSourceSignature(proof,program,method) {
    const record=completedResultProofs.get(proof);
    if(!record||record.program!==program||JSON.stringify(program)!==record.source)throw Error('Class method requires its actual unchanged source proof');
    const row=record.methods.get(method);return row?structuredClone(row.signature):null;
}

// This is a bounded, sequential producer proof over source AST, not an
// interpreter for source values. Annotations constrain produced values but
// never create an allocation, initialized field, closure or return value.
export function proveClassCallableSource(program) {
    const flow=analyseCallableFlow(program),{lexical}=flow;
    const classes=new Map(),errors=[],visited=new Set(),constructed=new Set(),resultFlows=new WeakMap();
    const fail=message=>{throw Error('Class callable source: '+message);};
    const named=name=>({kind:'named',name});
    const scalar=name=>({type:named(name)});
    const undef=()=>scalar('undefined');
    const annotation=value=>parseCallableType(typeof value==='string'?value:value?.text||'');
    const equal=(a,b)=>a&&b&&a.kind===b.kind&&(a.kind==='named'?a.name===b.name:
        a.kind==='callable'&&a.parameters.length===b.parameters.length&&
        a.parameters.every((p,i)=>p.optional===b.parameters[i].optional&&equal(p.type,b.parameters[i].type))&&equal(a.result,b.result));
    const environments=new Set(),instances=new Set();let branchDepth=0;
    const env=(parent=null)=>{const row={parent,cells:new Map()};environments.add(row);return row;};
    const moduleEnv=env(),active=new Set(),primitiveHelpers=new Map();
    const cell=(binding,context)=>{if(!binding)return null;for(let e=context;e;e=e.parent)if(e.cells.has(binding))return e.cells.get(binding);return null;};
    const supportedType=(type,generics=new Set())=>type?.kind==='named'?
        ['number','string','boolean','void','undefined'].includes(type.name)||generics.has(type.name)||classes.has(type.name):
        type?.kind==='callable'&&type.parameters.every(p=>!p.optional&&supportedType(p.type,generics))&&supportedType(type.result,generics);
    const scopes=new Map(lexical.functions.map(scope=>[scope.node,scope]));
    const signature=node=>flow.signature(flow.profiles.get(node));
    const constrain=(value,type,label)=>{
        if(value.alternatives){
            const ownedPresence=value.presenceField&&type?.kind==='named'&&classes.has(type.name)&&
                value.alternatives.some(row=>row.instance&&equal(row.type,type))&&
                value.alternatives.every(row=>row.type?.name==='undefined'||row.instance&&equal(row.type,type));
            for(const row of value.alternatives){
            if(row.type?.name==='undefined'&&(value.conditionalResult===true||ownedPresence))continue;
            constrain(row,type,label);
        }return value;}
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
            if(node.type==='FunctionExpression'&&!['number','string','void'].includes(expected.name))fail('default callbacks require concrete Number, String or Void results');
            const genericResult=raw.result.kind==='named'&&inst.substitutions.has(raw.result.name);
            const nullable=genericResult&&node.type!=='FunctionExpression'&&result.conditional===true;
            const returnedRows=alternatives(result.value);
            if(expected.name!=='void')for(const row of returnedRows){
                if(nullable&&row.type?.name==='undefined'&&(row.genericOrigin===raw.result.name||row.absentReturn===true))continue;
                constrain(genericResult?{...row,genericOrigin:undefined}:row,expected,'returned value');
            }
            else if(returnedRows.some(row=>row.type?.name!=='undefined'))fail('void body returns a value');
            if(genericResult&&(!returnedRows.some(row=>row.genericOrigin===raw.result.name)||returnedRows.some(row=>row.genericOrigin!==raw.result.name&&!(nullable&&row.type?.name==='undefined'&&row.absentReturn===true))))
                fail('generic return is not produced by its actual callback invocation');
            if(nullable){const absent=returnedRows.filter(row=>row.genericOrigin!==raw.result.name);
                if(absent.length){const field=absent[0].absenceField;
                    if(!field||field.receiver!==callable.receiver?.instance||field.className!==callable.className||absent.some(row=>row.absenceField?.field!==field.field||row.absenceField?.receiver!==field.receiver))fail('nullable result has no actual saved receiver-field read');
                    const certificate={schema:'bw-class-result-flow/v1',presenceField:field.field,absent:'undefined',present:'callback'};
                    const previous=resultFlows.get(node);if(previous&&JSON.stringify(previous)!==JSON.stringify(certificate))fail('method conditional result flow differs across invocations');resultFlows.set(node,Object.freeze(certificate));
                }
            }
            const value=joinProducedValues(returnedRows.map(row=>({...row,genericOrigin:undefined})));
            return nullable?{...value,conditionalResult:true}:value;
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
            const binding=read(node),current=cell(binding,context.env);if(!current)fail('unresolved lexical value '+node.name);
            if(binding.kind==='local'&&!current.declared)fail('local read lacks a dominating declaration');
            if(current.value.classDeclaration)fail('class declaration is not an instance producer');
            return current.value;
        }
        if(node.type==='FunctionExpression') {
            if(branchDepth)fail('conditional callback creation needs separate capture qualification');
            if(node.functionKind!=='arrow')fail('only actual Arrows are in the class default profile');
            const type=signature(node);if(!type)fail('Arrow signature is unresolved');
            return {type,node,env:context.env,className:context.className,receiver:context.receiver};
        }
        if(node.type==='Member') {
            const object=expression(node.object,context);
            if(!object.instance)fail('member receiver is opaque for '+node.name+' in '+(context.node?.name||'callback'));
            const cls=classes.get(object.instance.className),method=cls.methods.find(m=>m.name===node.name);
            if(method?.modifiers?.some(m=>m==='private'||m==='protected')&&context.className!==cls.name)fail('method access differs from its actual lexical class');
            if(method)return {type:signature(method),node:method,env:moduleEnv,className:cls.name,receiver:object};
            const field=getField(object,node.name,context);
            if(!field.cell.initialized&&!field.cell.presenceProduced)fail('field read occurs before actual initialization');
            const value=field.cell.value;
            return context.receiver?.instance===object.instance?{...value,presenceField:{className:cls.name,field:node.name,receiver:object.instance}}:value;
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
                if(branchDepth)fail('conditional allocation needs separate lifetime qualification');
                const binding=callee?.type==='Identifier'&&read(callee),cls=binding?.kind==='class'&&classes.get(binding.node.name);
                if(!cls)fail('constructor has no actual ordinary class declaration');
                const args=node.args.map(arg=>expression(arg,context)),instance={className:cls.name,fields:new Map(),complete:false};
                instances.add(instance);const result={type:named(cls.name),instance};
                for(const f of cls.fields)instance.fields.set(f.name,{value:undef(),constraint:annotation(f.typeName),initialized:false});
                for(const f of cls.fields)if(f.init){const value=expression(f.init,{env:moduleEnv,scope:lexical.global,generics:new Map()});constrain(value,annotation(f.typeName),'field initializer');Object.assign(instance.fields.get(f.name),{value,initialized:true});}
                const ctorContext=bindScope(cls.ctor,moduleEnv,args,{className:cls.name,receiver:result,constructor:true,generics:new Map()});
                args.forEach((arg,i)=>constrain(arg,annotation(cls.ctor.paramTypes?.[cls.ctor.params[i]]),'constructor argument'));
                if(active.has(cls.ctor))fail('recursive construction');active.add(cls.ctor);visited.add(cls.ctor);
                try {const completion=body(cls.ctor.body,ctorContext);if(completion.returned&&completion.value.type.name!=='undefined')fail('constructor returns a value');}
                finally {active.delete(cls.ctor);}
                if([...instance.fields.values()].some(f=>!f.initialized&&!f.presenceProduced))fail('constructor completion leaves an unproved field');
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
        if(left.alternatives||right.alternatives){
            if(!['==','===','!=','!=='].includes(op))fail('nullable arithmetic requires separate primitive qualification');
            for(const l of alternatives(left))for(const r of alternatives(right))binary(op,l,r);
            return scalar('boolean');
        }
        if(left.genericOrigin||right.genericOrigin)fail('primitive operation consumes an unbound generic result');
        const l=left.type.name,r=right.type.name;
        if(['==','===','!=','!=='].includes(op)&&left.type.kind==='named'&&right.type.kind==='named'&&(l===r||l==='undefined'||r==='undefined'))return scalar('boolean');
        if(['<','>','<=','>='].includes(op)&&l===r&&['number','string'].includes(l))return scalar('boolean');
        if(op==='+'&&['number','string'].includes(l)&&['number','string'].includes(r))return scalar(l==='string'||r==='string'?'string':'number');
        if(['-','*','/','%'].includes(op)&&l==='number'&&r==='number')return scalar('number');
        fail('binary operands have no qualified primitive producer');
    };
    const snapshot=()=>({environments:new Map([...environments].map(row=>[row,new Map([...row.cells].map(([binding,value])=>[binding,{...value}]))])),
        instances:new Map([...instances].map(row=>[row,new Map([...row.fields].map(([name,value])=>[name,{...value}]))]))});
    const replaceCell=(map,key,value)=>{let current=map.get(key);if(!current){current={};map.set(key,current);}for(const name of Object.keys(current))delete current[name];Object.assign(current,value);};
    const restore=state=>{for(const[row,cells]of state.environments)for(const[key,value]of cells)replaceCell(row.cells,key,value);for(const[row,fields]of state.instances)for(const[key,value]of fields)replaceCell(row.fields,key,value);};
    const mergeCell=(left,right)=>{
        const value=joinProducedValues([left.value,right.value]);
        const rows=alternatives(value),presenceProduced=rows.some(row=>row.instance)&&rows.every(row=>row.instance||row.type?.name==='undefined');
        return {...left,value,declared:!!left.declared&&!!right.declared,initialized:!!left.initialized&&!!right.initialized,presenceProduced};
    };
    const mergeSnapshots=(left,right,before)=>{
        for(const row of before.environments.keys())for(const[binding,current]of left.environments.get(row)){const other=right.environments.get(row)?.get(binding);if(!other)fail('conditional lexical scope differs');replaceCell(row.cells,binding,mergeCell(current,other));}
        for(const row of before.instances.keys())for(const[name,current]of left.instances.get(row)){const other=right.instances.get(row)?.get(name);if(!other)fail('conditional instance lifetime differs');replaceCell(row.fields,name,mergeCell(current,other));}
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
                    if(row.init&&!(row.init.type==='Undefined'&&constraint?.kind==='named'&&['number','string','boolean'].includes(constraint.name)))constrain(value,constraint,'initializer '+row.name);
                    if(context.scope===lexical.global&&alternatives(value).some(row=>row.type?.kind==='callable'))fail('module callable value cells require separate qualification');
                    if(context.scope===lexical.global&&value.conditionalResult===true&&alternatives(value).every(row=>row.type?.name==='undefined'))fail('module Void result cells require separate declaration/export qualification');
                    let inferred=value.type;
                    const producedRows=alternatives(value),classPresence=producedRows.some(row=>row.instance)&&producedRows.every(row=>row.instance||row.type?.name==='undefined');
                    if(!inferred&&(value.conditionalResult||classPresence)){const rows=producedRows.filter(row=>row.type?.name!=='undefined');
                        if(!rows.length||rows.some(row=>!equal(row.type,rows[0].type)))fail('conditional result has unqualified concrete alternatives');inferred=rows[0].type;
                    }
                    if(!constraint&&!inferred)fail('declaration alternatives require actual typed producers');
                    Object.assign(current,{value,constraint:constraint||(value.genericOrigin?named(value.genericOrigin):inferred),kind:statement.kind,declared:true});
                }
            } else if(statement.type==='If') {
                const unparen=node=>node?.type==='Parenthesized'?unparen(node.expression):node;
                let predicate=unparen(statement.test);
                // The exporter spells the existing presence test as !!value.
                // Strip exactly that identity coercion, retaining the actual
                // binding and its directed presence alternatives.
                if(predicate?.type==='Unary'&&predicate.op==='!'){
                    const inner=unparen(predicate.argument);
                    if(inner?.type==='Unary'&&inner.op==='!')predicate=unparen(inner.argument);
                }
                const condition=expression(predicate,context);
                const rows=alternatives(condition),boolean=rows.every(row=>row.type?.name==='boolean');
                const binding=predicate?.type==='Identifier'&&read(predicate),destination=binding&&cell(binding,context.env);
                if(!boolean&&(!destination||!rows.every(row=>row.instance||row.type?.name==='undefined')))fail('conditional predicate lacks qualified Boolean/presence producers');
                const before=snapshot(),results=[],states=[];
                for(const present of [true,false]){
                    restore(before);
                    if(!boolean)cell(binding,context.env).value=presenceAlternatives(condition,present);
                    branchDepth++;
                    try{
                        const arm=present?statement.consequent:statement.alternate||[],scope=arm.length&&lexical.scopes.get(arm);
                        const absentPresence=!boolean&&!present&&rows.some(row=>row.type?.name==='undefined');
                        const absenceField=absentPresence?condition.presenceField:context.absenceField;
                        let branchContext={...context,absentPresence:context.absentPresence||absentPresence,absenceField};
                        if(arm.length){if(!scope||scope.parent!==context.scope||scope.kind!=='block')fail('conditional block has no actual lexical owner');
                            const local=env(context.env);for(const binding of scope.names.values())local.cells.set(binding,{value:undef(),constraint:null});
                            branchContext={...branchContext,env:local,scope};
                        }
                        let result=body(arm,branchContext);
                        if(!result.returned)result=body(statements.slice(index+1),{...context,absentPresence:context.absentPresence||absentPresence,absenceField});
                        results.push(result);states.push(snapshot());
                    }finally{branchDepth--;}
                }
                restore(before);mergeSnapshots(states[0],states[1],before);
                return {returned:results.every(result=>result.returned),value:joinProducedValues(results.map(result=>result.value)),conditional:true};
            } else if(statement.type==='ExpressionStatement')expression(statement.expr,context);
            else if(statement.type==='Return') {
                if(index!==statements.length-1)fail('unqualified statements after return');
                const value=expression(statement.value,context);
                return {returned:true,value:context.absentPresence&&value.type?.name==='undefined'?{...value,absentReturn:true,absenceField:context.absenceField}:value};
            } else if(context.scope===lexical.global&&['Class','FunctionDeclaration'].includes(statement.type))continue;
            else fail('unsupported statement '+statement.type);
        }
        return {returned:false,value:context.absentPresence?{...undef(),absentReturn:true,absenceField:context.absenceField}:undef()};
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
                value?.type==='Binary'&&['+','-','*','/','%','===','!==','<','>','<=','>='].includes(value.op)&&
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
        const proof={eligible:true,unsupported:[],flow,resultFlows};
        const methods=new Map();for(const cls of classes.values())for(const method of cls.methods)methods.set(method,{signature:structuredClone(signature(method)),resultFlow:resultFlows.get(method)?structuredClone(resultFlows.get(method)):null});
        completedResultProofs.set(proof,{program,source:JSON.stringify(program),methods});return proof;
    } catch(error) {errors.push(error.message);return {eligible:false,unsupported:errors,flow};}
}
