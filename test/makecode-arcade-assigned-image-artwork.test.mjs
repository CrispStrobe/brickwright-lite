import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {parseImageLiteral,imageToSvg} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-assets.js';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {importGuiDependency} from './helpers/bw-integrated.mjs';
const BW=(await importGuiDependency('scratch-vm/src/util/bw-values.js')).default;
const source=`let player=sprites.create(img\`5 5 5\n5 5 5\`,SpriteKind.Player)
function applyAssigned(){player.setImage(img\`7 7 7\n7 7 7\`)}
applyAssigned()
let firstImage=player.image
firstImage.setPixel(0,0,4)
applyAssigned()
let secondImage=player.image
let fresh=firstImage!==secondImage
let firstPixel=firstImage.getPixel(0,0)
let assignedPixel=secondImage.getPixel(0,0)
let assignedWidth=secondImage.width
let assignedHeight=secondImage.height`;
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name,BW.decode(v.value)]));
const check=(run,color)=>{
 assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
 const v=values(run);assert.equal(v.fresh,true);assert.equal(v.firstPixel,4);assert.equal(v.assignedPixel,color);assert.equal(v.assignedWidth,3);assert.equal(v.assignedHeight,2);
 for(let y=0;y<2;y++)for(let x=0;x<3;x++)assert.equal(run.vm.runtime._primitives.arcade_imagePixel({IMAGE:v.secondImage,X:x,Y:y}),color,`assigned pixel ${x},${y}`);
};
async function original(files,label,color) {
 const observed=await runPxtArcade(files,{fakeClock:true,inspectImageGlobals:['firstImage','secondImage'],onCompilation:packet=>{
  if(process.env.BW_ASSIGNED_IMAGE_REPORT_DIR){fs.mkdirSync(process.env.BW_ASSIGNED_IMAGE_REPORT_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.BW_ASSIGNED_IMAGE_REPORT_DIR,label+'-compilation.json'),JSON.stringify(packet));}
 }});
 for(const [name,value] of Object.entries({fresh:true,firstPixel:4,assignedPixel:color,assignedWidth:3,assignedHeight:2}))assert.equal(observed[name],value,name);
 assert.deepEqual(observed.$images.firstImage,{width:3,height:2,pixels:[4,color,color,color,color,color]});
 assert.deepEqual(observed.$images.secondImage,{width:3,height:2,pixels:Array(6).fill(color)});
 if(process.env.BW_ASSIGNED_IMAGE_REPORT_DIR)fs.writeFileSync(path.join(process.env.BW_ASSIGNED_IMAGE_REPORT_DIR,label+'-observations.json'),JSON.stringify(observed));
}
const readCostume=(run,target,costume)=>{const data=run.vm.runtime.targets.find(t=>t.id===target.id||t.getName()===target.name)?.getCostumes().find(c=>c.assetId===costume.assetId)?.asset?.data;return data?new TextDecoder().decode(data):null;};

test('assigned literal has an editable source costume and each evaluation owns a fresh Image through editing and portable routes',async()=>{
 const converted=arcadeToPseudocode(source);assert.deepEqual(converted.unsupported,[]);
 const binding=/arcade set image of player to arcade copy image \(arcade frame image array "([^"]+)" index \(0\) template "([^"]+)" start 0 count 1\)/.exec(converted.code);
 assert.ok(binding,'assigned literal retains its actual source frame binding');
 const carrier=converted.costumes.find(c=>c.sprite===binding[2]);assert.ok(carrier);assert.equal(carrier.mode,'replace');
 const runs=[];
 try {
  await original(source,'baseline',7);
  const run=await runProgram(converted.code,{frames:12,storage:true,uploads:converted.costumes});runs.push(run);check(run,7);
  const target=run.vm.runtime.getSpriteTargetByName(binding[2]);assert.ok(target);assert.equal(target.getCostumes().length,1);
  run.vm.stopAll();run.vm.setEditingTarget(target.id);
  const edited=imageToSvg(parseImageLiteral('9 9 9\n9 9 9'));
  const beforeAsset=target.getCostumes()[0].assetId;
  run.vm.updateSvg(0,edited,6,4);
  const changedAsset=target.getCostumes()[0].assetId;
  assert.notEqual(changedAsset,beforeAsset);assert.deepEqual([...target.getCostumes()[0].asset.data],[...new TextEncoder().encode(edited)]);
  run.vm.greenFlag();await stepFrames(run.vm,12,20);check(run,9);
  const project=JSON.parse(run.vm.toJSON()),code=run.creator.decompile(project);
  assert.match(code,new RegExp(`template "${binding[2]}" start 0 count 1`));
  const uploads=project.targets.filter(t=>!t.isStage).flatMap(t=>t.costumes.map((c,i)=>({sprite:t.name,name:c.name,mode:i?'add':'replace',svg:readCostume(run,t,c)})));
  const rebuilt=await runProgram(code,{frames:12,storage:true,uploads});runs.push(rebuilt);check(rebuilt,9);
  const saved=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());
  run.vm.stopAll();await run.vm.loadProject(saved);run.vm.greenFlag();await stepFrames(run.vm,12,20);check(run,9);
  const fresh=await runProgram('DEVICE ARCADE\nSPRITE Placeholder:\nWHEN flag clicked:\n  hide',{storage:true});runs.push(fresh);
  fresh.vm.stopAll();await fresh.vm.loadProject(saved);fresh.vm.greenFlag();await stepFrames(fresh.vm,12,20);check(fresh,9);
  const exported=projectToArcade(project,{costumeSvg:(t,c)=>readCostume(run,t,c)});assert.deepEqual(exported.unsupported,[]);
  assert.match(exported.ts,/9 9 9\n\s+9 9 9/);
  await original(exported.files,'edited-export',9);
  const reimported=arcadeToPseudocode(exported.files);assert.deepEqual(reimported.unsupported,[]);
  const returned=await runProgram(reimported.code,{frames:12,storage:true,uploads:reimported.costumes});runs.push(returned);check(returned,9);
 }finally{for(const run of runs)run.vm.quit();clearStrayTimers();}
});
