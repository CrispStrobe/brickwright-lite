// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
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
export async function writeCrossRatioRecord(record,output=process.stdout){
 const emit=item=>writeLine(output,'CROSS_RATIO '+JSON.stringify(item)+'\n');
 const {track,...header}=record;
 await emit({type:'header',record:header});
 for(const frame of track)await emit({type:'frame',frame});
 await emit({type:'end',record:{finishedAt:record.finishedAt}});
}
