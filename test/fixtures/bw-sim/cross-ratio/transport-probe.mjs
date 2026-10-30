// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Explicitly invoked I/O fixture, not an engine or automatically selected suite.
import test from 'node:test';
import {analyticRecord} from './analytic.mjs';
import {diagnoseCrossRatioRecord} from './emit.mjs';
console.log=()=>{};
test('actual nested TAP transport',async parent=>{
 await parent.test('analytic evidence through diagnostics',context=>{
 for(const coldMs of [0,1000])for(const control of [false,true]){
  const record=analyticRecord(control,coldMs);record.transportPadding='x'.repeat(256*1024);
  diagnoseCrossRatioRecord(record,context);
 }
 });
});
