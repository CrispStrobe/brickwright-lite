import test from 'node:test';
import assert from 'node:assert/strict';
import {createArcadeRuntimeMock, startArcadeProject} from './helpers/arcade-runtime-mock.mjs';

test('native Runtime mock records requested hat, fields and target while returning no authored threads', () => {
    const runtime=createArcadeRuntimeMock(),fields={TOKEN:'registered'},target={id:'owned'};
    assert.deepEqual(runtime.startHats('arcade_whenRegisteredOverlap',fields,target),[]);
    assert.deepEqual(runtime.hatRequests,[['arcade_whenRegisteredOverlap',fields,target]]);
    assert.strictEqual(runtime.hatRequests[0][1],fields);assert.strictEqual(runtime.hatRequests[0][2],target);
});
test('native startup observation refuses missing, duplicate and wrong startup dispatch', () => {
    for(const opcodes of [[],['arcade_whenSourceStarts','arcade_whenSourceStarts'],['event_whenflagclicked']]){
        const runtime=createArcadeRuntimeMock();runtime.on('PROJECT_START',()=>{for(const opcode of opcodes)runtime.startHats(opcode);});
        assert.throws(()=>startArcadeProject(runtime),/source startup hat exactly once/);
    }
});
test('actual startup observation keeps earlier hat calls and verifies each new restart request', () => {
    const runtime=createArcadeRuntimeMock();let restarted=0;
    runtime.startHats('arcade_whenRegisteredCreated');
    runtime.on('PROJECT_START',()=>{restarted++;runtime.startHats('arcade_whenSourceStarts');});
    startArcadeProject(runtime);startArcadeProject(runtime);
    assert.equal(restarted,2);assert.equal(runtime.hatRequests.length,3);
});

import {loadExtensionClass} from './helpers/bw-extensions.mjs';
test('native-only mock explicitly owns an empty compiled-target collection and records real startup dispatch',()=>{
 const runtime=createArcadeRuntimeMock();assert.deepEqual(runtime.targets,[]);new(loadExtensionClass('arcade'))(runtime);
 startArcadeProject(runtime);assert.deepEqual(runtime.hatRequests,[['arcade_whenSourceStarts']]);
});
test('adding empty-target mock contract does not bypass validation of a malformed nonempty source prelude',()=>{
 const runtime=createArcadeRuntimeMock();new(loadExtensionClass('arcade'))(runtime);
 runtime.targets.push({id:'malformed',isOriginal:true,blocks:{_blocks:{late:{id:'late',opcode:'arcade_declareSourceScalar'}},getBlock(id){return this._blocks[id];}}});
 assert.throws(()=>runtime.emit('PROJECT_START'),/declarations must precede source initializers/);
 assert.deepEqual(runtime.hatRequests,[],'no startup dispatch follows a refused declaration');
});
