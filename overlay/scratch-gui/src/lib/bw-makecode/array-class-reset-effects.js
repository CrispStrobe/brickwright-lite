import constraintModel from 'scratch-vm/src/util/bw-procedure-constraint-model.js';
import {isProjectJsonSnapshot} from './project-json-snapshot.js';
import {sdkExportClasses,sdkClassPublicName} from './sdk-class-descriptors.js';
// Local to this proof: no caller can supply a prepared model or enroll a graph.
// The canonical model uses ordinary property reads and JSON.stringify. Its
// complete actual input must be owned data BEFORE either prepare or current.
const ownedAnyPrefixes = (project,targets) => {
    const get=Object.getOwnPropertyDescriptor,keys=Reflect.ownKeys,proto=Object.getPrototypeOf;
    const own=(o,k)=>!!o&&Object.hasOwn(o,k),value=(o,k)=>get(o,k)?.value;
    const empty=Object.freeze({body:()=>null,contains:()=>false,current:()=>false});
    if(!isProjectJsonSnapshot(project))return empty;
    const ordinary=new Set(['constructor','__defineGetter__','__defineSetter__','hasOwnProperty',
        '__lookupGetter__','__lookupSetter__','isPrototypeOf','propertyIsEnumerable','toString','valueOf','__proto__','toLocaleString']);
    const arrayNames=new Set(['length','constructor','at','concat','copyWithin','fill','find','findIndex','findLast','findLastIndex',
        'lastIndexOf','pop','push','reverse','shift','unshift','slice','sort','splice','includes','indexOf','join','keys','entries','values',
        'forEach','filter','flat','flatMap','map','every','some','reduce','reduceRight','toReversed','toSorted','toSpliced','with',
        'toLocaleString','toString',Symbol.iterator,Symbol.unscopables]);
    if(proto(Object.prototype)!==null||proto(Array.prototype)!==Object.prototype||
        keys(Object.prototype).some(k=>!ordinary.has(k))||keys(Array.prototype).some(k=>!arrayNames.has(k)))return empty;
    const prototypeRows=[Object.prototype,Array.prototype].map(object=>({object,parent:proto(object),
        entries:keys(object).map(key=>[key,get(object,key)])}));
    const same=(a,b)=>!!a&&!!b&&a.enumerable===b.enumerable&&a.configurable===b.configurable&&
        own(a,'value')===own(b,'value')&&(own(a,'value')?Object.is(a.value,b.value)&&a.writable===b.writable:
            a.get===b.get&&a.set===b.set);
    const prototypesCurrent=()=>prototypeRows.every(row=>proto(row.object)===row.parent&&
        keys(row.object).length===row.entries.length&&row.entries.every(([key,d])=>same(get(row.object,key),d)));
    const owned=new WeakSet(),objects=[],pending=[project];
    const slots=['targets','blocks','variables','extensions','extensionURLs','monitors','isStage','name','inputs','fields','mutation',
        'opcode','next','parent','topLevel','shadow','proccode','argumentnames','argumentids','argumentdefaults','warp',
        'block','value','TYPE','PARAMETER','PROCEDURE','VALUE','custom_block','NAME','_blocks','toJSON'];
    while(pending.length){
        const object=pending.pop();if(owned.has(object))continue;
        if(objects.length>=100000||!Object.isFrozen(object))return empty;
        const array=Array.isArray(object),parent=proto(object);
        if(parent!==(array?Array.prototype:Object.prototype))return empty;
        owned.add(object);objects.push(object);
        if(own(object,'toJSON')||own(object,'_blocks'))return empty;
        for(const key of keys(object)){
            const d=get(object,key);if(typeof key!=='string'||!own(d,'value'))return empty;
            const child=d.value;if(typeof child==='function'||typeof child==='symbol')return empty;
            if(child&&typeof child==='object')pending.push(child);
        }
        if(array)for(let i=0;i<value(object,'length');i++)if(!own(object,i+''))return empty;
        for(const key of slots)if(!own(object,key)&&(get(Object.prototype,key)||array&&get(Array.prototype,key)))return empty;
    }
    if(value(project,'targets')!==targets||!Array.isArray(targets)||!owned.has(targets))return empty;
    const safeId=id=>typeof id==='string'&&!ordinary.has(id)&&id!=='_blocks'&&id!=='toJSON';
    const models=new Map(),prefixes=new Map();let expired=false;
    const physical=()=>prototypesCurrent()&&objects.every(o=>proto(o)===(Array.isArray(o)?Array.prototype:Object.prototype));
    const current=()=>{
        if(expired)return false;
        try{if(!physical()||[...models.values()].some(m=>m.current()!==true)||!physical())expired=true;}
        catch(_){expired=true;}
        return !expired;
    };
    const prepare=target=>{
        if(!current()||!owned.has(target)||!targets.includes(target))return null;
        if(models.has(target))return models.get(target);
        const blocks=value(target,'blocks');
        if(!blocks||Array.isArray(blocks)||!owned.has(blocks)||keys(blocks).some(k=>!safeId(k)))return null;
        for(const id of keys(blocks)){
            const node=value(blocks,id),inputs=node&&value(node,'inputs'),fields=node&&value(node,'fields');
            if(!node||Array.isArray(node)||!owned.has(node)||typeof value(node,'opcode')!=='string'||
                !inputs||Array.isArray(inputs)||!owned.has(inputs)||!fields||Array.isArray(fields)||!owned.has(fields))return null;
            for(const name of keys(inputs)){
                const tuple=value(inputs,name);if(!Array.isArray(tuple)||![2,3].includes(tuple.length)||![1,2,3].includes(tuple[0]))return null;
                if(typeof tuple[1]==='string'&&(!safeId(tuple[1])||!own(blocks,tuple[1])))return null;
            }
            for(const name of ['next','parent']){const id=value(node,name);if(typeof id==='string'&&(!safeId(id)||!own(blocks,id)))return null;}
            for(const name of keys(fields))if(!Array.isArray(value(fields,name)))return null;
            const mutation=value(node,'mutation');if(mutation!==undefined&&mutation!==null&&
                (typeof mutation!=='object'||Array.isArray(mutation)||!owned.has(mutation)))return null;
        }
        try{const model=constraintModel.prepare(target);models.set(target,model);return current()?model:null;}
        catch(_){expired=true;return null;}
    };
    const body=scope=>{
        if(!scope||scope.invalid||scope.unknownEntry||!current())return null;
        const model=prepare(scope.target),entry=model?.procedures.get(scope.proc);
        if(!entry||entry.definition!==scope.root||entry.definitionId!==scope.id||
            entry.names.length!==scope.params.length||entry.ids.length!==scope.ids.length||
            !entry.names.every((name,i)=>name===scope.params[i]&&entry.ids[i]===scope.ids[i]))return null;
        const blocks=value(scope.target,'blocks'),accepted=[],seen=new Set();let id=value(scope.root,'next'),previous=scope.id,index=-1;
        while(id){
            const node=value(blocks,id);if(!node||value(node,'opcode')!==constraintModel.OPCODE)break;
            const binding=model.declarations.get(node),fields=value(node,'fields');
            if(!binding||binding.block!==node||binding.type!=='Any'||binding.index<=index||
                entry.constraints.get(binding.name)!==binding||entry.names[binding.index]!==binding.name||entry.ids[binding.index]!==binding.id||
                value(node,'parent')!==previous||seen.has(node)||keys(value(node,'inputs')).length||
                keys(fields).sort().join('|')!=='PARAMETER|PROCEDURE|TYPE')return null;
            for(const [key,text]of [['PARAMETER',binding.name],['PROCEDURE',entry.code],['TYPE','Any']]){
                const row=value(fields,key);if(!Array.isArray(row)||row.length!==2||row[0]!==text||row[1]!==null)return null;
            }
            accepted.push(node);seen.add(node);index=binding.index;previous=id;id=value(node,'next');
        }
        if(!accepted.length||!id||value(blocks,id)!==entry.body||!current())return null;
        prefixes.set(scope,new Set(accepted));return entry.body;
    };
    return Object.freeze({body,current,contains:(node,scope)=>current()&&prefixes.get(scope)?.has(node)===true});
};

// Private effect proof for the immutable JSON overwrite theorem. Nothing here
// supplies a value type, a receiver identity or an Array allocation/body fact.
export function createArrayClassResetEffects(context) {
    const {targets,scopes,records,calls,owners,invalid,block,child,input,binding,literal,
        exactKeys,shape,primitive,resetValue,reads,safeName,isArrayMenuSelector,isKnownArrayMenuOperation}=context;
    const denied=()=>({closed:false,declaration:()=>false,operand:()=>false});
    const prefixes=records.some(r=>r.node.opcode===constraintModel.OPCODE)?ownedAnyPrefixes(context.project,targets):
        Object.freeze({body:()=>null,contains:()=>false,current:()=>true});
    let prefixUsed=false;
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
    const identityBody=fn=>{
        if(!fn||fn.invalid||fn.unknownEntry)return null;
        const first=block(fn.target,fn.root.next),prefixed=first?.opcode===constraintModel.OPCODE;
        const n=prefixed&&!roles.has(fn)?prefixes.body(fn):first;
        if(!n||n.next||n.opcode!=='arcade_returnValue'||!shape(n,fn,['VALUE']))return null;
        const name=localName(input(n,'VALUE',fn.target),fn),index=fn.params.indexOf(name);
        return index<0?null:{node:n,index,prefixed};
    };
    const identityReturn=(node,scope)=>{
        const call=calls.find(c=>c.node===node),fn=call?.fn,body=identityBody(fn);
        if(!call||!call.args||!body||call.args.length!==fn.params.length)return null;
        return {value:call.args[body.index],scope,args:call.args};
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
        if(node.opcode===constraintModel.OPCODE){
            const body=identityBody(scope);
            if(!body?.prefixed||!prefixes.contains(node,scope)||invalid.has(node)||scope.invalid||scope.unknownEntry)return denied();
            prefixUsed=true;continue;
        }
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
    return {get closed(){return !prefixUsed||prefixes.current();},
        prefixUsed:()=>prefixUsed,
        prefixCurrent:()=>!prefixUsed||prefixes.current(),
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
