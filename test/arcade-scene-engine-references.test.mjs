// Ported unchanged from the parked Codex WIP (task F3 of docs/OPEN-TASKS-2026-09-29.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const values=require('../overlay/scratch-vm/src/util/bw-values.js');

test('scene and engine references retain identity in arrays and JSON without crossing kinds or runtimes',()=>{
    const runtime=new EventEmitter(),other=new EventEmitter();
    const scene=values.reference(runtime,'scene','same-id');
    const engine=values.reference(runtime,'physics-engine','same-id');
    const array=values.arrayReference(runtime,[scene,engine,scene]);
    assert.strictEqual(values.arrayValue(runtime,array)[2],scene);
    assert.strictEqual(values.decode(JSON.parse(JSON.stringify(scene))),scene);
    assert.strictEqual(values.decode(JSON.parse(JSON.stringify(engine))),engine);
    assert.equal(values.equal(scene,values.reference(runtime,'scene','same-id')),true);
    assert.equal(values.equal(scene,engine),false);
    assert.equal(values.referenceId(runtime,scene,'physics-engine'),null);
    assert.equal(values.referenceId(other,engine,'physics-engine'),null);
    assert.equal(values.indexOf(values.arrayValue(runtime,array),values.decode(JSON.parse(JSON.stringify(engine)))),1);
});

test('project restart invalidates Scene/Engine and array references even when new heap IDs are reused',()=>{
    const runtime=new EventEmitter();
    const scene=values.reference(runtime,'scene','scene:1');
    const engine=values.reference(runtime,'physics-engine','engine:1');
    const array=values.arrayReference(runtime,[scene,engine]);
    runtime.emit('PROJECT_START');
    assert.equal(values.referenceId(runtime,scene,'scene'),null);
    assert.equal(values.referenceId(runtime,engine,'physics-engine'),null);
    assert.equal(values.arrayValue(runtime,array),undefined);
    const nextScene=values.reference(runtime,'scene','scene:1');
    const nextEngine=values.reference(runtime,'physics-engine','engine:1');
    assert.equal(values.equal(scene,nextScene),false);
    assert.equal(values.equal(engine,nextEngine),false);
    assert.equal(values.referenceId(runtime,nextEngine,'physics-engine'),'engine:1');
});
