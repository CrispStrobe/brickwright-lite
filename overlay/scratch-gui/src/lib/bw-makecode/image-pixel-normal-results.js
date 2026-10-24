import {inspectGeneratedHelperBindings} from './generated-helper-recognition.js';
import {analyseCallableBindings} from './callable-bindings.js';
import {parseExactImgLiteral} from './arcade-assets.js';

// A separate, deliberately closed entry interpreter. Its private Image/Array
// origins never enter the general value graph or the clone exposure API.
// SDK contract: screen/image.d.ts ImageMethods::getPixel(int32,int32):int32;
// image.cpp returns getCore or zero, common-sim returns pix or zero. Only an
// actual issued Image and primitive integer arguments select that contract.
export function imagePixelNormalResults(program,profile) {
    const refused=()=>Object.freeze({current:()=>false,has:()=>false});
    const seen=new WeakSet(),activeData=new WeakSet(),absences=[];
    const slots=['type','kind','name','body','params','decls','init','expr','value','tag','items','op','callee','args','left','right','object','index','argument','expression','test','consequent','alternate','isNew','constructorCall','typeArguments','parameterDefaults','optionalParams','ordinaryParameterDefaultNames','parameterProperties','typeParameters','genericParams','parameterDefaultPrologue','restParam','async','generator','isAsync','isGenerator'];
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
    let syntax,lexical;
    try{if(!data(program))return refused();syntax=inspectGeneratedHelperBindings(program,profile);if(!syntax.isCurrent())return refused();lexical=analyseCallableBindings(program);}
    catch{return refused();}
    let live=true,eligible=false,failed=false,steps=0,images=0;
    const results=new WeakSet(),writes=new Set(),done=new Set(),functions=new Map(),running=new Set(),state=new Map(),constants=new Set();
    const current=()=>{
        if(live)try{
            if(!syntax.isCurrent()||absences.some(({value,key})=>Object.hasOwn(value,key)||key in value))live=false;
        }catch{live=false;}
        return live;
    };
    const answer=()=>Object.freeze({current,has:node=>eligible&&current()&&results.has(node)});
    const fail=()=>{failed=true;return null;};
    const own=(node,key)=>Object.getOwnPropertyDescriptor(node,key)?.value;
    const list=value=>Array.isArray(value)&&Number.isSafeInteger(value.length)&&value.length<=100000;
    const unwrap=node=>node?.type==='Parenthesized'?unwrap(node.expression):node;
    const binding=node=>lexical.references.get(node);
    const declaration=(node,name)=>lexical.scopes.get(node)?.names.get(name);
    const undefinedValue=Object.freeze({kind:'Undefined'}),nullValue=Object.freeze({kind:'Null'});
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
    const plainCall=node=>!node.isNew&&!node.constructorCall&&!Object.hasOwn(node,'typeArguments')&&list(node.args);
    const allowedTypes=new Set(['Program','FunctionDeclaration','Declaration','ExpressionStatement','Return','If','Number','String','Boolean','Null','Undefined','Identifier','Array','Template','Binary','Unary','Parenthesized','Assignment','Call','Member','Index']);
    if(program?.type!=='Program'||!list(program.body)||program.body.some(node=>node.type==='Return'))return answer();
    // Every possible entry is an immutable direct source call. Definitions may
    // retain unreachable fallback bodies; no escaping function value, callback,
    // unknown executable node or unexecuted writer can borrow this exclusion.
    for(const node of syntax.nodes){
        if(!allowedTypes.has(node.type)){
            const parent=syntax.parentOf(node);
            if(node.type===undefined&&parent?.type==='Declaration'&&parent.decls.includes(node))continue;
            return answer();
        }
        if(node.type==='FunctionDeclaration'){
            const scope=lexical.functions.find(scope=>scope.node===node),key=lexical.global.names.get(node.name);
            if(!scope||scope.parent!==lexical.global||scope.unsupported?.length||!syntax.root(node)||!list(node.params)||!list(node.body)||!noDefaults(node)||
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
            if(node.op!=='='||node.left?.type!=='Identifier')return answer();writes.add(node);
        }
        if(node.type==='Template'&&(node.tag!=='img'||typeof node.value!=='string'))return answer();
        if(node.type==='Identifier'&&!binding(node)){
            const parent=syntax.parentOf(node),call=parent&&syntax.parentOf(parent);
            if(node.name!=='console'||parent?.type!=='Member'||parent.object!==node||parent.name!=='log'||call?.type!=='Call'||call.callee!==parent)return answer();
        }
    }
    const expr=node=>{
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
            return items.every(value=>value?.kind==='Image')?{kind:'Array',site:node,items}:fail();
        }
        if(node.type==='Index'){
            const receiver=expr(node.object),index=expr(node.index);
            return receiver?.kind==='Array'&&numeric(index)&&Number.isSafeInteger(index.value)&&index.value>=0&&index.value<receiver.items.length?receiver.items[index.value]:fail();
        }
        if(node.type==='Member'){
            const receiver=expr(node.object);
            if(node.name!=='length'||receiver?.kind!=='Array')return fail();
            results.add(node);return primitive('Number',receiver.items.length);
        }
        if(node.type==='Unary'){
            const value=expr(node.argument);
            if(node.op==='!'&&constant(value)&&value.kind==='Boolean')return primitive('Boolean',!value.value);
            if(!['+','-'].includes(node.op)||!numeric(value))return fail();
            return constant(value)?primitive('Number',node.op==='-'?-value.value:+value.value):{kind:'Number'};
        }
        if(node.type==='Binary'){
            const a=expr(node.left),b=expr(node.right);
            if(!scalar(a)||!scalar(b))return fail();
            if(['===','!==','==','!='].includes(node.op)&&constant(a)&&constant(b)){
                const equal=a.kind===b.kind&&a.value===b.value;
                // No cross-kind coercion is modeled by a dispatch certificate.
                if(a.kind!==b.kind)return fail();
                return primitive('Boolean',node.op==='==='||node.op==='=='?equal:!equal);
            }
            if(node.op==='+'&&constant(a)&&constant(b)&&(a.kind==='String'||b.kind==='String'))return primitive('String',a.value+b.value);
            if(!numeric(a)||!numeric(b)||!['+','-','*','/','%','&','|','^','<<','>>','>>>'].includes(node.op))return fail();
            if(!constant(a)||!constant(b))return {kind:'Number'};
            const x=a.value,y=b.value;
            const value=node.op==='+'?x+y:node.op==='-'?x-y:node.op==='*'?x*y:node.op==='/'?x/y:node.op==='%'?x%y:node.op==='&'?x&y:node.op==='|'?x|y:node.op==='^'?x^y:node.op==='<<'?x<<y:node.op==='>>'?x>>y:x>>>y;
            return primitive('Number',value);
        }
        if(node.type==='Assignment'){
            const key=binding(node.left),value=expr(node.right);
            if(!key||functions.has(key)||constants.has(key)||!state.has(key)||!value)return fail();
            state.set(key,value);done.add(node);return value;
        }
        if(node.type==='Call'){
            if(!plainCall(node))return fail();const callee=unwrap(node.callee);
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
            if(callee?.type!=='Member')return fail();
            // No console or listener exemption. A reached fallback refuses,
            // even if every argument is text and its result is unused.
            const receiver=expr(callee.object),args=node.args.map(expr);
            if(failed||receiver?.kind!=='Image')return fail();
            if(callee.name==='clone'&&args.length===0){images++;return {kind:'Image',site:node,width:receiver.width,height:receiver.height};}
            if(callee.name!=='getPixel'||args.length!==2||!args.every(arg=>numeric(arg)&&Number.isSafeInteger(arg.value)))return fail();
            // Pixel coordinates outside the image return numeric zero in the
            // actual SDK; Array receiver indices above were separately bounded.
            results.add(node);return {kind:'Number'};
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
    try{body(program.body);eligible=!failed&&images>0&&[...writes].every(node=>done.has(node))&&current();}
    catch{eligible=false;live=false;}
    return answer();
}
