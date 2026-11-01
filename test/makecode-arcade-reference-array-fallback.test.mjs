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
        // The trailing creation from the absent artwork faults as in PXT, after everything the program does before it.
        assert.deepEqual([...new Set(run.errors)],['TypeError: Expected type Image but received type undefined. Did you forget to assign a variable?']);
        const state=new Map(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name,BW.decode(v.value)]));
        for(const name of ['beforeTextMissing','beforeArrayMissing','same','different','sameLabels','sameNested'])assert.equal(state.get(name),true,name);
        assert.equal(state.get('beforeText'),undefined);assert.equal(state.get('beforeArray'),undefined);
        assert.equal(state.get('witness'),'7:3:after:2:9:4:6');assert.equal(state.get('callbackCount'),1);
        assert.equal(BW.equal(state.get('alias'),state.get('laterArray')),true);
        assert.equal(BW.equal(state.get('returned'),state.get('laterArray')),true);
        assert.equal(BW.equal(state.get('distinct'),state.get('laterArray')),false);
    }finally{run.vm.stopAll();run.vm.quit();clearStrayTimers();}
});


test('opaque alternatives and reference bitwise operands stay refused in the artwork fallback',async()=>{
    const mixed=arcadeToPseudocode('function choose(flag:boolean):any{if(flag)return[1];return sprites.create(assets.image`missing`,SpriteKind.Player)}let values=choose(true);values.push(2)');
    // The absent artwork is a preserved reference now, so this program imports on the native route (as it does with
    // real artwork) and the opaque receiver is refused where that route refuses it: at export.
    if (!mixed.unsupported.includes('values.push()')) {
        const {default: SB3Creator} = await import('../overlay/scratch-gui/src/lib/sb3-creator.js');
        const {projectToArcade} = await import('../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js');
        const creator = new SB3Creator();
        creator.parse(mixed.code);
        for (const costume of mixed.costumes || []) {
            if (costume.mode === 'add') creator.addCustomSVGCostume(costume.sprite, costume.svg, costume.name);
            else creator.applyCustomSVG(costume.sprite, costume.svg);
        }
        const exported = projectToArcade(creator.project, {costumeSvg: (target, costume) => creator.assets.get(costume.assetId)?.data});
        assert.ok(exported.unsupported.some(message => /Array reference arrays_mutateReference/.test(message)), exported.unsupported.join('\n'));
    }
    // An actual Array operand of source bitwise is admitted (#1128); its
    // result is checked against original PXT in makecode-arcade-typed-bitwise.
    const bitwise=arcadeToPseudocode('let values=[1];let result=values&1;let actor=sprites.create(assets.image`missing`,SpriteKind.Player)');
    assert.ok(!bitwise.unsupported.some(message=>/Bitwise operation requires proven primitive operands/.test(message)),bitwise.unsupported.join('\n'));
    assert.match(bitwise.code,/arcade source value \(values\) op "&"/);
    assert.ok(bitwise.unsupported.some(message=>/sprite artwork is unavailable/.test(message)));
    // The legacy integer words of this mode diagnose an opaque operand exactly
    // like the native route; a proved primitive operand still converts.
    for(const source of ['let a=image.create(1,1);let result=(a as any)|1','let a=image.create(1,1);let result=~(a as any)']){
        const opaque=arcadeToPseudocode(source+';let actor=sprites.create(assets.image`missing`,SpriteKind.Player)');
        assert.ok(opaque.unsupported.some(message=>/Bitwise operation requires proven primitive operands/.test(message)),source);
    }
    const primitive=arcadeToPseudocode('let b=3;let result=b|1;let actor=sprites.create(assets.image`missing`,SpriteKind.Player)');
    assert.ok(!primitive.unsupported.some(message=>/Bitwise operation/.test(message)),primitive.unsupported.join('\n'));
});
