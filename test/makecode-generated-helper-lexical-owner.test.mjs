import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {GENERATED_HELPER_PROFILES as profiles,inspectGeneratedHelperBindings} from '../overlay/scratch-gui/src/lib/bw-makecode/generated-helper-recognition.js';
import {nativeArrayAddHelperSource,inspectNativeArrayAddHelpers} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-helper-source.js';
const header=nativeArrayAddHelperSource('__bwBinaryAdd',true,true)+';let answer=__bwBinaryAdd(1,2);';
const parse=source=>parseMakeCodeTs(source,profiles.ordinary);
const proof=source=>inspectNativeArrayAddHelpers(parse(header+source),profiles.ordinary);

test('complete helper proofs distinguish unrelated literal-tag formals and declared self cells by actual lexical owner',()=>{
    for(const source of [
        'class Child {constructor(img:Image){consume(img)}}let frame=img`1`;',
        'class Child {constructor(hex:any){consume(hex)}}let bytes=hex`01`;',
        'function unrelated(img:any){return img}let frame=img`1`;',
        'let self:boolean;function startup(){self=true}startup();',
        'function local(){let self=1;return self}let value=local();',
        'function parameter(self:any){return self}let value=parameter(1);'
    ]){
        const ast=parse(header+source),current=inspectNativeArrayAddHelpers(ast,profiles.ordinary);
        assert.equal(current.current(),true,source);assert.equal(current.helpers.size,1,source);
        assert.equal(current.helpers.get('__bwBinaryAdd').calls.length,1);
        const root=inspectGeneratedHelperBindings(ast,profiles.ordinary);
        assert.equal(root.root(ast.body[0]),true);
        ast.body[0].body.push({type:'Return',value:{type:'Number',value:'99'}});
        assert.equal(root.isCurrent(),false,'actual mutation expires held proof');
        assert.equal(current.current(),false);
    }
});

test('true tag shadows and ambient escapes still refuse; self naming never admits ambient reflection or shared ASTs',()=>{
    for(const source of [
        'function shadow(img:any){return img`1`}',
        'let img=external();let frame=img`1`;',
        'let hex=external();let bytes=hex`01`;',
        'img=external;let frame=img`1`;',
        'consume(img);let frame=img`1`;',
        'consume(hex);let bytes=hex`01`;',
        'let frame=foreignTag`1`;',
        'let self:any;let x=globalThis;',
        'let x=self;',
        'self=1;',
        'function read(){return self}',
        'function self(){return 1}let x=self;',
        'let self=1;let x=window;',
        'function read(self:any){return arguments}',
        'let self=1;let x=Reflect;',
        'let self=1;let x=self.constructor;'
    ])assert.equal(proof(source).current(),false,source);
    const shared=parse(header+'let self=1;let other=2;');
    const declarations=shared.body.filter(node=>node.type==='Declaration');
    declarations.at(-1).decls[0].init=declarations.at(-2).decls[0].init;
    assert.equal(inspectGeneratedHelperBindings(shared,profiles.ordinary).isCurrent(),false);
    const cyclic=parse(header+'let self=1;');cyclic.body.push(cyclic);
    assert.equal(inspectGeneratedHelperBindings(cyclic,profiles.ordinary).isCurrent(),false);
    let reads=0;const accessor=parse(header+'let self=1;');
    Object.defineProperty(accessor,'extra',{enumerable:true,get(){reads++;return null;}});
    assert.equal(inspectGeneratedHelperBindings(accessor,profiles.ordinary).isCurrent(),false);assert.equal(reads,0);
});
