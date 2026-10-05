import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import BWValues from '../overlay/scratch-vm/src/util/bw-values.js';
import {loadExtensionClass} from './helpers/bw-extensions.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
// Task E1 keeps the import half of these round trips; the export half (projectToArcade, then compiling or running the exported TypeScript in PXT, then re-importing it) returns with task E2 (docs/OPEN-TASKS-2026-09-29.md).
import {runProgram,stepFrames} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {TILE_DATA_SOURCE,TILE_CLEAR_SOURCE} from './fixtures/arcade-tile-data.mjs';

const names=['absentNull','arrayFresh','locationFresh','count','order','spotFresh','aliasSame','procedureSame','procedureCenter','col','row','centerX','centerY','initialWall','clearWall','setWall','redBefore','redAfter','blueAfter','countAfter','snapshotCount','cloneCount','livePlayers','actorX','actorY','offWall','offWallStill','countOff','retainedX','retainedY','retainedBlue','retainedWall','nowRedCount','snapshotCountAfter','snapshotX'];
const vars=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
// Tile data is implemented independently of terrain simulation. Keep that
// remaining terrain limitation visible, and reject every unrelated gap.
const checkDiagnostics=imported=>{
    assert.deepEqual([...new Set(imported.unsupported)], ['full terrain collision physics and scene lifecycle are not yet supported']);
};

test('tile collections, walls and placement match PXT across Code, SB3 and executed export roundtrips',async()=>{
    const expected=await runPxtArcade(TILE_DATA_SOURCE,{waitForGlobals:{tileDataDone:true}});
    assert.equal(expected.procedureSame,true);assert.equal(expected.procedureCenter,12);
    assert.equal(expected.count,3);assert.equal(expected.order,1120);
    assert.equal(expected.countAfter,4);assert.equal(expected.snapshotCount,3);
    assert.equal(expected.livePlayers,1);
    assert.equal(expected.actorX,12);assert.equal(expected.actorY,4);
    assert.equal(expected.retainedX,24);assert.equal(expected.retainedBlue,true);
    const check=run=>{
        const actual=vars(run);
        for(const name of names)assert.equal(actual[name],expected[name],name);
        assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
    };
    const execute=async imported=>{
        checkDiagnostics(imported);
        const run=await runProgram(imported.code,{frames:140,uploads:imported.costumes,storage:true});check(run);return run;
    };
    const imported=arcadeToPseudocode(TILE_DATA_SOURCE),run=await execute(imported);
    const opcodes=new Set(run.creator.project.targets.flatMap(t=>Object.values(t.blocks).map(b=>b.opcode)));
    for(const opcode of ['arcade_setTilemap','arcade_tilesOfType','arcade_tileLocation','arcade_tileLocationProperty','arcade_setTileAt','arcade_setWallAt','arcade_placeOnTile'])assert.ok(opcodes.has(opcode),opcode);
    await execute({...imported,code:run.creator.decompile()});
    const previous=vars(run).spot;
    await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,140);check(run);
    assert.notEqual(vars(run).spot,previous,'project reload invalidates prior tile references');
});

test('unsupported dynamic tilemaps and terrain events remain named',()=>{
    const imported=arcadeToPseudocode(`let map:any=null\ntiles.setTilemap(map)\nscene.onHitWall(SpriteKind.Player,function(sprite:Sprite,location:tiles.Location){sprite.destroy()})`);
    assert.ok(imported.unsupported.some(reason=>/tilemap/i.test(reason)));
    assert.ok(imported.unsupported.some(reason=>/onHitWall|wall|terrain/i.test(reason)));
});


test('tile locations reject foreign scopes, wrong resource kinds and ordinary ID text',()=>{
    const Arcade=loadExtensionClass('arcade'),runtime=new EventEmitter(),otherRuntime=new EventEmitter();
    const first=new Arcade(runtime),other=new Arcade(otherRuntime);
    const data=JSON.stringify({columns:2,rows:1,tileSize:8,indices:[0,0],walls:[0,0],images:[{width:1,height:1,pixels:[0]}]});
    first.setTilemap({DATA:data});other.setTilemap({DATA:data});
    const location=first.tileLocation({COLUMN:1,ROW:0}),foreign=other.tileLocation({COLUMN:1,ROW:0});
    assert.ok(BWValues.isReference(location));assert.equal(location.bwReference.kind,'tile');
    assert.equal(first.tileLocationProperty({LOCATION:JSON.parse(JSON.stringify(location)),PROPERTY:'x'}),12);
    first.setWallAt({LOCATION:location,WALL:true});assert.equal(first.tileIsWall({LOCATION:location}),true);
    for(const invalid of [location.bwReference.id,foreign,BWValues.reference(runtime,'image',location.bwReference.id)]){
        first.setWallAt({LOCATION:invalid,WALL:false});
        assert.equal(first.tileIsWall({LOCATION:invalid}),false);
        assert.equal(first.tileIsWall({LOCATION:location}),true,'invalid references cannot mutate the real location');
    }
    runtime.emit('PROJECT_START');first.setTilemap({DATA:data});
    first.setWallAt({LOCATION:location,WALL:true});assert.equal(first.tileIsWall({LOCATION:location}),false);
    assert.equal(first.tileIsWall({LOCATION:first.tileLocation({COLUMN:1,ROW:0})}),false);
});


test('clearing a tilemap retains location scale and preserves the independent background',async()=>{
    const expected=await runPxtArcade(TILE_CLEAR_SOURCE,{waitForGlobals:{tileClearDone:true}});
    const names=['initialCenter','beforeWall','afterCenter','afterRow','afterWall','freshNull','freshCenter','identity','placedX','placedY','pixelAfterClear','sameBackground'];
    assert.equal(expected.afterCenter,12);assert.equal(expected.afterWall,false);
    assert.equal(expected.freshNull,false);assert.equal(expected.freshCenter,12);
    assert.equal(expected.pixelAfterClear,7);assert.equal(expected.sameBackground,true);
    const check=run=>{
        const actual=vars(run);for(const name of names)assert.equal(actual[name],expected[name],name);
        assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
        assert.ok(run.vm.runtime.bwArcadeDeviceState);
        assert.equal(run.vm.runtime.bwArcadeDeviceState.tilemap,undefined,'cleared map data no longer appears in the console');
    };
    const imported=arcadeToPseudocode(TILE_CLEAR_SOURCE);checkDiagnostics(imported);
    const run=await runProgram(imported.code,{frames:90,uploads:imported.costumes,storage:true});check(run);
});

test('generated tile factories preserve JRES pixels, scale thirty-two and the exact wall mask',async()=>{
    const factory='tiles.createTilemap(hex`020001000000`,img`2 7`,[myTiles.red],TileScale.ThirtyTwo)';
    const main='tiles.setTilemap(tilemap`wide`)\nlet leftLocation=tiles.getTileLocation(0,0)\nlet rightLocation=tiles.getTileLocation(1,0)\nlet leftCenter=leftLocation.x\nlet rightCenter=rightLocation.x\nlet wallTwo=tiles.tileAtLocationIsWall(leftLocation)\nlet wallSeven=tiles.tileAtLocationIsWall(rightLocation)\nlet generatedCount=tiles.getTilesByType(img`2`).length\nlet tileGeneratedDone=tiles.getTileLocation(0,0).column===0';
    const files={'main.ts':main,'tilemap.g.ts':`helpers._registerFactory("tilemap",function(name:string){switch(name){case "wide":return ${factory};}return null;})`,
        'tilemap.g.jres':JSON.stringify({'*':{mimeType:'image/x-mkcd-f4',dataEncoding:'base64',namespace:'myTiles'},red:{data:Buffer.from([0x87,0x04,1,0,1,0,0,0,2]).toString('base64'),tilemapTile:true}})};
    const original=main.replace('tilemap`wide`',factory.replace('myTiles.red','img`2`'));
    const expected=await runPxtArcade(original,{waitForGlobals:{tileGeneratedDone:true}});
    assert.equal(expected.leftCenter,16);assert.equal(expected.rightCenter,48);
    assert.equal(expected.wallTwo,true);assert.equal(expected.wallSeven,false);assert.equal(expected.generatedCount,2);
    const names=['leftCenter','rightCenter','wallTwo','wallSeven','generatedCount'];
    const check=run=>{
        const actual=vars(run);for(const name of names)assert.equal(actual[name],expected[name],name);
        assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
        const map=run.vm.runtime.bwArcadeDeviceState.tilemap;
        assert.equal(map.tileSize,32);assert.deepEqual([...map.walls],[1,0]);assert.deepEqual([...map.images[0].pixels],[2]);
    };
    const imported=arcadeToPseudocode(files);checkDiagnostics(imported);
    const run=await runProgram(imported.code,{frames:60,uploads:imported.costumes,storage:true});check(run);
    check(await runProgram(run.creator.decompile(),{frames:60,uploads:imported.costumes,storage:true}));
    await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,60);check(run);
});
