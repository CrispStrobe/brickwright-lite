import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {analyseSourceValueProducers} from '../overlay/scratch-gui/src/lib/bw-makecode/source-value-producers.js';
import {nativeArrayAddHelperSource} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-helper-source.js';
import {inspectNativeArrayBinaryDomains} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-domain.js';
import {GENERATED_HELPER_PROFILES} from '../overlay/scratch-gui/src/lib/bw-makecode/generated-helper-recognition.js';
const profile=GENERATED_HELPER_PROFILES.ordinary,header=nativeArrayAddHelperSource('__bwBinaryAdd',true,true);
const options={arrayValues:true,parenthesized:true,unboundIsOpaque:true,uninitializedLocalsAreOpaque:true,declaredLocalUndefined:true,initializationEntries:true};
const parse=source=>parseMakeCodeTs(source,profile);
const inspect=source=>inspectNativeArrayBinaryDomains(parse(header+';'+source),profile);
const good=source=>{const out=inspect(source);assert.equal(out.reason,null,source);assert.equal(out.helpers.size,1);assert.equal(out.current(),true);};
const bad=source=>{const out=inspect(source);assert.equal(out.helpers.size,0,source);assert.equal(typeof out.reason,'string',source);};
const readOf=ast=>ast.body.find(node=>node.type==='FunctionDeclaration'&&node.name==='read').body.find(node=>node.type==='Return').value;

test('closed hoisted direct entries meet every actual call frontier without turning Undefined into initialization',()=>{
    const ast=parse('Math.abs(1);let value:any;function read(){return value}let first=read();value="later";read();');
    const graph=analyseSourceValueProducers(ast,options),read=readOf(ast);
    assert.equal(graph.isInitializedAt(read),false);
    assert.equal(graph.isCapturedLexicalDeclarationReadyAt(read),true);
    good('Math.abs(1);let value:any;function read(){return __bwBinaryAdd(value,"!")}let first=read();value="later";read();');
    good('Math.abs(1);let value:any;function read(){return __bwBinaryAdd(value,"!")}function forward(){return read()}let first=forward();value="later";');
});

test('one valid later entry cannot mask an early dormant recursive aliased replaced or escaped entry',()=>{
    for(const source of [
        'read();Math.abs(1);let value:any;function read(){return __bwBinaryAdd(value,"!")}value="later";read();',
        'function dormant(){return read()}Math.abs(1);let value:any;function read(){return __bwBinaryAdd(value,"!")}value="later";read();',
        'Math.abs(1);let value:any;function read(){read();return __bwBinaryAdd(value,"!")}value="later";read();',
        'Math.abs(1);let value:any;function read(){return __bwBinaryAdd(value,"!")}let alias=read;value="later";alias();read();',
        'Math.abs(1);let value:any;function read(){return __bwBinaryAdd(value,"!")}foreign(read);value="later";read();',
        'Math.abs(1);let value:any;function read(){return __bwBinaryAdd(value,"!")}read=function(){return 1};value="later";read();'
    ])bad(source);
});

test('initializer defaults branches and uncertain nested entry cannot borrow a later hoisted declaration frontier',()=>{
    const defaultAst=parse('Math.abs(1);let value:any;function before(arg=read()){return 0}function read(){return value}before();value="later";');
    const before=defaultAst.body.find(node=>node.type==='FunctionDeclaration'&&node.name==='before');
    assert.equal(Object.hasOwn(before,'parameterDefaults'),false,'untyped ordinary declaration omits callable-level defaults');
    assert.deepEqual(before.ordinaryParameterDefaultNames,['arg']);
    const defaults=Object.getOwnPropertyDescriptor(before.params,'parameterDefaults');
    assert.equal(defaults.enumerable,false);
    assert.equal(defaults.value.length,1);
    assert.equal(defaults.value[0].value.type,'Call');
    assert.equal(defaults.value[0].value.callee.name,'read','actual pre-body call is retained');
    assert.equal(analyseSourceValueProducers(defaultAst,options).isCapturedLexicalDeclarationReadyAt(readOf(defaultAst)),false);
    for(const source of [
        'Math.abs(1);let value:any=read();function read(){return __bwBinaryAdd(value,"!")}value="later";',
        'Math.abs(1);let value:any;function before(arg=read()){return 0}function read(){return __bwBinaryAdd(value,"!")}before();value="later";',
        'function outer(){if(foreign()){read()}let value:any;function read(){return __bwBinaryAdd(value,"!")}value="later";read()}outer();',
        'function outer(){while(foreign()){read()}let value:any;function read(){return __bwBinaryAdd(value,"!")}value="later";read()}outer();'
    ])bad(source);
    for(const suffix of ['class Child extends read {}','read`literal`;']){
        const ast=parse('Math.abs(1);let value:any;function read(){return value}'+suffix+'read();value="later";');
        assert.equal(readOf(ast).type,'Identifier');
        assert.equal(analyseSourceValueProducers(ast,options).isCapturedLexicalDeclarationReadyAt(readOf(ast)),false,'heritage/tag string references cannot evade the complete entry census');
    }
    const ast=parse('Math.abs(1);let value:any;function read(){return value}let first=read();value="later";');
    // A forged executable-looking argument is not a physical Declaration.
    ast.body[0].expr.args.push({type:'Declaration',kind:'let',decls:[{name:'value',init:null}]});
    assert.equal(analyseSourceValueProducers(ast,options).isCapturedLexicalDeclarationReadyAt(readOf(ast)),false);
});

test('closed-entry readiness preserves full writer domains and actual parameter or Array escape obligations',()=>{
    for(const value of ['foreign()','{}','[1]','sprites.create(img`1`,0)'])
        bad('Math.abs(1);let value:any;function read(){return __bwBinaryAdd(value,"!")}read();value='+value+';');
    bad('Math.abs(1);let value:any;function read(input:any){return __bwBinaryAdd(input,value)}read(foreign());value="later";');
    bad('Math.abs(1);let values:any;function read(){return __bwBinaryAdd(values,"!")}read();values=[1];');
    const reflected=parse('Math.abs(1);let value:any;eval("value = {}");function read(){return value}value="later";read();');
    assert.equal(readOf(reflected).type,'Identifier');
    assert.equal(analyseSourceValueProducers(reflected,options).isCapturedLexicalDeclarationReadyAt(readOf(reflected)),false,'reflection cannot establish the new all-entry readiness fact');
    const refused=inspect('Math.abs(1);let value:any;eval("value = {}");function read(){return __bwBinaryAdd(value,"!")}value="later";read();');
    assert.equal(refused.helpers.size,0,'prior canonical helper refusal does not manufacture a domain reason');
    const ast=parse('Math.abs(1);let value:any;function read(){return value}read();value="later";'),read=readOf(ast),graph=analyseSourceValueProducers(ast,options);
    assert.equal(graph.isCapturedLexicalDeclarationReadyAt(read),true);
    ast.body.unshift({type:'ExpressionStatement',expr:{type:'Call',callee:{type:'Identifier',name:'read'},args:[]}});
    assert.equal(graph.isCapturedLexicalDeclarationReadyAt(read),false,'physical added early entry expires complete census');
});
