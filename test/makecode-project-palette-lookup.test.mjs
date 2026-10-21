import test from 'node:test';
import assert from 'node:assert/strict';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {withoutAssetLibraries} from '../overlay/scratch-gui/src/lib/bw-asset-library.js';
import {ARCADE_PALETTE} from '../overlay/scratch-gui/src/lib/bw-makecode/pixel-image.js';
import {projectToArcade,projectJsonToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {createProjectedCostumePaletteLookup} from '../scripts/lib/project-palette-lookup.mjs';
const fixture=()=>{
 const c=new Creator();c.parse('DEVICE ARCADE\nGLOBAL value\nSPRITE Artwork:\nSPRITE First:\nSPRITE Second:\nSTAGE:\nWHEN arcade source starts:\n  set value to 1\n');assert.deepEqual(c.warnings,[]);
 const [stage,library,first,second]=c.project.targets;library.visible=false;library.sounds=[];
 first.costumes[0].assetId=second.costumes[0].assetId='same-asset';second.costumes.push({...second.costumes[0],name:'alternate'});second.currentCostume=1;
 const projected=withoutAssetLibraries(c.project,[{targetIndex:1,role:{version:1,kind:'arcade-animation'}}]);
 const palette=shift=>[ARCADE_PALETTE[0],...ARCADE_PALETTE.slice(1+shift),...ARCADE_PALETTE.slice(1,1+shift)];
 const palettes=new Map([['0:0',palette(0)],['2:0',palette(1)],['3:0',palette(2)],['3:1',palette(3)]]);
 return {source:c.project,projected,palettes,stage,first,second};
};
test('actual CLI palette lookup preserves original artwork indices after library removal and fresh snapshot identities',()=>{
 const {source,projected,palettes,first,second}=fixture(),lookup=createProjectedCostumePaletteLookup(source,projected,palettes),seen=[];
 assert.deepEqual(projected.targets.map(t=>t.name),['Stage','First','Second']);
 assert.equal(lookup(first,first.costumes[0]),palettes.get('2:0'));assert.equal(lookup(second,second.costumes[1]),palettes.get('3:1'));
 const options={costumePalette(target,costume,position){const actual=lookup(target,costume,position);seen.push({target:target.name,costume:costume.name,actual,position});return actual;}};
 const before=JSON.stringify(projected),result=projectJsonToArcade(before,options);assert.deepEqual(result.unsupported,[]);
 assert.ok(seen.some(row=>row.target==='First'&&row.position.targetIndex===1&&row.actual===palettes.get('2:0')));
 assert.ok(seen.some(row=>row.target==='Second'&&row.position.targetIndex===2&&row.position.costumeIndex===1&&row.actual===palettes.get('3:1')));
 assert.equal(JSON.stringify(projected),before);assert.equal(source.targets.length,4);
 const oldSeen=[];projectToArcade(projected,{costumePalette(target,costume){const actual=lookup(target,costume);oldSeen.push(actual);return actual;}});
 assert.ok(oldSeen.includes(palettes.get('2:0')));assert.ok(oldSeen.includes(palettes.get('3:1')));
});
test('palette projection rejects invented or duplicate source target identities rather than guessing by names or assets',()=>{
 const {source,projected,palettes}=fixture();
 assert.throws(()=>createProjectedCostumePaletteLookup(source,{...projected,targets:[{...projected.targets[1]}]},palettes),/target identity differs/);
 assert.throws(()=>createProjectedCostumePaletteLookup(source,{...projected,targets:[projected.targets[1],projected.targets[1]]},palettes),/target identity differs/);
 const lookup=createProjectedCostumePaletteLookup(source,projected,palettes);
 assert.equal(lookup(projected.targets[1],projected.targets[1].costumes[0],{targetIndex:99,costumeIndex:0}),null);
 assert.equal(lookup(projected.targets[2],projected.targets[2].costumes[0],{targetIndex:2,costumeIndex:99}),null);
});
