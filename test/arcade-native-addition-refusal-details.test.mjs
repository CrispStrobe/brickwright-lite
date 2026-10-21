import {test as originalTest} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {nativeArrayAddHelperSource} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-helper-source.js';
import {GENERATED_HELPER_PROFILES as P} from '../overlay/scratch-gui/src/lib/bw-makecode/generated-helper-recognition.js';
import {inspectNativeArrayBinaryDomains as inspect} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-domain.js';
const observations=[];
const test=(title,body)=>originalTest(title,async t=>{
    const first=observations.length;
    try {await body(t);}catch(error){try{t.diagnostic(JSON.stringify({schema:'native-addition-test-failure-v1',observations:observations.slice(first)}));}catch{}throw error;}
});
const helper=nativeArrayAddHelperSource('__bwNativeArrayAddBoth',true,true);
const program=text=>parseMakeCodeTs(helper+'\n'+text,P.ordinary);
const reason='native addition requires initialized primitive or proved flat Array operands';
const rejected=text=>{const result=inspect(program(text));observations.push({source:helper+'\n'+text,reason:result.reason,refusal:result.refusal??null});assert.equal(result.reason,reason);assert.equal(result.helpers.size,0);
    assert.equal(result.current(),true);assert.ok(result.refusal);return result;};
const plain=value=>{if(value===null||typeof value!=='object'){assert.notEqual(typeof value,'function');assert.notEqual(typeof value,'symbol');return;}
    assert.ok(Array.isArray(value)||Object.getPrototypeOf(value)===Object.prototype);for(const child of Object.values(value))plain(child);};

test('actual left and right rejected operands retain their original helper call and position',()=>{
    const left=rejected('let value={};let result=__bwNativeArrayAddBoth(value,1)');
    const right=rejected('let value={};let result=__bwNativeArrayAddBoth(1,value)');
    assert.equal(left.refusal.operand,'LEFT');assert.equal(left.refusal.operandIndex,0);
    assert.equal(right.refusal.operand,'RIGHT');assert.equal(right.refusal.operandIndex,1);
    for(const result of [left,right]){assert.equal(result.refusal.helper,'__bwNativeArrayAddBoth');assert.equal(result.refusal.sourceCallOrdinal,0);
        assert.equal(result.refusal.sourceRange,'UNAVAILABLE');assert.equal(result.refusal.block,'UNAVAILABLE');plain(result.refusal);
        assert.deepEqual(JSON.parse(JSON.stringify(result.refusal)),result.refusal);}
});

test('two real calls distinguish the rejected call without reclassifying the earlier valid call',()=>{
    const result=rejected('let first=__bwNativeArrayAddBoth(1,2);let bad={};let second=__bwNativeArrayAddBoth(3,bad)');
    assert.equal(result.refusal.sourceCallOrdinal,1);assert.equal(result.refusal.operand,'RIGHT');
    const inside=rejected('class Box{read(){return __bwNativeArrayAddBoth({},1)}}let box=new Box();box.read();');
    assert.equal(inside.refusal.owningProcedure,'UNAVAILABLE','Class-owned callable is never falsely labelled top level');
    const ordinary=rejected('function read(){return __bwNativeArrayAddBoth({},1)}read();');
    assert.equal(ordinary.refusal.owningProcedure,'read');
    assert.equal(result.refusal.sourceCallOrder,'CLOSED_HELPER_CALL_ORDER');
});

test('initialization and captured fallback retain actual short circuit outcomes',()=>{
    const uninitialized=rejected('let value:any;let result=__bwNativeArrayAddBoth(value,1)');
    const facts=uninitialized.refusal;
    if(facts.foundTypes.length){assert.equal(facts.initialization,false);assert.equal(facts.capturedScalar,false);assert.equal(facts.invalidDomain,'NOT_EVALUATED');}
    else {assert.equal(facts.initialization,'NOT_EVALUATED');assert.equal(facts.capturedScalar,'NOT_EVALUATED');assert.equal(facts.invalidDomain,'NOT_EVALUATED');}
    const opaque=rejected('let value={};let result=__bwNativeArrayAddBoth(1,value)').refusal;
    assert.ok(opaque.foundTypes.length);assert.equal(opaque.initialization,true);assert.equal(opaque.capturedScalar,'NOT_EVALUATED');assert.equal(opaque.invalidDomain,true);
});

test('captured scalar normal operands and nested once-only source calls retain the successful API',()=>{
    for(const source of [
        'let value=0;function receive(){return __bwNativeArrayAddBoth(value,1)}receive()',
        'let calls=0;function next(){calls+=1;return 2}let result=__bwNativeArrayAddBoth(__bwNativeArrayAddBoth(next(),1),3)'
    ]){const input=program(source),before=JSON.stringify(input),result=inspect(input);
        observations.push({source:helper+'\n'+source,input:JSON.parse(before),reason:result.reason,refusal:result.refusal??null});
        assert.equal(result.reason,null);assert.ok(result.helpers.size);assert.equal(result.current(),true);
        assert.equal(Object.hasOwn(result,'refusal'),false);assert.equal(JSON.stringify(input),before);}
});

test('an unrelated later source cannot inherit prior refusal details and changed source remains noncurrent',()=>{
    const input=program('let value={};let result=__bwNativeArrayAddBoth(value,1)'),result=inspect(input);
    assert.equal(result.reason,reason);input.body.push({type:'Declaration',kind:'let',decls:[{name:'later',init:{type:'Number',value:'1'}}]});
    assert.equal(result.current(),false);
    const goodSource='let result=__bwNativeArrayAddBoth(1,2)',good=inspect(program(goodSource));
    observations.push({source:helper+'\n'+goodSource,reason:good.reason,refusal:good.refusal??null});assert.equal(good.reason,null);assert.equal(Object.hasOwn(good,'refusal'),false);
});

test('failure of the refusal-only observer cannot replace the original refusal',async()=>{
    const url=new URL('../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-domain.js',import.meta.url);
    const source=readFileSync(url,'utf8'),needle="            try {\n                result.refusal=";
    assert.equal(source.split(needle).length,2,'one refusal-only observer, no proof replacement');
    const observed=source.replace(needle,"            try {\n                throw new Error('observer unavailable');\n                result.refusal=")
        .replace(/\b(from\s+|import\s*\(\s*|import\s+)(['"])(\.{1,2}\/[^'"\n]+)\2/g,(_,prefix,quote,specifier)=>`${prefix}${quote}${new URL(specifier,url).href}${quote}`);
    assert.equal([...source.matchAll(/\b(from\s+|import\s*\(\s*|import\s+)(['"])(\.{1,2}\/[^'"\n]+)\2/g)].length,7,'all current literal dependencies are rebased, including parent paths');
    assert.equal(/\b(from\s+|import\s*\(\s*|import\s+)(['"])(\.{1,2}\/[^'"\n]+)\2/.test(observed),false,'data URL retains no relative literal import');
    const copy=await import('data:text/javascript;base64,'+Buffer.from(observed).toString('base64'));
    const result=copy.inspectNativeArrayBinaryDomains(program('let value={};let result=__bwNativeArrayAddBoth(value,1)'));
    assert.equal(result.reason,reason);assert.equal(result.helpers.size,0);assert.equal(Object.hasOwn(result,'refusal'),false);
});
