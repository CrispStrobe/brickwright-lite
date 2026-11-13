import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import vm from 'node:vm';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {lowerLazyValues} from '../overlay/scratch-gui/src/lib/bw-makecode/lower-lazy-values.js';
import SB3Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';

export const functions = 'let trace=0;function text():string {trace=trace*10+1;return "123";}function index():number {trace=trace*10+2;return 1;}';
export function imported(source) {
    const result=arcadeToPseudocode(source);
    assert.deepEqual(result.unsupported,[]);
    return result;
}
export function exported(source) {
    const creator=new SB3Creator();creator.parse(imported(source).code);
    assert.deepEqual(creator.warnings,[]);
    const result=projectToArcade(creator.project);
    assert.deepEqual(result.unsupported,[]);
    return result;
}

test('charAt consumes receiver before index without changing its domain or letter semantics',()=>{
    const code=imported(functions+'let n=text().length;let c=text().charAt(index());').code;
    const receiver=code.indexOf('to ((arcade call function "text"');
    const index=code.indexOf('to ((arcade call function "index"');
    const letter=code.indexOf('set c to (letter');
    assert.ok(receiver>=0 && receiver<index && index<letter,code);
    assert.match(code,/letter \(arcade local __bwValue\d+ \+ 1\) of \(arcade local __bwValue\d+\)/);
    for(const source of ['let value=123;let c=value.charAt(0);','let value=[1,2];let c=value.charAt(0);',
        'let c="abc".charAt(0,1);'])
        assert.ok(arcadeToPseudocode(source).unsupported.length,source);
    for(const expression of ['"abc".charAt()','"abc".charAt(-1)','"abc".charAt(99)'])
        assert.deepEqual(arcadeToPseudocode('let c='+expression+';').unsupported,[]);
});

test('charAt staging reaches stable local writes after export and preserves surrounding calls',()=>{
    let source=functions+'function before():number {trace=trace*10+3;return 0;}let c=(""+before())+text().charAt(index());';
    let writes;
    for(let generation=0;generation<3;generation++){
        const result=exported(source);
        const js=ts.transpileModule(result.ts+'\nobserved=[trace,c];',{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;
        const context={};vm.runInNewContext(js,context,{timeout:1000});
        assert.deepEqual(JSON.parse(JSON.stringify(context.observed)),[312,'02']);
        const count=(result.ts.match(/let __bwValue/g)||[]).length;
        if(writes!==undefined)assert.equal(count,writes,result.ts);
        writes=count;source=result.ts;
    }
});

test('charAt preserves numeric call order and refuses discarded switch-label staging',()=>{
    const result=imported('let c=(""+randint(100,999)).charAt(randint(0,2));');
    const first=result.code.indexOf('arcade math randomRange first ((0 + (100)))'),second=result.code.indexOf('arcade math randomRange first ((0 + (0)))');
    assert.ok(first>=0 && first<second,result.code);
    assert.match(result.code,/arcade set local __bwValue\d+ to \(arcade math randomRange first/);
    for(const label of ['text().charAt(index())','(""+randint(100,999)).charAt(randint(0,2))']) {
        const refused=arcadeToPseudocode(functions+'let hit=0;switch("2"){case '+label+':hit=1;break;}');
        assert.ok(refused.unsupported.some(message=>/charAt.*switch case label/.test(message)),JSON.stringify(refused));
    }
    imported('let hit=0;switch("2"){case "123".charAt(1):hit=1;break;}');
});


test('lowered charAt aborts at the original receiver or index exception',()=>{
    const lower=lowerLazyValues(parseMakeCodeTs('let c=text().charAt(index());'));
    // A small host reader for this specific lowered expression, independent
    // of the VM: execute the produced statements with real throwing callbacks.
    const emit=node=>{
        if(node.type==='Identifier')return node.name;
        if(node.type==='Member')return emit(node.object)+'.'+node.name;
        if(node.type==='Call')return emit(node.callee)+'('+node.args.map(emit).join(',')+')';
        if(node.type==='Declaration')return 'let '+node.decls.map(d=>d.name+'='+emit(d.init)).join(',')+';';
        throw new Error('Unexpected fixture node '+node.type);
    };
    const js=lower.body.map(emit).join('\n');
    for(const receiverFails of [true,false]) {
        const calls=[],error=new Error(receiverFails?'receiver':'index');
        const context={text:()=>{calls.push('receiver');if(receiverFails)throw error;return 'abc';},
            index:()=>{calls.push('index');throw error;}};
        assert.throws(()=>vm.runInNewContext(js,context),value=>value===error);
        assert.deepEqual(calls,receiverFails?['receiver']:['receiver','index']);
    }
});
