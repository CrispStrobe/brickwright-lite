import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {GENERATED_HELPER_PROFILES} from '../overlay/scratch-gui/src/lib/bw-makecode/generated-helper-recognition.js';
import {nativeArrayAddHelperSource} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-helper-source.js';
import {inspectNativeArrayBinaryDomains} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-domain.js';
const helper=nativeArrayAddHelperSource('__bwNativeArrayAddBoth',true,true);
const analyse=text=>inspectNativeArrayBinaryDomains(parseMakeCodeTs(helper+';'+text,GENERATED_HELPER_PROFILES.ordinary));
const good=text=>{const result=analyse(text);assert.equal(result.reason,null,text);assert.equal(result.helpers.size,1,text);assert.equal(result.current(),true);};
const bad=text=>{const result=analyse(text);assert.equal(result.helpers.size,0,text);assert.equal(typeof result.reason,'string',text);};

test('native addition domain retains empty and primitive Arrays, aliases and real scalar reset alternatives',()=>{
    good('let a:any[]=null; a=[]; let b:any=0; b=a; let text=__bwNativeArrayAddBoth(b,"!")');
    good('let a:any[]=null; a=[5]; let b=a; a.push(true,null,undefined,"x"); let text=__bwNativeArrayAddBoth(b,"!")');
    good('let a=[5]; let text=__bwNativeArrayAddBoth("!",a)');
    good('let a=[null,undefined,false,"x",5]; let text=__bwNativeArrayAddBoth(a,a)');
});

test('native addition domain accounts for aliased indexed and function parameter writers',()=>{
    good('let a=[5]; let b=a; b[0]=3; function put(x:any[],v:number){x.push(v)} put(a,7); let text=__bwNativeArrayAddBoth(a,"!")');
    bad('let a=[5]; let b=a; b[0]=[]; let text=__bwNativeArrayAddBoth(a,"!")');
    bad('let a:any[]=null; a=[5]; function put(x:any[],v:any){x.push(v)} put(a,[]); let text=__bwNativeArrayAddBoth(a,"!")');
});

test('native addition domain refuses nested, cyclic, opaque and foreign producer operands',()=>{
    for(const value of ['[[5]]','[{}]','sprites.create(img`1`)','foreign()'])
        bad('let a='+value+'; let text=__bwNativeArrayAddBoth(a,"!")');
    bad('let a:any[]=[]; a.push(a); let text=__bwNativeArrayAddBoth(a,"!")');
    bad('let a:any; let text=__bwNativeArrayAddBoth(a,"!")');
});

test('native addition domain refuses unknown mutations and object or callback escapes',()=>{
    bad('let a=[5]; a.splice(0,1,{}); let text=__bwNativeArrayAddBoth(a,"!")');
    bad('let a:any[]=null; a=[5]; foreign(a); let text=__bwNativeArrayAddBoth(a,"!")');
    bad('let a=[5]; foreign(); let text=__bwNativeArrayAddBoth(a,"!")');
    bad('let a=[5]; let alter=foreign; alter(); let text=__bwNativeArrayAddBoth(a,"!")');
    bad('let a=[5]; let box={value:a}; foreign(box); let text=__bwNativeArrayAddBoth(a,"!")');
    bad('let a=[5]; function get(){return a} foreign(get); let text=__bwNativeArrayAddBoth(a,"!")');
    bad('let a=[5]; Array.prototype.join=foreign; let text=__bwNativeArrayAddBoth(a,"!")');
});


test('native addition proves the complete authentic named getter export without admitting JSON or global effects',()=>{
    const original=readFileSync(new URL('./fixtures/makecode/native-array-public-getter-source.ts',import.meta.url),'utf8');
    const plain='function __bwBinaryAdd(left: any, right: any): any { return left + right }';
    assert.equal(original.startsWith(plain+'\n'),true);
    const source=original.replace(plain,nativeArrayAddHelperSource('__bwBinaryAdd',true,true));
    const inspect=text=>inspectNativeArrayBinaryDomains(parseMakeCodeTs(text,GENERATED_HELPER_PROFILES.ordinary));
    const result=inspect(source);
    assert.equal(result.reason,null);assert.equal(result.helpers.size,1);assert.equal(result.arrayHelpers.has('__bwBinaryAdd'),true);assert.equal(result.current(),true);
    const refuse=text=>{const found=inspect(text);assert.equal(found.helpers.size,0);assert.equal(typeof found.reason,'string');};
    refuse(source.replace('__bwNamedArrayPush(__bwNamedArray_named, 5)','__bwNamedArrayPush(__bwNamedArray_named, "[]")'));
    refuse('function isNaN(value:any):boolean{return false}\n'+source);
    refuse(source+'\nisNaN = foreign');
    refuse(source+'\nJSON["parse"] = foreign');
    refuse(source+'\nArray.prototype["join"] = foreign');
    refuse(source+'\nlet prototypeAlias=Array.prototype; prototypeAlias["join"]=foreign');
    refuse(source.replace('__bwNamedArrayGet(__bwNamedArray_named, 0)','__bwNamedArrayGet(__bwNamedArray_named, {})'));
    const forged=parseMakeCodeTs(helper+';let a=foreign(); let text=__bwNativeArrayAddBoth(a,"!")',GENERATED_HELPER_PROFILES.ordinary);
    const declaration=forged.body.find(node=>node.type==='Declaration'&&node.decls.some(value=>value.name==='a'));
    declaration.decls[0].init={type:'NativeNamedArrayCreate',registry:'a',json:'[5]'};
    const forgedResult=inspectNativeArrayBinaryDomains(forged);
    assert.equal(forgedResult.helpers.size,0);assert.equal(typeof forgedResult.reason,'string');
});
