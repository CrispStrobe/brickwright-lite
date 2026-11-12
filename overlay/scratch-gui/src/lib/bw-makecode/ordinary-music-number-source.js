import {staticSdkNamespaceReceivers} from './static-sdk-namespaces.js';
import {analyseCallableBindings} from './callable-bindings.js';
import {physicalUpdateSourceSnapshot} from './physical-update-source-snapshot.js';
import {ARCADE_NAMESPACE_MEMBERS} from './arcade-namespace-members.js';

// Bound by the generated-mixer identity control and its existing original-PXT
// generation check. This is a source result profile, not a cached native value
// certificate. Tempo stores max(1, bpm >> 0); volume stores clamp(..., v | 0).
// Their mutable Math dependencies and all user callback effects must stay closed.
export const MUSIC_NUMBER_RUNTIME_SHA256='fbda4d3f48b981ade2b177584052141d78e756c50ad88aa08dd57b157126e152';

const descriptor=Object.getOwnPropertyDescriptor,prototype=Object.getPrototypeOf,keys=Reflect.ownKeys;
const same=Object.is,apply=Reflect.apply,freeze=Object.freeze,isArray=Array.isArray;
const weakHas=WeakSet.prototype.has,weakAdd=WeakSet.prototype.add,Weak=WeakSet;
const realm=globalThis,aliases=['Object','Array','Map','Set','WeakMap','WeakSet','Reflect','JSON','Number','String','Function','RegExp','Math'];
const aliasRows=aliases.map(name=>[name,descriptor(realm,name)]);
const objects=[Object,Object.prototype,Array,Array.prototype,Map,Map.prototype,Set,Set.prototype,
    WeakMap,WeakMap.prototype,WeakSet,WeakSet.prototype,Reflect,JSON,Number,Number.prototype,
    String,String.prototype,Function,Function.prototype,RegExp,RegExp.prototype,Math,
    prototype([][Symbol.iterator]()),prototype(new Set()[Symbol.iterator]()),prototype(new Map()[Symbol.iterator]())];
const ambient=objects.map(object=>({object,parent:prototype(object),fields:keys(object).map(key=>[key,descriptor(object,key)])}));
const sameDescriptor=(a,b)=>!!a&&!!b&&a.enumerable===b.enumerable&&a.configurable===b.configurable&&
    a.writable===b.writable&&same(a.value,b.value)&&same(a.get,b.get)&&same(a.set,b.set);
const ambientCurrent=()=>{
    for(let i=0;i<aliasRows.length;i++)if(!sameDescriptor(descriptor(realm,aliasRows[i][0]),aliasRows[i][1]))return false;
    for(let i=0;i<ambient.length;i++){
        const row=ambient[i],names=keys(row.object);
        if(prototype(row.object)!==row.parent||names.length!==row.fields.length)return false;
        for(let j=0;j<names.length;j++)if(names[j]!==row.fields[j][0]||!sameDescriptor(descriptor(row.object,names[j]),row.fields[j][1]))return false;
    }
    return true;
};
const metadata=new Set(['originalBody','parameterDefaults','paramTypes','typeParameters','returnType','assertedType','calls']);
const slot=(value,key)=>{const row=value&&descriptor(value,key);return row&&Object.hasOwn(row,'value')?row.value:undefined;};
const denied=reason=>freeze({has:()=>false,current:()=>true,reason});
// Negative-only scan. It grants nothing and never invokes a source getter.
const possible=program=>{
    const pending=[program],seen=new Weak();
    while(pending.length){
        const node=pending.pop();if(!node||typeof node!=='object'||apply(weakHas,seen,[node]))continue;
        apply(weakAdd,seen,[node]);
        const callee=slot(node,'callee'),root=slot(callee,'object');
        if(slot(node,'type')==='Call'&&slot(callee,'type')==='Member'&&
            ['tempo','volume'].includes(slot(callee,'name'))&&slot(root,'type')==='Identifier'&&slot(root,'name')==='music')return true;
        for(const key of keys(node))if(typeof key==='string'&&!metadata.has(key)){
            const value=slot(node,key);if(value&&typeof value==='object')pending.push(value);
        }
    }
    return false;
};
const musicArities=new Map([['tempo',0],['volume',0],['setTempo',1],['changeTempoBy',1],['setVolume',1],
    ['play',2],['playTone',2],['ringTone',1],['rest',1],['stopAllSounds',0],['beat',1],
    ['melodyPlayable',1],['tonePlayable',2],['stringPlayable',2],['sounds',1],['playSound',1],
    ['createSoundEffect',8],['playSoundEffect',2]]);
const factories=new Set(['melodyPlayable','tonePlayable','stringPlayable']);
const melodies=new Set(['baDing','wawawawaa','jumpUp','jumpDown','powerUp','powerDown','magicWand','siren',
    'pewPew','knock','footstep','thump','smallCrash','bigCrash','zapped','buzzer','sonar','spooky','beamUp']);
const enumRoots=['Note','BeatFraction','Sounds','WaveShape','SoundExpressionEffect','InterpolationCurve','SoundExpressionPlayMode','MusicOutput'];
const enumLeaves=new Map([...enumRoots,'music.PlaybackMode'].map(name=>[name,new Set((ARCADE_NAMESPACE_MEMBERS[name]||[]).map(row=>row[0]))]));
const mathCalls=new Set(['abs','ceil','floor','round','min','max','pow','sqrt','sin','cos','tan','asin','acos','atan','atan2',
    'log','exp','random','randomRange','clamp','imul','trunc','sign','idiv','fround']);
const mathConstants=new Set(['E','PI','LN10','LN2','LOG10E','LOG2E','SQRT1_2','SQRT2']);
const builtins=new Map([['Number',1],['String',1],['Boolean',1],['parseFloat',1],['parseInt',null],['randint',2],['pause',1]]);
const resourceRoots=new Set(['img','hex','tilemap','assets']);
const effectRoots=new Set(['game','control','console']);
const protectedGlobals=new Set(['Math','music','Array','Object',...builtins.keys(),...effectRoots,...resourceRoots]);
// Only executable forms whose children are included in this effect census.
// Classes, destructuring and future parser forms need separate entry proofs.
const syntax=new Set(['Program','Declaration','FunctionDeclaration','FunctionExpression','Block',
    'ExpressionStatement','Return','ThrowStatement','If','While','For','ForOf','Break','Continue','Switch',
    'Number','String','Boolean','Null','Undefined','Identifier','Array','Object','Binary','Unary',
    'Assignment','Update','Conditional','Call','Member','Index','Template']);

export function createOrdinaryMusicNumberSource(program,safeIndex=()=>false) {
    try{
        if(!possible(program))return denied('no music getter');
        if(!ambientCurrent())return denied('changed analysis intrinsics');
        const snapshot=physicalUpdateSourceSnapshot(program);
        if(!snapshot||snapshot.opaque.some(value=>typeof value==='function'))return denied('non-data source');
        const nodes=[],parents=new WeakMap(),seen=new WeakSet();let unsafe=false;
        const visit=(node,parent=null)=>{
            if(!node||typeof node!=='object')return;
            // Ambiguous shared syntax is not a lexical binding witness.
            if(seen.has(node)){unsafe=true;return;}seen.add(node);parents.set(node,parent);
            if(!isArray(node))nodes.push(node);
            for(const [key,value]of Object.entries(node))if(!metadata.has(key)&&value&&typeof value==='object')visit(value,node);
        };visit(program);
        if(unsafe||program.type!=='Program'||nodes.some(node=>node.type&&!syntax.has(node.type)||node.kind==='var'||
            // Defaults may exist only in non-enumerable parser metadata when
            // their execution prologue has not been emitted. Refuse both forms
            // until the profile can bind the defaults to actual entry effects.
            node.parameterDefaults?.length||node.params?.parameterDefaults?.length))return denied('unclosed syntax');
        const sdk=staticSdkNamespaceReceivers(program,{builtinIdentifiers:[...builtins.keys(),...resourceRoots]}),bindings=analyseCallableBindings(program);
        const lookup=(scope,name)=>{for(let owner=scope;owner;owner=owner.parent)if(owner.names.has(name))return owner.names.get(name);return null;};
        const scopeAt=node=>{for(let value=node;value;value=parents.get(value)){const scope=bindings.scopes.get(value);if(scope)return scope;}return bindings.global;};
        const counts=new Map();
        for(const node of nodes){
            if(node.type==='Declaration')for(const decl of node.decls){const binding=lookup(scopeAt(node),decl.name);counts.set(binding,(counts.get(binding)||0)+1);}
            if(node.type==='FunctionDeclaration'){
                const binding=lookup(bindings.scopes.get(node)?.parent||bindings.global,node.name);counts.set(binding,(counts.get(binding)||0)+1);
            }
        }
        const ownFunction=node=>{
            if(node?.type==='FunctionExpression')return true;
            const binding=node?.type==='Identifier'&&bindings.references.get(node);
            return binding?.kind==='function'&&!binding.written&&counts.get(binding)===1;
        };
        const plainCall=node=>node?.type==='Call'&&!node.isNew&&!node.constructorCall&&!node.optional&&
            !node.typeArguments?.length&&isArray(node.args)&&!node.args.some(arg=>arg?.type==='Spread');
        const musicCall=(node,name)=>plainCall(node)&&node.callee?.type==='Member'&&!node.callee.optional&&
            node.callee.name===name&&node.callee.object?.type==='Identifier'&&node.callee.object.name==='music'&&
            sdk.has(node.callee.object)&&node.args.length===musicArities.get(name);
        const argumentOwner=(node,index)=>{
            const args=parents.get(node),call=parents.get(args);
            return isArray(args)&&call?.type==='Call'&&call.args===args&&args[index]===node?call:null;
        };
        const validCalls=new WeakSet(),candidates=new WeakSet();
        for(const node of nodes){
            if(node.type==='Identifier'&&['globalThis','global','window','self','eval','Function','Reflect','arguments'].includes(node.name))unsafe=true;
            if(node.type==='Identifier'&&node.name==='this'&&bindings.references.get(node)?.kind!=='receiver')unsafe=true;
            if(node.type==='Member'&&node.name==='constructor'||node.type==='Index'&&!safeIndex(node))unsafe=true;
            if(node.type==='Template'&&(typeof node.value!=='string'||node.value.includes('${')||
                node.tag&&(!['img','hex','tilemap','assets.image','assets.tile','assets.tilemap'].includes(node.tag)||
                    lookup(scopeAt(node),node.tag.split('.')[0]))))unsafe=true;
            // A top-level Math declaration can augment or replace the SDK
            // dependency. A local shadow does not replace that dependency.
            if(program.body.includes(node)&&(['Class','Namespace','Enum','FunctionDeclaration'].includes(node.type)&&protectedGlobals.has(node.name)||
                node.type==='Declaration'&&node.decls.some(decl=>protectedGlobals.has(decl.name))))unsafe=true;
            if(node.type==='Identifier'&&!bindings.references.get(node)&&
                !['music','Math',...enumRoots,...effectRoots,...builtins.keys(),...resourceRoots,'undefined','Infinity','NaN'].includes(node.name))unsafe=true;
            if(node.type!=='Identifier'||!sdk.has(node))continue;
            const name=node.name;
            if(resourceRoots.has(name)){unsafe=true;continue;}
            if(builtins.has(name)){
                const call=parents.get(node);
                if(!plainCall(call)||call.callee!==node)unsafe=true;
                continue;
            }
            if(!['music','Math',...enumRoots,...effectRoots].includes(name))continue;
            let top=node,parent=parents.get(top);const path=[];
            while(parent?.type==='Member'&&parent.object===top){if(parent.optional)unsafe=true;path.push(parent.name);top=parent;parent=parents.get(top);}
            if(parent?.type==='Assignment'&&parent.left===top||parent?.type==='Update'&&parent.argument===top||parent?.type==='Unary'&&parent.op==='delete')unsafe=true;
            if(effectRoots.has(name)){
                if(path.length!==1||!plainCall(parent)||parent.callee!==top)unsafe=true;
            }else if(name==='Math'){
                if(path.length!==1){unsafe=true;continue;}
                if(parent?.type==='Call'&&parent.callee===top&&plainCall(parent)&&mathCalls.has(path[0]))validCalls.add(parent);
                else if(!mathConstants.has(path[0]))unsafe=true;
            }else if(name==='music'){
                if(path.length===1&&parent?.type==='Call'&&parent.callee===top&&musicCall(parent,path[0])){
                    if(path[0]==='play'&&!factories.has(parent.args[0]?.callee?.name))unsafe=true;
                    if(path[0]==='play'&&![...factories].some(factory=>musicCall(parent.args[0],factory)))unsafe=true;
                    validCalls.add(parent);
                    if(['tempo','volume'].includes(path[0]))candidates.add(parent);
                }else if(path.length===2&&path[0]==='PlaybackMode'&&enumLeaves.get('music.PlaybackMode').has(path[1])){
                    // The final scalar leaf may escape; its container may not.
                }else if(path.length===2&&melodies.has(path[0])&&path[1]==='playUntilDone'&&plainCall(parent)&&parent.callee===top&&parent.args.length===0)validCalls.add(parent);
                else if(path.length===1&&melodies.has(path[0])&&musicCall(argumentOwner(top,0),'melodyPlayable')){
                    // The exact builtin melody object reaches its SDK factory.
                }else unsafe=true;
            }else if(path.length!==1||!enumLeaves.get(name).has(path[0]))unsafe=true;
        }
        for(const node of nodes)if(node.type==='Call'){
            if(validCalls.has(node))continue;
            if(!plainCall(node)){unsafe=true;continue;}
            const callee=node.callee;
            if(callee?.type==='Identifier'&&ownFunction(callee))continue;
            if(callee?.type==='FunctionExpression')continue;
            if(callee?.type==='Identifier'&&sdk.has(callee)&&builtins.has(callee.name)&&
                (builtins.get(callee.name)===null?node.args.length>=1&&node.args.length<=2:node.args.length===builtins.get(callee.name)))continue;
            const root=callee?.object;
            if(callee?.type==='Member'&&!callee.optional&&root?.type==='Identifier'&&sdk.has(root)){
                if(root.name==='console'&&['log','warn','error'].includes(callee.name))continue;
                if(root.name==='control'&&callee.name==='runInParallel'&&node.args.length===1&&ownFunction(node.args[0]))continue;
                if(root.name==='game'&&callee.name==='onUpdate'&&node.args.length===1&&ownFunction(node.args[0]))continue;
                if(root.name==='game'&&callee.name==='onUpdateInterval'&&node.args.length===2&&ownFunction(node.args[1]))continue;
            }
            unsafe=true;
        }
        if(unsafe||!snapshot.current()||!ambientCurrent())return denied('namespace or effect census refused');
        let live=true;
        const current=()=>{
            if(!live)return false;
            try{if(!ambientCurrent()||!snapshot.current())live=false;}catch{live=false;}
            return live;
        };
        return freeze({has:node=>apply(weakHas,candidates,[node])&&current(),current,reason:null});
    }catch{return denied('source observation failed');}
}
