// SPDX-License-Identifier: BSD-3-Clause
import test from 'node:test';
import assert from 'node:assert/strict';
import {nonFinitePaths, summarizeMotor, functionalFailures} from '../scripts/lib/robot-lab-functional.mjs';
test('finite observations reject NaN and infinity without rejecting zero', () => {
    assert.deepEqual(nonFinitePaths({a: [0, NaN, Infinity], b: -Infinity}), ['/a/1', '/a/2', '/b']);
});
test('motor observations distinguish uncommanded, stalled and actual movement', () => {
    assert.equal(summarizeMotor([{position:0,mode:'coast'},{position:0,mode:'hold'}]).status,'UNCOMMANDED_STATIONARY');
    assert.equal(summarizeMotor([{position:0,mode:'speed',nonzeroDrive:true},{position:0,mode:'speed',nonzeroDrive:true}]).status,'COMMANDED_STATIONARY');
    assert.equal(summarizeMotor([{position:0,mode:'speed',nonzeroDrive:true},{position:1,mode:'speed',nonzeroDrive:true}]).status,'MOVED');
    assert.equal(summarizeMotor([{position:NaN}]).status,'NONFINITE_OR_NO_OBSERVATIONS');
    assert.equal(summarizeMotor([{position:0,mode:'hold'},{position:2,mode:'hold'}]).status,'UNCOMMANDED_MOVED');
    assert.equal(summarizeMotor([{position:0,mode:'speed',nonzeroDrive:false},{position:0,mode:'speed',nonzeroDrive:false}]).status,'UNCOMMANDED_STATIONARY');
});
test('each unresolved, nonfinite, VM, session and stationary motor observation fails independently', () => {
    const good={partFailures:[],compileErrors:[],vmErrors:[],nonfinite:[],sessionFailures:[],missingOpcodes:[],motors:{A:{moved:true,commanded:true}},steps:1};
    assert.deepEqual(functionalFailures(good),[]);
    for(const key of ['partFailures','compileErrors','vmErrors','nonfinite','sessionFailures','missingOpcodes']) assert.equal(functionalFailures({...good,[key]:['bad']}).length,1,key);
    assert.equal(functionalFailures({...good,motors:{A:{moved:false,status:'COMMANDED_STATIONARY'}}}).length,1);
    assert.equal(functionalFailures({...good,steps:0}).length,1);
});
