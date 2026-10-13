import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {loadExtensionClass} from './helpers/bw-extensions.mjs';
const palette=['#000000','#ffffff','#ff2121','#ff93c4','#ff8135','#fff609','#249ca3','#78dc52','#003fad','#87f2ff','#8e2ec4','#a4839f','#5c406c','#e5cdc4','#91463d','#000000'];
const unpack=value=>'#'+[value&255,(value>>>8)&255,(value>>>16)&255].map(x=>x.toString(16).padStart(2,'0')).join('');
const frame=run=>Array.from(run.vm.runtime.bwArcadeDeviceState.sceneFrame.pixels,x=>palette[x]);
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(target=>Object.values(target.variables)).map(variable=>[variable.name.replace(/^Game_/,''),variable.value]));
const hero='let hero=sprites.create(img`5 5\n5 5`,SpriteKind.Player);hero.setPosition(80,60);scene.setBackgroundColor(9);';
const bodies={hidden:'info.showScore(false);info.showLife(false);info.setScore(1234);info.setLife(3);',shown:'info.showScore(false);info.showLife(false);info.setScore(1234);info.setLife(3);info.showScore(true);info.showLife(true);',multiplayer:'info.player2.setScore(7);info.player2.setLife(2);info.showScore(false);info.showLife(false);',countdown:'info.startCountdown(125);info.showCountdown(false);'};
for(const [name,body] of Object.entries(bodies))test('original/native HUD visibility pixels: '+name,async()=>{
 const source=hero+body;const original=await runPxtArcade('let shown=false;control.runInParallel(function(){pause(500);shown=true;shown=true;});'+source,{waitForGlobals:{shown:true},waitForMain:false,inspectDisplay:true});
 const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
 const run=await runProgram(imported.code,{frames:20,uploads:imported.costumes,storage:true});try{assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);assert.deepEqual(frame(run),original.$display.screen.map(unpack));}finally{run.vm.quit();clearStrayTimers();}
});
const timing='let ends=0;let lives=0;info.onCountdownEnd(function(){ends++;});info.onLifeZero(function(){lives++;});info.startCountdown(.1);info.showCountdown(false);info.showLife(false);info.setLife(0);pause(250);let hiddenEnds=ends;let hiddenLives=lives;info.showCountdown(true);pause(100);let visibleEnds=ends;let done=1;done+=0;';
test('hidden countdown postpones expiry, while hidden life still delivers life-zero: original/native/editable roundtrips',async()=>{
 const source=hero+timing;const original=await runPxtArcade(source,{fakeClock:true});assert.equal(original.hiddenEnds,0);assert.equal(original.visibleEnds,1);assert.equal(original.hiddenLives,1);
 const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);const runs=[];
 const check=run=>{assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);for(const name of ['hiddenEnds','hiddenLives','visibleEnds','done'])assert.equal(values(run)[name],original[name],name);};
 try{const native=await runProgram(imported.code,{frames:60,uploads:imported.costumes,storage:true});runs.push(native);check(native);const archive=Buffer.from(await(await native.vm.saveProjectSb3()).arrayBuffer());await native.vm.loadProject(archive);native.vm.greenFlag();await stepFrames(native.vm,60);check(native);
 const fresh=await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0,storage:true});runs.push(fresh);fresh.vm.stopAll();await fresh.vm.loadProject(archive);fresh.vm.greenFlag();await stepFrames(fresh.vm,60);check(fresh);
 const code=await runProgram(native.creator.decompile(),{frames:60,uploads:imported.costumes,storage:true});runs.push(code);check(code);
 const exported=projectToArcade(native.creator.project,{costumeSvg:(target,costume)=>native.creator.assets.get(costume.assetId)?.data});assert.deepEqual(exported.unsupported,[]);assert.match(exported.ts,/info.showCountdown\(false\)/);const oracle=await runPxtArcade(exported.files,{fakeClock:true});for(const key of ['hiddenEnds','hiddenLives','visibleEnds'])assert.equal(oracle[key]??oracle['Game_'+key],original[key],key+' exported');
 const reimported=arcadeToPseudocode(exported.files);assert.deepEqual(reimported.unsupported,[]);const again=await runProgram(reimported.code,{frames:60,uploads:reimported.costumes,storage:true});runs.push(again);check(again);
 }finally{for(const run of runs)run.vm.quit();clearStrayTimers();}
});
test('actual native HUD metadata exposes fixed menu and Boolean connector; unsupported selectors stay diagnosed',()=>{
 const Arcade=loadExtensionClass('arcade'),runtime={on(){},emit(){}};const arcade=new Arcade(runtime),info=arcade.getInfo(),block=info.blocks.find(b=>b.opcode==='setHudVisibility');assert.equal(block.blockType,'command');assert.equal(block.arguments.VISIBLE.type,'Boolean');assert.equal(info.menus.hudElements.acceptReporters,false);assert.deepEqual(info.menus.hudElements.items,['score','life','countdown']);
 for(const source of ['info.showScore()','info.showLife(true,false)','info.player2.showScore(true)'])assert.ok(arcadeToPseudocode(source).unsupported.length,source);
});

test('ordinary score/lives bindings preserve collisions, aliases and forward callback references through export',async()=>{
 const source=hero+'function advance(){score+=2;lives+=3;}let score_=40;let score__=50;let lives_=60;let score=1;let lives=2;let alias=score;advance();let total=score+lives+score_+score__+lives_+alias;let done=1;done+=0;';
 const oracle=await runPxtArcade(source,{fakeClock:true});const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);assert.match(imported.code,/score___/);assert.match(imported.code,/lives__/);const runs=[];
 try{const run=await runProgram(imported.code,{frames:20,uploads:imported.costumes,storage:true});runs.push(run);assert.deepEqual(run.errors,[]);assert.equal(values(run).total,oracle.total);const exported=projectToArcade(run.creator.project,{costumeSvg:(target,costume)=>run.creator.assets.get(costume.assetId)?.data});assert.deepEqual(exported.unsupported,[]);assert.doesNotMatch(exported.ts,/info\.(setLife|setScore|changeLifeBy|changeScoreBy)/);const originalExport=await runPxtArcade(exported.files,{fakeClock:true});assert.equal(originalExport.total??originalExport.Game_total,oracle.total);const reimport=arcadeToPseudocode(exported.files);assert.deepEqual(reimport.unsupported,[]);const again=await runProgram(reimport.code,{frames:20,uploads:reimport.costumes,storage:true});runs.push(again);assert.equal(values(again).total,oracle.total);}
 finally{for(const run of runs)run.vm.quit();clearStrayTimers();}
});
