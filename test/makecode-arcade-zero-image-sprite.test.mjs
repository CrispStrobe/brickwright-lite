import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {loadExtensionClass} from './helpers/bw-extensions.mjs';
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
const source=`let seen=""
function geometry(s:Sprite):string{return ""+s.width+","+s.height+","+s.left+","+s.top+","+s.right+","+s.bottom+","+s.x+","+s.y}
sprites.onCreated(SpriteKind.Player,function(s:Sprite){seen=geometry(s)})
let blank=image.create(0,0)
let hero=sprites.create(blank,SpriteKind.Player)
let first=geometry(hero)
let callbackFirst=seen
let firstAlias=hero.image===blank
hero.setFlag(SpriteFlag.Ghost,true)
let picture=image.create(3,5)
picture.fill(6)
hero.setImage(picture)
let resized=geometry(hero)
let imageAlias=hero.image
imageAlias.setPixel(1,2,8)
let sharedPixel=picture.getPixel(1,2)
let sharedImage=hero.image===picture
hero.left=12.125
hero.top=-4.5
let moved=geometry(hero)
hero.setImage(blank)
let shrunk=geometry(hero)
let sharedBlank=hero.image===blank
let flat=sprites.create(image.create(0,3),SpriteKind.Enemy)
let tall=sprites.create(image.create(3,0),SpriteKind.Food)
let flatGeometry=geometry(flat)
let tallGeometry=geometry(tall)
let flatImageWidth=flat.image.width
let tallImageHeight=tall.image.height
let done=1
done+=0`;
const names=['first','callbackFirst','firstAlias','resized','sharedPixel','sharedImage','moved','shrunk','sharedBlank','flatGeometry','tallGeometry','flatImageWidth','tallImageHeight','done'];

test('genuine zero image constructors and later resizing match original geometry through every editable path and fresh SB3',async()=>{
    const original=await runPxtArcade(source+'\nlet oracleFlags=hero.flags;oracleFlags+=0');
    assert.equal(original.first,'0,0,80,60,80,60,80,60');assert.equal(original.callbackFirst,original.first);
    assert.equal(original.resized,'3,5,80,60,83,65,81.5,62.5');assert.equal(original.sharedPixel,8);assert.equal(original.firstAlias,true);
    const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
    const check=run=>{assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);const vars=values(run);for(const name of names)assert.equal(vars[name],original[name],name);assert.equal(run.vm.runtime.bwArcadeDeviceState.sprites[vars.hero].flags,original.oracleFlags);};
    let run,fresh;
    try{
        run=await runProgram(imported.code,{frames:100,uploads:imported.costumes,storage:true});check(run);
        check(await runProgram(run.creator.decompile(),{frames:100,uploads:imported.costumes,storage:true}));
        const exported=projectToArcade(run.creator.project,{costumeSvg:(target,costume)=>run.creator.assets.get(costume.assetId)?.data});assert.deepEqual(exported.unsupported,[]);
        const oracle=await runPxtArcade(exported.files);for(const name of names)assert.equal(oracle[name]??oracle['Game_'+name],original[name],name+' exported');
        const reimported=arcadeToPseudocode(exported.ts);assert.deepEqual(reimported.unsupported,[]);check(await runProgram(reimported.code,{frames:100,uploads:reimported.costumes,storage:true}));
        const archive=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());
        fresh=await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0,storage:true});fresh.vm.stopAll();await fresh.vm.loadProject(archive);fresh.vm.greenFlag();await stepFrames(fresh.vm,100);check(fresh);
    }finally{run?.vm.quit?.();fresh?.vm.quit?.();clearStrayTimers();}
});

test('public dimension defaults remain sixteen while invalid image construction reports the original error',async()=>{
    const runtime=new EventEmitter(),errors=[];runtime.startHats=()=>[];runtime.on('BLOCKS_ERROR',error=>errors.push(String(error)));
    const native=new (loadExtensionClass('arcade'))(runtime),ext=native._inst;
    for(const size of [undefined,0,'0','']){const id=native.createSprite({KIND:'Player',TEMPLATE:'',WIDTH:size,HEIGHT:size});const sprite=ext._spriteValues.get(id);assert.equal(sprite.width,16);assert.equal(sprite.height,16);assert.equal(sprite.x,80);assert.equal(sprite.y,60);}
    const before=ext._spriteValues.size;
    assert.equal(native.createImageSprite({KIND:'Player',IMAGE:null}),'');assert.equal(ext._spriteValues.size,before);assert.match(errors[0],/Sprite image cannot be undefined or null/);
    await assert.rejects(runPxtArcade('let hero=sprites.create(null,SpriteKind.Player)'),/Sprite image cannot be undefined or null/);
});
