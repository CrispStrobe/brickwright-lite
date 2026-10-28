// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {once} from 'node:events';
// Test helpers capture console methods during VM imports. The evidence stream
// must bypass that buffer, and must not outrun the actual receiving pipe.
export async function writeCrossRatioRecord(record,output=process.stdout){
 const emit=async item=>{if(!output.write('CROSS_RATIO '+JSON.stringify(item)+'\n'))await once(output,'drain');};
 const {track,...header}=record;
 await emit({type:'header',record:header});
 for(const frame of track)await emit({type:'frame',frame});
 await emit({type:'end',record:{finishedAt:record.finishedAt}});
}
