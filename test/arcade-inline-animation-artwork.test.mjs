import test from 'node:test';import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {lowerPxtStagedValues} from '../overlay/scratch-gui/src/lib/bw-makecode/lower-pxt-staged-values.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const walk=(node,visit)=>{if(!node||typeof node!=='object')return;visit(node);for(const v of Object.values(node))if(Array.isArray(v))v.forEach(x=>walk(x,visit));else walk(v,visit);};
test('image grouping metadata is scalar-only and preserves original array push staging',()=>{
 const input=parseMakeCodeTs('let frames=[img`2`,img`3`]'),snapshot=structuredClone(input),out=lowerPxtStagedValues(input),pushes=[];
 walk(out,n=>{if(n.type==='Call'&&n.callee.name==='push')pushes.push(n);});
 assert.deepEqual(input,snapshot);assert.equal(pushes.length,2);assert.equal(pushes[0].args[0].bwImageArrayGroup,pushes[1].args[0].bwImageArrayGroup);
 assert.deepEqual(pushes.map(p=>p.args[0].bwImageArrayIndex),[0,1]);
 for(const p of pushes)for(const[k,v]of Object.entries(p.args[0]))if(k.startsWith('bwImageArray'))assert.ok(['string','number'].includes(typeof v));
 const ordinary=lowerPxtStagedValues(parseMakeCodeTs('let mixed=[img`2`,effect()]'));let groups=0,calls=[];
 walk(ordinary,n=>{if(n.bwImageArrayGroup)groups++;if(n.type==='Call')calls.push(n.callee.name);});assert.equal(groups,0);assert.deepEqual(calls,['push','push','effect']);
});
const source='let hero=sprites.create(img`1`,SpriteKind.Player)\nlet frames=[img`2 3`,img`4 5`]\nlet alias=frames\nlet one=frames[0]\nlet two=frames[1]\nlet other=[img`2 3`,img`4 5`]\nlet separate=one!==other[0]\nalias[0].setPixel(0,0,7)\nhero.setImage(frames[0])\nlet first=one.getPixel(0,0)\nlet second=two.getPixel(0,0)\nlet count=frames.length\nlet aliasSame=alias===frames\nlet imageDistinct=one!==two\nlet prior=other[0].getPixel(0,0)\nfirst+=0\nsecond+=0\ncount+=0\nprior+=0\naliasSame=!!aliasSame\nseparate=!!separate\nimageDistinct=!!imageDistinct';
const expected={first:7,second:4,count:2,aliasSame:true,separate:true,imageDistinct:true,prior:2};
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
const check=run=>{assert.deepEqual(run.errors,[]);for(const[k,v]of Object.entries(expected))assert.equal(values(run)[k],v,k);const sprite=Object.values(run.vm.runtime.bwArcadeDeviceState.sprites)[0];assert.deepEqual([...sprite.image.pixels],[7,3]);};
test('readable grouped artwork retains pixel aliases and distinct image sites through Code/SB3/original export',async()=>{
 const runs=[];try{
  const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
  assert.deepEqual(imported.costumes.filter(c=>c.sprite==='frames').map(c=>[c.name,c.mode]),[['frames-1','replace'],['frames-2','add']]);
  assert.deepEqual(imported.costumes.filter(c=>c.sprite==='other').map(c=>c.name),['other-1','other-2']);
  const run=await runProgram(imported.code,{frames:3,uploads:imported.costumes,storage:true});runs.push(run);check(run);
  const code=await runProgram(run.creator.decompile(),{frames:3,uploads:imported.costumes,storage:true});runs.push(code);check(code);
  const bytes=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());await run.vm.loadProject(bytes);run.vm.greenFlag();await stepFrames(run.vm,3);check(run);
  const fresh=await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0,storage:true});runs.push(fresh);fresh.vm.stopAll();await fresh.vm.loadProject(bytes);fresh.vm.greenFlag();await stepFrames(fresh.vm,3);check(fresh);
  const exported=projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});assert.deepEqual(exported.unsupported,[]);
  const original=await runPxtArcade(exported.files,{fakeClock:true});
  const originalValues=Object.fromEntries(Object.entries(original).map(([k,v])=>[k.replace(/^(?:Game_)+/,''),v]));
  for(const[k,v]of Object.entries(expected))assert.equal(originalValues[k],v,'original export '+k+' globals '+JSON.stringify(originalValues));
  const again=arcadeToPseudocode(exported.files);assert.deepEqual(again.unsupported,[]);const re=await runProgram(again.code,{frames:3,uploads:again.costumes,storage:true});runs.push(re);check(re);
 }finally{for(const r of runs)r.vm.quit();clearStrayTimers();}
});
test('named and namespace frame variables keep readable carriers without conflating alias sites',()=>{
 const source='namespace Art {export const walk=[img`2`,img`3`]}\nlet hero=sprites.create(img`1`,SpriteKind.Player)\nlet frames=[img`4`,img`5`]\nlet alias=frames\nanimation.runImageAnimation(hero,alias,100,true)\nlet unused=Art.walk.length\nunused+=0';
 const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
 assert.deepEqual(imported.costumes.filter(c=>c.sprite==='frames').map(c=>c.name),['frames-1','frames-2']);
 assert.deepEqual(imported.costumes.filter(c=>c.sprite==='walk').map(c=>c.name),['walk-1','walk-2']);
 assert.equal(imported.costumes.some(c=>c.sprite==='alias'||c.sprite==='heroAnimation'),false,'original declared frame name takes precedence over use-site aliases');
});
