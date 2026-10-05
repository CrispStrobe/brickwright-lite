import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createRequire} from 'node:module';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runProgram,stepFrames} from './helpers/bw-vm.mjs';
// Task E1 keeps the import half of these round trips; the export half (projectToArcade, then compiling or running the exported TypeScript in PXT, then re-importing it) returns with task E2 (docs/OPEN-TASKS-2026-09-29.md).
const require=createRequire(import.meta.url);
const engine=require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/image.js')([],require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/image-pxt.js'));
const original=readFileSync(new URL('../packages/scratch-gui/static/makecode/arcade/sim/common-sim.js',import.meta.url),'utf8');
const context={pxsim:{RefObject:class{}}};
const end=original.indexOf('pxsim.RefImage = RefImage;');
runInNewContext(original.slice(original.indexOf('class RefImage extends'),end+'pxsim.RefImage = RefImage;'.length),context);
for(const name of ['fillRect','drawImageCore','drawImage','drawTransparentImage','overlapsWith']){
    const start=original.indexOf(`function ${name}(img`),body=original.indexOf('{',start);let depth=1,finish=body+1;
    while(depth){if(original[finish]==='{')depth++;if(original[finish]==='}')depth--;finish++;}
    runInNewContext(original.slice(start,finish),context);
}
const ref=image=>{const r=new context.pxsim.RefImage(image.width,image.height,4);r.data.set(image.pixels);return r;};
const native=(w,h,seed)=>({width:w,height:h,pixels:Uint8Array.from({length:w*h},(_,i)=>(i+seed)%4===0?0:(i+seed)%15+1)});

test('image copy, transparency and pixel overlap match pinned PXT including clipping and self-copy',()=>{
    for(const op of ['drawImage','drawTransparentImage','overlapsWith'])for(const [x,y] of [[0,0],[-2,-1],[4,3],[20,20],[1.9,-0.9],[-4,0]])for(const self of [false,true]){
        const destination=native(5,4,3),source=self?destination:native(4,3,1);
        const expected=ref(destination),expectedSource=self?expected:ref(source);
        const before=[...destination.pixels];
        assert.equal(engine.blit(destination,source,op,x,y),context[op](expected,expectedSource,x,y),`${op} ${x},${y} self=${self}`);
        assert.deepEqual([...destination.pixels],[...expected.data],`${op} ${x},${y} self=${self}`);
        if(op==='overlapsWith')assert.deepEqual([...destination.pixels],before);
    }
});

const source=`let surface=image.create(5,4)
surface.fill(5)
let stamp=image.create(3,2)
stamp.setPixel(0,0,2)
stamp.setPixel(2,1,7)
let hero=sprites.create(surface,SpriteKind.Player)
let alias=sprites.create(surface,SpriteKind.Enemy)
function paste(target:Image, input:Image, x:number){target.drawImage(input,x,1)}
paste(surface,stamp,1)
surface.drawTransparentImage(stamp,-1,0)
let hit=surface.overlapsWith(stamp,1,1)
let miss=surface.overlapsWith(stamp,20,20)
let branch=0
if(surface.overlapsWith(stamp,1,1)){branch=1}
hero.image.drawTransparentImage(stamp,0,2)
hero.image.drawImage(stamp,3,3)
let spriteHit=hero.image.overlapsWith(stamp,0,2)`;
const verify=run=>{
    assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
    const state=Object.values(run.vm.runtime.bwArcadeDeviceState.sprites);assert.equal(state.length,2);assert.equal(state[0].image,state[1].image);
    const expected=native(5,4,0);expected.pixels.fill(5);const stamp={width:3,height:2,pixels:Uint8Array.from([2,0,0,0,0,7])};
    for(const [op,x,y] of [['drawImage',1,1],['drawTransparentImage',-1,0],['drawTransparentImage',0,2],['drawImage',3,3]])engine.blit(expected,stamp,op,x,y);
    assert.deepEqual([...state[0].image.pixels],[...expected.pixels]);
    const vars=Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name,v.value]));
    assert.equal(vars.hit,true);assert.equal(vars.miss,false);assert.equal(vars.spriteHit,true);assert.equal(Number(vars.branch),1);
};

test('live image drawing and overlap survive Code and SB3',async()=>{
    const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[],JSON.stringify(imported));
    const run=await runProgram(imported.code,{frames:12,uploads:imported.costumes,storage:true});verify(run);
    verify(await runProgram(run.creator.decompile(),{frames:12,uploads:imported.costumes,storage:true}));
    const saved=await run.vm.saveProjectSb3();await run.vm.loadProject(Buffer.from(await saved.arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,12);verify(run);
});

test('bad image arguments report a gap rather than dropping drawing operations',()=>{
    const result=arcadeToPseudocode('let picture=image.create(2,2)\npicture.drawImage(12,0,0)\nlet hit=picture.overlapsWith(12,0,0)');
    assert.ok(result.unsupported.some(s=>s.includes('drawImage() needs an image source')));
    assert.ok(result.unsupported.some(s=>s.includes('overlapsWith() needs an image source')));
});
