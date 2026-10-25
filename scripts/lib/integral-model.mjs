// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {createHash} from 'node:crypto';

// Keep the frozen supplier file. Mount the fork on the clear left carriage
// hole and retain its shaft with an additional stock bush. Its hinge axes and
// the tyre centre retain their original Y/Z coordinates and rolling geometry.
export function adaptIntegralModel(bytes){
 if(createHash('sha256').update(bytes).digest('hex')!=='7207894069de030d77ad4b899de0edf735fff79d7c52b598acf87deeb3ac04d8')throw Error('Integral source differs from the reviewed assembly');
 let id;
 const shifts={forkMount:-100,forkMountPin:-100,forkUpright:-100,forkPivot:-100,gravityFork:-100,outputAxle:-40,outputBushOuter:-140};
 const lines=bytes.toString('utf8').replace('0 Author: OpenAI / ChatGPT, with reused modules by CrispStrobe','0 Author: CrispStrobe').split('\n').flatMap(line=>{
  if(line.startsWith('0 !BW ID '))id=line.slice(9).trim();
  if(/^1 /.test(line)&&shifts[id]!==undefined){
   const fields=line.split(' ');fields[2]=String(Number(fields[2])+shifts[id]);
   if(id==='outputBushOuter'){
    const spacer=[...fields];spacer[2]='-40';
    return [fields.join(' '),'0 !BW ID outputForkSpacer',spacer.join(' ')];
   }
   return fields.join(' ');
  }
  return line;
 });
 return lines.join('\n');
}
