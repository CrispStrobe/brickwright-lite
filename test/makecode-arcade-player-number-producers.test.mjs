import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {analyseSourceValueProducers} from '../overlay/scratch-gui/src/lib/bw-makecode/source-value-producers.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
const sample=(body='let number=mp.getPlayerProperty(renamed,mp.PlayerProperty.Number);let text=console.inspect("Catch "+7*number)',before='')=>before+'mp.onControllerEvent(ControllerEvent.Connected,function(renamed){'+body+'})';
function calls(source,options={multiplayerPlayerProperties:true}){const program=parseMakeCodeTs(source),proof=analyseSourceValueProducers(program,{...options,consoleInspection:true,opaqueDeclarationValues:true,unboundIsOpaque:true,uninitializedLocalsAreOpaque:true}),rows=[];const walk=node=>{if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(walk);return;}if(node.type==='Call'&&node.callee?.name==='inspect')rows.push([...proof.typesAt(node)]);Object.values(node).forEach(walk);};walk(program);return rows;}
test('actual immutable Player event parameter flows through helpers into fixed Number property',()=>{
 for(const source of [sample(),sample('let alias=renamed;let text=console.inspect(mp.getPlayerProperty(alias,mp.PlayerProperty.Number))'),sample('let text=console.inspect(read(renamed))','function read(value){return mp.getPlayerProperty(value,mp.PlayerProperty.Number)}'),sample().replace('Connected','Disconnected'),sample().replace('function(renamed)','(renamed)=>')]){
  assert.deepEqual(calls(source),[['String']],source);const converted=arcadeToPseudocode(source);assert.deepEqual(converted.unsupported,[],source);assert.match(converted.code,/arcade inspect value/);
 }
 assert.ok(calls(sample(),{}).every(types=>types.includes('Opaque')));
});
test('Player annotations and aliases cannot replace actual unchanged SDK registration and selector',()=>{
 const bad=[sample('renamed._index="bad" as any;let text=console.inspect(mp.getPlayerProperty(renamed,mp.PlayerProperty.Number))'),sample('renamed.getProperty=()=>image.create(1,1);let text=console.inspect(mp.getPlayerProperty(renamed,mp.PlayerProperty.Number))'),sample('let key="_index";renamed[key]="bad";let text=console.inspect(mp.getPlayerProperty(renamed,mp.PlayerProperty.Number))'),sample('let alias=mp.getPlayerByNumber(2);alias._index="bad" as any;let text=console.inspect(mp.getPlayerProperty(renamed,mp.PlayerProperty.Number))'),'let player:mp.Player="text" as any;let result=console.inspect(player)',sample('let alias:number=renamed as any;let text=console.inspect(mp.getPlayerProperty(alias,mp.PlayerProperty.Number))'),sample('let text=console.inspect(read(renamed as any))','function read(player:number){return mp.getPlayerProperty(player as any,mp.PlayerProperty.Number)}'),sample('renamed=7;let text=console.inspect(mp.getPlayerProperty(renamed,mp.PlayerProperty.Number))'),sample('let text=console.inspect(read(renamed))','function read(value){return mp.getPlayerProperty(value,mp.PlayerProperty.Number)}read(image.create(1,1));'),sample().replace('mp.PlayerProperty.Number','mp.PlayerProperty.Index'),sample().replace('mp.PlayerProperty.Number','2'),sample().replace('function(renamed)','function(renamed:string)'),sample().replace('ControllerEvent.Connected','1'),'function read(value:mp.Player){return console.inspect(mp.getPlayerProperty(value,mp.PlayerProperty.Number))}read(image.create(1,1) as any)'];
 for(const prefix of ['mp.getPlayerProperty=(value:any,property:any)=>3;','mp.onControllerEvent=(event:any,handler:any)=>{};','mp.PlayerProperty.Number=7;','ControllerEvent.Connected=7;','let alias=mp;','let alias=mp.PlayerProperty;','let alias=mp.getPlayerProperty;','mp["getPlayerProperty"]=null;'])bad.push(sample(undefined,prefix));
 for(const source of bad){assert.ok(calls(source).every(types=>!types.includes('String')||types.includes('Opaque')),source);assert.ok(arcadeToPseudocode(source).unsupported.length,source);}
});

test('registered Player property keeps actual identity and String output through portable current graphs',async()=>{
 const {runArcadeSourceCode}=await import('./helpers/arcade-source-program.mjs');
 const {stepFrames,clearStrayTimers}=await import('./helpers/bw-vm.mjs');
 const {projectToArcade}=await import('../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js');
 const source='let observed="";let count=0;let ready=false;let beforeNull=-1;let beforeUndefined=-1;let afterNumber=-1;function describe(player){return console.inspect("Player "+mp.getPlayerProperty(player,mp.PlayerProperty.Number))}mp.onControllerEvent(ControllerEvent.Connected,function(renamed){let pending=null;beforeNull=mp.getPlayerProperty(pending,mp.PlayerProperty.Number);pending=undefined;beforeUndefined=mp.getPlayerProperty(pending,mp.PlayerProperty.Number);pending=renamed;afterNumber=mp.getPlayerProperty(pending,mp.PlayerProperty.Number);observed=describe(pending);count+=1});controller.player2.connected=true;game.onUpdate(function(){ready=count===1})';
 const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);const runs=[];
 const check=run=>{assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);const values=Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name,v.value]));assert.equal(values.observed,'Player 2');assert.equal(values.count,1);assert.equal(values.ready,true);assert.equal(values.beforeNull,0);assert.equal(values.beforeUndefined,0);assert.equal(values.afterNumber,2);};
 const tick=async run=>{await stepFrames(run.vm,1,0);await stepFrames(run.vm,12,20);check(run);};
 const execute=async code=>{const run=await runArcadeSourceCode(code,{frames:0});runs.push(run);await tick(run);return run;};
 try{
  const run=await execute(imported.code);await execute(run.creator.decompile());
  const saved=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());run.vm.stopAll();await run.vm.loadProject(saved);run.vm.runtime.bwArcadeFrameAuthority='manual';run.vm.greenFlag();await tick(run);
  const fresh=await runArcadeSourceCode('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0});runs.push(fresh);fresh.vm.stopAll();await fresh.vm.loadProject(saved);fresh.vm.runtime.bwArcadeFrameAuthority='manual';fresh.vm.greenFlag();await tick(fresh);
  const current=JSON.parse(run.vm.toJSON()),exported=projectToArcade(current);assert.deepEqual(exported.unsupported,[]);assert.match(exported.ts,/mp\.getPlayerProperty\([^\n]+mp\.PlayerProperty\.Number/);const again=arcadeToPseudocode(exported.files);assert.deepEqual(again.unsupported,[],exported.ts);await execute(again.code);
  for(const change of ['selector','receiver','registration','writer','duplicateProcedure']){
   const edited=structuredClone(current),target=edited.targets.find(t=>Object.values(t.blocks||{}).some(b=>b.opcode==='arcade_playerProperty')),blocks=target.blocks;
   const findProperty=(node,seen=new Set())=>{if(!node||seen.has(node))return null;seen.add(node);if(node.opcode==='arcade_playerProperty')return node;for(const slot of Object.values(node.inputs||{})){const found=findProperty(blocks[slot[1]],seen);if(found)return found;}return null;};
   const property=findProperty(Object.values(blocks).find(b=>b.opcode==='arcade_inspectValue'));assert.ok(property);
   if(change==='selector')property.inputs.PROPERTY=[1,[4,'1']];
   if(change==='receiver'){blocks.opaquePlayer={opcode:'arcade_createImage',inputs:{WIDTH:[1,[4,'1']],HEIGHT:[1,[4,'1']]},fields:{}};property.inputs.PLAYER=[2,'opaquePlayer'];}
   if(change==='registration')Object.values(blocks).find(b=>b.opcode==='arcade_registerMultiplayerConnection').inputs.EVENT=[1,[4,'3']];
   if(change==='writer'){
    const player=Object.values(blocks).find(b=>b.opcode==='arcade_setLocal'&&blocks[b.inputs.VALUE?.[1]]?.opcode==='arcade_eventPlayer');
    blocks.opaquePlayer={opcode:'arcade_createImage',inputs:{WIDTH:[1,[4,'1']],HEIGHT:[1,[4,'1']]},fields:{}};player.inputs.VALUE=[2,'opaquePlayer'];
   }
   if(change==='duplicateProcedure'){
    const definition=Object.values(blocks).find(b=>b.opcode==='procedures_definition'),prototype=blocks[definition.inputs.custom_block[1]];
    blocks.duplicateDefinition={...definition,inputs:{custom_block:[1,'duplicatePrototype']}};blocks.duplicatePrototype={...prototype,parent:'duplicateDefinition'};
   }
   assert.ok(projectToArcade(edited).unsupported.some(reason=>reason.includes('inspection export')),change);
  }
 }finally{for(const run of runs){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});
