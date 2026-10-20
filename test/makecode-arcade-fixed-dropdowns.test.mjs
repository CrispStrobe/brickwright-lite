import test from 'node:test';
import assert from 'node:assert/strict';
import SB3Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
const cases=[
 ['arcade_mathBinary','OP','mathOperations','max','set [r] to (arcade math max first 1 second 4)',/Math\.max\(/],
 ['arcade_spriteDataSet','TYPE','spriteDataTypes','String','arcade set sprite (undefined value) data ("key") type String to ("value")',/sprites\.setDataString\(/],
 ['arcade_spriteDataRead','TYPE','spriteDataReadTypes','String','set [r] to (arcade sprite (undefined value) data ("key") type String)',/sprites\.readDataString\(/],
 ['arcade_textSpriteProperty','PROPERTY','textSpriteProperties','text','set [r] to (arcade text sprite (undefined value) property text)',/\.text/],
 ['arcade_textSpriteSetProperty','PROPERTY','textSpriteProperties','text','arcade set text sprite (undefined value) property text to ("value")',/\.text = "value"/]
];
for(const [opcode,slot,menu,choice,command,expected] of cases)for(const shape of ['native','inline','shadow','computed'])test(`${opcode} ${shape} preserves fixed dropdown export and Code`,()=>{
 const c=new SB3Creator();c.parse(`DEVICE ARCADE\nSPRITE Game:\nWHEN flag clicked:\n  ${command}`);assert.deepEqual(c.warnings,[]);
 const t=c.project.targets.find(t=>t.name==='Game'),[id,b]=Object.entries(t.blocks).find(([,b])=>b.opcode===opcode);assert.deepEqual(b.fields[slot],[choice,null]);
 if(shape!=='native'){delete b.fields[slot];if(shape==='inline')b.inputs[slot]=[1,[10,choice]];else{b.inputs[slot]=[shape==='computed'?3:1,shape==='computed'?'computed':'menu','menu'].slice(0,shape==='computed'?3:2);t.blocks.menu={opcode:`arcade_menu_${menu}`,fields:{[menu]:[choice,null]},shadow:true,parent:id,inputs:{}};if(shape==='computed')t.blocks.computed={opcode:'data_variable',fields:{VARIABLE:['operation','id']},inputs:{}};}}
 const exported=projectToArcade(c.project);
 if(shape==='computed'){assert.ok(exported.unsupported.length);assert.doesNotMatch(exported.ts,expected);return;}
 assert.deepEqual(exported.unsupported,[]);assert.match(exported.ts,expected);
 const fresh=new SB3Creator();fresh.parse(c.decompile());assert.deepEqual(fresh.warnings,[]);const again=fresh.project.targets.flatMap(t=>Object.values(t.blocks)).find(b=>b.opcode===opcode);assert.deepEqual(again.fields[slot],[choice,null]);assert.equal(again.inputs[slot],undefined);
});
