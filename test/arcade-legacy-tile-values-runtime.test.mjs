import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
import {loadExtensionClass,VM_SRC} from './helpers/bw-extensions.mjs';
const require=createRequire(import.meta.url),values=require(`${VM_SRC}/util/bw-values.js`);
const Arcade=loadExtensionClass('arcade');
test('legacy Tile values reject modern locations, other runtimes and stale project references',()=>{
 const runtime=new EventEmitter(),ext=new Arcade(runtime),other=new Arcade(new EventEmitter());
 const image=ext._imageHandle({width:1,height:1,pixels:Uint8Array.of(7)});ext.setLegacyTilemap({IMAGE:image,SCALE:3});
 const tile=ext.legacyTileLocation({COLUMN:0,ROW:0}),modern=ext.tileLocation({COLUMN:0,ROW:0});
 assert.equal(ext.legacyTileProperty({TILE:tile,PROPERTY:'tileSet'}),7);
 ext.setLegacyTilemap({IMAGE:null,SCALE:3});assert.throws(()=>ext.legacyTileProperty({TILE:tile,PROPERTY:'tileSet'}),TypeError);
 assert.equal(ext._legacyTile(modern),null);assert.equal(ext._tileLocation(tile),null);assert.equal(other._legacyTile(tile),null);
 const copied=values.decode(JSON.parse(JSON.stringify(tile)));assert.strictEqual(copied,tile);
 const array=values.arrayReference(runtime,[tile]);assert.strictEqual(values.arrayValue(runtime,array)[0],tile);
 runtime.emit('PROJECT_START');assert.equal(ext._legacyTile(tile),null);assert.equal(values.arrayValue(runtime,array),undefined);
 const next=ext.legacyTileLocation({COLUMN:0,ROW:0});assert.equal(values.equal(next,tile),false);
});
test('random placement guards do not create a map and property menu uses literal fields',()=>{
 const ext=new Arcade(new EventEmitter());ext.placeOnRandomLegacyTile({ID:null,INDEX:1});assert.equal(ext._state().tilemap,undefined);
 const info=ext.getInfo(),property=info.blocks.find(b=>b.opcode==='legacyTileProperty');
 assert.equal(property.arguments.PROPERTY.menu,'legacyTileProperties');assert.equal(info.menus.legacyTileProperties.acceptReporters,false);
 assert.deepEqual(info.menus.legacyTileProperties.items,['x','y','tileSet']);
});
