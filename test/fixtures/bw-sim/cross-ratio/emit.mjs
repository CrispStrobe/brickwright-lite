// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
// Test helpers capture console methods during VM imports. Await actual stream
// acknowledgments, not just the buffer threshold, and never end shared stdout.
const writeLine=(output,line)=>new Promise((resolve,reject)=>{
 let settled=false;
 const done=error=>{
  if(settled)return;settled=true;output.off('close',closed);
  // A Writable may invoke its error callback before emitting error next tick.
  // Keep the once-listener on failure to consume that event safely.
  if(!error)output.off('error',failed);
  if(error)reject(error);else resolve();
 };
 const failed=error=>done(error),closed=()=>done(new Error('record receiver closed before write acknowledgment'));
 output.once('error',failed);output.once('close',closed);
 if(output.destroyed||output.writableEnded){done(new Error('record receiver already closed'));return;}
 try{output.write(line,done);}catch(error){done(error);}
});
const wire=item=>{
 const bytes=Buffer.from(JSON.stringify(item));assert.ok(bytes.length<=2*1024*1024,'bounded record item');
 return 'CROSS_RATIO_WIRE_V1 '+bytes.length+' '+createHash('sha256').update(bytes).digest('hex')+' '+bytes.toString('base64');
};
function* items(record){
 const {track,...header}=record;yield {type:'header',record:header};
 for(const frame of track)yield {type:'frame',frame};
 yield {type:'end',record:{finishedAt:record.finishedAt}};
}
export async function writeCrossRatioRecord(record,output=process.stdout){
 for(const item of items(record))await writeLine(output,wire(item)+'\n');
}
// Node TAP escapes JSON stdout and can split raw data events. Diagnostics are
// structured test messages; Base64 contains none of TAP's escape characters.
// This acknowledges framework enqueue, NOT artifact durability. The independent
// retained-artifact reader must still prove the complete four-case census.
export function diagnoseCrossRatioRecord(record,context){
 for(const item of items(record))context.diagnostic(wire(item));
}
