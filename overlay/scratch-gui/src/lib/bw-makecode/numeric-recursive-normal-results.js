import {analyseCallableBindings} from './callable-bindings.js';
import {inspectGeneratedHelperBindings} from './generated-helper-recognition.js';
import {inspectNativeArrayAddHelpers} from './native-array-binary-helper-source.js';

// A private partial-correctness proof. The ordinary graph deliberately keeps
// cyclic results Opaque. This proof neither executes nor proves termination of
// recursion, and never changes an input, binding, capture or initialized cell.
export function numericRecursiveNormalResults(program,profile) {
    const empty=()=>Object.freeze({current:()=>false,has:()=>false});
    const slots=['type','kind','functionKind','whenUsed','name','body','params','decls','init','expr','value','op','callee','args',
        'left','right','argument','expression','test','consequent','alternate','prefix','isNew','constructorCall',
        'typeArguments','parameterDefaults','optionalParams','ordinaryParameterDefaultNames','parameterProperties',
        'typeParameters','genericParams','parameterDefaultPrologue','restParam','async','generator','isAsync','isGenerator','parenthesized'];
    const expressions=new Set(['Identifier','Number','Boolean','Parenthesized','Unary','Binary','Assignment','Update','Call']);
    const rows=[],seen=new WeakSet(),active=new WeakSet();
    const own=(value,key)=>{
        const d=value&&typeof value==='object'?Object.getOwnPropertyDescriptor(value,key):null;
        return d&&Object.hasOwn(d,'value')?d.value:undefined;
    };
    // This construction-time snapshot precedes every NEW shared traversal.
    // Hidden parameter metadata is retained before any consumer clone/map.
    const capture=(value,prefix=false)=>{
        if(typeof value==='function')return prefix;
        if(!value||typeof value!=='object')return true;
        if(active.has(value)||rows.length>=20000)return false;
        if(seen.has(value))return true;
        const proto=Object.getPrototypeOf(value);
        if(proto!==Object.prototype&&proto!==Array.prototype&&proto!==null)return false;
        const keys=Reflect.ownKeys(value),descriptors=[];
        for(const key of keys){
            const d=Object.getOwnPropertyDescriptor(value,key);
            if(typeof key!=='string'||!d||!Object.hasOwn(d,'value'))return false;
            descriptors.push(d);
        }
        const absent=slots.filter(key=>!Object.hasOwn(value,key));
        if(absent.some(key=>key in value))return false;
        if(Array.isArray(value)){
            if(Object.hasOwn(value,'parenthesized'))return false;
            const length=own(value,'length');if(!Number.isSafeInteger(length)||length>10000)return false;
            for(let i=0;i<length;i++)if(!Object.hasOwn(value,String(i)))return false;
        }
        seen.add(value);active.add(value);rows.push({value,proto,keys,descriptors,absent});
        for(let i=0;i<keys.length;i++){
            const key=keys[i],child=descriptors[i].value;
            if(value===program&&key==='bwProcedureConstraintSource'){
                if(!child||typeof child!=='object'||Reflect.ownKeys(child).length!==1||
                    !Object.hasOwn(child,'prefix')||typeof own(child,'prefix')!=='function'||!capture(child,true))return false;
            }else if(!capture(child,prefix&&key==='prefix'))return false;
        }
        active.delete(value);return true;
    };
    let syntax,native,lexical,live=true,eligible=false;
    const results=new WeakSet();
    const current=()=>{
        if(live)try{
            for(const r of rows){
                const keys=Reflect.ownKeys(r.value);
                if(Object.getPrototypeOf(r.value)!==r.proto||keys.length!==r.keys.length||keys.some((key,i)=>key!==r.keys[i])||
                    r.absent.some(key=>Object.hasOwn(r.value,key)||key in r.value)){live=false;break;}
                for(let i=0;i<keys.length;i++){
                    const a=Object.getOwnPropertyDescriptor(r.value,keys[i]),b=r.descriptors[i];
                    if(!a||!Object.hasOwn(a,'value')||!Object.is(a.value,b.value)||a.writable!==b.writable||
                        a.enumerable!==b.enumerable||a.configurable!==b.configurable){live=false;break;}
                }
                if(!live)break;
            }
            if(live&&syntax&&!syntax.isCurrent()||live&&native&&!native.current())live=false;
        }catch{live=false;}
        return live;
    };
    const answer=()=>Object.freeze({current,has:node=>eligible&&results.has(node)&&current()});
    try{
        if(!capture(program))return empty();
        syntax=inspectGeneratedHelperBindings(program,profile);
        if(!syntax.isCurrent())return empty();
        native=inspectNativeArrayAddHelpers(program,profile);
        lexical=analyseCallableBindings(program);
        if(!current())return answer();
        const fail=()=>{throw new Error('closed recursive Number source refused');};
        const list=value=>Array.isArray(value)&&Number.isSafeInteger(own(value,'length'))&&own(value,'length')<=10000;
        const metadata=new Set(['paramTypes','returnType','assertedType','typeName','isArray','originalBody',
            'bwProcedureConstraintSource','sourceReferenceDeclarations','sourceCallableDeclarations','sourceScalarDeclarations']);
        const keys=(node,allowed)=>{
            if(!node||typeof node!=='object'||Array.isArray(node))fail();
            for(const key of Reflect.ownKeys(node)){
                // This is the parser's grouping marker, not a domain tag.
                // The actual expression tree, operands and effects still run
                // through the same grammar and Number obligations below.
                if(key==='parenthesized'){
                    if(!expressions.has(node.type)||own(node,key)!==true)fail();
                }else if(!allowed.includes(key)&&!metadata.has(key))fail();
            }
        };
        const noDefaults=fn=>{
            if(!list(fn.params)||fn.params.some(name=>typeof name!=='string'||!/^[A-Za-z_$][\w$]*$/.test(name)||['this','arguments'].includes(name))||new Set(fn.params).size!==fn.params.length)return false;
            for(const value of [fn,fn.params]){
                for(const key of ['parameterDefaults','optionalParams','ordinaryParameterDefaultNames','parameterProperties','typeParameters','genericParams'])
                    if(Object.hasOwn(value,key)&&(!list(own(value,key))||own(value,key).length))return false;
                if(Object.hasOwn(value,'restParam'))return false;
            }
            return ['async','generator','isAsync','isGenerator'].every(key=>!Object.hasOwn(fn,key)||own(fn,key)===false)&&
                (!Object.hasOwn(fn,'functionKind')||fn.functionKind==='declaration')&&
                (!Object.hasOwn(fn,'parameterDefaultPrologue')||typeof fn.parameterDefaultPrologue==='boolean');
        };
        const helperDefinitions=new Set([...native.helpers.values()].map(record=>record.declaration)),nativeCalls=new Set();
        for(const record of native.helpers.values())for(const call of record.calls)nativeCalls.add(call);
        // Emission preserves comparisons as ordinary Boolean-return helpers.
        // Their complete body and every reference must be closed independently
        // of the Number-return SCC. Actual arguments are still evaluated below;
        // only Number arguments can establish their Boolean result contract.
        const comparisons=new Set(['<','<=','>','>=','==','===','!=','!==']),comparisonCalls=new Set();
        for(const fn of program.body||[]){
            if(fn?.type!=='FunctionDeclaration'||!list(fn.body)||fn.body.length!==1||
                fn.body[0]?.type!=='Return'||!noDefaults(fn)||fn.params.length!==2||fn.params.includes(fn.name))continue;
            const value=fn.body[0].value;
            if(value?.type!=='Binary'||!comparisons.has(value.op)||!syntax.root(fn))continue;
            const name='__bwNumericComparison',[left,right]=fn.params,names=new Map([[fn.name,name]]);
            if(!syntax.matches(fn,`function ${name}(${left}: any, ${right}: any): boolean { return ${left} ${value.op} ${right} }`,names))continue;
            const sites=syntax.calls(fn,[2],new Set([fn]));
            if(!sites?.length)continue;
            helperDefinitions.add(fn);for(const call of sites)comparisonCalls.add(call);
        }
        const records=new Map(),byNode=new Map(),aliases=new Map(),constants=new Set(),declared=new Set(),used=new WeakSet();
        const binding=node=>lexical.references.get(node);
        const local=(node,name)=>lexical.scopes.get(node)?.names.get(name);
        const unwrap=node=>node?.type==='Parenthesized'?unwrap(node.expression):node;
        const plainCall=node=>node.type==='Call'&&list(node.args)&&
            ['isNew','constructorCall'].every(key=>!Object.hasOwn(node,key)||own(node,key)===false)&&
            !Object.hasOwn(node,'typeArguments')&&!node.args.some(arg=>arg?.type==='Spread');
        const privateTags=['nativeArrayDomainCall','nativeArrayDomainNormalCall','nativeClosureDomainNormalCall',
            'nativeImageDomainNormalCall','nativeRecursiveSourceCall','nativeRecursiveDomainNormalCall','bwNativeNamedArray'];
        if(syntax.nodes.some(node=>privateTags.some(key=>Object.hasOwn(node,key))))return answer();
        keys(program,['type','body']);if(program.type!=='Program'||!list(program.body))return answer();
        for(const fn of program.body){
            if(fn.type!=='FunctionDeclaration')continue;
            keys(fn,['type','name','params','body','typeParameters','functionKind','parameterDefaults',
                'parameterDefaultPrologue','optionalParams','ordinaryParameterDefaultNames','async','generator','isAsync','isGenerator']);
            if(!list(fn.body)||!noDefaults(fn))fail();
            if(helperDefinitions.has(fn))continue;
            const scope=lexical.functions.find(scope=>scope.node===fn),key=lexical.global.names.get(fn.name);
            if(records.size>=512||!scope||scope.parent!==lexical.global||scope.unsupported?.length||!syntax.root(fn)||key?.node!==fn)fail();
            const record={node:fn,key,scope,edges:new Set(),calls:new Set(),requiredAliases:new Set(),returns:[],reached:false,ready:null,launcher:false};
            records.set(key,record);byNode.set(fn,record);
        }
        if(!records.size)return answer();
        // Root aliases have exactly one declaration initializer and no later
        // writer. Actual entry readiness is checked separately from identity.
        for(const statement of program.body)if(statement.type==='Declaration'){
            if(!list(statement.decls))fail();
            for(const decl of statement.decls){
                const init=unwrap(decl.init);
                if(init?.type!=='Identifier')continue;
                const key=local(statement,decl.name);
                if(!key||key.node!==decl||key.written||!['let','const'].includes(statement.kind))continue;
                aliases.set(key,{init,target:null,resolving:false});
            }
        }
        const resolve=key=>{
            if(records.has(key))return records.get(key);
            const alias=aliases.get(key);if(!alias)return null;
            if(alias.resolving)fail();if(alias.target)return alias.target;
            alias.resolving=true;const target=resolve(binding(alias.init));alias.resolving=false;
            if(target)alias.target=target;return target;
        };
        for(const [key,alias]of [...aliases])if(!resolve(key))aliases.delete(key);
        const allCalls=new Map(),allDeclarations=[];
        // Semantic grammar is checked only AFTER exact canonical native helper
        // recognition. Their actual argument sites remain in the census.
        const walk=(node,owner,depth=0)=>{
            if(!node||typeof node!=='object'||depth>128)fail();
            if(Array.isArray(node)){if(!list(node))fail();for(const child of node)walk(child,owner,depth+1);return;}
            const type=node.type;
            if(type==='FunctionDeclaration'){
                if(helperDefinitions.has(node))return;
                const record=byNode.get(node);if(!record||owner)fail();walk(node.body,record,depth+1);return;
            }
            if(type==='Declaration'){
                keys(node,['type','kind','decls']);if(!['let','const'].includes(node.kind)||!list(node.decls))fail();
                for(const decl of node.decls){
                    keys(decl,['name','init','whenUsed']);if(typeof decl.name!=='string'||!/^[A-Za-z_$][\w$]*$/.test(decl.name)||!Object.hasOwn(decl,'init')||decl.whenUsed)fail();
                    const key=local(node,decl.name);if(!key||key.node!==decl||declared.has(key))fail();
                    declared.add(key);allDeclarations.push({node,decl,key,owner});if(node.kind==='const')constants.add(key);
                    if(decl.init!==null)walk(decl.init,owner,depth+1);
                }return;
            }
            if(type==='ExpressionStatement'){keys(node,['type','expr']);walk(node.expr,owner,depth+1);return;}
            if(type==='Block'){keys(node,['type','body']);walk(node.body,owner,depth+1);return;}
            if(type==='If'){
                keys(node,['type','test','consequent','alternate']);walk(node.test,owner,depth+1);
                walk(node.consequent,owner,depth+1);if(node.alternate!==null)walk(node.alternate,owner,depth+1);return;
            }
            if(type==='Return'){keys(node,['type','value']);if(!owner||!Object.hasOwn(node,'value'))fail();if(node.value!==null)walk(node.value,owner,depth+1);return;}
            if(type==='Identifier'){keys(node,['type','name']);if(typeof node.name!=='string'||!binding(node))fail();return;}
            if(type==='Number'){keys(node,['type','value']);if(typeof node.value!=='string'||!/^(?:0[xX][\da-fA-F]+|0[bB][01]+|0[oO][0-7]+|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)$/.test(node.value))fail();return;}
            if(type==='Boolean'){keys(node,['type','value']);if(typeof node.value!=='boolean')fail();return;}
            if(type==='Parenthesized'){keys(node,['type','expression']);walk(node.expression,owner,depth+1);return;}
            if(type==='Unary'){keys(node,['type','op','argument']);if(!['+','-','~','!'].includes(node.op))fail();walk(node.argument,owner,depth+1);return;}
            if(type==='Binary'){
                keys(node,['type','op','left','right']);if(!['+','-','*','/','%','**','&','|','^','<<','>>','>>>','<','<=','>','>=','==','===','!=','!=='].includes(node.op))fail();
                walk(node.left,owner,depth+1);walk(node.right,owner,depth+1);return;
            }
            if(type==='Assignment'){
                keys(node,['type','op','left','right']);if(!['=','+=','-=','*=','/=','%=','&=','|=','^=','<<=','>>=','>>>='].includes(node.op)||node.left?.type!=='Identifier')fail();
                walk(node.left,owner,depth+1);walk(node.right,owner,depth+1);return;
            }
            if(type==='Update'){
                keys(node,['type','op','prefix','argument']);if(!['++','--'].includes(node.op)||typeof node.prefix!=='boolean'||node.argument?.type!=='Identifier')fail();
                walk(node.argument,owner,depth+1);return;
            }
            if(type==='Call'){
                keys(node,['type','callee','args','isNew','constructorCall','typeArguments']);if(!plainCall(node)||allCalls.has(node)||allCalls.size>=10000)fail();
                const callee=unwrap(node.callee);if(callee?.type!=='Identifier')fail();
                const comparison=comparisonCalls.has(node),target=nativeCalls.has(node)||comparison?null:resolve(binding(callee));
                if(!nativeCalls.has(node)&&!comparison&&!target)fail();
                if(node.args.length!==(target?target.node.params.length:2))fail();
                allCalls.set(node,{owner,target,callee,comparison});if(owner&&target){owner.edges.add(target);owner.calls.add(node);}
                walk(node.callee,owner,depth+1);walk(node.args,owner,depth+1);return;
            }
            fail();
        };
        walk(program.body,null);
        // A launcher is not a numeric function. Its complete immutable direct
        // root entry, zero arity and acyclic body are checked without a name grant.
        for(const record of records.values()){
            let valueReturn=false;
            const returns=body=>{for(const st of body){if(st.type==='Return'&&st.value!==null)valueReturn=true;
                if(st.type==='If'){returns(st.consequent);if(st.alternate)returns(st.alternate);}if(st.type==='Block')returns(st.body);}};
            returns(record.node.body);
            if(!valueReturn){
                const calls=[...allCalls].filter(([,entry])=>entry.target===record);
                if(record.node.params.length||calls.length!==1||calls[0][1].owner||
                    syntax.parentOf(calls[0][0])?.type!=='ExpressionStatement'||[...aliases.values()].some(alias=>alias.target===record))fail();
                record.launcher=true;
            }
        }
        if([...records.values()].some(record=>record.launcher&&[...allCalls.values()].some(entry=>entry.owner&&entry.target===record)))fail();
        const union=(...sets)=>new Set(sets.flatMap(set=>[...set]));
        const num=(deps=new Set())=>({kind:'Number',deps});
        const usedCallResults=new Set(),entries=[],activeAliases=new Set();
        const activateAlias=key=>{if(!aliases.has(key)||activeAliases.has(key))return;activeAliases.add(key);activateAlias(binding(aliases.get(key).init));};
        const use=node=>{used.add(node);return binding(node);};
        const evaluate=(node,state,context)=>{
            if(node.type==='Number')return num();
            if(node.type==='Boolean')return {kind:'Boolean',deps:new Set()};
            if(node.type==='Parenthesized')return evaluate(node.expression,state,context);
            if(node.type==='Identifier'){
                const key=use(node),value=state.get(key);
                if(!value||value.kind!=='Number'||context.record&&!context.record.launcher&&key.functionOwner!==context.record.scope)fail();
                return value;
            }
            if(node.type==='Unary'){
                const value=evaluate(node.argument,state,context);
                if(node.op!=='!'&&value.kind!=='Number')fail();return {kind:node.op==='!'?'Boolean':'Number',deps:value.deps};
            }
            if(node.type==='Binary'){
                const left=evaluate(node.left,state,context),right=evaluate(node.right,state,context);
                if(left.kind!=='Number'||right.kind!=='Number')fail();
                return {kind:['<','<=','>','>=','==','===','!=','!=='].includes(node.op)?'Boolean':'Number',deps:union(left.deps,right.deps)};
            }
            if(node.type==='Call'){
                const call=allCalls.get(node);if(!call||call.target?.launcher)fail();
                const key=use(call.callee),alias=aliases.get(key);
                if(alias){
                    activateAlias(key);
                    if(context.record&&!context.record.launcher)context.record.requiredAliases.add(key);
                    else if(!context.ready.has(key))fail();
                }
                const values=node.args.map(arg=>evaluate(arg,state,context));if(values.some(value=>value.kind!=='Number'))fail();
                const deps=union(...values.map(value=>value.deps));
                if(call.target){
                    deps.add(call.target);usedCallResults.add(node);
                    if(!context.record||context.record.launcher)entries.push({target:call.target,ready:new Set(context.ready)});
                }
                context.prefix=union(context.prefix,deps);
                return call.comparison?{kind:'Boolean',deps}:num(deps);
            }
            fail();
        };
        const condition=(node,state,context)=>{const value=evaluate(node,state,context);if(!['Number','Boolean'].includes(value.kind))fail();};
        const write=(expr,state,context)=>{
            const left=expr.type==='Update'?expr.argument:expr.left,key=use(left);
            if((!declared.has(key)&&key?.kind!=='parameter')||!context.declarations.has(key)||constants.has(key)||
                context.record&&!context.record.launcher&&key.functionOwner!==context.record.scope||
                context.record?.launcher&&key.functionOwner!==context.record.scope&&key.functionOwner!==lexical.global)fail();
            if(expr.type==='Update'||expr.op!=='=')if(state.get(key)?.kind!=='Number')fail();
            const value=expr.type==='Update'?state.get(key):evaluate(expr.right,state,context);
            if(value?.kind!=='Number')fail();state.set(key,num(union(expr.op==='='?new Set():state.get(key)?.deps||new Set(),value.deps)));
        };
        const sequence=(body,state,context)=>{
            for(const st of body){
                if(st.type==='FunctionDeclaration')continue;
                if(st.type==='Declaration'){
                    for(const decl of st.decls){
                        const key=local(st,decl.name),alias=aliases.get(key);context.declarations.add(key);
                        if(alias){
                            if(context.record||!decl.init)fail();
                            const origin=unwrap(decl.init),originKey=use(origin);
                            if(aliases.has(originKey)&&!context.ready.has(originKey))fail();
                            context.ready.add(key);continue;
                        }
                        if(decl.init===null){if(st.kind==='const')fail();state.delete(key);}
                        else{const value=evaluate(decl.init,state,context);if(value.kind!=='Number')fail();state.set(key,value);}
                    }
                }else if(st.type==='ExpressionStatement'){
                    if(['Assignment','Update'].includes(st.expr.type))write(st.expr,state,context);
                    else if(st.expr.type==='Call'&&allCalls.get(st.expr)?.target?.launcher){
                        const call=allCalls.get(st.expr);if(context.record)fail();use(call.callee);
                        const child={record:call.target,ready:new Set(context.ready),prefix:new Set(context.prefix),declarations:new Set(context.declarations)};
                        sequence(call.target.node.body,state,child);context.prefix=child.prefix;
                    }else evaluate(st.expr,state,context);
                }else if(st.type==='Block'){
                    if(sequence(st.body,state,context))return true;
                }else if(st.type==='If'){
                    condition(st.test,state,context);
                    const a=new Map(state),b=new Map(state),ca={...context,ready:new Set(context.ready),prefix:new Set(context.prefix),declarations:new Set(context.declarations)},cb={...context,ready:new Set(context.ready),prefix:new Set(context.prefix),declarations:new Set(context.declarations)};
                    const ar=sequence(st.consequent,a,ca),br=st.alternate?sequence(st.alternate,b,cb):false;
                    if(ar&&br)return true;
                    const continuations=ar?[[b,cb]]:br?[[a,ca]]:[[a,ca],[b,cb]];
                    state.clear();for(const [key,value]of continuations[0][0])if(continuations.every(([s])=>s.get(key)?.kind==='Number'))
                        state.set(key,num(union(...continuations.map(([s])=>s.get(key).deps))));
                    context.prefix=union(...continuations.map(([,c])=>c.prefix));
                    context.declarations=new Set([...continuations[0][1].declarations].filter(key=>continuations.every(([,c])=>c.declarations.has(key))));
                    context.ready=new Set([...continuations[0][1].ready].filter(key=>continuations.every(([,c])=>c.ready.has(key))));
                }else if(st.type==='Return'){
                    if(!context.record)fail();
                    if(context.record.launcher){if(st.value!==null)fail();return true;}
                    if(st.value===null)fail();const value=evaluate(st.value,state,context);if(value.kind!=='Number')fail();
                    context.record.returns.push(union(context.prefix,value.deps));return true;
                }else fail();
            }
            return false;
        };
        for(const record of records.values()){
            if(record.launcher)continue;
            const state=new Map();for(const name of record.node.params){const key=record.scope.names.get(name);if(key?.kind!=='parameter')fail();state.set(key,num());}
            if(!sequence(record.node.body,state,{record,ready:new Set(),prefix:new Set(),declarations:new Set(state.keys())}))fail();
        }
        sequence(program.body,new Map(),{record:null,ready:new Set(),prefix:new Set(),declarations:new Set()});
        if([...aliases.keys()].some(key=>!activeAliases.has(key)))fail();
        // Every executable identifier, including uncalled/after-return writers,
        // must have participated. Only exact proved native definition bodies omit.
        for(const node of syntax.nodes)if(node.type==='Identifier'&&!used.has(node)){
            let parent=node,inside=false;while(parent){if(helperDefinitions.has(parent)){inside=true;break;}parent=syntax.parentOf(parent);}
            if(!inside)fail();
        }
        // Propagate actual root contexts to ALL reachable function entries.
        const queue=[];
        const enter=(record,ready)=>{
            const next=record.ready===null?new Set(ready):new Set([...record.ready].filter(key=>ready.has(key)));
            if(!record.reached||next.size!==record.ready.size){record.ready=next;record.reached=true;queue.push(record);}
        };
        for(const entry of entries)enter(entry.target,entry.ready);
        for(let index=0;index<queue.length;index++){
            if(queue.length>200000)fail();const record=queue[index];for(const target of record.edges)enter(target,record.ready);
        }
        for(const record of records.values())if(!record.launcher&&(!record.reached||[...record.requiredAliases].some(key=>!record.ready.has(key))))fail();
        // Tarjan SCCs establish genuine recursion without widening the generic
        // immutable-function query. No provisional result escapes this scope.
        let serial=0;const stack=[],components=[];
        const visit=record=>{
            record.index=record.low=serial++;stack.push(record);record.onStack=true;
            for(const next of record.edges){if(next.launcher)fail();if(next.index===undefined){visit(next);record.low=Math.min(record.low,next.low);}else if(next.onStack)record.low=Math.min(record.low,next.index);}
            if(record.low===record.index){const part=[];let next;do{next=stack.pop();next.onStack=false;part.push(next);}while(next!==record);components.push(part);}
        };
        for(const record of records.values())if(!record.launcher&&record.index===undefined)visit(record);
        if(!components.some(part=>part.length>1||part[0].edges.has(part[0])))return answer();
        // Least productivity follows possible finite completion paths without
        // pretending a recursive call has returned. Safety above checked ALL
        // branches; this separate existential witness never prunes a bad return.
        // Branch continuations stay separate here, so a local initialized to 0
        // and conditionally overwritten by recursion retains its base witness.
        const grounded=new Set();
        const completes=node=>{
            if(!node||typeof node!=='object')return true;
            if(Array.isArray(node))return node.every(completes);
            if(node.type==='Call'){
                const call=allCalls.get(node);
                return !!call&&!call.target?.launcher&&(!call.target||grounded.has(call.target))&&node.args.every(completes);
            }
            if(node.type==='Identifier'||node.type==='Number'||node.type==='Boolean')return true;
            if(node.type==='Parenthesized')return completes(node.expression);
            if(node.type==='Unary'||node.type==='Update')return completes(node.argument);
            if(node.type==='Binary'||node.type==='Assignment')return completes(node.left)&&completes(node.right);
            return false;
        };
        // Only primitive source literals decide a definitely dead witness
        // branch. Nonconstant tests stay symbolic; this is not a proof of
        // feasibility/termination and never prunes the safety census above.
        const literalTruth=node=>{
            if(node.type==='Boolean')return node.value;
            if(node.type==='Number')return Number(node.value)!==0;
            if(node.type==='Parenthesized')return literalTruth(node.expression);
            if(node.type==='Unary'){
                const value=literalTruth(node.argument);
                if(value===null)return null;
                if(node.op==='!')return !value;
                if(['+','-'].includes(node.op)&&unwrap(node.argument).type==='Number')return value;
            }
            return null;
        };
        const finite=body=>{
            let continuation=true,returned=false;
            for(const st of body){
                if(!continuation)break;
                if(st.type==='Declaration')continuation=st.decls.every(decl=>decl.init===null||completes(decl.init));
                else if(st.type==='ExpressionStatement')continuation=completes(st.expr);
                else if(st.type==='Return'){returned ||=st.value!==null&&completes(st.value);continuation=false;}
                else if(st.type==='Block'){const a=finite(st.body);returned ||=a.returned;continuation=a.continuation;}
                else if(st.type==='If'){
                    if(!completes(st.test)){continuation=false;continue;}
                    const truth=literalTruth(st.test),dead={continuation:false,returned:false};
                    const a=truth===false?dead:finite(st.consequent),b=truth===true?dead:st.alternate?finite(st.alternate):{continuation:true,returned:false};
                    returned ||=a.returned||b.returned;continuation=a.continuation||b.continuation;
                }else fail();
            }
            return {continuation,returned};
        };
        let changed=true;
        while(changed){changed=false;for(const record of records.values())if(!record.launcher&&!grounded.has(record)&&finite(record.node.body).returned){grounded.add(record);changed=true;}}
        if([...records.values()].some(record=>!record.launcher&&!grounded.has(record)))return answer();
        for(const call of usedCallResults)results.add(call);
        eligible=current();return answer();
    }catch{return answer();}
}
