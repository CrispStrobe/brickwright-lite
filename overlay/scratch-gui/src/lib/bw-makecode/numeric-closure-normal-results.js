import {inspectGeneratedHelperBindings} from './generated-helper-recognition.js';
import {analyseCallableBindings} from './callable-bindings.js';
import {staticSdkNamespaceReceivers} from './static-sdk-namespaces.js';

// Private compiler view of a deliberately closed numeric factory family. A
// signature/annotation is never a value producer. The entry store is proved
// independently of the general graph: its Undefined writer remains untouched.
export function numericClosureNormalResults(program,profile) {
    const refused=()=>Object.freeze({current:()=>false,has:()=>false});
    // Establish own-data/dense child storage before the shared lexical walker
    // can perform any ordinary field lookup. A frozen caller object is not a
    // certificate; unsupported or inherited executable slots simply refuse.
    const seen=new WeakSet(),active=new WeakSet();
    const slots=['type','body','params','decls','init','expr','value','name','callee','args','left','right','argument','expression','object','index','functionKind','isNew','constructorCall','typeArguments','parameterDefaults','optionalParams','ordinaryParameterDefaultNames','parameterDefaultPrologue','parameterProperties','typeParameters','async','generator','isAsync','isGenerator'];
    const data=value=>{
        if(!value||typeof value!=='object')return true;
        if(active.has(value))return false;if(seen.has(value))return true;
        const proto=Object.getPrototypeOf(value);if(proto!==Object.prototype&&proto!==Array.prototype&&proto!==null)return false;
        const keys=Reflect.ownKeys(value),descriptors=new Map();
        for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);if(typeof key!=='string'||!d||!Object.hasOwn(d,'value'))return false;descriptors.set(key,d);}
        for(const key of slots)if(!descriptors.has(key)&&key in value)return false;
        if(Array.isArray(value)){
            const length=descriptors.get('length')?.value;
            if(!Number.isSafeInteger(length)||length>100000)return false;
            for(let i=0;i<length;i++)if(!descriptors.has(String(i)))return false;
        }
        seen.add(value);active.add(value);
        for(const d of descriptors.values())if(!data(d.value))return false;
        active.delete(value);return true;
    };
    let syntax;
    try{if(!data(program))return refused();syntax=inspectGeneratedHelperBindings(program,profile);}
    catch{return refused();}
    let live=syntax.isCurrent(),eligible=false,ownComplete=true;
    const absences=[];
    const absentCurrent=()=>absences.every(({value,key})=>{
        if(Object.hasOwn(value,key))return false;
        const proto=Object.getPrototypeOf(value);
        if(proto===null)return true;
        if(proto!==Object.prototype&&proto!==Array.prototype)return false;
        if(Object.getOwnPropertyDescriptor(Object.prototype,key))return false;
        return proto!==Array.prototype||Object.getPrototypeOf(Array.prototype)===Object.prototype&&!Object.getOwnPropertyDescriptor(Array.prototype,key);
    });
    const results=new WeakSet(),used=new WeakSet();
    const current=()=>{if(live&&(!ownComplete||!syntax.isCurrent()||!absentCurrent()))live=false;return live;};
    const none=()=>Object.freeze({current,has:()=>false});
    if(!live)return none();
    const own=(value,key)=>{
        const d=value&&typeof value==='object'?Object.getOwnPropertyDescriptor(value,key):null;
        if(!d&&value&&typeof value==='object'){absences.push({value,key});if(key in value)ownComplete=false;}
        return d&&Object.hasOwn(d,'value')?d.value:undefined;
    };
    const list=value=>{
        const length=own(value,'length');if(!Array.isArray(value)||!Number.isSafeInteger(length)||length>100000)return false;
        for(let i=0;i<length;i++)if(!Object.hasOwn(value,String(i)))return false;return true;
    };
    const plainCall=node=>own(node,'type')==='Call'&&!own(node,'isNew')&&!own(node,'constructorCall')&&
        !Object.hasOwn(node,'typeArguments')&&list(own(node,'args'));
    const synchronous=fn=>['async','generator','isAsync','isGenerator'].every(key=>!Object.hasOwn(fn,key)||own(fn,key)===false);
    const noDefaults=fn=>[fn,own(fn,'params')].every(value=>
        ['parameterDefaults','optionalParams','ordinaryParameterDefaultNames','parameterProperties'].every(key=>{
            const field=own(value,key);return !Object.hasOwn(value,key)||list(field)&&field.length===0;
        }))&&(!Object.hasOwn(fn,'parameterDefaultPrologue')||typeof own(fn,'parameterDefaultPrologue')==='boolean')&&
        (!Object.hasOwn(fn,'typeParameters')||list(own(fn,'typeParameters'))&&own(fn,'typeParameters').length===0);
    if(own(program,'type')!=='Program'||!list(own(program,'body')))return none();
    const sdk=staticSdkNamespaceReceivers(program),lexical=analyseCallableBindings(program),factories=new Map(),rootState=new Map(),constants=new Set();
    const lookup=node=>lexical.references.get(node);
    const mark=node=>{used.add(node);return lookup(node);};
    const number=Object.freeze({kind:'Number'}),undefinedValue=Object.freeze({kind:'Undefined'});
    const literal=node=>own(node,'type')==='Number'&&typeof own(node,'value')==='string'&&
        /^(?:0[xX][\da-fA-F]+|0[bB][01]+|0[oO][0-7]+|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)$/.test(own(node,'value'));
    const unwrap=node=>own(node,'type')==='Parenthesized'?unwrap(own(node,'expression')):node;
    const localBinding=(scope,name)=>scope.names.get(name);
    // Resolve every reference, not an annotation's purported callable type.
    for(const statement of program.body){
        if(own(statement,'type')!=='FunctionDeclaration')continue;
        const scope=lexical.functions.find(scope=>scope.node===statement);
        const binding=lexical.global.names.get(own(statement,'name'));
        if(!scope||scope.unsupported?.length||scope.parent!==lexical.global||binding?.node!==statement||!syntax.root(statement)||
            !list(own(statement,'params'))||!list(own(statement,'body'))||!synchronous(statement)||!noDefaults(statement)||
            new Set(statement.params).size!==statement.params.length||statement.params.some(name=>typeof name!=='string'))return none();
        factories.set(binding,{node:statement,scope,calls:0});
    }
    if(!factories.size)return none();
    const numeric=(node,state,allowClosureCalls=false)=>{
        if(!node||typeof node!=='object')return false;
        const type=own(node,'type');
        if(type==='Number')return literal(node);
        if(type==='Parenthesized')return numeric(own(node,'expression'),state,allowClosureCalls);
        if(type==='Identifier')return state.get(mark(node))?.kind==='Number';
        if(type==='Unary')return ['+','-','~'].includes(own(node,'op'))&&numeric(own(node,'argument'),state,allowClosureCalls);
        if(type==='Binary')return ['+','-','*','/','%','**','&','|','^','<<','>>','>>>'].includes(own(node,'op'))&&
            numeric(own(node,'left'),state,allowClosureCalls)&&numeric(own(node,'right'),state,allowClosureCalls);
        if(type==='Call'&&allowClosureCalls&&plainCall(node)&&node.args.length===0){
            const callee=unwrap(own(node,'callee'));
            if(own(callee,'type')!=='Identifier')return false;
            const value=state.get(mark(callee));
            if(value?.kind!=='Closure'||!value.origins.size)return false;
            results.add(node);return true;
        }
        return false;
    };
    const declaration=(statement,scope,state,entryOnly=false)=>{
        if(!['let','const'].includes(own(statement,'kind'))||!list(own(statement,'decls')))return false;
        for(const decl of statement.decls){
            const binding=localBinding(scope,own(decl,'name'));
            if(!binding||binding.node!==decl||state.has(binding))return false;
            const init=own(decl,'init');
            if(init===null||init===undefined){if(statement.kind==='const')return false;state.set(binding,{kind:'Unassigned'});continue;}
            if(statement.kind==='const')constants.add(binding);
            if(entryOnly&&own(init,'type')==='Undefined'){state.set(binding,undefinedValue);continue;}
            const value=valueOf(init,state,!entryOnly);
            if(!value)return false;state.set(binding,value);
        }
        return true;
    };
    const factory=(record,call)=>{
        const args=call.args;
        if(args.length!==record.node.params.length||!args.every(arg=>numeric(arg,rootState,true)))return null;
        const state=new Map(),locals=new Set();
        for(const name of record.node.params){const binding=localBinding(record.scope,name);if(!binding)return null;state.set(binding,number);}
        const statements=record.node.body;
        if(!statements.length||own(statements.at(-1),'type')!=='Return')return null;
        for(const statement of statements.slice(0,-1)){
            if(own(statement,'type')==='Declaration'){
                if(!declaration(statement,record.scope,state,true))return null;
                for(const decl of statement.decls)locals.add(localBinding(record.scope,decl.name));
            }else if(own(statement,'type')==='ExpressionStatement'){
                const expr=own(statement,'expr'),left=own(expr,'left');
                if(own(expr,'type')!=='Assignment'||own(expr,'op')!=='='||own(left,'type')!=='Identifier')return null;
                const binding=mark(left);
                if(!locals.has(binding)||constants.has(binding)||!numeric(own(expr,'right'),state))return null;
                state.set(binding,number);
            }else return null;
        }
        // Ordinary source normalization omits functionKind for both syntaxes.
        // Their zero-arg, receiver/arguments-free bodies have the same proved
        // captured-store normal result; no missing syntax tag grants a value.
        const arrow=own(statements.at(-1),'value'),scope=lexical.functions.find(scope=>scope.node===arrow);
        if(own(arrow,'type')!=='FunctionExpression'||!['arrow','function',undefined].includes(own(arrow,'functionKind'))||!scope||scope.parent!==record.scope||
            scope.unsupported?.length||!synchronous(arrow)||!list(own(arrow,'params'))||arrow.params.length||!list(own(arrow,'body'))||!noDefaults(arrow)||
            !scope.captures.size||[...scope.captures].some(binding=>!locals.has(binding)||state.get(binding)?.kind!=='Number'))return null;
        const body=arrow.body;
        if(!body.length||own(body.at(-1),'type')!=='Return')return null;
        // The state is per factory entry, not a global union or an observed
        // numeric value. The dominating store and every Arrow write preserve
        // the invariant for every activation sharing this lexical body.
        const inside=new Map(state);
        for(const statement of body.slice(0,-1)){
            const expr=own(statement,'expr'),left=own(expr,'left');
            if(own(statement,'type')!=='ExpressionStatement'||own(expr,'type')!=='Assignment'||
                own(expr,'op')!=='='||own(left,'type')!=='Identifier')return null;
            const binding=mark(left);
            if(!scope.captures.has(binding)||!locals.has(binding)||constants.has(binding)||!numeric(own(expr,'right'),inside))return null;
            inside.set(binding,number);
        }
        if(!numeric(own(body.at(-1),'value'),inside))return null;
        record.calls++;
        return {kind:'Closure',origins:new Set([{factoryCall:call,arrow,captures:new Set(scope.captures)}])};
    };
    const valueOf=(node,state,allowFactory)=>{
        if(numeric(node,state,true))return number;
        const value=unwrap(node);
        if(own(value,'type')==='Identifier'){
            const found=state.get(mark(value));return found?.kind==='Closure'?found:null;
        }
        if(allowFactory&&plainCall(value)){
            const callee=unwrap(own(value,'callee'));
            if(own(callee,'type')!=='Identifier')return null;
            const record=factories.get(mark(callee));
            if(record)return factory(record,value);
        }
        return null;
    };
    for(const statement of program.body){
        if(own(statement,'type')==='FunctionDeclaration')continue;
        if(own(statement,'type')==='Declaration'){
            if(!declaration(statement,lexical.global,rootState))return none();
        }else if(own(statement,'type')==='ExpressionStatement'){
            const expr=own(statement,'expr');
            if(own(expr,'type')==='Assignment'){
                const left=own(expr,'left');
                if(own(expr,'op')!=='='||own(left,'type')!=='Identifier')return none();
                const binding=mark(left),value=valueOf(own(expr,'right'),rootState,true);
                if(!binding||binding.scope!==lexical.global||constants.has(binding)||!rootState.has(binding)||!value)return none();
                rootState.set(binding,value);
            }else if(plainCall(expr)){
                const callee=own(expr,'callee'),receiver=own(callee,'object');
                // Existing SDK namespace proof, no host object method lookup.
                if(own(callee,'type')!=='Member'||own(callee,'name')!=='setScore'||
                    own(receiver,'type')!=='Identifier'||own(receiver,'name')!=='info'||!sdk.has(callee)||
                    expr.args.length!==1||!expr.args.every(arg=>numeric(arg,rootState,true)))return none();
                used.add(receiver);
            }else return none();
        }else return none();
    }
    // Every actual callable/capture Identifier occurrence must be consumed by
    // the grammar. Unused/foreign aliases, reflected names, callbacks, hidden
    // entries and any extra executable source remain unproved.
    if([...factories.values()].some(record=>!record.calls)||
        syntax.nodes.some(node=>own(node,'type')==='Identifier'&&!used.has(node)))return none();
    eligible=ownComplete;
    return Object.freeze({current,has:node=>eligible&&current()&&results.has(node)});
}
