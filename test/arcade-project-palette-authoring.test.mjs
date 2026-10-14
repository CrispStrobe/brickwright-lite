import test from 'node:test';
import assert from 'node:assert/strict';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {inspectProjectPalette,applyProjectPalette,DEFAULT_PROJECT_PALETTE,paletteHex} from '../overlay/scratch-gui/src/lib/arcade-project-palette.js';
const colors=[...DEFAULT_PROJECT_PALETTE];colors[0]='#102030';colors[1]='#123456';colors[2]='#123456';
async function fixture(palette){
 const files={'main.ts':'let art=img`1 2`\nlet hero=sprites.create(art,SpriteKind.Player)\nlet first=art.getPixel(0,0)\nlet ready=true',
 'pxt.json':JSON.stringify({name:'palette-editor',dependencies:{device:'*'},files:['main.ts'],...(palette?{palette}:{})})};
 const imported=arcadeToPseudocode(files);assert.deepEqual(imported.unsupported,[]);
 const run=await runProgram(imported.code,{frames:12,storage:true,uploads:imported.costumes});run.uploads=imported.costumes;return run;
}
const snapshot=vm=>JSON.stringify(vm.runtime.targets.map(t=>t.blocks._blocks));
test('palette authoring prepends real startup blocks and survives SB3 save/load and restart',async()=>{
 const run=await fixture(),runs=[run];try{
  const before=inspectProjectPalette(run.vm);assert.equal(before.kind,'default');
  const after=await applyProjectPalette(run.vm,colors,before.signature);assert.equal(after.kind,'constant');
  assert.deepEqual(after.colors,colors);assert.deepEqual(run.vm.runtime.bwArcadeDeviceState.palette,colors);
  const authored=JSON.parse(run.vm.toJSON());
  const code=run.creator.decompile(authored);assert.match(code,/arcade set palette hex/);
  const again=await runProgram(code,{frames:12,storage:true,uploads:run.uploads});runs.push(again);
  assert.deepEqual(again.errors,[]);assert.deepEqual(again.vm.runtime.bwArcadeDeviceState.palette,colors);
  const exported=projectToArcade(authored,{costumeSvg:(target,costume)=>run.creator.assets.get(costume.assetId)?.data});
  assert.deepEqual(exported.unsupported,[]);assert.match(exported.ts,/image\.setPalette\(Buffer\.fromHex\(/);
  // Main completion can precede the first palette-bearing display update.
  // Observe the real screen-update boundary before comparing all 16 colors.
  const original=await runPxtArcade(exported.files,{inspectDisplay:true,waitForDisplay:true});
  const unpack=value=>'#'+[value&255,(value>>>8)&255,(value>>>16)&255].map(byte=>byte.toString(16).padStart(2,'0')).join('');
  assert.deepEqual(original.$display.palette.map(unpack),colors);
  const saved=await run.vm.saveProjectSb3(),bytes=Buffer.from(await saved.arrayBuffer());await run.vm.loadProject(bytes);
  assert.deepEqual(inspectProjectPalette(run.vm).colors,colors);
  run.vm.greenFlag();await stepFrames(run.vm,12);assert.deepEqual(run.vm.runtime.bwArcadeDeviceState.palette,colors);
  assert.match(run.vm.toJSON(),/arcade_setPalette/);
  const fresh=await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0,storage:true});runs.push(fresh);fresh.vm.stopAll();await fresh.vm.loadProject(bytes);fresh.vm.greenFlag();await stepFrames(fresh.vm,12);
  assert.deepEqual(fresh.errors,[]);assert.deepEqual(fresh.vm.runtime.bwArcadeDeviceState.palette,colors);
  assert.deepEqual([...Object.values(fresh.vm.runtime.bwArcadeDeviceState.sprites)[0].image.pixels],[1,2],'fresh saved project retains the original indexed artwork');
  const observed=Object.fromEntries(fresh.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
  assert.equal(observed.first,1,'fresh source initialization still reads its original image');assert.equal(observed.ready,true);
 }finally{for(const current of runs)current.vm.quit();clearStrayTimers();}
});
test('updating a literal startup preserves authored later palette changes and other blocks',async()=>{
 const run=await fixture(colors);try{
  const before=inspectProjectPalette(run.vm);assert.equal(before.kind,'constant');
  const blocks=before.start.target.blocks,command=before.start.command;
  const oldNext=command.next,ids=Object.keys(blocks._blocks),textId=before.start.literal.text.id;
  const unchanged=JSON.stringify(Object.fromEntries(Object.entries(blocks._blocks).filter(([id])=>id!==textId)));
  await applyProjectPalette(run.vm,colors,before.signature);
  assert.equal(command.next,oldNext);assert.deepEqual(Object.keys(blocks._blocks),ids);
  assert.equal(JSON.stringify(Object.fromEntries(Object.entries(blocks._blocks).filter(([id])=>id!==textId))),unchanged);
  assert.equal(blocks.getBlock(textId).fields.TEXT.value,paletteHex(colors));
 }finally{clearStrayTimers();}
});
test('stale project edits, dynamic startup expressions and invalid colors reject without block mutation',async()=>{
 const run=await fixture(colors);try{
  const before=inspectProjectPalette(run.vm),blocks=before.start.target.blocks;
  blocks.changeBlock({id:before.start.literal.text.id,element:'field',name:'TEXT',value:'000000'.repeat(16)});
  const edited=snapshot(run.vm);await assert.rejects(applyProjectPalette(run.vm,colors,before.signature),/changed/);assert.equal(snapshot(run.vm),edited);
  await assert.rejects(applyProjectPalette(run.vm,colors.slice(1)),/16 RGB/);assert.equal(snapshot(run.vm),edited);
  blocks.getBlock(before.start.literal.text.id).shadow=false;
  const dynamic=inspectProjectPalette(run.vm);assert.equal(dynamic.kind,'dynamic');const frozen=snapshot(run.vm);
  await assert.rejects(applyProjectPalette(run.vm,colors,dynamic.signature),/expression/);assert.equal(snapshot(run.vm),frozen);
 }finally{clearStrayTimers();}
});

test('later palette commands remain intact and multiple startup palettes are rejected',async()=>{
 const run=await fixture(colors);try{
  const initial=inspectProjectPalette(run.vm),blocks=initial.start.target.blocks;
  const later={id:'laterPalette',opcode:'arcade_setPalette',inputs:{DATA:{name:'DATA',block:'laterText',shadow:'laterText'}},fields:{},next:null,parent:null,shadow:false,topLevel:false};
  blocks.createBlock({id:'laterText',opcode:'text',inputs:{},fields:{TEXT:{name:'TEXT',value:'010203'.repeat(16)}},next:null,parent:later.id,shadow:true,topLevel:false});
  blocks.createBlock(later);
  const first=initial.start.command.next;
  blocks.moveBlock({id:later.id,newParent:initial.start.command.id});
  if(first)blocks.moveBlock({id:first,newParent:later.id});
  const before=inspectProjectPalette(run.vm);assert.equal(before.laterChanges,true);
  await applyProjectPalette(run.vm,DEFAULT_PROJECT_PALETTE,before.signature);
  assert.equal(blocks.getBlock('laterText').fields.TEXT.value,'010203'.repeat(16));
  run.vm.greenFlag();await stepFrames(run.vm,12);assert.deepEqual(run.vm.runtime.bwArcadeDeviceState.palette,Array(16).fill('#010203'));
  blocks.createBlock({id:'otherFlag',opcode:'event_whenflagclicked',inputs:{},fields:{},next:null,parent:null,shadow:false,topLevel:true});
  blocks.moveBlock({id:later.id,oldParent:initial.start.command.id,newParent:'otherFlag'});
  const conflict=inspectProjectPalette(run.vm);assert.equal(conflict.kind,'conflict');const frozen=snapshot(run.vm);
  await assert.rejects(applyProjectPalette(run.vm,colors,conflict.signature),/multiple/);assert.equal(snapshot(run.vm),frozen);
 }finally{clearStrayTimers();}
});

test('extension load failure and project edits during extension loading do not mutate blocks',async()=>{
 const run=await fixture(colors);try{
  const before=inspectProjectPalette(run.vm),primitive=run.vm.runtime._primitives.arcade_setPalette;
  delete run.vm.runtime._primitives.arcade_setPalette;
  const frozen=snapshot(run.vm);
  run.vm.extensionManager.loadExtensionURL=async()=>{throw new Error('load failed');};
  await assert.rejects(applyProjectPalette(run.vm,colors,before.signature),/load failed/);assert.equal(snapshot(run.vm),frozen);
  run.vm.extensionManager.loadExtensionURL=async()=>{
   before.start.target.blocks.changeBlock({id:before.start.literal.text.id,element:'field',name:'TEXT',value:'000000'.repeat(16)});
   run.vm.runtime._primitives.arcade_setPalette=primitive;
  };
  await assert.rejects(applyProjectPalette(run.vm,colors,before.signature),/changed/);
  assert.equal(before.start.literal.text.fields.TEXT.value,'000000'.repeat(16));
 }finally{clearStrayTimers();}
});

test('palette authoring reuses the source entry on its actual target before ordinary Scratch startup',async()=>{
 const run=await fixture();try{
  const sourceTarget=run.vm.runtime.targets.find(target=>!target.isStage&&target.isOriginal!==false&&target.blocks.getScripts().some(id=>target.blocks.getBlock(id)?.opcode==='arcade_whenSourceStarts'));
  assert.ok(sourceTarget);const hat=sourceTarget.blocks.getScripts().map(id=>sourceTarget.blocks.getBlock(id)).find(block=>block.opcode==='arcade_whenSourceStarts'),first=hat.next;
  const declarations=[];let body=sourceTarget.blocks.getBlock(first);
  while(['arcade_declareSourceScalar','arcade_declareSourceReference'].includes(body?.opcode)){declarations.push(body);body=sourceTarget.blocks.getBlock(body.next);}
  assert.ok(declarations.length,'fixture includes an actual source prelude');
  const declarationFields=declarations.map(block=>structuredClone({id:block.id,inputs:block.inputs,fields:block.fields}));
  const stage=run.vm.runtime.getTargetForStage(),oldStage=JSON.stringify(stage.blocks._blocks);
  const authored=await applyProjectPalette(run.vm,colors,inspectProjectPalette(run.vm).signature);
  assert.equal(authored.start.target,sourceTarget);assert.equal(authored.start.hat,hat);assert.equal(hat.next,first,'source declaration prefix remains first');assert.equal(authored.start.command.next,body.id);
  assert.equal(declarations.at(-1).next,authored.start.command.id);
  assert.deepEqual(declarations.map(block=>({id:block.id,inputs:block.inputs,fields:block.fields})),declarationFields);
  assert.equal(JSON.stringify(stage.blocks._blocks),oldStage);
  run.vm.greenFlag();await stepFrames(run.vm,12);assert.deepEqual(run.vm.runtime.bwArcadeDeviceState.palette,colors);assert.deepEqual(run.errors,[]);
  sourceTarget.blocks.createBlock({id:'otherSourceEntry',opcode:'arcade_whenSourceStarts',inputs:{},fields:{},next:'otherSourceBody',parent:null,shadow:false,topLevel:true,x:0,y:0});
  sourceTarget.blocks.createBlock({id:'otherSourceBody',opcode:'looks_show',inputs:{},fields:{},next:null,parent:'otherSourceEntry',shadow:false,topLevel:false});
  // Existing literal startup edits remain local and unambiguous. A new startup
  // insertion into multiple source entries must refuse without any mutation.
  const command=authored.start.command;sourceTarget.blocks.getBlock(command.parent).next=null;command.parent=null;sourceTarget.blocks.deleteBlock(command.id);const frozen=snapshot(run.vm);
  await assert.rejects(applyProjectPalette(run.vm,colors,inspectProjectPalette(run.vm).signature),/multiple source entry/);assert.equal(snapshot(run.vm),frozen);
 }finally{run.vm.quit();clearStrayTimers();}
});


test('palette insertion preserves interleaved source declaration graph and rejects an edited prefix',async()=>{
 const run=await fixture();try{
  const target=run.vm.runtime.targets.find(t=>t.isOriginal&&!t.isStage&&t.blocks.getScripts().some(id=>t.blocks.getBlock(id)?.opcode==='arcade_whenSourceStarts'));
  const blocks=target.blocks,hat=blocks.getScripts().map(id=>blocks.getBlock(id)).find(b=>b.opcode==='arcade_whenSourceStarts'),scalar=blocks.getBlock(hat.next);
  // This graph control covers the editor's Reference ABI without executing a
  // reference declaration in a provider that only has SourceScalar installed.
  const reference={id:'referencePrelude',opcode:'arcade_declareSourceReference',inputs:{VARIABLE:{name:'VARIABLE',block:'referenceVariable',shadow:null}},fields:{TYPE:{name:'TYPE',value:'Image'}},next:null,parent:null,shadow:false,topLevel:false};
  blocks.createBlock({id:'referenceVariable',opcode:'data_variable',inputs:{},fields:{VARIABLE:{name:'VARIABLE',value:'picture',id:'picture'}},next:null,parent:reference.id,shadow:false,topLevel:false});
  blocks.createBlock(reference);blocks.moveBlock({id:reference.id,newParent:hat.id});blocks.moveBlock({id:scalar.id,oldParent:hat.id,newParent:reference.id});
  const prefix=[hat.next,reference.next],fields=JSON.stringify(reference.fields),reporter=JSON.stringify(blocks.getBlock('referenceVariable'));let last=scalar;while(['arcade_declareSourceScalar','arcade_declareSourceReference'].includes(blocks.getBlock(last.next)?.opcode))last=blocks.getBlock(last.next);const body=last.next;
  const before=inspectProjectPalette(run.vm);const authored=await applyProjectPalette(run.vm,colors,before.signature);
  assert.equal(hat.next,prefix[0]);assert.equal(reference.next,prefix[1]);assert.equal(last.next,authored.start.command.id);assert.equal(authored.start.command.next,body);
  assert.equal(JSON.stringify(reference.fields),fields);assert.equal(JSON.stringify(blocks.getBlock('referenceVariable')),reporter);
  assert.equal(authored.start.command.parent,last.id,'entire interleaved declaration prefix precedes the palette');
  const stale=inspectProjectPalette(run.vm);reference.fields.TYPE.value='Sprite';const frozen=snapshot(run.vm);
  await assert.rejects(applyProjectPalette(run.vm,colors,stale.signature),/changed/);assert.equal(snapshot(run.vm),frozen);
 }finally{run.vm.quit();clearStrayTimers();}
});

test('palette authoring keeps ordinary Scratch saved defaults and flag body',async()=>{
 const run=await runProgram('GLOBAL counter\nSPRITE Actor:\nWHEN flag clicked:\n  set counter to (counter + 1)',{frames:3,storage:true});
 try{
  const variable=run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).find(v=>v.name==='counter');assert.ok(variable);variable.value=7;
  const sourceDeclarations=()=>run.vm.runtime.targets.flatMap(t=>Object.values(t.blocks._blocks)).filter(b=>b.opcode==='arcade_declareSourceScalar'||b.opcode==='arcade_declareSourceReference');
  assert.equal(sourceDeclarations().length,0);await applyProjectPalette(run.vm,colors);
  assert.equal(variable.value,7,'live palette edit leaves ordinary saved value intact');
  run.vm.greenFlag();await stepFrames(run.vm,3);assert.equal(variable.value,8,'ordinary flag body uses its saved default');
  assert.equal(sourceDeclarations().length,0);assert.deepEqual(run.errors,[]);
 }finally{run.vm.quit();clearStrayTimers();}
});
