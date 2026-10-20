import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {nativeArrayAddHelperSource,nativeArrayAddHelperCandidates} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-helper-source.js';

const source=(left=true,right=false)=>nativeArrayAddHelperSource('__bwNativeArrayAdd'+(left&&right?'Both':left?'Left':'Right'),left,right);
import {GENERATED_HELPER_PROFILES} from '../overlay/scratch-gui/src/lib/bw-makecode/generated-helper-recognition.js';
const candidates=text=>nativeArrayAddHelperCandidates(parseMakeCodeTs(text,GENERATED_HELPER_PROFILES.ordinary));

test('native export helper source uses actual typed join calls for the selected operands',()=>{
    let effects=0;const name={toString(){effects++;return '__bwNativeArrayAddLeft';}};
    assert.throws(()=>nativeArrayAddHelperSource(name,true,false),/exact name/);assert.equal(effects,0);
    for(const [left,right]of [[true,false],[false,true],[true,true]]){
        const declaration=source(left,right),name=/function (\w+)/.exec(declaration)[1];
        const args=left&&right?'[5],[true]':left?'[5],"!"':'"!",[5]';
        const selected=[...candidates(declaration+`; let observed=${name}(${args})`).values()];
        assert.equal(selected.length,1);assert.equal(selected[0].leftArray,left);assert.equal(selected[0].rightArray,right);
        assert.equal(selected[0].calls.length,1);
    }
});

test('matching native helper syntax never accepts an altered body, hidden call or shadow binding',()=>{
    const declaration=source(),call='; let observed=__bwNativeArrayAddLeft([5],"!")';
    const invalid=[
        declaration.replace('array.join(",")','left')+call,
        declaration.replace('array.join(",")','array.join(";")')+call,
        declaration.replace('return a + b','return b + a')+call,
        declaration.replace('return a + b','return a + (b + "extra")')+call,
        declaration+'; let borrowed=__bwNativeArrayAddLeft'+call,
        declaration+'; function hidden(__bwNativeArrayAddLeft:any){return __bwNativeArrayAddLeft([5],"!")}'+call,
        declaration+'; __bwNativeArrayAddLeft=other'+call,
        declaration+'; let observed=__bwNativeArrayAddLeft([5],"!",1)',
        declaration.replace('left: any','left: any[]')+call,
        'function __bwNativeArrayAddLeft(left:any[],right:any):any{return left + right}'+call
    ];
    for(const text of invalid)assert.equal(candidates(text).size,0,text);
});
