// Inert class/callable v2 schema. Actual heap/procedure/frame authority is
// supplied separately at native execution; this validator grants none.
const fail=message=>{throw new Error('Class callable plan: '+message);};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const identifier=value=>typeof value==='string'&&/^[A-Za-z_]\w*$/.test(value);
const keys=(value,allowed)=>{if(!object(value)||Object.keys(value).some(key=>!allowed.includes(key)))fail('unknown or malformed fields');};
const same=(left,right)=>JSON.stringify(left)===JSON.stringify(right);
export function validateClassCallablePlan(plan) {
    keys(plan,['schema','version','module','classes','owners','bindings','sites']);
    if(plan.schema!=='bw-class-callable-lexical'||plan.version!==2)fail('unsupported schema version');
    const rows=(values,label)=>{
        if(!Array.isArray(values))fail('missing '+label);
        const map=new Map();for(const row of values){if(!identifier(row?.id)||map.has(row.id))fail('duplicate or invalid '+label);map.set(row.id,row);}return map;
    };
    if(!Array.isArray(plan.classes)||!plan.classes.length)fail('missing ordinary class catalogue');
    const classes=new Map();
    for(const cls of plan.classes){keys(cls,['name','parent','sdkRoles']);if(!identifier(cls.name)||classes.has(cls.name)||cls.parent!==null&&!identifier(cls.parent))fail('invalid ordinary class catalogue');classes.set(cls.name,cls);}
    for(const cls of classes.values()){const seen=new Set();let row=cls;while(row){if(seen.has(row.name))fail('cyclic class catalogue');seen.add(row.name);if(row.parent&&!classes.has(row.parent))fail('unknown class parent');row=classes.get(row.parent);}}
    const owners=rows(plan.owners,'owners'),bindings=rows(plan.bindings,'bindings'),sites=rows(plan.sites,'sites');
    const type=(value,generics=new Set(),shadowed=new Set())=>{
        if(!object(value))fail('missing signature type');
        if(value.kind==='sdk'){keys(value,['kind','name']);if(value.name!=='Image')fail('unqualified SDK signature domain');return;}
        if(value.kind==='named'){keys(value,['kind','name']);if(shadowed.has(value.name)&&!generics.has(value.name))fail('nested generic closure signature requires invocation binding');if(!generics.has(value.name)&&!classes.has(value.name)&&!['number','string','boolean','void','null','undefined'].includes(value.name))fail('opaque or unknown signature domain');return;}
        if(value.kind!=='callable')fail('unqualified signature domain');
        keys(value,['kind','parameters','result']);if(!Array.isArray(value.parameters))fail('missing ordered callback parameters');
        const names=new Set();for(const parameter of value.parameters){keys(parameter,['name','type','optional']);if(!identifier(parameter.name)||names.has(parameter.name)||parameter.optional!==false)fail('invalid or optional callback parameter');names.add(parameter.name);type(parameter.type,generics,shadowed);}type(value.result,generics,shadowed);
    };
    const hasSdk=value=>value?.kind==='sdk'||value?.kind==='callable'&&(value.parameters.some(parameter=>hasSdk(parameter.type))||hasSdk(value.result));
    for(const cls of classes.values())if(Object.hasOwn(cls,'sdkRoles')){
        const roles=cls.sdkRoles;keys(roles,['fields','constructor','methods']);
        if(!Array.isArray(roles.fields)||!Array.isArray(roles.constructor)||!Array.isArray(roles.methods)||!roles.fields.length&&!roles.constructor.length&&!roles.methods.length)fail('missing SDK class roles');
        const fields=new Set(),parameters=new Set(),methods=new Set();let previous=-1;
        for(const field of roles.fields){keys(field,field.type==='callable'?['name','type','callableSignature']:['name','type','sdkType']);if(!identifier(field.name)||fields.has(field.name))fail('invalid SDK field role');fields.add(field.name);if(field.type==='callable'){type(field.callableSignature);if(field.callableSignature.kind!=='callable'||!hasSdk(field.callableSignature))fail('callback field role has no SDK type');}else{if(field.type!=='Image'||field.sdkType?.kind!=='sdk')fail('invalid SDK field role');type(field.sdkType);}}
        for(const parameter of roles.constructor){keys(parameter,['index','name','type','sdkType']);if(!Number.isInteger(parameter.index)||parameter.index<=previous||!identifier(parameter.name)||parameters.has(parameter.name)||parameter.type!=='Image'||parameter.sdkType?.kind!=='sdk')fail('invalid ordered SDK constructor role');previous=parameter.index;parameters.add(parameter.name);type(parameter.sdkType);}
        for(const method of roles.methods){keys(method,['name','typeParameters','callableSignature']);if(!identifier(method.name)||methods.has(method.name)||!Array.isArray(method.typeParameters))fail('invalid SDK method role');methods.add(method.name);const generics=new Set();for(const parameter of method.typeParameters){keys(parameter,['name','constraint','defaultType']);if(!identifier(parameter.name)||generics.has(parameter.name)||parameter.constraint!==''||parameter.defaultType!=='')fail('invalid SDK method generic role');generics.add(parameter.name);}type(method.callableSignature,generics);if(method.callableSignature.kind!=='callable'||!hasSdk(method.callableSignature))fail('method role has no SDK type');}
    }
    const module=owners.get(plan.module);if(!module||module.kind!=='module'||module.parent!==null)fail('missing module owner');
    const genericNames=owner=>new Set((owner.typeParameters || []).map(parameter=>parameter.name));
    const outerGenerics=owner=>{const names=new Set(),seen=new Set();let row=owners.get(owner.parent);while(row&&!seen.has(row.id)){seen.add(row.id);for(const name of genericNames(row))names.add(name);row=owners.get(row.parent);}return names;};
    const procedures=new Set();
    for(const owner of owners.values()) {
        if(owner.kind==='module'){keys(owner,['id','kind','parent']);if(owner!==module)fail('duplicate module');continue;}
        keys(owner,['id','kind','parent','sourceName','procedure','signature','parameters','defaults','className','memberName','receiver','receiverParameter','typeParameters']);
        if(!['declaration','arrow','function','method','constructor'].includes(owner.kind)||!owners.has(owner.parent)||typeof owner.procedure!=='string'||!owner.procedure||procedures.has(owner.procedure))fail('invalid procedure owner');
        procedures.add(owner.procedure);
        const classOwner=['method','constructor'].includes(owner.kind);
        if(classOwner) {
            if(!classes.has(owner.className)||owner.kind==='method'&&!identifier(owner.memberName)||owner.kind==='constructor'&&owner.memberName!==null||!identifier(owner.receiver)||!identifier(owner.receiverParameter))fail('invalid class method owner');
            if(owner.sourceName!==(owner.kind==='method'?owner.memberName:'constructor'))fail('class source name differs from its method owner');
        }else if(owner.className!==undefined||owner.memberName!==undefined||owner.receiver!==undefined||owner.receiverParameter!==undefined||owner.typeParameters!==undefined)fail('unexpected class owner authority');
        if(!classOwner&&(owner.kind==='declaration'?!identifier(owner.sourceName):owner.sourceName!==null))fail('invalid source procedure name');
        if(classOwner&&!Array.isArray(owner.typeParameters))fail('missing method type parameters');
        const generics=new Set();for(const parameter of owner.typeParameters || []){keys(parameter,['name','constraint','defaultType']);if(!identifier(parameter.name)||generics.has(parameter.name)||parameter.constraint!==''||parameter.defaultType!=='')fail('unqualified method type parameter');generics.add(parameter.name);}
        type(owner.signature,generics,outerGenerics(owner));
        if(owner.signature.kind!=='callable'||!Array.isArray(owner.parameters)||owner.parameters.length!==owner.signature.parameters.length||!Array.isArray(owner.defaults)||owner.defaults.length)fail('invalid method signature or unqualified defaults');
        let row=owner;const seen=new Set();while(row!==module){if(!row||seen.has(row.id))fail('cyclic lexical ownership');seen.add(row.id);row=owners.get(row.parent);}
    }
    for(const binding of bindings.values()) {
        keys(binding,['id','owner','sourceName','nativeName','kind','declarationKind','type','written']);
        const owner=owners.get(binding.owner);if(!owner||!identifier(binding.sourceName)||!identifier(binding.nativeName)||typeof binding.written!=='boolean'||!['global','local','parameter','function','receiver'].includes(binding.kind))fail('invalid binding owner');
        if(['global','local'].includes(binding.kind)?!['let','const','var'].includes(binding.declarationKind):binding.declarationKind!==undefined)fail('invalid declaration syntax');
        type(binding.type,genericNames(owner),outerGenerics(owner));
        if(binding.kind==='receiver'&&(!['method','constructor'].includes(owner.kind)||owner.receiver!==binding.id||binding.sourceName!=='this'||binding.written||!same(binding.type,{kind:'named',name:owner.className})))fail('invalid actual receiver binding');
    }
    for(const owner of owners.values()) {
        if(['method','constructor'].includes(owner.kind)&&bindings.get(owner.receiver)?.owner!==owner.id)fail('missing owned receiver');
        const names=new Set();for(const binding of bindings.values())if(binding.owner===owner.id){if(names.has(binding.nativeName))fail('duplicate native binding');names.add(binding.nativeName);}
        for(const[index,id]of(owner.parameters || []).entries()){const binding=bindings.get(id),parameter=owner.signature.parameters[index];if(!binding||binding.owner!==owner.id||binding.kind!=='parameter'||binding.sourceName!==parameter.name||!same(binding.type,parameter.type))fail('parameter binding mismatch');}
    }
    for(const site of sites.values()) {
        keys(site,['id','owner','createdIn','captures','defaults']);
        const owner=owners.get(site.owner);if(!owner||!['arrow','function'].includes(owner.kind)||owner.parent!==site.createdIn||!Array.isArray(site.captures)||!Array.isArray(site.defaults)||site.defaults.length)fail('invalid callable site');
        const seen=new Set();for(const capture of site.captures){keys(capture,['binding','mode']);const binding=bindings.get(capture.binding);if(!binding||seen.has(capture.binding)||!['cell','value'].includes(capture.mode))fail('invalid capture');seen.add(capture.binding);let parent=owners.get(site.createdIn);while(parent&&parent.id!==binding.owner)parent=owners.get(parent.parent);if(!parent||binding.owner===plan.module||binding.kind==='receiver'&&capture.mode!=='value')fail('capture has no actual enclosing owner');}
    }
    return structuredClone(plan);
}

// Build only after the class lowerer has supplied its actual hygienic receiver
// parameter and emitted procedure code for every enclosing method scope.
export function createClassCallablePlan(flow,siteInfos,classProcedures) {
    const {lexical}=flow,owners=new Map(),bindings=new Map();
    const scopeId=scope=>'scope_'+scope.id,bindingId=binding=>'binding_'+binding.id;
    const nativeName=binding=>binding.kind==='parameter'?binding.name:binding.cellName;
    const sitesByScope=new Map(siteInfos.map(info=>[info.scope,info]));
    const procedures=new Map();
    for(const row of classProcedures || []) {
        if(procedures.has(row.scopeId))fail('duplicate lowered class procedure scope');
        procedures.set(row.scopeId,row);
    }
    const declarationKinds=new WeakMap();
    const walk=node=>{if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(walk);return;}if(node.type==='Declaration')for(const row of node.decls)declarationKinds.set(row,node.kind);for(const[key,value]of Object.entries(node))if(!['originalBody','parameterDefaults','paramTypes','typeParameters'].includes(key))walk(value);};
    walk(lexical.global.node.body);
    const addOwner=scope=>{
        if(owners.has(scope))return;
        if(scope===lexical.global){owners.set(scope,{id:scopeId(scope),kind:'module',parent:null});return;}
        if(!['function','method'].includes(scope.kind))fail('unqualified enclosing lexical block');
        addOwner(scope.parent);
        const profile=flow.profiles.get(scope.node),signature=flow.signature(profile);
        if(!signature)fail('unresolved lexical owner signature');
        const info=sitesByScope.get(scope),method=scope.kind==='method',constructor=scope.constructor===true,row=method&&procedures.get(scope.id);
        if(method&&(!row||row.className!==scope.className||row.methodName!==(constructor?null:scope.node.name)))fail('missing actual lowered class method mapping');
        const kind=method?(constructor?'constructor':'method'):scope.node.type==='FunctionDeclaration'?'declaration':scope.node.functionKind;
        const name=info?.name || scope.node.name;
        const owner={id:scopeId(scope),kind,parent:scopeId(scope.parent),sourceName:method?(constructor?'constructor':scope.node.name):kind==='declaration'?scope.node.name:null,
            procedure:method?row.procedure:name+(scope.node.params || []).map(()=> ' %s').join(''),signature:structuredClone(signature),
            parameters:(scope.node.params || []).map(name=>bindingId(scope.names.get(name))),defaults:[]};
        if(scope.node.parameterDefaults?.length)fail('class lexical defaults are not qualified');
        if(method)Object.assign(owner,{className:scope.className,memberName:constructor?null:scope.node.name,
            receiver:bindingId(scope.names.get('this')),receiverParameter:row.receiverParameter,typeParameters:structuredClone(scope.node.typeParameters || [])});
        owners.set(scope,owner);
    };
    for(const info of siteInfos)addOwner(info.scope);
    for(const binding of lexical.bindings) {
        if(!owners.has(binding.scope))continue;
        const targets=flow.bindingTargets.get(binding);
        const relevant=binding.kind==='function'&&owners.has(lexical.scopes.get(binding.node))||targets?.size&&[...targets].some(target=>sitesByScope.has(lexical.scopes.get(target)));
        if(binding.scope===lexical.global&&!relevant)continue;
        const type=flow.bindingTypes.get(binding)||(binding.kind==='function'?flow.signature(flow.profiles.get(binding.node)):null);
        if(!type)fail('unresolved lexical binding '+binding.name);
        bindings.set(binding,{id:bindingId(binding),owner:scopeId(binding.scope),sourceName:binding.name,nativeName:nativeName(binding),kind:binding.kind,
            ...(declarationKinds.has(binding.node)?{declarationKind:declarationKinds.get(binding.node)}:{}),type:structuredClone(type),written:binding.written});
    }
    const sites=siteInfos.map(info=>({id:info.site,owner:scopeId(info.scope),createdIn:scopeId(info.scope.parent),
        captures:info.scope.captureSpecifications.map(capture=>({binding:bindingId(capture.binding),mode:capture.mode})),defaults:[]}));
    return validateClassCallablePlan({schema:'bw-class-callable-lexical',version:2,module:scopeId(lexical.global),
        classes:lexical.global.node.body.filter(node=>node.type==='Class').map(node=>({name:node.name,parent:node.base || null,...(flow.sdkImagePrototype&&node.bwSdkImageRoles?{sdkRoles:structuredClone(node.bwSdkImageRoles)}:{})})),owners:[...owners.values()],bindings:[...bindings.values()],sites});
}
