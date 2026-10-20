import {physicalUpdateSourceSnapshot} from './physical-update-source-snapshot.js';

// Optional ordinary-constraint entry proof. This does not expose Array/index
// facts: only physical reads dominated by a complete dense loop are returned.
export function proveDenseArrayLoopEntries(program,analyse){
    const snapshot=physicalUpdateSourceSnapshot(program);
    if(!snapshot||snapshot.objects.some(value=>Array.isArray(value)&&Reflect.ownKeys(value).some(key=>typeof Object.getOwnPropertyDescriptor(value,key).value==='function')))return null;
    const entries=new Map(),functions=new Set(),seen=new Set(),nodes=[];
    const metadata=new Set(['originalBody','parameterDefaults','paramTypes','typeParameters','returnType','assertedType','bwProcedureConstraintSource','optionalParams','parameterProperties','sourceReferenceDeclarations','sourceCallableDeclarations','sourceScalarDeclarations']);
    let valid=true,steps=0;
    const collect=value=>{
        if(!value||typeof value!=='object')return;
        if(seen.has(value)){valid=false;return;}seen.add(value);
        if(!Array.isArray(value))nodes.push(value);
        for(const key of Reflect.ownKeys(value))if(!metadata.has(key))collect(Object.getOwnPropertyDescriptor(value,key).value);
    };collect(program);
    if(!valid||!nodes.some(n=>n.type==='While'))return null;
    const graph=analyse();
    for(const node of nodes){
        if(node.type==='FunctionDeclaration')functions.add(node);
        // Unknown ambient effects, receiver reflection and deferred callbacks
        // cannot be hidden in an unused declaration either.
        if(['Class','FunctionExpression','Template','ForOf','For','ThrowStatement','Try','New'].includes(node.type))return null;
        if(node.type==='Call'&&node.callee?.type!=='Identifier'&&!(node.callee?.type==='Member'&&node.callee.name==='push'))return null;
        if(node.type==='Call'&&node.callee?.type==='Identifier'&&!graph.immutableFunctionAt(node))return null;
        const target=node.type==='Assignment'?node.left:node.type==='Update'?node.argument:node.type==='Unary'&&node.op==='delete'?node.argument:null;
        if(target&&target.type!=='Identifier')return null;
        if(node.type==='Member'&&!['length','push'].includes(node.name))return null;
    }
    const env=new Map(),active=new Set(),called=new Set(),protectedBindings=new Set();
    const unknown=()=>{valid=false;return null;};
    const binding=(node,name=node?.name)=>graph.bindingOf(node,name);
    const primitive=(kind,constant)=>({kind,...(constant!==undefined?{constant}:{})});
    const scalar=value=>value&&['Number','String','Boolean','Null','Undefined'].includes(value.kind);
    const number=value=>value?.kind==='Number'||value?.kind==='Length'||value?.kind==='Index';
    const tick=()=>{if(++steps>20000){valid=false;return false;}return valid;};
    const read=node=>{const key=binding(node);return key&&env.has(key)?env.get(key):unknown();};
    const write=(node,name,value)=>{
        const key=binding(node,name);
        if(!key||protectedBindings.has(key)||!value)return unknown();
        env.set(key,value);return value;
    };
    const plain=fn=>Array.isArray(fn.params)&&new Set(fn.params).size===fn.params.length&&!fn.optionalParams?.length&&!fn.parameterDefaults?.length&&!fn.typeParameters?.length&&!Object.keys(fn.paramDefaults||{}).length&&!fn.restParam;
    // Normalize only immutable one-return pure helpers using their actual
    // lexical parameters. Bodies with effects/defaults are never erased.
    const pure=node=>!!node&&(['Identifier','Number','String','Boolean','Null','Undefined'].includes(node.type)||node.type==='Unary'&&['+','-','~','!'].includes(node.op)&&pure(node.argument)||node.type==='Binary'&&['+','-','*','/','%','<','>','<=','>=','===','!==','==','!=','&','|','^','<<','>>','>>>'].includes(node.op)&&pure(node.left)&&pure(node.right));
    const expand=(node,sub=new Map(),stack=new Set())=>{
        if(!node||!tick())return null;
        if(node.type==='Parenthesized')return expand(node.expression,sub,stack);
        if(node.type==='Identifier')return sub.get(binding(node))||node;
        if(node.type==='Call'&&node.callee?.type==='Identifier'){
            const fn=graph.immutableFunctionAt(node);
            if(!fn||!plain(fn)||fn.body.length!==1||fn.body[0].type!=='Return'||!fn.body[0].value||node.args.length!==fn.params.length||stack.has(fn)||node.isNew||node.constructorCall||node.typeArguments?.length)return null;
            const replacements=new Map(sub),next=new Set(stack);next.add(fn);
            for(let i=0;i<fn.params.length;i++){const arg=expand(node.args[i],sub,stack);if(!pure(arg))return null;replacements.set(binding(fn.body[0].value,fn.params[i]),arg);}
            return expand(fn.body[0].value,replacements,next);
        }
        if(node.type==='Unary')return {...node,argument:expand(node.argument,sub,stack)};
        if(node.type==='Binary')return {...node,left:expand(node.left,sub,stack),right:expand(node.right,sub,stack)};
        return node;
    };
    const unwrap=node=>node?.type==='Unary'&&node.op==='+'?unwrap(node.argument):node;
    const closedNumber=node=>{if(node?.type==='Parenthesized')return closedNumber(node.expression);if(node?.type==='Number'&&Number.isFinite(Number(node.value)))return Number(node.value);if(node?.type==='Unary'&&node.op==='+')return closedNumber(node.argument);if(node?.type==='Binary'&&node.op==='+'){const a=closedNumber(node.left),b=closedNumber(node.right);return a!==null&&b!==null&&Number.isFinite(a+b)?a+b:null;}return null;};
    const numericLiteral=(node,value)=>closedNumber(node)===value;
    let currentLoop=null;
    const evaluate=node=>{
        if(!node||!tick())return unknown();
        if(node.type==='Parenthesized')return evaluate(node.expression);
        if(['Number','String','Boolean','Null','Undefined'].includes(node.type)){
            const value=node.type==='Number'?Number(node.value):node.type==='Boolean'?(node.value===true||node.value==='true'):node.type==='Null'?null:node.type==='Undefined'?undefined:node.value;
            return node.type==='Number'&&!Number.isFinite(value)?unknown():primitive(node.type,value);
        }
        if(node.type==='Identifier')return read(node);
        if(node.type==='Array'){
            if(!Array.isArray(node.items))return unknown();const items=[];
            for(let i=0;i<node.items.length;i++){const d=Object.getOwnPropertyDescriptor(node.items,String(i));if(!d||!Object.hasOwn(d,'value'))return unknown();const item=evaluate(d.value);if(!scalar(item))return unknown();items.push(item);}
            return {kind:'Array',items,site:node};
        }
        if(node.type==='Member'&&node.name==='length'){
            const receiver=evaluate(node.object);return receiver?.kind==='Array'?{kind:'Length',array:receiver,length:receiver.items.length}:unknown();
        }
        if(node.type==='Index'){
            const receiver=evaluate(node.object),index=evaluate(node.index);
            if(!currentLoop||receiver!==currentLoop.array||index?.kind!=='Index'||index.loop!==currentLoop||!receiver.items.length)return unknown();
            const types=new Set(receiver.items.map(item=>item.kind));
            if(types.size!==1)return unknown();const accumulated=entries.get(node)||new Set();for(const type of types)accumulated.add(type);entries.set(node,accumulated);return primitive([...types][0]);
        }
        if(node.type==='Unary'){
            const value=evaluate(node.argument);
            if(['+','-','~'].includes(node.op)&&number(value))return primitive('Number',node.op==='+'?value.constant:node.op==='-'&&value.constant!==undefined?-value.constant:undefined);
            if(node.op==='!'&&scalar(value))return primitive('Boolean');return unknown();
        }
        if(node.type==='Binary'){
            const left=evaluate(node.left),right=evaluate(node.right);
            if(number(left)&&number(right)){
                if(['<','>','<=','>=','===','!==','==','!='].includes(node.op))return primitive('Boolean');
                if(['+','-','*','/','%','&','|','^','<<','>>','>>>'].includes(node.op)){
                    const constant=node.op==='+'&&left.constant!==undefined&&right.constant!==undefined?left.constant+right.constant:undefined;
                    return primitive('Number',constant);
                }
            }
            if(node.op==='+'&&left?.kind==='String'&&right?.kind==='String')return primitive('String');return unknown();
        }
        if(node.type==='Assignment'){
            if(node.left?.type!=='Identifier')return unknown();let value=evaluate(node.right);
            if(node.op!=='='){const old=read(node.left);if(!number(old)||!number(value)||!['+=','-=','*=','/=','%='].includes(node.op))return unknown();value=primitive('Number');}
            return write(node.left,node.left.name,value);
        }
        if(node.type==='Update'){
            if(node.argument?.type!=='Identifier'||!['++','--'].includes(node.op)||!number(read(node.argument)))return unknown();return write(node.argument,node.argument.name,primitive('Number'));
        }
        if(node.type==='Call'){
            if(node.isNew||node.constructorCall||node.typeArguments?.length)return unknown();
            if(node.callee?.type==='Member'&&node.callee.name==='push'){
                const receiver=evaluate(node.callee.object);if(receiver?.kind!=='Array'||currentLoop||node.args.length!==1)return unknown();
                const value=evaluate(node.args[0]);if(!scalar(value))return unknown();receiver.items.push(value);return primitive('Number');
            }
            const fn=graph.immutableFunctionAt(node);if(!fn||!plain(fn)||node.args.length!==fn.params.length||active.has(fn))return unknown();
            const args=node.args.map(evaluate);if(args.some(value=>!scalar(value)))return unknown();called.add(fn);active.add(fn);
            const saved=[];for(let i=0;i<fn.params.length;i++){const key=binding(fn.body[0],fn.params[i]);if(!key){active.delete(fn);return unknown();}saved.push([key,env.has(key),env.get(key)]);env.set(key,args[i]);}
            const result=execute(fn.body);for(const[key,had,value]of saved)if(had)env.set(key,value);else env.delete(key);active.delete(fn);return result?.returned?result.value:primitive('Undefined');
        }
        return unknown();
    };
    const loop=node=>{
        if(currentLoop)return unknown();const test=expand(node.test);
        if(test?.type!=='Binary'||test.op!=='<'||test.left?.type!=='Identifier'||test.right?.type!=='Identifier')return unknown();
        const indexBinding=binding(test.left),boundBinding=binding(test.right),index=read(test.left),bound=read(test.right);
        if(index?.kind!=='Number'||index.constant!==0||bound?.kind!=='Length'||!Number.isInteger(bound.length)||bound.length<=0||bound.length>bound.array.items.length||!Array.isArray(node.body)||node.body.length<2)return unknown();
        const last=node.body.at(-1),assignment=last?.type==='ExpressionStatement'?last.expr:null,step=assignment?.type==='Assignment'&&assignment.op==='='?expand(assignment.right):null;
        if(assignment?.left?.type!=='Identifier'||binding(assignment.left)!==indexBinding||step?.type!=='Binary'||step.op!=='+'||!numericLiteral(step.right,1)||unwrap(step.left)?.type!=='Identifier'||binding(unwrap(step.left))!==indexBinding)return unknown();
        const context={array:bound.array,node},before=new Map(env),protectedNow=[];
        for(const[key,value]of env)if(value===context.array||key===indexBinding||key===boundBinding){protectedNow.push(key);protectedBindings.add(key);}
        env.set(indexBinding,{kind:'Index',loop:context});currentLoop=context;
        const result=execute(node.body.slice(0,-1));
        currentLoop=null;for(const key of protectedNow)protectedBindings.delete(key);
        if(result?.returned)return unknown();
        // One abstract body is sufficient only at an invariant backedge. An
        // Undefined-to-Number or Number-to-String write could change a later
        // iteration's input, and even publish a new Array after the loop. Do
        // not extrapolate a last iteration from the first one.
        for(const[key,value]of env){
            if(key===indexBinding)continue;
            if(!before.has(key))return unknown();
            const old=before.get(key);
            if(scalar(old)){if(!scalar(value)||value.kind!==old.kind)return unknown();}
            else if(value!==old)return unknown();
        }
        for(const[key,value]of env)if(key!==indexBinding&&scalar(value))env.set(key,primitive(value.kind));
        env.set(indexBinding,primitive('Number'));return null;
    };
    function execute(body){
        for(const statement of body||[]){
            if(!tick())return null;
            if(statement.type==='FunctionDeclaration')continue;
            if(statement.type==='Declaration'){
                for(const decl of statement.decls){const value=decl.init?evaluate(decl.init):primitive('Undefined');if(!write(statement,decl.name,value))return null;}continue;
            }
            if(statement.type==='ExpressionStatement'){evaluate(statement.expr);continue;}
            if(statement.type==='Return')return {returned:true,value:statement.value?evaluate(statement.value):primitive('Undefined')};
            if(statement.type==='While'){loop(statement);continue;}
            // Conditional/short circuit execution needs its own entry dominance
            // proof. Initial slice refuses rather than treating both as executed.
            unknown();return null;
        }
        return null;
    }
    execute(program.body);
    // Uncalled declarations may contain hidden writes or deferred effects. Pure
    // canonical scalar helpers are harmless; every other body must be observed.
    for(const fn of functions)if(!called.has(fn)&&!(plain(fn)&&fn.body.length===1&&fn.body[0].type==='Return'))valid=false;
    if(!valid||!entries.size||!snapshot.current())return null;
    let expired=false;
    return {entries,current(){if(!snapshot.current())expired=true;return !expired;}};
}
