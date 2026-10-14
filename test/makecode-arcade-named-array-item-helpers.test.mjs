import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {NAMED_ARRAY_GET_SOURCE,lowerNamedArrayItemHelpers} from '../overlay/scratch-gui/src/lib/bw-makecode/named-array-item-helpers.js';
import {LEGACY_JSON_SOURCE} from '../overlay/scratch-gui/src/lib/bw-makecode/legacy-array-values.js';
const parse=source=>parseMakeCodeTs(source,{parameterDefaults:true,retainParentheses:true});
const lower=body=>lowerNamedArrayItemHelpers(parse(LEGACY_JSON_SOURCE+'\n'+NAMED_ARRAY_GET_SOURCE+'\n'+body));
const nodes=node=>!node || typeof node!=='object'?[]:[node,...Object.values(node).flatMap(value=>Array.isArray(value)?value.flatMap(nodes):nodes(value))];
test('exact whole getter reconstructs actual registry construction, reads and deletion',()=>{
    const result=lower('let actual:any[]=null;actual=[12,"word",[1,2],null,true];let alias=actual;let value=__bwNamedArrayGet(actual,0);actual=[];actual=null');
    assert.deepEqual(result.unsupported,[]);
    const all=nodes(result.program);
    assert.equal(all.filter(node=>node.bwNativeNamedArray?.kind==='get').length,1);
    assert.equal(all.filter(node=>node.type==='NativeNamedArrayCreate').length,2);
    assert.equal(all.filter(node=>node.type==='NativeNamedArrayDelete').length,2);
    assert.equal(all.find(node=>node.type==='NativeNamedArrayCreate').json,'[12,"word",[1,2],null,true]');
    assert.ok(all.some(node=>node.type==='Identifier' && node.name==='actual'));
    assert.ok(!result.program.body.some(node=>node.type==='FunctionDeclaration' && node.name==='__bwNamedArrayGet'));
});
test('actual body and binding authority survive helper and registry rename',()=>{
    const source=(LEGACY_JSON_SOURCE+'\n'+NAMED_ARRAY_GET_SOURCE+'\nlet unrelated:any[]=null;unrelated=["word"];let value=__bwNamedArrayGet(unrelated,0)').replaceAll('__bwNamedArrayGet','ownedGetter').replaceAll('__bwNamedJsonValue','ownedJson');
    const result=lowerNamedArrayItemHelpers(parse(source));
    assert.deepEqual(result.unsupported,[]);
    assert.equal(nodes(result.program).find(node=>node.bwNativeNamedArray?.kind==='get').bwNativeNamedArray.registry,'unrelated');
});
test('foreign receivers and unknown or compound writers refuse registry reconstruction',()=>{
    for(const source of ['let actual:any[]=null;let alias=actual;let value=__bwNamedArrayGet(alias,0)',
        'let actual:any[]=external();let value=__bwNamedArrayGet(actual,0)',
        'let actual:any[]=null;actual=external();let value=__bwNamedArrayGet(actual,0)',
        'let actual:any[]=null;actual+=1;let value=__bwNamedArrayGet(actual,0)',
        'let actual:any[]=null;function f(actual:any[]){return __bwNamedArrayGet(actual,0)}']){
        const result=lower(source);assert.ok(result.unsupported.length,source);
        assert.ok(!nodes(result.program).some(node=>node.bwNativeNamedArray?.kind==='get'));
    }
});
test('edited and old JSON-only bodies gain no new getter authority',()=>{
    for(const helper of [NAMED_ARRAY_GET_SOURCE.replace('return value\n','return "changed"\n'),
        'function __bwNamedArrayGet(array:any[],index:any):any{return array ? __bwNamedJsonValue(array[+index]) : ""}']){
        const result=lowerNamedArrayItemHelpers(parse(LEGACY_JSON_SOURCE+'\n'+helper+'\nlet actual:any[]=null;let value=__bwNamedArrayGet(actual,0)'));
        assert.ok(!nodes(result.program).some(node=>node.bwNativeNamedArray?.kind==='get'));
    }
});

test('direct indexed writers and historical aliases cannot hide reference or unknown producers',()=>{
    for(const source of [
        'let actual:any[]=null;actual=[1];actual[0]=external();let value=__bwNamedArrayGet(actual,0)',
        'let actual:any[]=null;actual=[1];let alias=actual;alias.push(external());alias=[];let value=__bwNamedArrayGet(actual,0)',
        'let actual:any[]=null;actual=[1];function forward(){return actual}let alias=forward();function bad(array:any[]){array[0]=external()}bad(alias);let value=__bwNamedArrayGet(actual,0)'
    ]){const result=lower(source);assert.ok(result.unsupported.length,source);assert.ok(!nodes(result.program).some(node=>node.bwNativeNamedArray));}
});

test('duplicate or replaced actual helper bindings cannot gain registry authority',()=>{
    for(const extra of ['function __bwNamedArrayGet(array:any[],index:any):any{return 123}','let __bwNamedArrayGet=null','let __bwNamedJsonValue=null']){
        const result=lower(extra+';let actual:any[]=null;actual=[1];let value=__bwNamedArrayGet(actual,0)');
        assert.ok(result.unsupported.some(message=>/lexical binding/.test(message)));
        assert.ok(!nodes(result.program).some(node=>node.bwNativeNamedArray));
    }
});

test('nested If and loop locals never bind to a same-named global registry',()=>{
    const prefix='let actual:any[]=[1];let out=0;';
    for(const body of [
        'if(true){let actual:any[]=[2];out=__bwNamedArrayGet(actual,0)}',
        'if(true){var actual:any[]=[2]}out=__bwNamedArrayGet(actual,0)',
        'for(let actual=0;actual<1;actual++){out=__bwNamedArrayGet(actual,0)}',
        'for(let actual of [[2]]){out=__bwNamedArrayGet(actual,0)}',
        'while(true){let actual:any[]=[2];out=__bwNamedArrayGet(actual,0);break}'
    ]){
        const result=lower(prefix+'function run(){'+body+'}run()');
        assert.ok(result.unsupported.length,body);
        assert.ok(!nodes(result.program).some(node=>node.bwNativeNamedArray));
    }
    const root=lower('var actual:any[]=[1];if(true){var actual:any[]=[2]}let out=__bwNamedArrayGet(actual,0)');
    assert.ok(root.unsupported.some(message=>/nested root declaration/.test(message)));
});
