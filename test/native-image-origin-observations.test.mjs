import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {GENERATED_HELPER_PROFILES} from '../overlay/scratch-gui/src/lib/bw-makecode/generated-helper-recognition.js';
import {imagePixelNormalResults} from '../overlay/scratch-gui/src/lib/bw-makecode/image-pixel-normal-results.js';

const profile=GENERATED_HELPER_PROFILES.ordinary;
const walk=(value,out=[])=>{
    if(!value||typeof value!=='object')return out;
    if(Array.isArray(value)){for(const child of value)walk(child,out);return out;}
    out.push(value);
    for(const [key,child] of Object.entries(value))if(!['originalBody','paramTypes','returnType'].includes(key))walk(child,out);
    return out;
};
const inspect=source=>{
    const program=parseMakeCodeTs(source,profile),before=JSON.stringify(program);
    const proof=imagePixelNormalResults(program,profile);
    assert.equal(JSON.stringify(program),before);
    return {program,nodes:walk(program),proof};
};
const initializer=(nodes,name)=>nodes.find(node=>node.type==='Declaration'&&node.decls.some(decl=>decl.name===name)).decls.find(decl=>decl.name===name).init;

test('only every observed Image result proves an expression occurrence; unobserved and mixed calls do not',()=>{
    const all=inspect('function echo(value:any){return value;}let first=echo(img`1`);let second=echo(img`2`);');
    const returned=all.nodes.find(node=>node.type==='Return').value;
    assert.equal(all.proof.isImageValue(returned),true);
    assert.equal(all.proof.isImageValue({}),false);
    const dormant=inspect('function dormant(){return img`1`;}let actual=img`2`;');
    assert.equal(dormant.proof.isImageValue(dormant.nodes.find(node=>node.type==='Return').value),false);
    for(const other of ['3','null','undefined','[img`3`]']){
        const mixed=inspect(`function echo(value:any){return value;}let first=echo(img\`1\`);echo(${other});let last=echo(img\`2\`);`);
        assert.equal(mixed.proof.current(),true);
        assert.equal(mixed.proof.isImageValue(mixed.nodes.find(node=>node.type==='Return').value),false,other);
        assert.equal(mixed.proof.isImageValue(initializer(mixed.nodes,'last')),true,'a distinct final call has its own observation');
    }
});

test('fresh allocations at the same source site and clones retain distinct identities; aliases retain identity',()=>{
    const {nodes,proof}=inspect('function fresh(){return img`1`;}function different(a:any,b:any){if(a===b)return 0;return a;}function same(a:any,b:any){if(a===b)return a;return 0;}let first=fresh();let second=fresh();let clone=first.clone();let distinct=different(first,second);let cloned=different(first,clone);let alias=same(first,first);');
    for(const name of ['first','second','clone','distinct','cloned','alias'])assert.equal(proof.isImageValue(initializer(nodes,name)),true,name);
});

test('Image list construction models identity transport without expanding immutable-list Number authority',()=>{
    const {nodes,proof}=inspect('let first=image.create(2,1);first.fill(5);let copy=first.clone();let refs=[];refs.push(first);refs.push(copy);let selected=refs[refs.indexOf(copy,0)];let missed=refs.indexOf("arcade-image:1",0);selected.setPixel(0,0,7);let pixel=first.getPixel(0,0);');
    assert.equal(proof.isImageValue(initializer(nodes,'selected')),true);
    assert.equal(proof.isImageValue(initializer(nodes,'missed')),false);
    assert.equal(proof.has(initializer(nodes,'pixel')),false,'new mutable Image transport cannot lend the old immutable-list Number fact');
});

test('original left-to-right calls and coercion results select actual source branches',()=>{
    const {nodes,proof}=inspect('let first=img`1`;let copy=first.clone();let count=0;function left(){count=count+1;return first;}function right(){if(count===1)return copy;return 0;}let joined=left()+right();function choose(value:any){if(value=="[object Object]")return first;return 0;}let result=choose(first);');
    const right=nodes.find(node=>node.type==='Call'&&node.callee?.name==='right');
    assert.equal(proof.isImageValue(right),true);
    assert.equal(proof.isImageValue(initializer(nodes,'joined')),false);
    assert.equal(proof.isImageValue(initializer(nodes,'result')),true);
});

test('flat primitive lists retain strict indexOf values and cannot turn text into an Image',()=>{
    const {nodes,proof}=inspect('let image=img`1`;function zero(value:number){if(value===0)return image;return 0;}let numbers=[1,2,1];let first=zero(numbers.indexOf(1));let later=zero(numbers.indexOf(1,1)-2);let relative=zero(numbers.indexOf(1,-1)-2);let values=[null,undefined,true,"x"];let empty=zero(values.indexOf(undefined)-1);let refs=[];refs.push("arcade-image:1");refs.push(image);let selected=refs[refs.indexOf(image)];let text=refs[refs.indexOf("arcade-image:1")];');
    for(const name of ['first','later','relative','empty','selected'])assert.equal(proof.isImageValue(initializer(nodes,name)),true,name);
    assert.equal(proof.isImageValue(initializer(nodes,'text')),false);
    const unknown=inspect('let image=img`1`;let number=image.getPixel(0,0);let values=[number,image];let selected=values[values.indexOf(1)];');
    assert.equal(unknown.proof.isImageValue(initializer(unknown.nodes,'selected')),false,'an unknown primitive index cannot select an invented Image');
});

test('shadowed or escaped Image namespaces, exported entries, opaque mutations and unknown pixel branches refuse',()=>{
    for(const source of [
        'let image=3;let value=image.create(1,1);',
        'let create=image.create;let value=create(1,1);',
        'let value=image.create(1,1);image.create=other;',
        'function external(value:any){return value;}let value=external(img`1`);',
        'let value=img`1`;value.clone=other;',
        'let value=img`1`;Object.prototype.valueOf=other;',
        'let value=img`1`;foreign(value);',
        'let value=img`1`;function choose(){if(value.getPixel(0,0)===1)return value;return 0;}let result=choose();'
    ]){
        const {program,nodes,proof}=inspect(source);
        if(source.includes('function external')){
            // Exercise the actual metadata boundary even where the parser's
            // supported source subset does not retain an export keyword.
            program.body.find(node=>node.type==='FunctionDeclaration').exported=true;
            const fresh=imagePixelNormalResults(program,profile);
            assert.ok(nodes.every(node=>!fresh.isImageValue(node)));
        }else assert.ok(nodes.every(node=>!proof.isImageValue(node)),source);
    }
});

test('Image-origin observations expire permanently on original source changes and inherited slot additions',()=>{
    const {program,nodes,proof}=inspect('let value=img`1`;');
    const image=initializer(nodes,'value');assert.equal(proof.isImageValue(image),true);
    const original=image.value;image.value='2';assert.equal(proof.current(),false);
    image.value=original;assert.equal(proof.isImageValue(image),false);
    const again=imagePixelNormalResults(program,profile);assert.equal(again.isImageValue(image),true);
    const prototype=Object.create(Object.prototype);
    Object.setPrototypeOf(image,prototype);assert.equal(again.current(),false);
    Object.setPrototypeOf(image,Object.prototype);assert.equal(again.isImageValue(image),false);
});
