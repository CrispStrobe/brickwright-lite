import test from 'node:test';
import assert from 'node:assert/strict';
import {kindPrograms} from './fixtures/arcade-sprite-kind-programs.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {prepareArcadeDependencyInputs} from '../overlay/scratch-gui/src/lib/bw-makecode/dependency-project.js';
import {TEXT_SPRITE_SOURCE_TEXT} from '../overlay/scratch-gui/src/lib/bw-makecode/text-source-admission.generated.js';
import {SB3Creator,clearStrayTimers} from './helpers/bw-vm.mjs';
for(const [name,source] of Object.entries(kindPrograms))test('SpriteKind source is editable through production Code/blocks compiler: '+name,async()=>{
 let input=source;
 if(name==='text')input=prepareArcadeDependencyInputs({'main.ts':source,'pxt.json':JSON.stringify({dependencies:{device:'*','arcade-text':'github:microsoft/arcade-text#v1.3.0'},files:['main.ts']})},{packages:{'arcade-text':{files:{'text.ts':TEXT_SPRITE_SOURCE_TEXT}}},sourceOrder:[{id:'arcade-text',file:'text.ts'}],jres:{}}).files;
 const imported=arcadeToPseudocode(input);assert.deepEqual(imported.unsupported,[]);
 try{const creator=new SB3Creator();await creator.parse(imported.code);assert.deepEqual(creator.warnings,[]);const blocks=creator.project.targets.flatMap(t=>Object.values(t.blocks));assert.ok(blocks.some(b=>b.opcode==='arcade_spriteKindValue') || name==='numeric');
 const recreated=new SB3Creator();await recreated.parse(creator.decompile());assert.deepEqual(recreated.warnings,[]);assert.deepEqual(recreated.project.targets.flatMap(t=>Object.values(t.blocks)).map(b=>b.opcode),blocks.map(b=>b.opcode));
 }finally{clearStrayTimers();}
});
