import {physicalUpdateSourceSnapshot} from './physical-update-source-snapshot.js';
import {SDK_SPRITE_CLASS_NODES} from './sdk-sprite-class-descriptors.js';
import {inspectGeneratedHelperBindings} from './generated-helper-recognition.js';
import {analyseCallableBindings} from './callable-bindings.js';
import {parseExactImgLiteral} from './arcade-assets.js';
const imageRound=Math.round;
// Pinned original SDK data identities; qualification reads these files as data.
export const MUTABLE_IMAGE_PIXEL_CPP_SHA256='74b51956789d8cc6da461415ae80a5016e207b140ae190ebfc60fa022baac193';
export const MUTABLE_IMAGE_PIXEL_DTS_SHA256='bc899eb68811bf8f03a2844d5d8bfaa96d6a1e8c91765a84d5e7aa734d57d991';

// The mutable profile is a separate issuer; callers cannot enroll it through
// options or a source flag. The old immutable-list API retains its old gates.
const mutableMode=Symbol('closed mutable pixel profile');
const mutableDescriptor=Object.getOwnPropertyDescriptor,mutableKeys=Reflect.ownKeys,mutableProto=Object.getPrototypeOf,mutableSame=Object.is,mutableOwn=Object.hasOwn,mutableFreeze=Object.freeze,mutableWeakHas=WeakSet.prototype.has,mutableApply=Reflect.apply;
const mutableRealm=globalThis,mutableAliases=['Object','Array','Map','Set','WeakMap','WeakSet','Reflect','JSON','Number','String','Boolean','Function','Math'];
const mutableGlobals=mutableAliases.map(name=>[name,mutableDescriptor(mutableRealm,name)]);
const mutableAmbient=[Object,Object.prototype,Array,Array.prototype,Map,Map.prototype,Set,Set.prototype,WeakMap,WeakMap.prototype,WeakSet,WeakSet.prototype,Reflect,JSON,Number,Number.prototype,String,String.prototype,Boolean,Boolean.prototype,Function,Function.prototype,Math,mutableProto([][Symbol.iterator]()),mutableProto(new Map()[Symbol.iterator]()),mutableProto(new Set()[Symbol.iterator]())].map(object=>({object,parent:mutableProto(object),fields:mutableKeys(object).map(key=>[key,mutableDescriptor(object,key)])}));
const mutableDescriptorEqual=(a,b)=>{
 if(!a||!b)return false;const fields=['enumerable','configurable','writable','value','get','set'];
 for(let i=0;i<fields.length;i++){const key=fields[i],hasA=mutableOwn(a,key),hasB=mutableOwn(b,key);if(hasA!==hasB||hasA&&!mutableSame(a[key],b[key]))return false;}return true;
};
const mutableRealmCurrent=()=>{
 for(let i=0;i<mutableGlobals.length;i++)if(!mutableDescriptorEqual(mutableDescriptor(mutableRealm,mutableGlobals[i][0]),mutableGlobals[i][1]))return false;
 for(let i=0;i<mutableAmbient.length;i++){const row=mutableAmbient[i],names=mutableKeys(row.object);if(mutableProto(row.object)!==row.parent||names.length!==row.fields.length)return false;for(let j=0;j<names.length;j++)if(names[j]!==row.fields[j][0]||!mutableDescriptorEqual(mutableDescriptor(row.object,names[j]),row.fields[j][1]))return false;}return true;
};
const mutableSdkSnapshot=physicalUpdateSourceSnapshot(SDK_SPRITE_CLASS_NODES);
const mutableDenied=()=>mutableFreeze({current:()=>false,has:()=>false});

export function imagePixelNormalResults(program,profile){return inspectPixelResults(program,profile,null);}
export function mutableImagePixelNormalResults(program,profile){return inspectPixelResults(program,profile,mutableMode);}

// A separate, deliberately closed entry interpreter. Its private Image/Array
// origins never enter the general value graph or the clone exposure API.
// SDK contract: screen/image.d.ts ImageMethods::getPixel(int32,int32):int32;
// image.cpp returns getCore or zero, common-sim returns pix or zero. Only an
// actual issued Image and primitive integer arguments select that contract.
function inspectPixelResults(program,profile,mode) {
    const mutable=mode===mutableMode;
    if(mutable)try{if(!mutableRealmCurrent()||!mutableSdkSnapshot?.current())return mutableDenied();}catch{return mutableDenied();}
    const refused=()=>mutable?mutableDenied():Object.freeze({current:()=>false,has:()=>false,isImageValue:()=>false,isPrimitiveValue:()=>false});
    const seen=new WeakSet(),activeData=new WeakSet(),absences=[];
    const slots=['type','kind','name','body','params','decls','init','expr','value','tag','items','op','callee','args','left','right','object','index','argument','expression','test','consequent','alternate','isNew','constructorCall','typeArguments','parameterDefaults','optionalParams','ordinaryParameterDefaultNames','parameterProperties','typeParameters','genericParams','parameterDefaultPrologue','restParam','async','generator','isAsync','isGenerator','exported','optional','computed'];
    const data=value=>{
        if(typeof value==='function')return false;
        if(!value||typeof value!=='object')return true;
        if(activeData.has(value))return false;if(seen.has(value))return true;
        const proto=Object.getPrototypeOf(value);if(proto!==null&&proto!==Object.prototype&&proto!==Array.prototype)return false;
        const descriptors=new Map();
        for(const key of Reflect.ownKeys(value)){
            const d=Object.getOwnPropertyDescriptor(value,key);
            if(typeof key!=='string'||!d||!Object.hasOwn(d,'value'))return false;
            descriptors.set(key,d);
        }
        for(const key of slots)if(!descriptors.has(key)){
            if(key in value)return false;absences.push({value,key});
        }
        if(Array.isArray(value)){
            const length=descriptors.get('length')?.value;
            if(!Number.isSafeInteger(length)||length>100000)return false;
            for(let i=0;i<length;i++)if(!descriptors.has(String(i)))return false;
        }
        seen.add(value);activeData.add(value);
        for(const d of descriptors.values())if(!data(d.value))return false;
        activeData.delete(value);return true;
    };
    let syntax,lexical,mutableSource=null;
    try{if(!data(program))return refused();syntax=inspectGeneratedHelperBindings(program,profile);if(!syntax.isCurrent())return refused();lexical=analyseCallableBindings(program);if(mutable){mutableSource=physicalUpdateSourceSnapshot(program);if(!mutableSource)return refused();}}
    catch{return refused();}
    let live=true,eligible=false,numberEligible=true,failed=false,steps=0,images=0;
    const imageObservations=new WeakMap(),primitiveObservations=new WeakMap();
    const results=new WeakSet(),pixelResults=new WeakSet(),mutableEffects=new Set(),completedEffects=new Set(),writes=new Set(),done=new Set(),functions=new Map(),running=new Set(),state=new Map(),constants=new Set();
    const current=()=>{
        if(live)try{
            if(mutable){
                if(!mutableRealmCurrent()||!mutableSdkSnapshot.current()||!mutableSource.current()||!syntax.isCurrent())live=false;
                if(live)for(let i=0;i<absences.length;i++){const {value,key}=absences[i];if(mutableOwn(value,key)||key in value){live=false;break;}}
            }else if(!syntax.isCurrent()||absences.some(({value,key})=>Object.hasOwn(value,key)||key in value))live=false;
        }catch{live=false;}
        return live;
    };
    const answer=()=>mutable?mutableFreeze({current,has:node=>eligible&&mutableApply(mutableWeakHas,pixelResults,[node])&&current()}):Object.freeze({current,has:node=>eligible&&numberEligible&&current()&&results.has(node),
        isImageValue:node=>eligible&&current()&&imageObservations.get(node)===true,
        isPrimitiveValue:node=>eligible&&current()&&primitiveObservations.get(node)===true});
    const fail=()=>{failed=true;return null;};
    const own=(node,key)=>Object.getOwnPropertyDescriptor(node,key)?.value;
    const list=value=>Array.isArray(value)&&Number.isSafeInteger(value.length)&&value.length<=100000;
    const unwrap=node=>node?.type==='Parenthesized'?unwrap(node.expression):node;
    const binding=node=>lexical.references.get(node);
    const declaration=(node,name)=>lexical.scopes.get(node)?.names.get(name);
    const undefinedValue=Object.freeze({kind:'Undefined',value:undefined}),nullValue=Object.freeze({kind:'Null',value:null});
    const numeric=value=>value?.kind==='Number';
    const scalar=value=>value&&['Number','String','Boolean','Null','Undefined'].includes(value.kind);
    const constant=value=>scalar(value)&&Object.hasOwn(value,'value');
    const primitive=(kind,value)=>({kind,value});
    const numberValue=node=>{
        const value=node.value;
        if(typeof value!=='string'||!/^(?:0[xX][\da-fA-F]+|0[bB][01]+|0[oO][0-7]+|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)$/.test(value))return null;
        const n=Number(value);return Number.isFinite(n)?primitive('Number',n):null;
    };
    const stringValue=node=>{
        // This parser retains the unquoted raw token, including escapes.
        // Decline escaped tokens instead of inventing a second decoder.
        return typeof node.value==='string'&&!/[\\\r\n]/.test(node.value)?primitive('String',node.value):null;
    };
    const noDefaults=fn=>[fn,fn.params].every(value=>['parameterDefaults','optionalParams','ordinaryParameterDefaultNames','parameterProperties','typeParameters','genericParams'].every(key=>
        !Object.hasOwn(value,key)||list(own(value,key))&&own(value,key).length===0))&&
        ['async','generator','isAsync','isGenerator'].every(key=>!Object.hasOwn(fn,key)||own(fn,key)===false)&&!Object.hasOwn(fn,'restParam');
    const plainCall=node=>!node.isNew&&!node.constructorCall&&!node.optional&&!Object.hasOwn(node,'typeArguments')&&list(node.args)&&!node.args.some(arg=>arg?.type==='Spread');
    const int32=value=>numeric(value)&&constant(value)&&Number.isInteger(value.value)&&value.value>=-2147483648&&value.value<=2147483647;
    const imageFactory=node=>node?.type==='Call'&&plainCall(node)&&node.args.length===2&&node.callee?.type==='Member'&&
        !node.callee.optional&&!node.callee.computed&&node.callee.name==='create'&&node.callee.object?.type==='Identifier'&&
        node.callee.object.name==='image'&&!binding(node.callee.object);
    const roundedIndex=node=>node?.type==='Call'&&plainCall(node)&&node.args.length===1&&node.callee?.type==='Member'&&
        !node.callee.optional&&!node.callee.computed&&node.callee.name==='round'&&node.callee.object?.type==='Identifier'&&
        node.callee.object.name==='Math'&&!binding(node.callee.object);
    const spriteFactory=node=>mutable&&node?.type==='Call'&&plainCall(node)&&node.args.length===2&&node.callee?.type==='Member'&&!node.callee.optional&&!node.callee.computed&&node.callee.name==='create'&&node.callee.object?.type==='Identifier'&&node.callee.object.name==='sprites'&&!binding(node.callee.object);
    const builtinKinds=new Map();for(const name of ['Player','Projectile','Food','Enemy'])builtinKinds.set(name,Object.freeze({kind:'BuiltinSpriteKind',name}));
    const builtinKind=node=>mutable&&node?.type==='Member'&&!node.optional&&!node.computed&&node.object?.type==='Identifier'&&node.object.name==='SpriteKind'&&!binding(node.object)&&builtinKinds.has(node.name);
    if(mutable)for(const entry of lexical.bindings)if(['sprites','SpriteKind','image','img','Image','Sprite','Fx','Fx8','Object','Array','Reflect','Math','eval','Function','globalThis'].includes(entry.name))return answer();
    const allowedTypes=new Set(['Program','FunctionDeclaration','Declaration','ExpressionStatement','Return','If','Number','String','Boolean','Null','Undefined','Identifier','Array','Template','Binary','Unary','Parenthesized','Assignment','Call','Member','Index']);
    if(program?.type!=='Program'||!list(program.body)||program.body.some(node=>node.type==='Return'))return answer();
    // Every possible entry is an immutable direct source call. Definitions may
    // retain unreachable fallback bodies; no escaping function value, callback,
    // unknown executable node or unexecuted writer can borrow this exclusion.
    for(const node of syntax.nodes){
        if(mutable&&(node.optional||node.computed))return answer();
        if(!allowedTypes.has(node.type)){
            const parent=syntax.parentOf(node);
            if(node.type===undefined&&parent?.type==='Declaration'&&parent.decls.includes(node))continue;
            return answer();
        }
        if(node.type==='FunctionDeclaration'){
            if(mutable){for(const value of [node,node.params]){if(!value||Object.hasOwn(value,'restParam')||Object.hasOwn(value,'parameterDefaultPrologue')||['async','generator','isAsync','isGenerator'].some(key=>Object.hasOwn(value,key)&&own(value,key)!==false))return answer();}}
            const scope=lexical.functions.find(scope=>scope.node===node),key=lexical.global.names.get(node.name);
            if(node.exported||!scope||scope.parent!==lexical.global||scope.unsupported?.length||!syntax.root(node)||!list(node.params)||!list(node.body)||!noDefaults(node)||
                new Set(node.params).size!==node.params.length||node.params.some(name=>typeof name!=='string'))return answer();
            // A formal and its owning FunctionDeclaration share .node in the
            // lexical index. Compare actual binding identity, not owner-node
            // identity; all genuine factory refs, including body refs, still
            // require a direct exact-arity call and cannot escape as a value.
            for(const reference of syntax.nodes){
                if(reference.type!=='Identifier'||binding(reference)!==key)continue;
                const call=syntax.parentOf(reference);
                if(call?.type!=='Call'||call.callee!==reference||!plainCall(call)||
                    call.args.length!==node.params.length||call.args.some(arg=>arg?.type==='Spread'))return answer();
            }
            functions.set(key,{node,scope});
        }
        if(node.type==='Declaration'){
            if(!Object.hasOwn(node,'kind')||!['let','const'].includes(node.kind)||!list(node.decls))return answer();
            for(const d of node.decls)writes.add(d);
        }
        if(node.type==='Assignment'){
            if((mutable?!['=','+=','-=','*=','/=','%='].includes(node.op):node.op!=='=')||node.left?.type!=='Identifier')return answer();writes.add(node);
        }
        if(node.type==='Template'&&(node.tag!=='img'||typeof node.value!=='string'))return answer();
        if(node.type==='Identifier'&&!binding(node)){
            const parent=syntax.parentOf(node),call=parent&&syntax.parentOf(parent);
            const consoleUse=!mutable&&node.name==='console'&&parent?.type==='Member'&&parent.object===node&&parent.name==='log'&&call?.type==='Call'&&call.callee===parent;
            const roundUse=node.name==='Math'&&roundedIndex(call)&&call.callee===parent&&parent.object===node;
            const spriteUse=mutable&&node.name==='sprites'&&spriteFactory(call)&&call.callee===parent&&parent.object===node;
            const kindUse=mutable&&node.name==='SpriteKind'&&builtinKind(parent)&&parent.object===node;
            if(!consoleUse&&!roundUse&&!spriteUse&&!kindUse&&!(node.name==='image'&&imageFactory(call)&&call.callee===parent&&parent.object===node))return answer();
        }
    }
    if(mutable)for(const node of syntax.nodes){
        if(node.type==='Call'&&node.callee?.type==='Member'){
            if(!['create','round','push','indexOf','getPixel','setPixel','fill','clone','setImage'].includes(node.callee.name))return answer();
            if(['push','setPixel','fill','setImage'].includes(node.callee.name))mutableEffects.add(node);
        }
    }
    // Record every normal observation of the SAME expression occurrence. A
    // later Image can never revive an occurrence once it returned anything else.
    const expr=node=>{
        const value=evaluate(node);
        if(node&&typeof node==='object'){
            imageObservations.set(node,imageObservations.get(node)!==false&&value?.kind==='Image');
            // A separate union, never a Number or initialization certificate.
            // In particular Image and Array observations cannot supply it.
            primitiveObservations.set(node,primitiveObservations.get(node)!==false&&!!scalar(value));
        }
        return value;
    };
    const binaryValue=(op,a,b)=>{
            if(failed||!a||!b)return fail();
            const object=value=>value.kind==='Image'||value.kind==='Array'||mutable&&value.kind==='Sprite';
            if(['===','!==','==','!='].includes(op)){
                const strict=op==='==='||op==='!==';let equal;
                if(mutable&&!strict&&(object(a)||object(b)))return fail();
                if(object(a)&&object(b))equal=a===b;
                else if(strict&&(object(a)||object(b)))equal=false;
                else {
                    if(a.kind==='Array'||b.kind==='Array')return fail();
                    const x=a.kind==='Image'?'[object Object]':constant(a)?a.value:null;
                    const y=b.kind==='Image'?'[object Object]':constant(b)?b.value:null;
                    if(a.kind!=='Image'&&!constant(a)||b.kind!=='Image'&&!constant(b))return fail();
                    equal=strict?x===y:x==y;
                }
                return primitive('Boolean',op==='!=='||op==='!='?!equal:equal);
            }
            if(mutable&&(!scalar(a)||!scalar(b)))return fail();
            // Arrays are identity transport only, never native coercion inputs.
            if(a.kind==='Array'||b.kind==='Array')return fail();
            if(!scalar(a)&&a.kind!=='Image'||!scalar(b)&&b.kind!=='Image')return fail();
            const x=a.kind==='Image'?'[object Object]':a.value,y=b.kind==='Image'?'[object Object]':b.value;
            if(!constant(a)&&a.kind!=='Image'||!constant(b)&&b.kind!=='Image'){
                if(!numeric(a)||!numeric(b)||!['+','-','*','/','%','&','|','^','<<','>>','>>>'].includes(op))return fail();
                return {kind:'Number'};
            }
            if(['<','>','<=','>='].includes(op))return primitive('Boolean',op==='<'?x<y:op==='>'?x>y:op==='<='?x<=y:x>=y);
            if(!['+','-','*','/','%','&','|','^','<<','>>','>>>'].includes(op))return fail();
            const value=op==='+'?x+y:op==='-'?x-y:op==='*'?x*y:op==='/'?x/y:op==='%'?x%y:op==='&'?x&y:op==='|'?x|y:op==='^'?x^y:op==='<<'?x<<y:op==='>>'?x>>y:x>>>y;
            return primitive(typeof value==='string'?'String':'Number',value);
    };
    const evaluate=node=>{
        if(++steps>100000)return fail();
        if(!node)return undefinedValue;
        if(node.type==='Number')return numberValue(node)||fail();
        if(node.type==='String')return stringValue(node)||fail();
        if(node.type==='Boolean')return typeof node.value==='boolean'?primitive('Boolean',node.value):fail();
        if(node.type==='Undefined')return undefinedValue;
        if(node.type==='Null')return nullValue;
        if(node.type==='Parenthesized')return expr(node.expression);
        if(node.type==='Identifier')return state.get(binding(node))||fail();
        if(node.type==='Template'){
            const image=parseExactImgLiteral('img`'+node.value+'`');
            if(!image||!image.width||!image.height||image.pixels.length!==image.width*image.height)return fail();
            images++;return {kind:'Image',site:node,width:image.width,height:image.height};
        }
        if(node.type==='Array'){
            if(!list(node.items))return fail();const items=node.items.map(expr);
            if(!items.every(value=>value?.kind==='Image'||scalar(value)))return fail();
            // Unrelated flat primitive lists do not change an Image's origin.
            // They remain outside the original Image-list Number theorem.
            if(items.some(value=>value.kind!=='Image'))numberEligible=false;
            return {kind:'Array',site:node,items};
        }
        if(node.type==='Index'){
            const receiver=expr(node.object),index=expr(node.index);
            return receiver?.kind==='Array'&&numeric(index)&&Number.isSafeInteger(index.value)&&index.value>=0&&index.value<receiver.items.length?receiver.items[index.value]:fail();
        }
        if(node.type==='Member'){
            if(builtinKind(node))return builtinKinds.get(node.name);
            const receiver=expr(node.object);
            if(node.name!=='length'||receiver?.kind!=='Array')return fail();
            results.add(node);return primitive('Number',receiver.items.length);
        }
        if(node.type==='Unary'){
            const value=expr(node.argument);
            if(node.op==='!'&&constant(value)&&value.kind==='Boolean')return primitive('Boolean',!value.value);
            if(!['+','-'].includes(node.op)||!numeric(value)&&value?.kind!=='Image')return fail();
            if(value.kind==='Image')return mutable?fail():primitive('Number',NaN);
            return constant(value)?primitive('Number',node.op==='-'?-value.value:+value.value):{kind:'Number'};
        }
        if(node.type==='Binary')return binaryValue(node.op,expr(node.left),expr(node.right));
        if(node.type==='Assignment'){
            const key=binding(node.left),prior=state.get(key),right=expr(node.right),value=node.op==='='?right:binaryValue(node.op.slice(0,-1),prior,right);
            if(!key||functions.has(key)||constants.has(key)||!state.has(key)||!value)return fail();
            state.set(key,value);done.add(node);return value;
        }
        if(node.type==='Call'){
            if(!plainCall(node))return fail();const callee=unwrap(node.callee);
            if(roundedIndex(node)){
                const index=expr(node.args[0]);if(!numeric(index))return fail();
                return constant(index)?primitive('Number',imageRound(index.value)):{kind:'Number'};
            }
            if(spriteFactory(node)){
                const image=expr(node.args[0]),kind=expr(node.args[1]);if(failed||image?.kind!=='Image'||kind?.kind!=='BuiltinSpriteKind')return fail();
                return {kind:'Sprite',site:node,image};
            }
            if(imageFactory(node)){
                const args=node.args.map(expr);if(failed||!args.every(int32)||args.some(value=>value.value<0))return fail();
                images++;return {kind:'Image',site:node,width:args[0].value,height:args[1].value};
            }
            if(callee?.type==='Identifier'){
                const record=functions.get(binding(callee));if(!record||running.has(record.node))return fail();
                const args=node.args.map(expr);if(failed||args.some(value=>!value)||args.length!==record.node.params.length)return fail();
                const locals=[...record.scope.names.values()],saved=locals.map(key=>[key,state.has(key),state.get(key)]);
                for(const key of locals)state.delete(key);
                record.node.params.forEach((name,i)=>state.set(record.scope.names.get(name),args[i]));
                running.add(record.node);const returned=body(record.node.body);running.delete(record.node);
                for(const [key,had,value]of saved)if(had)state.set(key,value);else state.delete(key);
                return returned?.returned?returned.value:undefinedValue;
            }
            if(callee?.type!=='Member'||callee.optional||callee.computed)return fail();
            // No console or listener exemption. A reached fallback refuses,
            // even if every argument is text and its result is unused.
            const receiver=expr(callee.object),args=node.args.map(expr);
            if(failed)return fail();
            // Canonical Sprite.setImage stores the supplied Image alias. With no
            // source callbacks/classes/overrides this path does not mutate its
            // pixels. No Sprite/Image-field fact leaves the mutable API.
            if(mutable&&receiver?.kind==='Sprite'){if(callee.name!=='setImage'||args.length!==1||args[0]?.kind!=='Image')return fail();receiver.image=args[0];completedEffects.add(node);return undefinedValue;}
            if(receiver?.kind==='Array'){
                if(callee.name==='push'&&args.length===1&&(args[0]?.kind==='Image'||scalar(args[0]))){
                    // The exporter constructs owned Image lists by push. Model
                    // their actual identity transport only for Image origins;
                    // this cannot widen the original immutable-list Number API.
                    numberEligible=false;if(mutable)completedEffects.add(node);
                    if(receiver.items.length>=100000)return fail();
                    receiver.items.push(args[0]);return primitive('Number',receiver.items.length);
                }
                if(callee.name!=='indexOf'||![1,2].includes(args.length)||!scalar(args[0])&&args[0]?.kind!=='Image'||
                    args.length===2&&!int32(args[1]))return fail();
                const needle=args[0],from=args.length===1?0:args[1].value;
                const relative=receiver.items.length+from;
                const start=from<0?(relative<0?0:relative):from;
                let index=-1;
                for(let position=start;position<receiver.items.length;position++){
                    if(++steps>100000)return fail();
                    const item=receiver.items[position];
                    if(item.kind!==needle.kind)continue;
                    if(item.kind==='Image'){
                        if(item!==needle)continue;
                    }else{
                        if(!constant(item)||!constant(needle))return {kind:'Number'};
                        if(item.value!==needle.value)continue;
                    }
                    index=position;break;
                }
                results.add(node);return primitive('Number',index);
            }
            if(receiver?.kind!=='Image')return fail();
            if(callee.name==='fill'&&args.length===1&&args.every(int32)||callee.name==='setPixel'&&args.length===3&&args.every(int32)){if(mutable)completedEffects.add(node);return undefinedValue;}
            if(callee.name==='clone'&&args.length===0){images++;return {kind:'Image',site:node,width:receiver.width,height:receiver.height};}
            if(callee.name!=='getPixel'||args.length!==2||!args.every(arg=>numeric(arg)&&Number.isSafeInteger(arg.value)))return fail();
            // Pixel coordinates outside the image return numeric zero in the
            // actual SDK; Array receiver indices above were separately bounded.
            results.add(node);if(mutable)pixelResults.add(node);return {kind:'Number'};
        }
        return fail();
    };
    const body=statements=>{
        if(!list(statements))return fail();
        for(const node of statements){
            if(++steps>100000)return fail();
            if(node.type==='FunctionDeclaration')continue;
            if(node.type==='Declaration'){
                for(const decl of node.decls){
                    const key=declaration(node,decl.name);if(!key||state.has(key))return fail();
                    const value=decl.init===null||decl.init===undefined?undefinedValue:expr(decl.init);
                    if(!value||node.kind==='const'&&(decl.init===null||decl.init===undefined))return fail();
                    state.set(key,value);if(node.kind==='const')constants.add(key);done.add(decl);
                }
            }else if(node.type==='ExpressionStatement')expr(node.expr);
            else if(node.type==='Return')return {returned:true,value:expr(node.value)};
            else if(node.type==='If'){
                const test=expr(node.test);if(test?.kind!=='Boolean'||!constant(test))return fail();
                const selected=test.value?node.consequent:node.alternate;
                if(selected!==null){const returned=body(selected);if(returned?.returned)return returned;}
            }else return fail();
            if(failed)return null;
        }
        return undefinedValue;
    };
    try{body(program.body);eligible=!failed&&images>0&&[...writes].every(node=>done.has(node))&&(!mutable||[...mutableEffects].every(node=>completedEffects.has(node)))&&current();}
    catch{eligible=false;live=false;}
    return answer();
}
