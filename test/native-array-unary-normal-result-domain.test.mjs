import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {GENERATED_HELPER_PROFILES} from '../overlay/scratch-gui/src/lib/bw-makecode/generated-helper-recognition.js';
import {nativeArrayAddHelperSource} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-helper-source.js';
import {inspectNativeArrayBinaryDomains} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-domain.js';

const addition=nativeArrayAddHelperSource('__bwBinaryAdd',true,true);
const conversion='function convert(value: any): number { return +value }';
const inspect=source=>inspectNativeArrayBinaryDomains(parseMakeCodeTs(addition+'\n'+source,GENERATED_HELPER_PROFILES.ordinary));
const good=source=>{const proof=inspect(source);assert.equal(proof.reason,null,source);assert.equal(proof.helpers.size,1,source);assert.equal(proof.current(),true);return proof;};
const bad=source=>{const proof=inspect(source);assert.equal(proof.helpers.size,0,source);assert.equal(typeof proof.reason,'string',source);};

test('closed unary normal results retain captured counter initialization and genuine undefined conversion without lending an input type',()=>{
    good(conversion+';function tick(){count=__bwBinaryAdd(convert(count),(0+1))}let count:number;count=(0+0);tick()');
    good(conversion+';let uninitialized:any;let value=__bwBinaryAdd(convert(uninitialized),1)');
    good('function renamed(operand: any): number { return -1 * operand };let uninitialized:any;let value=__bwBinaryAdd(renamed(uninitialized),1)');
    good(conversion+';let value=__bwBinaryAdd(convert(foreign()),1)');
    good(conversion+';let a=[5];let uninitialized:any;let value=__bwBinaryAdd(a,convert(uninitialized))');
    bad(conversion+';let uninitialized:any;let value=__bwBinaryAdd(uninitialized,convert(uninitialized))');
    bad(conversion+';let nested=[[5]];let value=__bwBinaryAdd(nested,convert(0))');
});

test('unary result recognition retains exact body bindings all uses effects and source currentness',()=>{
    for(const body of ['return value','value=foreign();return +value','return []','return unknown(value)'])
        bad(`function convert(value: any): number { ${body} };let uninitialized:any;let value=__bwBinaryAdd(convert(uninitialized),1)`);
    bad(conversion+';convert=foreign;let uninitialized:any;let value=__bwBinaryAdd(convert(uninitialized),1)');
    bad(conversion+';foreign(convert);let uninitialized:any;let value=__bwBinaryAdd(convert(uninitialized),1)');
    bad(conversion+';let a=[5];let value=__bwBinaryAdd(a,convert(foreign()))');
    bad(conversion+';let a=[5];function use(object:any){return __bwBinaryAdd(a,convert(object))}game.onUpdate(use)');
    bad(conversion+';let a=[5];function use(callback:any){let object={valueOf:callback};return __bwBinaryAdd(a,convert(object))}game.onUpdate(use)');
    bad(conversion+';let a=[5];let object:any=0;let alias=object;alias={valueOf:function(){a.push(7);return 1}};let value=__bwBinaryAdd(a,convert(alias))');
    bad(conversion+';let a=[5];let scalar:any=0;function replace(){scalar={valueOf:function(){a.push(7);return 1}}}let value=__bwBinaryAdd(a,convert(scalar));replace()');
    bad(conversion+';let a=[5];let nested=[[5]];let value=__bwBinaryAdd(a,convert(nested))');
    bad(conversion+';let a=[5];function change(){Array.prototype.join=foreign;return 1}let value=__bwBinaryAdd(a,convert(change()))');
    const program=parseMakeCodeTs(addition+'\n'+conversion+';let value=__bwBinaryAdd(convert(undefined),1)',GENERATED_HELPER_PROFILES.ordinary);
    const proof=inspectNativeArrayBinaryDomains(program);assert.equal(proof.reason,null);assert.equal(proof.helpers.size,1);
    program.body.find(node=>node.type==='FunctionDeclaration'&&node.name==='convert').body=[];
    assert.equal(proof.current(),false,'the actual source body remains part of the currentness proof');
});
