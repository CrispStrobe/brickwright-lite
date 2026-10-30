import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const BWValues=require('../overlay/scratch-vm/src/util/bw-values.js');
const source=readFileSync(new URL('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/index.js',import.meta.url),'utf8');
const score=source.match(/    registerScoreHandler\(args,util\) \{([\s\S]*?)\n    \}\n    whenRegisteredScore/);
const math=source.match(/    _mathArgument\(args,key,util,errorMessage='Arcade math needs a primitive value'\) \{([\s\S]*?)\n    \}\n    randomNumber/);
assert.ok(score&&math,'actual complete ingress methods must be present');
const registrations=new WeakMap();
const methods=Function('Scratch','scoreThresholdRegistrations',
    `return {registerScoreHandler(args,util){${score[1]}},_mathArgument(args,key,util,errorMessage='Arcade math needs a primitive value'){${math[1]}}}`
)({BWValues},registrations);
function probe(value,util){
    const players=[],thresholds=[];
    // Observe the actual source method's downstream registration argument.
    // The HUD boundary is a stub; its SDK algorithm and capture ownership
    // are not executed or qualified by these finite ingress controls.
    const receiver={...methods,_lifeState(player){players.push(player);return {};},
        _handlerRegistration(){return {};},_state(){return {hudInfo:{}};},
        _hud(){return {info:{_setInfoState(){}},players:Array.from({length:4},()=>({
            onScore(score){thresholds.push(score);}
        }))};}};
    registrations.set(receiver,new Map());
    return {run:(player=1)=>receiver.registerScoreHandler({PLAYER:player,SCORE:value},util),players,thresholds};
}
function input(opcode='math_number',connected=false){
    const blocks={registration:{inputs:{SCORE:{block:connected?'connected':'shadow',shadow:'shadow'}}},
        shadow:{opcode,shadow:true},connected:{opcode:'data_variable',shadow:false}};
    return {target:{blocks:{getBlock:id=>blocks[id]}},thread:{peekStack:()=> 'registration'}};
}

test('actual score ingress admits numeric editor shadows without rounding their thresholds',()=>{
    for(const opcode of ['math_number','math_integer','math_whole_number','math_positive_number','math_angle']){
        for(const text of ['2.5','-2','0','-0','Infinity']){
            const p=probe(text,input(opcode));assert.doesNotThrow(()=>p.run());assert.deepEqual(p.players,[1]);
            assert.equal(p.thresholds.length,1);assert.ok(Object.is(p.thresholds[0],Number(text)));
        }
    }
});
test('actual score ingress preserves direct and connected Number values',()=>{
    for(const value of [2.5,-2,0,-0,Infinity,NaN]){
        for(const util of [undefined,input('math_number',true)]){
            const p=probe(BWValues.encode(value),util);assert.doesNotThrow(()=>p.run());assert.deepEqual(p.players,[1]);
            assert.equal(p.thresholds.length,1);assert.ok(Object.is(p.thresholds[0],value));
        }
    }
});
test('connected String, text shadows, absent provenance and nonnumeric primitives stay refused',()=>{
    for(const [value,util]of [['2',undefined],['2',input('math_number',true)],['2',input('text')],
        [true,input()], [null,input()], [BWValues.encode(undefined),input()]]){
        const p=probe(value,util);assert.throws(()=>p.run(),/score threshold requires a Number/);assert.deepEqual(p.players,[]);
    }
});
test('opaque coercion and invalid players never enter score state',()=>{
    let conversions=0;const value={valueOf(){conversions++;return 2;},toString(){conversions++;return '2';}};
    const opaque=probe(value,input());assert.throws(()=>opaque.run(),/score threshold requires a Number/);
    assert.deepEqual(opaque.players,[]);assert.equal(conversions,0);
    for(const player of [0,5,1.5,'unknown']){
        const p=probe('2',input());assert.throws(()=>p.run(player),/fixed player from 1 to 4/);assert.deepEqual(p.players,[]);
    }
});
