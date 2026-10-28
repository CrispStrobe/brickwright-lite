import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,clearStrayTimers} from './helpers/bw-vm.mjs';
import {runTimedArcadeProgram,restartTimedArcadeRun} from './helpers/arcade-timed-native.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {TERRAIN_EVENTS_SOURCE} from './fixtures/arcade-terrain-events.mjs';
const names=['wallOrder','wallCount','wallColumn','wallRow','entryX','sawContact','afterPause','secondSawVelocity','returnedAfterHandlers','finalWallVelocity','tileOrder','tileColumn','tileRow','sameLocation','tileReturnedAfterHandlers','eventsDone'];
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));

test('terrain callbacks preserve synchronous mutation, yielded order, captured cells and typed locations through all paths',async()=>{
    const expected=await runPxtArcade(TERRAIN_EVENTS_SOURCE,{waitForGlobals:{eventsDone:true}});
    assert.equal(expected.wallOrder,'AB');assert.equal(expected.wallCount,12);assert.equal(expected.entryX,31);assert.equal(expected.sawContact,true);assert.equal(expected.afterPause,true);assert.equal(expected.secondSawVelocity,true);assert.equal(expected.tileOrder,'CD');assert.equal(expected.sameLocation,true);
    const check=run=>{const actual=values(run);for(const name of names)assert.equal(actual[name],expected[name],name);assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);};
    const execute=async imported=>{
        assert.deepEqual([...imported.unsupported].sort(),[]);
        const run=await runTimedArcadeProgram(imported.code,{milliseconds:100,uploads:imported.costumes,storage:true});check(run);return run;
    };
    const imported=arcadeToPseudocode(TERRAIN_EVENTS_SOURCE),run=await execute(imported);
    await execute({...imported,code:run.creator.decompile()});
    const exported=projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});assert.deepEqual(exported.unsupported,[]);
    assert.match(exported.ts,/scene\.onHitWall\(/);assert.match(exported.ts,/scene\.onOverlapTile\(/);assert.match(exported.ts,/: tiles\.Location/);
    const again=await runPxtArcade(exported.ts,{waitForGlobals:{eventsDone:true}});for(const name of names)assert.equal(again[name],expected[name],name+' in executed export');
    await execute(arcadeToPseudocode(exported.files));
    await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));await restartTimedArcadeRun(run,100);check(run);
});

test('nested terrain registrations preserve inherited Location arrays independently of unrelated same-name numeric locals',async()=>{
    const {TERRAIN_MAP}=await import('./fixtures/arcade-terrain.mjs');
    const source=`${TERRAIN_MAP}
let art=image.create(2,2)
art.fill(5)
let hero=sprites.create(art,SpriteKind.Player)
hero.setPosition(30,12)
hero.setFlag(SpriteFlag.GhostThroughTiles,true)
let inheritedColumn=-1
let touchedRow=-1
function forward(items:tiles.Location[]){return items}
function install(){
    let sites=[tiles.getTileLocation(1,1)]
    scene.onHitWall(SpriteKind.Player,function(sprite,location){
        sprite.vx=0
        scene.onOverlapTile(SpriteKind.Player,image.create(1,1),function(other,touch){
            let chosen=forward(sites)
            tiles.setWallAt(chosen[0],true)
            inheritedColumn=location.column
            touchedRow=touch.row
            other.setFlag(SpriteFlag.GhostThroughTiles,true)
        })
    })
}
function unrelated(){
    let sites=[4,5]
    scene.onHitWall(SpriteKind.Food,function(sprite,location){sites.push(6)})
}
install()
unrelated()
hero.x=32
hero.setFlag(SpriteFlag.GhostThroughTiles,false)
hero.x-=1
let nestedDone=tiles.tileAtLocationIsWall(tiles.getTileLocation(1,1))`;
    const expected=await runPxtArcade(source,{waitForGlobals:{nestedDone:true}});
    const imported=arcadeToPseudocode(source);
    assert.deepEqual(imported.unsupported,[]);
    const run=await runProgram(imported.code,{frames:100,uploads:imported.costumes,storage:true});
    for(const name of ['inheritedColumn','touchedRow','nestedDone'])assert.equal(values(run)[name],expected[name],name);
    assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
    const exported=projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});
    assert.deepEqual(exported.unsupported,[]);
    assert.match(exported.ts,/items: tiles\.Location\[\]/);
    const again=await runPxtArcade(exported.ts,{waitForGlobals:{nestedDone:true}});
    for(const name of ['inheritedColumn','touchedRow','nestedDone'])assert.equal(again[name],expected[name],name+' in executed export');
});

// Replay timers and physics on the same external clock. A manual physical
// frame count cannot establish that the authored pause(20) has completed.
test('native terrain callbacks resume at the actual pause deadline across editable routes',async()=>{
    const expected={wallOrder:'AB',wallCount:12,wallColumn:4,wallRow:1,entryX:31,sawContact:true,afterPause:true,secondSawVelocity:true,returnedAfterHandlers:true,finalWallVelocity:0,tileOrder:'CD',tileColumn:2,tileRow:1,sameLocation:true,tileReturnedAfterHandlers:true,eventsDone:true};
    const runs=[],check=run=>{
        const actual=values(run);for(const name of names)assert.equal(actual[name],expected[name],name);
        assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
    };
    const execute=async imported=>{
        assert.deepEqual(imported.unsupported,[]);
        const run=await runTimedArcadeProgram(imported.code,{milliseconds:100,uploads:imported.costumes,storage:true});runs.push(run);check(run);return run;
    };
    try{
        const imported=arcadeToPseudocode(TERRAIN_EVENTS_SOURCE);
        const run=await runTimedArcadeProgram(imported.code,{milliseconds:0,uploads:imported.costumes,storage:true});runs.push(run);
        await run.clock.advanceTo(19);assert.equal(values(run).wallOrder,'A');assert.equal(values(run).wallCount,12);assert.notEqual(values(run).afterPause,true);assert.notEqual(values(run).eventsDone,true);
        await run.clock.advanceTo(20);check(run);
        await execute({...imported,code:run.creator.decompile()});
        const exported=projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});assert.deepEqual(exported.unsupported,[]);
        await execute(arcadeToPseudocode(exported.files));
        const saved=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());
        await run.vm.loadProject(saved);await restartTimedArcadeRun(run,100);check(run);
        const fresh=await execute(imported);await fresh.vm.loadProject(saved);await restartTimedArcadeRun(fresh,100);check(fresh);
    }finally{for(const run of runs){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});
