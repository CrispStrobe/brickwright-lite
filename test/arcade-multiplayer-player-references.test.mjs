import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
import {loadExtensionClass,stubRuntime} from './helpers/bw-extensions.mjs';
const require=createRequire(import.meta.url),BW=require('../overlay/scratch-vm/src/util/bw-values.js');
const Arcade=loadExtensionClass('arcade');
test('Player references are isolated by runtime, reference kind and project generation',()=>{
 const runtime=new EventEmitter(),other=new EventEmitter();
 const p=BW.reference(runtime,'player','same'),scene=BW.reference(runtime,'scene','same');
 assert.equal(BW.equal(p,scene),false);assert.equal(BW.referenceId(other,p,'player'),null);
 assert.strictEqual(BW.decode(JSON.parse(JSON.stringify(p))),p);
 const array=BW.arrayReference(runtime,[p,p]);assert.strictEqual(BW.arrayValue(runtime,array)[0],p);
 runtime.emit('PROJECT_START');assert.equal(BW.referenceId(runtime,p,'player'),null);
 assert.equal(BW.equal(p,BW.reference(runtime,'player','same')),false);
});
test('runtime player selectors, missing values and member reads keep PXT boundaries',()=>{
 const runtime=Object.assign(new EventEmitter(),stubRuntime());delete runtime.on;delete runtime.emit;
 const ext=new Arcade(runtime),other=new Arcade(stubRuntime());
 const p=ext.playerLookup({MODE:'number',VALUE:2});
 assert.equal(ext.playerProperty({READ:'safe',PLAYER:p,PROPERTY:1}),1);
 assert.equal(other.playerProperty({READ:'safe',PLAYER:p,PROPERTY:2}),0);
 assert.equal(ext.playerProperty({READ:'safe',PLAYER:BW.encode(undefined),PROPERTY:2}),0);
 assert.throws(()=>ext.playerProperty({READ:'member',PLAYER:BW.encode(undefined),PROPERTY:2}),TypeError);
 assert.equal(BW.decode(ext.playerLookup({MODE:'index',VALUE:1.5})),undefined);
 runtime.emit('PROJECT_START');assert.equal(ext.playerProperty({READ:'safe',PLAYER:p,PROPERTY:2}),0);
 const fresh=ext.playerLookup({MODE:'number',VALUE:2});assert.equal(ext.playerProperty({READ:'safe',PLAYER:fresh,PROPERTY:2}),2);
});
