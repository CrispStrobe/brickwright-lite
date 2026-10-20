import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';

test('Array aliases retain native value ownership when unrelated sprite artwork is missing',()=>{
    const source='let list:number[]=[];list=[1,2];let alias=list;alias.push(3);let same=list===alias;let actor=sprites.create(assets.image`missing`,SpriteKind.Player)';
    const converted=arcadeToPseudocode(source);
    assert.ok(converted.unsupported.some(message=>/sprite artwork is unavailable/.test(message)));
    assert.ok(!converted.unsupported.some(message=>/array assigned to another/.test(message)),converted.unsupported.join('\n'));
    assert.match(converted.code,/new array reference from/);
    assert.doesNotMatch(converted.code,/new array "/);
    assert.match(converted.code,/GLOBAL list/);
    assert.match(converted.code,/GLOBAL alias/);
    assert.match(converted.code,/compare value \(list\) op "===" with \(alias\)/);
});

test('an unproved Any receiver stays diagnosed in an Array-bearing fallback program',()=>{
    const source='function bad(value:any){value.push(3)}let array=[1];bad(0);let actor=sprites.create(assets.image`missing`,SpriteKind.Player)';
    const converted=arcadeToPseudocode(source);
    assert.ok(converted.unsupported.includes('value.push()'));
    assert.ok(converted.unsupported.some(message=>/sprite artwork is unavailable/.test(message)));
});

test('Number, String and nested Array values retain ownership and forward defaults on the fallback graph',async()=>{
    const fs=await import('node:fs');
    const {runProgram,clearStrayTimers}=await import('./helpers/bw-vm.mjs');
    const {importGuiDependency}=await import('./helpers/bw-integrated.mjs');
    const BW=(await importGuiDependency('scratch-vm/src/util/bw-values.js')).default;
    const source=fs.readFileSync(new URL('./fixtures/arcade-reference-array-aliases.ts',import.meta.url),'utf8');
    const fallback=arcadeToPseudocode(source+'\nlet actor=sprites.create(assets.image`missing`,SpriteKind.Player)');
    assert.ok(fallback.unsupported.some(message=>/sprite artwork is unavailable/.test(message)));
    assert.ok(!fallback.unsupported.some(message=>/array assigned to another/.test(message)));
    assert.doesNotMatch(fallback.code,/^GLOBAL local$/m);
    assert.equal(new Set([...fallback.code.matchAll(/^GLOBAL (.+)$/gm)].map(m=>m[1])).size,[...fallback.code.matchAll(/^GLOBAL (.+)$/gm)].length);
    const run=await runProgram(fallback.code,{frames:40,storage:true});
    try{
        assert.deepEqual(run.errors,[]);
        const state=new Map(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name,BW.decode(v.value)]));
        for(const name of ['beforeTextMissing','beforeArrayMissing','same','different','sameLabels','sameNested'])assert.equal(state.get(name),true,name);
        assert.equal(state.get('beforeText'),undefined);assert.equal(state.get('beforeArray'),undefined);
        assert.equal(state.get('witness'),'7:3:after:2:9:4:6');assert.equal(state.get('callbackCount'),1);
        assert.equal(BW.equal(state.get('alias'),state.get('laterArray')),true);
        assert.equal(BW.equal(state.get('returned'),state.get('laterArray')),true);
        assert.equal(BW.equal(state.get('distinct'),state.get('laterArray')),false);
    }finally{run.vm.stopAll();run.vm.quit();clearStrayTimers();}
});


test('opaque alternatives and reference bitwise operands stay refused in the artwork fallback',()=>{
    const mixed=arcadeToPseudocode('function choose(flag:boolean):any{if(flag)return[1];return sprites.create(assets.image`missing`,SpriteKind.Player)}let values=choose(true);values.push(2)');
    assert.ok(mixed.unsupported.includes('values.push()'));
    const bitwise=arcadeToPseudocode('let values=[1];let result=values&1;let actor=sprites.create(assets.image`missing`,SpriteKind.Player)');
    assert.ok(bitwise.unsupported.some(message=>/Bitwise operation requires proven primitive operands/.test(message)));
    assert.ok(bitwise.unsupported.some(message=>/sprite artwork is unavailable/.test(message)));
});
