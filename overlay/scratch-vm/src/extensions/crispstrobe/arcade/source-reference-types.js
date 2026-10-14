const classCallableMetadata=require('./class-callable-metadata');
/* Source type annotations do not allocate references or register heap classes. */
const blocksOf = target => target.blocks?._blocks || target.blocks || {};
function literal(target, block, name) {
    if (block.fields?.[name]) return Array.isArray(block.fields[name])?block.fields[name][0]:block.fields[name].value;
    const input=block.inputs?.[name],slot=Array.isArray(input)?input[1]:input?.block,child=typeof slot==='string'?blocksOf(target)[slot]:null;
    if(Array.isArray(slot) && slot[0]===10)return slot[1];
    if(child?.shadow && child.fields?.TEXT)return Array.isArray(child.fields.TEXT)?child.fields.TEXT[0]:child.fields.TEXT.value;
    throw Error(`Source reference class declaration needs fixed ${name} metadata`);
}
function catalogue(targets) {
    const result=new Map(),declared=new Map();
    for(const target of targets)for(const block of Object.values(blocksOf(target))) {
        if(!['arcade_declareClass','arcade_declareSubclass'].includes(block.opcode))continue;
        const name=literal(target,block,'NAME'),parent=block.opcode==='arcade_declareSubclass'?literal(target,block,'BASE'):null;
        if(declared.has(name))throw Error('Duplicate source reference class declaration');
        declared.set(name,{name,parent,intrinsic:name.startsWith('__bwSDK_')});
    }
    const callableMetadata=classCallableMetadata(declared);
    for(const target of targets)for(const block of Object.values(blocksOf(target))) {
        if(!['arcade_declareClass','arcade_declareSubclass'].includes(block.opcode))continue;
        const name=literal(target,block,'NAME');
        if(typeof name!=='string'||!/^[A-Za-z_]\w*$/.test(name)||result.has(name))throw Error('Invalid or duplicate source reference class declaration');
        const fields=JSON.parse(literal(target,block,'FIELDS')),parameters=JSON.parse(literal(target,block,'PARAMETERS')),methods=JSON.parse(literal(target,block,'METHODS'));
        if(!Array.isArray(fields)||!Array.isArray(parameters)||!Array.isArray(methods))throw Error('Invalid source reference class declaration metadata');
        const validType=value=>typeof value==='string'&&/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*(?:\[\])*$/.test(value);
        const validParams=(list,callable=false)=>Array.isArray(list)&&new Set(list.map(p=>p?.name)).size===list.length&&list.every(p=>p&&/^[A-Za-z_]\w*$/.test(p.name)&&validType(p.type)&&typeof p.optional==='boolean'&&Object.keys(p).every(key=>(['name','type','optional','default'].includes(key)||callable&&key==='callableSignature'))&&(!Object.hasOwn(p,'default')||p.optional&&(p.default===null||typeof p.default==='boolean'||typeof p.default==='number'&&Number.isFinite(p.default))));
        for(const field of fields)if(field.valueKind!==undefined||field.callableSignature!==undefined)callableMetadata.field(field);
        for(const method of methods)if(method.typeParameters!==undefined||method.callableSignature!==undefined)callableMetadata.method(method);
        if(!validParams(parameters)||new Set(fields.map(f=>f?.name)).size!==fields.length||fields.some(f=>!f||!/^[A-Za-z_]\w*$/.test(f.name)||!validType(f.type)||typeof f.readonly!=='boolean'))throw Error('Invalid source reference class field or parameter metadata');
        if(new Set(methods.map(m=>m?.name)).size!==methods.length||methods.some(m=>!m||!/^[A-Za-z_]\w*$/.test(m.name)||!validType(m.returnType)||!validParams(m.parameters,m.callableSignature!==undefined)||typeof m.procedure!=='string'||fields.some(f=>f.name===m.name)))throw Error('Invalid source reference class method metadata');
        for(const field of fields) {
            if(Object.keys(field).some(key=>!['name','type','readonly','visibility','initializer','parameterProperty','getter','setter','valueKind','callableSignature'].includes(key)) || field.visibility!==undefined&&!['public','private','protected'].includes(field.visibility) || field.initializer!==undefined&&typeof field.initializer!=='string' || field.parameterProperty!==undefined&&typeof field.parameterProperty!=='boolean')throw Error('Invalid source reference class field metadata');
            if(field.getter!==undefined&&(typeof field.getter!=='string'||!field.getter))throw Error('Invalid source reference getter');
            if(field.setter!==undefined&&(!field.setter||typeof field.setter.procedure!=='string'||!field.setter.procedure||!validParams(field.setter.parameters)||field.setter.parameters.length!==1||field.setter.parameters[0].optional||Object.hasOwn(field.setter.parameters[0],'default')||Object.keys(field.setter).some(key=>!['procedure','parameters'].includes(key))))throw Error('Invalid source reference setter');
            if((field.getter||field.setter)&&(field.initializer!==undefined||field.parameterProperty||field.readonly!==!!(field.getter&&!field.setter)))throw Error('Invalid source reference accessor storage metadata');
        }
        if(methods.some(method=>!method.procedure||Object.keys(method).some(key=>!['name','procedure','parameters','returnType','visibility','typeParameters','callableSignature'].includes(key))||method.visibility!==undefined&&!['public','private','protected'].includes(method.visibility)))throw Error('Invalid source reference class method metadata');
        const initializer=literal(target,block,'INITIALIZER'),constructor=literal(target,block,'CONSTRUCTOR');
        if(typeof initializer!=='string'||typeof constructor!=='string')throw Error('Invalid source reference class procedure metadata');
        const parent=block.opcode==='arcade_declareSubclass'?literal(target,block,'BASE'):null;
        if(parent!==null&&(typeof parent!=='string'||!/^[A-Za-z_]\w*$/.test(parent)))throw Error('Invalid source reference class parent');
        const snapshot=JSON.stringify({name,parent,fields,parameters,methods,initializer,constructor});
        result.set(name,{name,parent,target,block,snapshot});
    }
    return result;
}
function resolve(type, classes) {
    if(typeof type!=='string'||!type)throw Error('Source reference type must be a fixed supported type');
    if(type==='image.Font')return {name:type,kind:'object',key:'__bwSDK_Font:record:1'};
    if(type==='Sprite'||type==='Image')return {name:type,kind:type.toLowerCase(),key:type};
    if(type.endsWith('[]')){
        const element=type.slice(0,-2);
        if(!['number','boolean','string','Sprite','Image'].includes(element)&&!classes.has(element))throw Error(`Unsupported source reference array element type ${element}`);
        const binding=classes.get(element);
        return {name:type,kind:'array',element,key:type,...(binding?{classBinding:binding}:{})};
    }
    const binding=classes.get(type);
    if(!binding)throw Error(`Unsupported or unowned source reference type ${type}`);
    return {name:type,kind:'object',classBinding:binding,key:type};
}
function same(a,b){return a.key===b.key && (!a.classBinding&&!b.classBinding || a.classBinding?.block===b.classBinding?.block && a.classBinding?.target===b.classBinding?.target && a.classBinding?.snapshot===b.classBinding?.snapshot);}
module.exports={catalogue,resolve,same,blocksOf,literal};
