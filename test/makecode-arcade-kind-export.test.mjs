import test from 'node:test';
import assert from 'node:assert/strict';
import SB3Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const project=code=>{const creator=new SB3Creator();creator.parse('DEVICE ARCADE\nSPRITE Game:\nWHEN flag clicked:\n  hide\n'+code);assert.deepEqual(creator.warnings,[]);return creator.project;};
const exported=code=>projectToArcade(project(code));

test('export executes kind allocations and numeric alias bindings in authored order without implicit allocations',async()=>{
 const result=exported(`  set first to (arcade create sprite kind)
  arcade bind sprite kind name "Custom" to (first)
  set lookup to (arcade sprite kind value "Custom")
  set second to (arcade create sprite kind)
  arcade bind sprite kind name "Custom" to (-2.5)
  set fraction to (arcade sprite kind value "Custom")
  set player to (arcade sprite kind value "Player")
  set projectile to (arcade sprite kind value "Projectile")
  set food to (arcade sprite kind value "Food")
  set enemy to (arcade sprite kind value "Enemy")
  set done to 1
`);
 assert.deepEqual(result.unsupported,[]);assert.match(result.ts,/export let Custom: number/);assert.doesNotMatch(result.ts,/export const Custom = SpriteKind.create/);
 const original=await runPxtArcade(result.files);
 for(const [name,value] of Object.entries({first:1003,lookup:1003,second:1004,fraction:-2.5,player:1000,projectile:1,food:1001,enemy:1002,done:1}))assert.equal(original[name]??original['Game_'+name],value,name);
});

test('unknown names, unsafe bindings and late or conditional library initialization retain diagnostics',()=>{
 for(const code of [
  '  set unknown to (arcade sprite kind value "Unknown")',
  '  arcade bind sprite kind name "Player" to (arcade create sprite kind)',
  '  arcade bind sprite kind name "not an identifier" to 1003',
  '  arcade initialize sprite kind library "unknown" version "v1.3.0"',
  '  arcade initialize sprite kind library "textsprite" version "unknown"',
  '  set earlier to (arcade create sprite kind)\n  arcade initialize sprite kind library "textsprite" version "v1.3.0"',
  '  IF 1 = 1 THEN:\n    arcade initialize sprite kind library "textsprite" version "v1.3.0"'
 ])assert.ok(exported(code).unsupported.length,code);
});
