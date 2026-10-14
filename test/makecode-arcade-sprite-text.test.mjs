import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {compile} from '../scripts/lib/pxt-node.mjs';
const vars=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));

test('explicit sprite text agrees with the full original Arcade simulator across aliases, procedures and destruction',async()=>{
    const source=`let hero=sprites.create(img\`1\`,SpriteKind.Player)
hero.setPosition(12,23)
hero.setVelocity(0,0)
let initial=hero.toString()
let alias=hero
function label(sprite:Sprite){return sprite.toString()}
let forwarded=label(alias)
hero.destroy()
hero.setPosition(32,43)
hero.setVelocity(-6,7)
let updated=alias.toString()
let other=sprites.create(img\`2\`,SpriteKind.Enemy)
other.setPosition(52,63)
let separate=other.toString()
let retained=label(hero)
let retainedX=hero.x
let retainedVx=hero.vx`;
    const expected=await runPxtArcade(source);
    const names=['initial','forwarded','updated','separate','retained','retainedX','retainedVx'];
    assert.equal(expected.initial,'0(12,23)->(0,0)');assert.equal(expected.updated,'0(32,43)->(-6,7)');
    const check=run=>{
        const actual=vars(run);for(const name of names)assert.equal(actual[name],expected[name],name);
        assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
    };
    const execute=async imported=>{
        assert.deepEqual(imported.unsupported,[]);
        const run=await runProgram(imported.code,{frames:80,uploads:imported.costumes,storage:true});check(run);return run;
    };
    const imported=arcadeToPseudocode(source),run=await execute(imported);
    await execute({...imported,code:run.creator.decompile()});
    const exported=projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});assert.deepEqual(exported.unsupported,[]);
    const built=await compile('arcade',exported.files);assert.equal(built.success,true,JSON.stringify({diagnostics:built.diagnostics,ts:exported.ts}));
    await execute(arcadeToPseudocode(exported.ts));
    const originalExported=await runPxtArcade(exported.ts);
    for(const name of names)assert.equal(originalExported[name],expected[name],name+' in executed PXT export');
    await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,80);check(run);
});

test('sprite text requires an actual sprite receiver and zero arguments',()=>{
    const invalid=arcadeToPseudocode('let hero=sprites.create(img`1`,SpriteKind.Player)\nlet bad=hero.toString(1)');
    assert.ok(invalid.unsupported.includes('Sprite.toString() requires zero arguments'));
    const number=arcadeToPseudocode('let hero=2\nlet bad=hero.toString()');
    assert.ok(number.unsupported.length>0);
});


test('the original simulator distinguishes sprite arithmetic from compiler string conversion',async()=>{
    const source=`let hero=sprites.create(img\`1\`,SpriteKind.Player)
hero.destroy()
hero.setPosition(12,23)
hero.setVelocity(4,5)
let first:any=hero
let dynamicText:any=""
let joined=first+2
let converted=first+""
let genericText=first+dynamicText
let numeric=+first
let identity=first===hero
let collision=first==="arcade:1"`;
    const expected=await runPxtArcade(source);
    assert.equal(expected.joined,'[object Object]2');
    assert.equal(expected.converted,'0(12,23)->(4,5)');
    assert.equal(expected.genericText,'[object Object]');
    assert.ok(Number.isNaN(expected.numeric));
    assert.equal(expected.identity,true);assert.equal(expected.collision,false);
    const imported=arcadeToPseudocode(source);
    assert.ok(imported.unsupported.includes('sprite arithmetic conversion requires ToPrimitive support'));
});


test('exported native value aliases retain booleans in assignments and procedure returns',async()=>{
    const source=`let hero=sprites.create(img\`1\`,SpriteKind.Player)
hero.setPosition(0,0)
let label=hero.toString()
let first=true
let second=first
function echo(value:boolean){return value}
let copied=echo(second)
let strict=copied===true`;
    const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
    const run=await runProgram(imported.code,{frames:40,uploads:imported.costumes,storage:true});
    assert.deepEqual(run.errors,[]);
    const exported=projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});assert.deepEqual(exported.unsupported,[]);
    const expected=await runPxtArcade(source),actual=await runPxtArcade(exported.ts);
    for(const name of ['first','second','copied','strict'])assert.equal(actual[name],expected[name],name);
    const again=arcadeToPseudocode(exported.ts);assert.deepEqual(again.unsupported,[]);
    const returned=await runProgram(again.code,{frames:40,uploads:again.costumes,storage:true});
    assert.deepEqual(returned.errors,[]);
    for(const name of ['first','second','copied','strict'])assert.equal(vars(returned)[name],expected[name],name);
});
