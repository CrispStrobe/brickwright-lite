import test from 'node:test';
import {TYPED_HELPER_SOURCE} from './fixtures/arcade-typed-helper.mjs';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram, stepFrames} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {applyDeclaredValueType} from '../overlay/scratch-gui/src/lib/bw-makecode/declared-value-types.js';
import {ValueTypeGraph} from '../overlay/scratch-gui/src/lib/bw-makecode/value-type-graph.js';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';

const values = run => Object.fromEntries(run.vm.runtime.targets.flatMap(t => Object.values(t.variables))
    .map(v => [v.name.replace(/^Game_/, ''), v.value]));

// The helper is intentionally uncalled. Its declared Image[] must still allow
// the creation site to compile, rather than abandoning native array lowering.
const source = TYPED_HELPER_SOURCE;

test('uncalled typed resource helpers preserve executable array operations through original PXT and roundtrips', async()=>{
    const expected=await runPxtArcade(source);
    const check=run=>{
        for(const name of ['observed','removed','remaining'])assert.equal(values(run)[name],expected[name],name);
        assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
    };
    const execute=async imported=>{
        assert.deepEqual(imported.unsupported,[]);
        const run=await runProgram(imported.code,{frames:100,uploads:imported.costumes,storage:true});check(run);return run;
    };
    const imported=arcadeToPseudocode(source),run=await execute(imported);
    assert.match(imported.code,/new array reference/);
    await execute({...imported,code:run.creator.decompile()});
    const exported=projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});
    assert.deepEqual(exported.unsupported,[]);
    const actual=await runPxtArcade(exported.ts);
    for(const name of ['observed','removed','remaining'])assert.equal(actual[name],expected[name],name);
    await execute(arcadeToPseudocode(exported.ts));
    await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));
    run.vm.greenFlag();await stepFrames(run.vm,100);check(run);
});

test('typed function and arrow callback parameters keep their resource annotations',()=>{
    const ast=parseMakeCodeTs('game.onUpdate(function(pictures:Image[]){pictures[0].fill(2)});game.onUpdate((actors:Array<Sprite>)=>{actors[0].x=30});');
    const [fn,arrow]=ast.body.map(st=>st.expr.args[0]);
    assert.equal(fn.paramTypes.pictures.text.replace(/\s/g,''),'Image[]');
    assert.equal(arrow.paramTypes.actors.text.replace(/\s/g,''),'Array<Sprite>');
});


test('declared nested arrays seed element types without treating callbacks or unions as arrays',()=>{
    const graph=new ValueTypeGraph(),matrix=Symbol('matrix'),callback=Symbol('callback'),union=Symbol('union');
    applyDeclaredValueType(graph,matrix,'Array<Image[]>');
    assert.ok(graph.has(matrix,'array'));
    assert.ok(graph.has(graph.element(matrix),'array'));
    assert.ok(graph.has(graph.element(graph.element(matrix)),'Image'));
    applyDeclaredValueType(graph,callback,'() => Image[]');
    applyDeclaredValueType(graph,union,'Sprite | Image[]');
    assert.ok(!graph.has(callback,'array'));
    assert.ok(!graph.has(union,'array'));
});
