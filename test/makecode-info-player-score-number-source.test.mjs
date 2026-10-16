import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {ordinaryPrimitiveSdkNumberCalls,ordinaryPlayerScoreNumberCalls} from '../overlay/scratch-gui/src/lib/bw-makecode/ordinary-primitive-sdk-number-source.js';
import {analyseSourceValueProducers} from '../overlay/scratch-gui/src/lib/bw-makecode/source-value-producers.js';
import {validateProcedureConstraintSource} from '../overlay/scratch-gui/src/lib/bw-makecode/procedure-constraint-source.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';

const parse=source=>parseMakeCodeTs(source,{parameterDefaults:true,retainParentheses:true,retainCallableMetadata:true});
const wrap=(argument='info.player2.score()',before='',after='')=>
    `let seen=0;function receive(value:number){seen=value;} ${before} receive(${argument}); ${after}`;
const actualArgument=ast=>ast.body.find(node=>node.type==='ExpressionStatement'&&node.expr?.type==='Call'&&node.expr.callee?.name==='receive').expr.args[0];
const types=source=>{const ast=parse(source);return [...analyseSourceValueProducers(ast,{ordinaryPrimitiveSdkNumbers:true,unboundIsOpaque:true,opaqueDeclarationValues:true}).typesAt(actualArgument(ast))];};
const constraints=source=>validateProcedureConstraintSource(parse(source),{ordinaryPrimitiveSdkNumbers:true});

test('all four exact player score calls supply their actual ordinary Number arguments',()=>{
    for(let player=1;player<=4;player++){
        const source=wrap(`info.player${player}.score()`,`info.player${player}.setScore(${player*11});info.player${player}.changeScoreBy(2);`);
        assert.deepEqual(types(source),['Number']);
        assert.deepEqual(constraints(source),[]);
        const imported=arcadeToPseudocode(source);
        assert.deepEqual(imported.unsupported,[]);assert.deepEqual(imported.warnings,[]);
        assert.ok(imported.code.includes(`arcade player (${player}) score`));
        assert.ok(imported.code.includes('receive'));
    }
});

test('fixed player writers coexist with an unchanged independent default score reader',()=>{
    const source=wrap('info.score()','info.setScore(11);info.player2.setScore(22);info.player4.changeScoreBy(3);');
    assert.deepEqual(types(source),['Number']);assert.deepEqual(constraints(source),[]);
    const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
    assert.match(imported.code,/arcade player \(1\) score/);
});

test('the original seven-call source API stays independently bounded',()=>{
    const ast=parse(wrap('info.score()','info.player2.setScore(22);')),call=actualArgument(ast);
    assert.equal(ordinaryPrimitiveSdkNumberCalls(ast).has(call),false);
    assert.equal(ordinaryPlayerScoreNumberCalls(ast).has(call),true);
    assert.equal(analyseSourceValueProducers(ast).typesAt(call).has('Number'),false);
});

for(const neighbor of [
    'info=other;', 'info.player2=other;', 'info.player2.score=()=>1;',
    'function unused(){info.player4.score=()=>1;}', 'function unused(){info.player2=other;}',
    'let root=info;', 'let player=info.player2;', 'let method=info.player2.score;',
    'consume(info.player2);', 'consume(info);', 'info["player2"].score();',
    'info.player2["score"]();', 'info.player5.score();', 'info.player2.unknown();',
    'info.player2.setScore();', 'info.player2.changeScoreBy(1,2);',
    'globalThis.info.player2.score=()=>1;', 'let root=this;root.info.player2.score=()=>1;',
    'let key="con"+"structor";let fn=(()=>1)[key]("return info");'
])test('complete player census retains refusal for '+neighbor,()=>{
    const source=wrap('info.player2.score()','',neighbor);
    assert.equal(types(source).includes('Number'),false);
    assert.ok(constraints(source).some(message=>message.includes('receive.value requires Number')));
});

for(const argument of ['info.player2.score(1)','new info.player2.score()','info.player2.score<number>()'])
    test('a different call shape cannot borrow zero-argument score authority: '+argument,()=>{
        assert.equal(types(wrap(argument)).includes('Number'),false);
        assert.ok(constraints(wrap(argument)).length);
    });

test('shadowed user players do not receive builtin Number authority',()=>{
    for(const prefix of ['let info:any={player2:{score:()=>"text"}};',
        'function info(){}','class info{}','enum info{player2=2}']){
        const source=wrap('info.player2.score()',prefix);
        assert.equal(types(source).includes('Number'),false);
        assert.ok(constraints(source).length);
    }
    const local=parse('function local(info:any){return info.player2.score()}let n=info.player2.score();');
    const proof=ordinaryPlayerScoreNumberCalls(local);
    assert.equal(proof.has(local.body[0].body[0].value),false);
    assert.equal(proof.has(local.body[1].decls[0].init),true);
});

test('later scalar writers and mixed ordinary callers retain their independent constraints',()=>{
    assert.ok(constraints(wrap('value','let value:any=info.player2.score();','value="text";receive(value);')).length);
    assert.ok(constraints(wrap('info.player2.score()','','receive("2");')).length);
    assert.deepEqual(types(wrap('value','let value=info.player2.score();')),['Number']);
});

test('proved ordinary numeric Array indices coexist with fixed players without a dynamic host-object grant',()=>{
    const source=wrap('info.player2.score()','let values=[1,2];let selected=values[0];');
    assert.deepEqual(types(source),['Number']);assert.deepEqual(constraints(source),[]);
    const unsafe=wrap('info.player2.score()','let unknown:any;let selected=unknown[0];');
    assert.equal(types(unsafe).includes('Number'),false);
});
