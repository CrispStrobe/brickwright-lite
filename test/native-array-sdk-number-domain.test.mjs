import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {GENERATED_HELPER_PROFILES} from '../overlay/scratch-gui/src/lib/bw-makecode/generated-helper-recognition.js';
import {nativeArrayAddHelperSource} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-helper-source.js';
import {inspectNativeArrayBinaryDomains} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-domain.js';

const helper=nativeArrayAddHelperSource('__bwBinaryAdd',true,true),profile=GENERATED_HELPER_PROFILES.ordinary;
const inspect=source=>{
    const program=parseMakeCodeTs(helper+';'+source,profile);
    return {program,proof:inspectNativeArrayBinaryDomains(program,profile)};
};
const good=source=>{
    const result=inspect(source);
    assert.equal(result.proof.reason,null,source);
    assert.equal(result.proof.helpers.size,1,source);
    assert.equal(result.proof.current(),true,source);
    return result;
};
const bad=source=>{
    const {proof}=inspect(source);
    assert.equal(proof.helpers.size,0,source);
    assert.equal(typeof proof.reason,'string',source);
};

test('actual closed SDK and scene-clock Number producers compose with native scalar addition without an annotation grant',()=>{
    for(const expression of ['info.score()','info.player2.score()','Math.floor(1.5)','Math.max(1,2)',
        'randint(1,3)','game.runtime()','Infinity','NaN'])
        good(`let result=__bwBinaryAdd(${expression},1)`);
    good('let result=__bwBinaryAdd(Math.floor(foreign()),1)');
    const {program,proof}=good('let result=__bwBinaryAdd(info.score(),1)');
    const declaration=program.body.find(node=>node.type==='Declaration');
    const call=declaration.decls[0].init.args[0];
    call.callee.name='unprovedScore';
    assert.equal(proof.current(),false,'the exact producer/member remains held by source currentness');
    assert.equal(inspectNativeArrayBinaryDomains(program,profile).helpers.size,0);
    // These profiles deliberately do not infer a Number from a declared
    // return annotation, an arbitrary API spelling or a parser callback.
    for(const expression of ['foreign()','parseInt("7")','game.eventContext().deltaTime'])
        bad(`let result=__bwBinaryAdd(${expression},1)`);
});

test('SDK root writes aliases shadowing actual writers and opaque coercion retain native Array refusal',()=>{
    for(const source of [
        'let info:any={score:function(){return {}}};let result=__bwBinaryAdd(info.score(),1)',
        'let result=__bwBinaryAdd(info.score(),1);function replace(){info.score=foreign}',
        'let saved=info;let result=__bwBinaryAdd(info.score(),1)',
        'let Math:any={floor:function(n:any){return {}}};let result=__bwBinaryAdd(Math.floor(1),1)',
        'let result=__bwBinaryAdd(Math.floor(1),1);Math.floor=foreign',
        'let result=__bwBinaryAdd(game.runtime(),1);game.runtime=foreign',
        'let saved=game;let result=__bwBinaryAdd(game.runtime(),1)',
        'function randint(a:any,b:any){return {}}let result=__bwBinaryAdd(randint(1,2),1)',
        'let amount:any=info.score();amount={};let result=__bwBinaryAdd(amount,1)',
        'let amount:any;function read(){return __bwBinaryAdd(amount,1)}amount=info.score();function later(){amount=[1]}read()',
        'let values=[1];let result=__bwBinaryAdd(values,Math.floor(foreign()))',
        'let values=[1];info.setScore(foreign());let result=__bwBinaryAdd(values,info.score())',
        'let values=[1];info.changeScoreBy(foreign());let result=__bwBinaryAdd(values,info.score())',
        'let values=[1];let object={valueOf:function(){values.push(2);return 1}};info.setScore(object);let result=__bwBinaryAdd(values,info.score())',
        'let values=[1];Number(foreign());let result=__bwBinaryAdd(values,Math.floor(1))',
        'let values=[1];function callback(opaque:any){return __bwBinaryAdd(values,Math.floor(opaque))}game.onUpdate(callback)',
        'let values=[1];let object={valueOf:function(){values.push(2);return 1}};let result=__bwBinaryAdd(values,Math.floor(object))',
        'let values=[1];let result=__bwBinaryAdd(values,Math.floor(missing));let missing:any',
        'let values=[1];run();let missing:any;function run(){Math.floor(missing)}let result=__bwBinaryAdd(values,1)',
        'let values=[1];let missing:any;function later(){missing=foreign()}let result=__bwBinaryAdd(values,Math.floor(missing))',
        'let values=[1];let missing:any;function later(){missing=[2]}let result=__bwBinaryAdd(values,Math.floor(missing))',
        'let values=[1];let result=__bwBinaryAdd(values,Math.floor(undeclared))',
        'let values=[[1]];let result=__bwBinaryAdd(values,Math.floor(1))'
    ])bad(source);
    good('let values=[1];let result=__bwBinaryAdd(values,Math.floor(1.5))');
    good('let values=[1];info.setScore(2);let result=__bwBinaryAdd(values,info.score())');
    good('let values=[1];let missing:any;let result=__bwBinaryAdd(values,Math.floor(missing))');
});
