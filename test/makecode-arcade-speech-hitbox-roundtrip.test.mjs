import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const source=`scene.setBackgroundColor(9)
let actor=sprites.create(img\`. . . .\n. . . .\n. 2 2 .\n. 2 2 .\`,SpriteKind.Player)
actor.setPosition(80,60)
actor.sx=2
actor.sy=1.5
actor.rotationDegrees=37
actor.say("Hi",undefined,2,5)
`;
const capture=`pause(60)
let raster=""
let digits="0123456789abcdef"
for(let y=0;y<120;y++)for(let x=0;x<160;x++)raster+=digits.charAt(screen.getPixel(x,y))
`;
test('scaled rotated speech keeps original full pixels through Code, SB3 and MakeCode interchange',async()=>{
 const original=await runPxtArcade(source+capture);
 assert.equal(original.raster.length,19200);
 const expected=Array.from(original.raster,ch=>parseInt(ch,16));
 const check=run=>{
  assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
  assert.deepEqual([...run.vm.runtime.bwArcadeDeviceState.sceneFrame.pixels],expected);
 };
 const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
 const run=await runProgram(imported.code,{frames:40,uploads:imported.costumes,storage:true});check(run);
 const code=await runProgram(run.creator.decompile(),{frames:40,uploads:imported.costumes,storage:true});check(code);
 const saved=await run.vm.saveProjectSb3();await run.vm.loadProject(Buffer.from(await saved.arrayBuffer()));
 run.vm.greenFlag();await stepFrames(run.vm,40);check(run);
 const out=projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});
 assert.deepEqual(out.unsupported,[]);
 const originalExport=await runPxtArcade({...out.files,'main.ts':out.files['main.ts']+capture});
 assert.equal(originalExport.raster,original.raster);
 const again=arcadeToPseudocode(out.files);assert.deepEqual(again.unsupported,[]);
 check(await runProgram(again.code,{frames:40,uploads:again.costumes,storage:true}));
});
