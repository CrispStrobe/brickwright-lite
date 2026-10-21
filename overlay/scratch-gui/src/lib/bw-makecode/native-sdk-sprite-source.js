import {SDK_SPRITE_CLASS_NODES} from './sdk-sprite-class-descriptors.js';
import {createSdkImageSourceProducers} from './sdk-image-source-producers.js';
import {staticSdkNamespaceReceivers} from './static-sdk-namespaces.js';
import {GENERATED_HELPER_PROFILES,inspectGeneratedHelperBindings} from './generated-helper-recognition.js';

// Trusted module-owned descriptor identity, not a caller's sdkIntrinsic/typeName.
// This snapshot supplies identity/currentness only. The x normal-result rule is
// the independently reviewed selected runtime/SDK slot contract documented in
// ARCADE-CLASS-LINEAGE.md; no executable SDK getter is synthesized here.
const descriptorProof=inspectGeneratedHelperBindings({type:'Program',body:[],descriptors:SDK_SPRITE_CLASS_NODES},GENERATED_HELPER_PROFILES.ordinary);
const bases=new Map([['Sprite',SDK_SPRITE_CLASS_NODES.find(node=>node.name==='Sprite')],
    ['sprites.ExtendableSprite',SDK_SPRITE_CLASS_NODES.find(node=>node.name==='__bwSDK_ExtendableSprite')]]);
let descriptorExpired=false;
const descriptorCurrent=()=>{if(!descriptorProof.isCurrent())descriptorExpired=true;return !descriptorExpired;};

// One operation's private issuer and actual lexical namespace classification.
// Namespace recognition never admits an arbitrary member or callback API.
export function nativeSdkSpriteSource(program,lexical,nodes,parents) {
    const sdk=staticSdkNamespaceReceivers(program,{builtinIdentifiers:['Math','SpriteKind']}),images=createSdkImageSourceProducers();
    const literalImages=new WeakMap(),clonedImages=new WeakMap();
    const root=node=>node?.type==='Identifier'?node.name:node?.type==='Member'||node?.type==='Index'?root(node.object):null;
    const roots=new Set(['Sprite','sprites','SpriteKind','Math','img','Image']);
    let closed=descriptorCurrent();
    for(const node of nodes){
        const target=node.type==='Assignment'?node.left:node.type==='Update'||node.type==='Unary'&&node.op==='delete'?node.argument:null;
        if(target&&roots.has(root(target)))closed=false;
    }
    const selected=nodes.some(node=>node.type==='Class'&&bases.has(node.base)&&
        !lexical.bindings.some(binding=>binding.name===node.base.split('.')[0]));
    const direct=node=>parents.get(node)?.type==='Call'&&parents.get(node).callee===node&&!parents.get(node).isNew&&!parents.get(node).constructorCall&&!parents.get(node).typeArguments;
    const role=node=>{
        if(!closed||!descriptorCurrent()||node?.type!=='Member'||!sdk.has(node)||node.object?.type!=='Identifier')return null;
        if(node.object.name==='SpriteKind'&&node.name==='Player')return 'kind';
        if(direct(node)&&node.object.name==='Math'&&node.name==='round')return 'round';
        if(direct(node)&&node.object.name==='sprites'&&node.name==='allOfKind')return 'registry';
        return null;
    };
    const constant=node=>{
        if(node?.type==='Parenthesized')return constant(node.expression);
        if(node?.type==='Number')return Number(node.value);
        if(node?.type==='Unary'&&['+','-'].includes(node.op)){const n=constant(node.argument);return node.op==='-'?-n:n;}
        if(node?.type==='Binary'&&['+','-','*','/','%'].includes(node.op)){
            const a=constant(node.left),b=constant(node.right);
            return node.op==='+'?a+b:node.op==='-'?a-b:node.op==='*'?a*b:node.op==='/'?a/b:a%b;
        }
        if(node?.type==='Call'&&role(node.callee)==='round'&&node.args?.length===1)return Math.round(constant(node.args[0]));
        return NaN;
    };
    return {
        index:constant,
        current:descriptorCurrent,
        base(name){
            if(!closed||!descriptorCurrent()||!bases.has(name))return null;
            const rootName=name.split('.')[0];
            if(lexical.bindings.some(binding=>binding.name===rootName))return null;
            return bases.get(name);
        },
        role,
        literal(node,scope){
            if(!closed||!selected||node?.type!=='Template'||node.tag!=='img')return null;
            if(!literalImages.has(node)){
                try{literalImages.set(node,{kind:'sdkImage',proof:images.literal(node,scope)});}catch{return null;}
            }
            return literalImages.get(node);
        },
        clone(node,values){
            if(!closed||!values.length||values.some(value=>value?.kind!=='sdkImage'||!images.isProduced(value.proof)))return null;
            if(!clonedImages.has(node)){
                try{clonedImages.set(node,{kind:'sdkImage',proof:images.clone(node,values[0].proof)});}catch{return null;}
            }
            // This is an allocation-site Image identity only. Dimensions never
            // issue numeric, bounds, pixel or Array-element authority here.
            return clonedImages.get(node);
        }
    };
}
