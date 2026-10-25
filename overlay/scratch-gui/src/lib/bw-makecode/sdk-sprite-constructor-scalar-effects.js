import {SDK_SPRITE_CLASS_NODES} from './sdk-sprite-class-descriptors.js';
import {analyseCallableBindings} from './callable-bindings.js';
import {nativeSdkSpriteSource} from './native-sdk-sprite-source.js';
import {prepareObjectClassStructure} from './object-class-source-structure.js';
import {inspectGeneratedHelperBindings,GENERATED_HELPER_PROFILES} from './generated-helper-recognition.js';
import {inspectNativeArrayAddHelpers} from './native-array-binary-helper-source.js';

const metadata=new Set(['originalBody','parameterDefaults','paramTypes','typeParameters','returnType','assertedType','ordinaryParameterDefaultNames','bwProcedureConstraintSource']);
const primitive=new Set(['Number','String','Boolean','Null','Undefined']);
const denied=Object.freeze({current:()=>true,typesAt:()=>null,initialized:()=>false});
const isArray=Array.isArray,own=Object.hasOwn,keys=Reflect.ownKeys,descriptor=Object.getOwnPropertyDescriptor,prototype=Object.getPrototypeOf,same=Object.is;
const safe=name=>typeof name==='string'&&/^[A-Za-z_$][\w$]*$/.test(name)&&!['constructor','prototype','__proto__','toString','valueOf'].includes(name);
// Denial only, never an issuer or enrollment API. Names come from selected
// Sprite/BaseSprite storage/methods, including non-authoring SDK internals.
// sprite.ts c452013b5ddea082; basesprite.ts fb70c1b080b984c1.
const reservedSdkMembers=new Set([
        'ax', 'ay', 'bottom', 'calcDimensionalHash', 'changeScale', 'clearObstacles', 'constructor',
        'data', 'destroy', 'destroyHandler', 'drawDebug', 'drawSay', 'drawSprite', 'flags',
        'follow', 'fx', 'fy', 'height', 'id', 'image', 'isHittingTile',
        'isOutOfScreen', 'isScaled', 'isStatic', 'kind', 'layer', 'left', 'lifespan',
        'onDestroyed', 'overlapsWith', 'recalcSize', 'registerObstacle', 'resetHitbox', 'right', 'rotation',
        'rotationDegrees', 'say', 'sayEndTime', 'sayRenderer', 'sayText', 'scale', 'setBounceOnWall',
        'setFlag', 'setHitbox', 'setImage', 'setKind', 'setPosition', 'setScale', 'setScaleCore',
        'setStayInScreen', 'setVelocity', 'startEffect', 'sx', 'sy', 'tileHitFrom', 'tileKindAt',
        'tilemapLocation', 'toString', 'top', 'unfollow', 'vx', 'vy', 'width',
        'x', 'y', 'z'
    ]);
for(const row of SDK_SPRITE_CLASS_NODES)for(const member of [...row.fields,...row.methods])reservedSdkMembers.add(member.name);
const reservedHas=Set.prototype.has,reservedApply=Reflect.apply;
export const isReservedSdkSpriteMember=name=>typeof name==='string'&&
    (name.length>0&&name[0]==='_'||reservedApply(reservedHas,reservedSdkMembers,[name]));

// Observe data descriptors only. Unlike a binding census, this snapshot also
// binds scalar argument values, original constructor bodies and call order.
const sourceCurrent=program=>{
    const rows=[],seen=new WeakSet(),active=new WeakSet();let live=true;
    const visit=value=>{
        if(!value||typeof value!=='object')return;
        if(active.has(value)||rows.length>=30000)throw 0;if(seen.has(value))return;
        const parent=prototype(value);if(parent!==Object.prototype&&parent!==Array.prototype&&parent!==null)throw 0;
        const names=keys(value),entries=[];seen.add(value);active.add(value);
        for(const key of names){const d=descriptor(value,key);if(typeof key!=='string'||!own(d,'value')||typeof d.value==='function')throw 0;entries.push(d);}
        if(Array.isArray(value))for(let i=0;i<value.length;i++)if(!own(value,String(i)))throw 0;
        rows.push({value,parent,names,entries});for(const d of entries)visit(d.value);active.delete(value);
    };
    try{visit(program);}catch{live=false;}
    return ()=>{
        if(live)try{for(const row of rows){const names=keys(row.value);if(prototype(row.value)!==row.parent||names.length!==row.names.length){live=false;break;}
            for(let i=0;i<names.length;i++){const a=descriptor(row.value,names[i]),b=row.entries[i];if(names[i]!==row.names[i]||!a||!own(a,'value')||!same(a.value,b.value)||a.writable!==b.writable||a.enumerable!==b.enumerable||a.configurable!==b.configurable){live=false;break;}}
            if(!live)break;
        }}catch{live=false;}return live;
    };
};

// A closed synchronous interpretation of actual source effects. It supplies
// occurrence-local primitive/readiness facts, never an instance, Image or
// generic initialization certificate. No caller can enroll a role or type.
export function sdkSpriteConstructorScalarEffects(program,profile=GENERATED_HELPER_PROFILES.ordinary){
    const data=(object,key)=>{const d=object&&typeof object==='object'?descriptor(object,key):null;return d&&own(d,'value')?d.value:undefined;};
    const body=data(program,'body'),length=data(body,'length');
    if(!isArray(body)||!Number.isSafeInteger(length)||length>10000)return denied;
    let selected=false;for(let i=0;i<length;i++){const node=data(body,String(i));if(data(node,'type')==='Class'&&data(node,'base')==='Sprite')selected=true;}
    if(!selected)return denied;
    const syntax=inspectGeneratedHelperBindings(program,profile),unchanged=sourceCurrent(program);
    if(!syntax.isCurrent()||!unchanged())return denied;
    const lexical=analyseCallableBindings(program),nodes=[],parents=new WeakMap();
    const scan=(node,parent=null)=>{if(!node||typeof node!=='object')return;if(Array.isArray(node)){for(const n of node)scan(n,parent);return;}nodes.push(node);parents.set(node,parent);for(const [key,value]of Object.entries(node))if(!metadata.has(key))scan(value,node);};
    scan(program);
    const sdk=nativeSdkSpriteSource(program,lexical,nodes,parents),base=sdk.base('Sprite');
    if(!base||prepareObjectClassStructure(program).unsupported.length)return denied;
    // These canonical SDK services close over the actual module namespaces.
    if(['Sprite','sprites','game','scene','Fx','Fx8','screen','Image','Math','control','Array'].some(name=>lexical.global.names.has(name)))return denied;
    const helperSyntax=inspectNativeArrayAddHelpers(program,profile),helpers=new Map([...helperSyntax.helpers.values()].map(row=>[row.declaration,row]));
    let live=true;
    const current=()=>{if(!live)return false;try{const valid=syntax.isCurrent()&&helperSyntax.current()&&sdk.current()&&unchanged();if(!valid)live=false;return valid;}catch(error){live=false;throw error;}};
    const failure=Object.freeze({}),fail=()=>{throw failure;};
    const result=new WeakMap(),actualNodes=new WeakSet(nodes),called=new Set(),active=new Set(),classes=new Map(),globals=new Map(),registrations=new Set(),writers=new Map(),primitiveReads=new Set();
    const scalar=(type,value)=>({type,value}),undefinedValue=scalar('Undefined'),nullValue=scalar('Null');
    const isPrimitive=value=>primitive.has(value?.type),isNumber=value=>value?.type==='Number';
    const write=(b,value)=>{if(['function','class'].includes(value?.type))fail();if(!writers.has(b))writers.set(b,new Set());writers.get(b).add(isPrimitive(value)?value.type:'Reference');};
    const observed=(b,value)=>{if(isPrimitive(value))primitiveReads.add(b);return value;};
    const remember=(node,value)=>{if(isPrimitive(value)){if(!result.has(node))result.set(node,new Set());result.get(node).add(value.type);}return value;};
    const binding=node=>lexical.references.get(node);
    const lookup=(node,frame)=>{
        const b=binding(node);if(!b)fail();
        if(b.kind==='receiver'){if(!frame.object)fail();return frame.object;}
        for(let current=frame;current;current=current.parent)if(current.values.has(b))return observed(b,current.values.get(b));
        if(globals.has(b))return observed(b,globals.get(b));fail();
    };
    const store=(node,value,frame)=>{
        const b=binding(node);if(!b||['class','function','receiver'].includes(b.kind))fail();write(b,value);
        if(b.scope===lexical.global){if(!globals.has(b)||value?.type==='instance'&&!value.complete)fail();globals.set(b,value);return;}
        for(let current=frame;current;current=current.parent)if(current.values.has(b)){current.values.set(b,value);return;}fail();
    };
    const closedParameters=fn=>{
        if(!Array.isArray(fn.params)||fn.params.some(name=>!safe(name))||new Set(fn.params).size!==fn.params.length)return false;
        for(const value of [fn,fn.params]){
            if(own(value,'restParam'))return false;
            for(const key of ['parameterDefaults','optionalParams','ordinaryParameterDefaultNames','typeParameters','genericParams'])if(value[key]?.length)return false;
            if(['async','isAsync','generator','isGenerator'].some(key=>value[key]))return false;
        }return true;
    };
    const sdkNames=new Set(reservedSdkMembers);

    const ancestors=new Set();let ancestor=base;
    while(ancestor){
        if(ancestors.has(ancestor)||!SDK_SPRITE_CLASS_NODES.includes(ancestor))return denied;ancestors.add(ancestor);
        for(const member of [...ancestor.fields,...ancestor.methods])sdkNames.add(member.name);
        const parent=ancestor.base;ancestor=parent?SDK_SPRITE_CLASS_NODES.find(row=>row.name===parent):null;if(parent&&!ancestor)return denied;
    }
    try{
        for(const node of program.body){
            if(node.type==='FunctionDeclaration'){
                const b=lexical.global.names.get(node.name);if(!b||b.node!==node||b.written||!closedParameters(node))fail();globals.set(b,{type:'function',node});
            }
            if(node.type!=='Class')continue;
            const b=lexical.global.names.get(node.name);
            if(!b||b.node!==node||b.written||node.base!=='Sprite'||node.isStatic||node.typeParameters?.length||node.unsupported?.length||!isArray(node.fields)||!isArray(node.methods)||!node.ctor||!closedParameters(node.ctor))fail();
            const properties=node.ctor.parameterProperties||[],parameterNames=new Set();
            if(!Array.isArray(properties))fail();
            for(const property of properties){if(!safe(property.name)||parameterNames.has(property.name)||!node.ctor.params.includes(property.name))fail();parameterNames.add(property.name);}
            const members=new Map();
            for(const field of node.fields){
                // A metadata flag cannot hide a real initializer's effects.
                if(field.parameterProperty!==undefined&&typeof field.parameterProperty!=='boolean'||
                    field.parameterProperty&&(field.init!=null||!parameterNames.has(field.name))||
                    parameterNames.has(field.name)&&field.parameterProperty!==true)fail();if(!safe(field.name)||field.name.startsWith('_')||field.isStatic||sdkNames.has(field.name)||members.has(field.name))fail();members.set(field.name,{field});}
            if([...parameterNames].some(name=>!members.get(name)?.field))fail();
            for(const method of node.methods){if(!safe(method.name)||method.name.startsWith('_')||method.isStatic||method.kind!=='method'||!closedParameters(method)||members.has(method.name)||sdkNames.has(method.name)&&!['setImage','setKind'].includes(method.name))fail();members.set(method.name,{method});}
            classes.set(b,{type:'class',node,members});
        }
    }catch(error){if(error!==failure)throw error;return denied;}
    if(!classes.size)return denied;
    const returned=Symbol();let steps=0;
    const binary=(op,a,b)=>{
        if(!isPrimitive(a)||!isPrimitive(b))fail();
        if(op==='+')return a.type==='String'||b.type==='String'?scalar('String'):scalar('Number',isNumber(a)&&isNumber(b)&&a.value!==undefined&&b.value!==undefined?a.value+b.value:undefined);
        if(!['-','*','/','%'].includes(op)||!isNumber(a)||!isNumber(b))fail();
        const x=a.value,y=b.value;return scalar('Number',x===undefined||y===undefined?undefined:op==='-'?x-y:op==='*'?x*y:op==='/'?x/y:x%y);
    };
    const invoke=(fn,args,object=null,method=null)=>{
        if(++steps>20000||active.size>=32||active.has(fn)||!closedParameters(fn)||args.length!==fn.params.length)fail();
        called.add(fn);active.add(fn);const scope=lexical.scopes.get(fn),frame={values:new Map(),parent:null,object,method,superCalls:0,constructor:object&&fn===object.cls.node.ctor};
        if(!scope)fail();for(let i=0;i<args.length;i++){const b=scope.names.get(fn.params[i]);if(!b||b.kind!=='parameter')fail();write(b,args[i]);frame.values.set(b,args[i]);}
        let response;
        try{
            if(frame.constructor){
                // PXT 13.2.1 emits parameter properties, initialized fields,
                // then the original body, including its explicit super call.
                const properties=fn.parameterProperties||[];
                if(!Array.isArray(fn.body)||!Array.isArray(properties)||fn.body.length<properties.length)fail();
                // The consumer's private view may clone or normalize body
                // expressions. originalBody is retained metadata, never an
                // effect or producer certificate for this executable body.
                const original=fn.body.slice(properties.length);
                for(let i=0;i<properties.length;i++){
                    const p=properties[i],st=fn.body[i],a=st?.expr;
                    if(st?.type!=='ExpressionStatement'||a?.type!=='Assignment'||a.op!=='='||a.left?.type!=='Member'||a.left.object?.name!=='this'||a.left.name!==p.name||a.right?.type!=='Identifier'||a.right.name!==p.name)fail();
                    expression(a,frame);
                }
                for(const field of object.cls.node.fields)if(!field.parameterProperty&&field.init){const value=expression(field.init,frame);if(!isPrimitive(value))fail();object.fields.set(field.name,value);}
                response=sequence(original,frame);if(frame.superCalls!==1||response?.[returned]&&response.value.type!=='Undefined')fail();
            }else response=sequence(fn.body,frame);
            if(method&&['setImage','setKind'].includes(method)&&frame.superCalls!==1)fail();
        }finally{active.delete(fn);}
        const value=response?.[returned]?response.value:undefinedValue;if(!isPrimitive(value))fail();return value;
    };
    // These are abstract NORMAL successors of the fixed selected SDK calls.
    // They do not execute SDK code or promise completion. Original calls and
    // possible errors remain in the consumer's untouched source expressions.
    const sdkStorage=owner=>({kind:'sdkStorage',owner});
    const sdkMethod=(object,name,args,frame)=>{
        if(!object.registered||!registrations.has(object)||!object.sdkPrefix)fail();
        if(name==='setImage'){
            if(args.length!==1||args[0]?.kind!=='sdkImage')fail();
            object.image=args[0];object.sdk.set('_image',args[0]);
            // Canonical recalcSize -> resetHitbox -> setHitbox ->
            // calculateHitBox reads only this genuine Image and reserved SDK
            // state. Hitbox retains another controlled SDK parent alias and
            // invokes canonical calcDimensionalHash. Every override/collision
            // on that call path is screened, with no source observer/yield.
            object.sdk.set('_width',scalar('Number'));object.sdk.set('_height',scalar('Number'));
            object.sdk.set('_hitbox',sdkStorage(object));object.imageReady=true;
        }else if(name==='setKind'){
            // Only the constructor's no-kind path. Registration or callbacks
            // for arbitrary source-selected kinds are outside this slice.
            if(args.length!==1||!isNumber(args[0])||args[0].value!==-1)fail();
            object.sdk.set('_kind',scalar('Number',-1));object.sdk.set('_kindsOverlappedWith',sdkStorage(object));object.kindReady=true;
        }else fail();
        frame.superCalls++;return undefinedValue;
    };
    const virtual=(object,name,args)=>{
        const method=object.cls.members.get(name)?.method;
        return method?invoke(method,args,object,name):sdkMethod(object,name,args,{superCalls:0});
    };
    const sdkConstructor=(object,args,frame)=>{
        if(frame.superCalls||object.registered||args.length!==1||args[0]?.kind!=='sdkImage')fail();
        frame.superCalls++;
        // BaseSprite: canonical z setter, then Scene.addSprite appends this
        // alias to SDK allSprites and assigns id. This is known SDK storage,
        // not nonescape: its selected implementation calls no user code.
        // Source Scene/registry observers, mutations, callbacks and yielding
        // are unmodeled operations and decline the complete interpretation.
        object.sdk.set('_z',scalar('Number'));registrations.add(object);object.registered=true;object.sdk.set('id',scalar('Number'));
        // Sprite constructor prefix precedes both virtual calls. Reserved
        // slots cannot be supplied by source fields/getters/overrides.
        for(const name of ['_x','_y','_lastX','_lastY','_vx','_vy','_ax','_ay','_fx','_fy','_sx','_sy','flags'])object.sdk.set(name,scalar('Number'));
        object.sdkPrefix=true;object.baseStarted=true;
        virtual(object,'setImage',args);virtual(object,'setKind',[scalar('Number',-1)]);
        // The actual selected constructor suffix follows the virtual calls.
        // Private collections do not issue Array or initialization authority.
        object.sdk.set('layer',scalar('Number',1));object.sdk.set('lifespan',undefinedValue);
        object.sdk.set('_overlappers',sdkStorage(object));object.sdk.set('_obstacles',sdkStorage(object));object.suffixReady=true;
        if(!object.registered||!object.sdkPrefix||!object.imageReady||!object.kindReady||!object.suffixReady)fail();
        object.baseComplete=true;return undefinedValue;
    };
    const fieldRead=(object,name)=>{
        if(object?.type!=='instance')fail();
        if(object.fields.has(name))return object.fields.get(name);
        if(['x','width'].includes(name)&&object.baseStarted&&object.imageReady)return scalar('Number');
        fail();
    };
    const expression=(node,frame)=>{
        if(++steps>20000||!node||!actualNodes.has(node))fail();let value;
        switch(node.type){
        case 'Parenthesized':value=expression(node.expression,frame);break;
        case 'Number':if(!['number','string'].includes(typeof node.value)||typeof node.value==='string'&&!node.value.trim()||Number.isNaN(Number(node.value)))fail();value=scalar('Number',Number(node.value));break;
        case 'String':if(typeof node.value!=='string')fail();value=scalar('String');break;
        case 'Boolean':if(typeof node.value!=='boolean')fail();value=scalar('Boolean',node.value);break;
        case 'Null':value=nullValue;break;
        case 'Undefined':value=undefinedValue;break;
        case 'Identifier':value=node.name==='super'?{type:'super',object:frame.object}:lookup(node,frame);break;
        case 'Template':value=sdk.literal(node,lexical.scopes.get(node));if(!value)fail();break;
        case 'Array':{if(!isArray(node.items))fail();const items=node.items.map(item=>expression(item,frame));if(items.some(item=>item?.kind!=='sdkImage'))fail();value={type:'images',items};break;}
        case 'Index':{const a=expression(node.object,frame),i=expression(node.index,frame);if(a.type!=='images'||!isNumber(i)||!Number.isSafeInteger(i.value)||i.value<0||i.value>=a.items.length)fail();value=a.items[i.value];break;}
        case 'Unary':{const a=expression(node.argument,frame);if(!['+','-'].includes(node.op)||!isNumber(a))fail();value=scalar('Number',a.value===undefined?undefined:node.op==='-'?-a.value:a.value);break;}
        case 'Binary':value=binary(node.op,expression(node.left,frame),expression(node.right,frame));break;
        case 'Member':value=fieldRead(expression(node.object,frame),node.name);break;
        case 'Assignment':{
            let object;if(node.left?.type==='Member')object=expression(node.left.object,frame);else if(node.left?.type!=='Identifier')fail();
            const old=node.op==='='?null:node.left.type==='Identifier'?lookup(node.left,frame):fieldRead(object,node.left.name);
            const right=expression(node.right,frame);value=node.op==='='?right:binary(node.op.slice(0,-1),old,right);
            if(node.left.type==='Identifier')store(node.left,value,frame);
            else{const member=object?.cls?.members.get(node.left.name);if(object?.type!=='instance'||!member?.field||!isPrimitive(value))fail();object.fields.set(node.left.name,value);}break;
        }
        case 'Call':{
            const callee=node.callee;
            if(!callee||!isArray(node.args)||node.optional||node.typeArguments?.length||node.constructorCall&&!node.isNew||node.args.some(arg=>arg.type==='Spread'))fail();
            if(callee.type==='Identifier'&&callee.name==='super'){
                if(!frame.constructor||node.isNew)fail();value=sdkConstructor(frame.object,node.args.map(arg=>expression(arg,frame)),frame);break;
            }
            if(callee.type==='Member'){
                if(node.isNew||callee.optional)fail();
                if(sdk.role(callee)==='round'){const args=node.args.map(arg=>expression(arg,frame));if(args.length!==1||!isNumber(args[0])||!Number.isFinite(args[0].value))fail();value=scalar('Number',Math.round(args[0].value));break;}
                const object=expression(callee.object,frame),args=node.args.map(arg=>expression(arg,frame));
                if(object.type==='images'&&callee.name==='push'){
                    if(args.length!==1||args[0]?.kind!=='sdkImage'||object.items.length>=2000)fail();object.items.push(args[0]);value=scalar('Number',object.items.length);break;
                }
                if(object?.kind==='sdkImage'&&callee.name==='clone'){value=sdk.clone(node,[object]);if(!value)fail();break;}
                if(object.type==='super'){
                    if(!frame.object||callee.name!==frame.method||frame.superCalls)fail();value=sdkMethod(frame.object,callee.name,args,frame);break;
                }
                if(object.type!=='instance'||!object.baseComplete||args.some(arg=>!isPrimitive(arg)))fail();
                const fn=object.cls.members.get(callee.name)?.method;if(!fn)fail();value=invoke(fn,args,object,callee.name);break;
            }
            if(callee.type!=='Identifier')fail();const target=lookup(callee,frame),args=node.args.map(arg=>expression(arg,frame));
            if(node.isNew){
                if(target.type!=='class'||args.some(arg=>!isPrimitive(arg)&&arg?.kind!=='sdkImage'))fail();
                const object={type:'instance',cls:target,fields:new Map(),sdk:new Map(),registered:false,sdkPrefix:false,imageReady:false,kindReady:false,suffixReady:false,baseStarted:false,baseComplete:false,complete:false};
                // Declared fields carry no value/readiness until an actual
                // parameter store, initializer or executed assignment.
                invoke(target.node.ctor,args,object);if(!object.baseComplete)fail();object.complete=true;value=object;break;
            }
            if(target.type!=='function')fail();
            if(helpers.has(target.node)){if(args.length!==2)fail();value=binary('+',args[0],args[1]);called.add(target.node);}
            else {if(args.some(arg=>!isPrimitive(arg)))fail();value=invoke(target.node,args);}break;
        }
        default:fail();
        }return remember(node,value);
    };
    const sequence=(body,frame)=>{
        if(!Array.isArray(body))fail();
        for(const st of body){if(++steps>20000)fail();
            if(st.type==='FunctionDeclaration'){if(!globals.has(lexical.global.names.get(st.name)))fail();continue;}
            if(st.type==='Class'){const b=lexical.global.names.get(st.name);if(!classes.has(b))fail();globals.set(b,classes.get(b));continue;}
            if(st.type==='Declaration'){
                if(st.kind!=='let')fail();for(const d of st.decls){const b=lexical.bindings.find(binding=>binding.node===d);if(!b)fail();const value=d.init?expression(d.init,frame):undefinedValue;write(b,value);
                    if(b.scope===lexical.global){if(globals.has(b))fail();globals.set(b,value);}else{if(frame.values.has(b))fail();frame.values.set(b,value);}}
            }else if(st.type==='ExpressionStatement')expression(st.expr,frame);
            else if(st.type==='Return')return {[returned]:true,value:st.value?expression(st.value,frame):undefinedValue};
            else fail();
        }return null;
    };
    try{
        sequence(program.body,{values:new Map(),parent:null,object:null});
        for(const scope of lexical.functions)if(!called.has(scope.node))fail();
        for(const b of primitiveReads)if([...writers.get(b)||[]].some(type=>!primitive.has(type)))fail();
        if(!current())fail();
    }catch(error){if(error!==failure)throw error;return denied;}
    return Object.freeze({current,typesAt(node){if(!current()||!result.has(node))return null;return [...result.get(node)];},initialized(node){if(!current()||!result.has(node))return false;return true;}});
}
