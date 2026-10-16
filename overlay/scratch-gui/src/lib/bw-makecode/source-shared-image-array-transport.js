import {sourceImageArrayCloneEffects} from './source-value-producers.js';
import {currentSharedImageSourceEffects,sharedImageSourceContextCurrent} from './shared-image-array-source-effects.js';
import {analyseCallableBindings} from './callable-bindings.js';
import {staticSdkNamespaceReceivers} from './static-sdk-namespaces.js';
import {parseExactImgLiteral} from './arcade-assets.js';

// A scalar origin survives the existing object-spread / Object.entries passes.
// It is provenance only: every final binding, use and initializer is reproved.
const originField = 'bwSharedImageArrayOrigin';
const plans = new WeakMap(), finished = new WeakMap();
const metadata = new Set(['originalBody','parameterDefaults','paramTypes','typeParameters','returnType','assertedType','bwProcedureConstraintSource','optionalParams','parameterProperties','sourceReferenceDeclarations','sourceCallableDeclarations','sourceScalarDeclarations']);
const syntax = new Set(['Program','Declaration','FunctionDeclaration','FunctionExpression','Block','If','While','For','ExpressionStatement','Return','Break','Continue','Array','Object','Identifier','Number','String','Template','Boolean','Null','Undefined','Binary','Logical','Unary','Update','Assignment','Member','Index','Call','Conditional','LegacyParsedValue','LegacyJsonValue','NativeArrayAccess','SpriteKindReset']);
const path = node => node?.type === 'Identifier' ? node.name : node?.type === 'Member' ? `${path(node.object)}.${node.name}` : null;

// Inspect descriptors before any lexical walker or decoder. A repeated physical
// executable object cannot have two owners (and a cycle must terminate here).
function census(program) {
    const seen = new WeakSet(), nodes = [], parents = new WeakMap(), rows = [];
    let valid = true;
    const visit = (value, parent = null) => {
        if (!value || typeof value !== 'object') return;
        if (seen.has(value)) {valid = false;return;}
        seen.add(value);
        const proto = Object.getPrototypeOf(value), keys = Reflect.ownKeys(value), descriptors = [];
        if (proto !== Object.prototype && proto !== Array.prototype) {valid = false;return;}
        if (!Array.isArray(value)) {nodes.push(value);parents.set(value,parent);}
        for (const key of keys) {
            const d = Object.getOwnPropertyDescriptor(value,key);
            if (typeof key !== 'string' || !d || !Object.hasOwn(d,'value')) {valid = false;continue;}
            descriptors.push([key,d.value,d.enumerable,d.writable,d.configurable]);
            if (metadata.has(key)) continue;
            if (typeof d.value === 'function' || typeof d.value === 'symbol' && key !== originField) {valid = false;continue;}
            visit(d.value,value);
        }
        rows.push({value,proto,keys,descriptors});
    };
    visit(program);
    const current = () => rows.every(row => {
        if (Object.getPrototypeOf(row.value) !== row.proto) return false;
        const keys = Reflect.ownKeys(row.value);
        return keys.length === row.keys.length && keys.every((key,i) => key === row.keys[i]) && row.descriptors.every(([key,value,enumerable,writable,configurable]) => {
            const d = Object.getOwnPropertyDescriptor(row.value,key);
            return d && Object.hasOwn(d,'value') && Object.is(d.value,value) && d.enumerable === enumerable && d.writable === writable && d.configurable === configurable;
        });
    });
    return {valid,nodes,parents,current};
}
function copy(value, seen = new WeakMap()) {
    if (!value || typeof value !== 'object') return value;
    if (seen.has(value)) return seen.get(value);
    const out = Array.isArray(value) ? [] : {};seen.set(value,out);
    for (const key of Reflect.ownKeys(value)) {
        if (Array.isArray(value) && key === 'length') continue;
        const d = Object.getOwnPropertyDescriptor(value,key);
        Object.defineProperty(out,key,{...d,value:metadata.has(key) ? d.value : copy(d.value,seen)});
    }
    if(Array.isArray(value))Object.defineProperty(out,'length',Object.getOwnPropertyDescriptor(value,'length'));
    return out;
}
const equalImages = (a,b) => a.length === b.length && a.every((image,i) => image.width === b[i].width && image.height === b[i].height && image.pixels.length === b[i].pixels.length && image.pixels.every((pixel,j) => pixel === b[i].pixels[j]));

function prove(program, sourceContext = null) {
    const physical = census(program), candidates = [], selections = new Map();
    if (!physical.valid || program?.type !== 'Program' || !Array.isArray(program.body)) return null;
    const {nodes,parents} = physical;
    const sourceEffects=sourceContext?currentSharedImageSourceEffects(program,sourceContext):null;
    if(sourceContext&&!sourceEffects)return null;
    if (nodes.some(node => node.type==='Template' && node.tag!=='img' || node.type && !syntax.has(node.type) || node.type === 'Declaration' && node.kind === 'var')) return null;
    // A tag has no executable Identifier leaf. Reject bindings and escapes of
    // either actual builtin, including nested lexical shadows and all writers.
    if (nodes.some(node => node.name === 'img' || node.name === 'Math' && node.type !== 'Identifier' ||
        node.params?.some(name => ['img','Math'].includes(name)) || node.decls?.some(d => ['img','Math'].includes(d.name)) ||
        node.type === 'Identifier' && ['this','globalThis','window','self','eval','Function','Reflect','arguments','img'].includes(node.name))) return null;
    const lexical = analyseCallableBindings(program), sdk = staticSdkNamespaceReceivers(program,{builtinIdentifiers:sourceEffects?['Math','textsprite']:['Math']});
    const declarations=new Map();
    const declare=binding=>{if(binding)declarations.set(binding,(declarations.get(binding)||0)+1);};
    for(const node of nodes) {
        if(node.type==='Declaration')for(const decl of node.decls)declare(lexical.scopes.get(node)?.names.get(decl.name));
        if(node.type==='FunctionDeclaration')declare(lexical.scopes.get(node)?.parent?.names.get(node.name));
    }

    // Stateful builtin kind allocation may precede resource declarations, but
    // remains an actual call in place. Neither a copied name nor an extracted
    // member grants this closed no-guest-callback effect contract.
    const kindAllocation = node => node?.type==='Call' && !node.isNew && !node.constructorCall &&
        !Object.hasOwn(node,'typeArguments') && Array.isArray(node.args) && node.args.length===0 &&
        node.callee?.type==='Member' && path(node.callee)==='SpriteKind.create' && sdk.has(node.callee);
    for (const node of nodes) {
        if(node.type==='Member' && path(node)==='SpriteKind.create' && sdk.has(node)) {
            const call=parents.get(node);
            if(call?.callee!==node || !kindAllocation(call))return null;
        }
        if(sourceEffects&&node.type==='Member'&&sdk.has(node)&&path(node)?.startsWith('textsprite.')) {
            const call=parents.get(node);
            if(path(node)!=='textsprite.create'||call?.type!=='Call'||call.callee!==node||Object.hasOwn(call,'typeArguments')||!Array.isArray(call.args)||call.args.length<1||call.args.length>3)return null;
        }
        if(node.type === 'Identifier' && !lexical.references.get(node)) {
            const parent=parents.get(node);
            if(!sdk.has(node) || parent?.type!=='Member' || parent.object!==node)return null;
        }
        if(node.type==='Member' && node.name==='constructor')return null;
        if (node.type === 'Identifier' && node.name === 'Math') {
            const member = parents.get(node), call = parents.get(member);
            if (!sdk.has(node) || member?.type !== 'Member' || member.object !== node || member.name !== 'round' || call?.type !== 'Call' || call.callee !== member || call.args?.length !== 1 || call.isNew) return null;
        }
        // A computed caller / ambient function could introduce a hidden writer
        // or invoke project code outside this closed entry. Unknown configured
        // syntax and unresolved plain calls never gain authority from names.
        if (node.type === 'Call') {
            if (node.isNew || node.constructorCall || node.callee?.type === 'Index') return null;
            if (node.callee?.type === 'Identifier') {
                const binding = lexical.references.get(node.callee);
                if (binding?.kind !== 'function' || binding.written || declarations.get(binding)!==1 || binding.node?.type !== 'FunctionDeclaration') return null;
            } else if (node.callee?.type !== 'Member') return null;
        }
    }
    const number = node => {
        if (node?.type === 'Number') {if(!['string','number'].includes(typeof node.value) || typeof node.value==='string'&&!node.value.trim())return null;const n = Number(node.value);return Number.isFinite(n) ? n : null;}
        if (node?.type === 'Unary' && ['+','-'].includes(node.op)) {const a=number(node.argument);return a === null ? null : node.op==='-' ? -a : a;}
        if (node?.type === 'Binary' && ['+','-','%'].includes(node.op)) {
            const a=number(node.left),b=number(node.right);if(a === null || b === null)return null;
            const n=node.op==='+'?a+b:node.op==='-'?a-b:a%b;return Number.isFinite(n)?n:null;
        }
        if (node?.type === 'Call' && path(node.callee)==='Math.round' && sdk.has(node.callee) && node.args.length===1) {const a=number(node.args[0]);return a===null?null:Math.round(a);}
        return null;
    };
    const literalImages = node => {
        if (node?.type !== 'Array' || !node.items?.length) return null;
        const images=[];
        for(const item of node.items) {
            if(item?.type !== 'Template' || item.tag !== 'img' || typeof item.value !== 'string')return null;
            const image=parseExactImgLiteral('img`'+item.value+'`');if(!image)return null;images.push(Object.freeze({...image,pixels:Object.freeze(Array.from(image.pixels))}));
        }
        return Object.freeze(images);
    };
    // Only a prefix with no guest calls/registrations/branching can dominate all
    // uses in every function/callback. Exact builtin kind allocations have no
    // guest callback and stay in their original declaration/order. Local Image
    // constructors remain ordinary fresh.
    let prefix=true;
    for(const statement of program.body) {
        if(statement.type==='FunctionDeclaration')continue;
        if(statement.type==='SpriteKindReset' && typeof statement.name==='string')continue;
        if(statement.type!=='Declaration'){prefix=false;continue;}
        for(const decl of statement.decls) {
            const images=literalImages(decl.init);
            if(prefix && statement.decls.length===1 && images) {
                const binding=lexical.scopes.get(statement)?.names.get(decl.name);
                const uses=nodes.filter(node=>node.type==='Identifier' && lexical.references.get(node)===binding);
                const usesFor=[];
                let safe=!!binding && binding.node===decl && !binding.written && declarations.get(binding)===1 && uses.length>0;
                for(const use of uses) {
                    const index=parents.get(use),parent=parents.get(index),value=index?.type==='Index'&&index.object===use?number(index.index):null;
                    if(value===null || !Number.isInteger(value) || value<0 || value>=images.length ||
                        parent?.type==='Assignment'&&parent.left===index || parent?.type==='Update'&&parent.argument===index || parent?.type==='Unary'&&parent.op==='delete') {safe=false;break;}
                    usesFor.push([index,value]);
                }
                if(safe){const candidate={statement,decl,array:decl.init,images,uses:usesFor};candidates.push(candidate);for(const [node,index]of usesFor)selections.set(node,{candidate,index});}
            }
            if(decl.init && !images && !kindAllocation(decl.init) && !['Number','String','Boolean','Null','Undefined'].includes(decl.init.type))prefix=false;
        }
    }
    // These existing native operations cannot obtain the private backing Array
    // unless it is explicitly exposed (which the reference census rejects).
    // Namespace classification alone is not callee authority. Unknown host
    // extensions/receivers keep ordinary staging, even in unused bodies.
    const sdkEffects=new Set(['Math.round','console.log','scene.setBackgroundImage','scene.setBackgroundColor',
        'image.setPalette','image.create','sprites.create','sprites.createProjectileFromSide','sprites.createProjectileFromSprite',
        'sprites.onOverlap','sprites.onCreated','sprites.onDestroyed','game.onUpdate','game.onUpdateInterval',
        'info.setScore','info.changeScoreBy','info.score','info.startCountdown','info.onCountdownEnd','SpriteKind.create']);
    if(sourceEffects)sdkEffects.add('textsprite.create');
    // This exact native command accepts only current-runtime music registry
    // references (or preserves its existing error before PXT playback). It
    // cannot obtain the private frame Array. This is not a Playable/value fact
    // and does not allow other music APIs, dynamic modes or prefix effects.
    const musicPlaybackEffect=node=>node?.type==='Call' && !node.isNew && !node.constructorCall && !Object.hasOwn(node,'typeArguments') &&
        Array.isArray(node.args) && node.args.length===2 && sdk.has(node.callee) && path(node.callee)==='music.play' &&
        sdk.has(node.args[1]) && ['music.PlaybackMode.UntilDone','music.PlaybackMode.InBackground',
            'music.PlaybackMode.LoopingInBackground'].includes(path(node.args[1]));
    // The closed command profile does not admit the SDK method as a value:
    // every actual member occurrence must itself be the exact allowed callee.
    // This is deliberately local to music.play, not a namespace-wide rule.
    for(const node of nodes)if(node.type==='Member' && sdk.has(node) && path(node)==='music.play') {
        const call=parents.get(node);
        if(call?.callee!==node || !musicPlaybackEffect(call))return null;
    }
    const methods={Image:new Set(['clone','setPixel','getPixel','fill','replace','drawLine','drawRect','fillRect','drawImage','drawTransparentImage','equals']),
        Array:new Set(['push','pop','shift','unshift']),
        Sprite:new Set(['setImage','setPosition','setVelocity','setBounceOnWall','setStayInScreen','setFlag','setKind','destroy'])};
    if(sourceEffects)methods.TextSprite=new Set([...methods.Sprite,'setText','setMaxFontHeight','setIcon','setBorder','setOutline','update']);
    const writers=new Map();
    const addWriter=(binding,value)=>{if(binding){if(!writers.has(binding))writers.set(binding,[]);writers.get(binding).push(value);}};
    for(const node of nodes) {
        if(node.type==='Declaration')for(const decl of node.decls) {
            // The actual parser's own init:null denotes no initializer, not a
            // value-producing writer. Preserve that declaration and all reads
            // unchanged; this effect census issues no initialization/type fact.
            // A binding still needs a concrete writer below. Unknown compound
            // and update writers retain their separate null refusal sentinel.
            if(node.kind==='let' && Object.hasOwn(decl,'init') && decl.init===null)continue;
            addWriter(lexical.scopes.get(node)?.names.get(decl.name),decl.init);
        }
        if(node.type==='Assignment' && node.left?.type==='Identifier')addWriter(lexical.references.get(node.left),node.op==='='?node.right:null);
        if(node.type==='Update' && node.argument?.type==='Identifier')addWriter(lexical.references.get(node.argument),null);
        if(node.type==='Assignment' || node.type==='Update' || node.type==='Unary'&&node.op==='delete') {
            let target=node.type==='Assignment'?node.left:node.argument;
            while(['Member','Index'].includes(target?.type))target=target.object;
            if(sdk.has(target))return null;
        }
    }
    const kind=(node,active=new Set())=>{
        if(!node)return null;
        if(node.type==='Null' || node.type==='Undefined')return 'Absent';
        if(node.type==='Array')return 'Array';
        if(node.type==='Template' && node.tag==='img' && parseExactImgLiteral('img`'+node.value+'`'))return 'Image';
        if(selections.has(node))return 'Image';
        if(node.type==='Call') {
            if(sourceEffects&&sdk.has(node.callee)&&path(node.callee)==='textsprite.create')return 'TextSprite';
            if(sdk.has(node.callee) && ['sprites.create','sprites.createProjectileFromSide','sprites.createProjectileFromSprite'].includes(path(node.callee)))return 'Sprite';
            if(sdk.has(node.callee) && path(node.callee)==='image.create')return 'Image';
            if(node.callee?.type==='Member' && node.callee.name==='clone' && node.args.length===0 && kind(node.callee.object,active)==='Image')return 'Image';
        }
        if(node.type==='Identifier') {
            const binding=lexical.references.get(node),values=writers.get(binding);
            if(!values?.length || active.has(binding))return null;
            const next=new Set(active);next.add(binding);const kinds=new Set(values.map(value=>kind(value,next)));
            kinds.delete('Absent');return kinds.size===1 && !kinds.has(null)?[...kinds][0]:null;
        }
        return null;
    };
    for(const node of nodes)if(node.type==='Assignment' || node.type==='Update' || node.type==='Unary'&&node.op==='delete') {
        const target=node.type==='Assignment'?node.left:node.argument;
        if(!['Member','Index'].includes(target?.type))continue;
        const receiver=kind(target.object);
        if(receiver==='Array' && target.type==='Index')continue;
        if((receiver==='Sprite'||receiver==='TextSprite') && target.type==='Member' && ['x','y','vx','vy','ax','ay','lifespan','z','sx','sy'].includes(target.name))continue;
        // The privately admitted Text factory inherits the native Sprite edge
        // setters. Each plain assignment writes only the receiver's fixed-point
        // position (and existing movement/render effects); it cannot expose the
        // private frame Array. This is an effect proof, not a value/type grant.
        // Keep compound/update/delete/computed and unrelated receivers closed.
        if(receiver==='TextSprite' && node.type==='Assignment' && node.op==='=' && target.type==='Member' &&
            ['left','right','top','bottom'].includes(target.name))continue;
        return null;
    }
    let imageArrayCloneEffects;
    for(const node of nodes)if(node.type==='Call' && node.callee.type==='Member') {
        if(sdk.has(node.callee)) {if(!sdkEffects.has(path(node.callee)) && !musicPlaybackEffect(node))return null;}
        else if(!methods[kind(node.callee.object)]?.has(node.callee.name)) {
            // A successful exact ordinary entry may prove this call's receiver
            // without promoting its backing Array or issuing an Image value.
            if(node.callee.name!=='clone'||node.args.length||
                !(imageArrayCloneEffects ||= sourceImageArrayCloneEffects(program,sourceContext))?.has(node))return null;
        }
    }
    return {...physical,current:()=>physical.current()&&(!sourceContext||sharedImageSourceContextCurrent(sourceContext)),candidates,selections};
}

/** Private plan for one current compiler input. No decoder or predicate option. */
export function prepareSharedImageArrayTransport(program,options={}) {
    const contextDescriptor=Object.getOwnPropertyDescriptor(options,'sourceContext');
    if(contextDescriptor&&!Object.hasOwn(contextDescriptor,'value'))return null;
    const sourceContext=contextDescriptor?.value||null;
    const proof=prove(program,sourceContext);
    if(!proof?.candidates.length)return null;
    const planned=copy(program), projected=prove(planned,sourceContext);
    if(!projected || projected.candidates.length!==proof.candidates.length)return null;
    const origins=new Map(), literals=new WeakMap();
    for(const record of projected.candidates) {
        const token=Symbol('shared Image Array source origin');
        record.array[originField]=token;origins.set(token,{name:record.decl.name,images:record.images});literals.set(record.array,record.statement);
    }
    const plannedCurrent=census(planned).current;
    const plan=Object.freeze({});plans.set(plan,{program:planned,origins,literals,sourceContext,inputCurrent:proof.current,
        current:()=>plannedCurrent()&&(!sourceContext||sharedImageSourceContextCurrent(sourceContext))});
    return {program:planned,plan};
}
export function preservesSharedImageArray(plan,program,node,statement) {
    const p=plans.get(plan);return !!p && p.program===program && p.current() && p.literals.get(node)===statement;
}
/** Only the exact producer's origin field is non-executable scalar metadata. */
export function sharedImageArrayOrigin(plan,value,key) {
    return key===originField && plans.get(plan)?.origins.has(value) === true;
}
// Only the private ordinary pass chain calls this seam. Generated identifier
// DAGs become occurrences before any final node-identity inference. All edges,
// descriptors and scalar provenance survive; cycles still refuse. Source input
// sharing was already rejected, so this cannot launder a shared parsed AST.
export function projectSharedImageArrayTransport(program,plan) {
    const issued=plans.get(plan);if(!issued || !issued.inputCurrent())return null;
    const active=new WeakSet();let valid=true;
    const occurrence=value=>{
        if(!value || typeof value!=='object')return value;
        if(active.has(value)){valid=false;return null;}
        const proto=Object.getPrototypeOf(value);
        if(proto!==Object.prototype && proto!==Array.prototype){valid=false;return null;}
        active.add(value);const out=Array.isArray(value)?[]:{};
        for(const key of Reflect.ownKeys(value)) {
            if(Array.isArray(value)&&key==='length')continue;
            const d=Object.getOwnPropertyDescriptor(value,key);
            if(typeof key!=='string' || !d || !Object.hasOwn(d,'value')){valid=false;continue;}
            Object.defineProperty(out,key,{...d,value:metadata.has(key)?d.value:occurrence(d.value)});
        }
        if(Array.isArray(value))Object.defineProperty(out,'length',Object.getOwnPropertyDescriptor(value,'length'));
        active.delete(value);return out;
    };
    const result=occurrence(program);if(!valid)return null;
    issued.projected=result;return result;
}
export function finishSharedImageArrayTransport(program,plan) {
    const original=plans.get(plan),proof=original&&original.projected===program&&original.inputCurrent()&&prove(program,original.sourceContext);if(!proof)return false;
    const found=new Set();
    for(const candidate of proof.candidates) {
        const token=candidate.array[originField],source=original.origins.get(token);
        if(!source || found.has(token) || source.name!==candidate.decl.name || !equalImages(source.images,candidate.images))return false;
        found.add(token);
    }
    const carriers=proof.nodes.filter(node=>Object.hasOwn(node,originField));
    if(found.size!==original.origins.size || carriers.length!==found.size || carriers.some(node=>!proof.candidates.some(c=>c.array===node)))return false;
    finished.set(program,{proof,plan});return true;
}
export function currentSharedImageArrayTransport(program) {
    const p=finished.get(program)?.proof;if(!p || !p.current())return null;
    return {declarations:new Set(p.candidates.map(c=>c.statement)),frames:new Map(p.candidates.map(c=>[c.decl.name,c.images])),
        selection:node=>{const value=p.selections.get(node);return value?{key:value.candidate.decl.name,images:value.candidate.images,index:value.index}:null;}};
}

// Named-handle setup normalizes sprite creation before its own node facts.
// Reissue this same origin protocol on that actual current Program; never move
// the old WeakMap fact to a cloned root by assignment or trust the token alone.
export function reproveSharedImageArrayTransport(previous,next) {
    const issued=finished.get(previous);
    if(!issued || !issued.proof.current())return null;
    const projected=projectSharedImageArrayTransport(next,issued.plan);
    return projected && finishSharedImageArrayTransport(projected,issued.plan)?projected:null;
}
