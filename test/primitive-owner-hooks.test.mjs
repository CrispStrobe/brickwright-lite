import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
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

test('the standard overlay CLI remains parseable by the actual Node entrypoint',()=>{
 assert.doesNotThrow(()=>execFileSync(process.execPath,['--check',fileURLToPath(new URL('../scripts/apply-vm-overlay.mjs',import.meta.url))],{stdio:'pipe'}));
});

test('comment decoys, altered owner arguments and removed wrappers cannot satisfy migration',()=>{
 const source=engine(),call=`bwPrimitiveOwner.invoke(sequencer.runtime, thread, blockContainer, opCached, argValues, blockUtility,
                () => blockFunction(argValues, blockUtility))`;
 assert.ok(source.includes(call));
 const decoy=source.replace(call,'(/* bwPrimitiveOwner.invoke( */ blockFunction(argValues, blockUtility))');
 assert.throws(()=>patchPrimitiveOwner(decoy),/actual primitive ownership invocation wrapper differs/);
 assert.throws(()=>patchPrimitiveOwner(source.replace(call,call.replace('argValues, blockUtility,','{}, blockUtility,'))),/actual primitive ownership invocation wrapper differs/);
 const start=source.indexOf('const primitiveReportedValue = bwPrimitiveOwner.handles('),end=source.indexOf(';',start)+1;
 assert.ok(start>0&&end>start);
 assert.throws(()=>patchPrimitiveOwner(source.slice(0,start)+'/*'+source.slice(start,end)+'*/'+source.slice(end)),/actual primitive ownership declaration missing/);
});
