import {analyseCallableFlow} from './callable-flow.js';

// Source admission is narrower than the authoring/transport vocabulary. This
// gate reads actual lexical signatures and bodies; metadata cannot widen it.
export function callableSourceGate(program,{normalize=false}={}) {
    const flow=analyseCallableFlow(program);
    const expressions=flow.lexical.functions.filter(scope=>scope.node.type==='FunctionExpression');
    const factories=flow.lexical.functions.filter(scope=>flow.profiles.get(scope.node)?.result?.kind==='callable');
    if(!factories.length)return {eligible:false,unsupported:[]};
    const unsupported=[...flow.unsupported];
    const fail=message=>{if(!unsupported.includes(message))unsupported.push(message);};
    const number=type=>type?.kind==='named'&&type.name==='number';
    const zeroNumeric=type=>type?.kind==='callable'&&type.parameters.length===0&&number(type.result);
    const helpers=new Map();
    for(const scope of flow.lexical.functions) {
        const fn=scope.node,value=fn.body?.length===1&&fn.body[0].type==='Return'&&fn.body[0].value;
        if(fn.type!=='FunctionDeclaration'||scope.parent!==flow.lexical.global||fn.params.length!==2||
            value?.type!=='Binary'||!['+','-','*','/','%'].includes(value.op)||
            value.left?.type!=='Identifier'||value.right?.type!=='Identifier'||
            flow.lexical.references.get(value.left)!==scope.names.get(fn.params[0])||
            flow.lexical.references.get(value.right)!==scope.names.get(fn.params[1]))continue;
        const binding=flow.lexical.global.names.get(fn.name);
        if(binding?.node===fn)helpers.set(binding,{scope,calls:0});
    }
    const numericExpression=node=>{
        if(!node)return false;
        if(node.type==='Parenthesized')return numericExpression(node.expression);
        if(node.type==='Number')return true;
        if(node.type==='Identifier')return number(flow.bindingTypes.get(flow.lexical.references.get(node)));
        if(node.type==='Call'&&node.callee?.type==='Identifier') {
            const helper=helpers.get(flow.lexical.references.get(node.callee));
            return !!helper&&node.args.length===2&&node.args.every(numericExpression);
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
                if(parent?.type!=='Call'||key!=='callee'||parent.args.length!==2||!parent.args.every(numericExpression))
                    fail('Callable source gate requires concrete numeric operands at every operator helper use');
                else helper.calls++;
            }
        }
        for(const [childKey,value]of Object.entries(node))if(!['originalBody','parameterDefaults'].includes(childKey)&&value&&typeof value==='object')inspectHelpers(value,node,childKey);
    };
    inspectHelpers(program.body);
    const inspectFactoryCalls=node=>{
        if(!node||typeof node!=='object')return;
        if(Array.isArray(node)){node.forEach(inspectFactoryCalls);return;}
        if(node.type==='Call'&&node.callee?.type==='Identifier') {
            const binding=flow.lexical.references.get(node.callee);
            const factory=factories.find(scope=>scope.node===binding?.node);
            if(factory&&(node.isNew||node.args.length!==factory.node.params.length||!node.args.every(numericExpression)))
                fail('Callable source gate requires every factory call to provide concrete numeric operands');
        }
        for(const [key,value]of Object.entries(node))if(!['originalBody','parameterDefaults'].includes(key)&&value&&typeof value==='object')inspectFactoryCalls(value);
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
