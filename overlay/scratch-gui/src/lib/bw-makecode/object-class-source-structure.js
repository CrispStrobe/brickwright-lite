import {SDK_CLASS_NODES,SDK_SPRITE_CLASS_NODES,SDK_DIALOG_CLASS_NODES,sdkClassName} from './sdk-class-descriptors.js';
import {createClassCallableDescriptors} from './callable-class-descriptors.js';

// Shared structural normalization only. This result grants no Throw entry,
// initialized read, runtime ownership or private source capability.
export function prepareObjectClassStructure(program,{classCallablePrototype=false,sdkImagePrototype=false}={}) {
    if(classCallablePrototype!==true&&classCallablePrototype!==false)return {program,unsupported:['Class callable class lowering requires its explicit Boolean option']};
    const callableModel=classCallablePrototype?createClassCallableDescriptors(program,{sdkImagePrototype}):null;
    if(callableModel?.unsupported.length)return {program,unsupported:callableModel.unsupported};
    if(classCallablePrototype && JSON.stringify(program.bwClassCallableDescriptors)!==JSON.stringify({schema:callableModel.schema,version:callableModel.version,classes:callableModel.classes}))
        return {program,unsupported:['Class callable descriptors differ from actual source declarations']};
    const liftedCallables=new Set((program.bwCallables||[]).map(row=>row.name));
    const callableClass=name=>callableModel?.classes.find(row=>row.name===name);
    const callableField=(name,field)=>callableClass(name)?.fields.find(row=>row.name===field);
    const callableMethod=(name,method)=>callableClass(name)?.methods.find(row=>row.name===method);
    const sdkField=(name,field)=>callableClass(name)?.sdkRoles?.fields.find(row=>row.name===field&&row.type==='Image');
    const sdkParameter=(name,index)=>callableClass(name)?.sdkRoles?.constructor.find(row=>row.index===index);
    const reserved = new Set(SDK_CLASS_NODES.map(node=>node.name).filter(name=>name.startsWith('__bwSDK_')));
    const usesReserved = node => node && typeof node==='object' &&
        (reserved.has(node.type==='Identifier'||node.type==='Class'?node.name:null) || reserved.has(node.type==='Class'?node.base:null) ||
        Object.values(node).some(value=>Array.isArray(value)?value.some(usesReserved):usesReserved(value)));
    if(usesReserved(program))return {program,unsupported:['Internal SDK class descriptor names are not source constructors or bindings']};
    const contains = (node, predicate) => node && typeof node === 'object' && (predicate(node) ||
        Object.values(node).some(value => Array.isArray(value) ? value.some(child => contains(child, predicate)) : contains(value, predicate)));
    const dialogName=node=>node?.type==='Member' && node.object?.type==='Identifier' && node.object.name==='game' && ['BaseDialog','SplashDialog'].includes(node.name) ? sdkClassName('game.'+node.name):null;
    const dialogRequested=contains(program,node=>node.type==='Call' && node.isNew && dialogName(node.callee));
    const methodOrigins=new WeakMap(),classOrigins=new WeakMap();
    const sourceClasses = program.body.filter(node => node.type === 'Class').map(node=>{
        const properties=new Map();for(const member of node.methods.filter(method=>['get','set'].includes(method.kind))){
            if(!properties.has(member.name))properties.set(member.name,{name:member.name,accessor:{},modifiers:member.modifiers||[],isStatic:member.isStatic});
            const field=properties.get(member.name);if(field.accessor[member.kind])field.duplicateAccessor=true;field.accessor[member.kind]=member;
        }
        for(const field of properties.values()){const get=field.accessor.get,set=field.accessor.set;field.typeName=(typeof get?.returnType==='string'?get.returnType:get?.returnType?.text)||(typeof set?.paramTypes?.[set.params[0]]==='string'?set.paramTypes[set.params[0]]:set?.paramTypes?.[set.params[0]]?.text)||'any';field.modifiers=[...(get?.modifiers||set?.modifiers||[]),...(get&&!set?['readonly']:[])];}
        const normalized={...node,fields:[...node.fields,...properties.values()],...(node.base?{base:sdkClassName(node.base)}:{})};
        classOrigins.set(normalized,node);for(const method of node.methods)methodOrigins.set(method,method);
        return normalized;
    });
    const classes = new Map(sourceClasses.map(node => [node.name, node]));
    const hasWhenUsed=program.body.some(node=>node.type==='Declaration' && node.decls.some(decl=>decl.whenUsed));
    if (!classes.size && !dialogRequested && !hasWhenUsed) return {program, unsupported: [], skip:true};
    const sdkClasses=[...(sourceClasses.some(node=>['Sprite','__bwSDK_ExtendableSprite'].includes(node.base))?SDK_SPRITE_CLASS_NODES:[]),...(dialogRequested||sourceClasses.some(node=>SDK_DIALOG_CLASS_NODES.some(base=>base.name===node.base))?SDK_DIALOG_CLASS_NODES:[])];
    const originalClasses=new Map(classes);classes.clear();for(const node of sdkClasses)classes.set(node.name,node);for(const [name,node]of originalClasses)classes.set(name,node);
    const unsupported = [], admitted = new Map();
    const fail = message => { if (!unsupported.includes(message)) unsupported.push(message); };
    for (const [name, cls] of [...sdkClasses.filter(node=>classes.get(node.name)===node).map(node=>[node.name,node]),...sourceClasses.map(node=>[node.name,node])]) {
        const problems = [...(cls.unsupported || [])].filter(problem=>!(classCallablePrototype && problem==='generic class methods' && cls.methods.filter(method=>method.typeParameters?.length).every(method=>callableMethod(name,method.name))));
        if(cls.fields.some(field=>field.typeName && !callableField(name,field.name) && !/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*(?:\[\])*$/.test(field.typeName)))problems.push('union, callable or opaque field type metadata');
        if(cls.fields.some(field=>contains(field.init,node=>node.type==='Identifier' && node.name==='this')))problems.push('selected Arcade SDK instance-field this initializers');
        const originalDefault=value=>['Number','Boolean','Null'].includes(value?.type) || value?.type==='Unary' && ['+','-'].includes(value.op) && value.argument?.type==='Number';
        if([cls.ctor,...cls.methods].filter(Boolean).some(member=>member.parameterDefaults?.some(param=>!originalDefault(param.value))))problems.push('selected Arcade SDK nonliteral default arguments');
        if(contains(cls,node=>node.type==='FunctionDeclaration'))problems.push('nested function declarations');
        if (cls.fields.some(field => field.isStatic)) problems.push('static fields');
        if (cls.methods.some(method => method.isStatic)) problems.push('static methods or accessors');
        if(new Set(cls.fields.map(field=>field.name)).size!==cls.fields.length || cls.fields.some(field=>field.duplicateAccessor))problems.push('duplicate field or accessor declarations');
        if(cls.methods.some(method=>method.kind==='method' && cls.fields.some(field=>field.name===method.name)))problems.push('field or accessor conflicts with a method');
        for(const field of cls.fields.filter(field=>field.accessor?.get&&field.accessor?.set)){const get=field.accessor.get,set=field.accessor.set,param=set.paramTypes?.[set.params[0]],type=typeof param==='string'?param:param?.text;const mode=member=>member.modifiers?.find(value=>['private','protected'].includes(value))||'public';if(field.typeName!=='any'&&type&&type!=='any'&&field.typeName!==type)problems.push('getter and setter type mismatch');if(mode(get)!==mode(set))problems.push('getter and setter visibility mismatch');}
        for(const method of cls.methods.filter(method=>['get','set'].includes(method.kind))){if(method.params.length!==(method.kind==='get'?0:1))problems.push('accessor parameter count');if(method.optionalParams?.length || method.parameterDefaults?.length)problems.push('selected Arcade SDK optional or default accessor parameters');if(method.kind==='get'&&!contains(method.body,node=>node.type==='Return'&&node.value))problems.push('selected Arcade SDK getter must return a value');if(method.kind==='set'&&contains(method.body,node=>node.type==='Return'&&node.value))problems.push('selected Arcade SDK setter cannot return a value');}
        if (contains(classCallablePrototype?{fields:cls.fields,methods:cls.methods.map(method=>({...method,originalBody:undefined})),ctor:cls.ctor?{...cls.ctor,originalBody:undefined}:null}:cls, node => node.type === 'FunctionExpression')) problems.push('function-valued fields or captured callbacks');
        if (cls.fields.some(field => !callableField(name,field.name) && /=>|\bFunction\b/.test(field.typeName || ''))) problems.push('function field types');
        if (problems.length) { fail(`Class ${name} requires unsupported ${problems.join(', ')}`); continue; }
        admitted.set(name, cls);
    }
    const lineage = name => {const result=[],seen=new Set();while(name){if(seen.has(name)||!admitted.has(name))return null;seen.add(name);result.push(name);name=admitted.get(name).base;}return result;};
    for(const [name,cls]of admitted){
        const chain=lineage(name);
        if(cls.base && [...classes.keys()].indexOf(cls.base)>=[...classes.keys()].indexOf(name))fail(`Selected Arcade SDK requires parent declaration order before ${name}`);
        if(!chain){fail(`Class ${name} requires unsupported or cyclic parent ${cls.base}`);continue;}
        if(cls.sdkIntrinsic)continue;
        if(chain.some(base=>admitted.get(base)?.sdkIntrinsic==='SplashDialog'))fail('User SplashDialog subclasses require separate native dispatch qualification');
        if(chain.some(base=>admitted.get(base)?.sdkIntrinsic==='BaseDialog') && cls.methods.some(method=>
            ['resize','drawBorder','clearInterior','drawPartial','fastFill','drawCursorRow','setText','setFont','cursorRowHeight','rowHeight','textAreaWidth','textAreaHeight'].includes(method.name)))
            fail('SDK BaseDialog constructor or layout override requires separate native dispatch qualification');
        const extendable=chain.some(base=>admitted.get(base)?.sdkIntrinsic==='ExtendableSprite');
        // A source method without a returned expression has an inferred void
        // result. Preserve that proven signature in editable class metadata;
        // an unresolved result must not weaken native update validation.
        if(extendable)cls.methods=cls.methods.map(method=>{
            if(method.name!=='update'||method.returnType||contains(method.body,node=>node.type==='Return'&&node.value))return method;
            const normalized={...method,returnType:'void'};methodOrigins.set(normalized,methodOrigins.get(method)||method);return normalized;
        });
        if(chain.some(base=>['BaseSprite','Sprite','ExtendableSprite'].includes(admitted.get(base)?.sdkIntrinsic)) && cls.methods.some(method=>
            ['update','draw','drawSprite','__draw','__drawCore','__update','setHitbox','resetHitbox','recalcSize','setDimensions','__visible','__serialize'].includes(method.name) && !(extendable && method.name==='update')))
            fail('SDK Sprite draw/update/hitbox overrides require separate qualification');
        if(cls.base && cls.ctor){
            const body=cls.ctor.originalBody || cls.ctor.body,superCall=node=>node?.type==='ExpressionStatement' && node.expr?.type==='Call' && node.expr.callee?.name==='super';
            if(body.filter(superCall).length!==1)fail('Derived class '+name+' constructor requires one direct super call');
            if((cls.fields.some(field=>field.init)||cls.ctor.parameterProperties?.length) && !superCall(body[0]))fail('Selected Arcade SDK requires super first before initialized fields or parameter properties in '+name);
            const first=body.findIndex(superCall);if(first>0 && body.slice(0,first).some(node=>contains(node,value=>value.type==='Identifier'&&value.name==='this')))fail('Derived class '+name+' uses this before super');
        }
        for(const field of cls.fields)for(const base of chain.slice(1)){const other=admitted.get(base).fields.find(other=>other.name===field.name);if(other){if(!field.accessor||!other.accessor)fail('Redefinition of inherited class field '+field.name);else if(field.typeName!=='any'&&other.typeName!=='any'&&field.typeName!==other.typeName)fail('Class accessor override type differs from its base property '+field.name);}}
        for(const method of cls.methods.filter(method=>method.kind==='method'))if(chain.slice(1).some(base=>admitted.get(base).fields.some(field=>field.name===method.name)))fail('Inherited field or accessor conflicts with class method '+method.name);
        for(const field of cls.fields)if(chain.slice(1).some(base=>admitted.get(base).methods.some(method=>method.kind==='method'&&method.name===field.name)))fail('Class field or accessor conflicts with inherited method '+field.name);
        for(const method of cls.methods){const parent=chain.slice(1).flatMap(base=>admitted.get(base).methods).find(other=>other.name===method.name && other.kind===method.kind);if(parent){const visibility=value=>value.modifiers?.find(mode=>['private','protected'].includes(mode)) || 'public',baseMode=visibility(parent),mode=visibility(method);if(baseMode==='private' || baseMode==='public'&&mode!=='public' || baseMode==='protected'&&mode==='private')fail('Class override visibility differs from its accessible base method '+method.name);if(method.params.length!==parent.params.length || method.params.some((param,index)=>JSON.stringify(typeof method.paramTypes?.[param]==='string'?method.paramTypes[param]:method.paramTypes?.[param]?.text)!==JSON.stringify(typeof parent.paramTypes?.[parent.params[index]]==='string'?parent.paramTypes[parent.params[index]]:parent.paramTypes?.[parent.params[index]]?.text)))fail('Class override parameter signature differs from its base method '+method.name);}}
    }
    if(unsupported.length)return {program,unsupported};
    return {program,unsupported,callableModel,liftedCallables,callableClass,callableField,callableMethod,sdkField,sdkParameter,contains,dialogName,sourceClasses,sdkClasses,classes,admitted,lineage,methodOrigins,classOrigins};
}
