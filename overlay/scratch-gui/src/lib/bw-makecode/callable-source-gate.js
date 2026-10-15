import {analyseCallableFlow} from './callable-flow.js';
import {analyseSourceValueProducers} from './source-value-producers.js';

// Source admission is narrower than the authoring/transport vocabulary. This
// gate reads actual lexical signatures and bodies; metadata cannot widen it.
export function callableSourceGate(program,{normalize=false}={}) {
    const flow=analyseCallableFlow(program);
    const expressions=flow.lexical.functions.filter(scope=>scope.node.type==='FunctionExpression');
    const factories=flow.lexical.functions.filter(scope=>flow.profiles.get(scope.node)?.result?.kind==='callable');
    if(!factories.length)return {eligible:false,unsupported:[]};
    let actual;
    const unsupported=[...flow.unsupported];
    const fail=message=>{if(!unsupported.includes(message))unsupported.push(message);};
    const number=type=>type?.kind==='named'&&type.name==='number';
    const zeroNumeric=type=>type?.kind==='callable'&&type.parameters.length===0&&number(type.result);
    const helpers=new Map();
    for(const scope of flow.lexical.functions) {
        const fn=scope.node,value=fn.body?.length===1&&fn.body[0].type==='Return'&&fn.body[0].value;
        if(fn.type!=='FunctionDeclaration'||scope.parent!==flow.lexical.global||fn.params.length!==2||new Set(fn.params).size!==2||
            value?.type!=='Binary'||!['+','-','*','/','%'].includes(value.op)||
            value.left?.type!=='Identifier'||value.right?.type!=='Identifier'||
            flow.lexical.references.get(value.left)!==scope.names.get(fn.params[0])||
            flow.lexical.references.get(value.right)!==scope.names.get(fn.params[1]))continue;
        const binding=flow.lexical.global.names.get(fn.name);
        if(binding?.node===fn)helpers.set(binding,{scope,calls:0});
    }
    const numericHelpers=new Set([...helpers.values()].map(helper=>helper.scope.node));
    actual=analyseSourceValueProducers(program,{numericHelpers,parenthesized:true,unboundIsOpaque:true});
    const actualNumber=types=>types.size===1&&types.has('Number');
    const plainCall=node=>node?.type==='Call'&&!node.isNew&&!node.constructorCall&&!Object.hasOwn(node,'typeArguments');
    const numericExpression=node=>{
        if(!node)return false;
        if(node.type==='Parenthesized')return numericExpression(node.expression);
        if(node.type==='Number')return true;
        if(node.type==='Identifier') {
            const binding=flow.lexical.references.get(node),owner=flow.lexical.scopes.get(node)?.functionOwner;
            // Only the existing factory/Arrow initialization witness can
            // discharge captured entry. Globals retain occurrence Undefined.
            const captured=factories.includes(binding?.functionOwner)&&
                (owner===binding.functionOwner||owner?.parent===binding.functionOwner);
            const types=captured?actual.bindingTypesAt(node):actual.typesAt(node);
            // A factory's explicit undefined local initializer is discharged
            // only by statements()'s dominating assignment/capture check.
            const numericBinding=types.has('Number')&&[...types].every(type=>type==='Number'||type==='Undefined');
            return number(flow.bindingTypes.get(binding))&&(captured?numericBinding:actualNumber(types));
        }
        if(node.type==='Call'&&node.callee?.type==='Identifier') {
            const helper=helpers.get(flow.lexical.references.get(node.callee));
            return !!helper&&plainCall(node)&&node.args.length===2&&node.args.every(numericExpression);
        }
        if(node.type==='Binary')return ['+','-','*','/','%'].includes(node.op)&&numericExpression(node.left)&&numericExpression(node.right);
        return false;
    };
    const inspectHelpers=(node,parent,key)=>{
        if(!node||typeof node!=='object')return;
        if(Array.isArray(node)){node.forEach(value=>inspectHelpers(value,parent,key));return;}
        if(node.type==='Identifier') {
            const helper=helpers.get(flow.lexical.references.get(node));
            if(helper) {
                if(!plainCall(parent)||key!=='callee'||parent.args.length!==2)
                    fail('Callable source gate requires concrete numeric operands at every operator helper use');
                else helper.calls++;
            }
        }
        for(const [childKey,value]of Object.entries(node))if(!['originalBody','parameterDefaults'].includes(childKey)&&value&&typeof value==='object')inspectHelpers(value,node,childKey);
    };
    inspectHelpers(program.body);
    const factoryBindings=new Map();
    for(const factory of factories) {
        const binding=flow.lexical.global.names.get(factory.node.name);
        if(binding?.node!==factory.node||actual.immutableFunctionAt(factory.node)!==factory.node)
            fail('Callable source gate requires one unchanged lexical factory declaration');
        if(binding)factoryBindings.set(binding,factory);
    }
    const inspectFactoryCalls=(node,parent,key)=>{
        if(!node||typeof node!=='object')return;
        if(Array.isArray(node)){node.forEach(value=>inspectFactoryCalls(value,parent,key));return;}
        if(node.type==='Identifier') {
            const factory=factoryBindings.get(flow.lexical.references.get(node));
            if(factory&&(!plainCall(parent)||key!=='callee'||
                actual.immutableFunctionAt(parent)!==factory.node||
                parent.args.length!==factory.node.params.length||
                !parent.args.every(arg=>numericExpression(arg)&&actualNumber(actual.typesAt(arg)))))
                fail('Callable source gate requires every factory call to provide concrete numeric operands from a direct unchanged declaration');
        }
        for(const [childKey,value]of Object.entries(node))if(!['originalBody','parameterDefaults'].includes(childKey)&&value&&typeof value==='object')inspectFactoryCalls(value,node,childKey);
    };
    inspectFactoryCalls(program.body);
    const statements=(body,closure,scope)=>{
        const initialized=new Set(scope.node.params.map(name=>scope.names.get(name)));
        const initializedExpression=node=>numericExpression(node)&&(()=>{
            if(node.type==='Identifier')return initialized.has(flow.lexical.references.get(node));
            if(node.type==='Number')return true;
            if(node.type==='Binary')return initializedExpression(node.left)&&initializedExpression(node.right);
            if(node.type==='Call')return node.args.every(initializedExpression);
            if(node.type==='Parenthesized')return initializedExpression(node.expression);
            return false;
        })();
        for(const statement of body || []) {
            if(statement.type==='Declaration') {
                if(closure||statement.kind!=='let')fail('Callable source gate requires numeric let cells in the factory');
                for(const row of statement.decls) {
                    const binding=scope.names.get(row.name);
                    if(actual.declarationCountAt(statement,row.name)!==1)
                        fail('Callable source gate requires unique lexical numeric cell declarations');
                    if(initializedExpression(row.init))initialized.add(binding);
                    else if(row.typeName!=='number'||(row.init&&row.init.type!=='Undefined'))
                        fail('Callable source gate requires a numeric initializer or typed undefined numeric local');
                }
            } else if(statement.type==='Return') {
                if(closure?!numericExpression(statement.value):statement.value?.type!=='FunctionExpression')
                    fail('Callable source gate requires a direct captured Arrow return and numeric closure result');
                if(!closure&&statement.value?.type==='FunctionExpression') {
                    const child=flow.lexical.functions.find(value=>value.node===statement.value);
                    if(child?.captureSpecifications.some(row=>!initialized.has(row.binding)))
                        fail('Callable source gate requires numeric initialization dominating every capture');
                }
            } else if(statement.type==='ExpressionStatement') {
                const expression=statement.expr;
                if(expression?.type!=='Assignment'||!(closure?['=','+=','-=','*=','/=','%=']:['=']).includes(expression.op)||
                    expression.left?.type!=='Identifier'||!numericExpression(expression.left)||
                    !(closure?numericExpression(expression.right):initializedExpression(expression.right)))
                    fail('Callable source gate requires straight-line numeric capture assignments');
                else if(!closure)initialized.add(flow.lexical.references.get(expression.left));
            } else fail('Callable source gate does not admit control flow or nested declarations');
        }
        if(body?.at(-1)?.type!=='Return')fail('Callable source gate requires an explicit final return');
    };
    for(const scope of flow.lexical.functions) {
        const node=scope.node,profile=flow.profiles.get(node);
        const helper=helpers.get(flow.lexical.global.names.get(node.name));
        if(helper?.scope===scope&&helper.calls>0&&!node.optionalParams?.length&&!node.parameterDefaults?.length&&!node.typeParameters?.length)continue;
        if(new Set(node.params).size!==node.params.length)fail('Callable source gate requires unique lexical parameter bindings');
        if(node.optionalParams?.length||node.parameterDefaults?.length||node.typeParameters?.length)
            fail('Callable source gate does not admit defaults, optional parameters or generics');
        if(node.type==='FunctionDeclaration') {
            if(scope.parent!==flow.lexical.global||!zeroNumeric(profile?.result)||!profile.parameters.every(row=>number(row.type)))
                fail('Callable source gate requires a module numeric factory returning a zero-argument numeric closure');
            statements(node.body,false,scope);
        } else {
            if(node.functionKind!=='arrow'||node.params.length||!number(profile?.result)||!factories.includes(scope.parent))
                fail('Callable source gate requires a zero-argument Arrow owned by its numeric factory');
            if(!scope.captureSpecifications.length||scope.captureSpecifications.some(row=>row.mode!=='cell'||
                row.binding.kind!=='local'||row.binding.scope!==scope.parent||!number(flow.bindingTypes.get(row.binding))))
                fail('Callable source gate requires mutable numeric local capture cells');
            statements(node.body,true,scope);
        }
    }
    if(!expressions.length)fail('Callable source gate requires an actual captured Arrow expression');
    if(!unsupported.length) {
        // The preceding gate proves the actual Arrow bodies/capture initialization
        // and every immutable factory call. Only then can their actual invocation
        // results participate in outer operator helper operand proofs.
        actual=analyseSourceValueProducers(program,{numericArrows:new Set(expressions.map(scope=>scope.node)),numericHelpers,parenthesized:true,unboundIsOpaque:true});
        const checkHelperOperands=(node,parent,key)=>{
            if(!node||typeof node!=='object')return;
            if(Array.isArray(node)){node.forEach(value=>checkHelperOperands(value,parent,key));return;}
            if(node.type==='Declaration')for(const row of node.decls) {
                const binding=flow.lexical.scopes.get(node)?.names.get(row.name),types=actual.bindingTypesAt(node,row.name);
                if((zeroNumeric(flow.bindingTypes.get(binding))||types.has('NumericCallable'))&&
                    (!types.has('NumericCallable')||[...types].some(type=>type!=='NumericCallable'&&type!=='Undefined')))
                    fail('Callable source gate requires compatible actual writers for every numeric callback cell');
            }
            if(node.type==='Identifier'&&!(parent?.type==='Assignment'&&key==='left')) {
                const binding=flow.lexical.references.get(node),types=actual.bindingTypesAt(node);
                if((zeroNumeric(flow.bindingTypes.get(binding))||types.has('NumericCallable'))&&
                    (!actual.isInitializedAt(node)||actual.typesAt(node).size!==1||!actual.typesAt(node).has('NumericCallable')))
                    fail('Callable source gate requires initialization dominating every numeric callback read');
            }
            if(node.type==='Call'&&zeroNumeric(flow.expressionTypes.get(node.callee))&&
                (!plainCall(node)||node.args.length||actual.typesAt(node.callee).size!==1||!actual.typesAt(node.callee).has('NumericCallable')))
                fail('Callable source gate requires actual initialized numeric callback producers at every invocation');
            if(node.type==='Call'&&node.callee?.type==='Identifier'&&helpers.has(flow.lexical.references.get(node.callee))&&
                !node.args.every(numericExpression))
                fail('Callable source gate requires concrete numeric operands at every operator helper use');
            for(const [key,value]of Object.entries(node))if(!['originalBody','parameterDefaults'].includes(key)&&value&&typeof value==='object')checkHelperOperands(value,node,key);
        };
        checkHelperOperands(program.body);
    }
    const result={eligible:unsupported.length===0,unsupported};
    if(normalize&&result.eligible) {
        const rewrite=node=>{
            if(!node||typeof node!=='object')return node;
            if(Array.isArray(node))return node.map(rewrite);
            if(node.type==='Call'&&node.callee?.type==='Identifier'&&helpers.has(flow.lexical.references.get(node.callee))) {
                const helper=helpers.get(flow.lexical.references.get(node.callee));
                return {type:'Binary',op:helper.scope.node.body[0].value.op,left:rewrite(node.args[0]),right:rewrite(node.args[1])};
            }
            return Object.fromEntries(Object.entries(node).map(([key,value])=>[key,
                ['originalBody','paramTypes','parameterDefaults'].includes(key)?value:rewrite(value)]));
        };
        result.program=rewrite({...program,body:program.body.filter(node=>
            ![...helpers.values()].some(helper=>helper.scope.node===node&&helper.calls>0))});
    }
    return result;
}
