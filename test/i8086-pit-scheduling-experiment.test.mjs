import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPitSchedulingExperiment} from '../scripts/lib/i8086-pit-scheduling-experiment.mjs';
import {setup} from '../scripts/lib/i8086-execution-workload.mjs';
test('unsafe deferred PIT scheduling refuses old entry points by name', () => {
    assert.throws(()=>createPitSchedulingExperiment(),/removed.*observability/);
    assert.throws(()=>setup('peripherals','mixed',{pitSchedule:true}),/removed.*observability/);
});
