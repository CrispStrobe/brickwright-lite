import test from 'node:test';
import assert from 'node:assert/strict';
import {parseNativeTilemapFactories,createNativeTilemapRegistry,resolveNativeTilemap} from '../overlay/scratch-gui/src/lib/bw-makecode/tilemap-values.js';
import {parseImageLiteral} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-assets.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
const imageOf=n=>n?.type==='Template'&&n.tag==='img'?parseImageLiteral(n.value):null;
const map=(pixel=5,scale='Eight',wall='2')=>`tiles.createTilemap(hex\`0100010000\`,img\`${wall}\`,[img\`${pixel}\`],TileScale.${scale})`;
const factory=(cases,trim=true)=>`helpers._registerFactory("tilemap",function(name:string){switch(${trim?'helpers.stringTrim(name)':'name'}){${cases}}return null;});`;
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
test('full generated factory AST preserves aliases, first-match duplicate cases, default and registration order',()=>{
 const first=factory(`case "alias":case "chosen":return ${map(5)};case "chosen":return ${map(7)};case "later":return null;`);
 const second=factory(`case "later":return ${map(7)};default:return ${map(3)};`);
 const registry=createNativeTilemapRegistry({'b.g.ts':second,'a.g.ts':first},imageOf,{fileOrder:['a.g.ts','b.g.ts']});
 for(const name of ['alias','chosen',' chosen '])assert.equal(resolveNativeTilemap(registry,name).value.images[0].pixels[0],5,name);
 assert.equal(resolveNativeTilemap(registry,'later').value.images[0].pixels[0],7);
 assert.equal(resolveNativeTilemap(registry,'missing').value.images[0].pixels[0],3);
 const exact=createNativeTilemapRegistry({'exact.g.ts':factory(`case "chosen":return ${map(5)};`,false)},imageOf);assert.equal(resolveNativeTilemap(exact,' chosen ').value,null);
 const miss=createNativeTilemapRegistry({'a.g.ts':first},imageOf);assert.equal(resolveNativeTilemap(miss,'missing').value,null);
});
test('malformed or dynamic generated factories cannot certify absence',()=>{
 for(const source of [factory(`case "x":touch();return ${map()};`),factory(`case dynamic():return ${map()};`),factory(`default:return tiles.createTilemap(hex\`zz\`,img\`0\`,[img\`5\`],TileScale.Eight);`),'helpers._registerFactory(kind,function(name){return null;});','if(flag){'+factory('default:return null;')+'}','helpers._registerFactory("tilemap",function(name){return compute(name);});','helpers._registerFactory("tilemap",',factory('default:return null;')+'touch();','helpers._registerFactory("image",function(n){touch();return null;});','let image=touch();'+factory('default:return null;')]){
  const parsed=parseNativeTilemapFactories(source,imageOf);assert.ok(parsed.unsupported.length,source);
  const registry=createNativeTilemapRegistry({'bad.g.ts':source},imageOf),result=resolveNativeTilemap(registry,'missing');assert.equal(result.value,undefined);assert.ok(result.unsupported.length);
  const imported=arcadeToPseudocode({'main.ts':'tiles.setCurrentTilemap(tilemap`missing`)','bad.g.ts':source});assert.ok(imported.unsupported.length,source);assert.doesNotMatch(imported.code,/arcade set tilemap data "null"/);
 }
 const dynamic=arcadeToPseudocode('tiles.setCurrentTilemap(tilemap`${name}`)');assert.ok(dynamic.unsupported.length);
});
const makeFiles=(kind)=>{
 const code=kind==='missing'?'tiles.setCurrentTilemap(tilemap`missing`)':'tiles.setCurrentTilemap(tilemap` alias `)';
 const main=`let hero=sprites.create(img\`5\`,SpriteKind.Player);tiles.setCurrentTilemap(${map(2,'ThirtyTwo')});let before=tiles.getTileLocation(0,0).x;${code};let after=tiles.getTileLocation(0,0).x;let wall=tiles.tileAtLocationIsWall(tiles.getTileLocation(0,0));let count=${kind==='missing'?'0':'tiles.getTilesByType(img`5`).length'};count+=0;let done=1;done+=0;`;
 return {'main.ts':main,'second.g.ts':factory(`case "alias":return ${map(7)};`),'first.g.ts':factory(`case "alias":case "chosen":return ${map(5)};`),'pxt.json':JSON.stringify({name:'owned-tile-factories',dependencies:{device:'*'},files:kind==='reverse'?['second.g.ts','first.g.ts','main.ts']:['first.g.ts','second.g.ts','main.ts']})};
};
for(const kind of ['missing','alias','reverse'])test('original/native/Code/SB3/export/reimport factory '+kind,async()=>{
 const files=makeFiles(kind),original=await runPxtArcade(files);assert.equal(original.before,16);assert.equal(original.after,kind==='missing'?16:4);assert.equal(original.wall,kind!=='missing');assert.equal(original.count,kind==='alias'?1:0);
 const imported=arcadeToPseudocode(files);assert.deepEqual(imported.unsupported,[]);const runs=[];
 const check=run=>{assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);for(const key of ['before','after','wall','count','done'])assert.equal(values(run)[key],original[key],key);const map=run.vm.runtime.bwArcadeDeviceState.tilemap;if(kind==='missing')assert.equal(map,undefined);else {assert.equal(map.tileSize,8);assert.deepEqual([...map.walls],[1]);assert.deepEqual([...map.images[0].pixels],[kind==='reverse'?7:5]);}};
 try{const native=await runProgram(imported.code,{frames:40,uploads:imported.costumes,storage:true});runs.push(native);check(native);const code=await runProgram(native.creator.decompile(),{frames:40,uploads:imported.costumes,storage:true});runs.push(code);check(code);
 const bytes=Buffer.from(await(await native.vm.saveProjectSb3()).arrayBuffer());await native.vm.loadProject(bytes);native.vm.greenFlag();await stepFrames(native.vm,40);check(native);const fresh=await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0,storage:true});runs.push(fresh);fresh.vm.stopAll();await fresh.vm.loadProject(bytes);fresh.vm.greenFlag();await stepFrames(fresh.vm,40);check(fresh);
 const exported=projectToArcade(native.creator.project,{costumeSvg:(target,costume)=>native.creator.assets.get(costume.assetId)?.data});assert.deepEqual(exported.unsupported,[]);const oracle=await runPxtArcade(exported.files);for(const key of ['before','after','wall','count'])assert.equal(oracle[key]??oracle['Game_'+key],original[key],key+' exported');const again=arcadeToPseudocode(exported.files);assert.deepEqual(again.unsupported,[]);const reimported=await runProgram(again.code,{frames:40,uploads:again.costumes,storage:true});runs.push(reimported);check(reimported);
 }finally{for(const run of runs)run.vm.quit();clearStrayTimers();}
});
