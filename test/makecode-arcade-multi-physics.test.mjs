import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {multiPhysicsControllerSource,MULTI_MOVER_SOURCE,TRANSPARENT_PIXEL_SOURCE,WALL_PEER_MUTATION_SOURCE,RETAINED_SPRITE_QUERY_SOURCE} from './fixtures/arcade-multi-physics.mjs';

const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(target=>Object.values(target.variables)).map(variable=>[variable.name.replace(/^Game_/,''),variable.value]));

async function verify(source,names,done,{remaining=[]}={}) {
    const expected=await runPxtArcade(source,{waitForGlobals:{[done]:true}});
    const check=run=>{
        const actual=values(run);
        for(const name of names)assert.equal(actual[name],expected[name],name);
        assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
    };
    const execute=async imported=>{
        assert.deepEqual(imported.unsupported,remaining);
        const run=await runProgram(imported.code,{frames:250,uploads:imported.costumes,storage:true});
        check(run);return run;
    };
    const imported=arcadeToPseudocode(source),run=await execute(imported);
    await execute({...imported,code:run.creator.decompile()});
    const exported=projectToArcade(run.creator.project,{costumeSvg:(target,costume)=>run.creator.assets.get(costume.assetId)?.data});
    assert.deepEqual(exported.unsupported,[]);
    const again=await runPxtArcade(exported.ts,{waitForGlobals:{[done]:true}});
    for(const name of names)assert.equal(again[name],expected[name],name+' in exported PXT');
    await execute(arcadeToPseudocode(exported.files));
    await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));
    run.vm.greenFlag();await stepFrames(run.vm,250);check(run);
    return expected;
}

test('simultaneous fast movers meet without tunneling through Code/SB3 and executed PXT export',async()=>{
    // Exact meeting coordinates depend on the original simulator frame length.
    // Identity, callback image state and stopping both sprites do not.
    const expected=await verify(MULTI_MOVER_SOURCE,['sameFirst','sameSecond','firstPixel','secondPixel','met','firstStopped','secondStopped','multiMoverDone'],'multiMoverDone');
    assert.equal(expected.met,true);assert.equal(expected.firstPixel,5);assert.equal(expected.secondPixel,5);
});

test('pixel masks reject disjoint pixels inside identical full hitboxes and detect a real shared pixel across all paths',async()=>{
    const expected=await verify(TRANSPARENT_PIXEL_SOURCE,['disjointPixels','noSpuriousEvent','sharedPixels','eventSeen','callbackIdentity','callbackMask','transparentDone'],'transparentDone');
    assert.equal(expected.disjointPixels,false);assert.equal(expected.noSpuriousEvent,true);assert.equal(expected.sharedPixels,true);
});

test('a wall callback stops another pre-snapshotted mover before its first round-robin substep across all paths',async()=>{
    const expected=await verify(WALL_PEER_MUTATION_SOURCE,['peerAtWall','wallColumn','stoppedPeer','firstX','peerX','firstVx','peerVx','wallPeerDone'],'wallPeerDone',{
        remaining:[]
    });
    assert.equal(expected.peerAtWall,10);assert.equal(expected.peerX,10);assert.equal(expected.firstX,31);assert.equal(expected.wallColumn,4);
});

test('retained Sprite/Image aliases support explicit overlap queries across suspended and popped scenes through all paths',async()=>{
    const expected=await verify(RETAINED_SPRITE_QUERY_SOURCE,['hiddenParentTouch','hiddenParentEmpty','hiddenParentRestored','poppedChildTouch','poppedChildEmpty','poppedChildRestored','activeFoodCount','retainedQueriesDone'],'retainedQueriesDone');
    assert.equal(expected.hiddenParentTouch,true);assert.equal(expected.hiddenParentEmpty,false);assert.equal(expected.hiddenParentRestored,true);
    assert.equal(expected.poppedChildTouch,true);assert.equal(expected.poppedChildEmpty,false);assert.equal(expected.poppedChildRestored,true);
    assert.equal(expected.activeFoodCount,0);
});


test('a fast crossing delivers one event, stops its mover and preserves callback geometry across all paths',async()=>{
    const source='game.onUpdate(function(){pause(20)})\n'+multiPhysicsControllerSource()+`
crossingArmed=true
mover.vx=500
pause(300)
let stopped=mover.vx===0
let geometryConsistent=endFrameTouching===mover.overlapsWith(target)
let crossingDone=passes===1`;
    const expected=await verify(source,['fastOverlapSeen','passes','stopped','geometryConsistent','crossingDone'],'crossingDone');
    assert.equal(expected.stopped,true);
    assert.equal(expected.geometryConsistent,true);
    assert.equal(expected.passes,1);
});
