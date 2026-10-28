import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {analyseCallableBindings} from '../overlay/scratch-gui/src/lib/bw-makecode/callable-bindings.js';

test('only an actual class constructor scope receives constructor ownership',()=>{
    const program=parseMakeCodeTs('class Holder {constructor(){}method():number{return 3}}function ordinary():number{return 2}let arrow=()=>1;let expression=function(){return 4};',{retainClassHeritage:true,retainCallableMetadata:true});
    const lexical=analyseCallableBindings(program),ctor=program.body[0].ctor,method=program.body[0].methods[0];
    for(const scope of lexical.functions) {
        assert.equal(scope.constructor,scope.node===ctor);
        if(scope.node===method){assert.equal(scope.kind,'method');assert.equal(scope.className,'Holder');}
        if(scope.node===program.body[1])assert.equal(scope.kind,'function');
    }
    assert.equal(lexical.functions.length,5);
});

test('ordinary closure ownership retains its enclosing method receiver capture',()=>{
    const program=parseMakeCodeTs('class Holder {value:number;constructor(){this.value=2}method():()=>number{return()=>this.value}}',{retainClassHeritage:true,retainCallableMetadata:true});
    const lexical=analyseCallableBindings(program),arrow=lexical.functions.find(scope=>scope.node.type==='FunctionExpression');
    assert.equal(arrow.constructor,false);assert.equal(arrow.parent.constructor,false);
    assert.equal(arrow.captureSpecifications.length,1);
    assert.equal(arrow.captureSpecifications[0].binding.kind,'receiver');
    assert.equal(arrow.captureSpecifications[0].binding.scope,arrow.parent);
    assert.equal(arrow.captureSpecifications[0].mode,'value');
});
