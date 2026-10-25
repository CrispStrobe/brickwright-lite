import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {patchNestedExecuteContext} from '../scripts/lib/nested-execute-context-hooks.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {INTEGRATED, runProgram, stepFrames, clearStrayTimers} from './helpers/bw-vm.mjs';

test('nested execution integration is idempotent and rejects unknown exports', () => {
    const source = readFileSync(`${INTEGRATED}/node_modules/scratch-vm/src/engine/execute.js`, 'utf8');
    assert.equal(patchNestedExecuteContext(source), source);
    assert.throws(() => patchNestedExecuteContext('module.exports = other;'), /export anchor missing or ambiguous/);
});

test('nested Sprite-created callbacks restore the live caller for subsequent cached operations', async () => {
    const source = `let trace="";let seen=0;
function twice(value:number){return value+value}
sprites.onCreated(SpriteKind.Food,function(sprite){trace=trace+"F";seen=twice(3)});
sprites.onCreated(SpriteKind.Player,function(sprite){trace=trace+"P";let child=sprites.create(img\`2\`,SpriteKind.Food);trace=trace+"p"});
class Owned extends sprites.ExtendableSprite {constructor(public value:number,img:Image){super(img,SpriteKind.Player);this.value=this.value+1}}
function build(){let before=7;let object=new Owned(4,img\`1\`);let after=twice(5);return before+object.value+after}
let result=build();let inspected=console.inspect(twice(5));`;
    const imported = arcadeToPseudocode(source);
    assert.deepEqual(imported.unsupported, []);
    assert.deepEqual(imported.warnings, []);
    let run;
    try {
        run = await runProgram(imported.code, {frames: 0, storage: true, uploads: imported.costumes});
        const check = async () => {
            await stepFrames(run.vm, 80, 0);
            const values = Object.fromEntries(run.vm.runtime.targets.flatMap(target =>
                Object.values(target.variables)).map(variable => [variable.name, variable.value]));
            assert.deepEqual(run.errors, []);
            assert.equal(values.result, 22);
            assert.equal(values.inspected, '10');
            assert.equal(values.trace, 'PFp');
            assert.equal(values.seen, 6);
        };
        await check();
        run.vm.stopAll();
        await run.vm.extensionManager.refreshBlocks({throwOnError: true});
        run.vm.greenFlag();
        await check();
        const saved = Buffer.from(await (await run.vm.saveProjectSb3()).arrayBuffer());
        run.vm.stopAll();
        await run.vm.loadProject(saved);
        run.vm.runtime.bwArcadeFrameAuthority = 'manual';
        run.vm.greenFlag();
        await check();
    } finally {
        if (run) { run.vm.stopAll(); run.vm.quit(); }
        clearStrayTimers();
    }
});
