import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {INTEGRATED} from './helpers/bw-integrated.mjs';
import {patchPrimitiveOwner} from '../scripts/lib/primitive-owner-hooks.mjs';
const engine=()=>readFileSync(path.join(INTEGRATED,'node_modules/scratch-vm/src/engine/execute.js'),'utf8');
test('actual owned engine uses the common role table and overlay reapplication is idempotent',()=>{
 const source=engine();assert.ok(source.includes('bwPrimitiveOwner.handles(opCached.opcode)'));
 assert.equal(patchPrimitiveOwner(source),source);
 const older=source.replace('bwPrimitiveOwner.handles(opCached.opcode)',"['arcade_createCallable','arcade_objectField','arcade_returnValue','arcade_functionArgument','arcade_setLocal','arcade_setCaptured','arcade_setObjectField','arcade_inspectValue'].includes(opCached.opcode)");
 assert.equal(patchPrimitiveOwner(older),source);
});
test('unknown or ambiguous owned engine markers refuse without dropping caller ownership',()=>{
 const source=engine();assert.throws(()=>patchPrimitiveOwner(source.replace('bwPrimitiveOwner.handles(opCached.opcode)','opCached.opcode.startsWith("arrays_")')),/unknown primitive ownership marker/);
 assert.throws(()=>patchPrimitiveOwner(source+"\nconst bwPrimitiveOwner = require('../util/bw-primitive-owner');"),/ambiguous/);
 assert.throws(()=>patchPrimitiveOwner('const BlockUtility = require("wrong");'),/anchor missing/);
});
