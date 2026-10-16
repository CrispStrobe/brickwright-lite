import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {GENERATED_HELPER_PROFILES as profiles,inspectGeneratedHelperBindings,mapGeneratedSourceArray} from '../overlay/scratch-gui/src/lib/bw-makecode/generated-helper-recognition.js';
import {LEGACY_JSON_SOURCE,LEGACY_PARSE_SOURCE} from '../overlay/scratch-gui/src/lib/bw-makecode/legacy-array-values.js';
import {NAMED_ARRAY_GET_SOURCE,lowerNamedArrayItemHelpers} from '../overlay/scratch-gui/src/lib/bw-makecode/named-array-item-helpers.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {HELPERS} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-runtime.js';
const parse=(source,profile=profiles.ordinary)=>parseMakeCodeTs(source,profile);
const helperSource=LEGACY_JSON_SOURCE+'\n'+NAMED_ARRAY_GET_SOURCE+'\nlet actual:any[]=null;actual=[12,"text"];let answer=__bwNamedArrayGet(actual,0)';
const namedNodes=node=>!node||typeof node!=='object'?[]:[node,...Object.values(node).flatMap(v=>Array.isArray(v)?v.flatMap(namedNodes):namedNodes(v))];
for(const [name,profile]of Object.entries(profiles))test(`actual ${name} parser context recognizes complete named helpers`,()=>{
    const ast=parse(helperSource,profile),result=lowerNamedArrayItemHelpers(ast,{profile});
    assert.deepEqual(result.unsupported,[]);
    assert.equal(namedNodes(result.program).filter(n=>n.bwNativeNamedArray?.kind==='get').length,1);
    assert.ok(!result.program.body.some(n=>n.type==='FunctionDeclaration'&&n.name==='__bwNamedArrayGet'));
});
test('canonical matching retains actual defaults and refuses a different selected context',()=>{
    const ast=parse(LEGACY_JSON_SOURCE),fn=ast.body[0],proof=inspectGeneratedHelperBindings(ast,profiles.ordinary);
    assert.equal(proof.matches(fn,LEGACY_JSON_SOURCE),true);
    assert.equal(inspectGeneratedHelperBindings(ast,profiles.direct).matches(fn,LEGACY_JSON_SOURCE),false);
    fn.params.parameterDefaults[0].value={type:'Number',value:'9'};
    assert.equal(proof.isCurrent(),false);
    assert.equal(proof.matches(fn,LEGACY_JSON_SOURCE),false);
});
test('known parameter metadata is preserved without restoring old numeric elements',()=>{
    const ast=parse(LEGACY_JSON_SOURCE),params=ast.body[0].params;
    const mapped=mapGeneratedSourceArray(params,value=>Array.isArray(value)?value.map(x=>x):value==='value'?'changed':value);
    assert.equal(mapped[0],'changed');assert.equal(mapped[1],'stack');
    for(const key of ['optionalParams','parameterDefaults','parameterProperties']){
        const a=Object.getOwnPropertyDescriptor(params,key),b=Object.getOwnPropertyDescriptor(mapped,key);
        assert.deepEqual({...b,value:null},{...a,value:null});assert.notEqual(a.value,b.value);
        assert.deepEqual(a.value,b.value);
    }
    Object.defineProperty(params,'foreign',{get(){throw new Error('must not read');}});
    assert.throws(()=>mapGeneratedSourceArray(params,x=>x),/actual parser parameter metadata/);
});
test('safe helper rename follows actual callee and declaration identity',()=>{
    const source=helperSource.replaceAll('__bwNamedJsonValue','serializeOwned').replaceAll('__bwNamedArrayGet','readOwned');
    const result=lowerNamedArrayItemHelpers(parse(source),{profile:profiles.ordinary});
    assert.deepEqual(result.unsupported,[]);
    assert.equal(namedNodes(result.program).filter(n=>n.bwNativeNamedArray?.kind==='get').length,1);
});
test('full helper body and default edits receive no canonical authority',()=>{
    for(const source of [LEGACY_JSON_SOURCE.replace('stack: any[] = null','stack: any[] = []'),
        LEGACY_JSON_SOURCE.replace('return result','game.splash("extra"); return result')]){
        const ast=parse(source),proof=inspectGeneratedHelperBindings(ast,profiles.ordinary);
        assert.equal(proof.matches(ast.body[0],LEGACY_JSON_SOURCE),false);
    }
});
test('duplicate, nested shadow, var hoisting, writes and extraction reject actual helper binding',()=>{
    for(const suffix of ['function owned(value:any){return value}',
        'function other(){var owned=0}', 'function other(owned:any){return owned}',
        'owned=other', 'let alias=owned', 'consume(owned)']){
        const ast=parse('function owned(value:any){return value}\n'+suffix),proof=inspectGeneratedHelperBindings(ast,profiles.ordinary);
        const fn=ast.body[0];assert.ok(!proof.root(fn)||proof.calls(fn,[1])===null,suffix);
    }
});
test('canonical builtin receiver shadow, mutation and namespace escape prevent helper removal',()=>{
    for(const suffix of ['let JSON=external()', 'JSON.parse=external', 'consume(JSON)']){
        const ast=parse(LEGACY_PARSE_SOURCE+'\n'+suffix),proof=inspectGeneratedHelperBindings(ast,profiles.ordinary);
        assert.equal(proof.closed(ast.body[0]),false,suffix);
    }
});
test('shared executable identity, cycles and accessors refuse before lexical traversal',()=>{
    const ast=parse('let x=1;let y=2');ast.body[1].decls[0].init=ast.body[0].decls[0].init;
    assert.equal(inspectGeneratedHelperBindings(ast,profiles.ordinary).isCurrent(),false);
    const cyclic=parse('let x=1');cyclic.body.push(cyclic);
    assert.equal(inspectGeneratedHelperBindings(cyclic,profiles.ordinary).isCurrent(),false);
    let reads=0;const accessor=parse('let x=1');Object.defineProperty(accessor,'extra',{enumerable:true,get(){reads++;return null;}});
    assert.equal(inspectGeneratedHelperBindings(accessor,profiles.ordinary).isCurrent(),false);assert.equal(reads,0);
    const misplaced=parse('let x=1');Object.defineProperty(misplaced.body,'parameterDefaults',{value:[]});
    assert.equal(inspectGeneratedHelperBindings(misplaced,profiles.ordinary).isCurrent(),false);
});
test('retained legacy caller cannot lose its serializer dependency',()=>{
    const source=LEGACY_JSON_SOURCE+'\nlet keep=__bwNamedJsonValue;let result=__bwNamedJsonValue(7)';
    const result=arcadeToPseudocode(source);
    assert.match(result.code,/__bwNamedJsonValue/);
});
const stopSource=`${HELPERS.tok.ts}
let _som_Game=0
let _sok_Game=0
function _stopAll(){_stopMark=_tokens;music.stopAllSounds()}
game.onUpdate(function(){const _t=_tok();if(_dead(_t))return;if(_t<=_som_Game&&_t!=_sok_Game)return;_som_Game=_tokens;_sok_Game=_t;_stopAll()})`;
test('complete stop body, token bindings and paired marks recover both actual stop operations',()=>{
    const result=arcadeToPseudocode(stopSource);
    assert.match(result.code,/^\s*stop all$/m);assert.match(result.code,/^\s*stop other scripts in sprite$/m);
    assert.doesNotMatch(result.code,/_tok|_dead|_stopAll|_stopMark|_som_|_sok_/);
});
test('extra stop effects, foreign storage access and callee escape survive recognition',()=>{
    for(const source of [stopSource.replace('music.stopAllSounds()','music.stopAllSounds();game.splash("extra")'),
        stopSource+'\nlet foreign=_tokens',stopSource+'\n_stopMark=9',stopSource+'\nlet alias=_stopAll',
        stopSource+'\nfunction f(_stopAll:any){_stopAll()}',stopSource+'\nlet music=external()',
        stopSource.replace('let _som_Game=0','const _som_Game=0'),
        stopSource.replace('_som_Game=_tokens;_sok_Game=_t','_tokens=_tokens;_stopMark=_t'),
        stopSource+'\nlet foreign=sprites.create(img`1`,SpriteKind.Player)']){
        const result=arcadeToPseudocode(source);assert.match(result.code,/_stopAll/);assert.doesNotMatch(result.code,/^\s*stop all$/m);
    }
});

test('tagged helper and ambient call effects never disappear from the actual parser graph',()=>{
    for(const effect of ['__bwNamedJsonValue`text`','Function`return JSON`()','JSON.parse`7`','external()','let unknown:any=null;unknown["change"]()']){
        const ast=parse(LEGACY_JSON_SOURCE+'\n'+effect),proof=inspectGeneratedHelperBindings(ast,profiles.ordinary);
        assert.ok(!proof.isCurrent()||!proof.closed(ast.body[0]),effect);
        const result=arcadeToPseudocode(LEGACY_JSON_SOURCE+'\n'+effect);
        assert.match(result.code,/__bwNamedJsonValue/,effect);
    }
    const literal=parse(LEGACY_PARSE_SOURCE+'\nlet image=img`1`');
    assert.equal(inspectGeneratedHelperBindings(literal,profiles.ordinary).isCurrent(),true);
    const shadow=parse(LEGACY_PARSE_SOURCE+'\nfunction img(){};let image=img`1`');
    assert.equal(inspectGeneratedHelperBindings(shadow,profiles.ordinary).isCurrent(),false);
});
test('stop lifting requires a current activated root and a terminal continuation',()=>{
    for(const source of [stopSource.replace('_stopAll()})','_stopAll();console.log("observable after")})'),
        stopSource+'\nfunction ordinary(){_stopAll();return}ordinary();console.log("caller after")',
        stopSource.replace('const _t=_tok();','const _t=_tok();function nested(){_stopAll();return}nested();'),
        stopSource+'\nconst foreign=_tok()']){
        const result=arcadeToPseudocode(source);assert.match(result.code,/_stopAll/);assert.doesNotMatch(result.code,/^\s*stop all$/m);
    }
});
