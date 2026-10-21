import {sdkExportClasses,sdkClassPublicName} from './sdk-class-descriptors.js';
// Private effect proof for the immutable JSON overwrite theorem. Nothing here
// supplies a value type, a receiver identity or an Array allocation/body fact.
export function createArrayClassResetEffects(context) {
    const {targets,scopes,records,calls,owners,invalid,block,child,input,binding,literal,
        exactKeys,shape,primitive,resetValue,reads,safeName,isArrayMenuSelector,isKnownArrayMenuOperation}=context;
    const denied=()=>({closed:false,declaration:()=>false,operand:()=>false});
    const classes=new Map(),roles=new Map(),byName=new Map();
    const sdkNames=new Set(sdkExportClasses().flatMap(cls=>[cls.name,sdkClassPublicName(cls.name)]));
    const identifier=name=>typeof name==='string'&&/^[A-Za-z_]\w*$/.test(name)&&safeName(name);
    const key=(target,name)=>{let map=byName.get(target);if(!map)byName.set(target,map=new Map());return map.get(name);};
    for(const scope of scopes){let map=byName.get(scope.target);if(!map)byName.set(scope.target,map=new Map());
        if(scope.proc){if(map.has(scope.proc))return denied();map.set(scope.proc,scope);}}
    const fixed=(node,name,target)=>literal(node,name,target);
    const list=(node,name,target)=>{try{const value=JSON.parse(fixed(node,name,target));return Array.isArray(value)?value:null;}catch{return null;}};
    const metadata=(value,required,optional=[])=>value&&typeof value==='object'&&!Array.isArray(value)&&
        required.every(name=>Object.hasOwn(value,name))&&Object.keys(value).every(name=>required.includes(name)||optional.includes(name));
    const definition=(target,name,count)=>{
        const scope=key(target,name);if(!scope||scope.invalid||scope.unknownEntry||scope.params.length!==count||
            !scope.params.every(safeName)||new Set(scope.params).size!==count)return null;
        const prototype=child(scope.root,'custom_block',target);
        let defaults;try{defaults=JSON.parse(prototype?.mutation?.argumentdefaults);}catch{return null;}
        return scope.root.opcode==='procedures_definition'&&scope.root.mutation==null&&
            exactKeys(scope.root,['custom_block'])&&prototype&&!invalid.has(prototype)&&
            prototype.opcode==='procedures_prototype'&&prototype.parent===scope.id&&!prototype.next&&
            prototype.mutation?.proccode===name&&prototype.mutation.warp==='false'&&
            JSON.stringify(JSON.parse(prototype.mutation.argumentnames))===JSON.stringify(scope.params)&&
            JSON.stringify(JSON.parse(prototype.mutation.argumentids))===JSON.stringify(scope.ids)&&
            Array.isArray(defaults)&&defaults.length===count&&defaults.every(value=>value===null||['string','number','boolean'].includes(typeof value))&&
            Object.values(target.blocks).filter(n=>n.opcode==='procedures_prototype'&&n.mutation?.proccode===name).length===1?scope:null;
    };
    for(const {target,node,scope}of records){
        if(node.opcode==='arcade_declareSubclass')return denied();
        if(node.opcode!=='arcade_declareClass')continue;
        if(!shape(node,scope,['NAME','FIELDS','INITIALIZER','CONSTRUCTOR','PARAMETERS','METHODS']))return denied();
        const name=fixed(node,'NAME',target),fields=list(node,'FIELDS',target),params=list(node,'PARAMETERS',target),methods=list(node,'METHODS',target);
        if(!identifier(name)||sdkNames.has(name)||classes.has(name)||!fields||!params||!methods)return denied();
        if(fields.some(row=>!metadata(row,['name','type','readonly'],['visibility','parameterProperty'])||!identifier(row.name)||typeof row.type!=='string'||typeof row.readonly!=='boolean')||
            new Set(fields.map(row=>row.name)).size!==fields.length||
            params.some(row=>!metadata(row,['name','type','optional'])||!identifier(row.name)||typeof row.type!=='string'||row.optional!==false))return denied();
        const fieldNames=new Set(fields.map(row=>row.name)),methodNames=new Set();
        const cls={name,target,node,scope,fieldNames,methods:new Map(),params};
        const init=definition(target,fixed(node,'INITIALIZER',target),1),ctor=definition(target,fixed(node,'CONSTRUCTOR',target),params.length+1);
        if(!init||!ctor||JSON.stringify(ctor.params.slice(1))!==JSON.stringify(params.map(row=>row.name)))return denied();
        const bind=(fn,kind)=>{if(roles.has(fn))return false;roles.set(fn,{cls,kind});return true;};
        if(!bind(init,'initializer')||!bind(ctor,'constructor'))return denied();
        cls.init=init;cls.ctor=ctor;
        for(const method of methods){
            if(!metadata(method,['name','procedure','parameters','returnType'],['visibility'])||!identifier(method.name)||typeof method.procedure!=='string'||typeof method.returnType!=='string'||
                methodNames.has(method.name)||fieldNames.has(method.name)||!Array.isArray(method.parameters)||
                method.parameters.some(row=>!metadata(row,['name','type','optional'])||!identifier(row.name)||typeof row.type!=='string'||row.optional!==false))return denied();
            const fn=definition(target,method.procedure,method.parameters.length+1);
            if(!fn||JSON.stringify(fn.params.slice(1))!==JSON.stringify(method.parameters.map(row=>row.name))||!bind(fn,'method'))return denied();
            methodNames.add(method.name);cls.methods.set(method.name,fn);
        }
        classes.set(name,cls);
    }
    if(!classes.size)return denied();
    const localName=(value,scope)=>{
        const n=value?.node;if(!n||invalid.has(n)||owners.get(n)!==scope)return null;
        if(n.opcode==='arcade_getLocal'&&shape(n,scope,['NAME']))return fixed(n,'NAME',scope.target);
        if(n.opcode.startsWith('argument_reporter_')&&shape(n,scope,[],['VALUE']))return n.fields.VALUE[0];
        return null;
    };
    const self=(value,scope)=>localName(value,scope)===scope.params[0];
    const ownField=(node,scope,cls)=>shape(node,scope,['OBJECT','FIELD'])&&self(input(node,'OBJECT',scope.target),scope)&&cls.fieldNames.has(fixed(node,'FIELD',scope.target));
    const scalar=(value,scope,cls,path=new Set())=>{
        if(primitive(value,scope))return true;
        const n=value?.node;if(!n||path.has(n)||invalid.has(n)||owners.get(n)!==scope)return false;
        const name=localName(value,scope);if(name!==null)return name!==scope.params[0]&&scope.params.includes(name);
        if(n.opcode==='arcade_objectField')return ownField(n,scope,cls);
        const inputs={operator_add:['NUM1','NUM2'],operator_subtract:['NUM1','NUM2'],operator_multiply:['NUM1','NUM2']}[n.opcode];
        return !!inputs&&shape(n,scope,inputs)&&inputs.every(name=>scalar(input(n,name,scope.target),scope,cls,new Set([...path,n])));
    };
    // No constructor/accessor callback can publish the fresh receiver or its
    // caller's frame. Parameter *types* are never consulted by this check.
    for(const [scope,{cls,kind}]of roles){
        const seen=new Set();let id=scope.root.next;
        while(id){const n=block(scope.target,id);if(!n||seen.has(n)||owners.get(n)!==scope||invalid.has(n))return denied();seen.add(n);
            if(n.opcode==='arcade_setObjectField'){
                if(!shape(n,scope,['OBJECT','FIELD','VALUE'])||!self(input(n,'OBJECT',scope.target),scope)||
                    !cls.fieldNames.has(fixed(n,'FIELD',scope.target))||!scalar(input(n,'VALUE',scope.target),scope,cls))return denied();
            }else if(n.opcode==='arcade_returnValue'){
                if(kind!=='method'||!shape(n,scope,['VALUE'])||!scalar(input(n,'VALUE',scope.target),scope,cls)||n.next)return denied();
            }else return denied();
            id=n.next;
        }
    }
    const argumentsOf=(node,scope)=>{
        if(!shape(node,scope,node.opcode==='arcade_createObject'?['CLASS','ARGS']:['OBJECT','METHOD','ARGS']))return null;
        const result=[],seen=new Set();let at=node;
        for(;;){const raw=at.inputs?.[at===node?'ARGS':'REST']?.[1];
            if(Array.isArray(raw))return raw.length===2&&raw[0]===10&&raw[1]==='[]'?result:null;
            const n=block(scope.target,raw);if(!n||seen.has(n)||invalid.has(n)||owners.get(n)!==scope)return null;seen.add(n);
            if(n.opcode==='text'&&n.shadow===true&&n.fields.TEXT?.[0]==='[]'&&!Object.keys(n.inputs||{}).length)return result;
            if(n.opcode!=='arcade_functionArgument'||!shape(n,scope,['VALUE','REST']))return null;
            result.push(input(n,'VALUE',scope.target));at=n;
        }
    };
    // Only reachable ordinary scopes can execute a generic invocation of a
    // constructor definition. A never-called generated forwarding definition
    // has no entry: the complete world below rejects callable/capture routes.
    const reachable=new Set(scopes.filter(s=>s.root.opcode==='arcade_whenSourceStarts'));
    for(const scope of roles.keys())reachable.add(scope);
    let changed;do{changed=false;for(const call of calls)if(reachable.has(call.scope)&&call.fn&&!reachable.has(call.fn)){reachable.add(call.fn);changed=true;}}while(changed);
    const primitiveValue=(value,scope,path=new Set())=>{
        if(primitive(value,scope))return true;
        const n=value?.node,c=value?.cell||(n&&binding(scope.target,n));
        if(n&&resetValue(n))return true;
        if(c){if(c.directBad||path.has(c)||!c.writers.length)return false;const next=new Set([...path,c]);
            return c.writers.every(w=>w.value&&primitiveValue(w.value,w.scope,next));}
        return false;
    };
    const allocation=(node,scope)=>{
        const cls=classes.get(fixed(node,'CLASS',scope.target)),args=argumentsOf(node,scope);
        return !!cls&&cls.target===scope.target&&!!args&&args.length===cls.params.length&&args.every(v=>primitiveValue(v,scope));
    };
    const identityReturn=(node,scope)=>{
        const call=calls.find(c=>c.node===node),fn=call?.fn,n=fn&&block(fn.target,fn.root.next);
        if(!call||!fn||fn.invalid||fn.unknownEntry||!call.args||!n||n.next||
            n.opcode!=='arcade_returnValue'||!shape(n,fn,['VALUE']))return null;
        const name=localName(input(n,'VALUE',fn.target),fn),index=fn.params.indexOf(name);
        return index>=0&&call.args.length===fn.params.length?{value:call.args[index],scope,args:call.args}:null;
    };
    const writes=(value,scope,visit,path)=>{
        const c=value?.cell||(value?.node&&binding(scope.target,value.node));
        if(!c||c.directBad||path.has(c)||!c.writers.length)return null;
        const next=new Set([...path,c]);return c.writers.every(w=>w.value&&visit(w.value,w.scope,next));
    };
    // Complete actual writer chains, never annotation/result tags, close the
    // method receiver and its expression. Array element origins are deliberately
    // overapproximated by EVERY physical heap writer in this closed project.
    // A primitive element can only fail the native object-heap owner check;
    // no JavaScript property/getter dispatch is granted for that alternative.
    const arraySource=(value,scope,path=new Set())=>{
        const n=value?.node,chain=writes(value,scope,arraySource,path);if(chain!==null)return chain;
        if(!n||path.has(n)||invalid.has(n)||owners.get(n)!==scope)return false;
        if(resetValue(n))return true;
        if(n.opcode==='arrays_createReference')return shape(n,scope,['VALUES'])&&fixed(n,'VALUES',scope.target)==='[]';
        const returned=n.opcode==='arcade_callFunction'&&identityReturn(n,scope);
        const next=new Set([...path,n]);
        return !!returned&&returned.args.every(v=>argumentEffect(v,scope,next))&&arraySource(returned.value,returned.scope,next);
    };
    const receiver=(value,scope,path=new Set())=>{
        const n=value?.node,chain=writes(value,scope,receiver,path);if(chain!==null)return chain;
        if(!n||path.has(n)||invalid.has(n)||owners.get(n)!==scope)return false;
        if(resetValue(n))return true;
        if(n.opcode==='arcade_createObject')return allocation(n,scope);
        const returned=n.opcode==='arcade_callFunction'&&identityReturn(n,scope);
        if(returned){const next=new Set([...path,n]);return returned.args.every(v=>argumentEffect(v,scope,next))&&receiver(returned.value,returned.scope,next);}
        if(n.opcode!=='arrays_referenceItem'||!shape(n,scope,['ARRAY','INDEX'])||
            !primitive(input(n,'INDEX',scope.target),scope)||!arraySource(input(n,'ARRAY',scope.target),scope,path))return false;
        return records.filter(r=>r.node.opcode==='arrays_mutateReference').every(({node,scope:at,target})=>{
            const op=fixed(node,'OP',target);
            return isArrayMenuSelector(node,'OP')&&isKnownArrayMenuOperation(node,op)&&
                (!['push','unshift','insertAt','set'].includes(op)||argumentEffect(input(node,'VALUE',target),at,new Set([...path,n])));
        });
    };
    const argumentEffect=(value,scope,path=new Set())=>{
        // Alternatives share a cell, but need not share a kind. Check every
        // actual writer's effects independently; never discard primitive resets.
        const chain=writes(value,scope,argumentEffect,path);if(chain!==null)return chain;
        return primitiveValue(value,scope,path)||receiver(value,scope,path)||arraySource(value,scope,path);
    };
    const allowed=new Set(['arcade_whenSourceStarts','procedures_definition','looks_hide','data_setvariableto','data_variable',
        'arcade_setLocal','arcade_getLocal','arcade_returnValue','arcade_callFunction','procedures_call','arcade_functionArgument',
        'arcade_declareSourceReference','arcade_declareSourceScalar','arcade_declareClass','arcade_createObject','arcade_objectField','arcade_setObjectField','arcade_callObjectMethod',
        'arrays_createReference','arrays_referenceValues','arrays_referenceItem','arrays_referenceLength','arrays_mutateReference','arrays_specialValue',
        'operator_add','operator_subtract','operator_multiply','math_number','math_whole_number','math_integer','math_positive_number','text','argument_reporter_string_number','argument_reporter_boolean',
        'arrays_menu_referenceMutations','arrays_menu_referenceTakeOperations']);
    for(const {node,scope,target}of records){
        if(!allowed.has(node.opcode)||invalid.has(node)||scope.invalid||scope.unknownEntry)return denied();
        if(node.opcode==='arcade_createObject'&&!allocation(node,scope))return denied();
        if(node.opcode==='arcade_setObjectField'&&!roles.has(scope))return denied();
        if(node.opcode==='arcade_objectField'&&!roles.has(scope))return denied();
        if(node.opcode==='arcade_callObjectMethod'){
            const method=fixed(node,'METHOD',target),args=argumentsOf(node,scope),matches=[...classes.values()].filter(cls=>cls.methods.has(method));
            if(!matches.length||!args||matches.some(cls=>cls.target!==target||cls.methods.get(method).params.length!==args.length+1)||
                args.some(v=>!primitiveValue(v,scope))||!receiver(input(node,'OBJECT',target),scope))return denied();
        }
        if(node.opcode==='arcade_callFunction'||node.opcode==='procedures_call'){
            const call=calls.find(c=>c.node===node);
            if(!call?.fn||!call.args||call.args.length!==call.fn.params.length||
                reachable.has(scope)&&roles.has(call.fn))return denied();
        }
    }
    return {closed:true,
        declaration(node,scope){
            if(node.opcode==='arcade_declareClass')return classes.get(fixed(node,'NAME',scope.target))?.node===node;
            if(node.opcode==='arcade_declareSourceScalar')return scope.root.opcode==='arcade_whenSourceStarts'&&
                shape(node,scope,['VARIABLE'],['TYPE'])&&['Number','Boolean','String','Any'].includes(fixed(node,'TYPE',scope.target))&&!!input(node,'VARIABLE',scope.target).cell;
            if(node.opcode!=='arcade_declareSourceReference'||scope.root.opcode!=='arcade_whenSourceStarts'||
                !shape(node,scope,['VARIABLE'],['TYPE']))return false;
            const type=fixed(node,'TYPE',scope.target),raw=node.inputs.VARIABLE?.[1];
            return typeof type==='string'&&classes.has(type.replace(/\[\]$/,''))&&Array.isArray(raw)&&raw[0]===12&&raw.length===3&&!!input(node,'VARIABLE',scope.target).cell;
        },
        operand(value,scope,cell){const n=value?.node;if(!n||reads(scope.target,n,cell))return false;
            return n.opcode==='arcade_createObject'&&allocation(n,scope);
        }};
}
