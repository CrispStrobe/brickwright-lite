import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {STATIC} from '../scripts/lib/pxt-node.mjs';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
const source=`tiles.setTilemap(tiles.createTilemap(hex\`03000300010203040506070809\`,img\`0 0 0\n0 0 0\n0 0 0\`,[img\`0\`,img\`1\`,img\`2\`,img\`3\`,img\`4\`,img\`5\`,img\`6\`,img\`7\`,img\`8\`,img\`9\`],TileScale.Eight))
let actor=sprites.create(img\`1 1 1\n1 1 1\n1 1 1\`,SpriteKind.Player)
actor.setPosition(12,12)
let left=actor.tileKindAt(TileDirection.Left,img\`4\`)
let top=actor.tileKindAt(TileDirection.Top,img\`2\`)
let right=actor.tileKindAt(TileDirection.Right,img\`6\`)
let bottom=actor.tileKindAt(TileDirection.Bottom,img\`8\`)
let center=actor.tileKindAt(TileDirection.Center,img\`5\`)
let direction=TileDirection.Center
let alias=actor
let copied=image.create(1,1)
copied.fill(5)
function same(sprite:Sprite,direction:number,tile:Image){return sprite.tileKindAt(direction,tile)}
let copiedCenter=same(alias,direction,copied)
let unequal=actor.tileKindAt(direction,img\`1\`)
let defaultCenter=actor.tileKindAt(99,copied)
let imageSame=copied.equals(img\`5\`)
let imageDifferent=copied.equals(img\`5 5\`)
let done=1
done+=0`;
const keys=['left','top','right','bottom','center','copiedCenter','unequal','defaultCenter','imageSame','imageDifferent','done'];

test('tileKindAt source contract queries center coordinates and compares actual Image pixels',()=>{
    const sdk=JSON.parse(fs.readFileSync(`${STATIC}/arcade/target.json`,'utf8')).bundledpkgs.game;
    assert.match(sdk['sprite.ts'],/let x = this.x >> tilemap.scale;\s*let y = this.y >> tilemap.scale/);
    assert.match(sdk['sprite.ts'],/return tiles.getTileImage\(tilemap.getTile\(x, y\)\).equals\(tile\)/);
    assert.match(sdk['controllerbutton.ts'],/pauseUntilAnyButtonIsPressed\(\)\s*\{\s*control.waitForEvent\(KEY_DOWN, 0\)/);
    const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
    for(const direction of [0,1,2,3,4])assert.match(imported.code,new RegExp(`tile kind at \\(${direction}\\) equals image`));
    assert.match(imported.code,/arcade sprite \(sprite\) tile kind at \(arcade local direction\) equals image \(arcade local tile\)/);
});

test('tileKindAt imports match executed original Arcade through aliases, image copies, export and SB3',async()=>{
    const original=await runPxtArcade(source);
    for(const key of keys)assert.equal(original[key],['unequal','imageDifferent'].includes(key)?false:key==='done'?1:true,key+' original');
    const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
    try {
        const check=run=>{assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);for(const key of keys)assert.equal(values(run)[key],original[key],key);};
        const run=await runProgram(imported.code,{frames:70,storage:true,uploads:imported.costumes});check(run);
        check(await runProgram(run.creator.decompile(),{frames:70,storage:true,uploads:imported.costumes}));
        const exported=projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});assert.deepEqual(exported.unsupported,[]);
        const pxt=await runPxtArcade(exported.files);for(const key of keys)assert.equal(pxt[key]??pxt['Game_'+key],original[key],key+' exported');
        const again=arcadeToPseudocode(exported.ts);assert.deepEqual(again.unsupported,[]);check(await runProgram(again.code,{frames:70,storage:true,uploads:again.costumes}));
        await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,70);check(run);
    }finally{clearStrayTimers();}
});

test('tileKindAt invalid receiver, Image, arity and unknown enum remain named gaps',()=>{
    for(const source of ['let actor=5;let yes=actor.tileKindAt(4,img`1`)', 'let actor=sprites.create(img`1`,SpriteKind.Player);let yes=actor.tileKindAt(4,5)', 'let actor=sprites.create(img`1`,SpriteKind.Player);let yes=actor.tileKindAt()', 'let actor=sprites.create(img`1`,SpriteKind.Player);let yes=actor.tileKindAt(TileDirection.Unknown,img`1`)'])assert.ok(arcadeToPseudocode(source).unsupported.length,source);
});
