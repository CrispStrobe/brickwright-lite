import {analyseSourceValueProducers} from './source-value-producers.js';
import {multiplayerPlayerSourceCalls} from './multiplayer-player-source.js';
import {analyseCallableBindings} from './callable-bindings.js';
import {inspectGeneratedHelperBindings,GENERATED_HELPER_PROFILES} from './generated-helper-recognition.js';
import {physicalUpdateSourceSnapshot} from './physical-update-source-snapshot.js';
import {ARCADE_NAMESPACE_MEMBERS} from './arcade-namespace-members.js';

// Selected target bundled multiplayer/player.ts, inspected as DATA. MPState
// builds Player(i); registered controller closures pass that actual Player.
// Player._index stores i, number returns _index+1, and getProperty(Number)
// selects number. getPlayerProperty returns zero for null/undefined. Source
// writers/coercion/namespace closure below are required, not these annotations.
export const MULTIPLAYER_PLAYER_NUMBER_SOURCE_SHA256='03de34ae9da35c2a387bb5a5ce8be08117614e8d8f1d1a40c941d2afcb5136e0';

const freeze=Object.freeze,descriptor=Object.getOwnPropertyDescriptor,keys=Reflect.ownKeys;
const own=Object.hasOwn,isArray=Array.isArray,prototype=Object.getPrototypeOf,same=Object.is;
const apply=Reflect.apply,weakHas=WeakSet.prototype.has;
const realm=globalThis,aliases=[],ambient=[];
const remember=object=>{
    for(let i=0;i<ambient.length;i++)if(ambient[i].object===object)return;
    const names=keys(object),fields=[];for(let i=0;i<names.length;i++)fields[i]=descriptor(object,names[i]);
    ambient[ambient.length]={object,parent:prototype(object),names,fields};
};
for(const name of ['globalThis','Object','Array','Reflect','Map','Set','WeakMap','WeakSet','Number',
    'String','Boolean','JSON','Symbol','Function','RegExp','Math','Error','TypeError','SyntaxError',
    'RangeError','parseInt','parseFloat','isNaN','isFinite']){
    const row=descriptor(realm,name);aliases[aliases.length]={name,row};if(name==='globalThis')continue;
    remember(row.value);const p=descriptor(row.value,'prototype');if(p&&own(p,'value'))remember(p.value);
}
for(const iterator of [[][Symbol.iterator](),new Map()[Symbol.iterator](),new Set()[Symbol.iterator](),''[Symbol.iterator]()])for(let p=prototype(iterator);p;p=prototype(p))remember(p);
const descriptorKeys=['value','writable','get','set','enumerable','configurable'];
const sameDescriptor=(a,b)=>{
    if(!a||!b)return a===b;
    for(let i=0;i<descriptorKeys.length;i++){const key=descriptorKeys[i],has=own(a,key);if(has!==own(b,key)||has&&!same(a[key],b[key]))return false;}
    return true;
};
const realmCurrent=()=>{
    for(let i=0;i<aliases.length;i++)if(!sameDescriptor(aliases[i].row,descriptor(realm,aliases[i].name)))return false;
    for(let i=0;i<ambient.length;i++){
        const row=ambient[i],names=keys(row.object);if(prototype(row.object)!==row.parent||names.length!==row.names.length)return false;
        for(let j=0;j<names.length;j++)if(names[j]!==row.names[j]||!sameDescriptor(row.fields[j],descriptor(row.object,names[j])))return false;
    }return true;
};
const catalogue=physicalUpdateSourceSnapshot(ARCADE_NAMESPACE_MEMBERS);
const denied=()=>freeze({current:()=>false,has:()=>false});
const metadata=new Set(['originalBody','parameterDefaults','optionalParams','parameterProperties',
    'paramTypes','returnType','typeParameters','ordinaryParameterDefaultNames','assertedType','calls']);
const forms=new Set(['Program','Declaration','FunctionDeclaration','FunctionExpression','Block',
    'ExpressionStatement','Return','If','Number','String','Boolean','Null','Undefined','Identifier',
    'Binary','Logical','Unary','Assignment','Update','Conditional','Parenthesized','Call','Member']);
const protectedNames=new Set(['mp','ControllerEvent','controller','game','console','Player',
    'Object','Array','Math','String','Number','Reflect','eval','Function','globalThis','global','window','self','arguments']);
const primitives=new Set(['Number','String','Boolean','Null','Undefined']);
const receiverTypes=new Set(['Player','Null','Undefined']);
const allValues=new Set([...primitives,'Player']);
const identifier=name=>typeof name==='string'&&/^[$A-Z_a-z][$\w]*$/.test(name);
const empty=(owner,key)=>!own(owner,key)||isArray(owner[key])&&owner[key].length===0;
const functionShape=fn=>fn.exported!==true&&isArray(fn.params)&&isArray(fn.body)&&
    fn.params.every(identifier)&&new Set(fn.params).size===fn.params.length&&[fn,fn.params].every(owner=>
        !own(owner,'restParam')&&!['async','isAsync','generator','isGenerator'].some(key=>owner[key])&&
        ['parameterDefaults','optionalParams','parameterProperties','typeParameters','genericParams',
            'ordinaryParameterDefaultNames'].every(key=>empty(owner,key))&&
        (!own(owner,'paramDefaults')||owner.paramDefaults&&typeof owner.paramDefaults==='object'&&keys(owner.paramDefaults).length===0));
const plain=n=>n?.type==='Call'&&isArray(n.args)&&!own(n,'typeArguments')&&
    [n.isNew,n.constructorCall,n.optional,n.callee?.optional,n.callee?.computed].every(v=>v===undefined||v===false)&&
    n.args.every(arg=>arg&&typeof arg==='object'&&arg.type!=='Spread');
const binaryOps=new Set(['+','-','*','/','%','**','&','|','^','<<','>>','>>>','<','>','<=','>=','==','!=','===','!==','&&','||','??']);
const assignmentOps=new Set(['=','+=','-=','*=','/=','%=','&=','|=','^=','<<=','>>=','>>>=']);

// A result-only issuer. The old graph's Player entry, alias and all-caller
// proof is reused without changing that API. Its cached facts cannot outlive
// this complete original-source/realm/SDK-namespace snapshot or effect census.
export function multiplayerPlayerNumberNormalSource(program){
    try{
        if(!realmCurrent()||!catalogue?.current())return denied();
        const syntax=inspectGeneratedHelperBindings(program,GENERATED_HELPER_PROFILES.ordinary);
        if(!syntax.isCurrent())return denied();
        const snapshot=physicalUpdateSourceSnapshot(program);if(!snapshot||snapshot.opaque.length)return denied();
        const nodes=[],parents=new WeakMap(),seen=new WeakSet();let invalid=false;
        const visit=(value,parent=null)=>{
            if(!value||typeof value!=='object')return;
            if(seen.has(value)){invalid=true;return;}seen.add(value);parents.set(value,parent);
            if(!isArray(value))nodes.push(value);
            for(const key of keys(value)){
                const d=descriptor(value,key);if(typeof key!=='string'||!d||!own(d,'value')){invalid=true;continue;}
                if(isArray(value)){
                    if(key==='length')continue;
                    if(!/^(0|[1-9][0-9]*)$/.test(key)){
                        if(!metadata.has(key)||!isArray(d.value)||d.value.length)invalid=true;
                        continue;
                    }
                }else if(metadata.has(key))continue;
                if(!d.enumerable){invalid=true;continue;}visit(d.value,value);
            }
            if(isArray(value))for(let i=0;i<value.length;i++)if(!own(value,String(i)))invalid=true;
        };visit(program);
        if(invalid||program?.type!=='Program'||!isArray(program.body)||nodes.some(n=>n.type&&!forms.has(n.type)||
            n.kind==='var'||n.exported===true||n.optional||n.computed||n.isNew||n.constructorCall||n.typeArguments!==undefined))return denied();
        const lexical=analyseCallableBindings(program),ref=n=>lexical.references.get(n);
        if(lexical.bindings.some(b=>protectedNames.has(b.name)))return denied();
        const ordinary=new Map(),counts=new Map();
        const add=b=>{if(!b){invalid=true;return;}counts.set(b,(counts.get(b)||0)+1);};
        for(const n of nodes){
            if(n.type==='Declaration'){
                if(!['let','const'].includes(n.kind)||!isArray(n.decls))return denied();
                for(const d of n.decls){if(!identifier(d.name)||d.isArray||d.typeName&&!['number','string','boolean','any','mp.Player'].includes(d.typeName))return denied();add(lexical.scopes.get(n)?.names.get(d.name));}
            }
            if(['FunctionDeclaration','FunctionExpression'].includes(n.type)){
                if(!functionShape(n))return denied();const scope=lexical.scopes.get(n);if(!scope)return denied();
                for(const name of n.params)add(scope.names.get(name));
                if(n.type==='FunctionDeclaration'){
                    const b=lexical.global.names.get(n.name);if(!program.body.includes(n)||!b||b.node!==n||b.written)return denied();add(b);ordinary.set(b,n);
                }
            }
        }
        if(invalid||[...counts.values()].some(n=>n!==1))return denied();
        const old=multiplayerPlayerSourceCalls(program),registrations=new Set(),properties=new Set(),callbacks=new Set(),calls=new Set(),members=new Set();
        const rooted=(node,name)=>node?.type==='Identifier'&&node.name===name&&!ref(node);
        const api=(n,root,name,arity)=>plain(n)&&n.callee?.type==='Member'&&rooted(n.callee.object,root)&&n.callee.name===name&&n.args.length===arity;
        const inspection=n=>[1,2].some(arity=>api(n,'console','inspect',arity));
        const selector=n=>n?.type==='Member'&&n.name==='Number'&&n.object?.type==='Member'&&n.object.name==='PlayerProperty'&&rooted(n.object.object,'mp');
        const event=n=>n?.type==='Member'&&['Connected','Disconnected'].includes(n.name)&&rooted(n.object,'ControllerEvent');
        for(const n of nodes)if(n.type==='Call'){
            if(!plain(n))return denied();
            if(api(n,'mp','onControllerEvent',2)&&old.isRegistration(n)&&event(n.args[0])&&n.args[1]?.type==='FunctionExpression'&&n.args[1].params.length===1){
                if(parents.get(n)?.type!=='ExpressionStatement'||parents.get(n).expr!==n)return denied();
                registrations.add(n);callbacks.add(n.args[1]);calls.add(n);members.add(n.callee);members.add(n.args[0]);continue;
            }
            if(api(n,'mp','getPlayerProperty',2)&&old.isProperty(n)&&selector(n.args[1])){
                properties.add(n);calls.add(n);members.add(n.callee);members.add(n.args[1]);members.add(n.args[1].object);continue;
            }
            if(api(n,'game','onUpdate',1)&&n.args[0]?.type==='FunctionExpression'&&!n.args[0].params.length&&parents.get(n)?.type==='ExpressionStatement'&&parents.get(n).expr===n){
                callbacks.add(n.args[0]);calls.add(n);members.add(n.callee);continue;
            }
            if(inspection(n)){calls.add(n);members.add(n.callee);continue;}
            if(n.callee?.type==='Identifier'&&ordinary.has(ref(n.callee))&&n.args.length===ordinary.get(ref(n.callee)).params.length){calls.add(n);continue;}
            return denied();
        }
        if(!registrations.size||!properties.size)return denied();
        const controls=new Set();
        for(const n of nodes)if(n.type==='Assignment'&&n.left?.type==='Member'){
            const leaf=n.left,player=leaf.object;
            if(n.op!=='='||leaf.name!=='connected'||player?.type!=='Member'||player.name!=='player2'||!rooted(player.object,'controller'))return denied();
            controls.add(n);members.add(leaf);members.add(player);
        }
        for(const n of nodes){
            if(n.type==='FunctionExpression'&&!callbacks.has(n))return denied();
            if(n.type==='Identifier'){
                const b=ref(n),parent=parents.get(n);
                if(ordinary.has(b)&&!(parent?.type==='Call'&&parent.callee===n&&calls.has(parent)))return denied();
                if(!b&&!(parent?.type==='Member'&&parent.object===n&&members.has(parent)))return denied();
            }
            if(n.type==='Member'&&!members.has(n))return denied();
            if(n.type==='Assignment'&&!controls.has(n)&&(!assignmentOps.has(n.op)||n.left?.type!=='Identifier'||!ref(n.left)||ordinary.has(ref(n.left))))return denied();
            if(n.type==='Update'&&(!['++','--'].includes(n.op)||n.argument?.type!=='Identifier'||!ref(n.argument)||ordinary.has(ref(n.argument))))return denied();
            if(n.type==='Unary'&&!['+','-','!','~','typeof','void'].includes(n.op))return denied();
            if((n.type==='Binary'||n.type==='Logical')&&!binaryOps.has(n.op))return denied();
            if(n.type==='Number'&&(typeof n.value!=='string'||!Number.isFinite(Number(n.value)))||n.type==='String'&&typeof n.value!=='string'||n.type==='Boolean'&&typeof n.value!=='boolean')return denied();
        }
        if(!realmCurrent()||!snapshot.current())return denied();
        const graph=analyseSourceValueProducers(program,{multiplayerPlayerProperties:true,consoleInspection:true,
            opaqueDeclarationValues:true,unboundIsOpaque:true,uninitializedLocalsAreOpaque:true,initializationEntries:true});
        const candidates=new WeakSet();
        const subset=(values,allowed)=>values.size>0&&[...values].every(type=>allowed.has(type));
        // This tag records a nominal constraint, never a possible runtime
        // value or origin. Remove only this marker for the actual nullable
        // Player-domain check; marker-only and every other opaque fact refuse.
        const receiverDomain=n=>new Set([...graph.typesAt(n)].filter(type=>type!=='OpaquePlayerConstraint'));
        for(const call of properties){
            if(!subset(receiverDomain(call.args[0]),receiverTypes))return denied();candidates.add(call);
        }
        const domain=n=>candidates.has(n)?new Set(['Number']):graph.typesAt(n);
        const scalar=n=>subset(domain(n),primitives);
        const value=n=>subset(domain(n),allValues)||domain(n).has('OpaquePlayerConstraint')&&subset(receiverDomain(n),receiverTypes);
        const owner=n=>{for(let p=parents.get(n);p;p=parents.get(p))if(['FunctionDeclaration','FunctionExpression'].includes(p.type))return p;return null;};
        for(const n of nodes){
            if(n.type==='Call'){
                if(registrations.has(n)||api(n,'game','onUpdate',1)||properties.has(n))continue;
                if(inspection(n)){
                    if(!scalar(n.args[0])||n.args.length===2&&!subset(domain(n.args[1]),new Set(['Number','Undefined'])))return denied();
                }
                else if(!n.args.every(value))return denied();
            }
            if(n.type==='Declaration')for(const d of n.decls)if(d.init){
                if(!value(d.init))return denied();const b=lexical.scopes.get(n)?.names.get(d.name);
                if(domain(d.init).has('Player')&&b?.scope===lexical.global)return denied();
            }
            if(n.type==='Assignment'&&!controls.has(n)){
                if(!value(n.right)||n.op!=='='&&(!scalar(n.left)||!scalar(n.right)))return denied();
                if(domain(n.right).has('Player')&&ref(n.left)?.scope===lexical.global)return denied();
            }
            if(controls.has(n)&&!subset(domain(n.right),new Set(['Boolean'])))return denied();
            if(n.type==='Return'&&n.value&&!scalar(n.value))return denied();
            if(n.type==='Unary'&&!scalar(n.argument)||n.type==='Update'&&!scalar(n.argument))return denied();
            if((n.type==='Binary'||n.type==='Logical')&&(!scalar(n.left)||!scalar(n.right)))return denied();
            if(n.type==='If'&&!scalar(n.test)||n.type==='Conditional'&&(!scalar(n.test)||!scalar(n.consequent)||!scalar(n.alternate)))return denied();
            if(n.type==='Identifier'&&domain(n).has('Player')){
                const b=ref(n),fn=owner(n);if(!b||!fn||b.functionOwner?.node!==fn)return denied();
            }
        }
        if(!realmCurrent()||!catalogue.current()||!syntax.isCurrent()||!snapshot.current())return denied();
        let live=true;
        const current=()=>{
            if(live)try{if(!realmCurrent()||!catalogue.current()||!syntax.isCurrent()||!snapshot.current()||!realmCurrent())live=false;}catch{live=false;}
            return live;
        };
        // Unrelated nodes carry no receipt. Captured membership avoids both a
        // full source scan and executing a replaced WeakSet observer; genuine
        // occurrences still discharge every live dependency before issuance.
        return freeze({current,has:n=>apply(weakHas,candidates,[n])&&current()});
    }catch{return denied();}
}
