import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {nativeArrayAddHelperSource,inspectNativeArrayAddHelpers} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-helper-source.js';
import {inspectNativeArrayBinaryDomains} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-domain.js';
import {GENERATED_HELPER_PROFILES as profiles} from '../overlay/scratch-gui/src/lib/bw-makecode/generated-helper-recognition.js';
const header=nativeArrayAddHelperSource('__bwBinaryAdd',true,true);
const inspect=source=>{
    const ast=parseMakeCodeTs(header+';'+source,profiles.ordinary);
    assert.equal(inspectNativeArrayAddHelpers(ast,profiles.ordinary).helpers.size,1,'actual complete current helper syntax is a prerequisite');
    return {ast,result:inspectNativeArrayBinaryDomains(ast,profiles.ordinary)};
};
test('actual nested closed helpers compose only primitive captured scalar inputs and preserve currentness',()=>{
    for(const source of [
        'let trace="";function run(n:number){trace=__bwBinaryAdd(__bwBinaryAdd(trace,"a"),n)}run(7);',
        'let trace:any;function run(){return __bwBinaryAdd(__bwBinaryAdd(trace,"a"),1)}let out=run();trace="";',
        'let trace="";function run(n:number){return __bwBinaryAdd(__bwBinaryAdd(__bwBinaryAdd(trace,"a"),n),"!")}let out=run(7);'
    ]){
        const {ast,result}=inspect(source);assert.equal(result.reason,null,source);
        assert.equal(result.helpers.size,1);assert.equal(result.current(),true);assert.equal(result.arrayHelpers.size,0,'no Array join authority through this primitive-only alternative');
        ast.body.push({type:'ExpressionStatement',expr:{type:'Call',callee:{type:'Identifier',name:'foreign'},args:[]}});
        assert.equal(result.current(),false,'actual source mutation expires held proof');
    }
});
test('opaque and Array writers, TDZ, callee forgery and coercion callbacks cannot borrow nested primitive result facts',()=>{
    for(const source of [
        'let trace:any="";function run(){return __bwBinaryAdd(__bwBinaryAdd(trace,"a"),1)}trace=foreign();let out=run();',
        'let trace:any="";function run(){return __bwBinaryAdd(__bwBinaryAdd(trace,"a"),1)}trace={value:1};let out=run();',
        'let trace:any="";function run(){return __bwBinaryAdd(__bwBinaryAdd(trace,"a"),1)}trace=[{}];let out=run();',
        'let trace:any="";function run(){return __bwBinaryAdd(__bwBinaryAdd(trace,"a"),1)}trace=[[1]];let out=run();',
        'let values=[1];values.push({});let out=__bwBinaryAdd(__bwBinaryAdd(values,"a"),1);',
        'let values=[1];foreign(values);let out=__bwBinaryAdd(__bwBinaryAdd(values,"a"),1);',
        'let values:any;function read(){return __bwBinaryAdd(__bwBinaryAdd(values,"a"),1)}let out=read();values=[1];',
        'let out=__bwBinaryAdd(__bwBinaryAdd(trace,"a"),1);let trace="";',
        'function read(){return __bwBinaryAdd(__bwBinaryAdd(trace,"a"),1)}let out=read();let trace="";',
        'function outer(){let out=__bwBinaryAdd(__bwBinaryAdd(trace,"a"),1);let trace="";return out}let out=outer();',
        'function outer(){function read(){return __bwBinaryAdd(__bwBinaryAdd(trace,"a"),1)}let out=read();let trace="";return out}let out=outer();',
        'function other(value:any){return value}let trace="";function run(){return __bwBinaryAdd(other(trace),1)}let out=run();',
        'let values=[1];let bad={valueOf:function(){values.push({});return 1}};let inner=__bwBinaryAdd(bad,"a");let out=__bwBinaryAdd(values,inner);'
    ]){
        const {result}=inspect(source);assert.equal(typeof result.reason,'string',source);assert.equal(result.helpers.size,0,source);
    }
    // A Block cannot become a function/capture owner by supplied field shape.
    const forged=parseMakeCodeTs(header+';function outer(){ {let out=__bwBinaryAdd(__bwBinaryAdd(trace,"a"),1)}let trace=""}let out=outer();',profiles.ordinary);
    const outer=forged.body.find(node=>node.type==='FunctionDeclaration'&&node.name==='outer');
    const block=outer.body.find(node=>node.type==='Block');assert.ok(block,'actual same-function TDZ block exists');
    block.params=[];
    const refused=inspectNativeArrayBinaryDomains(forged,profiles.ordinary);
    assert.equal(typeof refused.reason,'string');assert.equal(refused.helpers.size,0,'params/body shape cannot grant callable identity');
    // An actually initialized flat Array remains governed by the original
    // Array allocation/writer/effect proof, never by the captured exception.
    const {result}=inspect('let values=[1];let out=__bwBinaryAdd(__bwBinaryAdd(values,"a"),1);');
    assert.equal(result.reason,null);assert.equal(result.arrayHelpers.has('__bwBinaryAdd'),true);
});
