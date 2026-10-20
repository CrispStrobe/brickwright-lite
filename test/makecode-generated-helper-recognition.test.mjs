import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {GENERATED_HELPER_PROFILES as profiles,inspectGeneratedHelperBindings,mapGeneratedSourceArray} from '../overlay/scratch-gui/src/lib/bw-makecode/generated-helper-recognition.js';
import {LEGACY_JSON_SOURCE,LEGACY_PARSE_SOURCE,ARRAY_ACCESS_SOURCE} from '../overlay/scratch-gui/src/lib/bw-makecode/legacy-array-values.js';
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
    for(const effect of ['__bwNamedJsonValue`text`','Function`return JSON`()','JSON.parse`7`','img`${Function("return JSON")()}`','hex`${__bwNamedJsonValue("7")}`','external()','let unknown:any=null;unknown["change"]()']){
        const ast=parse(LEGACY_JSON_SOURCE+'\n'+effect),proof=inspectGeneratedHelperBindings(ast,profiles.ordinary);
        assert.ok(!proof.isCurrent()||!proof.closed(ast.body[0]),effect);
        const result=arcadeToPseudocode(LEGACY_JSON_SOURCE+'\n'+effect);
        assert.match(result.code,/__bwNamedJsonValue/,effect);
    }
    const malformed=parse(LEGACY_JSON_SOURCE+'\nlet image=img`1`');malformed.body.at(-1).decls[0].init.value=7;
    assert.equal(inspectGeneratedHelperBindings(malformed,profiles.ordinary).isCurrent(),false);
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

test('retained default metadata agrees with executable prologues and preserves pure initializers',()=>{
    for(const effect of ['function mutate(x:any=Function("return JSON")()){return x}mutate()',
        'function mutate(x:any=__bwNamedJsonValue`text`){return x}mutate()',
        'function mutate(x:any=JSON.parse`7`){return x}mutate()']){
        const ast=parse(LEGACY_JSON_SOURCE+'\n'+effect),proof=inspectGeneratedHelperBindings(ast,profiles.ordinary);
        assert.equal(proof.isCurrent(),false,effect);
        const result=arcadeToPseudocode(LEGACY_JSON_SOURCE+'\n'+effect);assert.match(result.code,/__bwNamedJsonValue/);
    }
    const pure=parse(LEGACY_PARSE_SOURCE+'\nfunction seven(){return 7}function ordinary(x:any=seven()){return x}ordinary()');
    const pureProof=inspectGeneratedHelperBindings(pure,profiles.ordinary);
    assert.equal(pureProof.isCurrent(),true);assert.equal(pureProof.closed(pure.body[0]),true,'actual pure nonliteral default remains eligible');
    const callback=parse(LEGACY_PARSE_SOURCE+'\ngame.onUpdate(function(x:any=7){console.log(x)})',profiles.metadata);
    const callbackProof=inspectGeneratedHelperBindings(callback,profiles.metadata);
    assert.equal(callbackProof.isCurrent(),true);assert.equal(callbackProof.closed(callback.body[0]),true,'actual literal callback default keeps its own parameter binding');
    const allocated=parse(LEGACY_PARSE_SOURCE+'\nfunction ordinary(x:any=[]){return x}ordinary()');
    assert.equal(inspectGeneratedHelperBindings(allocated,profiles.ordinary).isCurrent(),true,'actual Array default prologue remains visible');
    const ast=parse(LEGACY_JSON_SOURCE+'\nfunction external(x:any=0){return x}external()');
    const fn=ast.body.at(-2);fn.params.parameterDefaults[0].value={type:'Call',callee:{type:'Identifier',name:'unknown'},args:[]};
    assert.equal(inspectGeneratedHelperBindings(ast,profiles.ordinary).isCurrent(),false,'metadata-only effect edit cannot borrow prologue coverage');
});

test('named reconstruction normalizes legacy consumers under the same original Array proof',()=>{
    const source=LEGACY_JSON_SOURCE+'\n'+NAMED_ARRAY_GET_SOURCE+'\n'+ARRAY_ACCESS_SOURCE+
        '\nlet actual:any[]=[[1]];let row=actual[0];__bwArrayAccess(row).push(4);let out=__bwNamedArrayGet(actual,0)';
    const ast=parse(source),result=lowerNamedArrayItemHelpers(ast,{profile:profiles.ordinary});
    assert.deepEqual(result.unsupported,[]);
    assert.equal(namedNodes(result.program).filter(node=>node.type==='NativeArrayAccess').length,1);
    assert.equal(namedNodes(result.program).filter(node=>node.type==='NativeNamedArrayCreate').length,1);
    assert.equal(result.program.body.filter(node=>node.type==='FunctionDeclaration').length,0);
    const converted=arcadeToPseudocode(source);
    assert.deepEqual(converted.unsupported,[]);
    const escaped=parse(source+';let escaped=__bwArrayAccess');
    const retained=lowerNamedArrayItemHelpers(escaped,{profile:profiles.ordinary});
    assert.ok(retained.program.body.some(node=>node.type==='FunctionDeclaration'&&node.name==='__bwArrayAccess'));
    assert.equal(namedNodes(retained.program).filter(node=>node.type==='NativeArrayAccess').length,0);
});
